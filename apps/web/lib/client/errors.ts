// UI error classes (frontend-architecture §4.8, §6.3). Every failed action becomes one ActionError with a class
// (what the UI does), whether money moved, and the relay/API reason for Details. Flows pick their own copy key
// from the class (`*.error.relayer` for transport/capacity problems, `*.error.generic` otherwise).
export type ErrorClass =
  | "offline"
  | "relayer_down"
  | "rate_limited"
  | "retryable"
  | "needs_device"
  | "session"
  | "decided"
  | "specific"
  | "approved_not_sent"
  | "failed"
  | "unknown_outcome"
  | "bug"

export class ActionError extends Error {
  readonly cls: ErrorClass
  /** api-spec §1.2 reason, or an ERR_* contract code for inner failures */
  readonly reason: string
  readonly requestId?: string
  readonly txHash?: string
  readonly moneyMoved: "no" | "unknown" | "not_yet"
  /** the API's machine-readable extras (e.g. `{cause: "topup_open"}`), when it sent any */
  readonly detail?: Record<string, unknown>
  constructor(
    cls: ErrorClass,
    reason: string,
    extra: { requestId?: string; txHash?: string; moneyMoved?: "no" | "unknown" | "not_yet"; message?: string; detail?: Record<string, unknown> } = {},
  ) {
    super(extra.message ?? `${cls}: ${reason}`)
    this.name = "ActionError"
    this.cls = cls
    this.reason = reason
    this.requestId = extra.requestId
    this.txHash = extra.txHash
    this.moneyMoved = extra.moneyMoved ?? "no"
    if (extra.detail) this.detail = extra.detail
  }
}

/** §4.8: a relay/API rejection reason → UI class. */
export function classOfReason(reason: string, status?: number): ErrorClass {
  switch (reason) {
    case "rate_limited":
    case "quota_exceeded":
      return "rate_limited"
    case "service_unavailable":
    case "internal":
      return "relayer_down"
    case "expired":
    case "nonce_used":
    case "nonce_pending":
    case "ttl_too_long": // api-spec §1.2: re-sign once (a device key signs with TTL 200; a wallet's signing head moved on)
      return "retryable"
    case "bad_signature":
    case "key_not_found":
    case "sender_mismatch":
    case "device_not_registered":
      return "needs_device"
    case "not_signed_in":
      return "session"
    case "receiver_not_allowed":
    case "method_not_allowed":
    case "deposit_cap":
    case "gas_cap":
    case "fc_key_deposit":
    case "args_invalid":
    case "bad_request":
    case "action_not_allowed":
      return "bug"
    case "already_voted":
    case "proposal_not_open":
      return "decided"
    case "pot_closed":
    case "not_a_member":
    case "slug_taken":
    case "demo_forbidden":
    case "proposal_not_tracked":
    case "pot_unknown":
      return "specific"
    default:
      return status !== undefined && status >= 500 ? "relayer_down" : "failed"
  }
}

/** True for failures where "try again in a minute" is the right copy (`*.error.relayer`). */
export const isTransportError = (e: unknown): boolean =>
  e instanceof ActionError ? e.cls === "relayer_down" || e.cls === "rate_limited" || e.cls === "unknown_outcome" || e.cls === "offline" : true
