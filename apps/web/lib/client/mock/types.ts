// Mock world records (JSON-safe: amounts in cents) and the view models the UI renders (amounts in Micro).
// The VM shapes follow frontend-architecture §1.4 / §7.5 so the testnet data layer can produce the same ones.
import type { Micro } from "../money"
import type { Rules } from "../rules"
import type { AvatarId } from "@/lib/avatars"

export type Category = "groceries" | "food" | "transport" | "stay" | "tickets" | "other"
export type Vote = "Approve" | "Reject"

export interface MemberRec {
  id: string
  joinIndex: number
  /** cents */
  contributed: number
  /** cents of instant spends (counts toward the per-person limit) */
  spentInstant: number
  joinedAt: number
}

export type ReqStatus = "proposed" | "paid" | "payout_failed" | "rejected"
export type ReqReason = "ok" | "over_cap" | "over_budget" | "recipient" | "new_member"

export interface RequestRec {
  id: number
  requester: string
  receiver: string
  /** cents */
  amount: number
  category: Category
  note?: string
  path: "instant" | "vote"
  reason: ReqReason
  status: ReqStatus
  votes: Record<string, Vote>
  voteAt: Record<string, number>
  createdAt: number
  decidedAt?: number
}

export interface EventRec {
  id: string
  kind: "created" | "joined" | "contribution"
  actor: string
  /** cents */
  amount?: number
  at: number
  /** contribution: where the money came from ("pot_dollars" = the person's own Pot dollars; absent = demo dollars) */
  source?: "demo" | "pot_dollars"
}

export interface InviteRec {
  pk: string
  secret: string
  createdBy: string
  expiresAt: number
  maxUses: number
  uses: number
}

/** A group decision that isn't a spend (P-8 rules change, P-9 close): votes, then applied once approved. */
export interface ProposalRec {
  id: number
  proposer: string
  votes: Record<string, Vote>
  voteAt: Record<string, number>
  createdAt: number
  status: "proposed" | "approved" | "rejected"
  decidedAt?: number
}

export interface RulesRec {
  /** cents */
  instantCap: number
  /** cents */
  memberBudget: number
  expiryDays: number
  /** absent in older saved worlds = "members" */
  instantPayees?: "members" | "members_and_allowlist"
  payeeAllowlist?: string[]
}

export interface RulesProposalRec extends ProposalRec {
  from: RulesRec
  rules: RulesRec
}

export interface CloseRec extends ProposalRec {
  /** cents, what the close pays out (pro-rata + dust, the hub's prorata twin), join order */
  payouts: { account: string; amount: number }[]
  /** cents */
  balance: number
  dust: number
  dustTo: string | null
}

export interface PotRec {
  slug: string
  name: string
  emoji: string
  cover: number
  creator: string
  status: "open" | "closing" | "closed"
  createdAt: number
  /** cents per person, or null without a goal */
  goalEach: number | null
  rules: RulesRec
  /** cents */
  balance: number
  members: MemberRec[]
  requests: RequestRec[]
  events: EventRec[]
  invite: InviteRec
  /** P-9: the open (or last) close request; absent in worlds saved before F-22 */
  close?: CloseRec | null
  /** P-8: the open (or last) rules change request */
  rulesProposal?: RulesProposalRec | null
  /** sole-member and group-approved rules changes (feed) */
  ruleChanges?: { by: string; at: number; group: boolean }[]
  closedAt?: number | null
  /** member id of whoever added money last (dust goes to them, D-09) */
  lastContributor?: string | null
}

/** A comment on a request (the mock's stand-in for the request_comment table). */
export interface CommentRec {
  id: string
  /** Pot slug */
  pot: string
  requestId: number
  author: string
  /** '' once removed */
  body: string
  createdAt: number
  deletedAt?: number
}

export interface World {
  v: 1
  pots: Record<string, PotRec>
  nextRequestId: number
  /** person id → chosen brand avatar (the mock's stand-in for app_user.avatar); absent = initials */
  avatars?: Record<string, AvatarId>
  /** comments on requests, oldest first; absent in worlds saved before comments */
  comments?: CommentRec[]
}

// ---------------------------------------------------------------------------------------------------------
// View models

export interface PersonVM {
  id: string
  name: string
  initials: string
  /** join order in this Pot (avatar colour member-((i mod 6) + 1)); null = invited, not joined */
  joinIndex: number | null
  /** the person's chosen brand avatar (You → Profile); null/absent = initials on the member colour */
  avatar?: AvatarId | null
}

export type RequestStatusVM = "needs" | "instant" | "approved" | "declined" | "expired" | "failed"

export interface RequestVM {
  /** the hub's request id (mock: the world's id) */
  id: number
  /** live only: the DAO proposal behind it (vote path, and instant spends after approval) */
  proposalId?: number | null
  slug: string
  potName: string
  potEmoji: string
  potCover: number
  requester: PersonVM
  receiver: PersonVM
  amount: Micro
  category: Category
  note?: string
  path: "instant" | "vote"
  reason: ReqReason
  status: RequestStatusVM
  approvals: PersonVM[]
  declines: PersonVM[]
  /** members who haven't decided yet */
  pending: PersonVM[]
  k: number
  n: number
  createdAt: number
  decidedAt?: number
  expiresAt: number
  myVote: Vote | null
  mine: boolean
  instantCap: Micro
  memberBudget: Micro
  balanceAfter: Micro
  /** the transaction that made the request (its receipt), when known */
  txHash?: string
  /** when each member approved/declined (mock only; the chain doesn't keep vote times) */
  voteAt?: Record<string, number>
  /** comments on this request that aren't removed (the feed's commentCounts on testnet) */
  comments?: number
}

/** One comment in a request's thread (newest at the bottom). */
export interface CommentVM {
  id: string
  author: PersonVM
  /** null once removed ("Comment removed") */
  body: string | null
  createdAt: number
  deleted: boolean
  mine: boolean
}

/** `txHash`: the settled transaction behind the item (its receipt); absent when unknown or still pending. */
export type FeedItemVM =
  | { key: string; kind: "created"; at: number; actor: PersonVM; txHash?: string }
  | { key: string; kind: "rules_requested"; at: number; actor: PersonVM; k: number; txHash?: string }
  | { key: string; kind: "rules_changed"; at: number; actor: PersonVM | null; txHash?: string }
  | { key: string; kind: "close_requested"; at: number; actor: PersonVM; k: number; txHash?: string }
  | { key: string; kind: "closed"; at: number; txHash?: string }
  | { key: string; kind: "joined"; at: number; actor: PersonVM; txHash?: string }
  | { key: string; kind: "contribution"; at: number; actor: PersonVM; amount: Micro; txHash?: string }
  | { key: string; kind: "request"; at: number; request: RequestVM; txHash?: string }

export interface MemberVM {
  person: PersonVM
  contributed: Micro
  spentShare: Micro
  getsBack: Micro
  spentInstant: Micro
  isMe: boolean
}

/** A close request (P-9): what the group votes on, decoded from the DAO proposal itself (testnet). */
export interface CloseVM {
  proposalId: number
  proposer: PersonVM
  payouts: { person: PersonVM; amount: Micro }[]
  approvals: PersonVM[]
  declines?: PersonVM[]
  /** members who haven't decided yet */
  pending?: PersonVM[]
  k: number
  n: number
  myVote: Vote | null
  mine: boolean
  status: "needs" | "approved" | "declined" | "expired" | "failed"
  createdAt?: number
  expiresAt?: number
  /** when each member approved/declined (mock only) */
  voteAt?: Record<string, number>
}

/** A rules change request (P-8): the new rules decoded from the proposal (testnet) next to the current ones. */
export interface RulesChangeVM {
  proposalId: number
  proposer: PersonVM
  from: Rules
  to: Rules
  approvals: PersonVM[]
  declines: PersonVM[]
  pending: PersonVM[]
  k: number
  n: number
  myVote: Vote | null
  mine: boolean
  status: "needs" | "approved" | "declined" | "expired" | "failed"
  createdAt: number
  expiresAt: number
  /** when each member approved/declined (mock only) */
  voteAt?: Record<string, number>
}

/** What closing now would pay (hub preview_close on testnet; the sdk prorata twin in the mock). */
export interface ClosePreviewVM {
  payouts: { person: PersonVM; amount: Micro }[]
  dust: Micro
  dustTo: PersonVM | null
  canPropose: boolean
  /** pot_not_open | close_in_progress | payouts_pending | busy | no_contributions | nothing_to_refund */
  blockedReason: string | null
  openRequests: number
}

export interface PotVM {
  slug: string
  name: string
  emoji: string
  cover: number
  status: "open" | "closing" | "closed"
  creator: PersonVM
  balance: Micro
  totalIn: Micro
  goal: Micro | null
  goalEach: Micro | null
  rules: Rules
  k: number
  n: number
  members: MemberVM[]
  me: MemberVM | null
  myShare: Micro
  feed: FeedItemVM[]
  waitingOnMe: RequestVM[]
  mine: RequestVM[]
  spent: Micro
  /** the open (or last) close request */
  close?: CloseVM | null
  closedAt?: number | null
  /** the open rules change request (at most one per Pot, ERR_RULES_PENDING) */
  rulesChange?: RulesChangeVM | null
  /** the hub has an open rules request (open_rules_proposal), even before this device decoded it */
  rulesPending?: boolean
  /** what a close would pay now (Members "Gets back", the Close sheet's table) */
  closePreview?: ClosePreviewVM | null
  /** a propose_close chain is in flight (money in is blocked for ≤ 60 s) */
  closingInFlight?: boolean
  /** who added money last (the close's tiny remainder goes to them) */
  lastContributor?: PersonVM | null
  /** the close math's smallest amount: absent = 1 micro (testnet); the mock world keeps cents (lib/client/refund.ts) */
  moneyUnit?: Micro
  /** null on testnet when this device doesn't hold a live link's secret (make a new one) */
  invite: { pk: string; secret: string; expiresAt: number; usesLeft: number; createdBy: PersonVM } | null
}

export interface PotCardVM {
  slug: string
  name: string
  emoji: string
  cover: number
  status: "open" | "closing" | "closed"
  balance: Micro
  myShare: Micro
  waiting: number
  goal: Micro | null
  totalIn: Micro
  members: PersonVM[]
}
