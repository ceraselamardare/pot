// B-11 ops (cron auth, balance alerts, global caps, reconcile A-17, DAO top-ups, retention) and B-12 demo pool
// (refill, shared Pot, lease retirement) against pot_test with a fake chain, a scripted submitter and a fake
// seeder (seedDemoPot itself is exercised live: server/live/demo.live.test.ts and scripts/run demo-pool).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { chargeQuotas, readQuota } from "@/db/quota"
import { alertState, demoPot, errorLog, pot, pushSubscription, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import type { PoolKey } from "../chain/keys"
import type { Config } from "../config"
import { ensureSharedPot, refillDemoPool, retireExpiredLeases } from "../features/demoPool"
import type { SeedDeps, SeedPlan } from "../features/seed"
import { limit } from "../quotas"
import { DAO, HUB, USDC } from "../testing/delegates"
import { insertUser, NEAR, potView, RELAYER, seedChain, testConfig, TREASURY } from "../testing/env"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../testing/fakeChain"
import { checkBalances, checkGlobalCaps, hubAllowsCreate, resetOpsCacheForTests, treasuryAllowsFaucet } from "./balances"
import { requireCron } from "./cron"
import { runReconcile, topUpDemoDaos } from "./reconcile"
import { runRetention } from "./retention"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deps: SeedDeps

beforeAll(async () => {
  t = await createTestDb("ops")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig({ RELAYER_FLOOR_NEAR: "1", RELAYER_CRITICAL_NEAR: "2", RELAYER_WARN_NEAR: "5" })
  resetBalanceCacheForTests()
  resetOpsCacheForTests()
  chain = seedChain(new FakeChain())
  chain.account(TREASURY, { amount: NEAR })
  chain.view(USDC, "ft_balance_of", (a) => (a.account_id === TREASURY ? "500000000000" : a.account_id === DAO ? "450000000" : "0"))
  sub = new FakeSubmitter((spec) => plainOutcome("x", spec.signerId, spec.receiverId))
  deps = {
    db: t.db,
    rpc: chain,
    hub: createHubReader(chain, HUB),
    submitter: sub,
    cfg,
    defer: () => undefined,
    sleep: async () => undefined,
    personaKey: { publicKey: "ed25519:x" } as unknown as PoolKey,
    secret: "s".repeat(40),
  }
})

describe("cron auth", () => {
  const req = (h?: string) => new Request("https://pot.test/api/cron/reconcile", { headers: h ? { authorization: h } : {} })
  it("needs Bearer CRON_SECRET (≥ 16 chars); refuses everything without one", () => {
    expect(() => requireCron(req("Bearer x"), undefined)).toThrow(expect.objectContaining({ reason: "not_signed_in" }))
    expect(() => requireCron(req(), "c".repeat(32))).toThrow(expect.objectContaining({ reason: "not_signed_in" }))
    expect(() => requireCron(req(`Bearer ${"d".repeat(32)}`), "c".repeat(32))).toThrow()
    expect(() => requireCron(req(`Bearer ${"c".repeat(32)}`), "c".repeat(32))).not.toThrow()
  })
})

describe("balances and caps (api-spec §3.5)", () => {
  it("relayer / hub / treasury lows alert once per hour per key", async () => {
    chain.accounts.get(RELAYER)!.amount = 3n * NEAR // < warn 5
    chain.accounts.get(HUB)!.amount = NEAR / 2n // < hub floor (1 NEAR) → critical
    chain.view(USDC, "ft_balance_of", () => "50000000000") // $50k < $100k
    const r = await checkBalances(deps)
    expect(r).toMatchObject({ relayer: { level: "low" }, hub: { level: "critical" }, treasury: { level: "low" } })
    expect(r.alerts.sort()).toEqual(["hub_low", "relayer_low", "treasury_low"])
    expect((await t.db.select().from(alertState)).map((a) => a.key).sort()).toEqual(["hub_low", "relayer_low", "treasury_low"])
    // deduped: a second check within the hour records nothing new
    await t.db.execute(sql`UPDATE alert_state SET last_sent_at = now()`)
    await checkBalances(deps)
    expect(await t.db.select().from(alertState)).toHaveLength(3)
  })

  it("create_pot is refused below the hub floor; the faucet is off below the critical treasury float", async () => {
    expect(await hubAllowsCreate(chain, cfg)).toBe(true)
    expect(await treasuryAllowsFaucet(chain, cfg)).toBe(true)
    resetOpsCacheForTests()
    chain.accounts.get(HUB)!.amount = NEAR / 2n
    chain.view(USDC, "ft_balance_of", () => "999000000") // $999 < $1,000
    expect(await hubAllowsCreate(chain, cfg)).toBe(false)
    expect(await treasuryAllowsFaucet(chain, cfg)).toBe(false)
  })

  it("global caps: ≥ 80 % of a daily cap alerts (hub_yocto → hub_budget)", async () => {
    await chargeQuotas(t.db, [{ subject: "global", action: "hub_yocto", amount: (limit("global_hub_yocto") * 81n) / 100n, limit: limit("global_hub_yocto") }])
    await chargeQuotas(t.db, [{ subject: "global", action: "relays", amount: 5n, limit: limit("global_relays") }])
    const r = await checkGlobalCaps(t.db)
    expect(r.alerts).toEqual(["hub_budget"])
    expect(r.counters.hub_yocto!.pct).toBeGreaterThanOrEqual(80)
    expect(r.counters.relays).toMatchObject({ used: "5" })
  })
})

describe("reconcile cron (api-spec §5.3, A-17)", () => {
  function chainWithRequests(reqs: Record<string, unknown>[]) {
    chain.view(HUB, "get_pot", (a) => (a.pot === DAO ? potView({ request_count: reqs.length }) : null))
    chain.view(HUB, "get_requests", () => reqs)
    deps.hub = createHubReader(chain, HUB)
  }
  beforeEach(async () => {
    await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: "m", lastActivityAt: new Date() })
  })

  it("expired vote requests → sync; payout_failed → retry_payout when the DAO covers it; twice = no double effects", async () => {
    chainWithRequests([
      { request_id: 0, proposal_id: 1, requester: "m", amount: "300000000", category: "tickets", path: "vote", status: "approving", expires_at_ms: Date.now() - 1000 },
      { request_id: 1, proposal_id: 2, requester: "m", amount: "84000000", category: "food", path: "instant", status: "payout_failed", expires_at_ms: 0 },
      { request_id: 2, proposal_id: 3, requester: "m", amount: "900000000", category: "stay", path: "instant", status: "payout_failed", expires_at_ms: 0 },
      { request_id: 3, proposal_id: 4, requester: "m", amount: "50000000", category: "food", path: "vote", status: "approving", expires_at_ms: Date.now() + 86_400_000 },
    ])
    const now = new Date()
    const r1 = await runReconcile({ ...deps, seed: null }, { holder: "run1", demo: false, now })
    expect(r1.errors).toEqual([])
    expect(r1.pots).toMatchObject({ scanned: 1, expiredSynced: 1, payoutRetries: 1 }) // $900 > the DAO's $450: not retried
    expect(sub.submitted.map((s) => [methodOf(s.spec), (s.spec.actions[0] as unknown as { functionCall: { args: Uint8Array } }).functionCall.args.length > 0])).toEqual([
      ["sync", true],
      ["retry_payout", true],
    ])
    expect(r1.balances?.relayer.level).toBe("ok")
    expect(r1.retention).toBeDefined()
    // the chain now shows the expired request as expired (the sync recorded it); the payout still failed
    chainWithRequests([
      { request_id: 0, proposal_id: 1, requester: "m", amount: "300000000", category: "tickets", path: "vote", status: "expired", expires_at_ms: Date.now() - 1000 },
      { request_id: 1, proposal_id: 2, requester: "m", amount: "84000000", category: "food", path: "instant", status: "payout_failed", expires_at_ms: 0 },
    ])
    // A-17: a second run re-syncs nothing; payout retries share the ≤ 3/proposal/day quota with Finalize
    const r2 = await runReconcile({ ...deps, seed: null }, { holder: "run2", demo: false, now })
    expect(r2.pots).toMatchObject({ expiredSynced: 0, payoutRetries: 1 })
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["sync", "retry_payout", "retry_payout"])
    const syncRows = await t.db.select().from(relayLog).where(eq(relayLog.op, "sync"))
    expect(syncRows).toHaveLength(1)
    await runReconcile({ ...deps, seed: null }, { holder: "run3", demo: false, now })
    await runReconcile({ ...deps, seed: null }, { holder: "run4", demo: false, now })
    expect(sub.submitted.filter((s) => methodOf(s.spec) === "retry_payout")).toHaveLength(3) // ≤ 3 per proposal per UTC day
    expect(await readQuota(t.db, `proposal:${DAO}:2`, "finalize")).toBe(3n)
  })

  it("single-flight: a run while another holds cron:reconcile is skipped", async () => {
    chainWithRequests([])
    await t.db.execute(sql`INSERT INTO lease (name, holder, until) VALUES ('cron:reconcile', 'other', now() + interval '10 minutes')`)
    expect(await runReconcile({ ...deps, seed: null }, { holder: "me", demo: false })).toMatchObject({ skipped: "busy" })
  })

  it("DAO float top-ups: demo/reference Pots only, ≤ 2 per DAO lifetime", async () => {
    const demoDao = `lisbon-k1.${HUB}`
    chain.account(demoDao, { amount: NEAR / 100n }) // ≈ 0.01 NEAR available
    chain.accounts.get(demoDao)!.storage = 0
    chain.accounts.get(DAO)!.amount = NEAR / 100n // a user Pot: never topped up
    chain.accounts.get(DAO)!.storage = 0
    await t.db.insert(demoPot).values({ kind: "pool", slug: "lisbon-k1", potId: demoDao, personas: {}, state: "ready" })
    expect((await topUpDemoDaos(deps, "h1")).toppedUp).toEqual([demoDao])
    await t.db.execute(sql`DELETE FROM lease WHERE name LIKE 'topup:%'`)
    expect((await topUpDemoDaos(deps, "h2")).toppedUp).toEqual([demoDao])
    await t.db.execute(sql`DELETE FROM lease WHERE name LIKE 'topup:%'`)
    expect((await topUpDemoDaos(deps, "h3")).toppedUp).toEqual([]) // lifetime cap
    expect(sub.submitted.map((s) => s.spec.receiverId)).toEqual([demoDao, demoDao])
    expect(await readQuota(t.db, "global", "topup_yocto")).toBe(NEAR / 10n)
  })

  it("retention deletes old rows in batches", async () => {
    await t.db.insert(errorLog).values({ route: "x", at: new Date(Date.now() - 15 * 86_400_000) })
    await t.db.insert(errorLog).values({ route: "fresh" })
    const { user } = await insertUser(t.db, { account: "u.potapp.testnet" })
    await t.db.insert(relayLog).values({ id: "rl_old", requestId: "x", op: "sync", receiverId: HUB, status: "executed", response: { ok: true }, createdAt: new Date(Date.now() - 8 * 86_400_000) })
    void user
    const r = await runRetention(t.db)
    expect(r.error_log).toBe(1)
    expect(r["relay_log.response"]).toBe(1)
    expect((await t.db.select().from(errorLog)).map((e) => e.route)).toEqual(["fresh"])
    expect(Object.values(r).every((n) => n >= 0)).toBe(true)
  })
})

describe("demo pool (B-12)", () => {
  /** A fake seedDemoPot: inserts/updates the demo_pot row like the real one (rows `seeding` → `ready`). */
  const seeded: string[] = []
  const fakeSeed = (fail?: (p: SeedPlan) => boolean) =>
    (async (d: SeedDeps, plan: SeedPlan) => {
      seeded.push(plan.slug)
      const row = (await d.db.select().from(demoPot).where(eq(demoPot.slug, plan.slug)))[0]
      if (!row) await d.db.insert(demoPot).values({ kind: plan.kind, slug: plan.slug, potId: plan.potId, personas: plan.personas, state: "seeding" })
      if (fail?.(plan)) throw new Error("chain hiccup")
      await d.db.update(demoPot).set({ state: "ready", seedStep: 8, seededAt: new Date() }).where(eq(demoPot.slug, plan.slug))
      return {} as never
    }) as never
  beforeEach(() => {
    seeded.length = 0
  })

  it("tops the pool up to the target, resuming unfinished seeds first; ≤ maxSeeds per run", async () => {
    await t.db.insert(demoPot).values({ kind: "pool", slug: "lisbon-aaaa", potId: `lisbon-aaaa.${HUB}`, personas: {}, state: "ready" })
    await t.db.insert(demoPot).values({ kind: "pool", slug: "lisbon-half", potId: `lisbon-half.${HUB}`, personas: {}, state: "seeding", seedStep: 4 })
    const r = await refillDemoPool(deps, { holder: "h", target: 3, seed: fakeSeed() })
    expect(r.resumed).toEqual(["lisbon-half"])
    expect(r.seeded).toHaveLength(1)
    expect(r).toMatchObject({ ready: 3, seeding: 0, target: 3 })
    // at target: nothing to do
    expect((await refillDemoPool(deps, { holder: "h", target: 3, seed: fakeSeed() })).seeded).toEqual([])
    // a bigger target is capped by maxSeeds per run
    const big = await refillDemoPool(deps, { holder: "h", target: 10, maxSeeds: 2, seed: fakeSeed() })
    expect(big).toMatchObject({ stopped: "max_seeds", ready: 5 })
    // the demo budget (global demo_yocto) stops a refill
    const used = await readQuota(t.db, "global", "demo_yocto")
    await chargeQuotas(t.db, [{ subject: "global", action: "demo_yocto", amount: limit("global_demo_yocto") - used, limit: limit("global_demo_yocto") }])
    expect(await refillDemoPool(deps, { holder: "h", target: 10, seed: fakeSeed() })).toMatchObject({ stopped: "demo_budget" })
  })

  it("single-flight lease; a failed seed stays `seeding` for the next run; time budget respected", async () => {
    await t.db.execute(sql`INSERT INTO lease (name, holder, until) VALUES ('refill_demo_pool', 'x', now() + interval '5 minutes')`)
    expect(await refillDemoPool(deps, { holder: "h", target: 3, seed: fakeSeed() })).toMatchObject({ skipped: "busy" })
    await t.db.execute(sql`DELETE FROM lease`)
    const r = await refillDemoPool(deps, { holder: "h", target: 3, seed: fakeSeed(() => true) })
    expect(r.failed).toHaveLength(1)
    expect(r).toMatchObject({ ready: 0, seeding: 1 })
    expect(await refillDemoPool(deps, { holder: "h", target: 3, budgetMs: 1_000, seed: fakeSeed() })).toMatchObject({ stopped: "budget_time" })
    const again = await refillDemoPool(deps, { holder: "h", target: 3, seed: fakeSeed() })
    expect(again.resumed).toEqual([r.failed[0]!.slug])
    expect(again.ready).toBe(3)
  })

  it("shared Pot: seeded nightly as lisbon-<yyyymmdd>, kept the same day, reseeded (-2) below $300; older retired", async () => {
    const day = new Date("2026-11-08T04:00:00Z")
    const first = await ensureSharedPot(deps, { holder: "h", now: day, seed: fakeSeed() })
    expect(first).toMatchObject({ action: "seeded", why: "missing", slug: "lisbon-20261108" })
    chain.view(HUB, "get_pot", () => potView({ status: "open" }))
    chain.view(USDC, "ft_balance_of", () => "450000000")
    deps.hub = createHubReader(chain, HUB)
    expect(await ensureSharedPot(deps, { holder: "h", now: day, seed: fakeSeed() })).toMatchObject({ action: "kept", slug: "lisbon-20261108" })
    chain.view(USDC, "ft_balance_of", () => "120000000") // $120 < $300
    deps.hub = createHubReader(chain, HUB)
    expect(await ensureSharedPot(deps, { holder: "h", now: day, seed: fakeSeed() })).toMatchObject({ action: "seeded", why: "low_balance", slug: "lisbon-20261108-2" })
    const next = await ensureSharedPot(deps, { holder: "h", now: new Date("2026-11-09T04:00:00Z"), seed: fakeSeed() })
    expect(next).toMatchObject({ action: "seeded", why: "nightly", slug: "lisbon-20261109" })
    const rows = await t.db.select().from(demoPot).where(eq(demoPot.kind, "shared"))
    expect(rows.filter((r) => r.state === "ready").map((r) => r.slug)).toEqual(["lisbon-20261109"])
  })

  it("expired leases retire and their demo push subscriptions go", async () => {
    const [row] = await t.db
      .insert(demoPot)
      .values({ kind: "pool", slug: "lisbon-old", potId: `lisbon-old.${HUB}`, personas: {}, state: "leased", leaseUntil: new Date(Date.now() - 1000) })
      .returning()
    const { user } = await insertUser(t.db, { account: "maya-old.users.potapp.testnet", kind: "demo" })
    await t.db.insert(pushSubscription).values({ userId: user.id, endpoint: "https://fcm.googleapis.com/d", p256dh: "p", auth: "a", demoPotId: row!.id })
    expect(await retireExpiredLeases(t.db)).toEqual({ retired: 1, pushDeleted: 1 })
    expect((await t.db.select().from(demoPot))[0]!.state).toBe("retired")
  })
})
