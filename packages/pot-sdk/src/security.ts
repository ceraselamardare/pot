// Hub 1.3.0 security fixes (notes/security-audit-2026-11-04.md; notes/contracts.md "Hub 1.3.0 security
// fixes"): the client twins of contracts/pot-hub/src/security.rs + the policy versions in types.rs.

import type { Micro } from "./money.ts"

export const HUB_1_3 = {
  /** W4-1 / HUB-2: the least a member must have added ($1) to spend instantly, ask for a one-OK spend, or give the one OK.
   * (W4-1 (c): each member's lifetime one-OK allowance equals the Pot's one-OK ceiling, extras.oneOkCap.) */
  minStake: 1_000_000n as Micro,
  /** W4-8: the smallest pay-by-link amount ($1). */
  minLinkAmount: 1_000_000n as Micro,
} as const

/** Policy template versions (`PotView.policyVersion`). 3 / 4 = hub 1.3.0: members only vote, every proposal is the hub's. */
export const POLICY = { V1: 1, V2: 2, V3: 3, V4: 4 } as const

/** The rulebot may approve `call` proposals (the all-or-nothing goal refund): v2 and v4. */
export const policyApprovesGoalRefund = (v: number): boolean => v === POLICY.V2 || v === POLICY.V4

/** Members may file their own proposals straight in the Pot's DAO (legacy v1 / v2 only). */
export const policyMembersPropose = (v: number): boolean => v < POLICY.V3

/** Why `by` can't give the one OK on a request (the hub's `ok_giver_rules`), or null when they can. */
export type OkGiverRefusal = "self" | "not_member" | "receiver" | "joined_after" | "no_stake"

export function okGiverRefusal(i: {
  by: string
  requester: string
  /** the request's receiver (the hub id for a link) */
  receiver: string
  requestCreatedAtMs: number
  /** the OK-giver's hub record when Active, else null */
  member: { joinedAtMs: number; contributed: Micro } | null
}): OkGiverRefusal | null {
  if (i.by === i.requester) return "self"
  if (!i.member) return "not_member"
  if (i.by === i.receiver) return "receiver"
  if (i.member.joinedAtMs >= i.requestCreatedAtMs) return "joined_after"
  if (i.member.contributed < HUB_1_3.minStake) return "no_stake"
  return null
}
