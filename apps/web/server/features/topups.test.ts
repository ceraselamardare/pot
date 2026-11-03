// "Ask for a top-up" (server/features/topups.ts, the routes under app/api/pots/[pot]/topups, /api/me/topups and
// /api/nudges) against a private schema with a fake chain: members only (hub.get_members, never the client's word),
// validation and limits, the one-open-ask rule, progress from baselines, closing (done / due / cancelled), nudges and
// their 24 h limit, the daily job (close + the one reminder), the pushes, and the privacy markers on every route.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { nudge, pot, topupRequest } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { checkTopupAmount, cleanReason, nudgeable, partOf, progressOf, statusOf, amountParam } from "@/lib/topups"
import { createHubReader } from "../chain/hub"
import type { Config } from "../config"
import { setHubForTests } from "../deps"
import { notifyNudges, notifyTopupAsked, notifyTopupReminder } from "../notify/notify"
import { saveSubscription } from "../notify/subscriptions"
import type { PushResult, PushSender } from "../notify/webpush"
import { createSession, loadSession, type SessionCtx } from "../session/store"
import { DAO, HUB } from "../testing/delegates"
import { insertUser, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"
import { askTopup, cancelTopup, listTopups, myTopups, reconcileTopups, sendNudges, type AskedTopup, type NudgedPeople, type TopupDeps } from "./topups"

let t: TestDb
let cfg: Config
let chain: FakeChain
let potStatus: "open" | "closing" | "closed"
const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"
const LEO = "leo.users.potapp.testnet"
const ANA = "ana.users.potapp.testnet"
const EVE = "eve.users.potapp.testnet" // never in the Pot
const USD = (n: number) => String(BigInt(Math.round(n * 100)) * 10_000n)
const T0 = Date.UTC(2026, 10, 3, 9, 0)
const HOUR = 3_600_000
const DAY = 24 * HOUR
let now = T0
let members: { account_id: string; status: string; contributed: string; join_index: number }[]
let keyN = 0
const key = () => `k${String(++keyN).padStart(15, "0")}`.replace(/[ilou]/g, "x")

beforeAll(async () => {
  t = await createTestDb("topups")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig()
  now = T0
  potStatus = "open"
  chain = seedChain(new FakeChain())
  chain.view(HUB, "get_pot", (a) => (a.pot === DAO ? { ...potViewOf(), status: potStatus } : null))
  members = [MAYA, SAM, LEO, ANA].map((a, i) => ({ account_id: a, status: "active", contributed: USD(150), join_index: i }))
  chain.view(HUB, "get_members", () => members)
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", emoji: "🇵🇹", preset: "trip", creatorAccount: MAYA })
})

function potViewOf() {
  // the seedChain view, re-read so the status can change
  return { pot: DAO, slug: "lisbon-trip", name: "Lisbon Trip", status: "open", rules: { instant_cap: "100000000" } }
}

async function sessionFor(account: string, name?: string): Promise<SessionCtx> {
  const k = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key: k })
  if (name) await t.db.execute(`UPDATE app_user SET display_name = '${name}' WHERE id = '${user.id}'` as never)
  const s = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  return (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie: `__Host-pot_session=${s.cookieValue}` } }), cfg))!
}

const deps = (extra: Partial<TopupDeps> = {}): TopupDeps => ({ db: t.db, hub: createHubReader(chain, HUB), cfg, now: () => now, ...extra })
const ask = (s: SessionCtx, body: Partial<Parameters<typeof askTopup>[3]> = {}, extra: Partial<TopupDeps> = {}) =>
  askTopup(deps(extra), s, "lisbon-trip", { mode: "each", amount: USD(50), idempotencyKey: key(), ...body })
const add = (account: string, dollars: number) => {
  const m = members.find((x) => x.account_id === account)!
  m.contributed = (BigInt(m.contributed) + BigInt(USD(dollars))).toString()
}

describe("the rules (lib/topups.ts)", () => {
  it("splits a total equally, rounded up to the cent, so the parts cover it", () => {
    expect(partOf("each", 50_000_000n, 4)).toBe(50_000_000n)
    expect(partOf("total", 200_000_000n, 4)).toBe(50_000_000n)
    expect(partOf("total", 100_000_000n, 3)).toBe(33_340_000n) // $33.34 × 3 ≥ $100
    expect(checkTopupAmount("total", 2_000_000n, 3)).toEqual({ ok: false, why: "too_low" }) // $0.67 each
    expect(checkTopupAmount("each", 999_999n, 3)).toEqual({ ok: false, why: "too_low" })
    expect(checkTopupAmount("each", 10_000_000_001n, 3)).toEqual({ ok: false, why: "too_high" })
    expect(checkTopupAmount("each", 50_000_000n, 4)).toEqual({ ok: true, part: 50_000_000n, total: 200_000_000n })
    expect(amountParam(33_340_000n)).toBe("33.34")
    expect(amountParam(12_500_000n)).toBe("12.5")
    expect(amountParam(50_000_000n)).toBe("50")
  })

  it("the reason: one line, trimmed, ≤ 80 code points, empty = none", () => {
    expect(cleanReason("  Hotel\n went   up  ")).toEqual({ ok: true, value: "Hotel went up" })
    expect(cleanReason("   ")).toEqual({ ok: true, value: null })
    expect(cleanReason(null)).toEqual({ ok: true, value: null })
    expect(cleanReason("🏨".repeat(80))).toMatchObject({ ok: true })
    expect(cleanReason("x".repeat(81))).toEqual({ ok: false, why: "length" })
    expect(cleanReason("bell\u0007")).toEqual({ ok: false, why: "control" })
    expect(cleanReason("rtl \u202e")).toEqual({ ok: false, why: "format" })
  })

  it("progress from baselines: added = now − then; a person who left drops out; done when every one is", () => {
    const p = progressOf(
      [
        { account: "a", baseline: 100n, contributed: 160n },
        { account: "b", baseline: 100n, contributed: 120n },
        { account: "c", baseline: 100n, contributed: null },
      ],
      50n,
    )
    expect(p).toEqual([
      { account: "a", part: 50n, added: 60n, done: true },
      { account: "b", part: 50n, added: 20n, done: false },
    ])
    expect(statusOf({}, p, T0 + DAY, T0)).toBe("open")
    expect(statusOf({}, p, T0, T0)).toBe("ended")
    expect(statusOf({}, [p[0]!], T0 + DAY, T0)).toBe("done")
    expect(statusOf({ cancelledAt: 1 }, [p[0]!], T0 + DAY, T0)).toBe("cancelled")
    expect(nudgeable(p, "x", { b: T0 - HOUR }, T0)).toEqual([])
    expect(nudgeable(p, "x", { b: T0 - DAY - 1 }, T0)).toEqual(["b"])
    expect(nudgeable(p, "b", {}, T0)).toEqual([])
  })
})

describe("asking", () => {
  it("a member asks $50 each: everyone (the asker too) is asked, baselines saved in join order, 201", async () => {
    const maya = await sessionFor(MAYA)
    const seen: AskedTopup[] = []
    const r = await ask(maya, { reason: "  Hotel went up " }, { onAsked: (a) => seen.push(a) })
    expect(r.status).toBe(201)
    expect(r.topup).toMatchObject({ pot: DAO, slug: "lisbon-trip", potName: "Lisbon Trip", potEmoji: "🇵🇹", createdBy: MAYA, mode: "each", perPerson: USD(50), total: USD(200), reason: "Hotel went up", status: "open", endedAt: null })
    expect(r.topup.dueAt).toBe(new Date(T0 + 7 * DAY).toISOString())
    expect(r.topup.members.map((m) => [m.account, m.part, m.added, m.done])).toEqual([MAYA, SAM, LEO, ANA].map((a) => [a, USD(50), "0", false]))
    const row = (await t.db.select().from(topupRequest))[0]!
    expect(row.baselines).toEqual([MAYA, SAM, LEO, ANA].map((a) => ({ a, c: USD(150) })))
    // the push goes to everyone asked but the asker, with the reason (members only)
    expect(seen).toEqual([{ pot: DAO, id: r.topup.id, actor: MAYA, amount: USD(50), reason: "Hotel went up", recipients: [SAM, LEO, ANA] }])
  })

  it("$X in total is split equally among the people asked", async () => {
    const sam = await sessionFor(SAM)
    const r = await ask(sam, { mode: "total", amount: USD(100) })
    expect(r.topup).toMatchObject({ mode: "total", perPerson: USD(25), total: USD(100) })
  })

  it("someone outside the Pot, or only joining, can't ask (not_a_member); nothing stored", async () => {
    const eve = await sessionFor(EVE)
    await expect(ask(eve)).rejects.toMatchObject({ reason: "not_a_member", status: 403 })
    members.push({ account_id: EVE, status: "joining", contributed: "0", join_index: 9 })
    await expect(ask(eve)).rejects.toMatchObject({ reason: "not_a_member" })
    expect(await t.db.select().from(topupRequest)).toHaveLength(0)
  })

  it("validation: amount, reason, due date; a closed Pot; a Pot of one", async () => {
    const maya = await sessionFor(MAYA)
    await expect(ask(maya, { amount: USD(0.5) })).rejects.toMatchObject({ reason: "amount_too_low", status: 422 })
    await expect(ask(maya, { amount: USD(10_001) })).rejects.toMatchObject({ reason: "amount_too_high" })
    await expect(ask(maya, { mode: "total", amount: USD(3) })).rejects.toMatchObject({ reason: "amount_too_low" }) // $0.75 each
    await expect(ask(maya, { amount: "12.5" })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "amount" } })
    await expect(ask(maya, { reason: "x".repeat(81) })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "reason", why: "length" } })
    await expect(ask(maya, { dueAt: new Date(T0 + 10 * 60_000).toISOString() })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "dueAt" } })
    await expect(ask(maya, { dueAt: new Date(T0 + 61 * DAY).toISOString() })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "dueAt" } })
    await expect(ask(maya, { dueAt: "not a date at all" })).rejects.toMatchObject({ reason: "bad_request", detail: { field: "dueAt" } })
    potStatus = "closing"
    await expect(ask(maya)).rejects.toMatchObject({ reason: "pot_closed", status: 409 })
    potStatus = "open"
    members = members.slice(0, 1)
    await expect(ask(maya)).rejects.toMatchObject({ reason: "action_not_allowed", status: 409, detail: { cause: "alone" } })
    expect(await t.db.select().from(topupRequest)).toHaveLength(0)
  })

  it("one open ask per Pot: a second one waits (409 topup_open) until the first is cancelled or ends", async () => {
    const maya = await sessionFor(MAYA)
    const sam = await sessionFor(SAM)
    const first = await ask(maya)
    await expect(ask(sam)).rejects.toMatchObject({ reason: "action_not_allowed", status: 409, detail: { cause: "topup_open", id: first.topup.id } })
    // the DB backs the rule up: a second open row for the Pot is refused by the partial unique index
    const err = await t.db
      .insert(topupRequest)
      .values({ potId: DAO, createdBy: SAM, mode: "each", perPerson: USD(5), total: USD(20), dueAt: new Date(T0 + DAY), baselines: [] })
      .then(() => null, (e: { cause?: { constraint?: string } }) => e)
    expect(err?.cause?.constraint).toBe("topup_request_open_uq")
    await cancelTopup(deps(), maya, "lisbon-trip", first.topup.id)
    expect((await ask(sam)).status).toBe(201)
    // and after the date passes, the open one ends by itself: a new ask is fine
    now = T0 + 8 * DAY
    expect((await ask(maya)).status).toBe(201)
  })

  it("a retried ask with the same key returns the first one; another body under it conflicts", async () => {
    const maya = await sessionFor(MAYA)
    const k = key()
    const a = await ask(maya, { idempotencyKey: k, reason: "Hotel" })
    const b = await ask(maya, { idempotencyKey: k, reason: "Hotel" })
    expect(b).toMatchObject({ status: 200, replayed: true, topup: { id: a.topup.id } })
    await expect(ask(maya, { idempotencyKey: k, amount: USD(60), reason: "Hotel" })).rejects.toMatchObject({ reason: "idempotency_conflict" })
    expect(await t.db.select().from(topupRequest)).toHaveLength(1)
  })

  it("limits: 5 a minute (rate_limited), 10 a day (quota_exceeded family topups)", async () => {
    process.env.QUOTA_USER_TOPUP_BURST = "1"
    const maya = await sessionFor(MAYA)
    const a = await ask(maya)
    await cancelTopup(deps(), maya, "lisbon-trip", a.topup.id).catch(() => undefined) // the cancel itself is over the burst
    await t.db.update(topupRequest).set({ cancelledAt: new Date(T0) })
    await expect(ask(maya)).rejects.toMatchObject({ reason: "rate_limited", status: 429 })
    delete process.env.QUOTA_USER_TOPUP_BURST
    process.env.QUOTA_USER_TOPUPS = "1"
    await expect(ask(maya)).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "topups" } })
  })
})

describe("progress, done, ended, cancelled", () => {
  it("progress counts only money added after the ask; done when everyone added their part; frozen after", async () => {
    const maya = await sessionFor(MAYA)
    const a = await ask(maya)
    add(SAM, 50)
    add(LEO, 20)
    let open = (await listTopups(deps(), maya, "lisbon-trip")).topups[0]!
    expect(open.status).toBe("open")
    expect(open.members.map((m) => [m.account, m.added, m.done])).toEqual([
      [MAYA, "0", false],
      [SAM, USD(50), true],
      [LEO, USD(20), false],
      [ANA, "0", false],
    ])
    add(MAYA, 50)
    add(LEO, 30)
    add(ANA, 100)
    open = (await listTopups(deps(), maya, "lisbon-trip")).topups[0]!
    expect(open).toMatchObject({ id: a.topup.id, status: "done" })
    const row = (await t.db.select().from(topupRequest))[0]!
    expect(row).toMatchObject({ closeCause: "done", progress: { [MAYA]: USD(50), [SAM]: USD(50), [LEO]: USD(50), [ANA]: USD(100) } })
    expect(row.closedAt?.getTime()).toBe(T0)
    // money added later doesn't change a finished ask
    add(SAM, 500)
    expect((await listTopups(deps(), maya, "lisbon-trip")).topups[0]!.members.find((m) => m.account === SAM)!.added).toBe(USD(50))
  })

  it("someone who leaves drops out of the count; someone who joins later isn't asked", async () => {
    const maya = await sessionFor(MAYA)
    await ask(maya)
    members = members.filter((m) => m.account_id !== ANA)
    members.push({ account_id: EVE, status: "active", contributed: "0", join_index: 9 })
    for (const a of [MAYA, SAM, LEO]) add(a, 50)
    const r = (await listTopups(deps(), maya, "lisbon-trip")).topups[0]!
    expect(r.status).toBe("done")
    expect(r.members.map((m) => m.account)).toEqual([MAYA, SAM, LEO])
  })

  it("at its date it ends; the asker cancels their own (others can't; twice answers the same; an ended one can't)", async () => {
    const maya = await sessionFor(MAYA)
    const sam = await sessionFor(SAM)
    const a = await ask(maya, { dueAt: new Date(T0 + 3 * DAY).toISOString() })
    await expect(cancelTopup(deps(), sam, "lisbon-trip", a.topup.id)).rejects.toMatchObject({ reason: "action_not_allowed", status: 403, detail: { cause: "not_asker" } })
    await expect(cancelTopup(deps(), maya, "lisbon-trip", "999")).rejects.toMatchObject({ reason: "not_found" })
    await expect(cancelTopup(deps(), maya, "lisbon-trip", "abc")).rejects.toMatchObject({ reason: "not_found" })
    add(SAM, 50)
    const c = await cancelTopup(deps(), maya, "lisbon-trip", a.topup.id)
    expect(c.topup).toMatchObject({ status: "cancelled", endedAt: new Date(T0).toISOString() })
    expect(c.topup.members.find((m) => m.account === SAM)).toMatchObject({ added: USD(50), done: true })
    expect((await cancelTopup(deps(), maya, "lisbon-trip", a.topup.id)).topup.status).toBe("cancelled")
    const b = await ask(maya, { dueAt: new Date(T0 + 2 * DAY).toISOString() })
    now = T0 + 2 * DAY
    await expect(cancelTopup(deps(), maya, "lisbon-trip", b.topup.id)).rejects.toMatchObject({ reason: "action_not_allowed", status: 409, detail: { cause: "topup_ended" } })
    const list = (await listTopups(deps(), maya, "lisbon-trip")).topups
    expect(list.map((x) => x.status)).toEqual(["ended", "cancelled"])
  })

  it("the DB checks: mode, a reason over 80, closed with a cause only, never closed and cancelled", async () => {
    const base = { potId: DAO, createdBy: MAYA, perPerson: USD(5), total: USD(20), dueAt: new Date(T0 + DAY), baselines: [] }
    const ck = (v: Record<string, unknown>) =>
      t.db
        .insert(topupRequest)
        .values({ ...base, mode: "each", ...v } as never)
        .then(() => null, (e: { cause?: { constraint?: string } }) => e?.cause?.constraint)
    expect(await ck({ mode: "some" })).toBe("topup_request_mode_ck")
    expect(await ck({ reason: "x".repeat(81) })).toBe("topup_request_reason_ck")
    expect(await ck({ closedAt: new Date() })).toBe("topup_request_close_ck")
    expect(await ck({ closedAt: new Date(), closeCause: "done", cancelledAt: new Date() })).toBe("topup_request_end_ck")
    expect(await ck({ total: USD(1) })).toBe("topup_request_amount_ck")
    expect(await ck({ baselines: {} })).toBe("topup_request_baselines_ck")
  })
})

describe("nudges", () => {
  it("nudges people who haven't added; once per person per 24 h whoever sends it; skips self / done / outsiders", async () => {
    const maya = await sessionFor(MAYA)
    const sam = await sessionFor(SAM)
    const a = await ask(maya)
    add(SAM, 50)
    const seen: NudgedPeople[] = []
    const n = await sendNudges(deps({ onNudged: (x) => seen.push(x) }), maya, { pot: "lisbon-trip", to: [LEO, ANA, SAM, MAYA, EVE], topup: a.topup.id, idempotencyKey: key() })
    expect(n.nudged).toEqual([LEO, ANA])
    expect(n.skipped).toEqual([
      { account: SAM, why: "done" },
      { account: MAYA, why: "self" },
      { account: EVE, why: "not_member" },
    ])
    expect(n.delivered).toBe("none") // nobody has push on
    expect(seen[0]!.nudges.map((x) => [x.to, x.amount])).toEqual([
      [LEO, USD(50)],
      [ANA, USD(50)],
    ])
    // Sam (another member) can't nudge them again today
    await expect(sendNudges(deps(), sam, { pot: "lisbon-trip", to: [LEO, ANA], topup: a.topup.id, idempotencyKey: key() })).rejects.toMatchObject({ reason: "nudge_too_soon", status: 429 })
    // the card shows who got one today
    expect((await listTopups(deps(), sam, "lisbon-trip")).topups[0]!.members.find((m) => m.account === LEO)!.nudgedAt).toBe(new Date(T0).toISOString())
    // a day later, again
    now = T0 + DAY + 1
    expect((await sendNudges(deps(), sam, { pot: "lisbon-trip", to: LEO, topup: a.topup.id, idempotencyKey: key() })).nudged).toEqual([LEO])
    // someone done: nothing to nudge
    await expect(sendNudges(deps(), maya, { pot: "lisbon-trip", to: [SAM], topup: a.topup.id, idempotencyKey: key() })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "nothing_to_nudge" } })
  })

  it("a retry with the same key returns the same people; outsiders can't nudge; an ended ask can't be nudged about", async () => {
    const maya = await sessionFor(MAYA)
    const eve = await sessionFor(EVE)
    const a = await ask(maya)
    const k = key()
    const first = await sendNudges(deps(), maya, { pot: "lisbon-trip", to: [LEO], topup: a.topup.id, idempotencyKey: k })
    const again = await sendNudges(deps(), maya, { pot: "lisbon-trip", to: [LEO], topup: a.topup.id, idempotencyKey: k })
    expect(again).toMatchObject({ replayed: true, nudged: first.nudged })
    expect(await t.db.select().from(nudge)).toHaveLength(1)
    await expect(sendNudges(deps(), eve, { pot: "lisbon-trip", to: [LEO], idempotencyKey: key() })).rejects.toMatchObject({ reason: "not_a_member" })
    await expect(sendNudges(deps(), maya, { pot: "lisbon-trip", to: [LEO], topup: "999", idempotencyKey: key() })).rejects.toMatchObject({ reason: "not_found" })
    now = T0 + 8 * DAY
    await expect(sendNudges(deps(), maya, { pot: "lisbon-trip", to: [ANA], topup: a.topup.id, idempotencyKey: key() })).rejects.toMatchObject({ reason: "action_not_allowed", detail: { cause: "topup_ended" } })
    // without an ask (the plain nudge of api-spec §2.5)
    expect((await sendNudges(deps(), maya, { pot: "lisbon-trip", to: ANA, idempotencyKey: key() })).nudged).toEqual([ANA])
  })

  it("10 people a day per sender (quota_exceeded family nudges)", async () => {
    process.env.QUOTA_USER_NUDGES = "2"
    const maya = await sessionFor(MAYA)
    const a = await ask(maya)
    await expect(sendNudges(deps(), maya, { pot: "lisbon-trip", to: [SAM, LEO, ANA], topup: a.topup.id, idempotencyKey: key() })).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "nudges" } })
    expect(await t.db.select().from(nudge)).toHaveLength(0)
    expect((await sendNudges(deps(), maya, { pot: "lisbon-trip", to: [SAM, LEO], topup: a.topup.id, idempotencyKey: key() })).nudged).toEqual([SAM, LEO])
  })
})

describe("GET /api/me/topups", () => {
  it("open asks where I'm asked (Pots I'm still in), and the asks I made; askers' names", async () => {
    const maya = await sessionFor(MAYA, "Maya")
    const leo = await sessionFor(LEO)
    const eve = await sessionFor(EVE)
    const a = await ask(maya, { reason: "Hotel went up" })
    const mine = await myTopups(deps(), maya)
    expect(mine.open.map((x) => x.id)).toEqual([a.topup.id]) // the asker is asked too
    expect(mine.mine.map((x) => x.id)).toEqual([a.topup.id])
    const leos = await myTopups(deps(), leo)
    expect(leos.open[0]).toMatchObject({ id: a.topup.id, reason: "Hotel went up", createdBy: MAYA })
    expect(leos.mine).toEqual([])
    expect(leos.profiles[MAYA]).toEqual({ name: "Maya", avatar: null })
    expect(await myTopups(deps(), eve)).toEqual({ open: [], mine: [], profiles: {} })
    // Leo adds his part: it leaves his open list
    add(LEO, 50)
    expect((await myTopups(deps(), leo)).open).toEqual([])
    // Maya leaves the Pot: nothing of it any more, her own ask included
    members = members.filter((m) => m.account_id !== MAYA)
    expect(await myTopups(deps(), maya)).toEqual({ open: [], mine: [], profiles: {} })
  })
})

describe("the daily job", () => {
  it("closes done and due asks, and sends one reminder the day before to those who haven't added", async () => {
    const maya = await sessionFor(MAYA)
    const a = await ask(maya, { dueAt: new Date(T0 + 3 * DAY).toISOString() })
    const reminders: unknown[] = []
    const run = () => reconcileTopups({ db: t.db, hub: createHubReader(chain, HUB), remind: async (r) => void reminders.push(r) }, now)
    expect(await run()).toEqual({ scanned: 1, done: 0, ended: 0, reminders: 0 })
    add(SAM, 50)
    now = T0 + 2 * DAY // due in 24 h
    expect(await run()).toEqual({ scanned: 1, done: 0, ended: 0, reminders: 1 })
    expect(reminders).toEqual([{ pot: DAO, id: a.topup.id, actor: MAYA, amount: USD(50), dueAt: T0 + 3 * DAY, recipients: [LEO, ANA] }])
    expect(await run()).toMatchObject({ reminders: 0 }) // once
    now = T0 + 3 * DAY
    expect(await run()).toEqual({ scanned: 1, done: 0, ended: 1, reminders: 0 })
    expect((await t.db.select().from(topupRequest))[0]).toMatchObject({ closeCause: "due" })
    // a done one
    const b = await ask(maya)
    for (const x of [MAYA, SAM, LEO, ANA]) add(x, 50)
    expect(await run()).toEqual({ scanned: 1, done: 1, ended: 0, reminders: 0 })
    expect((await t.db.select().from(topupRequest).where(eq(topupRequest.id, Number(b.topup.id))))[0]).toMatchObject({ closeCause: "done" })
  })
})

describe("pushes", () => {
  it("asked: everyone asked but the asker, with the reason; nudges: only the person; reminder: the date; no one who left", async () => {
    const people = { maya: await sessionFor(MAYA, "Maya"), sam: await sessionFor(SAM, "Sam"), leo: await sessionFor(LEO, "Leo"), ana: await sessionFor(ANA, "Ana") }
    for (const [n, s] of Object.entries(people))
      await saveSubscription(t.db, s, { subscription: { endpoint: `https://fcm.googleapis.com/${n}`, expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }, standalone: true, platform: "ios" })
    const sent: { to: string; n: { title: string; body: string; navigate: string; data: Record<string, unknown> } }[] = []
    const sender: PushSender = { send: async (target, json) => (sent.push({ to: target.endpoint.split("/").pop()!, n: JSON.parse(json).notification }), { status: 201 } as PushResult) }
    const nd = { db: t.db, hub: createHubReader(chain, HUB), cfg, sender, sleep: async () => undefined }
    members = members.filter((m) => m.account_id !== ANA) // Ana left
    await notifyTopupAsked(nd, { pot: DAO, id: "7", actor: MAYA, amount: USD(50), reason: "Hotel went up", recipients: [SAM, LEO, ANA] })
    expect(sent.map((x) => x.to).sort()).toEqual(["leo", "sam"])
    expect(sent[0]!.n).toMatchObject({ title: "Maya asks everyone for $50 more", body: "Hotel went up · Lisbon Trip", navigate: "https://pot.test/p/lisbon-trip" })
    expect(sent[0]!.n.data).toMatchObject({ type: "topup", subject: "topup", topupId: "7" })
    sent.length = 0
    await notifyTopupAsked(nd, { pot: DAO, id: "7", actor: MAYA, amount: USD(50), reason: null, recipients: [SAM] })
    expect(sent).toHaveLength(0) // deduped per ask
    await notifyTopupAsked(nd, { pot: DAO, id: "8", actor: MAYA, amount: USD(12.5), reason: null, recipients: [SAM] })
    expect(sent[0]!.n).toMatchObject({ title: "Maya asks everyone for $12.50 more", body: "For Lisbon Trip. Tap to add yours." })
    sent.length = 0
    await notifyNudges(nd, { pot: DAO, actor: SAM, topupId: "7", nudges: [{ id: "1", to: LEO, amount: USD(30) }] })
    expect(sent).toEqual([
      { to: "leo", n: expect.objectContaining({ title: "Sam nudged you", body: "Add your $30 share to Lisbon Trip.", navigate: "https://pot.test/p/lisbon-trip?sheet=add&amount=30&topup=7" }) },
    ])
    sent.length = 0
    await notifyNudges(nd, { pot: DAO, actor: SAM, topupId: null, nudges: [{ id: "2", to: LEO }] })
    expect(sent[0]!.n).toMatchObject({ body: "Add money to Lisbon Trip when you can.", navigate: "https://pot.test/p/lisbon-trip?sheet=add" })
    sent.length = 0
    await notifyTopupReminder(nd, { pot: DAO, id: "7", actor: MAYA, amount: USD(50), dueAt: Date.UTC(2026, 10, 10, 9), recipients: [LEO] })
    expect(sent[0]!.n).toMatchObject({ title: "Reminder: $50 for Lisbon Trip", body: "Maya asked everyone to add it by Nov 10.", navigate: "https://pot.test/p/lisbon-trip?sheet=add&amount=50&topup=7" })
  })
})

describe("routes: gates, privacy", () => {
  const ORIGIN = "https://pot.test"
  const SECRET = "SECRET-REASON-hotel"
  const cookies: Record<string, string> = {}
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const params = <P,>(p: P) => ({ params: Promise.resolve(p) })
  async function cookieFor(account: string) {
    const { user, device } = await insertUser(t.db, { account, key: KeyPair.fromRandom("ed25519") })
    const s = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
    cookies[account] = `__Host-pot_session=${s.cookieValue}`
  }

  it("members read and write; a never-member, someone who left and a visitor get gates and no reason", async () => {
    setDbForTests(t.db)
    setHubForTests(createHubReader(chain, HUB))
    try {
      for (const a of [MAYA, SAM, LEO, EVE]) await cookieFor(a)
      const { GET, POST } = await import("@/app/api/pots/[pot]/topups/route")
      const { DELETE } = await import("@/app/api/pots/[pot]/topups/[id]/route")
      const me = await import("@/app/api/me/topups/route")
      const nudges = await import("@/app/api/nudges/route")
      const p = params({ pot: "lisbon-trip" })
      // gates before any read
      expect((await POST(req("POST", "/x", { mode: "each", amount: USD(50), idempotencyKey: key() }, { origin: "https://evil.example" }), p)).status).toBe(403)
      expect((await POST(req("POST", "/x", { mode: "each", amount: USD(50), idempotencyKey: key(), extra: 1 }, { cookie: cookies[MAYA]! }), p)).status).toBe(400)
      expect(await (await POST(req("POST", "/x", { mode: "each", amount: USD(50), idempotencyKey: key() }), p)).json()).toMatchObject({ reason: "not_signed_in" })
      // Maya asks (the route's 201)
      const created = await POST(req("POST", "/x", { mode: "each", amount: USD(50), reason: SECRET, idempotencyKey: key() }, { cookie: cookies[MAYA]! }), p)
      expect(created.status).toBe(201)
      const id = ((await created.json()) as { topup: { id: string } }).topup.id
      // members read it, reason included
      const samRead = await (await GET(req("GET", "/x", undefined, { cookie: cookies[SAM]! }), p)).json()
      expect(JSON.stringify(samRead)).toContain(SECRET)
      expect(JSON.stringify(await (await me.GET(req("GET", "/x", undefined, { cookie: cookies[LEO]! }))).json())).toContain(SECRET)
      // Leo leaves; Eve was never in; a visitor isn't signed in: none of them sees the reason
      members = members.filter((m) => m.account_id !== LEO)
      setHubForTests(createHubReader(chain, HUB))
      for (const [who, cookie] of [["left", cookies[LEO]], ["never", cookies[EVE]], ["visitor", undefined]] as const) {
        const h: Record<string, string> = cookie ? { cookie } : {}
        const r1 = await GET(req("GET", "/x", undefined, h), p)
        expect([401, 403], who).toContain(r1.status)
        const r2 = await me.GET(req("GET", "/x", undefined, h))
        const r3 = await nudges.POST(req("POST", "/x", { pot: "lisbon-trip", to: [SAM], topup: id, idempotencyKey: key() }, h))
        const r4 = await DELETE(req("DELETE", "/x", {}, h), params({ pot: "lisbon-trip", id }))
        for (const r of [r1, r2, r3, r4]) expect(JSON.stringify(await r.json()), who).not.toContain(SECRET)
        expect([401, 403], who).toContain(r3.status)
        expect([401, 403], who).toContain(r4.status)
      }
      // the nudge route works for a member
      const ok = await nudges.POST(req("POST", "/x", { pot: "lisbon-trip", to: [ANA], topup: id, idempotencyKey: key() }, { cookie: cookies[SAM]! }))
      expect(await ok.json()).toMatchObject({ ok: true, nudged: [ANA], delivered: "none" })
      // only the asker cancels
      expect((await DELETE(req("DELETE", "/x", {}, { cookie: cookies[SAM]! }), params({ pot: "lisbon-trip", id }))).status).toBe(403)
      expect(await (await DELETE(req("DELETE", "/x", {}, { cookie: cookies[MAYA]! }), params({ pot: "lisbon-trip", id }))).json()).toMatchObject({ topup: { status: "cancelled" } })
    } finally {
      setDbForTests(undefined)
      setHubForTests(undefined)
    }
  })
})
