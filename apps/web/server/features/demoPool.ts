// B-12 demo pool (api-spec §5.2, §5.3 step 6; D-33; rev4 H-5): keep DEMO_POOL_TARGET leasable seeded pool
// Pots, reseed tonight's shared Pot, retire expired leases. Not a Vercel Workflow: `workflow` needs
// `withWorkflow(nextConfig)` (next.config is not backend-owned) plus a deployed world, and this preview is
// never deployed (no Vercel in this phase). Instead the same idempotent steps run from
//   - GET /api/cron/demo-pool  (cron auth; its own 300 s budget) — Vercel cron and the demo session's after()
//   - GET /api/cron/reconcile  (step 6, with whatever budget is left)
//   - scripts/run demo-pool    (by hand / any cron)
// Every seed is resumable (`seedDemoPot` checks the chain and `demo_pot.seed_step` first), so a run cut short
// by its time budget is finished by the next one. A single-flight lease `refill_demo_pool` (10 min) prevents
// parallel refills; a seed is only started while ≥ SEED_BUDGET_MS of the run's budget is left.
import "server-only"
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm"
import { claimNamedLease, releaseLease } from "@/db/lease"
import { chargeQuotas, readQuota } from "@/db/quota"
import { demoPot } from "@/db/schema"
import { logError } from "../log"
import { limit } from "../quotas"
import { seedDemoPot, seedPlan, type SeedDeps, type SeedPlan } from "./seed"
import type { Persona } from "./demo"

/** One seed ≈ 15 txs ≈ 40-90 s on testnet (notes/backend.md wave 2). */
export const SEED_BUDGET_MS = 100_000
/** Persona onboarding the relayer pays outside the relay pipeline (3 × create + register ≈ 3 × 0.0085 NEAR),
 * charged to `global/demo_yocto` before a seed; the persona relays charge the rest themselves (H-5). */
const ONBOARD_YOCTO = 26n * 10n ** 21n
/** The whole seed's estimate (api-spec §5.2: ≈ 0.12 NEAR per Pot, hub float included). */
const SEED_EST_YOCTO = 120n * 10n ** 21n
/** The shared Pot is reseeded below $300 (rev4 H-5). */
export const SHARED_MIN_BALANCE = 300_000_000n
/** A seeding row that keeps failing for this long is marked failed (it no longer counts toward the target). */
const STUCK_SEED_MS = 60 * 60_000

export interface RefillReport {
  skipped?: "disabled" | "busy"
  ready: number
  seeding: number
  target: number
  resumed: string[]
  seeded: string[]
  failed: { slug: string; error: string }[]
  stopped?: "budget_time" | "demo_budget" | "max_seeds"
}

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10).replaceAll("-", "")

export function poolTarget(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.DEMO_POOL_TARGET ?? 3)
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 20) : 3
}

async function poolCounts(deps: SeedDeps) {
  const r = await deps.db.execute<{ ready: number; seeding: number }>(sql`
    SELECT count(*) FILTER (WHERE state = 'ready')::int AS ready, count(*) FILTER (WHERE state = 'seeding')::int AS seeding
    FROM demo_pot WHERE kind = 'pool'`)
  return { ready: r.rows[0]?.ready ?? 0, seeding: r.rows[0]?.seeding ?? 0 }
}

const planOf = (row: typeof demoPot.$inferSelect, hubId: string): SeedPlan => ({
  kind: row.kind,
  slug: row.slug,
  potId: row.potId ?? `${row.slug}.${hubId}`,
  personas: row.personas as Record<Persona, string>,
})

/** Charge the seed's off-pipeline costs to `global/demo_yocto`; false when the demo budget can't take a seed. */
async function demoBudgetAllows(deps: SeedDeps): Promise<boolean> {
  const cap = limit("global_demo_yocto")
  if ((await readQuota(deps.db, "global", "demo_yocto")) + SEED_EST_YOCTO > cap) return false
  const q = await chargeQuotas(deps.db, [{ subject: "global", action: "demo_yocto", amount: ONBOARD_YOCTO, limit: cap }])
  return q.ok
}

/**
 * Bring the pool to `target` ready+seeding Pots: resume unfinished seeds first, then create new ones, at most
 * `maxSeeds` per run (api-spec: 3) and only while the time budget allows another seed.
 */
export async function refillDemoPool(
  deps: SeedDeps,
  opts: { holder: string; target?: number; maxSeeds?: number; budgetMs?: number; now?: () => number; seed?: typeof seedDemoPot } = { holder: "refill" },
): Promise<RefillReport> {
  const seed = opts.seed ?? seedDemoPot
  const target = opts.target ?? poolTarget()
  const now = opts.now ?? Date.now
  const deadline = now() + (opts.budgetMs ?? 280_000)
  const report: RefillReport = { ready: 0, seeding: 0, target, resumed: [], seeded: [], failed: [] }
  if (!deps.cfg.flags.demo) return { ...report, skipped: "disabled" }
  if (!(await claimNamedLease(deps.db, "refill_demo_pool", opts.holder, 600))) {
    Object.assign(report, await poolCounts(deps))
    return { ...report, skipped: "busy" }
  }
  const maxSeeds = opts.maxSeeds ?? 3
  let started = 0
  const timeLeft = () => deadline - now() >= SEED_BUDGET_MS
  const run = async (plan: SeedPlan, list: string[]) => {
    started++
    try {
      await seed(deps, plan)
      list.push(plan.slug)
    } catch (e) {
      report.failed.push({ slug: plan.slug, error: String(e).slice(0, 200) })
      await logError({ route: "demo-pool", reason: "seed_failed", detail: { slug: plan.slug, err: String(e).slice(0, 300) } })
    }
  }
  try {
    // give up on seeds that kept failing for an hour (they stop counting toward the target)
    await deps.db
      .update(demoPot)
      .set({ state: "failed" })
      .where(and(eq(demoPot.kind, "pool"), eq(demoPot.state, "seeding"), lt(demoPot.createdAt, new Date(now() - STUCK_SEED_MS)), sql`${demoPot.seedError} IS NOT NULL`))
    // 1. resume unfinished pool seeds (a previous run ran out of time or failed mid-way)
    const unfinished = await deps.db.select().from(demoPot).where(and(eq(demoPot.kind, "pool"), eq(demoPot.state, "seeding"))).orderBy(demoPot.createdAt)
    for (const row of unfinished) {
      if (started >= maxSeeds) return Object.assign(report, { stopped: "max_seeds" as const })
      if (!timeLeft()) return Object.assign(report, { stopped: "budget_time" as const })
      await run(planOf(row, deps.cfg.hubId), report.resumed)
    }
    // 2. new Pots until ready + seeding reaches the target
    for (;;) {
      const c = await poolCounts(deps)
      Object.assign(report, c)
      if (c.ready + c.seeding >= target) return report
      if (started >= maxSeeds) return Object.assign(report, { stopped: "max_seeds" as const })
      if (!timeLeft()) return Object.assign(report, { stopped: "budget_time" as const })
      if (!(await demoBudgetAllows(deps))) {
        await logError({ route: "demo-pool", reason: "demo_budget" })
        return Object.assign(report, { stopped: "demo_budget" as const })
      }
      const before = report.failed.length
      await run(seedPlan("pool", deps.cfg), report.seeded)
      // a failure leaves its row `seeding` (resumed next run); don't spin on it in this run
      if (report.failed.length > before) return report
    }
  } finally {
    Object.assign(report, await poolCounts(deps).catch(() => ({})))
    await releaseLease(deps.db, "refill_demo_pool", opts.holder).catch(() => undefined)
  }
}

export interface SharedReport {
  action: "kept" | "seeded" | "skipped"
  why?: "nightly" | "missing" | "low_balance" | "not_open" | "disabled" | "busy" | "demo_budget" | "budget_time"
  slug?: string
  potId?: string
  error?: string
}

/**
 * The shared fallback Pot (D-33; rev4 H-5): a fresh `lisbon-<yyyymmdd>` every UTC day (the 04:00 cron), and a
 * reseed (`-<n>`) whenever the current one is below $300 or not open. Older shared rows are retired.
 */
export async function ensureSharedPot(
  deps: SeedDeps,
  opts: { holder: string; now?: Date; budgetMs?: number; seed?: typeof seedDemoPot } = { holder: "shared" },
): Promise<SharedReport> {
  if (!deps.cfg.flags.demo) return { action: "skipped", why: "disabled" }
  const today = utcDay(opts.now)
  const current = (
    await deps.db
      .select()
      .from(demoPot)
      .where(and(eq(demoPot.kind, "shared"), inArray(demoPot.state, ["ready", "leased", "seeding"])))
      .orderBy(desc(demoPot.createdAt))
      .limit(1)
  )[0]
  let why: SharedReport["why"]
  if (!current) why = "missing"
  else if (current.state === "seeding") why = undefined // resume it below
  else if (!current.slug.startsWith(`lisbon-${today}`)) why = "nightly"
  else {
    const [pv, bal] = await Promise.all([
      deps.hub.getPot(current.potId!, { fresh: true }).catch(() => null),
      deps.hub.ftBalanceOf(deps.cfg.usdcId, current.potId!).catch(() => null),
    ])
    if (pv && pv.status !== "open") why = "not_open"
    else if (bal !== null && bal < SHARED_MIN_BALANCE) why = "low_balance"
  }
  if (current && current.state !== "seeding" && !why) return { action: "kept", slug: current.slug, potId: current.potId ?? undefined }
  if ((opts.budgetMs ?? Infinity) < SEED_BUDGET_MS) return { action: "skipped", why: "budget_time" }
  if (!(await claimNamedLease(deps.db, "refill_demo_pool", opts.holder, 600))) return { action: "skipped", why: "busy" }
  try {
    let plan: SeedPlan
    if (current?.state === "seeding") plan = planOf(current, deps.cfg.hubId)
    else {
      if (!(await demoBudgetAllows(deps))) return { action: "skipped", why: "demo_budget" }
      const taken = new Set(
        (await deps.db.select({ slug: demoPot.slug }).from(demoPot).where(sql`${demoPot.slug} LIKE ${`lisbon-${today}%`}`)).map((r) => r.slug),
      )
      let slug = `lisbon-${today}`
      for (let n = 2; taken.has(slug); n++) slug = `lisbon-${today}-${n}`
      plan = seedPlan("shared", deps.cfg, { slug })
    }
    try {
      await (opts.seed ?? seedDemoPot)(deps, plan)
    } catch (e) {
      await logError({ route: "demo-pool", reason: "shared_seed_failed", detail: { slug: plan.slug, err: String(e).slice(0, 300) } })
      return { action: "skipped", why, slug: plan.slug, error: String(e).slice(0, 200) }
    }
    const fresh = (await deps.db.select().from(demoPot).where(eq(demoPot.slug, plan.slug)).limit(1))[0]!
    await deps.db
      .update(demoPot)
      .set({ state: "retired", retiredAt: new Date() })
      .where(and(eq(demoPot.kind, "shared"), inArray(demoPot.state, ["ready", "leased"]), sql`${demoPot.id} <> ${fresh.id}`))
    return { action: "seeded", why: why ?? "missing", slug: plan.slug, potId: plan.potId }
  } finally {
    await releaseLease(deps.db, "refill_demo_pool", opts.holder).catch(() => undefined)
  }
}

/** Retire pool leases past `lease_until` and drop their demo push subscriptions (data-model §4). */
export async function retireExpiredLeases(db: SeedDeps["db"]): Promise<{ retired: number; pushDeleted: number }> {
  const retired = await db
    .update(demoPot)
    .set({ state: "retired", retiredAt: new Date() })
    .where(and(eq(demoPot.kind, "pool"), eq(demoPot.state, "leased"), lt(demoPot.leaseUntil, new Date())))
    .returning({ id: demoPot.id })
  const gone = await db.execute(sql`
    DELETE FROM push_subscription WHERE demo_pot_id IN (SELECT id FROM demo_pot WHERE state = 'retired')`)
  return { retired: retired.length, pushDeleted: gone.rowCount ?? 0 }
}
