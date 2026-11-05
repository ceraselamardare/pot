// Gifts (server/features/gifts): gift links, starting a gift, the giver's edits and list, the public resolvers, the
// relayer's pre-flight (validateGiftRef) and the received hook (onGiftReceived + push), the quotas and the DB CHECKs.
// Against a private Postgres (DATABASE_URL_TEST=…/pot_gifts) with a FakeChain hub and a fake GiftChain.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appUser, gift, giftLink, giftPage, pot } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { GIFT_LINK_ID_RE, GIFT_LINK_TTL_MS, GIFT_REF_RE, giftMsg, newGiftLinkId, newGiftRef } from "@/lib/gifts"
import { createHubReader } from "../../chain/hub"
import type { Config } from "../../config"
import { eventsToNotifications } from "../../notify/notify"
import { topic } from "../../notify/payload"
import { saveSubscription } from "../../notify/subscriptions"
import type { PushResult, PushSender } from "../../notify/webpush"
import { createSession, loadSession, type SessionCtx } from "../../session/store"
import { DAO, HUB } from "../../testing/delegates"
import { insertUser, potView, seedChain, testConfig } from "../../testing/env"
import { FakeChain } from "../../testing/fakeChain"
import { createGiftChain, parseGetGifts, parseGiftsView, type GiftChain } from "./chain"
import type { GiftDeps } from "./core"
import { myGifts, patchGift, startGift } from "./giver"
import { createGiftLink, listGiftLinks, listPotGifts, putGiftPage, revokeGiftLink } from "./members"
import { resolveGiftLanding, resolveGiftPage } from "./public"
import { onGiftReceived } from "./received"
import { giftRefValidator, markGiftFailed, validateGiftRef } from "./validate"

let t: TestDb
let cfg: Config
let chain: FakeChain
let potStatus: "open" | "closing" | "closed"
const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const LEO = "leo.users.potapp.testnet"
const EVE = "eve.users.potapp.testnet" // not a member: a giver
const ALEX = "alex.users.potapp.testnet" // not a member: another giver
const OTHER = `other-pot.${HUB}`
let members: { account_id: string; status: string }[]
let giftsView: { on: boolean; total: bigint; count: number } | null
let goal: boolean
const fakeChain: GiftChain = { giftsOf: async () => giftsView, goalCollecting: async () => goal }
const IP = { ipHash: "ip-1" }
const $ = (n: number) => String(n * 1_000_000)
let clock: number

beforeAll(async () => {
  t = await createTestDb("gifts")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  process.env.FLAG_GIFTS = "true"
  cfg = testConfig()
  potStatus = "open"
  giftsView = null
  goal = false
  clock = Date.now()
  members = [MAYA, SAM, LEO].map((a) => ({ account_id: a, status: "active", contributed: "150000000" }))
  chain = seedChain(new FakeChain())
  chain.view(HUB, "get_pot", (a) => (a.pot === DAO ? { ...potView(), status: potStatus } : null))
  chain.view(HUB, "get_members", (a) => (a.pot === DAO ? members : []))
  await t.db.insert(pot).values([
    { daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", emoji: "🇵🇹", preset: "trip", creatorAccount: MAYA },
    { daoId: OTHER, slug: "other-pot", hubId: HUB, name: "Other", preset: "trip", creatorAccount: SAM },
  ])
})

const deps = (): GiftDeps => ({ db: t.db, hub: createHubReader(chain, HUB), cfg, chain: fakeChain, now: () => clock })

async function sessionFor(account: string, name = "Someone Here"): Promise<SessionCtx> {
  const existing = (await t.db.select().from(appUser).where(eq(appUser.nearAccount, account)))[0]
  let userId = existing?.id
  let deviceId: string | undefined
  if (!existing) {
    const { user, device } = await insertUser(t.db, { account, key: KeyPair.fromRandom("ed25519") })
    await t.db.update(appUser).set({ displayName: name }).where(eq(appUser.id, user.id))
    userId = user.id
    deviceId = device?.id
  }
  const s = await createSession(t.db, { userId: userId!, kind: "near-auth", deviceId })
  return (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie: `__Host-pot_session=${s.cookieValue}` } }), cfg))!
}

let keyN = 0
const key = () => `k${String(++keyN).padStart(15, "0")}`
const mkLink = (s: SessionCtx, body: Parameters<typeof createGiftLink>[3] = {}, potParam = "lisbon-trip") => createGiftLink(deps(), s, potParam, body)
const give = (s: SessionCtx, body: Partial<Parameters<typeof startGift>[2]>, ip = IP) =>
  startGift(deps(), s, { pot: "lisbon-trip", amount: $(5), idempotencyKey: key(), ...body } as Parameters<typeof startGift>[2], ip)
const linkRow = async (over: Partial<typeof giftLink.$inferInsert> = {}) =>
  (
    await t.db
      .insert(giftLink)
      .values({ id: newGiftLinkId(), potId: DAO, createdBy: MAYA, expiresAt: new Date(clock + GIFT_LINK_TTL_MS), ...over })
      .returning()
  )[0]!
const giftRow = async (over: Partial<typeof gift.$inferInsert> = {}) =>
  (await t.db.insert(gift).values({ ref: newGiftRef(), potId: DAO, giverAccount: EVE, amount: $(5), ...over }).returning())[0]!
const pageOn = (on = true, line: string | null = null) => t.db.insert(giftPage).values({ potId: DAO, on, line }).onConflictDoUpdate({ target: giftPage.potId, set: { on, line } })

describe("gift links (members)", () => {
  it("a member makes a link: reusable by default, the giver chooses, 14 days; it lists; a retry replays", async () => {
    const maya = await sessionFor(MAYA)
    const k = key()
    const a = await mkLink(maya, { note: "  Thanks  for   the   coffee ", idempotencyKey: k })
    expect(a.status).toBe(201)
    expect(a.link).toMatchObject({ pot: DAO, slug: "lisbon-trip", createdBy: MAYA, amount: null, note: "Thanks for the coffee", tone: "payment", reusable: true, uses: 0, status: "active", revokedAt: null })
    expect(a.link.id).toMatch(GIFT_LINK_ID_RE)
    expect(new Date(a.link.expiresAt).getTime()).toBe(clock + GIFT_LINK_TTL_MS)
    const b = await mkLink(maya, { note: "Thanks for the coffee", idempotencyKey: k })
    expect(b).toMatchObject({ status: 200, replayed: true, link: { id: a.link.id } })
    await expect(mkLink(maya, { note: "other", idempotencyKey: k })).rejects.toMatchObject({ reason: "idempotency_conflict" })
    // "pay in": the tone is part of the request (a retry with another tone is a conflict)
    await expect(mkLink(maya, { note: "Thanks for the coffee", tone: "gift", idempotencyKey: k })).rejects.toMatchObject({ reason: "idempotency_conflict" })
    const gifty = await mkLink(maya, { tone: "gift" })
    expect(gifty.link.tone).toBe("gift")
    await revokeGiftLink(deps(), maya, "lisbon-trip", gifty.link.id)
    const fixed = await mkLink(maya, { amount: $(25), reusable: false })
    expect(fixed.link).toMatchObject({ amount: $(25), reusable: false })
    expect((await listGiftLinks(deps(), await sessionFor(SAM), DAO)).links.map((l) => l.id)).toEqual([fixed.link.id, a.link.id])
  })

  it.each([
    [{ amount: "999999" }, "amount_too_low"],
    [{ amount: "10000000001" }, "amount_too_high"],
    [{ note: "x".repeat(141) }, "bad_request"],
    [{ note: "bell\u0007" }, "bad_request"],
  ])("refuses %j → %s, nothing stored", async (body, reason) => {
    await expect(mkLink(await sessionFor(MAYA), body)).rejects.toMatchObject({ reason })
    expect(await t.db.select().from(giftLink)).toHaveLength(0)
  })

  it("outsiders and joining members can't make, list or revoke links (403 before any read), even for a link that doesn't exist", async () => {
    const l = await linkRow()
    members = [...members, { account_id: ALEX, status: "joining" }]
    for (const who of [EVE, ALEX]) {
      const s = await sessionFor(who)
      await expect(mkLink(s)).rejects.toMatchObject({ reason: "not_a_member", status: 403 })
      await expect(listGiftLinks(deps(), s, "lisbon-trip")).rejects.toMatchObject({ reason: "not_a_member" })
      await expect(revokeGiftLink(deps(), s, "lisbon-trip", l.id)).rejects.toMatchObject({ reason: "not_a_member" })
      await expect(revokeGiftLink(deps(), s, "lisbon-trip", newGiftLinkId())).rejects.toMatchObject({ reason: "not_a_member" })
      await expect(listPotGifts(deps(), s, "lisbon-trip")).rejects.toMatchObject({ reason: "not_a_member" })
      await expect(putGiftPage(deps(), s, "lisbon-trip", { on: true })).rejects.toMatchObject({ reason: "not_a_member" })
    }
    expect(await t.db.select().from(giftLink)).toHaveLength(1)
    expect(await t.db.select().from(giftPage)).toHaveLength(0)
  })

  it("a closed Pot gets no new links", async () => {
    potStatus = "closed"
    await expect(mkLink(await sessionFor(MAYA))).rejects.toMatchObject({ reason: "pot_closed" })
  })

  it("the list leaves out revoked, expired and used one-time links", async () => {
    const ok = await linkRow({ createdAt: new Date(clock - 1000) })
    await linkRow({ revokedAt: new Date(clock) })
    await linkRow({ expiresAt: new Date(clock - 1) })
    await linkRow({ reusable: false, uses: 1 })
    const reused = await linkRow({ uses: 3 })
    expect((await listGiftLinks(deps(), await sessionFor(SAM), "lisbon-trip")).links.map((l) => l.id).sort()).toEqual([ok.id, reused.id].sort())
  })

  it("any member revokes any link of the Pot, idempotently; another Pot's link is not found", async () => {
    const l = await linkRow()
    const sam = await sessionFor(SAM)
    const r = await revokeGiftLink(deps(), sam, "lisbon-trip", l.id)
    expect(r.link).toMatchObject({ id: l.id, status: "revoked" })
    const again = await revokeGiftLink(deps(), sam, "lisbon-trip", l.id)
    expect(again.link.revokedAt).toBe(r.link.revokedAt)
    expect((await t.db.select().from(giftLink).where(eq(giftLink.id, l.id)))[0]!.revokedBy).toBe(SAM)
    const other = await linkRow({ potId: OTHER })
    await expect(revokeGiftLink(deps(), sam, "lisbon-trip", other.id)).rejects.toMatchObject({ reason: "not_found", detail: { cause: "link_unknown" } })
    await expect(revokeGiftLink(deps(), sam, "lisbon-trip", "nope")).rejects.toMatchObject({ reason: "not_found" })
  })

  it("burst (per minute) → rate_limited; daily → quota_exceeded family gifts", async () => {
    const maya = await sessionFor(MAYA)
    process.env.QUOTA_GIFTS_USER_LINK_BURST = "2"
    await mkLink(maya)
    await mkLink(maya)
    await expect(mkLink(maya)).rejects.toMatchObject({ reason: "rate_limited", status: 429 })
    delete process.env.QUOTA_GIFTS_USER_LINK_BURST
    process.env.QUOTA_GIFTS_USER_LINK = "2"
    await expect(mkLink(maya)).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "gifts", limit: "2" } })
    expect(await t.db.select().from(giftLink)).toHaveLength(2)
  })
})

describe("the gift page switch", () => {
  it("off by default; on with a line; absent line keeps it; null removes it; too long → bad_request", async () => {
    const maya = await sessionFor(MAYA)
    expect((await listPotGifts(deps(), maya, "lisbon-trip")).page).toEqual({ on: false, line: null, tone: "payment" })
    expect((await putGiftPage(deps(), maya, "lisbon-trip", { on: true, line: "  Help us   get to Lisbon " })).page).toEqual({ on: true, line: "Help us get to Lisbon", tone: "payment" })
    expect((await putGiftPage(deps(), maya, "lisbon-trip", { on: false })).page).toEqual({ on: false, line: "Help us get to Lisbon", tone: "payment" })
    expect((await putGiftPage(deps(), maya, "lisbon-trip", { on: true, line: "" })).page).toEqual({ on: true, line: null, tone: "payment" })
    // "pay in": the page's tone (absent = keep)
    expect((await putGiftPage(deps(), maya, "lisbon-trip", { on: true, tone: "gift" })).page).toEqual({ on: true, line: null, tone: "gift" })
    expect((await putGiftPage(deps(), maya, "lisbon-trip", { on: true })).page).toEqual({ on: true, line: null, tone: "gift" })
    await expect(putGiftPage(deps(), maya, "lisbon-trip", { on: true, line: "x".repeat(101) })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "line" } })
    process.env.QUOTA_GIFTS_USER_PAGE = "5"
    await expect(putGiftPage(deps(), maya, "lisbon-trip", { on: true })).rejects.toMatchObject({ reason: "quota_exceeded" })
  })
})

describe("starting a gift", () => {
  it("through an open link, by someone outside the Pot: 201 with a ref and the hub msg; a retry replays", async () => {
    const l = await linkRow()
    const eve = await sessionFor(EVE, "Eve")
    const k = key()
    const a = await give(eve, { linkId: l.id, amount: $(10), name: "  Aunt Eve ", note: "For the boat", showPublic: true, idempotencyKey: k })
    expect(a.status).toBe(201)
    expect(a.gift.ref).toMatch(GIFT_REF_RE)
    expect(a.gift).toMatchObject({ pot: DAO, amount: $(10), msg: giftMsg(DAO, a.gift.ref) })
    expect(JSON.parse(a.gift.msg)).toEqual({ pot: DAO, gift: a.gift.ref })
    const row = (await t.db.select().from(gift).where(eq(gift.ref, a.gift.ref)))[0]!
    // "show my name" exists only on the public page: forced off for a link
    expect(row).toMatchObject({ status: "pending", linkId: l.id, giverAccount: EVE, displayName: "Aunt Eve", note: "For the boat", showPublic: false })
    const b = await give(eve, { linkId: l.id, amount: $(10), name: "Aunt Eve", note: "For the boat", showPublic: true, idempotencyKey: k })
    expect(b).toMatchObject({ status: 200, replayed: true, gift: { ref: a.gift.ref } })
    await expect(give(eve, { linkId: l.id, amount: $(11), name: "Aunt Eve", note: "For the boat", idempotencyKey: k })).rejects.toMatchObject({ reason: "idempotency_conflict" })
  })

  it("keeps the words it came with: the link's tone, or the page's (a snapshot on the gift row)", async () => {
    const eve = await sessionFor(EVE, "Eve")
    const viaGift = await give(eve, { linkId: (await linkRow({ tone: "gift" })).id })
    const viaPay = await give(eve, { linkId: (await linkRow()).id })
    await t.db.insert(giftPage).values({ potId: DAO, on: true, tone: "gift" })
    const viaPage = await give(eve, { page: true })
    const toneOf = async (ref: string) => (await t.db.select().from(gift).where(eq(gift.ref, ref)))[0]!.tone
    expect(await toneOf(viaGift.gift.ref)).toBe("gift")
    expect(await toneOf(viaPay.gift.ref)).toBe("payment")
    expect(await toneOf(viaPage.gift.ref)).toBe("gift")
    // a later change to the page doesn't rewrite it
    await t.db.update(giftPage).set({ tone: "payment" }).where(eq(giftPage.potId, DAO))
    expect(await toneOf(viaPage.gift.ref)).toBe("gift")
  })

  it("exactly one of linkId / page", async () => {
    const eve = await sessionFor(EVE)
    await expect(give(eve, {})).rejects.toMatchObject({ reason: "bad_request", detail: { cause: "link_or_page" } })
    await expect(give(eve, { linkId: (await linkRow()).id, page: true })).rejects.toMatchObject({ reason: "bad_request" })
  })

  it("unknown link, another Pot's link → not_found link_unknown; revoked / expired / used → action_not_allowed with the cause", async () => {
    const eve = await sessionFor(EVE)
    await expect(give(eve, { linkId: newGiftLinkId() })).rejects.toMatchObject({ reason: "not_found", detail: { cause: "link_unknown" } })
    await expect(give(eve, { linkId: (await linkRow({ potId: OTHER })).id })).rejects.toMatchObject({ reason: "not_found", detail: { cause: "link_unknown" } })
    await expect(give(eve, { linkId: (await linkRow({ revokedAt: new Date(clock) })).id })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "link_revoked" } })
    await expect(give(eve, { linkId: (await linkRow({ expiresAt: new Date(clock - 1) })).id })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "link_expired" } })
    await expect(give(eve, { linkId: (await linkRow({ reusable: false, uses: 1 })).id })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "link_used" } })
    const once = await linkRow({ reusable: false })
    await giftRow({ linkId: once.id, status: "received", giverAccount: ALEX })
    await expect(give(eve, { linkId: once.id })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "link_used" } })
    expect(await t.db.select().from(gift)).toHaveLength(1)
  })

  it("a fixed-amount link takes exactly its amount", async () => {
    const l = await linkRow({ amount: $(25) })
    const eve = await sessionFor(EVE)
    await expect(give(eve, { linkId: l.id, amount: $(5) })).rejects.toMatchObject({ reason: "args_invalid", detail: { cause: "fixed_amount", amount: $(25) } })
    expect((await give(eve, { linkId: l.id, amount: $(25) })).status).toBe(201)
  })

  it("amount bounds: < $1 → amount_too_low, > $10,000 → amount_too_high", async () => {
    const l = await linkRow()
    const eve = await sessionFor(EVE)
    await expect(give(eve, { linkId: l.id, amount: "999999" })).rejects.toMatchObject({ reason: "amount_too_low", detail: { min: "1000000" } })
    await expect(give(eve, { linkId: l.id, amount: "10000000001" })).rejects.toMatchObject({ reason: "amount_too_high", detail: { max: "10000000000" } })
    expect((await give(eve, { linkId: l.id, amount: "1000000" })).status).toBe(201)
    expect((await give(eve, { linkId: l.id, amount: "10000000000" })).status).toBe(201)
  })

  it("the public page: off → not_found page_off; on → 201 and 'show my name' is kept", async () => {
    const eve = await sessionFor(EVE)
    await expect(give(eve, { page: true })).rejects.toMatchObject({ reason: "not_found", detail: { cause: "page_off" } })
    await pageOn()
    const r = await give(eve, { page: true, name: "Eve", showPublic: true })
    expect((await t.db.select().from(gift).where(eq(gift.ref, r.gift.ref)))[0]).toMatchObject({ linkId: null, showPublic: true, displayName: "Eve" })
  })

  it("the Pot must be taking gifts: off → gifts_off, all-or-nothing goal → goal_collecting, closed → pot_closed", async () => {
    const l = await linkRow()
    const eve = await sessionFor(EVE)
    giftsView = { on: false, total: 0n, count: 0 }
    await expect(give(eve, { linkId: l.id })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "gifts_off" } })
    giftsView = { on: true, total: 0n, count: 0 }
    goal = true
    await expect(give(eve, { linkId: l.id })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "goal_collecting" } })
    goal = false
    potStatus = "closing"
    await expect(give(eve, { linkId: l.id })).rejects.toMatchObject({ reason: "pot_closed" })
    potStatus = "open"
    giftsView = null // unknown (hub 1.1.0): treated as on
    expect((await give(eve, { linkId: l.id })).status).toBe(201)
  })

  it("a one-time link is held for 10 minutes by a pending gift; its own giver may start again", async () => {
    const l = await linkRow({ reusable: false })
    const eve = await sessionFor(EVE)
    const alex = await sessionFor(ALEX)
    const first = await give(eve, { linkId: l.id })
    await expect(give(alex, { linkId: l.id })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "link_used" } })
    expect((await give(eve, { linkId: l.id })).status).toBe(201)
    await t.db.update(gift).set({ createdAt: new Date(clock - 11 * 60_000) }).where(eq(gift.linkId, l.id))
    expect((await give(alex, { linkId: l.id })).status).toBe(201)
    expect(first.gift.ref).toMatch(GIFT_REF_RE)
  })

  it("APP-6: a one-time link has at most one live ref; the giver's retry supersedes their earlier one", async () => {
    const l = await linkRow({ reusable: false })
    const eve = await sessionFor(EVE)
    const first = await give(eve, { linkId: l.id })
    const second = await give(eve, { linkId: l.id })
    // the relayer's pre-flight now passes only the newest ref through this link
    expect(await validateGiftRef(t.db, { pot: DAO, ref: first.gift.ref, amount: $(5), sender: EVE }, clock)).toEqual({
      ok: false,
      why: "not_pending",
    })
    expect(await validateGiftRef(t.db, { pot: DAO, ref: second.gift.ref, amount: $(5), sender: EVE }, clock)).toMatchObject({ ok: true })
    // a reusable link keeps every pending gift
    const many = await linkRow()
    const a = await give(eve, { linkId: many.id })
    const b = await give(eve, { linkId: many.id })
    for (const r of [a, b])
      expect(await validateGiftRef(t.db, { pot: DAO, ref: r.gift.ref, amount: $(5), sender: EVE }, clock)).toMatchObject({ ok: true })
  })

  it("name and note are cleaned; too long or control characters → bad_request", async () => {
    const l = await linkRow()
    const eve = await sessionFor(EVE)
    await expect(give(eve, { linkId: l.id, note: "x".repeat(141) })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "note", why: "length" } })
    await expect(give(eve, { linkId: l.id, name: "x".repeat(41) })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "name" } })
    await expect(give(eve, { linkId: l.id, name: "rtl ‮ x" })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "name", why: "format" } })
    const r = await give(eve, { linkId: l.id, name: "", note: "   " })
    expect((await t.db.select().from(gift).where(eq(gift.ref, r.gift.ref)))[0]).toMatchObject({ displayName: null, note: null })
  })

  it("limits: per-minute burst, daily per person, per IP, per Pot", async () => {
    const l = await linkRow()
    const eve = await sessionFor(EVE)
    const alex = await sessionFor(ALEX)
    process.env.QUOTA_GIFTS_USER_START_BURST = "2"
    await give(eve, { linkId: l.id })
    await give(eve, { linkId: l.id })
    await expect(give(eve, { linkId: l.id })).rejects.toMatchObject({ reason: "rate_limited", status: 429 })
    delete process.env.QUOTA_GIFTS_USER_START_BURST
    process.env.QUOTA_GIFTS_USER_START = "2"
    await expect(give(eve, { linkId: l.id })).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "gifts" } })
    delete process.env.QUOTA_GIFTS_USER_START
    process.env.QUOTA_GIFTS_IP_START = "3"
    await give(alex, { linkId: l.id })
    await expect(give(alex, { linkId: l.id })).rejects.toMatchObject({ reason: "quota_exceeded" })
    expect((await give(alex, { linkId: l.id }, { ipHash: "ip-2" })).status).toBe(201)
    process.env.QUOTA_GIFTS_POT_START = "4"
    await expect(give(alex, { linkId: l.id }, { ipHash: "ip-3" })).rejects.toMatchObject({ reason: "quota_exceeded" })
    expect(await t.db.select().from(gift)).toHaveLength(4)
  })
})

describe("the giver's own gifts", () => {
  it("PATCH: only the giver; 'show my name' only on a page gift; GET /api/me/gifts lists mine with my notes", async () => {
    const eve = await sessionFor(EVE)
    const alex = await sessionFor(ALEX)
    await pageOn()
    const viaLink = await give(eve, { linkId: (await linkRow()).id, note: "link note" })
    const viaPage = await give(eve, { page: true, note: "page note" })
    await expect(patchGift(deps(), alex, viaPage.gift.ref, { name: "Alex" })).rejects.toMatchObject({ reason: "not_found" })
    await expect(patchGift(deps(), eve, viaLink.gift.ref, { showPublic: true })).rejects.toMatchObject({ reason: "args_invalid", detail: { cause: "page_only" } })
    const p = await patchGift(deps(), eve, viaPage.gift.ref, { name: " Eve ", showPublic: true })
    expect(p.gift).toMatchObject({ ref: viaPage.gift.ref, slug: "lisbon-trip", potName: "Lisbon Trip", potEmoji: "🇵🇹", name: "Eve", note: "page note", showPublic: true, status: "pending" })
    expect((await patchGift(deps(), eve, viaPage.gift.ref, { note: null })).gift.note).toBeNull()
    // a stale pending gift (over a day) is left out; another person's gift never shows
    await giftRow({ createdAt: new Date(clock - 2 * 86_400_000) })
    await giftRow({ giverAccount: ALEX, note: "alex's" })
    const mine = await myGifts(deps(), eve)
    expect(mine.gifts.map((g) => g.ref).sort()).toEqual([viaLink.gift.ref, viaPage.gift.ref].sort())
    expect(mine.gifts.find((g) => g.ref === viaLink.gift.ref)?.note).toBe("link note")
  })
})

describe("validateGiftRef (the relayer's pre-flight)", () => {
  it("every reason", async () => {
    const l = await linkRow()
    const g = await giftRow({ linkId: l.id, giverAccount: EVE })
    const v = (q: Partial<Parameters<typeof validateGiftRef>[1]>) => validateGiftRef(t.db, { pot: DAO, ref: g.ref, amount: $(5), sender: EVE, ...q }, clock)
    expect(await v({})).toEqual({ ok: true, linkId: l.id })
    expect(await v({ amount: 5_000_000n, sender: undefined })).toEqual({ ok: true, linkId: l.id })
    expect(await v({ ref: "nope" })).toEqual({ ok: false, why: "unknown_ref" })
    expect(await v({ ref: newGiftRef() })).toEqual({ ok: false, why: "unknown_ref" })
    expect(await v({ pot: OTHER })).toEqual({ ok: false, why: "wrong_pot" })
    expect(await v({ amount: $(6) })).toEqual({ ok: false, why: "wrong_amount" })
    expect(await v({ amount: "x" })).toEqual({ ok: false, why: "wrong_amount" })
    expect(await v({ sender: ALEX })).toEqual({ ok: false, why: "wrong_sender" })
    process.env.FLAG_GIFTS = "0"
    expect(await v({})).toEqual({ ok: false, why: "unknown_ref" })
    process.env.FLAG_GIFTS = "1"
    await t.db.update(giftLink).set({ revokedAt: new Date(clock) }).where(eq(giftLink.id, l.id))
    expect(await v({})).toEqual({ ok: false, why: "link_revoked" })
    await t.db.update(giftLink).set({ revokedAt: null, expiresAt: new Date(clock - 1) }).where(eq(giftLink.id, l.id))
    expect(await v({})).toEqual({ ok: false, why: "link_expired" })
    await t.db.update(giftLink).set({ expiresAt: new Date(clock + 1000), reusable: false, uses: 1 }).where(eq(giftLink.id, l.id))
    expect(await v({})).toEqual({ ok: false, why: "link_used" })
    await t.db.update(giftLink).set({ uses: 0 }).where(eq(giftLink.id, l.id))
    expect(await v({})).toEqual({ ok: true, linkId: l.id })
    await giftRow({ linkId: l.id, giverAccount: ALEX, status: "received" })
    expect(await v({})).toEqual({ ok: false, why: "link_used" })
    // not pending: received, failed, or stale
    for (const status of ["received", "failed"] as const) {
      const x = await giftRow({ status })
      expect(await validateGiftRef(t.db, { pot: DAO, ref: x.ref, amount: $(5) }, clock)).toEqual({ ok: false, why: "not_pending" })
    }
    const stale = await giftRow({ createdAt: new Date(clock - 86_400_001) })
    expect(await validateGiftRef(t.db, { pot: DAO, ref: stale.ref, amount: $(5) }, clock)).toEqual({ ok: false, why: "not_pending" })
    // page gifts: the page must still be on
    const pg = await giftRow()
    const check = giftRefValidator(t.db)
    expect(await check(DAO, pg.ref, $(5), EVE)).toEqual({ ok: false, why: "page_off" })
    await pageOn()
    expect(await check(DAO, pg.ref, $(5), EVE)).toEqual({ ok: true, linkId: null })
    expect(await check(DAO, pg.ref, $(5))).toEqual({ ok: true, linkId: null })
    expect(await check(DAO, pg.ref, $(5), ALEX)).toEqual({ ok: false, why: "wrong_sender" })
  })

  it("markGiftFailed: pending → failed once", async () => {
    const g = await giftRow()
    expect(await markGiftFailed(t.db, g.ref)).toBe(true)
    expect(await markGiftFailed(t.db, g.ref)).toBe(false)
    expect(await markGiftFailed(t.db, "nope")).toBe(false)
    expect((await t.db.select().from(gift).where(eq(gift.ref, g.ref)))[0]!.status).toBe("failed")
  })
})

describe("onGiftReceived", () => {
  async function subscribe(...who: [string, string][]) {
    for (const [account, name] of who) {
      const s = await sessionFor(account, name)
      await saveSubscription(t.db, s, {
        subscription: { endpoint: `https://fcm.googleapis.com/${name.toLowerCase()}`, expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } },
        standalone: true,
        platform: "ios",
      })
    }
  }
  const pushes: { endpoint: string; json: string; opts: unknown }[] = []
  const sender: PushSender = { send: async (target, json, opts) => (pushes.push({ endpoint: target.endpoint, json, opts }), { status: 201 } as PushResult) }
  const rd = () => ({ db: t.db, hub: createHubReader(chain, HUB), cfg, sender })
  const notes = () => pushes.map((p) => JSON.parse(p.json).notification as { title: string; body: string; navigate: string; data: Record<string, unknown> })

  beforeEach(() => {
    pushes.length = 0
  })

  it("marks the gift received once, counts the link's use once, pushes every member but the giver (no note)", async () => {
    await subscribe([MAYA, "Maya"], [SAM, "Sam"], [LEO, "Leo"])
    const l = await linkRow({ reusable: false })
    // Leo (a member) sends his own Pot a gift: he isn't told about it
    const g = await giftRow({ linkId: l.id, giverAccount: LEO, displayName: "Uncle Leo", note: "SECRET-NOTE-boat", tone: "gift" })
    const ev = { pot: DAO, from: LEO, amount: $(5), ref: g.ref, txHash: "TxHash111" }
    const a = await onGiftReceived(rd(), ev)
    expect(a.marked).toBe(true)
    const row = (await t.db.select().from(gift).where(eq(gift.ref, g.ref)))[0]!
    expect(row).toMatchObject({ status: "received", txHash: "TxHash111" })
    expect(row.receivedAt).not.toBeNull()
    expect((await t.db.select().from(giftLink).where(eq(giftLink.id, l.id)))[0]!.uses).toBe(1)
    expect(pushes.map((p) => p.endpoint).sort()).toEqual(["https://fcm.googleapis.com/maya", "https://fcm.googleapis.com/sam"])
    const n = notes()[0]!
    expect(n.title).toBe("Uncle Leo sent Lisbon Trip a gift")
    expect(n.body).toBe("$5 ☕ · Open Pot to see it.")
    expect(n.navigate).toBe(`https://pot.test/p/lisbon-trip?sheet=gift&gift=${g.ref}`)
    expect(n.data).toMatchObject({ type: "gift_received", pot: DAO, ref: g.ref, subject: "gift" })
    expect(pushes[0]!.opts).toMatchObject({ topic: topic(DAO, `gift:${g.ref}`) })
    for (const p of pushes) {
      expect(p.json).not.toContain("SECRET-NOTE")
      expect(p.json).not.toContain(LEO)
    }
    // again (a replayed event): nothing changes, nobody is pushed twice
    pushes.length = 0
    expect((await onGiftReceived(rd(), ev)).marked).toBe(false)
    expect((await t.db.select().from(giftLink).where(eq(giftLink.id, l.id)))[0]!.uses).toBe(1)
    expect(pushes).toHaveLength(0)
  })

  it("no chosen name → the giver's Pot name; a ref we don't know (or someone else's) → 'Someone'", async () => {
    await subscribe([MAYA, "Maya"], [EVE, "Eve Giver"])
    // "pay in": a payment-tone row (the default) reads as a payment
    const g = await giftRow({ giverAccount: EVE })
    await onGiftReceived(rd(), { pot: DAO, from: EVE, amount: $(10), ref: g.ref })
    expect(notes()[0]!.title).toBe("Eve Giver paid $10 into Lisbon Trip")
    expect(notes()[0]!.body).toBe("From outside the Pot · Open Pot to see it.")
    // the event's amount is the truth
    expect((await t.db.select().from(gift).where(eq(gift.ref, g.ref)))[0]!.amount).toBe($(10))
    pushes.length = 0
    const raw = await onGiftReceived(rd(), { pot: DAO, from: EVE, amount: $(3), ref: "my-own-ref" })
    expect(raw.marked).toBe(false)
    expect(notes().map((x) => x.title)).toEqual(["Someone paid $3 into Lisbon Trip"])
    pushes.length = 0
    const named = await giftRow({ giverAccount: EVE, displayName: "Eve" })
    const stolen = await onGiftReceived(rd(), { pot: DAO, from: ALEX, amount: $(5), ref: named.ref })
    expect(stolen.marked).toBe(false)
    expect(notes()[0]!.title).toBe("Someone paid $5 into Lisbon Trip")
    expect((await t.db.select().from(gift).where(eq(gift.ref, named.ref)))[0]!.status).toBe("pending")
  })

  it("without push (no VAPID) it still marks; a failed gift that arrives after all is received", async () => {
    const g = await giftRow({ status: "failed" })
    const r = await onGiftReceived({ ...rd(), sender: null }, { pot: DAO, from: EVE, amount: $(5), ref: g.ref })
    expect(r).toEqual({ marked: true, push: null })
  })

  it("the hub event maps to a gift_received notification (the relayer's notifyFromEvents path)", () => {
    const ev = { standard: "pot", version: "1.2.0", event: "gift_received", data: { pot: DAO, from: EVE, amount: $(5), ref: "gabc" } }
    expect(eventsToNotifications([ev] as never, "tx1")).toEqual([{ type: "gift_received", pot: DAO, ref: "gabc", from: EVE, amount: $(5) }])
  })
})

describe("public resolvers", () => {
  it("the landing: the link's amount and note while it works, the Pot's public facts, whether it takes gifts", async () => {
    const l = await linkRow({ amount: $(25), note: "For the boat trip" })
    const r = await resolveGiftLanding(deps(), l.id)
    expect(r).toEqual({
      link: { id: l.id, amount: $(25), note: "For the boat trip", status: "active", expiresAt: l.expiresAt.toISOString(), tone: "payment" },
      pot: { pot: DAO, slug: "lisbon-trip", name: "Lisbon Trip", emoji: "🇵🇹", members: 3, status: "open" },
      taking: "yes",
    })
    goal = true
    expect((await resolveGiftLanding(deps(), l.id))?.taking).toBe("goal")
    goal = false
    giftsView = { on: false, total: 0n, count: 0 }
    expect((await resolveGiftLanding(deps(), l.id))?.taking).toBe("off")
    potStatus = "closed"
    expect((await resolveGiftLanding(deps(), l.id))?.taking).toBe("closed")
    await t.db.update(giftLink).set({ revokedAt: new Date(clock) }).where(eq(giftLink.id, l.id))
    expect((await resolveGiftLanding(deps(), l.id))?.link).toMatchObject({ status: "revoked", note: null })
    expect(await resolveGiftLanding(deps(), newGiftLinkId())).toBeNull()
    expect(await resolveGiftLanding(deps(), "bad")).toBeNull()
    process.env.FLAG_GIFTS = ""
    expect(await resolveGiftLanding(deps(), l.id)).toBeNull()
  })

  it("the gift page: off → the Pot only; on → totals and only the givers who chose to be shown", async () => {
    expect(await resolveGiftPage(deps(), "lisbon-trip")).toEqual({
      pot: { pot: DAO, slug: "lisbon-trip", name: "Lisbon Trip", emoji: "🇵🇹", members: 3, status: "open" },
      page: { on: false, line: null, tone: "payment" },
    })
    await t.db.insert(giftPage).values({ potId: DAO, on: false, line: "hidden while off" })
    expect((await resolveGiftPage(deps(), "lisbon-trip"))?.page).toEqual({ on: false, line: null, tone: "payment" })
    await pageOn(true, "Help us get to Lisbon")
    const at = (m: number) => new Date(clock - m * 60_000)
    await giftRow({ status: "received", receivedAt: at(3), showPublic: true, displayName: "Ana", note: "Have fun!", amount: $(10) })
    await giftRow({ status: "received", receivedAt: at(2), showPublic: true, displayName: "Bo", amount: $(5) })
    await giftRow({ status: "received", receivedAt: at(1), showPublic: false, displayName: "Private Pat", note: "SECRET-private", amount: $(20) })
    await giftRow({ status: "received", receivedAt: at(1), showPublic: true, displayName: null, note: "SECRET-nameless" })
    await giftRow({ status: "pending", showPublic: true, displayName: "Pending Pam" })
    const r = await resolveGiftPage(deps(), "lisbon-trip")
    expect(r).toMatchObject({ page: { on: true, line: "Help us get to Lisbon" }, taking: "yes", totals: { amount: $(40), count: 4 } })
    expect(r?.givers).toEqual([
      { name: "Bo", note: null, amount: $(5), at: at(2).toISOString() },
      { name: "Ana", note: "Have fun!", amount: $(10), at: at(3).toISOString() },
    ])
    expect(JSON.stringify(r)).not.toMatch(/SECRET|Private Pat|Pending Pam/)
    giftsView = { on: true, total: 99_000_000n, count: 7 }
    expect((await resolveGiftPage(deps(), DAO))?.totals).toEqual({ amount: "99000000", count: 7 })
    expect(await resolveGiftPage(deps(), "no-such-pot")).toBeNull()
    expect(await resolveGiftPage(deps(), "Bad Slug!")).toBeNull()
  })

  it("members see every received gift with names and notes", async () => {
    await giftRow({ status: "received", receivedAt: new Date(clock), displayName: "Private Pat", note: "SECRET-private" })
    await giftRow({ status: "pending", note: "not yet" })
    const r = await listPotGifts(deps(), await sessionFor(MAYA), "lisbon-trip")
    expect(r.gifts).toHaveLength(1)
    expect(r.gifts[0]).toMatchObject({ from: EVE, name: "Private Pat", note: "SECRET-private", status: "received" })
    expect(r.totals).toEqual({ amount: $(5), count: 1 })
  })
})

describe("the GiftChain views (hub 1.2.0 get_gifts, get_pot fallback)", () => {
  it("get_gifts, else the fields on get_pot, else unknown; get_goal collecting + all-or-nothing", async () => {
    expect(parseGiftsView({ gifts_on: true, gifts_total: "5000000", gifts_count: 1 })).toEqual({ on: true, total: 5_000_000n, count: 1 })
    expect(parseGiftsView({ gifts_on: true, gifts_total: "5000000", gifts_count: "2" })).toEqual({ on: true, total: 5_000_000n, count: 2 })
    expect(parseGiftsView({ gifts_on: true })).toBeNull()
    expect(parseGiftsView(null)).toBeNull()
    // hub 1.1.0: no get_gifts, no fields on get_pot, no goal
    expect(await createGiftChain(chain, HUB).giftsOf(DAO)).toBeNull()
    expect(await createGiftChain(chain, HUB).goalCollecting(DAO)).toBe(false)
    chain.view(HUB, "get_pot", () => ({ ...potView(), gifts_on: false, gifts_total: "0", gifts_count: 0 }))
    expect(await createGiftChain(chain, HUB).giftsOf(DAO)).toEqual({ on: false, total: 0n, count: 0 })
    // a get_gifts answer that isn't hub 1.2.0's shape → get_pot's fields
    chain.view(HUB, "get_gifts", () => ({ gifts_on: true, gifts_total: "7000000", gifts_count: 2 }))
    expect(await createGiftChain(chain, HUB).giftsOf(DAO)).toEqual({ on: false, total: 0n, count: 0 })
    // hub 1.2.0 get_gifts (the sdk's parser): on/total/count + the hub's refusal
    const raw = { pot: DAO, on: true, total: "7000000", count: 2, last_gift_ms: 1, in_flight: false, accepting: true, refusal: null, min_amount: "1000000" }
    chain.view(HUB, "get_gifts", () => raw)
    expect(await createGiftChain(chain, HUB).giftsOf(DAO)).toEqual({ on: true, total: 7_000_000n, count: 2, refusal: null })
    chain.view(HUB, "get_gifts", () => ({ ...raw, accepting: false, refusal: "goal_collecting" }))
    expect(await createGiftChain(chain, HUB).giftsOf(DAO)).toEqual({ on: true, total: 7_000_000n, count: 2, refusal: "goal_collecting" })
    chain.view(HUB, "get_gifts", () => ({ ...raw, refusal: "something_new" }))
    expect((await createGiftChain(chain, HUB).giftsOf(DAO))?.refusal).toBeNull()
    expect(parseGetGifts({ ...raw, total: "-1" })).toBeNull()
    expect(parseGetGifts(null)).toBeNull()
    chain.view(HUB, "get_goal", () => ({ pot: DAO, amount: "1", deadline_ms: 1, all_or_nothing: true, total_contributed: "0", state: "collecting" }))
    expect(await createGiftChain(chain, HUB).goalCollecting(DAO)).toBe(true)
    chain.view(HUB, "get_goal", () => ({ pot: DAO, amount: "1", deadline_ms: 1, all_or_nothing: false, total_contributed: "0", state: "collecting" }))
    expect(await createGiftChain(chain, HUB).goalCollecting(DAO)).toBe(false)
  })
})

describe("DB CHECKs (migration 0005)", () => {
  const constraintOf = (p: Promise<unknown>) => p.then(() => null, (e: { cause?: { constraint?: string } }) => e.cause?.constraint)
  it("ref format, note/name/line lengths, link id format", async () => {
    expect(await constraintOf(giftRow({ ref: "G".repeat(24) }))).toBe("gift_ref_ck")
    expect(await constraintOf(giftRow({ ref: "gil".padEnd(24, "0") }))).toBe("gift_ref_ck") // i and l aren't base-32
    expect(await constraintOf(giftRow({ note: "x".repeat(141) }))).toBe("gift_note_ck")
    expect(await constraintOf(giftRow({ note: "" }))).toBe("gift_note_ck")
    expect(await constraintOf(giftRow({ displayName: "x".repeat(41) }))).toBe("gift_name_ck")
    expect(await constraintOf(giftRow({ amount: "0" }))).toBe("gift_amount_ck")
    expect(await constraintOf(giftRow({ status: "lost" as never }))).toBe("gift_status_ck")
    expect(await constraintOf(linkRow({ note: "x".repeat(141) }))).toBe("gift_link_note_ck")
    expect(await constraintOf(linkRow({ id: "short" }))).toBe("gift_link_id_ck")
    expect(await constraintOf(t.db.insert(giftPage).values({ potId: DAO, line: "x".repeat(101) }))).toBe("gift_page_line_ck")
    // 140 code points of emoji fit (char_length counts code points, like the server's cleaning)
    expect(await constraintOf(giftRow({ note: "☕".repeat(140) }))).toBeNull()
  })
})

// CLI-4 (security audit 2026-11-04): a Pot whose name reads like an official / brand page gets no public page and no
// pay-in links (lib/reserved-names.ts), and one made before the check stops showing. Turning a page off still works.
describe("reserved names on public pages (CLI-4)", () => {
  const named = (name: string) => chain.view(HUB, "get_pot", (a) => (a.pot === DAO ? { ...potView(), name, status: potStatus } : null))

  it("refuses to turn the page on or make a link for an official-looking name; off is always allowed", async () => {
    named("NEAR Foundation")
    const maya = await sessionFor(MAYA)
    await expect(putGiftPage(deps(), maya, "lisbon-trip", { on: true })).rejects.toMatchObject({
      reason: "bad_request",
      detail: { field: "name", why: "reserved_name" },
    })
    await expect(mkLink(maya, {})).rejects.toMatchObject({ reason: "bad_request", detail: { why: "reserved_name" } })
    expect((await putGiftPage(deps(), maya, "lisbon-trip", { on: false })).page.on).toBe(false)
  })

  it("an ordinary name passes, but an official-looking one-liner or link note is refused", async () => {
    const maya = await sessionFor(MAYA)
    await expect(putGiftPage(deps(), maya, "lisbon-trip", { on: true, line: "Official Red Cross partner" })).rejects.toMatchObject({
      detail: { why: "reserved_name" },
    })
    await expect(mkLink(maya, { note: "Verified Coinbase refund" })).rejects.toMatchObject({ detail: { why: "reserved_name" } })
    expect((await putGiftPage(deps(), maya, "lisbon-trip", { on: true, line: "Help us get to Lisbon" })).page.on).toBe(true)
  })

  it("a page or link made before the check (or a Pot renamed since) stops showing", async () => {
    await pageOn(true, "Help us get to Lisbon")
    const l = await linkRow({ amount: $(25) })
    expect((await resolveGiftPage(deps(), "lisbon-trip"))?.page.on).toBe(true)
    expect(await resolveGiftLanding(deps(), l.id)).not.toBeNull()
    named("UNICEF Official")
    expect((await resolveGiftPage(deps(), "lisbon-trip"))?.page).toEqual({ on: false, line: null, tone: "payment" })
    expect(await resolveGiftLanding(deps(), l.id)).toBeNull()
  })
})
