// Contract JSON (snake_case) → domain types (camelCase, bigint), contracts-spec §11 mapping
// (tests U-02, U-09). Sputnik normalization: vote_counts number|string → numbers,
// submission_time ns string → bigint.

import type { AccountId, DaoId, PublicKeyStr, Slug } from "../types/ids.ts"
import type {
  RawClosePreview,
  RawCloseOutcome,
  RawConfigView,
  RawCreatePotOutcome,
  RawInviteView,
  RawJoinOutcome,
  RawMemberView,
  RawPotSummary,
  RawPotView,
  RawRequestStatus,
  RawRequestView,
  RawRulesOutcome,
  RawRulesView,
  RawSpendOutcome,
  RawSpendPreview,
  RawSubjectView,
  RawSyncOutcome,
} from "../types/hub-raw.ts"
import type {
  ClosePreview,
  CloseOutcome,
  ConfigView,
  CreatePotOutcome,
  InviteView,
  JoinOutcome,
  MemberView,
  PotSummary,
  PotView,
  RequestUiStatus,
  RequestView,
  RulesOutcome,
  RulesView,
  SpendOutcome,
  SpendPreview,
  SubjectView,
  SyncOutcome,
} from "../types/hub.ts"
import type { ActionsLogEntry, Policy, PolicySummary, Proposal, RawActionsLogEntry, RawProposal, VotePolicy } from "../types/dao.ts"
import type { RawStorageBalance, StorageBalance } from "../types/usdc.ts"
import { rulesFromRaw } from "../rules.ts"
import { toSpendPreviewReason } from "../math/decide.ts"

const big = (s: string | number): bigint => BigInt(s)
const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v)

export function parseConfigView(r: RawConfigView): ConfigView {
  return {
    version: r.version,
    owner: r.owner as AccountId,
    usdc: r.usdc as AccountId,
    daoCodeHash: r.dao_code_hash,
    daoFloat: big(r.dao_float),
    minDaoFloat: big(r.min_dao_float),
    relayers: r.relayers as AccountId[],
    limits: {
      maxMembers: r.limits.max_members,
      maxPotsPerCreatorPerDay: r.limits.max_pots_per_creator_per_day,
      maxSponsoredPotsPerDay: r.limits.max_sponsored_pots_per_day,
      maxPotsPerAccount: r.limits.max_pots_per_account,
      maxActiveInvites: r.limits.max_active_invites,
      maxInvitesTotal: r.limits.max_invites_total,
      maxPendingPerMember: r.limits.max_pending_per_member,
      maxRequestsPerPot: r.limits.max_requests_per_pot,
      minHubReserve: big(r.limits.min_hub_reserve),
    },
    paused: r.paused,
    potCount: r.pot_count,
    sponsoredToday: r.sponsored_today,
    freeBalance: big(r.free_balance),
  }
}

export function parsePotView(r: RawPotView): PotView {
  return {
    pot: r.pot as DaoId,
    slug: r.slug as Slug,
    name: r.name,
    emoji: opt(r.emoji),
    preset: r.preset,
    creator: r.creator as AccountId,
    status: r.status,
    rules: rulesFromRaw(r.rules),
    rulesVersion: r.rules_version,
    totalIn: big(r.total_contributed),
    memberCount: r.member_count,
    joiningCount: r.joining_count,
    approvalsNeeded: r.approvals_needed,
    closeProposalId: opt(r.close_proposal_id),
    createdAtMs: r.created_at_ms,
    closedAtMs: opt(r.closed_at_ms),
    seq: r.seq,
    proposalPeriodMs: r.proposal_period_ms,
    spentInstant: big(r.spent_instant),
    spentVote: big(r.spent_vote),
    reserved: big(r.reserved),
    balanceEstimate: big(r.balance_estimate),
    lastContributor: opt(r.last_contributor) as AccountId | undefined,
    requestCount: r.request_count,
    openRequests: r.open_requests,
    activeInvites: r.active_invites,
    unpaidApproved: r.unpaid_approved,
    float: big(r.float),
    usdc: r.usdc as AccountId,
    openRulesProposal: opt(r.open_rules_proposal),
    closingInFlight: r.closing_in_flight ?? false,
  }
}

export function parsePotSummary(r: RawPotSummary): PotSummary {
  return {
    pot: r.pot as DaoId,
    slug: r.slug as Slug,
    name: r.name,
    emoji: opt(r.emoji),
    preset: r.preset,
    status: r.status,
    seq: r.seq,
    totalIn: big(r.total_contributed),
    myContribution: big(r.contributed),
    memberCount: r.member_count,
    balanceEstimate: big(r.balance_estimate),
    createdAtMs: r.created_at_ms,
  }
}

export function parseMemberView(r: RawMemberView): MemberView {
  return {
    account: r.account_id as AccountId,
    joinIndex: r.join_index,
    status: r.status,
    joinedAtMs: r.joined_at_ms,
    contributed: big(r.contributed),
    spent: big(r.spent),
    instantUsed: big(r.instant_used),
    budgetLeft: big(r.budget_left),
    wouldGetBack: big(r.would_get_back),
    shareOfSpending: big(r.share_of_spending),
    isLastContributor: r.is_last_contributor,
    balanceSource: r.balance_source,
  }
}

export function parseRulesView(r: RawRulesView): RulesView {
  return {
    pot: r.pot as DaoId,
    preset: r.preset,
    rules: rulesFromRaw(r.rules),
    rulesVersion: r.rules_version,
    memberCount: r.member_count,
    approvalsNeeded: r.approvals_needed,
    proposalPeriodMs: r.proposal_period_ms,
  }
}

export function parseSpendPreview(r: RawSpendPreview): SpendPreview {
  return {
    path: r.path,
    reason: toSpendPreviewReason(r.reason),
    hubReason: r.reason,
    approvalsNeeded: r.approvals_needed,
    memberCount: r.member_count,
    instantCap: big(r.instant_cap),
    memberBudget: big(r.member_budget),
    budgetUsed: big(r.budget_used),
    budgetLeft: big(r.budget_left),
    balanceChecked: r.balance_checked === null ? null : big(r.balance_checked),
    clientMustCheck: r.client_must_check,
  }
}

export function parseClosePreview(r: RawClosePreview): ClosePreview {
  return {
    pot: r.pot as DaoId,
    balance: big(r.balance),
    balanceSource: r.balance_source,
    totalIn: big(r.total_contributed),
    approvalsNeeded: r.approvals_needed,
    openRequests: r.open_requests,
    payouts: r.payouts.map((p) => ({ account: p.account_id as AccountId, contributed: big(p.contributed), amount: big(p.amount) })),
    dust: big(r.dust),
    dustTo: (r.dust_to ?? null) as AccountId | null,
    canPropose: r.can_propose,
    blockedReason: r.blocked_reason,
  }
}

/**
 * contracts-spec §11: checking / proposing / approving / pending → proposed; removed → withdrawn;
 * approved → approved, or paid once the payout was seen (the relay outcome, or a later sync that
 * left it approved: pass `payoutSeen`). Others pass through.
 */
export function mapRequestStatus(s: RawRequestStatus, opts: { payoutSeen?: boolean } = {}): RequestUiStatus {
  switch (s) {
    case "checking":
    case "proposing":
    case "approving":
    case "pending":
      return "proposed"
    case "approved":
      return opts.payoutSeen ? "paid" : "approved"
    case "removed":
      return "withdrawn"
    default:
      return s
  }
}

export function parseRequestView(r: RawRequestView, opts: { payoutSeen?: boolean } = {}): RequestView {
  return {
    id: r.request_id,
    pot: r.pot as DaoId,
    requester: r.requester as AccountId,
    receiver: r.receiver_id as AccountId,
    amount: big(r.amount),
    category: r.category,
    requestRef: r.request_ref,
    path: r.path,
    reason: r.reason,
    status: mapRequestStatus(r.status, opts),
    hubStatus: r.status,
    proposalId: r.proposal_id,
    createdAtMs: r.created_at_ms,
    updatedAtMs: r.updated_at_ms,
    expiresAtMs: r.expires_at_ms,
  }
}

export function parseInviteView(r: RawInviteView): InviteView {
  return {
    pot: r.pot as DaoId,
    invitePk: r.invite_pk as PublicKeyStr,
    createdBy: r.created_by as AccountId,
    createdAtMs: r.created_at_ms,
    expiresAtMs: r.expires_at_ms,
    maxUses: r.max_uses,
    uses: r.uses,
    revoked: r.revoked,
    status: r.status,
  }
}

export function parseSubjectView(r: RawSubjectView): SubjectView {
  return {
    pot: r.pot as DaoId,
    proposalId: r.proposal_id,
    kind: r.kind,
    requestId: r.request_id,
    member: (r.member ?? null) as AccountId | null,
    rulesVersion: r.rules_version,
    live: r.live,
  }
}

export const parseCreatePotOutcome = (r: RawCreatePotOutcome): CreatePotOutcome => ({
  ok: r.ok,
  pot: r.pot as DaoId,
  slug: r.slug as Slug | undefined,
  float: r.float === undefined ? undefined : big(r.float),
  usdcRegistered: r.usdc_registered,
  reason: r.reason,
})

export const parseSpendOutcome = (r: RawSpendOutcome): SpendOutcome => ({
  requestId: r.request_id,
  proposalId: r.proposal_id,
  path: r.path,
  reason: r.reason,
  status: r.status,
  refusal: r.refusal,
  approvalsNeeded: r.approvals_needed,
})

export const parseJoinOutcome = (r: RawJoinOutcome): JoinOutcome => ({ ok: r.ok, status: r.status, proposalId: r.proposal_id, reason: r.reason })

export const parseRulesOutcome = (r: RawRulesOutcome): RulesOutcome => ({
  applied: r.applied,
  proposalId: r.proposal_id,
  rulesVersion: r.rules_version,
  reason: r.reason,
})

export const parseCloseOutcome = (r: RawCloseOutcome): CloseOutcome => ({
  ok: r.ok,
  proposalId: r.proposal_id,
  balance: r.balance === undefined ? undefined : big(r.balance),
  payouts: (r.payouts ?? []).map((p) => ({ account: p.account_id as AccountId, amount: big(p.amount) })),
  dust: r.dust === undefined ? undefined : big(r.dust),
  dustTo: r.dust_to as AccountId | undefined,
  approvalsNeeded: r.approvals_needed,
  reason: r.reason,
})

export const parseSyncOutcome = (r: RawSyncOutcome): SyncOutcome => ({
  proposalId: r.proposal_id,
  subject: r.subject,
  daoStatus: r.dao_status,
  hubStatus: r.hub_status,
  changed: r.changed,
})

// ---------------------------------------------------------------- Sputnik

const num = (x: number | string): number => (typeof x === "number" ? x : Number(x))

/** Normalizes a proposal; `kind` is kept verbatim (it must go back to act_proposal unchanged). */
export function parseProposal(r: RawProposal): Proposal {
  const voteCounts: Proposal["voteCounts"] = {}
  for (const [role, c] of Object.entries(r.vote_counts ?? {})) voteCounts[role] = [num(c[0]), num(c[1]), num(c[2])]
  return {
    id: r.id,
    proposer: r.proposer as AccountId,
    description: r.description,
    kind: r.kind,
    status: r.status,
    voteCounts,
    votes: r.votes ?? {},
    submissionTimeNs: BigInt(r.submission_time),
  }
}

function ratio(vp: VotePolicy | undefined): { threshold: [number, number]; quorum: number } {
  const t = vp?.threshold
  const threshold: [number, number] = Array.isArray(t) ? [t[0], t[1]] : [1, 2]
  return { threshold, quorum: vp ? Number(vp.quorum) : 1 }
}

const groupOf = (p: Policy, role: string): AccountId[] => {
  const r = p.roles.find((x) => x.name === role)
  return r && typeof r.kind === "object" && "Group" in r.kind ? (r.kind.Group as AccountId[]) : []
}

/** get_policy → the member group and its majority rule. */
export function parsePolicy(p: Policy): PolicySummary {
  const member = p.roles.find((r) => r.name === "member")
  const vp = member?.vote_policy?.transfer ?? p.default_vote_policy
  const { threshold, quorum } = ratio(vp)
  return {
    members: groupOf(p, "member"),
    rulebot: groupOf(p, "rulebot"),
    threshold,
    quorum,
    proposalPeriodNs: BigInt(p.proposal_period),
    raw: p,
  }
}

export const parseActionsLogEntry = (e: RawActionsLogEntry): ActionsLogEntry => ({
  account: e.account_id as AccountId,
  proposalId: num(e.proposal_id),
  action: e.action,
  blockHeight: num(e.block_height),
})

export const parseStorageBalance = (r: RawStorageBalance | null): StorageBalance | null =>
  r === null ? null : { total: big(r.total), available: big(r.available) }
