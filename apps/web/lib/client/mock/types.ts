// Mock world records (JSON-safe: amounts in cents) and the view models the UI renders (amounts in Micro).
// The VM shapes follow frontend-architecture §1.4 / §7.5 so the testnet data layer can produce the same ones.
import type { Micro } from "../money"
import type { Rules } from "../rules"
import type { AvatarId } from "@/lib/avatars"
import type { SavedReceipt } from "@/lib/receipt-saved"
import type { PayInTone } from "@/lib/gifts"

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
  /** hub 1.1.0: how it gets approved (absent = 1.0.0: instant or the group) */
  tier?: Tier
  /** the member whose OK approved a one-OK request */
  okBy?: string | null
  /** hub 1.1.0 pay by link: the payee is whoever holds the link (receiver = LINK_RECEIVER, the hub's escrow) */
  link?: LinkRec
  /** the hub's request_ref (an op key, + the saved receipt's 16-hex fingerprint when one was attached); absent in
   *  older worlds and seeds = no fingerprint */
  ref?: string
}

/** A pay-by-link request's link (the hub's LinkRecord twin; contracts-wave4 D4-6 lifecycle). */
export interface LinkRec {
  /** "ed25519:…" of the link key; its secret lives only in the link's #fragment */
  pk: string
  expiresAt: number
  /** who it's for, the requester's own words (off-chain, like a memo) */
  label?: string
  status: "awaiting_funds" | "funded" | "claiming" | "claimed" | "returning" | "returned" | "void"
  fundedAt?: number
  doneAt?: number
  /** who claimed it (a person id in the mock) */
  claimer?: string
  /** who sent the money back: the requester (cancelled) or anyone after expiry */
  returnedBy?: string
  /** fixtures only: a seeded link's secret (a real one lives only on the requester's device) */
  demoSecret?: string
}

export interface EventRec {
  id: string
  kind: "created" | "joined" | "contribution"
  actor: string
  /** cents */
  amount?: number
  at: number
  /** contribution: where the money came from ("pot_dollars" = the person's own Pot dollars; "xc" = another app or
   *  exchange, its record in `xc`; absent = demo dollars) */
  source?: "demo" | "pot_dollars" | "xc"
  /** contribution from another app: the arrived deposit (the money-in details) */
  xc?: XcAddRecord
}

/**
 * An add from another app or exchange as the mock keeps it (the server reads deposit_intent instead): the coin and
 * network, what was sent (the coin's base units) and what arrived (USD micro), and when each moment happened (ms).
 */
export interface XcAddRecord {
  id: string
  mode: "real" | "simulated"
  chain: string
  coin: string
  decimals: number
  stable: boolean
  sent: string
  usdTarget: string
  arrived: string
  refunded?: string | null
  refundReason?: string | null
  depositAddress: string
  addressAt: number
  sentAt?: number | null
  convertingAt?: number | null
  arrivedAt?: number | null
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
  /** hub 1.1.0: the extras asked for (absent = keep the current ones) */
  fromExtras?: ExtrasRec
  extras?: ExtrasRec
}

export interface CloseRec extends ProposalRec {
  /** cents, what the close pays out (pro-rata + dust, the hub's prorata twin), join order */
  payouts: { account: string; amount: number }[]
  /** cents */
  balance: number
  dust: number
  dustTo: string | null
  /** hub 1.1.0: the all-or-nothing goal's refund (the hub proposed and approved it; no one asked) */
  refund?: boolean
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
  /** hub 1.1.0 rule extras; absent = a Pot made before 1.1.0 (everything off) */
  extras?: ExtrasRec
  /** 2 = the hub may approve its own goal-refund close (all-or-nothing Pots) */
  policyVersion?: number
  /** earned trust per member id (kept even with trust off: the public record) */
  trust?: Record<string, TrustRec>
  /** the all-or-nothing / soft goal's progress (the goal itself is in `extras.goal`) */
  goalState?: GoalStateRec
  /** gifts (hub 1.2.0 `set_gifts`): a member turned them off; absent/false = taking gifts (on for every Pot) */
  giftsOff?: boolean
  /** the public gift page (/give/<slug>; our server's gift_page): off until a member turns it on */
  giftPage?: { on: boolean; line: string | null; /** absent = from before the tone (a gift) */ tone?: PayInTone }
}

/** A gift someone sent the Pot (the hub's gift_received + our `gift` row: the giver's name and note). */
export interface GiftRec {
  ref: string
  /** Pot slug */
  pot: string
  /** the giver (a person id in the mock; any account on testnet) */
  from: string
  /** the name the giver chose for this gift (null = none) */
  name: string | null
  /** the giver's note (members see it; the public page only with showPublic) */
  note?: string | null
  /** public page gifts only: show my name (and note) on the page */
  showPublic: boolean
  /** cents */
  amount: number
  at: number
  /** the gift link it came through (null = the public page) */
  linkId: string | null
  /** where the giver's money came from ("pot_dollars" = their own Pot dollars; absent = demo dollars) */
  source?: "pot_dollars"
  /** the pay-in's tone when it was sent (its link's or the page's); absent = from before the tone (a gift) */
  tone?: PayInTone
}

/** A gift link (our server's gift_link): a QR / link a member shares so people outside the Pot can send a gift. */
export interface GiftLinkRec {
  id: string
  /** Pot slug */
  pot: string
  createdBy: string
  /** cents; null = the giver chooses */
  amount: number | null
  note?: string | null
  /** "What's it for?": a payment (default) or a gift; absent = from before the tone (a gift) */
  tone?: PayInTone
  reusable: boolean
  uses: number
  expiresAt: number
  revokedAt: number | null
  createdAt: number
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

/** "Ask for a top-up" (the mock's topup_request; amounts in cents). Status is derived (lib/topups.ts statusOf). */
export interface TopupRec {
  id: string
  /** Pot slug */
  pot: string
  /** the asker (a person id) */
  by: string
  mode: "each" | "total"
  /** cents: each person's part */
  perPerson: number
  /** cents */
  total: number
  reason: string | null
  dueAt: number
  createdAt: number
  /** who was asked and what each had put in then (cents), join order */
  baselines: { id: string; c: number }[]
  cancelledAt?: number | null
  /** frozen at the cancel: person → added (cents) */
  progress?: Record<string, number> | null
}

/** A nudge (the mock's nudge table). */
export interface NudgeRec {
  pot: string
  from: string
  to: string
  topupId: string | null
  at: number
}

/** The mock's push stub: what a push would have said (the mock has no push; e2e reads these). Newest last, ≤ 50. */
export interface MockPushRec {
  to: string
  title: string
  body: string
  url: string
  at: number
}

export interface World {
  v: 1
  pots: Record<string, PotRec>
  nextRequestId: number
  /** person id → chosen brand avatar (the mock's stand-in for app_user.avatar); absent = initials */
  avatars?: Record<string, AvatarId>
  /** comments on requests, oldest first; absent in worlds saved before comments */
  comments?: CommentRec[]
  /** receipt details saved with a spend, by "slug:requestId" (the mock's spend_receipt table) */
  receipts?: Record<string, SavedReceipt>
  /** gifts to Pots, oldest first (the mock's gift table + the hub's gifts_total) */
  gifts?: GiftRec[]
  /** gift links (the mock's gift_link table) */
  giftLinks?: GiftLinkRec[]
  /** "Ask for a top-up" asks, oldest first */
  topups?: TopupRec[]
  /** nudges, oldest first */
  nudges?: NudgeRec[]
  /** the push stub (lib/client/mock/topups.ts) */
  pushes?: MockPushRec[]
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
  /** hub 1.1.0: instant / one OK / the group (absent = 1.0.0) */
  tier?: Tier
  /** whose OK approved a one-OK request */
  okBy?: PersonVM | null
  /** hub 1.1.0 pay by link: set for link requests (the receiver is then the link's label or "someone with the link") */
  link?: LinkVM
  /** the receipt fingerprint the request carries (16 hex, from its request_ref), null/absent = none */
  fingerprint?: string | null
  /** receipt details were saved with this spend (anyone may know that; the details are members only) */
  hasReceipt?: boolean
}

/**
 * A payment link as the UI shows it (lib/client/paylink/link.ts linkStatusOf):
 *  waiting = not approved/funded yet · ready = funded, can be claimed · busy = a claim/return is in flight ·
 *  claimed · expired = funded but past its date (on its way back) · returned = back in the Pot · void = never paid.
 */
export type LinkStatusVM = "waiting" | "ready" | "busy" | "claimed" | "expired" | "returned" | "void"

export interface LinkVM {
  status: LinkStatusVM
  /** the requester's own words for who it's for (members only) */
  label: string | null
  expiresAt: number
  /** who claimed it: their display name when they use Pot, else null ("someone") */
  claimer: PersonVM | null
  /** claimed / returned at */
  doneAt: number | null
  /** returned because it expired (true) or because the requester cancelled it (false) */
  returnedOnExpiry: boolean
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

/** Where an add came from, as its row says it (members; the details sheet has the rest). Absent = not known. */
export interface AddSourceVM {
  kind: "demo" | "pot_dollars" | "xc"
  /** xc: "ETH" */
  coin?: string
  /** xc: the network's id ("base") */
  chain?: string
}

/** `txHash`: the settled transaction behind the item (its receipt); absent when unknown or still pending. */
export type FeedItemVM =
  | { key: string; kind: "created"; at: number; actor: PersonVM; txHash?: string }
  | { key: string; kind: "rules_requested"; at: number; actor: PersonVM; k: number; txHash?: string }
  | { key: string; kind: "rules_changed"; at: number; actor: PersonVM | null; txHash?: string }
  | { key: string; kind: "close_requested"; at: number; actor: PersonVM; k: number; txHash?: string }
  | { key: string; kind: "closed"; at: number; txHash?: string }
  | { key: string; kind: "joined"; at: number; actor: PersonVM; txHash?: string }
  | { key: string; kind: "contribution"; at: number; actor: PersonVM; amount: Micro; txHash?: string; source?: AddSourceVM }
  | { key: string; kind: "request"; at: number; request: RequestVM; txHash?: string }
  /** hub 1.1.0: the goal was reached / the all-or-nothing refund started / everyone got their money back */
  | { key: string; kind: "goal"; at: number; state: "reached" | "refunding" | "refunded"; amount: Micro; txHash?: string }
  /** hub 1.2.0: someone sent the Pot a gift */
  | { key: string; kind: "gift"; at: number; gift: GiftVM; txHash?: string }
  /** "Ask for a top-up": a member asked everyone for more money (off-chain; members only) */
  | { key: string; kind: "topup"; at: number; topup: TopupVM; txHash?: string }

/** One person asked by a top-up ask. */
export interface TopupMemberVM {
  person: PersonVM
  part: Micro
  /** added since the ask */
  added: Micro
  done: boolean
  /** they got a nudge in this Pot in the last 24 h (ms), else null */
  nudgedAt: number | null
}

/** "Ask for a top-up" as the Pot's members see it (lib/topups.ts has the rules). */
export interface TopupVM {
  id: string
  slug: string
  potName: string
  potEmoji: string
  potCover: number
  asker: PersonVM
  mode: "each" | "total"
  /** each person's part */
  perPerson: Micro
  total: Micro
  reason: string | null
  dueAt: number
  createdAt: number
  status: "open" | "done" | "ended" | "cancelled"
  endedAt: number | null
  /** the people asked who are still in the Pot */
  members: TopupMemberVM[]
  doneCount: number
  /** I asked */
  mine: boolean
  /** my part, when I'm asked */
  me: TopupMemberVM | null
}

/** A gift as the Pot's members see it (the giver's note included). */
export interface GiftVM {
  ref: string
  /** the giver: their chosen name for the gift, else their Pot name, else one from their account */
  from: PersonVM
  note: string | null
  showPublic: boolean
  amount: Micro
  at: number
  /** the gift link it came through (null = the public page) */
  linkId: string | null
  /** a plain payment in, or a gift (its words in the feed) */
  tone: PayInTone
  txHash?: string
}

/** A Pot's gifts: on/off, the public page, what came in. */
export interface GiftsVM {
  on: boolean
  page: { on: boolean; line: string | null; tone: PayInTone }
  total: Micro
  count: number
  /** members only: every gift, newest first */
  items: GiftVM[]
}

export interface MemberVM {
  person: PersonVM
  contributed: Micro
  spentShare: Micro
  getsBack: Micro
  spentInstant: Micro
  /** hub 1.3.0 (W4-1 c): one-OK spends charged to this member's lifetime allowance (MemberView.oneOkUsed; absent before) */
  oneOkUsed?: Micro
  isMe: boolean
  /** hub 1.1.0 earned trust (absent on 1.0.0 data) */
  trust?: TrustVM | null
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
  /** hub 1.1.0: the extras before / asked for (absent = unchanged) */
  fromExtras?: ExtrasVM
  toExtras?: ExtrasVM
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
  /** "$X each": the creator's choice, or Create's default (prefills Add money) */
  goalEach: Micro | null
  /** `goalEach` is the creator's real choice, so the hero may say "Aiming for $X each" (never Create's default) */
  goalEachChosen?: boolean
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
  /** hub 1.3.0 (HUB-4): the group approved the close and everyone's share is being sent; the Pot reads "closed" only
   *  once the money has left (PotView.close_settling). The mock pays out at once, so it never sets this. */
  closeSettling?: boolean
  /** who added money last (the close's tiny remainder goes to them) */
  lastContributor?: PersonVM | null
  /** the close math's smallest amount: absent = 1 micro (testnet); the mock world keeps cents (lib/client/refund.ts) */
  moneyUnit?: Micro
  /** null on testnet when this device doesn't hold a live link's secret (make a new one) */
  invite: { pk: string; secret: string; expiresAt: number; usesLeft: number; createdBy: PersonVM } | null
  /** hub 1.1.0 rule extras (absent on 1.0.0 data = everything off) */
  extras?: ExtrasVM
  /** the Pot's goal with a date (hub 1.1.0 extras.goal + get_goal), null without one */
  goalDetail?: GoalVM | null
  /** 1 or 2 (2 = all-or-nothing goals possible) */
  policyVersion?: number
  /** hub 1.2.0 gifts (absent = the gifts feature is off in this build, or not read yet) */
  gifts?: GiftsVM
  /** "Ask for a top-up": the open ask (null = none; absent = not read yet) */
  topup?: TopupVM | null
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
  /** hub 1.1.0: the Pot's goal with a date, for the card's chip */
  goalDetail?: GoalVM | null
  /** hub 1.1.0: my earned trust in this Pot */
  myTrust?: TrustVM | null
}

// ---------------------------------------------------------------------------------------------------------
// hub 1.1.0 (wave 4): earned trust, the one-OK tier, the goal with a date (all or nothing)

/** How a request gets approved: by the rules (instant), one other member's OK, or the group's majority. */
export type Tier = "instant" | "one_ok" | "group"

export interface GoalRec {
  /** cents */
  amount: number
  deadline: number
  allOrNothing: boolean
}

export interface ExtrasRec {
  trust: boolean
  /** cents; 0 = one-OK off */
  oneOkCap: number
  links: boolean
  goal: GoalRec | null
}

/** A member's record (contracts TrustRecord): +1 level per 3 qualifying paid spends, −1 per declined request. */
export interface TrustRec {
  level: number
  streak: number
  settled: number
  /** cents */
  settledAmount: number
  declined: number
  lastDeclinedAt?: number | null
}

export interface GoalStateRec {
  reachedAt?: number | null
  /** the hub's refund close: started at (phase 1), done at (phase 2) */
  refundStartedAt?: number | null
  refundedAt?: number | null
  /** cents per member, what the refund paid */
  refunds?: { account: string; amount: number }[]
}

export interface ExtrasVM {
  trust: boolean
  /** 0n = off */
  oneOkCap: Micro
  links: boolean
}

export interface TrustVM {
  enabled: boolean
  /** 0 New · 1 Trusted · 2 Very trusted */
  level: number
  maxLevel: number
  /** qualifying paid spends still needed for the next level (0 at the top or with trust off) */
  nextLevelIn: number
  step: number
  /** a spend counts toward a level from this amount */
  minQualifying: Micro
  settled: number
  declined: number
  baseCap: Micro
  /** baseCap × (1 + level) with trust on */
  effectiveCap: Micro
  /** min(effectiveCap, what's left of the per-person limit) */
  instantUpTo: Micro
  /** the cap at the next level, null at the top or with trust off */
  nextCap: Micro | null
}

export type GoalStateVM = "collecting" | "reached" | "missed" | "refundable" | "refunding" | "refunded"

export interface GoalVM {
  amount: Micro
  deadline: number
  allOrNothing: boolean
  totalIn: Micro
  state: GoalStateVM
  reachedAt: number | null
  /** an all-or-nothing goal not reached yet: every spend waits */
  spendsBlocked: boolean
}
