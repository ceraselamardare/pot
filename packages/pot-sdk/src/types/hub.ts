// Hub domain types the UI uses (frontend-architecture §1.4), camelCase with Micro = bigint.
// Field names follow §1.4 where it names them (totalIn, memberCount, closeProposalId, account…);
// everything else the contract returns is kept under camelCase names so nothing is lost.
// Contract JSON (snake_case) lives in hub-raw.ts; read/parse.ts maps between them.

import type { Micro } from "../money.ts"
import type { AccountId, DaoId, ProposalId, PublicKeyStr, RequestId, Slug } from "./ids.ts"
import type {
  RawCloseBlockedReason,
  RawGiftRefusal,
  RawGoalState,
  RawLinkStatus,
  RawPreviewReason,
  RawReason,
  RawRecordMoney,
  RawRequestStatus,
  RawSpendRefusal,
  RawTier,
} from "./hub-raw.ts"

export type PresetId = "trip" | "club" | "team" | "custom"
export type Category = "groceries" | "food" | "transport" | "stay" | "tickets" | "other"
export const CATEGORIES: readonly Category[] = ["groceries", "food", "transport", "stay", "tickets", "other"]
export type PayeeRule = "members" | "members_and_allowlist"

/** Mirrors contracts-spec §2.2 Rules. `memberBudget` counts instant spends only (D-07). */
export interface Rules {
  instantCap: Micro
  memberBudget: Micro
  instantPayees: PayeeRule
  /** ≤ 10 accounts; empty for "members". */
  payeeAllowlist: AccountId[]
}

/** contracts-spec §6 (D-60). `custom` has no defaults. */
export const PRESET_RULES: Readonly<Record<Exclude<PresetId, "custom">, Rules>> = {
  trip: { instantCap: 100_000_000n, memberBudget: 200_000_000n, instantPayees: "members", payeeAllowlist: [] },
  club: { instantCap: 50_000_000n, memberBudget: 150_000_000n, instantPayees: "members_and_allowlist", payeeAllowlist: [] },
  team: { instantCap: 250_000_000n, memberBudget: 1_000_000_000n, instantPayees: "members_and_allowlist", payeeAllowlist: [] },
}

/** contracts-spec §2.3 constants used by clients. */
export const HUB_LIMITS = {
  maxMembers: 40,
  maxAllowlist: 10,
  maxNameChars: 48,
  maxEmojiBytes: 16,
  minSlugLen: 2,
  maxSlugLen: 32,
  proposalPeriodMs: 604_800_000,
  proposalPeriodNs: 604_800_000_000_000n,
  defaultInviteTtlMs: 7 * 86_400_000,
  defaultInviteMaxUses: 10,
  maxInviteTtlMs: 30 * 86_400_000,
  minInviteTtlMs: 60_000,
  maxInviteUses: 40,
  closeCooldownMs: 86_400_000,
  maxPendingPerMember: 10,
  maxRequestsPerPot: 1000,
} as const

/** contracts-spec §3.2 reserved slugs (exact match). */
export const RESERVED_SLUGS: readonly string[] = [
  "api", "app", "www", "demo", "admin", "root", "pot", "pots", "hub", "usdc", "treasury", "faucet", "users", "user",
  "relay", "relayer", "preview", "test", "testnet", "mainnet", "near", "sputnik", "trezu", "dao", "rulebot", "owner",
  "system", "support", "help", "about", "settings", "static", "assets", "auth", "login", "logout", "j", "p", "r", "new",
  "create", "null", "undefined",
]

// ---- hub 1.1.0 (wave 4): earned trust, one-OK tier, pay by link, all-or-nothing goal ----

/** How a request gets approved: the hub alone (instant), one other member's OK, or a majority. */
export type Tier = RawTier
export type LinkStatus = RawLinkStatus
export type GoalState = RawGoalState

export interface Goal {
  amount: Micro
  deadlineMs: number
  /** Spends wait for the goal; a missed goal refunds everyone (hub `refund_unfunded`). */
  allOrNothing: boolean
}

/** The rule options added in hub 1.1.0 (contracts/pot-hub/src/types.rs RuleExtras). */
export interface RuleExtras {
  /** Earned trust: the instant cap grows to instantCap × (1 + level). */
  trust: boolean
  /** Over-cap spends ≤ this need one other member's OK. 0n = off. */
  oneOkCap: Micro
  /** Pay by link (the payee is whoever holds the claim link). */
  links: boolean
  goal: Goal | null
}

/** What every Pot created before hub 1.1.0 behaves as (and what hub 1.0.0 data parses to). */
export const LEGACY_EXTRAS: RuleExtras = { trust: false, oneOkCap: 0n, links: false, goal: null }

/** hub 1.1.0 constants (contracts/pot-hub/src/types.rs). */
export const WAVE4_LIMITS = {
  trustStep: 3,
  trustMaxLevel: 2,
  /** a settled spend counts toward a level only if amount × 10 ≥ the base instant cap */
  trustMinSpendDiv: 10n,
  defaultOneOkMult: 3n,
  defaultLinkTtlMs: 14 * 86_400_000,
  minLinkTtlMs: 60_000,
  maxLinkTtlMs: 30 * 86_400_000,
  /** a requester may close an approved-but-unfunded link this long after approval */
  linkSettleMs: 60_000,
  minGoalLeadMs: 60_000,
  maxGoalLeadMs: 366 * 86_400_000,
  /** what the hub (sponsored) or a direct caller spends to register a link claimer on the token */
  claimRegistrationYocto: 1_250_000_000_000_000_000_000n,
} as const

export interface TrustView {
  pot: DaoId
  account: AccountId
  enabled: boolean
  level: number
  maxLevel: number
  streak: number
  step: number
  /** qualifying spends still needed for the next level (0 at the top or with trust off) */
  nextLevelIn: number
  minQualifying: Micro
  settled: number
  settledAmount: Micro
  declined: number
  lastDeclinedMs: number | null
  baseCap: Micro
  multiplier: number
  effectiveCap: Micro
  budgetLeft: Micro
  /** min(effectiveCap, budgetLeft): the biggest single instant spend right now */
  instantUpTo: Micro
  oneOkCap: Micro
}

export interface GoalView {
  pot: DaoId
  amount: Micro
  deadlineMs: number
  allOrNothing: boolean
  totalIn: Micro
  /** hub 1.2.0: gifts received (count toward a normal goal only) */
  giftsTotal?: Micro
  /** hub 1.2.0: what counts toward the goal (totalIn + gifts for a normal goal; totalIn for all-or-nothing) */
  progress?: Micro
  state: Exclude<GoalState, "none">
  reachedAtMs: number | null
  refundProposalId: ProposalId | null
  /** refund_unfunded would act now (propose, approve or retry the refund close) */
  canRefund: boolean
  spendsBlocked: boolean
}

export interface LinkView {
  pot: DaoId
  requestId: RequestId
  requester: AccountId
  amount: Micro
  category: Category
  requestStatus: HubRequestStatus
  status: LinkStatus
  claimPk: PublicKeyStr
  expiresAtMs: number
  receiver: AccountId | null
  fundedAtMs: number | null
  doneAtMs: number | null
  /** funded and not expired (a valid signature is still needed) */
  claimable: boolean
}

/** One row of the public Pot record (hub `get_record`). */
export interface RecordEntry {
  requestId: RequestId
  proposalId: ProposalId | null
  requester: AccountId
  /** the payee; for a link, the claimer once claimed (else null) */
  payee: AccountId | null
  link: boolean
  amount: Micro
  category: Category
  requestRef: string
  tier: Tier
  /** how it was approved; null while not approved */
  approvedBy: "rules" | "one_ok" | "group" | null
  okBy: AccountId | null
  hubStatus: HubRequestStatus
  money: RawRecordMoney
  linkStatus: LinkStatus | null
  createdAtMs: number
  updatedAtMs: number
}

export interface OkOutcome {
  requestId: RequestId
  ok: boolean
  status: string
  reason?: string
}

export interface LinkOutcome {
  requestId: RequestId
  ok: boolean
  status: LinkStatus
  receiver: AccountId | null
  reason?: string
}

export type PotStatus = "open" | "closing" | "closed"
export type SpendPath = "instant" | "vote"
/** The contract's request reason (kept for the Approve sheet's "why" line). */
export type HubReason = RawReason
export type HubRequestStatus = RawRequestStatus
export type SpendRefusal = RawSpendRefusal

export interface Limits {
  maxMembers: number
  maxPotsPerCreatorPerDay: number
  maxSponsoredPotsPerDay: number
  maxPotsPerAccount: number
  maxActiveInvites: number
  maxInvitesTotal: number
  maxPendingPerMember: number
  maxRequestsPerPot: number
  /** yocto */
  minHubReserve: bigint
}

export interface ConfigView {
  version: string
  owner: AccountId
  usdc: AccountId
  daoCodeHash: string
  /** yocto */
  daoFloat: bigint
  minDaoFloat: bigint
  relayers: AccountId[]
  limits: Limits
  paused: boolean
  potCount: number
  sponsoredToday: number
  freeBalance: bigint
}

export interface PotView {
  pot: DaoId
  slug: Slug
  name: string
  emoji?: string
  preset: PresetId
  creator: AccountId
  status: PotStatus
  rules: Rules
  rulesVersion: number
  /** Σ recorded contributions (never decreases). */
  totalIn: Micro
  memberCount: number
  joiningCount: number
  approvalsNeeded: number
  closeProposalId?: ProposalId
  createdAtMs: number
  closedAtMs?: number
  /** Change counter: +1 on every hub-side change (cheap poll target). */
  seq: number
  proposalPeriodMs: number
  spentInstant: Micro
  spentVote: Micro
  reserved: Micro
  /** totalIn \u2212 spent (ledger); the authoritative balance is usdc.ft_balance_of(dao). */
  balanceEstimate: Micro
  lastContributor?: AccountId
  requestCount: number
  openRequests: number
  activeInvites: number
  unpaidApproved: number
  /** yocto */
  float: bigint
  usdc: AccountId
  /** The open hub-created rules proposal, if any (implemented-contract field). */
  openRulesProposal?: ProposalId
  /** A propose_close chain is in flight (implemented-contract field). */
  closingInFlight: boolean
  /** hub 1.1.0 (parse fills it; LEGACY_EXTRAS on 1.0.0 data). Optional for hand-built mocks. */
  extras?: RuleExtras
  /** 1 = v1 DAO policy; 2 = the rulebot can also approve the goal-refund close; hub 1.3.0: 3 = members
   * only vote (every proposal is the hub's); 4 = 3 + the goal-refund approval */
  policyVersion?: number
  /** hub 1.3.0 (HUB-4): the close was approved but the money isn't confirmed out yet ("paying everyone back") */
  closeSettling?: boolean
  /** link requests not claimed / returned / void yet (they block closing) */
  openLinks?: number
  goalState?: GoalState
  /** hub 1.2.0: gifts on (parse fills true on older hubs' data only if the field is present; else undefined) */
  giftsOn?: boolean
  /** hub 1.2.0: Σ gifts received (in balanceEstimate, never in totalIn) */
  giftsTotal?: Micro
  giftsCount?: number
}

export interface PotSummary {
  pot: DaoId
  slug: Slug
  name: string
  emoji?: string
  preset: PresetId
  status: PotStatus
  seq: number
  totalIn: Micro
  /** The queried account's own contribution. */
  myContribution: Micro
  memberCount: number
  balanceEstimate: Micro
  createdAtMs: number
}

export interface MemberView {
  account: AccountId
  joinIndex: number
  status: "active" | "joining"
  joinedAtMs: number
  contributed: Micro
  /** Σ this member's approved requests (any path). */
  spent: Micro
  instantUsed: Micro
  budgetLeft: Micro
  /** hub 1.3.0 (W4-1): one-OK spends approved for this member so far (lifetime; absent on older hubs) */
  oneOkUsed?: Micro
  /** hub 1.3.0 (W4-1): how much more can be approved for this member with one OK */
  oneOkLeft?: Micro
  /** What propose_close would pay now (pro-rata + dust), or the CloseRecord payout. */
  wouldGetBack: Micro
  /** contributed \u2212 wouldGetBack (saturating) = ux-spec "Share of spending". */
  shareOfSpending: Micro
  isLastContributor: boolean
  balanceSource: "argument" | "ledger" | "close_record"
}

export interface RulesView {
  pot: DaoId
  preset: PresetId
  rules: Rules
  rulesVersion: number
  memberCount: number
  approvalsNeeded: number
  proposalPeriodMs: number
}

/**
 * UI reason (contracts-spec §11): within_rules → ok, payee_not_allowed → recipient,
 * insufficient_balance → balance, pot_not_open → not_open; over_cap, over_budget, new_member pass
 * through; every other contract reason → blocked (the raw one stays in `hubReason`).
 */
export type SpendPreviewReason = "ok" | "over_cap" | "over_budget" | "recipient" | "new_member" | "balance" | "not_open" | "blocked"

export interface SpendPreview {
  path: SpendPath | "blocked"
  reason: SpendPreviewReason
  hubReason: RawPreviewReason
  approvalsNeeded: number
  memberCount: number
  instantCap: Micro
  memberBudget: Micro
  budgetUsed: Micro
  budgetLeft: Micro
  /** null when no balance was passed and the ledger estimate was used. */
  balanceChecked: Micro | null
  /** What request_spend verifies on chain but a view cannot. */
  clientMustCheck: string[]
  /** hub 1.1.0: null when blocked */
  tier?: Tier | null
  /** the requester's instant cap after earned trust (before the budget) */
  effectiveCap?: Micro
  trustLevel?: number
  oneOkCap?: Micro
}

export interface ClosePayout {
  account: AccountId
  contributed: Micro
  amount: Micro
}

export interface ClosePreview {
  pot: DaoId
  balance: Micro
  balanceSource: "argument" | "ledger" | "close_record"
  totalIn: Micro
  /** hub 1.2.0 */
  giftsTotal?: Micro
  /** hub 1.2.0: "equal" = nobody added money, the balance (gifts) is split equally */
  split?: "prorata" | "equal"
  approvalsNeeded: number
  openRequests: number
  payouts: ClosePayout[]
  dust: Micro
  dustTo: AccountId | null
  canPropose: boolean
  blockedReason: RawCloseBlockedReason | null
}

/** UI request status (contracts-spec §11): see mapRequestStatus in read/parse.ts. */
export type RequestUiStatus = "proposed" | "approved" | "paid" | "payout_failed" | "rejected" | "expired" | "withdrawn"

export interface RequestView {
  id: RequestId
  pot: DaoId
  requester: AccountId
  receiver: AccountId
  amount: Micro
  category: Category
  requestRef: string
  path: SpendPath
  reason: HubReason
  /** UI status; `hubStatus` keeps the contract's exact value. */
  status: RequestUiStatus
  hubStatus: HubRequestStatus
  proposalId: ProposalId | null
  createdAtMs: number
  updatedAtMs: number
  /** created + 7 d (UI expiry; the DAO's submission_time is authoritative). */
  expiresAtMs: number
  /** hub 1.1.0 */
  tier?: Tier
  okBy?: AccountId | null
  /** set for pay-by-link requests */
  linkStatus?: LinkStatus | null
}

export type InviteStatus = "active" | "expired" | "used_up" | "revoked"

export interface InviteView {
  pot: DaoId
  invitePk: PublicKeyStr
  createdBy: AccountId
  createdAtMs: number
  expiresAtMs: number
  maxUses: number
  uses: number
  revoked: boolean
  status: InviteStatus
}

export type SubjectKind = "spend" | "join" | "close" | "rules" | "sweep"

/** get_proposal_subject (rev4): what the hub created a DAO proposal for. */
export interface SubjectView {
  pot: DaoId
  proposalId: ProposalId
  kind: SubjectKind
  requestId: RequestId | null
  member: AccountId | null
  rulesVersion: number | null
  /** The relayer relays votes / Finalize only when live (R11). */
  live: boolean
}

// ---- outcomes (final values of the change methods) ----

export interface CreatePotOutcome {
  ok: boolean
  pot: DaoId
  slug?: Slug
  /** yocto */
  float?: bigint
  usdcRegistered?: boolean
  reason?: string
}

export interface SpendOutcome {
  requestId: RequestId
  proposalId: ProposalId | null
  path: SpendPath
  reason: HubReason
  status: "approved" | "pending" | "approving" | "rejected" | "payout_failed" | "expired" | "removed" | "refused"
  refusal: SpendRefusal | string | null
  approvalsNeeded: number
  /** hub 1.1.0 */
  tier?: Tier
  link?: boolean
}

export interface JoinOutcome {
  ok: boolean
  status: "active" | "pending" | "failed"
  proposalId?: ProposalId
  reason?: string
}

export interface RulesOutcome {
  applied: boolean
  proposalId: ProposalId | null
  rulesVersion: number
  reason?: string
}

export interface CloseOutcome {
  ok: boolean
  proposalId?: ProposalId
  balance?: Micro
  payouts: { account: AccountId; amount: Micro }[]
  dust?: Micro
  dustTo?: AccountId
  approvalsNeeded?: number
  reason?: string
}

export interface SyncOutcome {
  proposalId: ProposalId
  subject: SubjectKind | "unknown"
  daoStatus: string
  hubStatus: string
  changed: boolean
}

// ---- hub 1.2.0 (gifts): anyone can send a Pot a gift (notes/contracts-gifts.md) ----

export type GiftRefusal = RawGiftRefusal

/** hub 1.2.0 constants (contracts/pot-hub/src/types.rs). */
export const GIFT_LIMITS = {
  /** $1 */
  minAmount: 1_000_000n,
  /** the hub's MAX_AMOUNT ($1B): per gift and for a Pot's gift total */
  maxAmount: 1_000_000_000_000_000n,
  maxRefLen: 32,
  /** a pending gift forward blocks the close at most this long */
  inFlightMs: 60_000,
} as const

export interface GiftsView {
  pot: DaoId
  /** gifts on (default for every Pot; any member can turn them off) */
  on: boolean
  total: Micro
  count: number
  lastGiftMs: number | null
  inFlight: boolean
  /** a gift sent now would be accepted */
  accepting: boolean
  refusal: GiftRefusal | null
  minAmount: Micro
}

/** A parsed `gift_received` event. */
export interface GiftReceived {
  pot: DaoId
  from: AccountId
  amount: Micro
  /** the gift-link id (or another server-chosen tag) the gift was sent with */
  ref: string
  giftsTotal: Micro
  giftsCount: number
}

/** hub 1.3.0 `get_ok_check`: whether `account` could give the one OK on a request right now. */
export interface OkCheck {
  pot: DaoId
  requestId: number
  account: AccountId
  canOk: boolean
  /** why not: "not_one_ok" | "not_pending" | "in_flight" | "self" | "not_member" | "receiver" | "joined_after" |
   * "no_stake" | the requester's side: "off" | "over_one_ok_cap" | "alone" | "one_ok_used_up" | "goal_not_reached" |
   * "requester_not_member" | "pot_not_open" | "paused" */
  reason: string | null
}
