// Stable error codes. Hub codes = contracts/pot-hub/src/errors.rs (contracts-spec §3.13); Sputnik
// codes from the DAO source; synthetic codes from api-spec §1.3. Clients match the `ERR_` token.

/** Every code the v1 hub panics with (Phase-3 withdraw codes are not built, rev5). */
export const HUB_ERROR_CODES = [
  "ERR_PAUSED",
  "ERR_NOT_OWNER",
  "ERR_CONFIG_INVALID",
  "ERR_POT_NOT_FOUND",
  "ERR_POT_NOT_OPEN",
  "ERR_POT_BUSY",
  "ERR_PAYOUTS_PENDING",
  "ERR_CLOSE_IN_PROGRESS",
  "ERR_CLOSE_COOLDOWN",
  "ERR_NO_CONTRIBUTIONS",
  "ERR_NOT_MEMBER",
  "ERR_NOT_POT_DAO",
  "ERR_USE_PROPOSE_RULES",
  "ERR_EMOJI_INVALID",
  "ERR_ALREADY_MEMBER",
  "ERR_POT_FULL",
  "ERR_TOO_MANY_POTS",
  "ERR_SLUG_INVALID",
  "ERR_SLUG_RESERVED",
  "ERR_SLUG_TAKEN",
  "ERR_NAME_INVALID",
  "ERR_RULES_INVALID",
  "ERR_RULES_PENDING",
  "ERR_CREATOR_DAILY_LIMIT",
  "ERR_GLOBAL_DAILY_LIMIT",
  "ERR_DEPOSIT_REQUIRED",
  "ERR_HUB_LOW_BALANCE",
  "ERR_INVITE_PK_INVALID",
  "ERR_INVITE_EXISTS",
  "ERR_INVITE_NOT_FOUND",
  "ERR_INVITE_REVOKED",
  "ERR_INVITE_EXPIRED",
  "ERR_INVITE_USED_UP",
  "ERR_INVITE_EXPIRY_INVALID",
  "ERR_INVITE_MAX_USES_INVALID",
  "ERR_TOO_MANY_INVITES",
  "ERR_BAD_SIGNATURE",
  "ERR_WRONG_TOKEN",
  "ERR_BAD_MSG",
  "ERR_AMOUNT_TOO_LARGE",
  "ERR_BAD_AMOUNT",
  "ERR_BAD_RECEIVER",
  "ERR_BAD_REQUEST_REF",
  "ERR_TOO_MANY_PENDING",
  "ERR_TOO_MANY_REQUESTS",
  "ERR_UNKNOWN_PROPOSAL",
  "ERR_NOT_RETRYABLE",
  "ERR_USE_DAO_FINALIZE",
  // hub 1.1.0 (wave 4)
  "ERR_EXTRAS_INVALID",
  "ERR_GOAL_INVALID",
  "ERR_GOAL_LOCKED",
  "ERR_GOAL_UNSUPPORTED",
  "ERR_GOAL_NOT_REACHED",
  "ERR_GOAL_MISSED",
  "ERR_GOAL_NOT_MISSED",
  "ERR_NO_GOAL",
  "ERR_NOT_ONE_OK",
  "ERR_NOT_PENDING",
  "ERR_OK_SELF",
  "ERR_OK_IN_FLIGHT",
  "ERR_LINKS_OFF",
  "ERR_LINKS_PENDING",
  "ERR_LINK_PK_INVALID",
  "ERR_LINK_EXPIRY_INVALID",
  "ERR_LINK_NOT_FOUND",
  "ERR_LINK_NOT_FUNDED",
  "ERR_LINK_EXPIRED",
  "ERR_LINK_NOT_EXPIRED",
  "ERR_LINK_NOT_FINAL",
  "ERR_LINK_BUSY",
  "ERR_LINK_DONE",
  "ERR_MIGRATE",
  // hub 1.2.0 (gifts)
  "ERR_GIFTS_OFF",
  "ERR_GIFT_TOO_SMALL",
  "ERR_GIFT_REF_INVALID",
  "ERR_GIFT_SELF",
  "ERR_GIFT_IN_FLIGHT",
  "ERR_GOAL_COLLECTING",
  // hub 1.3.0 (security fixes)
  "ERR_OK_NOT_ELIGIBLE",
  "ERR_LINK_TOO_SMALL",
  "ERR_NOT_CLOSED",
  "ERR_SWEEP_COOLDOWN",
] as const
export type HubErrorCode = (typeof HUB_ERROR_CODES)[number]

/** Sputnik DAO panics the clients map (api-spec §1.3). */
export const DAO_ERROR_CODES = [
  "ERR_ALREADY_VOTED",
  "ERR_PROPOSAL_NOT_READY_FOR_VOTE",
  "ERR_PERMISSION_DENIED",
  "ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED",
  "ERR_WRONG_KIND",
  "ERR_MIN_BOND",
  "ERR_NO_PROPOSAL",
  "ERR_PROPOSAL_NOT_IN_PROGRESS",
] as const
export type DaoErrorCode = (typeof DAO_ERROR_CODES)[number]

/** Codes the relayer synthesizes from receipts (api-spec §1.3). */
export const SYNTHETIC_ERROR_CODES = [
  "RECEIVER_NOT_REGISTERED",
  "INSUFFICIENT_FUNDS",
  "OUT_OF_GAS",
  "CONTRIBUTION_REFUNDED",
  /** hub 1.2.0: a gift the hub refused or whose forward failed (the token refunded the giver) */
  "GIFT_REFUNDED",
  "JOIN_FAILED",
  /** sdk addition: propose_close final value {ok:false, reason} (nothing_to_refund, add_failed…) */
  "CLOSE_FAILED",
  "DAO_CREATE_FAILED",
  "BAD_CALL",
  "UNKNOWN",
] as const
export type SyntheticErrorCode = (typeof SYNTHETIC_ERROR_CODES)[number] | `REFUSED_${Uppercase<string>}`

export type ErrorCode = HubErrorCode | DaoErrorCode | SyntheticErrorCode

export const isHubErrorCode = (s: string): s is HubErrorCode => (HUB_ERROR_CODES as readonly string[]).includes(s)

/** Removes raw control characters (Sputnik `assert_eq!` panics carry newlines; sputnik-dao.md gotcha 11). */
// eslint-disable-next-line no-control-regex -- matching raw control characters is the point
export const stripControlChars = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, " ")

/**
 * api-spec §1.3: the first `ERR_*` token of a failure text (after stripping control characters),
 * else a synthetic code from known NEP-141 / runtime substrings, else "UNKNOWN".
 */
export function errorCodeFromText(text: string): ErrorCode {
  const t = stripControlChars(text)
  // not \b: RPC debug-escapes newlines, so "…:1:1:\\nERR_X" must still match
  const m = /(?<![A-Z0-9_])ERR_[A-Z0-9_]+/.exec(t)
  if (m) return m[0] as ErrorCode
  if (/is not registered/.test(t)) return "RECEIVER_NOT_REGISTERED"
  if (/doesn't have enough balance|does not have enough balance/.test(t)) return "INSUFFICIENT_FUNDS"
  if (/Exceeded the prepaid gas/.test(t)) return "OUT_OF_GAS"
  if (/doesn't accept deposit|Failed to deserialize input from JSON/.test(t)) return "BAD_CALL"
  return "UNKNOWN"
}

/** `REFUSED_<REFUSAL>` for a refused spend outcome (api-spec §1.3). */
export const refusedCode = (refusal: string): SyntheticErrorCode => `REFUSED_${refusal.toUpperCase()}` as SyntheticErrorCode
