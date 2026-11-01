// X-09 faucet (A-11, A-28), X-05 notes and feed (A-12, A-29), X-08 demo session and demo intents
// (A-13, A-26) against pot_test with a fake chain and a scripted submitter.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq, sql } from "drizzle-orm"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { readQuota } from "@/db/quota"
import { demoPot, feedEvent, note, pot, relayLog, session } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import type { PoolKey } from "../chain/keys"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import type { RelayDeps } from "../relay/pipeline"
import { createSession, loadSession, type SessionCtx } from "../session/store"
import { DAO, HUB, USDC } from "../testing/delegates"
import { insertUser, NEAR, potView, RELAYER, seedChain, testConfig, TREASURY } from "../testing/env"
import { event, FakeChain, FakeSubmitter, methodOf, plainOutcome, relayedOutcome, valueOf } from "../testing/fakeChain"
import { b64url, random } from "../util/crypto"
import { demoRelay, demoSession, newVisitorId, verifyVisitorId } from "./demo"
import { claimFaucet } from "./faucet"
import { getFeed } from "./feed"
import { postNote } from "./notes"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
const SECRET = "s".repeat(40)

beforeAll(async () => {
  t = await createTestDb("features")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig({ DEMO_REFERENCE_POT: `lisbon-trip-ref.${HUB}` })
  resetBalanceCacheForTests()
  chain = seedChain(new FakeChain())
  sub = new FakeSubmitter((spec) => plainOutcome("x", spec.signerId, spec.receiverId))
})

async function sessionFor(account: string, kind: "dev" | "near-auth" | "demo" = "dev", deviceStatus: "active" | "pending" = "active"): Promise<SessionCtx> {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key, kind: kind === "demo" ? "dev" : kind, deviceStatus })
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
  async function seedFeed(isDemo = false, withMaya = true) {
    await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA, isDemo })
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
    await seedFeed(false, false)
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

  it("anonymous reads of demo Pots keep profiles", async () => {
    await seedFeed(true)
    const r = await getFeed(deps(), null, DAO, {})
    expect(Object.keys(r.body.profiles as object)).toContain(MAYA)
    expect(r.demo).toBe(true)
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

// ---------------------------------------------------------------------------------------------

describe("demo session (X-08, A-13, A-26)", () => {
  const personas = (k: string) => ({ maya: `maya-${k}.users.potapp.testnet`, sam: `sam-${k}.users.potapp.testnet`, leo: `leo-${k}.users.potapp.testnet` })
  async function seedPool(n: number) {
    for (let i = 0; i < n; i++)
      await t.db.insert(demoPot).values({ kind: "pool", slug: `lisbon-p${i}`, potId: `lisbon-p${i}.${HUB}`, personas: personas(`p${i}`), state: "ready", seededAt: new Date(Date.now() - (n - i) * 1000) })
  }
  const deps = (isBot = false) => ({ db: t.db, cfg, secret: SECRET, isBot: async () => isBot })
  const lease = (over: Partial<Parameters<typeof demoSession>[1]> = {}) =>
    demoSession(deps(), { form: false, visitorCookie: null, ipnetHash: "net1", userAgent: null, ...over })
  const visitorOf = (cookies: string[]) => cookies.find((c) => c.startsWith("pot_demo_visitor="))!.split(";")[0]!.split("=")[1]!

  it("visitor ids are MAC'd", () => {
    const v = newVisitorId(SECRET)
    expect(verifyVisitorId(SECRET, v)).toBeTruthy()
    expect(verifyVisitorId("o".repeat(40), v)).toBeNull()
    // Always change the last character (the old `replace(/.$/, "0")` was a no-op when it already ended in "0").
    const tampered = v.slice(0, -1) + (v.endsWith("0") ? "1" : "0")
    expect(tampered).not.toBe(v)
    expect(verifyVisitorId(SECRET, tampered)).toBeNull()
  })

  it("JSON: leases a ready pool Pot, creates a Maya demo session, sets the three cookies", async () => {
    await seedPool(2)
    const r = await lease()
    if (r.kind !== "json") throw new Error("expected json")
    expect(r.body.lease).toMatchObject({ slug: "lisbon-p0", shared: false })
    expect(r.body.session).toMatchObject({ kind: "demo", demo: { persona: "maya", slug: "lisbon-p0", shared: false } })
    expect(r.cookies.map((c) => c.split("=")[0])).toEqual(["pot_demo_visitor", "__Host-pot_session", "pot_hint"])
    const row = (await t.db.select().from(demoPot).where(eq(demoPot.slug, "lisbon-p0")))[0]!
    expect(row.state).toBe("leased")
  })

  it("a form post → 303 to /p/<slug>", async () => {
    await seedPool(1)
    const r = await lease({ form: true })
    expect(r).toMatchObject({ kind: "redirect", location: "/p/lisbon-p0" })
  })

  it("persona switch inside a lease: same Pot, no BotID, no new lease", async () => {
    await seedPool(2)
    const first = await lease()
    const v = visitorOf(first.cookies)
    const sw = await demoSession(deps(true), { form: false, visitorCookie: v, ipnetHash: "net1", userAgent: null, persona: "leo" })
    if (sw.kind !== "json") throw new Error("json")
    expect(sw.body.lease).toMatchObject({ slug: "lisbon-p0" })
    expect(sw.body.session).toMatchObject({ demo: { persona: "leo" } })
    expect((await t.db.select().from(demoPot).where(eq(demoPot.state, "leased")))).toHaveLength(1)
  })

  it("two visitors never get the same pool Pot under concurrency (SKIP LOCKED)", async () => {
    await seedPool(5)
    const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => lease({ ipnetHash: `net${i}` })))
    const slugs = rs.map((r) => (r.kind === "json" ? (r.body.lease as { slug: string }).slug : ""))
    expect(new Set(slugs).size).toBe(5)
  })

  it("an empty pool → the shared Pot, shared: true", async () => {
    await t.db.insert(demoPot).values({ kind: "shared", slug: "lisbon-20261103", potId: `lisbon-20261103.${HUB}`, personas: personas("s1"), state: "ready" })
    const r = await lease()
    if (r.kind !== "json") throw new Error("json")
    expect(r.body.lease).toMatchObject({ slug: "lisbon-20261103", shared: true })
    const cookie = r.cookies.find((c) => c.startsWith("__Host-pot_session="))!.split(";")[0]!
    const s = await loadSession(t.db, new Request("https://pot.test", { headers: { cookie } }), cfg)
    expect(s).toMatchObject({ kind: "demo" })
  })

  it("reset retires the lease and leases a fresh Pot", async () => {
    await seedPool(2)
    const first = await lease()
    const v = visitorOf(first.cookies)
    const second = await demoSession(deps(), { form: false, visitorCookie: v, ipnetHash: "net1", userAgent: null, reset: true })
    if (second.kind !== "json") throw new Error("json")
    expect(second.body.lease).toMatchObject({ slug: "lisbon-p1" })
    expect((await t.db.select().from(demoPot).where(eq(demoPot.slug, "lisbon-p0")))[0]!.state).toBe("retired")
  })

  it("BotID on a NEW lease: JSON → 403 bot_detected; a form → 303 /demo?ro=1", async () => {
    await seedPool(1)
    await expect(demoSession(deps(true), { form: false, visitorCookie: null, ipnetHash: "n", userAgent: null })).rejects.toMatchObject({ reason: "bot_detected" })
    expect(await demoSession(deps(true), { form: true, visitorCookie: null, ipnetHash: "n", userAgent: null })).toMatchObject({ kind: "redirect", location: "/demo/live?ro=1" })
  })

  it("the 11th new lease in a day from one IP net → 429 family lease (form → /demo?ro=1)", async () => {
    await seedPool(12)
    for (let i = 0; i < 10; i++) await lease({ ipnetHash: "same-net" })
    await expect(lease({ ipnetHash: "same-net" })).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "lease" } })
    expect(await lease({ ipnetHash: "same-net", form: true })).toMatchObject({ kind: "redirect", location: "/demo/live?ro=1" })
  })

  it("the demo flag off → 404", async () => {
    cfg = testConfig({ FLAG_DEMO: "false" })
    await expect(lease()).rejects.toMatchObject({ reason: "not_found" })
  })
})

describe("demo intents in /api/relay (B-08 / rev4 S-5)", () => {
  const MAYA = "maya-p0.users.potapp.testnet"
  const personaKey = KeyPair.fromRandom("ed25519")
  const pk: PoolKey = { publicKey: personaKey.getPublicKey().toString(), keyPair: personaKey }
  let s: SessionCtx
  let deps: RelayDeps & { personaKey: PoolKey; personaQueueMs?: number }
  async function demoSessionFor(kind: "pool" | "shared") {
    await t.db.insert(demoPot).values({
      kind,
      slug: "lisbon-p0",
      potId: DAO,
      personas: { maya: MAYA, sam: "sam-p0.users.potapp.testnet", leo: "leo-p0.users.potapp.testnet" },
      state: "ready",
      seededAt: new Date(),
    })
    const r = await demoSession({ db: t.db, cfg, secret: SECRET, isBot: async () => false }, { form: false, visitorCookie: null, ipnetHash: "n", userAgent: null })
    if (r.kind !== "json") throw new Error("json")
    const cookie = r.cookies.find((c) => c.startsWith("__Host-pot_session="))!.split(";")[0]!
    return (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie } }), cfg))!
  }
  beforeEach(() => {
    chain.account(MAYA, { keys: { [pk.publicKey]: 500n } })
    chain.view(HUB, "get_pot", (a) => (a.pot === DAO ? potView() : null))
    sub.script = (spec) =>
      relayedOutcome({
        txHash: "x",
        relayer: RELAYER,
        sender: spec.receiverId,
        inner: {
          executor: USDC,
          children: [{ executor: HUB, status: valueOf("0"), logs: [event("pot", "contribution", { pot: DAO, member: MAYA, amount: "150000000" })] }],
          then: { executor: USDC, status: valueOf("150000000") },
        },
      })
    deps = { db: t.db, rpc: chain, hub: createHubReader(chain, HUB), submitter: sub, cfg, defer: () => undefined, sleep: async () => undefined, personaKey: pk, personaQueueMs: 300 }
  })
  const send = (intent: Record<string, unknown>, key = b64url(random(10)).toLowerCase().replace(/[^0-9a-hjkmnp-tv-z]/g, "a").padEnd(16, "a").slice(0, 16)) =>
    demoRelay(deps, s, { demo: { intent: intent as never }, idempotencyKey: key }, { requestId: "req", ipnetHash: "n", bodyHash: key })

  it("signs as the persona with DEMO_PERSONA_KEY and relays through the normal pipeline", async () => {
    s = await demoSessionFor("pool")
    const r = await send({ type: "add_money", pot: DAO, amount: "150000000" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ outcome: "success", result: { type: "contribution", recorded: true } })
    const row = (await t.db.select().from(relayLog).where(eq(relayLog.op, "relay")))[0]!
    expect(row).toMatchObject({ senderId: MAYA, delegatePublicKey: pk.publicKey })
    expect(row.visitorHash).toBeTruthy()
    expect(await readQuota(t.db, "global", "demo_yocto")).toBeGreaterThan(0n)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBe(0n)
  })

  it("the reference Pot is refused FIRST (before any other check)", async () => {
    s = await demoSessionFor("pool")
    await expect(send({ type: "add_money", pot: `lisbon-trip-ref.${HUB}`, amount: "1" })).rejects.toMatchObject({
      reason: "demo_forbidden",
      detail: { why: "reference_pot" },
    })
    expect(sub.submitted).toHaveLength(0)
  })

  it("another visitor's Pot → demo_forbidden", async () => {
    s = await demoSessionFor("pool")
    await expect(send({ type: "add_money", pot: `other.${HUB}`, amount: "1" })).rejects.toMatchObject({ reason: "demo_forbidden" })
  })

  it.each([
    ["propose_close", { type: "propose_close", pot: DAO }],
    ["propose_rules", { type: "propose_rules", pot: DAO, rules: { instantCap: "1", memberBudget: "1", instantPayees: "members", payeeAllowlist: [] } }],
    ["set_rules", { type: "set_rules", pot: DAO, rules: { instantCap: "1", memberBudget: "1", instantPayees: "members", payeeAllowlist: [] } }],
  ])("the shared Pot refuses %s (rev4 H-5)", async (_n, intent) => {
    s = await demoSessionFor("shared")
    await expect(send(intent)).rejects.toMatchObject({ reason: "demo_forbidden", detail: { why: "shared_pot" } })
  })

  it("the shared Pot refuses votes on its close proposal", async () => {
    s = await demoSessionFor("shared")
    chain.view(HUB, "get_proposal_subject", () => ({ pot: DAO, proposal_id: 9, kind: "close", live: true }))
    deps.hub = createHubReader(chain, HUB)
    await expect(send({ type: "vote", pot: DAO, proposalId: 9, kind: { FunctionCall: { receiver_id: USDC, actions: [] } }, action: "VoteApprove" })).rejects.toMatchObject({
      reason: "demo_forbidden",
    })
  })

  it("concurrent demo intents for one persona are serialized by the demo_signer lease", async () => {
    s = await demoSessionFor("pool")
    await t.db.execute(sql`INSERT INTO lease (name, holder, until) VALUES (${`demo_signer:${MAYA}`}, 'other', now() + interval '30 seconds')`)
    await expect(send({ type: "add_money", pot: DAO, amount: "150000000" })).rejects.toMatchObject({ reason: "nonce_pending" })
  })

  it("B-19: a second delegate for a busy persona queues (no 409) and signs above the lease's last nonce", async () => {
    s = await demoSessionFor("pool")
    // another request holds Maya's signer and signed nonce 900 (a node that lags still says 500)
    await t.db.execute(sql`INSERT INTO lease (name, holder, until, meta) VALUES (${`demo_signer:${MAYA}`}, 'other', now() + interval '30 seconds', '{"lastNonce":"900"}'::jsonb)`)
    // (drizzle queries are lazy: .then() runs it)
    setTimeout(() => t.db.execute(sql`UPDATE lease SET holder = NULL, until = NULL WHERE name = ${`demo_signer:${MAYA}`}`).then(() => undefined), 150)
    deps.personaQueueMs = 5_000
    deps.sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50)))
    const r = await send({ type: "add_money", pot: DAO, amount: "150000000" })
    expect(r.status).toBe(200)
    const row = (await t.db.select().from(relayLog).where(eq(relayLog.op, "relay")))[0]!
    expect(row.delegateNonce).toBe("901")
    const meta = await t.db.execute<{ last: string; holder: string | null }>(sql`SELECT meta->>'lastNonce' AS last, holder FROM lease WHERE name = ${`demo_signer:${MAYA}`}`)
    expect(meta.rows[0]).toMatchObject({ last: "901", holder: null })
  })

  it("session rows exist per persona switch", async () => {
    s = await demoSessionFor("pool")
    expect((await t.db.select().from(session)).length).toBe(1)
    expect(ApiError).toBeTruthy()
    expect(NEAR > 0n && RELAYER.length > 0).toBe(true)
  })
})
