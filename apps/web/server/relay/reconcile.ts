// Lost-broadcast reconciliation (frontend request 2, wave 3; architecture §4.1 step 3; api-spec §5.3).
// A relay whose outer tx never landed (dropped by the node, a nonce clash on a shared key, a crashed
// instance) stays `pending` forever unless someone looks again. Once the FINAL head is past the delegate's
// `max_block_height`, the delegate can never execute; if the sender's key nonce is still below the
// delegate's nonce, nothing ran anywhere → the row becomes `failed` / `expired` (cause `lost_broadcast`),
// the yocto pre-charge is given back, and the client can say "nothing moved" and re-sign.
// Used by GET /api/relay/[relayId] (per row, on read) and by the reconcile cron (every stale row).
import "server-only"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import { adjustQuota } from "@/db/quota"
import { relayLog } from "@/db/schema"
import { block, txStatus, viewAccessKey } from "../chain/near"
import { ApiError, errBody } from "../http/errors"
import { completeRelay, restoreMatch, type RelayDeps, type RelayResponse } from "./pipeline"

export type RelayRow = typeof relayLog.$inferSelect

export const IN_FLIGHT = ["validated", "signed", "submitted", "pending"] as const

/** The yocto subjects a relay row pre-charged (pipeline step 12). */
export function yoctoOf(row: Pick<RelayRow, "userId">) {
  return { action: "relay_yocto", subjects: ["global", ...(row.userId ? [`user:${row.userId}`] : [])] }
}

export type ReconcileVerdict =
  | { kind: "completed"; response: RelayResponse }
  | { kind: "lost"; response: RelayResponse }
  /** still able to land (head ≤ max_block_height) or no tx known yet */
  | { kind: "in_flight" }
  /** the key nonce moved past the delegate but the outer tx is unknown: executed elsewhere; left for a human */
  | { kind: "ambiguous" }

/**
 * One reconciliation pass over an in-flight `relay` row: tx status of the stored outer hash (→ classify and
 * store), else the lost check. Never throws for chain errors (returns in_flight).
 */
export async function reconcileRelayRow(
  deps: RelayDeps,
  row: RelayRow,
  opts: { requestId: string; lostCheck?: boolean },
): Promise<ReconcileVerdict> {
  if (row.op !== "relay" || !IN_FLIGHT.includes(row.status as (typeof IN_FLIGHT)[number])) return { kind: "in_flight" }
  const { rpc, cfg, db } = deps
  if (row.outerTxHash) {
    const o = await txStatus(rpc, row.outerTxHash, cfg.relayerAccountId, "EXECUTED_OPTIMISTIC", 5_000).catch(() => null)
    const snapshot = (row.result as { __match?: unknown } | null)?.__match
    if (o && snapshot) {
      const response = await completeRelay(deps, {
        relayId: row.id,
        requestId: opts.requestId,
        userId: row.userId,
        m: restoreMatch(snapshot),
        delegateReceiver: row.receiverId,
        txHash: row.outerTxHash,
        outcome: o,
        yocto: yoctoOf(row),
      })
      return { kind: "completed", response }
    }
  }
  if (opts.lostCheck === false || !row.maxBlockHeight || !row.senderId || !row.delegatePublicKey || !row.delegateNonce)
    return { kind: "in_flight" }
  const head = await block(rpc, { finality: "final" }).catch(() => null)
  if (!head || head.height <= row.maxBlockHeight) return { kind: "in_flight" }
  const ak = await viewAccessKey(rpc, row.senderId, row.delegatePublicKey, "final").catch(() => undefined)
  if (ak === undefined) return { kind: "in_flight" } // RPC trouble: decide next time
  if (ak && ak.nonce >= BigInt(row.delegateNonce)) {
    // the nonce was used but our outer hash is unknown: the delegate ran under another tx (or a lagging node)
    return { kind: "ambiguous" }
  }
  // nothing ran, and nothing can run any more
  const e = new ApiError("expired", {
    detail: { cause: "lost_broadcast", maxBlockHeight: row.maxBlockHeight, head: head.height },
    message: "the relayed transaction was never included; nothing moved",
  })
  const body = errBody(e, opts.requestId) as unknown as Record<string, unknown>
  const updated = await db
    .update(relayLog)
    .set({ status: "failed", reason: "expired", errorText: "lost_broadcast", response: body, httpStatus: e.status, finishedAt: new Date() })
    .where(and(eq(relayLog.id, row.id), inArray(relayLog.status, [...IN_FLIGHT])))
    .returning({ id: relayLog.id })
  // give the yocto pre-charge back once (only the caller that flipped the row)
  if (updated.length > 0 && row.estYocto) {
    const y = yoctoOf(row)
    await adjustQuota(db, y.subjects, y.action, -BigInt(row.estYocto)).catch(() => undefined)
  }
  return { kind: "lost", response: { status: e.status, body } }
}

/**
 * Cron step (api-spec §5.3 "stale pending relays → failed"): every in-flight row older than `olderThanMs`.
 * `relay` rows go through reconcileRelayRow; server-signed rows (sync, retry_payout, faucet, …) whose tx is
 * unknown after `serverStaleMs` are marked failed (follow-ups key on their cause, so a later cron run issues a fresh one if still needed).
 */
export async function reconcileStaleRelays(
  deps: RelayDeps,
  opts: { olderThanMs?: number; serverStaleMs?: number; limit?: number; requestId?: string } = {},
): Promise<{ checked: number; completed: number; lost: number; ambiguous: number; serverFailed: number }> {
  const { db, rpc, cfg } = deps
  const olderThan = new Date(Date.now() - (opts.olderThanMs ?? 2 * 60_000))
  const rows = await db
    .select()
    .from(relayLog)
    .where(and(inArray(relayLog.status, [...IN_FLIGHT]), lt(relayLog.createdAt, olderThan)))
    .orderBy(relayLog.createdAt)
    .limit(opts.limit ?? 200)
  const out = { checked: rows.length, completed: 0, lost: 0, ambiguous: 0, serverFailed: 0 }
  const serverCut = Date.now() - (opts.serverStaleMs ?? 30 * 60_000)
  for (const row of rows) {
    if (row.op === "relay") {
      const v = await reconcileRelayRow(deps, row, { requestId: opts.requestId ?? row.requestId })
      if (v.kind === "completed") out.completed++
      else if (v.kind === "lost") out.lost++
      else if (v.kind === "ambiguous") out.ambiguous++
      continue
    }
    if (row.createdAt.getTime() > serverCut) continue
    const signer = row.senderId ?? cfg.relayerAccountId
    const o = row.outerTxHash ? await txStatus(rpc, row.outerTxHash, signer, "EXECUTED_OPTIMISTIC", 5_000).catch(() => null) : null
    if (o) {
      const failed = o.receipts_outcome.some((r) => typeof r.outcome.status === "object" && r.outcome.status !== null && "Failure" in r.outcome.status)
      await db
        .update(relayLog)
        .set({ status: failed ? "failed" : "executed", outcome: failed ? "inner_failed" : "success", finishedAt: new Date() })
        .where(eq(relayLog.id, row.id))
      out.completed++
    } else {
      await db
        .update(relayLog)
        .set({ status: "failed", reason: "internal", errorText: "lost_broadcast", finishedAt: sql`now()` })
        .where(and(eq(relayLog.id, row.id), inArray(relayLog.status, [...IN_FLIGHT])))
      out.serverFailed++
    }
  }
  return out
}
