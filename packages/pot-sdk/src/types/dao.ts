// Sputnik DAO v2 types (kb/sputnik-dao.md R3-R10). Testnet Pots run the global code Ea8t…
// (sputnikdao2@278adc7): `act_proposal(id, action, proposal, memo?)` with `deny_unknown_arguments`,
// `vote_counts` as strings, and `get_actions_log`.

import type { AccountId, ProposalId } from "./ids.ts"

export type ProposalStatus = "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved" | "Failed"
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = ["InProgress", "Approved", "Rejected", "Removed", "Expired", "Moved", "Failed"]

/** Every Sputnik action (types.rs). */
export type DaoAction = "AddProposal" | "RemoveProposal" | "VoteApprove" | "VoteReject" | "VoteRemove" | "Finalize" | "MoveToHub"
/** The actions our relayer forwards (D-24, api-spec R11). */
export type VoteAction = "VoteApprove" | "VoteReject" | "Finalize"
export type Vote = "Approve" | "Reject" | "Remove"

/** One action of a FunctionCall proposal; `args` is base64 JSON, deposit/gas are strings. */
export interface ActionCall {
  method_name: string
  args: string
  deposit: string
  gas: string
}

export interface TransferKind {
  Transfer: { token_id: string; receiver_id: string; amount: string; msg?: string | null }
}
export interface AddMemberToRoleKind {
  AddMemberToRole: { member_id: string; role: string }
}
export interface FunctionCallKind {
  FunctionCall: { receiver_id: string; actions: ActionCall[] }
}
/** Any other kind (policy, config, upgrade…): shown read-only, never relayed (rev4 H-2). */
export type OtherKind = Record<string, unknown> | string

/**
 * A proposal kind, kept VERBATIM as the DAO returned it: act_proposal needs it back deep-equal
 * (D-04, D-05; `ERR_WRONG_KIND` otherwise). Never normalize it before voting.
 */
export type ProposalKind = TransferKind | AddMemberToRoleKind | FunctionCallKind | OtherKind

/** Sputnik's proposal-kind labels (permission and vote_policy keys). */
export type KindLabel =
  | "config"
  | "policy"
  | "add_member_to_role"
  | "remove_member_from_role"
  | "call"
  | "upgrade_self"
  | "upgrade_remote"
  | "transfer"
  | "set_vote_token"
  | "add_bounty"
  | "bounty_done"
  | "vote"
  | "factory_info_update"
  | "policy_add_or_update_role"
  | "policy_remove_role"
  | "policy_update_default_vote_policy"
  | "policy_update_parameters"
  | "unknown"

/** get_proposal / get_proposals element, as returned (278adc7: vote_counts values are strings). */
export interface RawProposal {
  id: number
  proposer: string
  description: string
  kind: ProposalKind
  status: ProposalStatus
  vote_counts: Record<string, [number | string, number | string, number | string]>
  votes: Record<string, Vote>
  /** ns, as a decimal string */
  submission_time: string
  last_actions_log?: { block_height: string }[]
}

export interface Proposal {
  id: ProposalId
  proposer: AccountId
  description: string
  /** Verbatim from the DAO (pass it back unchanged to act_proposal). */
  kind: ProposalKind
  status: ProposalStatus
  /** role → [approve, reject, remove], normalized to numbers. */
  voteCounts: Record<string, [number, number, number]>
  votes: Record<string, Vote>
  submissionTimeNs: bigint
}

export interface VotePolicy {
  weight_kind: "RoleWeight" | "TokenWeight"
  quorum: string
  /** [num, den] ratio or an absolute weight string. */
  threshold: [number, number] | string
}

export type RoleKind = "Everyone" | { Member: string } | { Group: string[] }

export interface RolePermission {
  name: string
  kind: RoleKind
  permissions: string[]
  vote_policy: Record<string, VotePolicy>
}

export interface Policy {
  roles: RolePermission[]
  default_vote_policy: VotePolicy
  proposal_bond: string
  proposal_period: string
  bounty_bond: string
  bounty_forgiveness_period: string
}

export interface DaoConfig {
  name: string
  purpose: string
  metadata: string
}

/** What the UI needs from get_policy: the member group and its majority rule (k of n). */
export interface PolicySummary {
  members: AccountId[]
  /** The rulebot Group (should be exactly [hubId]). */
  rulebot: AccountId[]
  /** The member role's default vote threshold, e.g. [1, 2]. */
  threshold: [number, number]
  quorum: number
  proposalPeriodNs: bigint
  /** The policy verbatim. */
  raw: Policy
}

export interface ActionsLogEntry {
  account: AccountId
  proposalId: ProposalId
  action: DaoAction
  blockHeight: number
}

export interface RawActionsLogEntry {
  account_id: string
  proposal_id: string | number
  action: DaoAction
  block_height: string | number
}
