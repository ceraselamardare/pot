// Outcome classification (api-spec §3.4): delegate-level failure, trusted events, the chain's final value of
// the hub call, method-specific success rules, payout state from the token receipts whose predecessor is
// the DAO, and the actual cost.
import {
  blockHashes,
  burnt,
  delegateFailureReason,
  errorCodeOf,
  failureText,
  firstFailure,
  followFinal,
  innerReceipt,
  predecessors,
  statusFailure,
  trustedEvents,
  type RawEvent,
} from "../chain/outcome"
import type { FinalOutcome } from "../chain/near"
import type { PolicyMatch } from "./policy"
import type { PotEvent, RelayResult } from "./types"

export interface Classified {
  outcome: "success" | "inner_failed" | "delegate_failed"
  /** delegate_failed only: the api-spec §1.2 reason */
  reason?: "expired" | "nonce_used" | "key_not_found" | "fc_key_deposit" | "bad_signature" | "internal"
  error?: string
  errorCode?: string
  events: PotEvent[]
  rawEvents: RawEvent[]
  result: RelayResult | null
  /** the payout failed (request_spend, act_proposal): after() calls sync */
  payoutFailed: boolean
  costYocto: bigint
  gasBurnt: bigint
  blockHashes: string[]
}

export interface ClassifyContext {
  hubId: string
  usdcId: string
  senderId: string
  receiverId: string
  /** for votes: the proposal status read right after execution */
  proposalStatus?: string
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null)
const evData = (e: RawEvent): Obj => obj(e.data) ?? obj(Array.isArray(e.data) ? e.data[0] : null) ?? {}

/** Payout of a DAO Transfer: the token's ft_transfer receipts whose predecessor is the DAO. */
export function payoutState(o: FinalOutcome, dao: string, tokenId: string): "sent" | "failed" | undefined {
  const pred = predecessors(o)
  const payouts = o.receipts_outcome.filter((r) => r.outcome.executor_id === tokenId && pred.get(r.id) === dao)
  if (payouts.length === 0) return undefined
  return payouts.some((r) => statusFailure(r.outcome.status) !== undefined) ? "failed" : "sent"
}

/**
 * B-05 / notes/contracts.md D7: after a `retry_payout` (relayed or server-signed) the hub's `retried: true`
 * is optimistic. The payout failed when the token's ft_transfer from the DAO failed, or when a DAO receipt
 * (the Finalize or its callback) failed; then the caller must `sync` so the hub records payout_failed again.
 */
export function retryPayoutFailed(o: FinalOutcome, dao: string, tokenId: string): boolean {
  return payoutState(o, dao, tokenId) === "failed" || firstFailure(o, (r) => r.outcome.executor_id === dao) !== undefined
}

/**
 * The status a relayed vote reports. The `get_proposal` view read after the outcome can lag behind the
 * receipts (an RPC node a block behind answered "Approved" after the DAO's callback had already set "Failed";
 * QA regression 2026-10-22). When the payout ran, the receipts decide: a failed payout leaves the proposal
 * Failed (Sputnik's callback), a sent one leaves it Approved. Otherwise the view's answer stands.
 */
export function voteStatus(viewed: string | undefined, payout: "sent" | "failed" | undefined): string {
  if (payout === "failed") return "Failed"
  if (payout === "sent" && (viewed === undefined || viewed === "InProgress")) return "Approved"
  return viewed ?? "InProgress"
}

export function classify(o: FinalOutcome, m: PolicyMatch, c: ClassifyContext): Classified {
  const { yocto, gas } = burnt(o)
  // actual cost = Σ tokens_burnt + deposits not refunded (the 1 yocto of ft_transfer_call)
  const base = { costYocto: yocto + (m.rule === "R1" ? 1n : 0n), gasBurnt: gas, blockHashes: blockHashes(o) }

  // 1. Delegate-level failure: the top-level status shows it; nothing inside ran.
  const top = o.status as Obj
  if (top && "Failure" in top) {
    return {
      ...base,
      outcome: "delegate_failed",
      reason: delegateFailureReason(top.Failure),
      error: failureText(top.Failure),
      events: [],
      rawEvents: [],
      result: null,
      payoutFailed: false,
    }
  }

  // 2. Trusted events only.
  const rawEvents = trustedEvents(o, c.hubId, c.usdcId)
  const events: PotEvent[] = rawEvents.map((e) => ({
    standard: e.standard as "pot" | "nep141",
    version: e.version,
    event: e.event,
    data: e.data,
    executor: e.executor,
    receiptId: e.receiptId,
  }))
  const potEvent = (name: string) => rawEvents.find((e) => e.standard === "pot" && e.event === name)

  // 3. The chain's final value of the delegated call (or its panic).
  const inner = innerReceipt(o, c.receiverId)
  const fin = followFinal(o, inner)
  const innerFail = (error: string, code?: string): Classified => ({
    ...base,
    outcome: "inner_failed",
    error,
    errorCode: code ?? errorCodeOf(error),
    events,
    rawEvents,
    result: null,
    payoutFailed: false,
  })
  const ok = (result: RelayResult, payoutFailed = false): Classified => ({
    ...base,
    outcome: "success",
    events,
    rawEvents,
    result,
    payoutFailed,
  })

  switch (m.rule) {
    case "R1": {
      // contribution: the ft_resolve_transfer value is the used amount
      const amount = (m.amount ?? 0n).toString()
      if (fin.kind === "failure") return innerFail(fin.error)
      const used = fin.kind === "value" && typeof fin.json === "string" ? fin.json : "0"
      const ev = potEvent("contribution")
      const evOk =
        !!ev && evData(ev).pot === m.potId && evData(ev).member === c.senderId && String(evData(ev).amount) === amount
      if (used === amount && evOk) return ok({ type: "contribution", recorded: true, amount, usedAmount: used })
      const hubFail = firstFailure(o, (r) => r.outcome.executor_id === c.hubId)
      const text = hubFail ? failureText(statusFailure(hubFail.outcome.status)) : "contribution refunded"
      const r = innerFail(text, hubFail ? errorCodeOf(text) : "CONTRIBUTION_REFUNDED")
      return { ...r, result: { type: "contribution", recorded: false, amount, usedAmount: used } }
    }
    case "R2": {
      if (fin.kind === "failure") return innerFail(fin.error)
      const v = obj(fin.kind === "value" ? fin.json : null)
      if (v?.ok === true && potEvent("pot_created"))
        return ok({ type: "create_pot", potId: String(v.pot ?? m.potId), slug: String(v.slug ?? m.create?.slug) })
      return innerFail(`create_pot: ${String(v?.reason ?? "no outcome")}`, "DAO_CREATE_FAILED")
    }
    case "R3": {
      if (fin.kind === "failure") return innerFail(fin.error)
      const v = obj(fin.kind === "value" ? fin.json : null)
      if (!v) return innerFail("request_spend: no outcome", "UNKNOWN")
      if (v.status === "refused") {
        const refusal = String(v.refusal ?? "unknown")
        return innerFail(`request refused: ${refusal}`, `REFUSED_${refusal.toUpperCase()}`)
      }
      const path = v.path === "vote" ? "vote" : "instant"
      let payout: "pending" | "sent" | "failed" | undefined
      if (path === "instant") {
        payout = payoutState(o, m.potId ?? "", c.usdcId) ?? (v.status === "payout_failed" ? "failed" : v.status === "approved" ? "sent" : "pending")
        if (v.status === "payout_failed") payout = "failed"
      }
      return ok(
        {
          type: "spend",
          requestId: Number(v.request_id),
          path,
          proposalId: v.proposal_id === null || v.proposal_id === undefined ? null : Number(v.proposal_id),
          ...(payout ? { payout } : {}),
          ...(v.approvals_needed !== undefined ? { approvalsNeeded: Number(v.approvals_needed) } : {}),
        },
        payout === "failed",
      )
    }
    case "R4": {
      if (fin.kind === "failure") return innerFail(fin.error)
      const v = obj(fin.kind === "value" ? fin.json : null)
      if (v?.ok === true)
        return ok({ type: "join", member: c.senderId, status: v.status === "pending" ? "pending" : "active" })
      const r = innerFail(`join failed: ${String(v?.reason ?? "unknown")}`, "JOIN_FAILED")
      return r
    }
    case "R5": {
      if (fin.kind === "failure") return innerFail(fin.error)
      const added = potEvent("invite_added")
      const revoked = potEvent("invite_revoked")
      if (!added && !revoked) return innerFail("no invite event", "UNKNOWN")
      return ok({
        type: "invite",
        ...(added ? { added: String(evData(added).invite_pk) as `ed25519:${string}` } : {}),
        ...(revoked ? { revoked: String(evData(revoked).invite_pk) as `ed25519:${string}` } : {}),
      })
    }
    case "R6":
    case "R7": {
      if (fin.kind === "failure") return innerFail(fin.error)
      const v = obj(fin.kind === "value" ? fin.json : null)
      if (potEvent("rules_changed")) return ok({ type: "rules", applied: true })
      const proposed = potEvent("rules_change_proposed")
      if (proposed) return ok({ type: "rules", applied: false, proposalId: Number(evData(proposed).proposal_id) })
      return innerFail(`rules: ${String(v?.reason ?? "no event")}`, v?.reason ? `RULES_${String(v.reason).toUpperCase()}` : "UNKNOWN")
    }
    case "R8": {
      if (fin.kind === "failure") return innerFail(fin.error)
      const ev = potEvent("close_proposed")
      if (ev) return ok({ type: "close", proposalId: Number(evData(ev).proposal_id) })
      const v = obj(fin.kind === "value" ? fin.json : null)
      // @pot/sdk's synthetic CLOSE_FAILED: a close whose final value is {ok:false} (nothing_to_refund, add_failed, …)
      return innerFail(`close: ${String(v?.reason ?? "no event")}`, v && v.ok === false ? "CLOSE_FAILED" : "UNKNOWN")
    }
    case "R9": {
      // a retry whose payout failed again: the hub's optimistic `approved` must be corrected by sync (D7)
      const payoutFailed = !!m.retry && retryPayoutFailed(o, m.potId ?? "", c.usdcId)
      const failed = firstFailure(o)
      if (failed) return { ...innerFail(failureText(statusFailure(failed.outcome.status))), payoutFailed }
      const v = obj(fin.kind === "value" ? fin.json : null)
      const pid = m.retry?.proposalId ?? m.sync?.proposalId ?? 0
      return ok(
        {
          type: "maintenance",
          proposalId: pid,
          ...(v?.dao_status ? { proposalStatus: String(v.dao_status) } : {}),
        },
        payoutFailed,
      )
    }
    case "R11": {
      const daoFail = firstFailure(o, (r) => r.outcome.executor_id === c.receiverId)
      if (daoFail) return innerFail(failureText(statusFailure(daoFail.outcome.status)))
      const payout = payoutState(o, c.receiverId, c.usdcId)
      const status = voteStatus(c.proposalStatus, payout) as Extract<RelayResult, { type: "vote" }>["proposalStatus"]
      return ok(
        {
          type: "vote",
          proposalId: m.vote!.proposalId,
          action: m.vote!.action,
          proposalStatus: status,
          ...(payout ? { payout } : {}),
        },
        payout === "failed",
      )
    }
    case "R13": {
      // hub 1.1.0 ok_request: the hub approves as rulebot on this OK; the payout is a detached promise (D7)
      if (fin.kind === "failure") return innerFail(fin.error)
      const v = obj(fin.kind === "value" ? fin.json : null)
      if (!v) return innerFail("ok_request: no outcome", "UNKNOWN")
      const ev = potEvent("spend_ok_approved")
      const payout = payoutState(o, m.potId ?? "", c.usdcId)
      const result: RelayResult = {
        type: "ok",
        requestId: Number(v.request_id ?? m.requestId ?? 0),
        proposalId: ev ? Number(evData(ev).proposal_id) : null,
        approved: v.ok === true,
        status: String(v.status ?? "unknown"),
        ...(v.reason ? { reason: String(v.reason) } : {}),
      }
      if (v.ok !== true) return { ...innerFail(`ok_request: ${String(v.reason ?? "refused")}`, `OK_${String(v.reason ?? "refused").toUpperCase()}`), result }
      return ok(result, payout === "failed")
    }
    case "R14":
    case "R15": {
      // hub 1.1.0 claim_link / reclaim_link: LinkOutcome {request_id, ok, status, receiver_id, reason?}
      if (fin.kind === "failure") return innerFail(fin.error)
      const v = obj(fin.kind === "value" ? fin.json : null)
      if (!v) return innerFail("link: no outcome", "UNKNOWN")
      const result: RelayResult = {
        type: "link",
        requestId: Number(v.request_id ?? m.requestId ?? 0),
        ok: v.ok === true,
        status: String(v.status ?? "unknown"),
        ...(typeof v.receiver_id === "string" ? { receiverId: v.receiver_id as `${string}` } : {}),
        ...(v.reason ? { reason: String(v.reason) } : {}),
      }
      if (v.ok !== true) return { ...innerFail(`link: ${String(v.reason ?? "failed")}`, `LINK_${String(v.reason ?? "failed").toUpperCase()}`), result }
      return ok(result)
    }
    case "TEST": {
      if (fin.kind === "failure") return innerFail(fin.error)
      const failed = firstFailure(o)
      if (failed) return innerFail(failureText(statusFailure(failed.outcome.status)))
      return ok({ type: "test", method: m.methods[0] ?? "" })
    }
  }
}
