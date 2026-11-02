// Privacy audit 2026-11-02 (notes/backend.md "Privacy audit 2026-11-02"): every piece of Pot data that is not on the
// public ledger reaches that Pot's active members only. Route-level, through the real handlers with cookies, for four
// readers: a member, a signed-in person who was never in the Pot, a person who LEFT it (no longer in hub.get_members)
// and a signed-out visitor. Each off-chain datum carries a marker string; a reader who mustn't see it gets a body
// without any marker (and, where it's an error, the same error whether the thing exists or not).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { DrizzleQueryError } from "drizzle-orm/errors"
import { eq } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { appUser, feedEvent, note, pot, relayLog, requestComment, spendReceipt } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createHubReader } from "../chain/hub"
import { setConfigForTests } from "../config"
import { setHubForTests } from "../deps"
import { route } from "../http/context"
import { createSession } from "../session/store"
import { DAO, HUB } from "../testing/delegates"
import { insertUser, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"

const MAYA = "maya.users.potapp.testnet" // member
const SAM = "sam.users.potapp.testnet" // member, asked for both spends
const EVE = "eve.users.potapp.testnet" // signed in, never in the Pot
const LEO = "leo.users.potapp.testnet" // was in the Pot (commented), left
const ALEX = "alex.users.potapp.testnet" // claimed Sam's payment link (not in the Pot)
const REF = "k3d9x1a2b4c6m7n8"
const LINK_REF = "p8w2m4q6z1x3r5t7"

// every off-chain datum, as a marker no other field contains
const SECRET = {
  memo: "SECRET-MEMO-surfboards",
  decline: "SECRET-DECLINE-too-much",
  label: "SECRET-LABEL-beach-bar",
  comment: "SECRET-COMMENT-meet-at-six",
  merchant: "SECRET-MERCHANT-cafe",
  names: ["Maya Chosen", "Sam Chosen", "Leo Chosen", "Alex Claimer"],
  email: "sam.secret@example.com",
}
const ALL = [SECRET.memo, SECRET.decline, SECRET.label, SECRET.comment, SECRET.merchant, ...SECRET.names, SECRET.email]
const leaks = (body: unknown) => ALL.filter((m) => JSON.stringify(body).includes(m))

let t: TestDb
let members: string[]
const cookies: Record<string, string> = {}

function resetHub() {
  const chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", () => members.map((account_id) => ({ account_id, status: "active", contributed: "150000000" })))
  chain.view(HUB, "get_requests", (a) =>
    (a.from_index as number) === 0
      ? [{ request_id: 0, pot: DAO, requester: SAM, receiver_id: SAM, amount: "300000000", category: "tickets", request_ref: REF, path: "vote", reason: "over_cap", status: "rejected", proposal_id: 4, created_at_ms: 1, updated_at_ms: 1, expires_at_ms: 2 }]
      : [],
  )
  chain.view(DAO, "get_proposal", () => ({ id: 4, kind: {}, status: "Rejected", votes: { [MAYA]: "Reject", [SAM]: "Approve" }, submission_time: "0" }))
  // a fresh reader each time: get_members is cached 10 s per reader
  setHubForTests(createHubReader(chain, HUB))
}

async function user(account: string, name: string, email?: string) {
  const { user: u, device } = await insertUser(t.db, { account, key: KeyPair.fromRandom("ed25519") })
  await t.db.update(appUser).set({ displayName: name, ...(email ? { email } : {}), avatar: "pot-03" }).where(eq(appUser.id, u.id))
  const c = await createSession(t.db, { userId: u.id, kind: "near-auth", deviceId: device?.id })
  cookies[account] = `__Host-pot_session=${c.cookieValue}`
  return u
}

const at = (min: number) => new Date(Date.UTC(2026, 10, 2, 9, min))
const ev = (kind: string, key: string, min: number, extra: Record<string, unknown>) => ({ potId: DAO, kind: kind as never, key, receiptId: key, eventIndex: 0, at: at(min), data: {}, source: "relay" as const, ...extra })

beforeAll(async () => {
  t = await createTestDb("privacy")
  setDbForTests(t.db)
})
afterAll(async () => {
  setDbForTests(undefined)
  setHubForTests(undefined)
  setConfigForTests(undefined)
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  testConfig()
  members = [MAYA, SAM]
  resetHub()
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
  await user(MAYA, "Maya Chosen")
  await user(SAM, "Sam Chosen", SECRET.email)
  await user(EVE, "Eve Outsider")
  await user(LEO, "Leo Chosen")
  await user(ALEX, "Alex Claimer")
  await t.db.insert(feedEvent).values([
    ev("member_joined", `join:${SAM}`, 1, { actor: SAM }),
    ev("spend_requested", "request:0", 2, { actor: SAM, subject: SAM, amount: "300000000", proposalId: 4, requestRef: REF, category: "tickets", path: "vote", data: { request_id: 0 } }),
    ev("spend_requested", "request:1", 3, { actor: SAM, subject: HUB, amount: "60000000", proposalId: 5, requestRef: LINK_REF, category: "food", path: "instant", data: { request_id: 1 } }),
    ev("link_claimed", "link_claimed:1", 4, { subject: ALEX, data: { pot: DAO, request_id: 1, receiver_id: ALEX, amount: "60000000" } }),
  ])
  await t.db.insert(note).values([
    { potId: DAO, kind: "memo", ref: REF, authorAccount: SAM, text: SECRET.memo },
    { potId: DAO, kind: "decline_reason", ref: "4", authorAccount: MAYA, text: SECRET.decline },
    { potId: DAO, kind: "link_label", ref: LINK_REF, authorAccount: SAM, text: SECRET.label },
  ])
  await t.db.insert(requestComment).values({ potId: DAO, requestId: 0, authorAccount: LEO, body: SECRET.comment })
  await t.db.insert(spendReceipt).values({ potId: DAO, requestId: 0, requesterAccount: SAM, data: { merchant: SECRET.merchant, items: [] }, fingerprint: "a".repeat(64) })
  // Maya approved something of Sam's (her activity names him while she's in the Pot)
  await t.db.insert(relayLog).values({
    id: `rl_${"0".repeat(25)}1`,
    requestId: "req_1",
    userId: (await t.db.select().from(appUser).where(eq(appUser.nearAccount, MAYA)))[0]!.id,
    op: "relay",
    intent: "vote",
    senderId: MAYA,
    receiverId: DAO,
    potId: DAO,
    status: "executed",
    outcome: "success",
    result: { type: "vote", proposalId: 4, action: "VoteReject" },
    createdAt: at(5),
  })
})

const ORIGIN = "https://pot.test"
const req = (method: string, path: string, who: string | null, body?: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, ...(who ? { cookie: cookies[who]! } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const params = <P,>(p: P) => ({ params: Promise.resolve(p) })
async function call(res: Promise<Response>): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await res
  return { status: r.status, body: (await r.json()) as Record<string, unknown> }
}

/** Leo leaves: he's no longer in hub.get_members (a fresh reader, no cached list). */
function leoLeft() {
  members = [MAYA, SAM]
  resetHub()
}

describe("GET /api/pots/[pot]/feed", () => {
  const feed = async (who: string | null) => {
    const { GET } = await import("@/app/api/pots/[pot]/feed/route")
    return call(GET(req("GET", "/api/pots/lisbon-trip/feed", who), params({ pot: "lisbon-trip" })))
  }

  it("a member gets every off-chain extra (names, notes, decline reasons, comment counts, link labels, claimers)", async () => {
    const r = await feed(MAYA)
    expect(r.status).toBe(200)
    expect(r.body.profiles).toMatchObject({ [MAYA]: { name: "Maya Chosen" }, [SAM]: { name: "Sam Chosen" } })
    expect(r.body.memos).toEqual({ [REF]: SECRET.memo })
    expect(r.body.declineReasons).toEqual({ "4": { [MAYA]: SECRET.decline } })
    expect(r.body.commentCounts).toEqual({ "0": 1 })
    expect(r.body.linkLabels).toEqual({ [LINK_REF]: SECRET.label })
    expect(r.body.linkClaimers).toEqual({ "1": "Alex Claimer" })
    // never an email, even to members
    expect(JSON.stringify(r.body)).not.toContain(SECRET.email)
  })

  it.each([
    ["signed out", null],
    ["never in the Pot", EVE],
    ["left the Pot", LEO],
  ])("%s: only the public ledger's part (items, the Pot's name) + which spends have a receipt", async (_, who) => {
    if (who === LEO) {
      members = [MAYA, SAM, LEO]
      resetHub()
      expect((await feed(LEO)).body.memos).toEqual({ [REF]: SECRET.memo }) // while in the Pot
      leoLeft()
    }
    const r = await feed(who)
    expect(r.status).toBe(200)
    expect(leaks(r.body)).toEqual([])
    expect(r.body.profiles).toEqual({})
    for (const k of ["memos", "declineReasons", "commentCounts", "linkLabels", "linkClaimers"]) expect(r.body[k]).toBeUndefined()
    expect((r.body.items as unknown[]).length).toBe(3)
    expect(r.body.pot).toMatchObject({ name: "Lisbon Trip" }) // on the ledger
    expect(r.body.receipts).toEqual(["0"]) // decided: existence only (the request's fingerprint says as much on the ledger)
  })
})

describe("comments", () => {
  it("a member reads the thread with names; the outsider, the one who left and the signed-out get the same refusal, no text", async () => {
    const { GET } = await import("@/app/api/pots/[pot]/requests/[id]/comments/route")
    const get = (who: string | null, id = "0") => call(GET(req("GET", `/api/pots/lisbon-trip/requests/${id}/comments`, who), params({ pot: "lisbon-trip", id })))
    const ok = await get(MAYA)
    expect(ok.status).toBe(200)
    expect(JSON.stringify(ok.body)).toContain(SECRET.comment)
    expect(ok.body.profiles).toMatchObject({ [LEO]: { name: "Leo Chosen" } })
    for (const who of [EVE, LEO]) {
      const r = await get(who)
      expect(r).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
      expect(leaks(r.body)).toEqual([])
      // a thread that doesn't exist answers the same: no way to tell which requests have comments
      expect((await get(who, "7")).body.reason).toBe("not_a_member")
    }
    expect(await get(null)).toMatchObject({ status: 401, body: { reason: "not_signed_in" } })
  })

  it("someone who left can't write, and can't even remove their own old comment (it stays the group's)", async () => {
    const { POST } = await import("@/app/api/pots/[pot]/requests/[id]/comments/route")
    const { DELETE } = await import("@/app/api/pots/[pot]/requests/[id]/comments/[commentId]/route")
    const [c] = await t.db.select().from(requestComment)
    const p = params({ pot: "lisbon-trip", id: "0" })
    expect(await call(POST(req("POST", "/x", LEO, { body: "still here?" }), p))).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
    expect(await call(POST(req("POST", "/x", EVE, { body: "hi" }), p))).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
    expect(await call(DELETE(req("DELETE", "/x", LEO), params({ pot: "lisbon-trip", id: "0", commentId: String(c!.id) })))).toMatchObject({
      status: 403,
      body: { reason: "not_a_member" },
    })
    expect(await t.db.select().from(requestComment)).toHaveLength(1)
  })
})

describe("GET …/requests/[id]/receipt (the saved receipt details)", () => {
  it("members read the items; everyone else is refused the same way whether or not a receipt exists", async () => {
    const { GET } = await import("@/app/api/pots/[pot]/requests/[id]/receipt/route")
    const get = (who: string | null, id = "0") => call(GET(req("GET", `/api/pots/lisbon-trip/requests/${id}/receipt`, who), params({ pot: "lisbon-trip", id })))
    const ok = await get(SAM)
    expect(ok.status).toBe(200)
    expect(JSON.stringify(ok.body)).toContain(SECRET.merchant)
    expect((await get(MAYA, "1")).body).toMatchObject({ reason: "not_found" }) // a member may learn there's none
    for (const who of [EVE, LEO]) {
      const withOne = await get(who, "0")
      const without = await get(who, "1")
      expect(withOne).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
      expect(without).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
      expect(leaks(withOne.body)).toEqual([])
    }
    expect(await get(null)).toMatchObject({ status: 401, body: { reason: "not_signed_in" } })
  })
})

describe("POST /api/notes", () => {
  it("only members write notes; the one who left and an outsider are refused", async () => {
    const { POST } = await import("@/app/api/notes/route")
    const body = { kind: "memo", pot: DAO, ref: "k3d9x1a2b4c6m7n9", text: "hello" }
    expect(await call(POST(req("POST", "/api/notes", LEO, body)))).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
    expect(await call(POST(req("POST", "/api/notes", EVE, body)))).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
    expect(await call(POST(req("POST", "/api/notes", null, body)))).toMatchObject({ status: 401 })
    expect((await call(POST(req("POST", "/api/notes", SAM, body)))).status).toBe(200)
  })
})

describe("GET /api/me/activity", () => {
  it("my own rows always; other people's chosen names only while I'm still in that Pot", async () => {
    const { GET } = await import("@/app/api/me/activity/route")
    const mine = () => call(GET(req("GET", "/api/me/activity", MAYA)))
    const inPot = await mine()
    expect(inPot.status).toBe(200)
    expect(inPot.body.profiles).toEqual({ [SAM]: { name: "Sam Chosen" } })
    members = [SAM] // Maya leaves
    resetHub()
    const after = await mine()
    expect((after.body.items as { kind: string }[]).map((i) => i.kind)).toEqual(["voted"])
    expect(after.body.profiles).toEqual({})
    expect(leaks(after.body)).toEqual([])
    expect((await call(GET(req("GET", "/api/me/activity", null)))).status).toBe(401)
  })
})

describe("logs", () => {
  it("a failed query's values (what someone wrote) never reach the console or error_log", async () => {
    const lines: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")))
    try {
      const boom = route("POST /test", async () => {
        throw new DrizzleQueryError('insert into "request_comment" ("body") values ($1)', [SECRET.comment], new Error("connection reset"))
      })
      const res = await boom(new Request(`${ORIGIN}/test`, { method: "POST" }))
      expect(res.status).toBe(500)
      expect(JSON.stringify(await res.json())).not.toContain(SECRET.comment)
    } finally {
      spy.mockRestore()
    }
    expect(lines.join("\n")).toContain('insert into \\"request_comment\\"')
    expect(lines.join("\n")).not.toContain(SECRET.comment)
    const logged = await t.db.execute<{ detail: unknown }>("select detail from error_log" as never)
    expect(JSON.stringify(logged.rows)).not.toContain(SECRET.comment)
  })
})
