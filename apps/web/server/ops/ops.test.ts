// B-11 ops (cron auth, balance alerts, global caps, reconcile A-17, retention) against pot_test with a fake chain
// and a scripted submitter.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { chargeQuotas, readQuota } from "@/db/quota"
import { alertState, errorLog, pot, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import { createHubReader } from "../chain/hub"
import type { Config } from "../config"
import { limit } from "../quotas"
import type { RelayDeps } from "../relay/pipeline"
import { DAO, HUB, USDC } from "../testing/delegates"
import { insertUser, NEAR, potView, RELAYER, seedChain, testConfig, TREASURY } from "../testing/env"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../testing/fakeChain"
import { checkBalances, checkGlobalCaps, hubAllows, hubAllowsCreate, resetOpsCacheForTests, treasuryAllowsFaucet } from "./balances"
import { requireCron } from "./cron"
import { runReconcile } from "./reconcile"
import { runRetention } from "./retention"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deps: RelayDeps

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
    // APP-1: the hub (0.5 NEAR) can't pay today's hub cap above its floor either
    expect(r.alerts.sort()).toEqual(["cap_exceeds_balance:hub", "hub_low", "relayer_low", "treasury_low"])
    expect((await t.db.select().from(alertState)).map((a) => a.key).sort()).toEqual([
      "cap_exceeds_balance:hub",
      "hub_low",
      "relayer_low",
      "treasury_low",
    ])
    // deduped: a second check within the hour records nothing new
    await t.db.execute(sql`UPDATE alert_state SET last_sent_at = now()`)
    await checkBalances(deps)
    expect(await t.db.select().from(alertState)).toHaveLength(4)
  })

  it("APP-1: a relayer that can't pay today's cap above its floor alerts the team", async () => {
    chain.accounts.get(RELAYER)!.amount = NEAR + NEAR / 2n // 1.5 NEAR: floor 1 + preview cap 1 → short
    const r = await checkBalances(deps)
    expect(r.alerts).toContain("cap_exceeds_balance:relayer")
  })

  it("APP-1: hub-sponsored actions need the hub's floor plus their own cost", async () => {
    chain.accounts.get(HUB)!.amount = 2n * NEAR
    resetOpsCacheForTests()
    expect(await hubAllows(chain, cfg, NEAR / 2n)).toBe(true)
    expect(await hubAllows(chain, cfg, NEAR + NEAR / 2n)).toBe(false)
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
    const r1 = await runReconcile(deps, { holder: "run1", now })
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
    const r2 = await runReconcile(deps, { holder: "run2", now })
    expect(r2.pots).toMatchObject({ expiredSynced: 0, payoutRetries: 1 })
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["sync", "retry_payout", "retry_payout"])
    const syncRows = await t.db.select().from(relayLog).where(eq(relayLog.op, "sync"))
    expect(syncRows).toHaveLength(1)
    await runReconcile(deps, { holder: "run3", now })
    await runReconcile(deps, { holder: "run4", now })
    expect(sub.submitted.filter((s) => methodOf(s.spec) === "retry_payout")).toHaveLength(3) // ≤ 3 per proposal per UTC day
    expect(await readQuota(t.db, `proposal:${DAO}:2`, "finalize")).toBe(3n)
  })

  it("single-flight: a run while another holds cron:reconcile is skipped", async () => {
    chainWithRequests([])
    await t.db.execute(sql`INSERT INTO lease (name, holder, until) VALUES ('cron:reconcile', 'other', now() + interval '10 minutes')`)
    expect(await runReconcile(deps, { holder: "me" })).toMatchObject({ skipped: "busy" })
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
