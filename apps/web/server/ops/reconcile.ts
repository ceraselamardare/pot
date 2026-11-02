// B-11 reconcile cron (api-spec §5.3; GET /api/cron/reconcile, daily `0 4 * * *` on Hobby). Single-flight lease
// `cron:reconcile` (15 min); every step is idempotent (A-17: running it twice has no double effects), time-boxed
// by the run's budget, and logged to error_log on failure without stopping the others.
//   1. stale relays: lost broadcasts → failed (expired / lost_broadcast), landed ones classified (B-09)
//   2. open Pots (activity ≤ 14 days): expired vote requests → `sync` (→ "expired" push); payout_failed
//      requests → `retry_payout` when the DAO's USDC covers them (≤ 3 per proposal per UTC day, shared with
//      Finalize); missed "needs your approval" pushes re-sent (notification_log dedupes)
//   2b. hub 1.1.0: missed all-or-nothing goals → refund_unfunded (propose, then approve; back-off: ops/goals.ts)
//   3. balances (relayer / hub / treasury) and global daily caps → alerts
//   4. retention deletes
//   5. pay by link (hub 1.1.0): expired, unclaimed links go back to their Pots (reclaim_link, ≤ 10 per run; ops/links.ts)
// (The demo-only steps, DAO float top-ups for demo Pots and the demo pool refill, were removed in Rev 9.)
import "server-only"
import { and, gt, inArray, sql } from "drizzle-orm"
import { claimNamedLease, releaseLease } from "@/db/lease"
import { chargeQuotas } from "@/db/quota"
import { pot } from "@/db/schema"
import { logError } from "../log"
import { notify } from "../notify/notify"
import { limit } from "../quotas"
import { serverRetryPayout, serverSync, type RelayDeps } from "../relay/pipeline"
import { reconcileStaleRelays } from "../relay/reconcile"
import { checkBalances, checkGlobalCaps, type BalanceReport } from "./balances"
import { refundUnfundedGoals, type GoalsReport } from "./goals"
import { runRetention } from "./retention"
import { reclaimExpiredLinks, type ReclaimReport } from "./links"
import { errText } from "../util/errtext"

export interface ReconcileReport {
  skipped?: "busy"
  ms: number
  relays?: Awaited<ReturnType<typeof reconcileStaleRelays>>
  pots?: { scanned: number; expiredSynced: number; payoutRetries: number; approvalPushes: number }
  goals?: GoalsReport
  balances?: BalanceReport
  caps?: Awaited<ReturnType<typeof checkGlobalCaps>>
  retention?: Record<string, number>
  links?: ReclaimReport
  errors: string[]
}

export async function runReconcile(
  deps: RelayDeps,
  opts: { holder: string; budgetMs?: number; now?: Date } = { holder: "cron" },
): Promise<ReconcileReport> {
  const started = Date.now()
  const report: ReconcileReport = { ms: 0, errors: [] }
  if (!(await claimNamedLease(deps.db, "cron:reconcile", opts.holder, 15 * 60))) return { ...report, skipped: "busy" }
  // server follow-ups are keyed by cause: one per run (a later run re-reads the chain, so an expired request
  // that was synced is no longer open; payout retries are bounded by the shared ≤ 3/proposal/day quota)
  const cause = `cron:${(opts.now ?? new Date()).toISOString().slice(0, 10)}`
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (e) {
      report.errors.push(`${name}: ${errText(e, 160)}`)
      await logError({ route: "cron:reconcile", reason: `${name}_failed`, detail: { err: errText(e, 300) } })
      return undefined
    }
  }
  try {
    report.relays = await step("relays", () => reconcileStaleRelays(deps, { requestId: opts.holder }))
    report.pots = await step("pots", () => reconcilePots(deps, `${cause}:${opts.holder}`))
    report.goals = await step("goals", () => refundUnfundedGoals(deps, `${cause}:${opts.holder}`, (opts.now ?? new Date()).getTime()))
    report.balances = await step("balances", () => checkBalances(deps))
    report.caps = await step("caps", () => checkGlobalCaps(deps.db))
    report.retention = await step("retention", () => runRetention(deps.db))
    report.links = await step("links", () => reclaimExpiredLinks(deps, `${cause}:${opts.holder}`))
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
