// hub 1.1.0 all-or-nothing goal: the daily safety net that refunds Pots whose goal date passed short
// (notes/contracts-wave4.md §3 refund_unfunded, D4-7, open question 6). A reconcile step (reconcile.ts):
//  - every open/closing Pot in the `pot` cache is asked `get_goal` (a 1.0.0 hub has no such view: the step stops);
//  - `can_refund` + state `refundable` → phase 1 (the hub proposes the pro-rata refund close: everyone gets back what
//    they put in), then at once phase 2 when the re-read says `refunding` (the hub approves it as rulebot; on a
//    Failed close it Finalizes). Two transactions, because the approving vote of a 40-payee close needs ≈ 255 Tgas.
//  - back-off: members can reject the hub's refund close by majority, and each phase 1 costs the hub a close prepay.
//    After a rejected refund (state refundable again with a refund_proposal_id) we wait 1, 2, 4… days since our last
//    proposal, and stop after MAX_REFUND_PROPOSALS (an alert says so; a person can still close the Pot normally).
// Signed like the server's sync / retry_payout (pipeline.ts serverHubCall): a relayer key from RELAYER_KEYS through
// the submitter, `refund_unfunded` relay_log rows (op), never relayed for users (policy.ts). No key is read here.
import "server-only"
import { and, count, eq, inArray, max } from "drizzle-orm"
import { actions as nearActions } from "near-api-js"
import { pot, relayLog } from "@/db/schema"
import { sendAlert } from "../alerts"
import { viewFunction } from "../chain/near"
import { burnt, trustedEvents } from "../chain/outcome"
import { logError } from "../log"
import { notifyFromEvents } from "../notify/notify"
import { closePayees, registerPayees } from "../features/registration"
import { applyHubEvents } from "../relay/effects"
import { blockTimes, type RelayDeps } from "../relay/pipeline"
import { TGAS } from "../relay/policy"
import { newRelayId } from "../util/crypto"
import { errText } from "../util/errtext"

/** get_goal as the hub returns it (sdk RawGoalView, the fields this step reads). */
export interface GoalRow {
  pot: string
  state: "collecting" | "reached" | "missed" | "refundable" | "refunding" | "refunded"
  refund_proposal_id: number | null
  can_refund: boolean
  all_or_nothing?: boolean
  deadline_ms?: number
}

export const MAX_REFUND_PROPOSALS = 4
const DAY_MS = 86_400_000
/** refund_unfunded at 300 Tgas (sdk GAS.refund_unfunded; phase 2's vote is 20 + 6·n ≤ 265) */
export const REFUND_GAS_TGAS = 300n

export type RefundStep =
  | { action: "none" }
  | { action: "propose" }
  | { action: "approve" }
  | { action: "wait"; untilMs: number }
  | { action: "give_up" }

/**
 * What to do for one Pot's goal now. `proposals` = refund closes we proposed before (relay_log), `lastAt` the newest.
 * Pure (unit-tested): the back-off is 2^(n-1) days after the n-th rejected refund, at most MAX_REFUND_PROPOSALS.
 */
export function refundStep(g: GoalRow | null, history: { proposals: number; lastAt: number | null }, now: number): RefundStep {
  if (!g || !g.can_refund) return { action: "none" }
  if (g.state === "refunding") return { action: "approve" }
  if (g.state !== "refundable") return { action: "none" }
  // never proposed (or our record of it is gone): propose now
  if (g.refund_proposal_id === null || history.proposals === 0) return { action: "propose" }
  // refundable again with a refund on record: the group said no (or it expired) → back off
  if (history.proposals >= MAX_REFUND_PROPOSALS) return { action: "give_up" }
  const untilMs = (history.lastAt ?? 0) + 2 ** (history.proposals - 1) * DAY_MS
  return now < untilMs ? { action: "wait", untilMs } : { action: "propose" }
}

export interface GoalsReport {
  scanned: number
  refundable: number
  proposed: number
  approved: number
  /** hub 1.3.0: refunds confirmed (money seen out of the DAO) in the same run */
  confirmed: number
  waiting: number
  gaveUp: number
  failed: number
  /** the hub has no get_goal (1.0.0): nothing to do until the upgrade */
  unsupported?: boolean
}

const isMissingMethod = (e: unknown) => /MethodNotFound|CodeDoesNotExist|MethodResolveError|wasm execution failed with error: MethodResolveError/i.test(String(e))
const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === "23505" || err?.cause?.code === "23505"
}

async function refundHistory(deps: RelayDeps, dao: string): Promise<{ proposals: number; lastAt: number | null }> {
  const [row] = await deps.db
    .select({ n: count(), last: max(relayLog.createdAt) })
    .from(relayLog)
    .where(and(eq(relayLog.op, "refund_unfunded"), eq(relayLog.potId, dao), eq(relayLog.intent, "refund_propose"), eq(relayLog.status, "executed")))
  return { proposals: Number(row?.n ?? 0), lastAt: row?.last ? new Date(row.last).getTime() : null }
}

const readGoal = (deps: RelayDeps, dao: string) => viewFunction<GoalRow | null>(deps.rpc, deps.cfg.hubId, "get_goal", { pot: dao }, "optimistic")

/**
 * One relayer-signed refund_unfunded (0 deposit; the hub sponsors the close prepay for its relayers). Keyed so a run
 * twice on the same day never proposes twice: `refund:<dao>:propose:<utc day>`, `refund:<dao>:approve:<id>:<utc day>`.
 */
export async function serverRefundUnfunded(
  deps: RelayDeps,
  dao: string,
  phase: "propose" | "approve" | "confirm",
  key: string,
  cause: string,
): Promise<"done" | "failed" | "duplicate" | "pending"> {
  const { db, cfg } = deps
  const id = newRelayId()
  try {
    await db.insert(relayLog).values({
      id,
      requestId: cause,
      op: "refund_unfunded",
      intent: `refund_${phase}`,
      idempotencyKey: key,
      senderId: cfg.relayerAccountId,
      receiverId: cfg.hubId,
      methods: ["refund_unfunded"],
      potId: dao,
      status: "validated",
    })
  } catch (e) {
    if (isUniqueViolation(e)) return "duplicate"
    throw e
  }
  try {
    const r = await deps.submitter.submit(
      {
        signerId: cfg.relayerAccountId,
        receiverId: cfg.hubId,
        actions: [nearActions.functionCall("refund_unfunded", { pot: dao }, REFUND_GAS_TGAS * TGAS, 0n)],
      },
      {
        pool: cfg.relayerPool,
        holder: id,
        budgetMs: 25_000,
        onSigned: async ({ txHash, publicKey }) => {
          await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, id))
        },
      },
    )
    if (r.kind === "pending") {
      await db.update(relayLog).set({ status: "pending" }).where(eq(relayLog.id, id))
      return "pending"
    }
    const failed = r.outcome.receipts_outcome.some((o) => typeof o.outcome.status === "object" && o.outcome.status && "Failure" in o.outcome.status)
    const events = trustedEvents(r.outcome, cfg.hubId, cfg.usdcId)
    await db
      .update(relayLog)
      .set({
        status: failed ? "failed" : "executed",
        outcome: failed ? "inner_failed" : "success",
        costYocto: burnt(r.outcome).yocto.toString(),
        events: events.map((e) => ({ standard: e.standard, version: e.version, event: e.event, data: e.data, executor: e.executor, receiptId: e.receiptId })),
        finishedAt: new Date(),
      })
      .where(eq(relayLog.id, id))
    const times = await blockTimes(deps.rpc, [...new Set(r.outcome.receipts_outcome.map((o) => o.block_hash))])
    await applyHubEvents(db, { hubId: cfg.hubId, txHash: r.txHash, events, blockTimes: times })
    deps.hub.invalidate(dao)
    // goal missed → "Everyone's getting their money back"; refunded → "Everyone got their money back" (notify.ts)
    if (deps.push) await notifyFromEvents({ db, hub: deps.hub, cfg, sender: deps.push }, events, r.txHash).catch(() => undefined)
    return failed ? "failed" : "done"
  } catch (e) {
    await db.update(relayLog).set({ status: "failed", reason: "internal", finishedAt: new Date() }).where(eq(relayLog.id, id))
    await logError({ route: "cron:goals", relayId: id, reason: "refund_unfunded_failed", detail: { err: errText(e, 300) } })
    return "failed"
  }
}

/** The reconcile step: every open/closing Pot's goal; refunds the missed all-or-nothing ones (with back-off). */
export async function refundUnfundedGoals(deps: RelayDeps, cause: string, now = Date.now()): Promise<GoalsReport> {
  const out: GoalsReport = { scanned: 0, refundable: 0, proposed: 0, approved: 0, confirmed: 0, waiting: 0, gaveUp: 0, failed: 0 }
  const day = new Date(now).toISOString().slice(0, 10)
  const pots = await deps.db.select({ daoId: pot.daoId }).from(pot).where(inArray(pot.status, ["open", "closing"])).limit(500)
  for (const { daoId } of pots) {
    out.scanned++
    let g: GoalRow | null
    try {
      g = await readGoal(deps, daoId)
    } catch (e) {
      if (isMissingMethod(e)) return { ...out, unsupported: true }
      continue
    }
    if (!g?.can_refund) continue
    out.refundable++
    const step = refundStep(g, await refundHistory(deps, daoId), now)
    if (step.action === "wait") {
      out.waiting++
      continue
    }
    if (step.action === "give_up") {
      out.gaveUp++
      await sendAlert(deps.db, `goal_refund_stuck:${daoId}`, `refund of ${daoId} rejected ${MAX_REFUND_PROPOSALS} times; not proposing again`).catch(() => undefined)
      continue
    }
    if (step.action === "propose") {
      const r = await serverRefundUnfunded(deps, daoId, "propose", `refund:${daoId}:propose:${day}`, cause)
      if (r === "failed") {
        out.failed++
        continue
      }
      if (r === "done") out.proposed++
      // phase 2 right away when the hub now says refunding
      g = await readGoal(deps, daoId).catch(() => null)
    }
    if (g?.can_refund && g.state === "refunding") {
      // HUB-5: the approval executes the refund close (an atomic batch of ft_transfers): register every payee first,
      // from the close budget; one we could not try now → wait for the next run rather than fail the whole close
      if (g.refund_proposal_id !== null) {
        const proposal = await deps.hub.getProposal(daoId, g.refund_proposal_id).catch(() => null)
        if (proposal) {
          const reg = await registerPayees(deps, closePayees(proposal.kind as Record<string, unknown>, deps.cfg.usdcId), daoId)
          if (reg.skipped.length > 0) {
            out.waiting++
            continue
          }
        }
      }
      const r = await serverRefundUnfunded(deps, daoId, "approve", `refund:${daoId}:approve:${g.refund_proposal_id ?? "x"}:${day}`, cause)
      if (r === "done") out.approved++
      else if (r === "failed") out.failed++
      // hub 1.3.0 (HUB-4): the approval pays out, but the refund is confirmed (state refunded, `goal_refunded`) only by
      // a third refund_unfunded that sees the money left the DAO. The approve call above is keyed per day, so confirm
      // now under a per-run key instead of waiting for tomorrow. On 1.2.0 the approval already settled it (no call).
      if (r !== "failed") {
        const after = await readGoal(deps, daoId).catch(() => null)
        if (after?.can_refund && after.state === "refunding") {
          const c = await serverRefundUnfunded(
            deps,
            daoId,
            "confirm",
            `refund:${daoId}:confirm:${after.refund_proposal_id ?? "x"}:${cause}`,
            cause,
          )
          if (c === "done") out.confirmed++
          else if (c === "failed") out.failed++
        }
      }
    }
  }
  return out
}
