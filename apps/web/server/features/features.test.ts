// X-09 faucet (A-11, A-28), X-05 notes and feed (A-12, A-29) against pot_test with a fake chain and a
// scripted submitter.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { readQuota } from "@/db/quota"
import { feedEvent, note, pot } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import type { Config } from "../config"
import { createSession, loadSession, type SessionCtx } from "../session/store"
import { DAO, HUB, USDC } from "../testing/delegates"
import { insertUser, seedChain, testConfig, TREASURY } from "../testing/env"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../testing/fakeChain"
import { claimFaucet } from "./faucet"
import { getFeed } from "./feed"
import { postNote } from "./notes"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter

beforeAll(async () => {
  t = await createTestDb("features")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig()
  resetBalanceCacheForTests()
  chain = seedChain(new FakeChain())
  sub = new FakeSubmitter((spec) => plainOutcome("x", spec.signerId, spec.receiverId))
})

async function sessionFor(account: string, kind: "near-auth" | "wallet" = "near-auth", deviceStatus: "active" | "pending" = "active"): Promise<SessionCtx> {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key, kind, deviceStatus })
  const s = await createSession(t.db, { userId: user.id, kind, deviceId: device?.id })
  return (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie: `__Host-pot_session=${s.cookieValue}` } }), cfg))!
}

// ---------------------------------------------------------------------------------------------

describe("faucet (X-09, A-11, A-28)", () => {
  const ACC = "u-faucet01.users.potapp.testnet"
  let registered: boolean
  beforeEach(() => {
    registered = true
    chain.view(USDC, "storage_balance_of", () => (registered ? { total: "1", available: "0" } : null))
  })
  const deps = () => ({ db: t.db, rpc: chain, submitter: sub, cfg, sleep: async () => undefined })
  const claim = (s: SessionCtx, key: string, amount?: string, ip = "ip1") =>
    claimFaucet(deps(), s, { idempotencyKey: key, ...(amount ? { amount } : {}) }, { ipHash: ip, requestId: `req_${key}` })

  it("sends $150 by default from the treasury pool with 1 yocto, never ft_transfer_call", async () => {
    const s = await sessionFor(ACC)
    const r = await claim(s, "aaaaaaaaaaaaaaaa")
    expect(r.body).toMatchObject({ amount: "150000000", registeredNow: false })
    const tx = sub.submitted[0]!
    expect(tx.opts.pool).toBe("treasury_key")
    expect(tx.spec).toMatchObject({ signerId: TREASURY, receiverId: USDC })
    expect(methodOf(tx.spec)).toBe("ft_transfer")
    const fcall = (tx.spec.actions[0] as unknown as { functionCall: { deposit: bigint; args: Uint8Array } }).functionCall
    expect(fcall.deposit).toBe(1n)
    expect(JSON.parse(Buffer.from(fcall.args).toString())).toEqual({ receiver_id: ACC, amount: "150000000", memo: "Demo dollars (testnet)" })
  })

  it("is idempotent per key (the Add sheet may call it as it opens)", async () => {
    const s = await sessionFor(ACC)
    const a = await claim(s, "bbbbbbbbbbbbbbbb")
    const b = await claim(s, "bbbbbbbbbbbbbbbb")
    expect(b.body).toMatchObject({ replayed: true, txHash: a.body.txHash })
    expect(sub.submitted).toHaveLength(1)
    await expect(claim(s, "bbbbbbbbbbbbbbbb", "60000000")).rejects.toMatchObject({ reason: "idempotency_conflict" })
  })

  it("$50 minimum, $500 maximum per claim (rev4 L-6)", async () => {
    const s = await sessionFor(ACC)
    await expect(claim(s, "cccccccccccccccc", "49999999")).rejects.toMatchObject({ reason: "bad_request" })
    await expect(claim(s, "cccccccccccccccd", "500000001")).rejects.toMatchObject({ reason: "bad_request" })
  })

  it("per account: 5 claims and $500 a day; per IP $1,000 → quota_exceeded family faucet", async () => {
    const s = await sessionFor(ACC)
    for (const k of ["k0000000000000a1", "k0000000000000a2"]) await claim(s, k, "200000000")
    await expect(claim(s, "k0000000000000a3", "200000000")).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "faucet" } })
    expect(await readQuota(t.db, `account:${ACC}`, "faucet_usd")).toBe(400_000_000n) // the refused claim consumed nothing
    process.env.QUOTA_IP_FAUCET_USD = "500000000"
    const other = await sessionFor("u-faucet02.users.potapp.testnet")
    await claim(other, "k0000000000000b1", "100000000")
    await expect(claim(other, "k0000000000000b2", "100000000")).rejects.toMatchObject({ detail: { family: "faucet" } })
  })

  it("registers an unregistered account once (registeredNow), counted in global/registrations", async () => {
    registered = false
    const s = await sessionFor(ACC)
    const r = await claim(s, "dddddddddddddddd")
    expect(r.body.registeredNow).toBe(true)
    expect(sub.submitted.map((x) => methodOf(x.spec))).toEqual(["storage_deposit", "ft_transfer"])
    expect(sub.submitted[0]!.opts.pool).toBe("relayer_key")
    expect(await readQuota(t.db, "global", "registrations")).toBe(1n)
    // it unregistered since to pocket the refund → registration_used, nothing paid
    const before = sub.submitted.length
    await expect(claim(s, "eeeeeeeeeeeeeeee")).rejects.toMatchObject({ reason: "registration_used", status: 409 })
    expect(sub.submitted.length).toBe(before)
  })

  it("a pending_device session is refused by the route guard; mainnet → 404", async () => {
    const s = await sessionFor(ACC, "near-auth", "pending")
    expect(s.pendingDevice).toBe(true)
    cfg = testConfig({ NEXT_PUBLIC_NETWORK: "mainnet" })
    await expect(claim(s, "ffffffffffffffff")).rejects.toMatchObject({ reason: "not_found" })
  })

  it("a treasury failure → 503 cause treasury, quotas given back, the key freed for a retry", async () => {
    const s = await sessionFor(ACC)
    sub.script = (spec) => plainOutcome("x", spec.signerId, spec.receiverId, { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: The account doesn't have enough balance" } } } } })
    await expect(claim(s, "gggggggggggggggg")).rejects.toMatchObject({ reason: "service_unavailable", detail: { cause: "treasury" } })
    expect(await readQuota(t.db, `account:${ACC}`, "faucet_claims")).toBe(0n)
    sub.script = (spec) => plainOutcome("x", spec.signerId, spec.receiverId)
    expect((await claim(s, "gggggggggggggggg")).status).toBe(200)
  })
})

// ---------------------------------------------------------------------------------------------

describe("notes (X-05, A-12)", () => {
  const MAYA = "maya.users.potapp.testnet"
  beforeEach(() => {
    chain.view(HUB, "get_members", () => [{ account_id: MAYA, status: "active" }])
  })
  const deps = () => ({ db: t.db, hub: createHubReader(chain, HUB), cfg })

  it("stores a member's memo; the same text replays, another text → note_exists", async () => {
    const s = await sessionFor(MAYA)
    const r = await postNote(deps(), s, { kind: "memo", pot: DAO, ref: "k3d9x1a2b4c6m7n8", text: "  Groceries for the house  " })
    expect(r.body.note).toMatchObject({ kind: "memo", pot: DAO, ref: "k3d9x1a2b4c6m7n8" })
    expect((await t.db.select().from(note))[0]!.text).toBe("Groceries for the house")
    expect((await postNote(deps(), s, { kind: "memo", pot: DAO, ref: "k3d9x1a2b4c6m7n8", text: "Groceries for the house" })).body.replayed).toBe(true)
    await expect(postNote(deps(), s, { kind: "memo", pot: DAO, ref: "k3d9x1a2b4c6m7n8", text: "other" })).rejects.toMatchObject({ reason: "note_exists" })
  })

  it.each([
    ["a non-member", "leo.users.potapp.testnet", { kind: "memo", ref: "k3d9x1a2b4c6m7n8", text: "hi" }, "not_a_member"],
    ["141 code points", "maya.users.potapp.testnet", { kind: "memo", ref: "k3d9x1a2b4c6m7n8", text: "é".repeat(141) }, "bad_request"],
    ["a bidi override (U-11)", "maya.users.potapp.testnet", { kind: "memo", ref: "k3d9x1a2b4c6m7n8", text: "pay ‮me" }, "bad_request"],
    ["a control character", "maya.users.potapp.testnet", { kind: "memo", ref: "k3d9x1a2b4c6m7n8", text: "a\u0007b" }, "bad_request"],
    ["a memo ref that isn't an OpKey", "maya.users.potapp.testnet", { kind: "memo", ref: "nope", text: "hi" }, "bad_request"],
    ["a decline ref that isn't a proposal id", "maya.users.potapp.testnet", { kind: "decline_reason", ref: "x1", text: "no" }, "bad_request"],
  ] as const)("%s → %s", async (_n, account, body, reason) => {
    const s = await sessionFor(account)
    await expect(postNote(deps(), s, { ...body, pot: DAO } as never)).rejects.toMatchObject({ reason })
  })

  it("an unknown Pot → pot_unknown", async () => {
    const s = await sessionFor(MAYA)
    await expect(postNote(deps(), s, { kind: "memo", pot: `nope.${HUB}`, ref: "k3d9x1a2b4c6m7n8", text: "hi" })).rejects.toMatchObject({ reason: "pot_unknown" })
  })
})

// ---------------------------------------------------------------------------------------------

describe("feed (X-05, A-12, A-29)", () => {
  const MAYA = "maya.users.potapp.testnet"
  const SAM = "sam.users.potapp.testnet"
  let rid = 0
  async function seedFeed(withMaya = true) {
    await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
    const at = (s: number) => new Date(Date.UTC(2026, 10, 3, 12, 0, s))
    const row = (kind: string, s: number, extra: Record<string, unknown>) => ({
      potId: DAO,
      kind: kind as never,
      key: `${kind}:${s}`,
      receiptId: `r${++rid}`,
      eventIndex: 0,
      at: at(s),
      data: {},
      source: "relay" as const,
      ...extra,
    })
    await t.db.insert(feedEvent).values([
      row("member_joined", 1, { actor: SAM, key: `join:${SAM}` }),
      row("contribution", 2, { actor: MAYA, amount: "150000000", txHash: "T1" }),
      row("spend_requested", 3, { actor: MAYA, subject: MAYA, amount: "84000000", proposalId: 2, requestRef: "k3d9x1a2b4c6m7n8", category: "groceries", path: "instant" }),
      row("spend_auto_approved", 4, { actor: MAYA, proposalId: 2 }),
      row("spend_requested", 5, { actor: SAM, subject: SAM, amount: "300000000", proposalId: 3, requestRef: "p8w2m4q6z1x3r5t7", category: "tickets", path: "vote" }),
      row("spend_payout_failed", 6, { proposalId: 3 }),
      row("invite_added", 7, { actor: MAYA }),
    ])
    if (withMaya) await insertUser(t.db, { account: MAYA })
    await t.db.insert(note).values([
      { potId: DAO, kind: "memo", ref: "k3d9x1a2b4c6m7n8", authorAccount: MAYA, text: "Groceries" },
      { potId: DAO, kind: "memo", ref: "p8w2m4q6z1x3r5t7", authorAccount: MAYA, text: "spoofed memo by a non-requester" },
      { potId: DAO, kind: "decline_reason", ref: "3", authorAccount: MAYA, text: "Too much" },
      { potId: DAO, kind: "decline_reason", ref: "3", authorAccount: SAM, text: "approved actually" },
    ])
  }
  beforeEach(() => {
    chain.view(HUB, "get_members", () => [{ account_id: MAYA, status: "active" }, { account_id: SAM, status: "active" }])
    chain.view(DAO, "get_proposal", () => ({ id: 3, kind: {}, status: "InProgress", votes: { [MAYA]: "Reject", [SAM]: "Approve" }, submission_time: "0" }))
  })
  const deps = () => ({ db: t.db, hub: createHubReader(chain, HUB), cfg })

  it("anonymous reads get items (newest first) but no profiles or memos (rev4 M-7)", async () => {
    await seedFeed()
    const r = await getFeed(deps(), null, "lisbon-trip", {})
    const items = r.body.items as { type: string; key: string; payoutFailed?: boolean }[]
    expect(items.map((i) => i.type)).toEqual(["request", "request", "contribution", "joined"])
    expect(items[0]).toMatchObject({ payoutFailed: true, receiver: SAM, path: "vote" })
    expect(r.body.profiles).toEqual({})
    expect(r.body.memos).toBeUndefined()
    expect(r.cacheControl).toMatch(/^public/)
  })

  it("members get profiles, matched memos only and Reject-vote decline reasons only", async () => {
    await seedFeed(false)
    const s = await sessionFor("maya.users.potapp.testnet")
    const r = await getFeed(deps(), s, DAO, {})
    expect(Object.keys(r.body.profiles as object)).toContain(MAYA)
    // every member gets a profile, even one with no item on this page (wave 3, request 3)
    const LEO = "leo.users.potapp.testnet"
    await insertUser(t.db, { account: LEO })
    chain.view(HUB, "get_members", () => [{ account_id: MAYA, status: "active" }, { account_id: SAM, status: "active" }, { account_id: LEO, status: "active" }])
    const r2 = await getFeed({ ...deps(), hub: createHubReader(chain, HUB) }, s, DAO, { limit: 1 })
    expect(Object.keys(r2.body.profiles as object).sort()).toEqual([LEO, MAYA].sort())
    expect(r.body.memos).toEqual({ k3d9x1a2b4c6m7n8: "Groceries" })
    expect(r.body.declineReasons).toEqual({ "3": { [MAYA]: "Too much" } })
    expect(r.cacheControl).toBe("private, no-store")
  })


  it("rule changes and close requests carry proposalId and the member who asked (frontend request 9)", async () => {
    const { applyHubEvents } = await import("../relay/effects")
    await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
    const ev = (event: string, data: Record<string, unknown>, i: number) => ({ standard: "pot", version: "1.0.0", event, data: { pot: DAO, ...data }, executor: HUB, receiptId: `rc${i}`, blockHash: "b", index: 0 })
    await applyHubEvents(t.db, {
      hubId: HUB,
      txHash: "TXR",
      blockTimes: new Map(),
      events: [
        ev("rules_change_proposed", { proposal_id: 7, by: SAM, rules_version: 2 }, 1),
        ev("close_proposed", { proposal_id: 8, by: MAYA, payouts: [] }, 2),
        ev("rules_changed", { by: "sole_member", actor: MAYA, rules_version: 3 }, 3),
      ],
    })
    const r = await getFeed(deps(), null, DAO, {})
    const items = r.body.items as { type: string; actor: string; proposalId?: number }[]
    expect(items.map((i) => [i.type, i.actor, i.proposalId])).toEqual(
      expect.arrayContaining([
        ["rule_change", SAM, 7],
        ["close_requested", MAYA, 8],
        ["rule_change", MAYA, undefined],
      ]),
    )
  })

  it("paginates with an opaque cursor", async () => {
    await seedFeed()
    const p1 = await getFeed(deps(), null, DAO, { limit: 3 })
    expect((p1.body.items as unknown[]).length).toBe(3)
    const p2 = await getFeed(deps(), null, DAO, { limit: 3, before: String(p1.body.nextCursor) })
    expect((p2.body.items as { type: string }[]).map((i) => i.type)).toEqual(["joined"])
    expect(p2.body.nextCursor).toBeUndefined()
    await expect(getFeed(deps(), null, DAO, { before: "garbage" })).rejects.toMatchObject({ reason: "bad_request" })
  })

  it("an unknown Pot → pot_unknown (and the hub lookup is cached negatively)", async () => {
    await expect(getFeed(deps(), null, "nope", {})).rejects.toMatchObject({ reason: "pot_unknown" })
    await expect(getFeed(deps(), null, "BAD SLUG", {})).rejects.toMatchObject({ reason: "pot_unknown" })
  })
})
