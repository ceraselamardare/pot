// Local rule math for instant feedback (frontend-architecture §3.7), as a thin adapter over @pot/sdk's
// `previewSpendDecision` (the twin of the hub's decide() + preview_spend) and `approvalsNeeded`. The chain
// still decides (`spend.became_vote`); on testnet the RulePreview confirms with hub.preview_spend.
import { approvalsNeeded as sdkApprovalsNeeded, decideSpend, previewSpendDecision, shareOf, type Micro, type RuleExtras, type Rules as SdkRules } from "@pot/sdk"

export interface Rules {
  /** instant_cap: spends up to this need no approvals */
  instantCap: Micro
  /** member_budget: per-person total of instant spends (D-07) */
  memberBudget: Micro
  instantPayees: "members" | "members_and_allowlist"
  /** people outside the Pot who can get instant payments (≤ 10; empty for "members") */
  payeeAllowlist: string[]
  /** proposal period in days (D-04: 7 for every Pot) */
  expiryDays: number
}

/** The Create form's starting values (the old Trip preset): the landing, the /demo tour and the mock seed use them. */
export const DEFAULT_RULES: Rules = {
  instantCap: 100_000_000n, // $100
  memberBudget: 200_000_000n, // $200
  instantPayees: "members",
  payeeAllowlist: [],
  expiryDays: 7,
}

/** k of n under majority: max(quorum, min(floor(n·1/2) + 1, n)), quorum 1 (sputnik-dao.md R7). */
export function approvalsNeeded(n: number, quorum = 1): number {
  return sdkApprovalsNeeded(n, [1, 2], quorum)
}

export type PreviewReason = "ok" | "over_cap" | "over_budget" | "recipient" | "new_member" | "balance" | "empty" | "goal"

export interface SpendPreview {
  path: "instant" | "vote" | "blocked" | "empty"
  reason: PreviewReason
  k: number
  n: number
  /** hub 1.1.0: who approves it (instant, one OK, the group); absent without extras or when blocked */
  tier?: "instant" | "one_ok" | "group"
  /** the requester's instant limit after earned trust (= the Pot's instant limit without trust) */
  effectiveCap?: Micro
}

export interface PreviewInput {
  amount: Micro
  balance: Micro
  rules: Rules
  memberCount: number
  /** the requester's instant spends so far (counts toward memberBudget) */
  used: Micro
  /** the requester's contributions so far (rev4: instant needs contributed > 0) */
  contributed: Micro
  receiverIsMember: boolean
  /** money reserved for approved-but-unpaid requests */
  reserved?: Micro
  // ---- hub 1.1.0 (omitted = the 1.0.0 behaviour) ----
  /** earned trust + the one-OK ceiling (links/goal don't change the preview) */
  extras?: Pick<RuleExtras, "trust" | "oneOkCap">
  /** the requester's trust level (0-2) */
  trustLevel?: number
  /** an all-or-nothing goal not reached yet: every spend waits */
  goalBlocks?: boolean
}

// Placeholder ids for the local preview: decideSpend only compares the receiver against them.
const IDS = { hubId: "pots.hub", daoId: "pot.pots.hub", usdcId: "usdc.hub" }

export function previewSpend(i: PreviewInput): SpendPreview {
  const k = approvalsNeeded(i.memberCount)
  const n = i.memberCount
  const extras: RuleExtras | undefined = i.extras ? { trust: i.extras.trust, oneOkCap: i.extras.oneOkCap, links: false, goal: null } : undefined
  const effectiveCap = extras?.trust ? i.rules.instantCap * BigInt(1 + (i.trustLevel ?? 0)) : i.rules.instantCap
  if (i.goalBlocks) return { path: "blocked", reason: "goal", k, n, effectiveCap }
  if (i.amount <= 0n) return { path: "empty", reason: "empty", k, n, effectiveCap }
  const rules: SdkRules = {
    instantCap: i.rules.instantCap,
    memberBudget: i.rules.memberBudget,
    instantPayees: i.rules.instantPayees,
    payeeAllowlist: [],
  }
  const input = {
    ...IDS,
    paused: false,
    potOpen: true,
    rules,
    requestCount: 0,
    maxRequestsPerPot: Number.MAX_SAFE_INTEGER,
    maxPendingPerMember: Number.MAX_SAFE_INTEGER,
    requester: { instantUsed: i.used, contributed: i.contributed, pendingVotes: 0 },
    receiverIsMember: i.receiverIsMember,
    receiverId: i.receiverIsMember ? "member.users.hub" : "outsider.users.hub",
    amount: i.amount,
    balance: i.balance,
    reserved: i.reserved ?? 0n,
    ...(extras ? { extras, trustLevel: i.trustLevel ?? 0, memberCount: i.memberCount } : {}),
  }
  const d = previewSpendDecision(input)
  if (d.path === "blocked") return { path: "blocked", reason: "balance", k, n, effectiveCap }
  // the tier: decideSpend's (one OK only with extras, ≥ 2 members and amount ≤ the one-OK ceiling)
  const decided = decideSpend({ ...input, requestRef: undefined })
  const tier = extras && decided.ok ? decided.tier : undefined
  if (d.path === "instant") return { path: "instant", reason: "ok", k, n, effectiveCap, ...(tier ? { tier } : {}) }
  const reason: PreviewReason =
    d.reason === "over_cap" ? "over_cap" : d.reason === "over_budget" ? "over_budget" : d.reason === "new_member" ? "new_member" : "recipient"
  return { path: "vote", reason, k, n, effectiveCap, ...(tier ? { tier } : {}) }
}

/** A request expires `expiryDays` after it was made; Sputnik sets Expired lazily, so the UI computes it. */
export function expiresAt(createdAtMs: number, rules: Pick<Rules, "expiryDays">): number {
  return createdAtMs + rules.expiryDays * 86_400_000
}

/** Pro-rata "gets back" if the Pot closed now: floor(balance × mine / total) to the cent (D-09, sdk shareOf). */
export function getsBack(balance: Micro, mine: Micro, total: Micro): Micro {
  const raw = shareOf(balance, mine, total)
  return raw - (raw % 10_000n)
}
