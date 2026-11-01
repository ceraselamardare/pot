// Hub domain types the UI uses (frontend-architecture §1.4), camelCase with Micro = bigint.
// Field names follow §1.4 where it names them (totalIn, memberCount, closeProposalId, account…);
// everything else the contract returns is kept under camelCase names so nothing is lost.
// Contract JSON (snake_case) lives in hub-raw.ts; read/parse.ts maps between them.

import type { Micro } from "../money.ts"
import type { AccountId, DaoId, ProposalId, PublicKeyStr, RequestId, Slug } from "./ids.ts"
import type { RawCloseBlockedReason, RawPreviewReason, RawReason, RawRequestStatus, RawSpendRefusal } from "./hub-raw.ts"

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

export type SubjectKind = "spend" | "join" | "close" | "rules"

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
