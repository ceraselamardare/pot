// Pay by link: the daily job that sends expired, unclaimed links back (server/ops/links.ts, a reconcile step) against
// a test schema and a fake chain: which links it picks (funded or approved-but-unfunded, past their date), the
// relayer-signed reclaim_link it sends (50 Tgas, no deposit), once per run cause, bounded per run; and the push
// mapping of the link events.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appUser, feedEvent, note, pot, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import { eventsToNotifications } from "../notify/notify"
import type { RelayDeps } from "../relay/pipeline"
import { DAO, HUB, USDC } from "../testing/delegates"
import { insertUser, NEAR, potView, seedChain, testConfig, TREASURY } from "../testing/env"
import { linkEnrichment } from "../features/paylink"
import { event, FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../testing/fakeChain"
import { expiredLinksOf, reclaimExpiredLinks } from "./links"
import { runReconcile } from "./reconcile"

let t: TestDb
let chain: FakeChain
let sub: FakeSubmitter
let deps: RelayDeps
const NOW = Date.now()

type L = { status: string; request_status: string; expires_at_ms: number }

function chainWith(reqs: { request_id: number; status: string; link_status?: string | null }[], links: Record<number, L>) {
  chain.view(HUB, "get_pot", (a) => (a.pot === DAO ? potView({ request_count: reqs.length + 5 }) : null))
  chain.view(HUB, "get_requests", () =>
    reqs.map((r) => ({ requester: "maya.potapp.testnet", amount: "30000000", category: "tickets", path: "instant", proposal_id: null, expires_at_ms: 0, ...r })),
  )
  chain.view(HUB, "get_link", (a) => links[Number(a.request_id)] ?? null)
  deps.hub = createHubReader(chain, HUB)
}

beforeAll(async () => {
  t = await createTestDb("paylinks")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  resetBalanceCacheForTests()
  chain = seedChain(new FakeChain())
  chain.account(TREASURY, { amount: NEAR })
  chain.view(USDC, "ft_balance_of", () => "0")
  sub = new FakeSubmitter((spec) => plainOutcome("x", spec.signerId, spec.receiverId))
  deps = { db: t.db, rpc: chain, hub: createHubReader(chain, HUB), submitter: sub, cfg: testConfig(), defer: () => undefined, sleep: async () => undefined }
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: "m", lastActivityAt: new Date() })
})

const past = NOW - 3_600_000
const future = NOW + 86_400_000
const REQS = [
  { request_id: 3, status: "approved", link_status: "funded" }, // expired → back
  { request_id: 4, status: "approved", link_status: "funded" }, // still valid
  { request_id: 5, status: "approved", link_status: "awaiting_funds" }, // the escrow payment bounced, expired → back
  { request_id: 6, status: "pending", link_status: "awaiting_funds" }, // still being decided: never
  { request_id: 7, status: "approved", link_status: "claimed" },
  { request_id: 8, status: "approved", link_status: null }, // a plain spend
]
const LINKS: Record<number, L> = {
  3: { status: "funded", request_status: "approved", expires_at_ms: past },
  4: { status: "funded", request_status: "approved", expires_at_ms: future },
  5: { status: "awaiting_funds", request_status: "approved", expires_at_ms: past - 10 },
  6: { status: "awaiting_funds", request_status: "pending", expires_at_ms: past },
  7: { status: "claimed", request_status: "approved", expires_at_ms: past },
}

describe("expiredLinksOf", () => {
  it("picks funded and approved-but-unfunded links past their date (reads get_link only for open ones)", async () => {
    chainWith(REQS, LINKS)
    const got = await expiredLinksOf(deps, DAO, NOW)
    expect(got.map((c) => c.requestId)).toEqual([5, 3])
    const linkReads = chain.calls.filter((c) => (c.params as { method_name?: string }).method_name === "get_link").length
    expect(linkReads).toBe(3) // 3, 4, 5: never one still being decided, a claimed one or a plain spend
  })
})

describe("reclaimExpiredLinks (cron step)", () => {
  it("sends one relayer-signed reclaim_link per expired link (50 Tgas, no deposit), once per run cause", async () => {
    chainWith(REQS, LINKS)
    const r = await reclaimExpiredLinks(deps, "cron:2026-11-01:run1", { now: NOW })
    expect(r).toEqual({ scanned: 1, candidates: 2, reclaimed: 2, failed: 0 })
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["reclaim_link", "reclaim_link"])
    const fc = (sub.submitted[0]!.spec.actions[0] as unknown as { functionCall: { args: Uint8Array; gas: bigint; deposit: bigint } }).functionCall
    expect(JSON.parse(Buffer.from(fc.args).toString())).toEqual({ pot: DAO, request_id: 5 })
    expect(fc.gas).toBe(50_000_000_000_000n)
    expect(fc.deposit).toBe(0n)
    expect(sub.submitted[0]!.spec.receiverId).toBe(HUB)
    const rows = await t.db.select().from(relayLog).where(eq(relayLog.op, "reclaim_link"))
    expect(rows.map((x) => x.status).sort()).toEqual(["executed", "executed"])
    // the same run again (a retry of the cron call): nothing sent twice
    const again = await reclaimExpiredLinks(deps, "cron:2026-11-01:run1", { now: NOW })
    expect(again.reclaimed).toBe(0)
    expect(sub.submitted).toHaveLength(2)
  })

  it("is bounded per run", async () => {
    chainWith(REQS, LINKS)
    const r = await reclaimExpiredLinks(deps, "cause", { now: NOW, max: 1 })
    expect(r).toMatchObject({ candidates: 2, reclaimed: 1 })
    expect(sub.submitted).toHaveLength(1)
  })

  it("records the hub's link_returned in the feed", async () => {
    chainWith(REQS, { 3: LINKS[3]! })
    sub.script = (spec) =>
      plainOutcome("x", spec.signerId, spec.receiverId, { SuccessValue: "" }, [
        event("pot", "link_returned", { pot: DAO, request_id: 3, amount: "30000000", by: deps.cfg.relayerAccountId, moved: true }),
      ])
    expect((await reclaimExpiredLinks(deps, "cause", { now: NOW })).reclaimed).toBe(1)
    const rows = await t.db.select().from(feedEvent).where(eq(feedEvent.kind, "link_returned"))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: "link_returned:3", actor: deps.cfg.relayerAccountId, amount: "30000000" })
  })

  it("runs as a step of the reconcile cron", async () => {
    chainWith(REQS, LINKS)
    const r = await runReconcile(deps, { holder: "run-links" })
    expect(r.errors).toEqual([])
    expect(r.links).toMatchObject({ reclaimed: 2 })
  })
})

describe("link pushes", () => {
  it("link_claimed → the requester (named later), link_returned → the members", () => {
    const ev = (name: string, data: Record<string, unknown>) => ({ standard: "pot", version: "1.1.0", event: name, data, executor: HUB, receiptId: "r", index: 0, blockHash: "b" })
    const out = eventsToNotifications(
      [
        ev("link_claimed", { pot: DAO, request_id: 7, receiver_id: "alex.testnet", amount: "84000000" }),
        ev("link_returned", { pot: DAO, request_id: 3, amount: "30000000", by: "relay.testnet", moved: true }),
        ev("link_funded", { pot: DAO, request_id: 3, amount: "30000000", expires_at_ms: 1 }),
      ] as never,
      "TX",
    )
    expect(out).toEqual([
      { type: "link_claimed", pot: DAO, requestId: 7, requester: "", claimer: "alex.testnet", amount: "84000000" },
      { type: "link_returned", pot: DAO, requestId: 3, by: "relay.testnet", amount: "30000000" },
    ])
  })
})

describe("the feed's link details (members only)", () => {
  it("labels only from the request's own requester; claimers named only when they use Pot", async () => {
    const at = new Date()
    const row = (kind: string, key: string, extra: Record<string, unknown>) => ({ potId: DAO, kind: kind as never, key, at, receiptId: key, eventIndex: 0, data: {}, source: "relay" as const, ...extra })
    await t.db.insert(feedEvent).values([
      row("spend_requested", "request:r1", { actor: "maya.potapp.testnet", requestRef: "aaaaaaaaaaaaaaaa" }),
      row("spend_requested", "request:r2", { actor: "sam.potapp.testnet", requestRef: "bbbbbbbbbbbbbbbb" }),
      row("link_claimed", "link_claimed:3", { subject: "alex.potapp.testnet", data: { pot: DAO, request_id: 3, receiver_id: "alex.potapp.testnet", amount: "1" } }),
      row("link_claimed", "link_claimed:4", { subject: "stranger.testnet", data: { pot: DAO, request_id: 4, receiver_id: "stranger.testnet", amount: "1" } }),
    ])
    await t.db.insert(note).values([
      { potId: DAO, kind: "link_label", ref: "aaaaaaaaaaaaaaaa", authorAccount: "maya.potapp.testnet", text: "Casa Lisboa host" },
      // someone else's label on Sam's request: never shown
      { potId: DAO, kind: "link_label", ref: "bbbbbbbbbbbbbbbb", authorAccount: "maya.potapp.testnet", text: "Not Sam's words" },
    ])
    const { user } = await insertUser(t.db, { account: "alex.potapp.testnet" })
    await t.db.update(appUser).set({ displayName: "Alex" }).where(eq(appUser.id, user.id))
    const page = await t.db.select().from(feedEvent).where(eq(feedEvent.potId, DAO))
    const out = await linkEnrichment(t.db, DAO, page)
    expect(out.linkLabels).toEqual({ aaaaaaaaaaaaaaaa: "Casa Lisboa host" })
    expect(out.linkClaimers).toEqual({ "3": "Alex" })
  })
})
