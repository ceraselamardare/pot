// The hub's JSON exactly as the contract emits it (snake_case; amounts are U128 strings, NEAR
// amounts are yocto strings, timestamps are ms numbers). Mirrors contracts/pot-hub/src/views.rs
// and types.rs (implemented contract, read 2026-10-22). read/parse.ts maps these to the camelCase
// domain types in hub.ts (contracts-spec §11 mapping).

export type RawPreset = "trip" | "club" | "team" | "custom"
export type RawPayeeRule = "members" | "members_and_allowlist"
export type RawCategory = "groceries" | "food" | "transport" | "stay" | "tickets" | "other"
export type RawPath = "instant" | "vote"
export type RawReason = "within_rules" | "over_cap" | "over_budget" | "payee_not_allowed" | "new_member" | "auto_approve_failed"
export type RawRequestStatus =
  | "checking"
  | "proposing"
  | "approving"
  | "pending"
  | "approved"
  | "payout_failed"
  | "rejected"
  | "expired"
  | "removed"
export type RawPotStatus = "open" | "closing" | "closed"
/** hub 1.1.0 (wave 4): how a request gets approved. */
export type RawTier = "instant" | "one_ok" | "group"
export type RawLinkStatus = "awaiting_funds" | "funded" | "claiming" | "claimed" | "returning" | "returned" | "void"
export type RawGoalState = "none" | "collecting" | "reached" | "missed" | "refundable" | "refunding" | "refunded"

/** hub 1.1.0 goal: `amount` U128, `deadline_ms` ms. */
export interface RawGoal {
  amount: string
  deadline_ms: number
  all_or_nothing: boolean
}

/** hub 1.1.0 rule extras (create_pot / set_rules / propose_rules `extras`; PotView.extras). */
export interface RawRuleExtras {
  trust: boolean
  /** "0" = no one-OK tier */
  one_ok_cap: string
  links: boolean
  goal: RawGoal | null
}

export interface RawRules {
  instant_cap: string
  member_budget: string
  instant_payees: RawPayeeRule
  payee_allowlist: string[]
}

export interface RawLimits {
  max_members: number
  max_pots_per_creator_per_day: number
  max_sponsored_pots_per_day: number
  max_pots_per_account: number
  max_active_invites: number
  max_invites_total: number
  max_pending_per_member: number
  max_requests_per_pot: number
  min_hub_reserve: string
}

export interface RawConfigView {
  version: string
  owner: string
  usdc: string
  dao_code_hash: string
  dao_float: string
  min_dao_float: string
  relayers: string[]
  limits: RawLimits
  paused: boolean
  pot_count: number
  sponsored_today: number
  free_balance: string
}

export interface RawPotView {
  pot: string
  slug: string
  name: string
  emoji: string | null
  preset: RawPreset
  seq: number
  rules: RawRules
  rules_version: number
  status: RawPotStatus
  close_proposal_id: number | null
  creator: string
  created_at_ms: number
  closed_at_ms: number | null
  member_count: number
  joining_count: number
  approvals_needed: number
  proposal_period_ms: number
  total_contributed: string
  spent_instant: string
  spent_vote: string
  reserved: string
  balance_estimate: string
  last_contributor: string | null
  request_count: number
  open_requests: number
  active_invites: number
  unpaid_approved: number
  float: string
  usdc: string
  /** Implemented contract addition (not in contracts-spec §4). */
  open_rules_proposal?: number | null
  /** Implemented contract addition (not in contracts-spec §4). */
  closing_in_flight?: boolean
  /** hub 1.1.0; absent on 1.0.0 (= all off) */
  extras?: RawRuleExtras
  policy_version?: number
  open_links?: number
  goal_state?: RawGoalState
  /** hub 1.2.0 (gifts); absent on older hubs (= gifts unknown / not supported) */
  gifts_on?: boolean
  gifts_total?: string
  gifts_count?: number
  /** hub 1.3.0 (HUB-4): the close was approved but the money isn't confirmed out yet (status stays "closing") */
  close_settling?: boolean
}

export interface RawPotSummary {
  pot: string
  slug: string
  name: string
  emoji: string | null
  preset: RawPreset
  status: RawPotStatus
  seq: number
  member_count: number
  total_contributed: string
  balance_estimate: string
  contributed: string
  created_at_ms: number
}

export interface RawMemberView {
  account_id: string
  join_index: number
  status: "active" | "joining"
  joined_at_ms: number
  contributed: string
  spent: string
  instant_used: string
  budget_left: string
  /** hub 1.3.0 (W4-1): one-OK spends approved for this member so far (lifetime; absent on older hubs = 0) */
  one_ok_used?: string
  /** hub 1.3.0 (W4-1): how much more can be approved for this member with one OK (the ceiling − used) */
  one_ok_left?: string
  would_get_back: string
  share_of_spending: string
  is_last_contributor: boolean
  balance_source: "argument" | "ledger" | "close_record"
}

export interface RawRulesView {
  pot: string
  preset: RawPreset
  rules: RawRules
  rules_version: number
  member_count: number
  approvals_needed: number
  proposal_period_ms: number
}

/** preview_spend `reason`: a RawReason on instant/vote, or why it's blocked. */
export type RawPreviewReason =
  | RawReason
  | "insufficient_balance"
  | "not_member"
  | "pot_not_open"
  | "bad_amount"
  | "bad_receiver"
  | "bad_request_ref"
  | "too_many_requests"
  | "too_many_pending"
  | "paused"
  // hub 1.1.0
  | "goal_not_reached"
  | "links_off"
  // hub 1.3.0 (W4-8)
  | "link_too_small"

export interface RawSpendPreview {
  path: "instant" | "vote" | "blocked"
  reason: RawPreviewReason
  approvals_needed: number
  member_count: number
  instant_cap: string
  member_budget: string
  budget_used: string
  budget_left: string
  balance_checked: string | null
  client_must_check: string[]
  /** hub 1.1.0 ("" when blocked) */
  tier?: RawTier | ""
  effective_cap?: string
  trust_level?: number
  one_ok_cap?: string
}

export interface RawClosePayout {
  account_id: string
  contributed: string
  amount: string
}

export type RawCloseBlockedReason =
  | "pot_not_open"
  | "close_in_progress"
  | "payouts_pending"
  | "busy"
  | "no_contributions"
  | "nothing_to_refund"
  | "links_pending"
  /** hub 1.2.0: a gift forward is pending (≤ 60 s) */
  | "gift_in_flight"

export interface RawClosePreview {
  pot: string
  balance: string
  balance_source: "argument" | "ledger" | "close_record"
  total_contributed: string
  /** hub 1.2.0 */
  gifts_total?: string
  /** hub 1.2.0: "equal" when nobody contributed (a gifts-only Pot) */
  split?: "prorata" | "equal"
  approvals_needed: number
  open_requests: number
  payouts: RawClosePayout[]
  dust: string
  dust_to: string | null
  can_propose: boolean
  blocked_reason: RawCloseBlockedReason | null
}

export interface RawRequestView {
  request_id: number
  pot: string
  requester: string
  receiver_id: string
  amount: string
  category: RawCategory
  request_ref: string
  path: RawPath
  reason: RawReason
  status: RawRequestStatus
  proposal_id: number | null
  created_at_ms: number
  updated_at_ms: number
  expires_at_ms: number
  /** hub 1.1.0 */
  tier?: RawTier
  ok_by?: string | null
  link_status?: RawLinkStatus | null
}

export interface RawInviteView {
  pot: string
  invite_pk: string
  created_by: string
  created_at_ms: number
  expires_at_ms: number
  max_uses: number
  uses: number
  revoked: boolean
  status: "active" | "expired" | "used_up" | "revoked"
}

export interface RawSubjectView {
  pot: string
  proposal_id: number
  /** "sweep" (hub 1.3.0): a hub-made payout of USDC left in a Closed Pot */
  kind: "spend" | "join" | "close" | "rules" | "sweep"
  request_id: number | null
  member: string | null
  rules_version: number | null
  live: boolean
}

// ---- outcomes: the final values of change-method promise chains ----

export interface RawCreatePotOutcome {
  ok: boolean
  pot: string
  slug?: string
  float?: string
  usdc_registered?: boolean
  reason?: "dao_create_failed" | string
}

export type RawSpendRefusal =
  | "payee_not_registered"
  | "insufficient_balance"
  | "not_in_dao_group"
  | "dao_unavailable"
  | "add_failed"
  | "hub_low_balance"
  | "pot_not_open"

export interface RawSpendOutcome {
  request_id: number
  proposal_id: number | null
  path: RawPath
  reason: RawReason
  status: "approved" | "pending" | "approving" | "rejected" | "payout_failed" | "expired" | "removed" | "refused"
  refusal: RawSpendRefusal | string | null
  approvals_needed: number
  /** hub 1.1.0 */
  tier?: RawTier
  link?: boolean
}

export interface RawSyncOutcome {
  proposal_id: number
  subject: "spend" | "join" | "close" | "rules" | "unknown"
  dao_status: string
  hub_status: string
  changed: boolean
}

export interface RawRetryOutcome {
  proposal_id: number
  retried: boolean
  dao_status: string
  hub_status: string
}

export interface RawJoinOutcome {
  ok: boolean
  status: "active" | "pending" | "failed"
  proposal_id?: number
  reason?: string
}

export interface RawRulesOutcome {
  applied: boolean
  proposal_id: number | null
  rules_version: number
  reason?: string
}

export interface RawPayout {
  account_id: string
  amount: string
}

export interface RawCloseOutcome {
  ok: boolean
  proposal_id?: number
  balance?: string
  payouts?: RawPayout[]
  dust?: string
  dust_to?: string
  approvals_needed?: number
  reason?: "balance_unavailable" | "nothing_to_refund" | "add_failed" | string
}

// ---- hub 1.1.0 (wave 4) views and outcomes; contracts/pot-hub/src/wave4.rs ----

export interface RawTrustView {
  pot: string
  account_id: string
  enabled: boolean
  level: number
  max_level: number
  streak: number
  step: number
  next_level_in: number
  min_qualifying: string
  settled: number
  settled_amount: string
  declined: number
  last_declined_ms: number | null
  base_cap: string
  multiplier: number
  effective_cap: string
  budget_left: string
  instant_up_to: string
  one_ok_cap: string
}

export interface RawGoalView {
  pot: string
  amount: string
  deadline_ms: number
  all_or_nothing: boolean
  total_contributed: string
  /** hub 1.2.0: gifts count toward a normal goal (not an all-or-nothing one) */
  gifts_total?: string
  /** hub 1.2.0: what counts toward the goal */
  progress?: string
  state: Exclude<RawGoalState, "none">
  reached_at_ms: number | null
  refund_proposal_id: number | null
  can_refund: boolean
  spends_blocked: boolean
}

export interface RawLinkView {
  pot: string
  request_id: number
  requester: string
  amount: string
  category: RawCategory
  request_status: RawRequestStatus
  status: RawLinkStatus
  claim_pk: string
  expires_at_ms: number
  receiver_id: string | null
  funded_at_ms: number | null
  done_at_ms: number | null
  claimable: boolean
}

export type RawRecordMoney =
  | "paid"
  | "held_for_link"
  | "awaiting_funds"
  | "returned"
  | "processing"
  | "awaiting_approval"
  | "failed"
  | "declined"
  | "expired"
  | "withdrawn"
  | "void"

export interface RawRecordEntry {
  request_id: number
  proposal_id: number | null
  requester: string
  payee: string | null
  link: boolean
  amount: string
  category: RawCategory
  request_ref: string
  tier: RawTier
  approved_by: "rules" | "one_ok" | "group" | null
  ok_by: string | null
  status: RawRequestStatus
  money: RawRecordMoney
  link_status: RawLinkStatus | null
  created_at_ms: number
  updated_at_ms: number
}

export interface RawOkOutcome {
  request_id: number
  ok: boolean
  status: string
  reason?: "objection" | "not_pending" | "not_open" | "not_in_dao_group" | "pot_not_open" | "dao_unavailable" | "approve_failed" | "stale" | string
}

export interface RawLinkOutcome {
  request_id: number
  ok: boolean
  status: RawLinkStatus
  receiver_id: string | null
  reason?: "transfer_failed" | "stale" | string
}

// ---- hub 1.2.0 (gifts) ----

export type RawGiftRefusal = "pot_not_open" | "paused" | "gifts_off" | "goal_collecting" | "goal_missed"

/** hub 1.2.0 `get_gifts(pot)` / `set_gifts(pot, on)` return value. */
export interface RawGiftsView {
  pot: string
  on: boolean
  total: string
  count: number
  last_gift_ms: number | null
  /** a gift forward is pending right now (the close waits ≤ 60 s) */
  in_flight: boolean
  /** a gift sent now would be accepted */
  accepting: boolean
  refusal: RawGiftRefusal | null
  min_amount: string
}

/** hub 1.3.0 `get_ok_check(pot, request_id, account_id)`: could this member give the one OK now? */
export interface RawOkCheck {
  pot: string
  request_id: number
  account_id: string
  can_ok: boolean
  reason: string | null
}

/** hub 1.3.0 `get_sweep(pot)`: the latest sweep of a Closed Pot (M-2). */
export interface RawSweepView {
  pot: string
  proposal_id: number | null
  balance: string
  payouts: { account_id: string; amount: string }[]
  created_at_ms: number
  next_allowed_ms: number
}
