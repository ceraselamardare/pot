// Gifts, route-level (the real handlers with cookies, like server/features/privacy.test.ts): FLAG_GIFTS, sign-in and
// membership gates (403 before any read, the same answer whether the thing exists or not; a member who left), CSRF and
// strict bodies, and privacy: a giver's note or name reaches the Pot's members and the giver; the public landing and
// gift page carry only what the giver chose to show. Private DB: DATABASE_URL_TEST=…/pot_gifts.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { appUser, gift, giftLink, giftPage, pot } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { GIFT_LINK_TTL_MS, newGiftLinkId, newGiftRef } from "@/lib/gifts"
import { createHubReader } from "../../chain/hub"
import { setConfigForTests } from "../../config"
import { setHubForTests } from "../../deps"
import { createSession } from "../../session/store"
import { DAO, HUB } from "../../testing/delegates"
import { insertUser, seedChain, testConfig } from "../../testing/env"
import { FakeChain } from "../../testing/fakeChain"
import type { GiftChain } from "./chain"
import { setGiftChainForTests } from "./deps"

const MAYA = "maya.users.potapp.testnet" // member
const SAM = "sam.users.potapp.testnet" // member
const LEO = "leo.users.potapp.testnet" // was a member, left
const EVE = "eve.users.potapp.testnet" // a giver, never in the Pot
const ALEX = "alex.users.potapp.testnet" // another giver

const SECRET = {
  linkNote: "SECRET-LINKNOTE-boat", // a member's words for givers: public to link holders
  privNote: "SECRET-PRIVNOTE-love-you",
  privName: "SECRET-PRIVNAME-Grandma",
  pubNote: "PUBLIC-NOTE-have-fun",
  pubName: "PUBLIC-NAME-Ana",
  pendingName: "SECRET-PENDING-Pam",
}
const PRIVATE = [SECRET.privNote, SECRET.privName, SECRET.pendingName]
const leaks = (body: unknown) => PRIVATE.filter((m) => JSON.stringify(body).includes(m))

let t: TestDb
let members: string[]
const cookies: Record<string, string> = {}
let linkId: string
const fakeChain: GiftChain = { giftsOf: async () => null, goalCollecting: async () => false }

function resetHub() {
  const chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", () => members.map((account_id) => ({ account_id, status: "active", contributed: "150000000" })))
  setHubForTests(createHubReader(chain, HUB))
}

async function user(account: string, name: string) {
  const { user: u, device } = await insertUser(t.db, { account, key: KeyPair.fromRandom("ed25519") })
  await t.db.update(appUser).set({ displayName: name }).where(eq(appUser.id, u.id))
  const c = await createSession(t.db, { userId: u.id, kind: "near-auth", deviceId: device?.id })
  cookies[account] = `__Host-pot_session=${c.cookieValue}`
}

beforeAll(async () => {
  t = await createTestDb("gifts_routes")
  setDbForTests(t.db)
})
afterAll(async () => {
  setDbForTests(undefined)
  setHubForTests(undefined)
  setConfigForTests(undefined)
  setGiftChainForTests(undefined)
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  process.env.FLAG_GIFTS = "true"
  testConfig()
  setGiftChainForTests(fakeChain)
  members = [MAYA, SAM, LEO]
  resetHub()
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", emoji: "🇵🇹", preset: "trip", creatorAccount: MAYA })
  for (const [a, n] of [[MAYA, "Maya Member"], [SAM, "Sam Member"], [LEO, "Leo Left"], [EVE, "Eve Giver"], [ALEX, "Alex Giver"]] as const) await user(a, n)
  linkId = newGiftLinkId()
  await t.db.insert(giftLink).values({ id: linkId, potId: DAO, createdBy: MAYA, note: SECRET.linkNote, expiresAt: new Date(Date.now() + GIFT_LINK_TTL_MS) })
  await t.db.insert(giftPage).values({ potId: DAO, on: true, line: "Help us get to Lisbon" })
  const now = Date.now()
  await t.db.insert(gift).values([
    // through the link: never on the public page
    { ref: newGiftRef(), potId: DAO, linkId, giverAccount: EVE, displayName: SECRET.privName, note: SECRET.privNote, amount: "10000000", status: "received", receivedAt: new Date(now - 60_000) },
    // through the page, chose to be shown
    { ref: newGiftRef(), potId: DAO, giverAccount: ALEX, displayName: SECRET.pubName, note: SECRET.pubNote, showPublic: true, amount: "5000000", status: "received", receivedAt: new Date(now - 30_000) },
    // not sent yet
    { ref: newGiftRef(), potId: DAO, giverAccount: ALEX, displayName: SECRET.pendingName, showPublic: true, amount: "5000000" },
  ])
  members = [MAYA, SAM] // Leo left
  resetHub()
})

const ORIGIN = "https://pot.test"
const req = (method: string, path: string, who: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "203.0.113.7", ...(who ? { cookie: cookies[who]! } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const params = <P,>(p: P) => ({ params: Promise.resolve(p) })
async function call(res: Promise<Response>): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const r = await res
  return { status: r.status, body: (await r.json()) as Record<string, unknown>, headers: r.headers }
}

const routes = async () => ({
  links: await import("@/app/api/pots/[pot]/gift-links/route"),
  link: await import("@/app/api/pots/[pot]/gift-links/[id]/route"),
  gifts: await import("@/app/api/pots/[pot]/gifts/route"),
  page: await import("@/app/api/pots/[pot]/gift-page/route"),
  landing: await import("@/app/api/gift-links/[id]/route"),
  give: await import("@/app/api/give/[slug]/route"),
  start: await import("@/app/api/gifts/route"),
  patch: await import("@/app/api/gifts/[ref]/route"),
  mine: await import("@/app/api/me/gifts/route"),
})
const P = params({ pot: "lisbon-trip" })

describe("FLAG_GIFTS off", () => {
  it("every gifts route answers 404 not_found {cause: gifts_off_flag}", async () => {
    process.env.FLAG_GIFTS = "false"
    const r = await routes()
    const all = [
      r.links.GET(req("GET", "/x", MAYA), P),
      r.links.POST(req("POST", "/x", MAYA, {}), P),
      r.link.DELETE(req("DELETE", "/x", MAYA), params({ pot: "lisbon-trip", id: linkId })),
      r.gifts.GET(req("GET", "/x", MAYA), P),
      r.page.PUT(req("PUT", "/x", MAYA, { on: true }), P),
      r.landing.GET(req("GET", "/x", null), params({ id: linkId })),
      r.give.GET(req("GET", "/x", null), params({ slug: "lisbon-trip" })),
      r.start.POST(req("POST", "/x", EVE, { pot: "lisbon-trip", page: true, amount: "5000000", idempotencyKey: "a".repeat(16) })),
      r.patch.PATCH(req("PATCH", "/x", EVE, { name: "x" }), params({ ref: newGiftRef() })),
      r.mine.GET(req("GET", "/x", EVE)),
    ]
    for (const res of all) expect(await call(res)).toMatchObject({ status: 404, body: { reason: "not_found", detail: { cause: "gifts_off_flag" } } })
  })
})

describe("gates", () => {
  it("signed out: members' routes and the giver's routes → 401; public reads work", async () => {
    const r = await routes()
    expect((await call(r.links.GET(req("GET", "/x", null), P))).status).toBe(401)
    expect((await call(r.gifts.GET(req("GET", "/x", null), P))).status).toBe(401)
    expect((await call(r.links.POST(req("POST", "/x", null, {}), P))).status).toBe(401)
    expect((await call(r.page.PUT(req("PUT", "/x", null, { on: false }), P))).status).toBe(401)
    expect((await call(r.start.POST(req("POST", "/x", null, { pot: "lisbon-trip", page: true, amount: "5000000", idempotencyKey: "a".repeat(16) })))).status).toBe(401)
    expect((await call(r.mine.GET(req("GET", "/x", null)))).status).toBe(401)
    expect((await call(r.landing.GET(req("GET", "/x", null), params({ id: linkId })))).status).toBe(200)
    expect((await call(r.give.GET(req("GET", "/x", null), params({ slug: "lisbon-trip" })))).status).toBe(200)
  })

  it("outsiders and the member who left → 403 not_a_member on every members' route, before any read (a missing link answers the same)", async () => {
    const r = await routes()
    for (const who of [EVE, LEO]) {
      for (const res of [
        r.links.GET(req("GET", "/x", who), P),
        r.links.POST(req("POST", "/x", who, { note: "hi" }), P),
        r.link.DELETE(req("DELETE", "/x", who), params({ pot: "lisbon-trip", id: linkId })),
        r.link.DELETE(req("DELETE", "/x", who), params({ pot: "lisbon-trip", id: newGiftLinkId() })),
        r.gifts.GET(req("GET", "/x", who), P),
        r.page.PUT(req("PUT", "/x", who, { on: false }), P),
      ]) {
        const c = await call(res)
        expect(c).toMatchObject({ status: 403, body: { reason: "not_a_member" } })
        expect(leaks(c.body)).toEqual([])
        expect(JSON.stringify(c.body)).not.toContain(SECRET.linkNote)
      }
    }
    expect((await t.db.select().from(giftLink))[0]!.revokedAt).toBeNull()
    expect((await t.db.select().from(giftPage))[0]!.on).toBe(true)
  })

  it("writes need same-origin JSON and a strict body", async () => {
    const r = await routes()
    expect(await call(r.links.POST(req("POST", "/x", MAYA, {}, { origin: "https://evil.example" }), P))).toMatchObject({ status: 403, body: { reason: "forbidden_origin" } })
    expect(await call(r.links.POST(req("POST", "/x", MAYA, { note: "hi", extra: 1 }), P))).toMatchObject({ status: 400, body: { reason: "bad_request" } })
    expect(await call(r.start.POST(req("POST", "/x", EVE, { pot: "lisbon-trip", page: true, amount: "5000000" })))).toMatchObject({ status: 400 })
    expect(await call(r.patch.PATCH(req("PATCH", "/x", EVE, {}), params({ ref: newGiftRef() })))).toMatchObject({ status: 400 })
    expect(await call(r.page.PUT(req("PUT", "/x", MAYA, { on: "yes" }), P))).toMatchObject({ status: 400 })
  })

  it("a member creates (201), lists, revokes a link; a giver starts (201) and replays (200)", async () => {
    const r = await routes()
    const made = await call(r.links.POST(req("POST", "/x", MAYA, { amount: "25000000", reusable: false }), P))
    expect(made).toMatchObject({ status: 201, body: { ok: true, link: { amount: "25000000", reusable: false, status: "active" } } })
    const id = (made.body.link as { id: string }).id
    expect(((await call(r.links.GET(req("GET", "/x", SAM), P))).body.links as unknown[]).length).toBe(2)
    const body = { pot: "lisbon-trip", linkId: id, amount: "25000000", idempotencyKey: "b".repeat(16) }
    const a = await call(r.start.POST(req("POST", "/x", EVE, body)))
    expect(a).toMatchObject({ status: 201, body: { gift: { pot: DAO, amount: "25000000" } } })
    expect(await call(r.start.POST(req("POST", "/x", EVE, body)))).toMatchObject({ status: 200, body: { replayed: true, gift: { ref: (a.body.gift as { ref: string }).ref } } })
    expect(await call(r.start.POST(req("POST", "/x", ALEX, { ...body, idempotencyKey: "c".repeat(16) })))).toMatchObject({ status: 409, body: { reason: "action_not_allowed", detail: { cause: "link_used" } } })
    expect(await call(r.link.DELETE(req("DELETE", "/x", SAM), params({ pot: "lisbon-trip", id })))).toMatchObject({ status: 200, body: { link: { status: "revoked" } } })
    expect(await call(r.start.POST(req("POST", "/x", EVE, { ...body, idempotencyKey: "d".repeat(16) })))).toMatchObject({ status: 409, body: { detail: { cause: "link_revoked" } } })
  })
})

describe("privacy", () => {
  it("the public landing: the Pot's ledger facts, the link's own note; never a giver's name or note, never a member's name", async () => {
    const r = await routes()
    const c = await call(r.landing.GET(req("GET", "/x", null), params({ id: linkId })))
    expect(c.status).toBe(200)
    expect(c.headers.get("cache-control")).toBe("private, no-store")
    expect(c.body).toMatchObject({ link: { id: linkId, note: SECRET.linkNote, status: "active", amount: null }, pot: { name: "Lisbon Trip", members: 2, status: "open" }, taking: "yes" })
    expect(leaks(c.body)).toEqual([])
    expect(JSON.stringify(c.body)).not.toMatch(/Maya Member|Sam Member|PUBLIC-/)
    expect(await call(r.landing.GET(req("GET", "/x", null), params({ id: newGiftLinkId() })))).toMatchObject({ status: 404, body: { detail: { cause: "link_unknown" } } })
  })

  it("the public gift page: only givers who chose to be shown; nothing but the Pot while it's off", async () => {
    const r = await routes()
    const on = await call(r.give.GET(req("GET", "/x", EVE), params({ slug: "lisbon-trip" })))
    expect(on.headers.get("cache-control")).toBe("private, no-store")
    expect(on.body).toMatchObject({ page: { on: true, line: "Help us get to Lisbon" }, totals: { amount: "15000000", count: 2 } })
    expect(on.body.givers).toEqual([{ name: SECRET.pubName, note: SECRET.pubNote, amount: "5000000", at: expect.any(String) }])
    expect(leaks(on.body)).toEqual([])
    await t.db.update(giftPage).set({ on: false })
    const off = await call(r.give.GET(req("GET", "/x", null), params({ slug: "lisbon-trip" })))
    expect(Object.keys(off.body).sort()).toEqual(["ok", "page", "pot", "requestId"])
    expect(JSON.stringify(off.body)).not.toMatch(/SECRET|PUBLIC|Help us/)
    expect(await call(r.give.GET(req("GET", "/x", null), params({ slug: "nope-pot" })))).toMatchObject({ status: 404, body: { detail: { cause: "pot_unknown" } } })
  })

  it("members read every note and name; the giver reads their own (and only theirs) in /api/me/gifts", async () => {
    const r = await routes()
    const m = await call(r.gifts.GET(req("GET", "/x", SAM), P))
    expect(m.status).toBe(200)
    expect(JSON.stringify(m.body)).toContain(SECRET.privNote)
    expect(JSON.stringify(m.body)).toContain(SECRET.privName)
    expect(JSON.stringify(m.body)).not.toContain(SECRET.pendingName) // received gifts only
    const eve = await call(r.mine.GET(req("GET", "/x", EVE)))
    expect(eve.status).toBe(200)
    expect(JSON.stringify(eve.body)).toContain(SECRET.privNote)
    expect(JSON.stringify(eve.body)).not.toMatch(/PUBLIC-|SECRET-PENDING/)
    const maya = await call(r.mine.GET(req("GET", "/x", MAYA)))
    expect(maya.body.gifts).toEqual([])
  })

  it("the giver edits only their own gift (someone else's → 404)", async () => {
    const r = await routes()
    const [mine] = await t.db.select().from(gift).where(eq(gift.giverAccount, EVE))
    expect(await call(r.patch.PATCH(req("PATCH", "/x", ALEX, { note: "mine now" }), params({ ref: mine!.ref })))).toMatchObject({ status: 404 })
    expect(await call(r.patch.PATCH(req("PATCH", "/x", EVE, { note: "edited" }), params({ ref: mine!.ref })))).toMatchObject({ status: 200, body: { gift: { note: "edited" } } })
  })

  it("public reads: 120/min per IP (here 2) → 429 rate_limited", async () => {
    process.env.QUOTA_GIFTS_IP_READ = "2"
    const r = await routes()
    const get = () => call(r.landing.GET(req("GET", "/x", null), params({ id: linkId })))
    expect((await get()).status).toBe(200)
    expect((await call(r.give.GET(req("GET", "/x", null), params({ slug: "lisbon-trip" })))).status).toBe(200)
    expect(await get()).toMatchObject({ status: 429, body: { reason: "rate_limited" } })
  })
})
