// The spend decision function, a twin of PotHub::decide + preview_spend (contracts/pot-hub/src/
// lib.rs, views.rs; contracts-spec §3.4 rows 1-11). Used by MockChain and by the UI's instant
// local RulePreview (frontend-architecture §3.7); the chain still decides.

import type { Micro } from "../money.ts"
import { MAX_AMOUNT } from "../money.ts"
import type { RawPreviewReason, RawReason } from "../types/hub-raw.ts"
import type { Rules, SpendPath, SpendPreviewReason } from "../types/hub.ts"

export interface DecideInput {
  paused: boolean
  /** status open and no propose_close chain in flight */
  potOpen: boolean
  hubId: string
  daoId: string
  usdcId: string
  rules: Rules
  /** Pot's next request id (= request_count) and the cap. */
  requestCount: number
  maxRequestsPerPot: number
  maxPendingPerMember: number
  /** The requester's hub record when Active, else null. */
  requester: { instantUsed: Micro; contributed: Micro; pendingVotes: number } | null
  /** Whether the receiver is an Active member of this Pot. */
  receiverIsMember: boolean
  receiverId: string
  amount: Micro
  /** request_spend passes it; preview_spend doesn't check it. */
  requestRef?: string
}

export type HubDecideError =
  | "ERR_PAUSED"
  | "ERR_POT_NOT_OPEN"
  | "ERR_NOT_MEMBER"
  | "ERR_BAD_AMOUNT"
  | "ERR_BAD_RECEIVER"
  | "ERR_BAD_REQUEST_REF"
  | "ERR_TOO_MANY_REQUESTS"
  | "ERR_TOO_MANY_PENDING"

export type DecideResult =
  | { ok: true; path: SpendPath; reason: RawReason }
  | { ok: false; code: HubDecideError; previewReason: RawPreviewReason }

export function decideSpend(i: DecideInput): DecideResult {
  const fail = (code: HubDecideError, previewReason: RawPreviewReason): DecideResult => ({ ok: false, code, previewReason })
  if (i.paused) return fail("ERR_PAUSED", "paused")
  if (!i.potOpen) return fail("ERR_POT_NOT_OPEN", "pot_not_open")
  const m = i.requester
  if (!m) return fail("ERR_NOT_MEMBER", "not_member")
  if (i.amount <= 0n || i.amount > MAX_AMOUNT) return fail("ERR_BAD_AMOUNT", "bad_amount")
  if (i.receiverId === i.hubId || i.receiverId === i.daoId || i.receiverId === i.usdcId) return fail("ERR_BAD_RECEIVER", "bad_receiver")
  if (i.requestRef !== undefined && !/^[a-z0-9]{8,32}$/.test(i.requestRef)) return fail("ERR_BAD_REQUEST_REF", "bad_request_ref")
  if (i.requestCount >= i.maxRequestsPerPot) return fail("ERR_TOO_MANY_REQUESTS", "too_many_requests")
  const r = i.rules
  const receiverOk = i.receiverIsMember || (r.instantPayees === "members_and_allowlist" && r.payeeAllowlist.includes(i.receiverId as never))
  let path: SpendPath = "instant"
  let reason: RawReason = "within_rules"
  if (r.instantCap === 0n || i.amount > r.instantCap) [path, reason] = ["vote", "over_cap"]
  else if (m.instantUsed + i.amount > r.memberBudget) [path, reason] = ["vote", "over_budget"]
  else if (!receiverOk) [path, reason] = ["vote", "payee_not_allowed"]
  else if (m.contributed === 0n) [path, reason] = ["vote", "new_member"]
  if (path === "vote" && m.pendingVotes >= i.maxPendingPerMember) return fail("ERR_TOO_MANY_PENDING", "too_many_pending")
  return { ok: true, path, reason }
}

/**
 * preview_spend semantics on top of decideSpend: a decision that passes is still "blocked" with
 * `insufficient_balance` when amount > balance \u2212 reserved (balance = the passed DAO balance, or
 * the ledger estimate).
 */
export function previewSpendDecision(i: DecideInput & { balance: Micro; reserved: Micro }): { path: SpendPath | "blocked"; reason: RawPreviewReason } {
  const d = decideSpend({ ...i, requestRef: undefined })
  if (!d.ok) return { path: "blocked", reason: d.previewReason }
  const available = i.balance > i.reserved ? i.balance - i.reserved : 0n
  if (i.amount > available) return { path: "blocked", reason: "insufficient_balance" }
  return { path: d.path, reason: d.reason }
}

/** contracts-spec §11: contract preview reason → UI reason. */
export function toSpendPreviewReason(r: RawPreviewReason): SpendPreviewReason {
  switch (r) {
    case "within_rules":
      return "ok"
    case "payee_not_allowed":
      return "recipient"
    case "insufficient_balance":
      return "balance"
    case "pot_not_open":
      return "not_open"
    case "over_cap":
    case "over_budget":
    case "new_member":
      return r
    default:
      return "blocked"
  }
}
