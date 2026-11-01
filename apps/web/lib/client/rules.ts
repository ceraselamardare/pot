// Local rule math for instant feedback (frontend-architecture §3.7), as a thin adapter over @pot/sdk's
// `previewSpendDecision` (the twin of the hub's decide() + preview_spend) and `approvalsNeeded`. The chain
// still decides (`spend.became_vote`); on testnet the RulePreview confirms with hub.preview_spend.
import { approvalsNeeded as sdkApprovalsNeeded, previewSpendDecision, shareOf, type Micro, type Rules as SdkRules } from "@pot/sdk"

export interface Rules {
  /** instant_cap: spends up to this need no approvals */
  instantCap: Micro
  /** member_budget: per-person total of instant spends (D-07) */
  memberBudget: Micro
  instantPayees: "members" | "members_and_allowlist"
  /** proposal period in days (D-04: 7 for every Pot) */
  expiryDays: number
}

export const TRIP_RULES: Rules = {
  instantCap: 100_000_000n, // $100
  memberBudget: 200_000_000n, // $200
  instantPayees: "members",
  expiryDays: 7,
}

/** k of n under majority: max(quorum, min(floor(n·1/2) + 1, n)), quorum 1 (sputnik-dao.md R7). */
export function approvalsNeeded(n: number, quorum = 1): number {
  return sdkApprovalsNeeded(n, [1, 2], quorum)
}

export type PreviewReason = "ok" | "over_cap" | "over_budget" | "recipient" | "new_member" | "balance" | "empty"

export interface SpendPreview {
  path: "instant" | "vote" | "blocked" | "empty"
  reason: PreviewReason
  k: number
  n: number
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
}

// Placeholder ids for the local preview: decideSpend only compares the receiver against them.
const IDS = { hubId: "pots.hub", daoId: "pot.pots.hub", usdcId: "usdc.hub" }

export function previewSpend(i: PreviewInput): SpendPreview {
  const k = approvalsNeeded(i.memberCount)
  const n = i.memberCount
  if (i.amount <= 0n) return { path: "empty", reason: "empty", k, n }
  const rules: SdkRules = {
    instantCap: i.rules.instantCap,
    memberBudget: i.rules.memberBudget,
    instantPayees: i.rules.instantPayees,
    payeeAllowlist: [],
  }
  const d = previewSpendDecision({
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
  })
  if (d.path === "blocked") return { path: "blocked", reason: "balance", k, n }
  if (d.path === "instant") return { path: "instant", reason: "ok", k, n }
  const reason: PreviewReason =
    d.reason === "over_cap" ? "over_cap" : d.reason === "over_budget" ? "over_budget" : d.reason === "new_member" ? "new_member" : "recipient"
  return { path: "vote", reason, k, n }
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
