// Live view models (F-05 + F-16 feed merge, frontend-architecture §3.6-3.7): chain views (hub Pot, members,
// requests, DAO proposals, the Pot's USDC balance) ⊕ the feed route (names, contributions with receipts, memos)
// → the same PotVM / RequestVM / FeedItemVM the mock world produces, so components don't change.
// Pure: no I/O, so vm.test.ts can drive it with sdk-shaped fixtures.
//  - The chain is the truth for money and status; the feed route adds names, memos and per-contribution rows.
//  - Identity keys: contribution:<txHash> | request:<requestId> | join:<account> | created:<dao>.
//  - Expiry is computed client-side (Sputnik sets it lazily).
//  - The balance is usdc.ft_balance_of(dao), never balanceEstimate (it ignores close payouts).
import { decodeCloseKind, decodeRulesKind, receiptFingerprintOfRef, type Api, type ClosePreview, type GoalView, type MemberView, type PotView, type Proposal, type RequestView, type InviteView, type LinkView, type TrustView } from "@pot/sdk"
import { t } from "@/i18n/t"
import type { Micro } from "../money"
import { getsBack } from "../rules"
import type { Rules } from "../rules"
import type { Category, ClosePreviewVM, CloseVM, FeedItemVM, MemberVM, PersonVM, PotCardVM, PotVM, ReqReason, RequestStatusVM, RequestVM, RulesChangeVM, Vote } from "../mock/types"
import { extrasVMOf, goalFeedOf, goalVMOf, trustVMOf } from "./vm-wave4"
import { liveLinkParts, type FeedWithLinks } from "./vm-paylink"
import { initialsOf } from "../mock/world"
import { avatarOrNull, type AvatarId } from "@/lib/avatars"

export interface LiveInvite {
  pk: string
  secret: string
  view: InviteView | null
}

export interface LiveBundle {
  dao: string
  /** the token account, to decode close payouts (ft_transfer actions) */
  usdcId?: string
  /** the hub account, to decode rules proposals (set_rules) */
  hubId?: string
  /** hub preview_close at the live balance: what closing now would pay (Members "Gets back", the Close sheet) */
  closePreview?: ClosePreview | null
  view: PotView
  balance: Micro
  members: MemberView[]
  requests: RequestView[]
  proposals: Record<number, Proposal>
  feed: Api.FeedRes | null
  invite: LiveInvite | null
  /** hub 1.1.0 get_trusts (absent / [] on a 1.0.0 hub) */
  trusts?: TrustView[]
  /** hub 1.1.0 get_goal (null without a goal) */
  goal?: GoalView | null
  /** hub 1.1.0 pay by link: get_link per link request (its date, claimer) */
  links?: Record<number, LinkView>
}

export interface LiveContext {
  me: string | null
  /** the session's display name, for my own row when the feed has no profile yet */
  myName?: string
  /** the session's chosen avatar, for my own row when the feed has no profile yet */
  myAvatar?: AvatarId | null
  now: number
  /** off-chain "$X each" goal in Micro, or null (D-61: Create suggests $150) */
  goalEach: Micro | null
}

export const DEFAULT_GOAL_EACH: Micro = 150_000_000n
const DAY = 86_400_000

/** "maya-k3f9.users.pots.x.testnet" → "Maya"; "u-ab12cd34.relay…" → null (no readable name). */
export function nameFromAccount(account: string): string | null {
  const first = account.split(".")[0] ?? ""
  const base = first.replace(/-[a-z0-9]{2,8}$/, "")
  if (!base || base === "u" || /^[a-z]?[0-9]+$/.test(base) || base.length > 20) return null
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** Stable cover index (0-5) from the feed's gradient id, else from the slug. */
export function coverOf(slug: string, gradient?: string): number {
  if (gradient && /^[0-5]$/.test(gradient)) return Number(gradient)
  let h = 0
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 6
}

const REASON: Record<string, ReqReason> = {
  within_rules: "ok",
  over_cap: "over_cap",
  over_budget: "over_budget",
  payee_not_allowed: "recipient",
  new_member: "new_member",
  auto_approve_failed: "over_cap",
}

function people(b: LiveBundle, ctx: LiveContext) {
  const profiles = b.feed?.profiles ?? {}
  const joinIndex = new Map(b.members.map((m) => [m.account as string, m.joinIndex]))
  const cache = new Map<string, PersonVM>()
  return (account: string): PersonVM => {
    const hit = cache.get(account)
    if (hit) return hit
    const name =
      profiles[account]?.name ??
      (account === ctx.me && ctx.myName ? ctx.myName : null) ??
      nameFromAccount(account) ??
      t("person.fallback")
    // my own picture comes from the session (updated the moment I pick one); everyone else's from the feed profiles
    const avatar = avatarOrNull(account === ctx.me && ctx.myAvatar !== undefined ? ctx.myAvatar : profiles[account]?.avatar)
    const p: PersonVM = { id: account, name, initials: initialsOf(name) || "•", joinIndex: joinIndex.get(account) ?? null, avatar }
    cache.set(account, p)
    return p
  }
}

/** DAO truth first (the hub's status moves only after `sync`), then the hub's view; expiry computed locally. */
function requestStatus(r: RequestView, p: Proposal | undefined, expiresAt: number, now: number): RequestStatusVM {
  if (r.status === "payout_failed" || p?.status === "Failed") return "failed"
  if (r.status === "rejected" || p?.status === "Rejected") return "declined"
  if (r.status === "expired" || p?.status === "Expired") return "expired"
  if (r.status === "approved" || r.status === "paid" || p?.status === "Approved") return r.path === "instant" ? "instant" : "approved"
  if (r.status === "withdrawn" || p?.status === "Removed" || p?.status === "Moved") return "declined"
  return now > expiresAt ? "expired" : "needs"
}

export function liveRequestVM(b: LiveBundle, r: RequestView, ctx: LiveContext, person = people(b, ctx)): RequestVM {
  const v = b.view
  const p = r.proposalId !== null ? b.proposals[r.proposalId] : undefined
  const expiresAt = p ? Number(p.submissionTimeNs / 1_000_000n) + v.proposalPeriodMs : r.expiresAtMs
  const status = requestStatus(r, p, expiresAt, ctx.now)
  const votes = (p?.votes ?? {}) as Record<string, string>
  const active = b.members.filter((m) => m.status === "active")
  const approvals = Object.entries(votes)
    .filter(([, x]) => x === "Approve")
    .map(([a]) => person(a))
  const declines = Object.entries(votes)
    .filter(([, x]) => x === "Reject")
    .map(([a]) => person(a))
  const myVote = ctx.me && (votes[ctx.me] === "Approve" || votes[ctx.me] === "Reject") ? (votes[ctx.me] as Vote) : null
  const decided = status !== "needs"
  return {
    id: r.id,
    proposalId: r.proposalId,
    slug: v.slug,
    potName: v.name,
    potEmoji: v.emoji ?? "",
    potCover: coverOf(v.slug, b.feed?.pot.gradient),
    requester: person(r.requester),
    receiver: person(r.receiver),
    amount: r.amount,
    category: r.category as Category,
    note: b.feed?.memos?.[r.requestRef],
    path: r.path,
    reason: REASON[r.reason] ?? "over_cap",
    status,
    approvals,
    declines,
    pending: active.filter((m) => !votes[m.account]).map((m) => person(m.account)),
    k: v.approvalsNeeded,
    n: v.memberCount,
    createdAt: r.createdAtMs,
    decidedAt: decided ? r.updatedAtMs : undefined,
    expiresAt,
    myVote,
    mine: ctx.me === r.requester,
    instantCap: v.rules.instantCap,
    memberBudget: v.rules.memberBudget,
    balanceAfter: b.balance > r.amount ? b.balance - r.amount : 0n,
    comments: b.feed?.commentCounts?.[String(r.id)] ?? 0,
    // saved receipt details: the fingerprint the request itself carries (its request_ref, read from the hub here,
    // never from our server) and whether the server has details for it (the feed's public `receipts`)
    fingerprint: receiptFingerprintOfRef(r.requestRef),
    hasReceipt: !!b.feed?.receipts?.includes(String(r.id)),
    ...receiptOfRequest(b, r),
    ...(r.tier ? { tier: r.tier } : {}),
    ...(r.okBy ? { okBy: person(r.okBy) } : {}),
    // pay by link: where the link is, who it's for, who claimed it (vm-paylink.ts)
    ...liveLinkParts(r, status, b.links?.[r.id], b.feed as FeedWithLinks | null, ctx.now, person, (a) => b.members.some((m) => m.account === a && m.status === "active")),
  }
}

/** The feed route's transaction for a request (matched by its request_ref, else its proposal id). */
function receiptOfRequest(b: LiveBundle, r: RequestView): { txHash?: string } {
  const it = b.feed?.items.find(
    (x) => x.type === "request" && !!x.txHash && ((!!x.requestRef && x.requestRef === r.requestRef) || (r.proposalId !== null && x.proposalId === r.proposalId)),
  )
  return it?.txHash ? { txHash: it.txHash } : {}
}

/** The feed route's transaction behind a key (`join:<account>`, `close:<id>`, `closed:<dao>`). */
function receiptOf(b: LiveBundle, key: string): { txHash?: string } {
  const tx = b.feed?.items.find((x) => x.key === key && !!x.txHash)?.txHash
  return tx ? { txHash: tx } : {}
}

export function livePotVM(b: LiveBundle, ctx: LiveContext): PotVM {
  const v = b.view
  const person = people(b, ctx)
  const active = b.members.filter((m) => m.status === "active")
  const totalIn = v.totalIn
  const preview = v.status === "open" ? (b.closePreview ?? null) : null
  const trustBy = new Map((b.trusts ?? []).map((x) => [x.account as string, x]))
  const members: MemberVM[] = active
    .map((m) => {
      // preview_close at the live balance is authoritative (pro-rata + dust); then get_members' own answer
      // (argument = live balance, close_record = the actual refund once closing/closed); the local math last
      const fromPreview = preview?.payouts.find((p) => p.account === m.account)
      const back = fromPreview
        ? fromPreview.amount
        : preview
          ? 0n
          : m.balanceSource !== "ledger"
            ? m.wouldGetBack
            : totalIn === 0n
              ? // hub 1.2.0 close_split: a Pot that only got gifts is split equally among the active members
                getsBack(b.balance, 1n, BigInt(active.length))
              : getsBack(b.balance, m.contributed, totalIn)
      return {
        person: person(m.account),
        contributed: m.contributed,
        getsBack: back,
        spentShare: m.contributed > back ? m.contributed - back : 0n,
        spentInstant: m.instantUsed,
        isMe: m.account === ctx.me,
        ...(trustBy.has(m.account) ? { trust: trustVMOf(trustBy.get(m.account)!) } : {}),
      }
    })
    .sort((a, c) => (a.isMe === c.isMe ? (a.person.joinIndex ?? 0) - (c.person.joinIndex ?? 0) : a.isMe ? -1 : 1))
  const meVM = members.find((m) => m.isMe) ?? null
  const reqs = b.requests.map((r) => liveRequestVM(b, r, ctx, person))

  // feed merge: server history (contributions with receipts) ⊕ chain (joins, requests, missing contributions)
  const feed: FeedItemVM[] = [{ key: `created:${b.dao}`, kind: "created", at: v.createdAtMs, actor: person(v.creator) }]
  for (const m of active) {
    if (m.account !== v.creator) feed.push({ key: `join:${m.account}`, kind: "joined", at: m.joinedAtMs, actor: person(m.account), ...receiptOf(b, `join:${m.account}`) })
  }
  const serverIn = new Map<string, Micro>()
  for (const it of b.feed?.items ?? []) {
    if (it.type !== "contribution" || !it.amount) continue
    const amount = BigInt(it.amount)
    serverIn.set(it.actor, (serverIn.get(it.actor) ?? 0n) + amount)
    const source = it.txHash ? b.feed?.addSources?.[it.txHash] : undefined
    feed.push({ key: it.key, kind: "contribution", at: Date.parse(it.at), actor: person(it.actor), amount, ...(it.txHash ? { txHash: it.txHash } : {}), ...(source ? { source } : {}) })
  }
  for (const m of active) {
    // money the chain counts but the feed route never saw (seeded by script, or relayed elsewhere)
    const missing = m.contributed - (serverIn.get(m.account) ?? 0n)
    if (missing > 0n) feed.push({ key: `contribution:chain:${m.account}`, kind: "contribution", at: m.joinedAtMs + 1, actor: person(m.account), amount: missing })
  }
  for (const r of reqs) feed.push({ key: `request:${r.id}`, kind: "request", at: r.link?.doneAt ?? r.decidedAt ?? r.createdAt, request: r, ...(r.txHash ? { txHash: r.txHash } : {}) })
  const close = closeVM(b, ctx, person)
  if (close) {
    const p = b.proposals[close.proposalId]
    const at = p ? Number(p.submissionTimeNs / 1_000_000n) : ctx.now
    feed.push({ key: `close:${close.proposalId}`, kind: "close_requested", at, actor: close.proposer, k: close.k, ...receiptOf(b, `close:${close.proposalId}`) })
  }
  if (v.status === "closed") feed.push({ key: `closed:${b.dao}`, kind: "closed", at: v.closedAtMs ?? ctx.now, ...receiptOf(b, `closed:${b.dao}`) })
  const goalDetail = goalVMOf(v, b.goal ?? null, ctx.now)
  feed.push(...goalFeedOf(b.dao, v, b.goal ?? null, ctx.now))
  const rulesChange = rulesChangeVM(b, ctx, person)
  if (rulesChange && rulesChange.status === "needs")
    feed.push({ key: `rules:${rulesChange.proposalId}`, kind: "rules_requested", at: rulesChange.createdAt, actor: rulesChange.proposer, k: rulesChange.k })
  feed.sort((a, c) => c.at - a.at)

  const goalEach = ctx.goalEach
  const spent = v.spentInstant + v.spentVote
  const inviteView = b.invite?.view ?? null
  return {
    slug: v.slug,
    name: v.name,
    emoji: v.emoji ?? "",
    cover: coverOf(v.slug, b.feed?.pot.gradient),
    status: v.status,
    creator: person(v.creator),
    balance: b.balance,
    totalIn,
    // hub 1.1.0: the goal with a date (on chain) wins over this device's "$X each" estimate
    goal: goalDetail ? goalDetail.amount : goalEach === null ? null : goalEach * BigInt(Math.max(3, v.memberCount)),
    goalEach,
    rules: {
      instantCap: v.rules.instantCap,
      memberBudget: v.rules.memberBudget,
      instantPayees: v.rules.instantPayees,
      payeeAllowlist: [...(v.rules.payeeAllowlist ?? [])],
      expiryDays: Math.max(1, Math.round(v.proposalPeriodMs / DAY)),
    },
    k: v.approvalsNeeded,
    n: v.memberCount,
    members,
    me: meVM,
    myShare: meVM ? meVM.getsBack : 0n,
    feed,
    waitingOnMe: reqs.filter((r) => r.status === "needs" && !r.myVote && !r.mine && meVM !== null),
    mine: reqs.filter((r) => r.mine && r.path === "vote"),
    spent,
    close,
    closedAt: v.closedAtMs ?? null,
    rulesChange,
    rulesPending: v.openRulesProposal !== undefined && v.openRulesProposal !== null,
    closePreview: preview ? closePreviewVM(preview, person) : null,
    closingInFlight: v.closingInFlight,
    lastContributor: v.lastContributor ? person(v.lastContributor) : null,
    invite:
      b.invite && (!inviteView || inviteView.status === "active")
        ? {
            pk: b.invite.pk,
            secret: b.invite.secret,
            expiresAt: inviteView?.expiresAtMs ?? v.createdAtMs + 7 * DAY,
            usesLeft: inviteView ? Math.max(0, inviteView.maxUses - inviteView.uses) : 10,
            createdBy: person(inviteView?.createdBy ?? ctx.me ?? v.creator),
          }
        : null,
    ...(v.extras ? { extras: extrasVMOf(v.extras), policyVersion: v.policyVersion ?? 1 } : {}),
    goalDetail,
  }
}

function closeVM(b: LiveBundle, ctx: LiveContext, person: (a: string) => PersonVM): CloseVM | null {
  const id = b.view.closeProposalId
  if (id === undefined || id === null) return null
  const p = b.proposals[id]
  if (!p) return null
  const payouts = (b.usdcId ? decodeCloseKind(p.kind, b.usdcId) : null) ?? []
  const votes = p.votes as Record<string, string>
  const myVote = ctx.me && (votes[ctx.me] === "Approve" || votes[ctx.me] === "Reject") ? (votes[ctx.me] as Vote) : null
  const expiresAt = Number(p.submissionTimeNs / 1_000_000n) + b.view.proposalPeriodMs
  const status: CloseVM["status"] =
    p.status === "Approved" ? "approved" : p.status === "Rejected" ? "declined" : p.status === "Failed" ? "failed" : p.status === "Expired" || ctx.now > expiresAt ? "expired" : "needs"
  // the DAO's proposer is the hub; who asked comes from the feed route, else the first approval
  const asked = b.feed?.items.find((x) => x.type === "close_requested" && (x.proposalId === undefined || x.proposalId === id))?.actor
  const firstApproval = Object.entries(votes).find(([, x]) => x === "Approve")?.[0]
  const proposer = person(asked ?? firstApproval ?? b.view.creator)
  return {
    proposalId: id,
    proposer,
    payouts: payouts.map((x) => ({ person: person(x.account), amount: x.amount })),
    approvals: Object.entries(votes)
      .filter(([, x]) => x === "Approve")
      .map(([a]) => person(a)),
    declines: Object.entries(votes)
      .filter(([, x]) => x === "Reject")
      .map(([a]) => person(a)),
    pending: b.members.filter((m) => m.status === "active" && !votes[m.account]).map((m) => person(m.account)),
    createdAt: Number(p.submissionTimeNs / 1_000_000n),
    expiresAt,
    k: b.view.approvalsNeeded,
    n: b.view.memberCount,
    myVote,
    mine: proposer.id === ctx.me,
    status,
  }
}

function closePreviewVM(p: ClosePreview, person: (a: string) => PersonVM): ClosePreviewVM {
  return {
    payouts: p.payouts.map((x) => ({ person: person(x.account), amount: x.amount })),
    dust: p.dust,
    dustTo: p.dustTo ? person(p.dustTo) : null,
    canPropose: p.canPropose,
    blockedReason: p.blockedReason,
    openRequests: p.openRequests,
  }
}

const toWebRules = (r: { instantCap: Micro; memberBudget: Micro; instantPayees: Rules["instantPayees"]; payeeAllowlist?: readonly string[] }, expiryDays: number): Rules => ({
  instantCap: r.instantCap,
  memberBudget: r.memberBudget,
  instantPayees: r.instantPayees,
  payeeAllowlist: [...(r.payeeAllowlist ?? [])],
  expiryDays,
})

/** The open rules request, decoded from the DAO proposal itself (never the UI's guess of what was asked). */
function rulesChangeVM(b: LiveBundle, ctx: LiveContext, person: (a: string) => PersonVM): RulesChangeVM | null {
  const id = b.view.openRulesProposal
  if (id === undefined || id === null || !b.hubId) return null
  const p = b.proposals[id]
  if (!p) return null
  const decoded = decodeRulesKind(p.kind, b.hubId)
  if (!decoded || decoded.pot !== b.dao) return null
  const expiryDays = Math.max(1, Math.round(b.view.proposalPeriodMs / DAY))
  const votes = p.votes as Record<string, string>
  const myVote = ctx.me && (votes[ctx.me] === "Approve" || votes[ctx.me] === "Reject") ? (votes[ctx.me] as Vote) : null
  const createdAt = Number(p.submissionTimeNs / 1_000_000n)
  const expiresAt = createdAt + b.view.proposalPeriodMs
  const status: RulesChangeVM["status"] =
    p.status === "Approved" ? "approved" : p.status === "Rejected" ? "declined" : p.status === "Failed" ? "failed" : p.status === "Expired" || ctx.now > expiresAt ? "expired" : "needs"
  // the DAO's proposer is the hub; who asked comes from the feed route, else the first approval
  const asked = b.feed?.items.find((x) => x.type === "rule_change" && x.proposalId === id)?.actor
  const firstApproval = Object.entries(votes).find(([, x]) => x === "Approve")?.[0]
  const proposer = person(asked ?? firstApproval ?? b.view.creator)
  const active = b.members.filter((m) => m.status === "active")
  return {
    proposalId: id,
    proposer,
    from: toWebRules(b.view.rules, expiryDays),
    to: toWebRules(decoded.rules, expiryDays),
    approvals: Object.entries(votes)
      .filter(([, x]) => x === "Approve")
      .map(([a]) => person(a)),
    declines: Object.entries(votes)
      .filter(([, x]) => x === "Reject")
      .map(([a]) => person(a)),
    pending: active.filter((m) => !votes[m.account]).map((m) => person(m.account)),
    k: b.view.approvalsNeeded,
    n: b.view.memberCount,
    myVote,
    mine: proposer.id === ctx.me,
    status,
    createdAt,
    expiresAt,
    ...(decoded.extras ? { toExtras: extrasVMOf(decoded.extras), fromExtras: extrasVMOf(b.view.extras ?? { trust: false, oneOkCap: 0n, links: false, goal: null }) } : {}),
  }
}

export function liveCardVM(p: PotVM): PotCardVM {
  return {
    slug: p.slug,
    name: p.name,
    emoji: p.emoji,
    cover: p.cover,
    status: p.status,
    balance: p.balance,
    myShare: p.myShare,
    waiting: p.waitingOnMe.length,
    goal: p.goal,
    totalIn: p.totalIn,
    members: p.members.map((m) => m.person).sort((a, c) => (a.joinIndex ?? 0) - (c.joinIndex ?? 0)),
    goalDetail: p.goalDetail ?? null,
    myTrust: p.me?.trust ?? null,
  }
}
