// NEP-297 events (contracts-spec §5, D-10). The hub logs
// `EVENT_JSON:{"standard":"pot","version":"1.0.0","event":"<name>","data":{…}}` (data is one
// object; snake_case; amounts are U128 strings). Shapes mirror contracts/pot-hub/src/events.rs.
// Sputnik emits no NEP-297 events; the token emits nep141 `ft_transfer`.

import type { RawCategory, RawGoal, RawLimits, RawPath, RawPreset, RawReason, RawRuleExtras, RawRules, RawTier } from "./hub-raw.ts"

export interface RawPayoutItem {
  account_id: string
  amount: string
}

export interface HubEventDataMap {
  pot_created: { pot: string; slug: string; name: string; emoji: string | null; preset: RawPreset; creator: string; rules: RawRules; float: string }
  member_joined: { pot: string; member: string; proposal_id: number; invite_pk: string | null }
  contribution: { pot: string; member: string; amount: string; member_total: string; pot_total: string }
  spend_requested: {
    pot: string
    request_id: number
    proposal_id: number
    requester: string
    receiver_id: string
    amount: string
    category: RawCategory
    request_ref: string
    path: RawPath
    reason: RawReason
    approvals_needed: number
    /** hub 1.1.0 */
    tier?: RawTier
    /** hub 1.1.0: a pay-by-link request (receiver_id = the hub's escrow) */
    link?: boolean
  }
  spend_auto_approved: {
    pot: string
    request_id: number
    proposal_id: number
    requester: string
    receiver_id: string
    amount: string
    budget_used: string
    budget_left: string
  }
  spend_payout_failed: { pot: string; request_id: number; proposal_id: number; stage: "approve" | "payout"; dao_status: string }
  rules_changed: { pot: string; rules: RawRules; rules_version: number; by: "group" | "sole_member"; actor: string }
  invite_added: { pot: string; invite_pk: string; by: string; expires_at_ms: number; max_uses: number }
  invite_revoked: { pot: string; invite_pk: string; by: string }
  close_proposed: { pot: string; proposal_id: number; by: string; balance: string; payouts: RawPayoutItem[]; dust: string; dust_to: string }
  pot_closed: { pot: string; proposal_id: number; balance: string; payouts: RawPayoutItem[] }
  rules_change_proposed: { pot: string; proposal_id: number; by: string; rules: RawRules; rules_version: number }
  proposal_synced: {
    pot: string
    proposal_id: number
    subject: "spend" | "join" | "close" | "rules"
    request_id: number | null
    member: string | null
    dao_status: string
    hub_status: string
  }
  config_changed: {
    by: string
    config: {
      version: string
      owner: string
      usdc: string
      dao_code_hash: string
      dao_float: string
      min_dao_float: string
      relayers: string[]
      limits: RawLimits
      paused: boolean
    }
  }
  // ---- hub 1.1.0 (event version "1.1.0") ----
  rule_extras_set: { pot: string; extras: RawRuleExtras; rules_version: number; policy_version: number }
  spend_ok_approved: { pot: string; request_id: number; proposal_id: number; requester: string; by: string; amount: string }
  trust_level_changed: { pot: string; member: string; from: number; to: number; settled: number; declined: number; cause: "settled" | "declined" }
  link_funded: { pot: string; request_id: number; amount: string; expires_at_ms: number }
  link_claimed: { pot: string; request_id: number; receiver_id: string; amount: string }
  /** moved: false = the escrow payment had bounced, the money never left the Pot */
  link_returned: { pot: string; request_id: number; amount: string; by: string; moved: boolean }
  link_voided: { pot: string; request_id: number }
  goal_reached: { pot: string; goal: RawGoal; total: string }
  goal_refund_proposed: { pot: string; proposal_id: number; goal: RawGoal; total: string }
  goal_refunded: { pot: string; proposal_id: number }
  // ---- hub 1.2.0 (event version "1.2.0") ----
  /** anyone's gift reached the Pot; `ref` = the gift-link id; totals after this gift */
  gift_received: { pot: string; from: string; amount: string; ref: string; gifts_total: string; gifts_count: number }
  gifts_set: { pot: string; on: boolean; by: string }
}

export type HubEventName = keyof HubEventDataMap
export const HUB_EVENT_NAMES: readonly HubEventName[] = [
  "pot_created",
  "member_joined",
  "contribution",
  "spend_requested",
  "spend_auto_approved",
  "spend_payout_failed",
  "rules_changed",
  "invite_added",
  "invite_revoked",
  "close_proposed",
  "pot_closed",
  "rules_change_proposed",
  "proposal_synced",
  "config_changed",
  "rule_extras_set",
  "spend_ok_approved",
  "trust_level_changed",
  "link_funded",
  "link_claimed",
  "link_returned",
  "link_voided",
  "goal_reached",
  "goal_refund_proposed",
  "goal_refunded",
  "gift_received",
  "gifts_set",
]

/** A typed hub event (discriminated by `event`). */
export type HubEvent = {
  [K in HubEventName]: { standard: "pot"; version: string; event: K; data: HubEventDataMap[K] }
}[HubEventName]

/** nep141 `ft_transfer` (data is an array of transfers). */
export interface FtTransferEvent {
  standard: "nep141"
  version: string
  event: "ft_transfer"
  data: { old_owner_id: string; new_owner_id: string; amount: string; memo?: string }[]
}

export type Nep297Event = HubEvent | FtTransferEvent | { standard: string; version: string; event: string; data: unknown }

export const EVENT_JSON_PREFIX = "EVENT_JSON:"

/** Parses one receipt log line; returns null for anything that isn't a well-formed NEP-297 event. */
export function parseEventLog(line: string): Nep297Event | null {
  if (!line.startsWith(EVENT_JSON_PREFIX)) return null
  try {
    const v = JSON.parse(line.slice(EVENT_JSON_PREFIX.length)) as Record<string, unknown>
    if (typeof v.standard !== "string" || typeof v.version !== "string" || typeof v.event !== "string") return null
    return v as unknown as Nep297Event
  } catch {
    return null
  }
}

export function isHubEvent<K extends HubEventName>(e: { standard: string; event: string } | null | undefined, name?: K): e is Extract<HubEvent, { event: K }> {
  return !!e && e.standard === "pot" && (name === undefined ? (HUB_EVENT_NAMES as readonly string[]).includes(e.event) : e.event === name)
}

/** Builds the exact log line the hub emits (used by MockChain and tests). */
export function formatEventLog(e: { standard: string; version: string; event: string; data: unknown }): string {
  return EVENT_JSON_PREFIX + JSON.stringify({ standard: e.standard, version: e.version, event: e.event, data: e.data })
}
