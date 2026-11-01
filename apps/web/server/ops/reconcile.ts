// B-11 reconcile cron (api-spec §5.3; GET /api/cron/reconcile, daily `0 4 * * *` on Hobby). Single-flight lease
// `cron:reconcile` (15 min); every step is idempotent (A-17: running it twice has no double effects), time-boxed
// by the run's budget, and logged to error_log on failure without stopping the others.
//   1. stale relays: lost broadcasts → failed (expired / lost_broadcast), landed ones classified (B-09)
//   2. open Pots (activity ≤ 14 days): expired vote requests → `sync` (→ "expired" push); payout_failed
//      requests → `retry_payout` when the DAO's USDC covers them (≤ 3 per proposal per UTC day, shared with
//      Finalize); missed "needs your approval" pushes re-sent (notification_log dedupes)
//   3. balances (relayer / hub / treasury) and global daily caps → alerts
//   4. DAO float top-ups: demo and reference Pots only, ≤ 2 per DAO lifetime (rev4 M-4)
//   5. demo: retire expired leases, tonight's shared Pot, refill the pool (B-12; with the budget left)
//   6. retention deletes
import "server-only"
import { and, eq, gt, inArray, sql } from "drizzle-orm"
import { actions } from "near-api-js"
import { claimNamedLease, releaseLease } from "@/db/lease"
import { chargeQuotas } from "@/db/quota"
import { demoPot, pot, relayLog } from "@/db/schema"
import { availableYocto, viewAccount } from "../chain/near"
import { firstFailure } from "../chain/outcome"
import { ensureSharedPot, refillDemoPool, retireExpiredLeases, SEED_BUDGET_MS, type RefillReport, type SharedReport } from "../features/demoPool"
import type { SeedDeps } from "../features/seed"
import { logError } from "../log"
import { notify } from "../notify/notify"
import { limit } from "../quotas"
import { serverRetryPayout, serverSync, type RelayDeps } from "../relay/pipeline"
import { reconcileStaleRelays } from "../relay/reconcile"
import { newRelayId } from "../util/crypto"
import { checkBalances, checkGlobalCaps, type BalanceReport } from "./balances"
import { runRetention } from "./retention"

const NEAR = 10n ** 24n
export const TOPUP_BELOW = NEAR / 50n // 0.02 NEAR
export const TOPUP_AMOUNT = NEAR / 20n // 0.05 NEAR
export const MAX_TOPUPS_PER_DAO = 2

export interface ReconcileReport {
  skipped?: "busy"
  ms: number
  relays?: Awaited<ReturnType<typeof reconcileStaleRelays>>
  pots?: { scanned: number; expiredSynced: number; payoutRetries: number; approvalPushes: number }
  balances?: BalanceReport
  caps?: Awaited<ReturnType<typeof checkGlobalCaps>>
  topups?: { checked: number; toppedUp: string[] }
  demo?: { retired: number; pushDeleted: number; shared?: SharedReport; refill?: RefillReport }
  retention?: Record<string, number>
  errors: string[]
}

export async function runReconcile(
  deps: RelayDeps & { seed?: SeedDeps | null },
  opts: { holder: string; budgetMs?: number; demo?: boolean; now?: Date } = { holder: "cron" },
): Promise<ReconcileReport> {
  const started = Date.now()
  const deadline = started + (opts.budgetMs ?? 280_000)
  const report: ReconcileReport = { ms: 0, errors: [] }
  if (!(await claimNamedLease(deps.db, "cron:reconcile", opts.holder, 15 * 60))) return { ...report, skipped: "busy" }
  // server follow-ups are keyed by cause: one per run (a later run re-reads the chain, so an expired request
  // that was synced is no longer open; payout retries are bounded by the shared ≤ 3/proposal/day quota)
  const cause = `cron:${(opts.now ?? new Date()).toISOString().slice(0, 10)}`
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (e) {
      report.errors.push(`${name}: ${String(e).slice(0, 160)}`)
      await logError({ route: "cron:reconcile", reason: `${name}_failed`, detail: { err: String(e).slice(0, 300) } })
      return undefined
    }
  }
  try {
    report.relays = await step("relays", () => reconcileStaleRelays(deps, { requestId: opts.holder }))
    report.pots = await step("pots", () => reconcilePots(deps, `${cause}:${opts.holder}`))
    report.balances = await step("balances", () => checkBalances(deps))
    report.caps = await step("caps", () => checkGlobalCaps(deps.db))
    report.topups = await step("topups", () => topUpDemoDaos(deps, opts.holder))
    if (opts.demo !== false && deps.seed) {
      const seed = deps.seed
      report.demo = await step("demo", async () => {
        const r = await retireExpiredLeases(deps.db)
        const shared = await ensureSharedPot(seed, { holder: opts.holder, now: opts.now, budgetMs: deadline - Date.now() })
        const left = deadline - Date.now()
        const refill = left >= SEED_BUDGET_MS ? await refillDemoPool(seed, { holder: opts.holder, budgetMs: left - 20_000 }) : undefined
        return { ...r, shared, refill }
      })
    }
    report.retention = await step("retention", () => runRetention(deps.db))
  } finally {
    await releaseLease(deps.db, "cron:reconcile", opts.holder).catch(() => undefined)
    report.ms = Date.now() - started
  }
  return report
}

/** Step 2 over the `pot` cache: open (or closing) Pots with activity in the last 14 days. */
async function reconcilePots(deps: RelayDeps, cause: string) {
  const out = { scanned: 0, expiredSynced: 0, payoutRetries: 0, approvalPushes: 0 }
  const pots = await deps.db
    .select({ daoId: pot.daoId })
    .from(pot)
    .where(and(inArray(pot.status, ["open", "closing"]), gt(pot.lastActivityAt, sql`now() - interval '14 days'`)))
    .limit(200)
  const now = Date.now()
  for (const { daoId } of pots) {
    out.scanned++
    const v = await deps.hub.getPot(daoId, { fresh: true }).catch(() => null)
    if (!v || v.status === "closed") continue
    const reqs = await deps.hub.getRequests(daoId, Math.max(0, v.request_count - 50), 50).catch(() => [])
    let usdc: bigint | null = null
    for (const r of reqs) {
      if (r.proposal_id === null) continue
      const open = r.status === "approving" || r.status === "pending"
      if (open && r.expires_at_ms > 0 && r.expires_at_ms < now) {
        await serverSync(deps, daoId, r.proposal_id, cause)
        out.expiredSynced++
      } else if (open && r.path === "vote" && deps.push) {
        const n = await notify(
          { db: deps.db, hub: deps.hub, cfg: deps.cfg, sender: deps.push },
          { type: "approval_needed", subject: "spend", pot: daoId, proposalId: r.proposal_id, actor: r.requester, amount: r.amount, category: r.category },
        )
        out.approvalPushes += n.sent
      } else if (r.status === "payout_failed") {
        usdc ??= await deps.hub.ftBalanceOf(deps.cfg.usdcId, daoId).catch(() => 0n)
        if (usdc < BigInt(r.amount)) continue
        const q = await chargeQuotas(deps.db, [
          { subject: `proposal:${daoId}:${r.proposal_id}`, action: "finalize", amount: 1n, limit: limit("proposal_finalize") },
        ])
        if (!q.ok) continue
        await serverRetryPayout(deps, daoId, r.proposal_id, cause)
        usdc -= BigInt(r.amount)
        out.payoutRetries++
      }
    }
  }
  return out
}

/** Step 4 (api-spec §3.5; rev4 M-4): DAO float backstop for demo and reference Pots only, ≤ 2 per DAO ever. */
export async function topUpDemoDaos(deps: RelayDeps, holder: string): Promise<{ checked: number; toppedUp: string[] }> {
  const { db, cfg, rpc } = deps
  const rows = await db
    .select({ potId: demoPot.potId })
    .from(demoPot)
    .where(and(inArray(demoPot.state, ["ready", "leased"]), sql`${demoPot.potId} IS NOT NULL`))
  const daos = [...new Set([...rows.map((r) => r.potId!), ...(cfg.demoReferencePot ? [cfg.demoReferencePot] : [])])]
  const out = { checked: 0, toppedUp: [] as string[] }
  for (const dao of daos) {
    out.checked++
    const a = await viewAccount(rpc, dao, "optimistic").catch(() => null)
    if (!a || availableYocto(a) >= TOPUP_BELOW) continue
    const done = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM relay_log WHERE op = 'dao_topup' AND receiver_id = ${dao} AND status <> 'failed'`)
    if ((done.rows[0]?.n ?? 0) >= MAX_TOPUPS_PER_DAO) continue
    if (!(await claimNamedLease(db, `topup:${dao}`, holder, 3600))) continue
    const q = await chargeQuotas(db, [{ subject: "global", action: "topup_yocto", amount: TOPUP_AMOUNT, limit: limit("global_topup_yocto") }])
    if (!q.ok) break
    const id = newRelayId()
    await db.insert(relayLog).values({
      id,
      requestId: holder,
      op: "dao_topup",
      idempotencyKey: `topup:${dao}:${(done.rows[0]?.n ?? 0) + 1}`,
      senderId: cfg.relayerAccountId,
      receiverId: dao,
      methods: ["transfer"],
      potId: dao,
      status: "validated",
      estYocto: TOPUP_AMOUNT.toString(),
    })
    const r = await deps.submitter.submit(
      { signerId: cfg.relayerAccountId, receiverId: dao, actions: [actions.transfer(TOPUP_AMOUNT)] },
      { pool: cfg.relayerPool, holder: id, budgetMs: 20_000 },
    )
    const failed = r.kind === "outcome" && !!firstFailure(r.outcome)
    await db
      .update(relayLog)
      .set({ status: r.kind === "pending" ? "pending" : failed ? "failed" : "executed", outerTxHash: r.txHash, finishedAt: new Date() })
      .where(eq(relayLog.id, id))
    if (!failed) out.toppedUp.push(dao)
  }
  return out
}
