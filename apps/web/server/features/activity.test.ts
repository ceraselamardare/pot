// GET /api/me/activity against pot_test: what counts as "mine" (feed rows I caused, refunds that name me, my own
// approvals/declines from relay_log minus my automatic approval of my own requests), the status of what I asked,
// the merged cursor pagination, and the route's auth gate.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { KeyPair } from "near-api-js"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { appUser, feedEvent, pot, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import type { ActivityApiItem } from "@/lib/activity-api"
import { createHubReader, type HubReader } from "../chain/hub"
import type { Config } from "../config"
import { setHubForTests } from "../deps"
import { createSession, loadSession, type SessionCtx } from "../session/store"
import { HUB } from "../testing/delegates"
import { insertUser, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"
import { getMyActivity } from "./activity"

const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const LISBON = `lisbon-trip.${HUB}`
const PORTO = `porto-weekend.${HUB}`
const TX = (n: number) => `${"9".repeat(40)}${String(n).padStart(4, "A")}`

let t: TestDb
let cfg: Config
// who is in each Pot now (hub.get_members): names in `profiles` only for Pots the reader is still in
let membersOf: Record<string, string[]>
let hub: HubReader
beforeAll(async () => {
  t = await createTestDb("activity")
  setDbForTests(t.db)
})
afterAll(async () => {
  setDbForTests(undefined)
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
  membersOf = { [LISBON]: [MAYA, SAM], [PORTO]: [MAYA] }
  const chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", (a) => (membersOf[a.pot as string] ?? []).map((account_id) => ({ account_id, status: "active", contributed: "0" })))
  hub = createHubReader(chain, HUB)
})

async function sessionFor(account: string, name: string): Promise<{ s: SessionCtx; cookie: string }> {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key })
  await t.db.update(appUser).set({ displayName: name }).where(eq(appUser.id, user.id))
  const c = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  const cookie = `__Host-pot_session=${c.cookieValue}`
  return { s: (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie } }), cfg))!, cookie }
}

const at = (min: number) => new Date(Date.UTC(2026, 10, 3, 12, min, 0))
let rid = 0
function fe(potId: string, kind: string, min: number, extra: Record<string, unknown> = {}) {
  return { potId, kind: kind as never, key: `${kind}:${++rid}`, receiptId: `r${rid}`, eventIndex: 0, at: at(min), data: {}, source: "relay" as const, ...extra }
}
function vote(userId: string, potId: string, pid: number, action: "VoteApprove" | "VoteReject", min: number, n: number) {
  return {
    id: `rl_${String(n).padStart(26, "0")}`,
    requestId: `req_${n}`,
    userId,
    op: "relay" as const,
    intent: "vote",
    senderId: MAYA,
    receiverId: potId,
    potId,
    outerTxHash: TX(100 + n),
    status: "executed" as const,
    outcome: "success" as const,
    result: { type: "vote", proposalId: pid, action, proposalStatus: "InProgress" },
    createdAt: at(min),
  }
}

/** Lisbon: Maya creates, adds $150, Sam joins, Maya's instant $84, Sam asks $300 (Maya approves), Maya asks $120
 *  (her own approval is automatic), Sam asks to close (Maya approves), closed with Maya's refund; Porto: Maya
 *  asks for a rule change and a sole-member change; a failed vote and someone else's rows never show. */
async function seed(mayaId: string, samId: string) {
  await t.db.insert(pot).values([
    { daoId: LISBON, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", emoji: "🇵🇹", gradient: "2", preset: "trip", creatorAccount: MAYA },
    { daoId: PORTO, slug: "porto-weekend", hubId: HUB, name: "Porto Weekend", preset: "trip", creatorAccount: MAYA },
  ])
  await t.db.insert(feedEvent).values([
    fe(LISBON, "pot_created", 0, { actor: MAYA, txHash: TX(1) }),
    fe(LISBON, "contribution", 1, { actor: MAYA, amount: "150000000", txHash: TX(2) }),
    fe(LISBON, "member_joined", 2, { actor: SAM, subject: SAM, txHash: TX(3) }),
    fe(LISBON, "contribution", 3, { actor: SAM, amount: "150000000", txHash: TX(4) }),
    fe(LISBON, "spend_requested", 4, { actor: MAYA, subject: MAYA, amount: "84000000", proposalId: 2, path: "instant", category: "groceries", txHash: TX(5), data: { request_id: 1 } }),
    fe(LISBON, "spend_auto_approved", 4, { actor: MAYA, proposalId: 2, txHash: TX(5) }),
    fe(LISBON, "spend_requested", 5, { actor: SAM, subject: SAM, amount: "300000000", proposalId: 3, path: "vote", category: "tickets", txHash: TX(6), data: { request_id: 2 } }),
    fe(LISBON, "spend_requested", 7, { actor: MAYA, subject: MAYA, amount: "120000000", proposalId: 4, path: "vote", category: "food", txHash: TX(7), data: { request_id: 3 } }),
    fe(LISBON, "proposal_synced", 8, { proposalId: 4, status: "rejected", txHash: TX(8) }),
    fe(LISBON, "close_proposed", 9, { actor: SAM, proposalId: 5, txHash: TX(9) }),
    fe(LISBON, "pot_closed", 11, { txHash: TX(10), data: { pot: LISBON, proposal_id: 5, balance: "66000000", payouts: [{ account_id: MAYA, amount: "33000000" }, { account_id: SAM, amount: "33000000" }] } }),
    fe(PORTO, "pot_created", 20, { actor: MAYA, txHash: TX(11) }),
    fe(PORTO, "rules_change_proposed", 21, { actor: MAYA, proposalId: 1, txHash: TX(12) }),
    fe(PORTO, "rules_changed", 22, { actor: MAYA, txHash: TX(13), data: { by: "sole_member", actor: MAYA } }),
    fe(PORTO, "rules_changed", 23, { actor: MAYA, txHash: TX(14), data: { by: "group", actor: MAYA } }),
    fe(PORTO, "invite_added", 24, { actor: MAYA, txHash: TX(15) }),
  ])
  await t.db.insert(relayLog).values([
    vote(mayaId, LISBON, 3, "VoteApprove", 6, 1), // Sam's $300
    vote(mayaId, LISBON, 4, "VoteApprove", 7, 2), // her own $120: part of asking
    vote(mayaId, LISBON, 5, "VoteReject", 10, 3), // Sam's close
    { ...vote(mayaId, LISBON, 3, "VoteApprove", 12, 4), status: "failed" as const, outcome: null }, // never landed
    vote(samId, LISBON, 4, "VoteReject", 8, 5), // Sam's decline: not Maya's
  ])
}

const summary = (items: ActivityApiItem[]) => items.map((i) => `${i.kind}:${i.pot.slug}${i.amount ? `:${i.amount}` : ""}${i.vote ? `:${i.vote}` : ""}${i.status ? `:${i.status}` : ""}`)

describe("GET /api/me/activity", () => {
  it("maps each of my actions across Pots, newest first, with receipts, statuses and who I approved", async () => {
    const maya = await sessionFor(MAYA, "Maya")
    const sam = await sessionFor(SAM, "Sam")
    await seed(maya.s.user.id, sam.s.user.id)
    const r = await getMyActivity({ db: t.db, hub }, maya.s, {})
    expect(summary(r.body.items)).toEqual([
      "rules_changed:porto-weekend",
      "rules_asked:porto-weekend",
      "created:porto-weekend",
      "refund:lisbon-trip:33000000",
      "voted:lisbon-trip:Reject",
      "asked:lisbon-trip:120000000:rejected",
      "voted:lisbon-trip:Approve",
      "asked:lisbon-trip:84000000:paid",
      "added:lisbon-trip:150000000",
      "created:lisbon-trip",
    ])
    const byKind = Object.fromEntries(r.body.items.map((i) => [`${i.kind}:${i.pot.slug}:${i.vote ?? ""}`, i]))
    expect(byKind["added:lisbon-trip:"]).toMatchObject({ key: `added:${TX(2)}`, txHash: TX(2), pot: { name: "Lisbon Trip", emoji: "🇵🇹", gradient: "2" } })
    expect(byKind["asked:lisbon-trip:"]?.key).toMatch(/^asked:lisbon-trip:\d$/)
    expect(byKind["voted:lisbon-trip:Approve"]).toMatchObject({
      key: `voted:lisbon-trip:3:${MAYA}`,
      txHash: TX(101),
      about: { type: "spend", actor: SAM, amount: "300000000", requestId: 2 },
    })
    expect(byKind["voted:lisbon-trip:Reject"]).toMatchObject({ about: { type: "close", actor: SAM } })
    expect(byKind["refund:lisbon-trip:"]).toMatchObject({ key: `refund:lisbon-trip:${MAYA}`, txHash: TX(10) })
    expect(r.body.profiles).toEqual({ [SAM]: { name: "Sam" } })
    expect(r.body.nextCursor).toBeUndefined()

    // Sam sees only his own: joined, added, asked, the close he asked for, his decline, his refund
    const rs = await getMyActivity({ db: t.db, hub }, sam.s, {})
    expect(summary(rs.body.items)).toEqual([
      "refund:lisbon-trip:33000000",
      "close_asked:lisbon-trip",
      "voted:lisbon-trip:Reject",
      "asked:lisbon-trip:300000000",
      "added:lisbon-trip:150000000",
      "joined:lisbon-trip",
    ])
  })

  it("paginates the merged sources with an opaque cursor: every row once, in order", async () => {
    const maya = await sessionFor(MAYA, "Maya")
    const sam = await sessionFor(SAM, "Sam")
    await seed(maya.s.user.id, sam.s.user.id)
    // a vote at the same instant as a feed row (ties break feed first, then id)
    await t.db.insert(relayLog).values(vote(maya.s.user.id, PORTO, 9, "VoteApprove", 21, 6))
    const all = (await getMyActivity({ db: t.db, hub }, maya.s, { limit: 100 })).body.items.map((i) => i.key)
    const seen: string[] = []
    let before: string | undefined
    for (let pages = 0; pages < 20; pages++) {
      const r = await getMyActivity({ db: t.db, hub }, maya.s, { limit: 3, before })
      seen.push(...r.body.items.map((i) => i.key))
      before = r.body.nextCursor
      if (!before) break
    }
    expect(seen).toEqual(all)
    expect(new Set(seen).size).toBe(seen.length)
    expect(all).toContain(`voted:porto-weekend:9:${MAYA}`)
    await expect(getMyActivity({ db: t.db, hub }, maya.s, { before: "garbage" })).rejects.toMatchObject({ reason: "bad_request" })
  })

  it("other people's names only from Pots I'm still in: after leaving (or an unreadable member list) none", async () => {
    const maya = await sessionFor(MAYA, "Maya")
    const sam = await sessionFor(SAM, "Sam")
    await seed(maya.s.user.id, sam.s.user.id)
    // still in: Sam's name comes with the approvals
    expect((await getMyActivity({ db: t.db, hub }, maya.s, {})).body.profiles).toEqual({ [SAM]: { name: "Sam" } })
    // Maya is no longer in Lisbon: her own rows stay (public anyway), Sam's chosen name doesn't
    membersOf[LISBON] = [SAM]
    const left = await getMyActivity({ db: t.db, hub: createHubReader(seedChain(new FakeChain()).view(HUB, "get_members", (a) => (membersOf[a.pot as string] ?? []).map((account_id) => ({ account_id, status: "active" }))), HUB) }, maya.s, {})
    expect(left.body.items.some((i) => i.kind === "voted" && i.about?.actor === SAM)).toBe(true)
    expect(left.body.profiles).toEqual({})
    expect(JSON.stringify(left.body)).not.toContain('"Sam"')
    // joining isn't in yet; a hub that can't be read fails closed
    const joining = createHubReader(seedChain(new FakeChain()).view(HUB, "get_members", () => [{ account_id: MAYA, status: "joining" }]), HUB)
    expect((await getMyActivity({ db: t.db, hub: joining }, maya.s, {})).body.profiles).toEqual({})
    const down = createHubReader(seedChain(new FakeChain()).view(HUB, "get_members", () => { throw new Error("rpc down") }), HUB)
    expect((await getMyActivity({ db: t.db, hub: down }, maya.s, {})).body.profiles).toEqual({})
  })

  it("the route: no session → 401; a session → 200 private no-store; a bad limit → 400", async () => {
    setHubForTests(hub)
    const { GET } = await import("@/app/api/me/activity/route")
    const anon = await GET(new Request("https://pot.test/api/me/activity"))
    expect(anon.status).toBe(401)
    expect(await anon.json()).toMatchObject({ ok: false, reason: "not_signed_in" })

    const maya = await sessionFor(MAYA, "Maya")
    await t.db.insert(pot).values({ daoId: LISBON, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
    await t.db.insert(feedEvent).values([fe(LISBON, "contribution", 1, { actor: MAYA, amount: "50000000", txHash: TX(2) }), fe(LISBON, "contribution", 2, { actor: MAYA, amount: "60000000", txHash: TX(3) })])
    const res = await GET(new Request("https://pot.test/api/me/activity?limit=1", { headers: { cookie: maya.cookie } }))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    const body = (await res.json()) as { ok: boolean; items: ActivityApiItem[]; nextCursor?: string }
    expect(body.ok).toBe(true)
    expect(body.items.map((i) => i.amount)).toEqual(["60000000"])
    const next = await GET(new Request(`https://pot.test/api/me/activity?limit=1&before=${body.nextCursor}`, { headers: { cookie: maya.cookie } }))
    expect(((await next.json()) as { items: ActivityApiItem[] }).items.map((i) => i.amount)).toEqual(["50000000"])

    expect((await GET(new Request("https://pot.test/api/me/activity?limit=abc", { headers: { cookie: maya.cookie } }))).status).toBe(400)
    setHubForTests(undefined)
  })
})
