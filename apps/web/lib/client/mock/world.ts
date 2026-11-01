// The mock world: pure functions over a JSON-safe `World` (seed, actions, selectors). The client store
// (store.ts) persists it in localStorage and adds latency; server components call seedWorld() for /j and
// /demo. The money rules mirror the hub (D-05, D-07, D-08, D-09) so the beats and copy match testnet.
import { prorata, type Rules as SdkRules } from "@pot/sdk"
import { sha256 } from "@noble/hashes/sha2.js"
import { base58 } from "@scure/base"
import { avatarOrNull, type AvatarId } from "@/lib/avatars"
import { cents, MICRO_PER_CENT, type Micro } from "../money"
import { approvalsNeeded, expiresAt, previewSpend, type Rules } from "../rules"
import { DAY, HOUR, LISBON_INVITE, MIN, PEOPLE, PORTO_INVITE } from "./fixtures"
import type {
  Category,
  CommentRec,
  CommentVM,
  ClosePreviewVM,
  CloseRec,
  CloseVM,
  EventRec,
  FeedItemVM,
  MemberRec,
  MemberVM,
  PersonVM,
  PotCardVM,
  PotRec,
  PotVM,
  ProposalRec,
  RequestRec,
  RequestVM,
  RulesChangeVM,
  RulesProposalRec,
  RulesRec,
  Vote,
  World,
} from "./types"

const TRIP = { instantCap: 10_000, memberBudget: 20_000, expiryDays: 7 }

function member(id: string, joinIndex: number, contributed: number, joinedAt: number): MemberRec {
  return { id, joinIndex, contributed, spentInstant: 0, joinedAt }
}

/** The seeded world at time `now` (D-61 README state for Lisbon Trip; Porto Weekend before Leo joins). */
export function seedWorld(now: number): World {
  const lisbon: PotRec = {
    slug: "lisbon-trip",
    name: "Lisbon Trip",
    emoji: "🇵🇹",
    cover: 0,
    creator: "maya",
    status: "open",
    createdAt: now - 3 * DAY,
    goalEach: 15_000,
    rules: TRIP,
    balance: 45_000,
    members: [
      member("maya", 0, 15_000, now - 3 * DAY),
      member("sam", 1, 15_000, now - 3 * DAY + 2 * HOUR),
      member("leo", 2, 15_000, now - 1 * DAY),
    ],
    requests: [],
    events: [
      { id: "e1", kind: "created", actor: "maya", at: now - 3 * DAY },
      { id: "e2", kind: "contribution", actor: "maya", amount: 15_000, at: now - 3 * DAY + 5 * MIN },
      { id: "e3", kind: "joined", actor: "sam", at: now - 3 * DAY + 2 * HOUR },
      { id: "e4", kind: "contribution", actor: "sam", amount: 15_000, at: now - 2 * DAY },
      { id: "e5", kind: "joined", actor: "leo", at: now - 1 * DAY },
      { id: "e6", kind: "contribution", actor: "leo", amount: 15_000, at: now - 1 * DAY + 4 * MIN },
    ],
    invite: { ...LISBON_INVITE, createdBy: "maya", expiresAt: now + 4 * DAY, maxUses: 10, uses: 2 },
  }
  const porto: PotRec = {
    slug: "porto-weekend",
    name: "Porto Weekend",
    emoji: "🍷",
    cover: 3,
    creator: "maya",
    status: "open",
    createdAt: now - 2 * DAY,
    goalEach: 15_000,
    rules: TRIP,
    balance: 30_000,
    members: [member("maya", 0, 15_000, now - 2 * DAY), member("sam", 1, 15_000, now - 1 * DAY)],
    // a settled ask with a short thread, so the demo shows comments on a request (declined: the balance is unchanged)
    requests: [
      {
        id: 11,
        requester: "sam",
        receiver: "sam",
        amount: 12_000,
        category: "food",
        note: "Wine tasting",
        path: "vote",
        reason: "over_cap",
        status: "rejected",
        votes: { sam: "Approve", maya: "Reject" },
        voteAt: { sam: now - 20 * HOUR, maya: now - 19 * HOUR },
        createdAt: now - 20 * HOUR,
        decidedAt: now - 19 * HOUR,
      },
    ],
    events: [
      { id: "p1", kind: "created", actor: "maya", at: now - 2 * DAY },
      { id: "p2", kind: "contribution", actor: "maya", amount: 15_000, at: now - 2 * DAY + 3 * MIN },
      { id: "p3", kind: "joined", actor: "sam", at: now - 1 * DAY },
      { id: "p4", kind: "contribution", actor: "sam", amount: 15_000, at: now - 1 * DAY + 9 * MIN },
    ],
    invite: { ...PORTO_INVITE, createdBy: "maya", expiresAt: now + 5 * DAY, maxUses: 10, uses: 1 },
  }
  const comments: CommentRec[] = [
    { id: "c1", pot: "porto-weekend", requestId: 11, author: "maya", body: "Love it, but can we book it once we're there? It's cheaper on the day.", createdAt: now - 19 * HOUR + 2 * MIN },
    { id: "c2", pot: "porto-weekend", requestId: 11, author: "sam", body: "Fair. I'll ask again on Saturday 🍷", createdAt: now - 18 * HOUR },
  ]
  return { v: 1, pots: { [lisbon.slug]: lisbon, [porto.slug]: porto }, nextRequestId: 12, comments }
}

// ---------------------------------------------------------------------------------------------------------
// helpers

export const nameOf = (id: string): string => (PEOPLE as Record<string, { name: string }>)[id]?.name ?? id
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

// The view being built reads avatars from its world. Views are synchronous, so each exported view sets this on
// entry (withAvatars) instead of threading `w` through every helper that builds a PersonVM.
let viewAvatars: Record<string, AvatarId> = {}
// comments not removed, per "slug:requestId" (RequestVM.comments)
let viewCommentCounts: Record<string, number> = {}
function withAvatars(w: World) {
  viewAvatars = w.avatars ?? {}
  viewCommentCounts = {}
  for (const c of w.comments ?? []) if (!c.deletedAt) viewCommentCounts[`${c.pot}:${c.requestId}`] = (viewCommentCounts[`${c.pot}:${c.requestId}`] ?? 0) + 1
}

function person(pot: PotRec, id: string): PersonVM {
  const name = nameOf(id)
  const m = pot.members.find((x) => x.id === id)
  return { id, name, initials: initialsOf(name), joinIndex: m ? m.joinIndex : null, avatar: avatarOrNull(viewAvatars[id]) }
}

/** A person's chosen avatar (null = initials). */
export function avatarOf(w: World, id: string): AvatarId | null {
  return avatarOrNull(w.avatars?.[id])
}

/** Pick (or clear, with null) a person's brand avatar. */
export function setAvatar(w: World, id: string, avatar: AvatarId | null): World {
  const avatars = { ...(w.avatars ?? {}) }
  if (avatar) avatars[id] = avatar
  else delete avatars[id]
  return { ...w, avatars }
}

function rulesOf(pot: PotRec): Rules {
  return rulesFromRec(pot.rules)
}

export function rulesFromRec(r: RulesRec): Rules {
  const instantPayees = r.instantPayees ?? "members"
  return {
    instantCap: cents(r.instantCap),
    memberBudget: cents(r.memberBudget),
    instantPayees,
    payeeAllowlist: instantPayees === "members" ? [] : [...(r.payeeAllowlist ?? [])],
    expiryDays: r.expiryDays,
  }
}

function clonePot(w: World, slug: string): [World, PotRec] | null {
  const pot = w.pots[slug]
  if (!pot) return null
  const copy: PotRec = structuredClone(pot)
  return [{ ...w, pots: { ...w.pots, [slug]: copy } }, copy]
}

export const isMember = (pot: PotRec, who: string) => pot.members.some((m) => m.id === who)

function isExpired(pot: PotRec, r: RequestRec, now: number) {
  return r.status === "proposed" && now > expiresAt(r.createdAt, pot.rules)
}

// ---------------------------------------------------------------------------------------------------------
// actions (pure)

export type JoinResult = "joined" | "already_member" | "invalid" | "closed" | "used_up"

export function joinPot(w: World, slug: string, who: string, now: number): { world: World; result: JoinResult } {
  const c = clonePot(w, slug)
  if (!c) return { world: w, result: "invalid" }
  const [world, pot] = c
  if (pot.status !== "open") return { world: w, result: "closed" }
  if (isMember(pot, who)) return { world: w, result: "already_member" }
  if (pot.invite.uses >= pot.invite.maxUses || now > pot.invite.expiresAt) return { world: w, result: "used_up" }
  const joinIndex = Math.max(-1, ...pot.members.map((m) => m.joinIndex)) + 1
  pot.members.push(member(who, joinIndex, 0, now))
  pot.invite.uses += 1
  pot.events.push({ id: `j-${who}-${now}`, kind: "joined", actor: who, at: now })
  return { world, result: "joined" }
}

export function addMoney(w: World, slug: string, who: string, amountCents: number, now: number, source: "demo" | "pot_dollars" = "demo"): World {
  const c = clonePot(w, slug)
  if (!c) throw new Error("not_found")
  const [world, pot] = c
  const m = pot.members.find((x) => x.id === who)
  if (!m) throw new Error("not_member")
  if (pot.status !== "open") throw new Error("closed")
  m.contributed += amountCents
  pot.balance += amountCents
  pot.lastContributor = who
  if (source === "pot_dollars" && amountCents > ownDollarsOf(w, who)) throw new Error("insufficient_own")
  pot.events.push({ id: `c-${who}-${now}`, kind: "contribution", actor: who, amount: amountCents, at: now, ...(source === "pot_dollars" ? { source } : {}) })
  return world
}

/**
 * A person's own Pot dollars in the mock (cents): what Pots paid them (approved spends with them as the receiver,
 * refunds at close) minus what they added from their own Pot dollars. Demo dollars are claimed as they are added,
 * so none sit around unused here.
 */
export function ownDollarsOf(w: World, who: string): number {
  let total = 0
  for (const pot of Object.values(w.pots)) {
    for (const r of pot.requests) if (r.receiver === who && r.status === "paid") total += r.amount
    if (pot.status === "closed" && pot.close?.status === "approved") total += pot.close.payouts.find((p) => p.account === who)?.amount ?? 0
    for (const e of pot.events) if (e.kind === "contribution" && e.actor === who && e.source === "pot_dollars") total -= e.amount ?? 0
  }
  return Math.max(0, total)
}

/**
 * A stand-in receipt for the mock world: a stable 32-byte base58 id per settled item, so the receipt links render
 * exactly as on testnet (where every one is a real transaction hash from the relay or the feed).
 */
export function mockTxHash(seed: string): string {
  return base58.encode(sha256(new TextEncoder().encode(`pot-mock|${seed}`)))
}

export interface SpendInput {
  amountCents: number
  category: Category
  note?: string
  receiver: string
}

export function requestSpend(
  w: World,
  slug: string,
  who: string,
  input: SpendInput,
  now: number,
): { world: World; request: RequestRec } {
  const c = clonePot(w, slug)
  if (!c) throw new Error("not_found")
  const [world, pot] = c
  const m = pot.members.find((x) => x.id === who)
  if (!m) throw new Error("not_member")
  if (pot.status !== "open") throw new Error("closed")
  if (input.amountCents <= 0 || input.amountCents > pot.balance) throw new Error("balance")
  const p = previewSpend({
    amount: cents(input.amountCents),
    balance: cents(pot.balance),
    rules: rulesOf(pot),
    memberCount: pot.members.length,
    used: cents(m.spentInstant),
    contributed: cents(m.contributed),
    receiverIsMember: isMember(pot, input.receiver),
  })
  const id = world.nextRequestId
  world.nextRequestId += 1
  const base = {
    id,
    requester: who,
    receiver: input.receiver,
    amount: input.amountCents,
    category: input.category,
    note: input.note,
    createdAt: now,
  }
  let request: RequestRec
  if (p.path === "instant") {
    // the rulebot approves; Sputnik executes the transfer (D-05)
    m.spentInstant += input.amountCents
    pot.balance -= input.amountCents
    request = { ...base, path: "instant", reason: "ok", status: "paid", votes: {}, voteAt: {}, decidedAt: now }
  } else {
    // D-61: the requester's own approval is cast automatically
    request = {
      ...base,
      path: "vote",
      reason: p.reason === "empty" || p.reason === "balance" || p.reason === "ok" ? "over_cap" : p.reason,
      status: "proposed",
      votes: { [who]: "Approve" },
      voteAt: { [who]: now },
    }
    settle(pot, request, now)
  }
  pot.requests.push(request)
  return { world, request }
}

/** Apply the majority rule after a vote: approve + pay, or reject once approval can't be reached. */
function settle(pot: PotRec, r: RequestRec, now: number) {
  const n = pot.members.length
  const k = approvalsNeeded(n)
  const yes = Object.values(r.votes).filter((v) => v === "Approve").length
  const no = Object.values(r.votes).filter((v) => v === "Reject").length
  if (yes >= k) {
    r.decidedAt = now
    if (pot.balance >= r.amount) {
      pot.balance -= r.amount
      r.status = "paid"
    } else {
      r.status = "payout_failed"
    }
  } else if (no > n - k) {
    r.status = "rejected"
    r.decidedAt = now
  }
}

export type VoteResult = "counted" | "approved" | "declined" | "already" | "decided" | "expired" | "not_member"

export function vote(
  w: World,
  slug: string,
  id: number,
  who: string,
  v: Vote,
  now: number,
): { world: World; result: VoteResult } {
  const c = clonePot(w, slug)
  if (!c) throw new Error("not_found")
  const [world, pot] = c
  const r = pot.requests.find((x) => x.id === id)
  if (!r) throw new Error("not_found")
  if (!isMember(pot, who)) return { world: w, result: "not_member" }
  if (r.votes[who]) return { world: w, result: "already" }
  if (isExpired(pot, r, now)) return { world: w, result: "expired" }
  if (r.status !== "proposed") return { world: w, result: "decided" }
  r.votes[who] = v
  r.voteAt[who] = now
  settle(pot, r, now)
  const st = r.status as RequestRec["status"] // settle() mutates it
  const result: VoteResult = st === "paid" || st === "payout_failed" ? "approved" : st === "rejected" ? "declined" : "counted"
  return { world, result }
}

// ---------------------------------------------------------------------------------------------------------
// group decisions that aren't spends: close (P-9) and rules changes (P-8). The proposer's own approval is cast
// with the request (D-61); the majority rule applies as for spends.

/** A hub-style refusal (contract error code), so the sheets map it like the testnet build does. */
export class HubError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = "HubError"
  }
}

const proposalExpired = (pot: PotRec, p: ProposalRec, now: number) => p.status === "proposed" && now > expiresAt(p.createdAt, pot.rules)

function tally(pot: PotRec, p: ProposalRec): "approved" | "rejected" | "proposed" {
  const n = pot.members.length
  const k = approvalsNeeded(n)
  const yes = Object.values(p.votes).filter((v) => v === "Approve").length
  const no = Object.values(p.votes).filter((v) => v === "Reject").length
  return yes >= k ? "approved" : no > n - k ? "rejected" : "proposed"
}

/** Who added money last (worlds saved before `lastContributor` existed: the newest contribution event). */
export function lastContributorOf(pot: PotRec): string | null {
  return pot.lastContributor ?? [...pot.events].reverse().find((e) => e.kind === "contribution")?.actor ?? null
}

/** The hub's close math over this Pot (cents): pro-rata by what each person put in, the remainder to the last contributor. */
export function closeMath(pot: PotRec): { payouts: { account: string; amount: number }[]; dust: number; dustTo: string | null } {
  const contributions = [...pot.members].sort((a, b) => a.joinIndex - b.joinIndex).map((m) => ({ account: m.id, contributed: BigInt(m.contributed) }))
  const last = lastContributorOf(pot)
  const r = prorata(BigInt(Math.max(0, pot.balance)), contributions, last)
  if (!r) return { payouts: [], dust: 0, dustTo: null }
  return { payouts: r.payouts.map((p) => ({ account: p.account, amount: Number(p.amount) })), dust: Number(r.dust), dustTo: r.dustTo }
}

function applyClose(pot: PotRec, c: CloseRec, now: number) {
  const t = tally(pot, c)
  if (t === "approved") {
    c.status = "approved"
    c.decidedAt = now
    pot.balance = 0
    pot.status = "closed"
    pot.closedAt = now
    // open spend requests can't be paid any more
    for (const r of pot.requests) {
      if (r.status !== "proposed") continue
      r.status = "rejected"
      r.decidedAt = now
    }
  } else if (t === "rejected") {
    c.status = "rejected"
    c.decidedAt = now
    pot.status = "open"
  }
}

export function proposeClose(w: World, slug: string, who: string, now: number): { world: World; close: CloseRec } {
  const c = clonePot(w, slug)
  if (!c) throw new HubError("ERR_POT_NOT_FOUND")
  const [world, pot] = c
  if (!isMember(pot, who)) throw new HubError("ERR_NOT_MEMBER")
  if (pot.status === "closed") throw new HubError("ERR_POT_NOT_OPEN")
  if (pot.status === "closing" && pot.close?.status === "proposed") throw new HubError("ERR_CLOSE_IN_PROGRESS")
  if (pot.members.every((m) => m.contributed === 0)) throw new HubError("ERR_NO_CONTRIBUTIONS")
  const math = closeMath(pot)
  const close: CloseRec = {
    id: world.nextRequestId,
    proposer: who,
    votes: { [who]: "Approve" },
    voteAt: { [who]: now },
    createdAt: now,
    status: "proposed",
    balance: pot.balance,
    ...math,
  }
  world.nextRequestId += 1
  pot.close = close
  pot.status = "closing"
  applyClose(pot, close, now)
  return { world, close }
}

export function voteClose(w: World, slug: string, who: string, v: Vote, now: number): { world: World; result: VoteResult } {
  const c = clonePot(w, slug)
  if (!c) throw new HubError("ERR_POT_NOT_FOUND")
  const [world, pot] = c
  const close = pot.close
  if (!close) return { world: w, result: "decided" }
  if (!isMember(pot, who)) return { world: w, result: "not_member" }
  if (close.votes[who]) return { world: w, result: "already" }
  if (proposalExpired(pot, close, now)) return { world: w, result: "expired" }
  if (close.status !== "proposed") return { world: w, result: "decided" }
  close.votes[who] = v
  close.voteAt[who] = now
  applyClose(pot, close, now)
  const st = close.status as ProposalRec["status"]
  return { world, result: st === "approved" ? "approved" : st === "rejected" ? "declined" : "counted" }
}

function applyRules(pot: PotRec, p: RulesProposalRec, now: number) {
  const t = tally(pot, p)
  if (t === "approved") {
    p.status = "approved"
    p.decidedAt = now
    pot.rules = { ...p.rules }
    pot.ruleChanges = [...(pot.ruleChanges ?? []), { by: p.proposer, at: now, group: true }]
  } else if (t === "rejected") {
    p.status = "rejected"
    p.decidedAt = now
  }
}

export function proposeRules(w: World, slug: string, who: string, rules: RulesRec, now: number): { world: World; proposal: RulesProposalRec } {
  const c = clonePot(w, slug)
  if (!c) throw new HubError("ERR_POT_NOT_FOUND")
  const [world, pot] = c
  if (!isMember(pot, who)) throw new HubError("ERR_NOT_MEMBER")
  if (pot.status !== "open") throw new HubError("ERR_POT_NOT_OPEN")
  const open = pot.rulesProposal
  if (open && open.status === "proposed" && !proposalExpired(pot, open, now)) throw new HubError("ERR_RULES_PENDING")
  const proposal: RulesProposalRec = {
    id: world.nextRequestId,
    proposer: who,
    votes: { [who]: "Approve" },
    voteAt: { [who]: now },
    createdAt: now,
    status: "proposed",
    from: { ...pot.rules },
    rules: { ...rules },
  }
  world.nextRequestId += 1
  pot.rulesProposal = proposal
  applyRules(pot, proposal, now)
  return { world, proposal }
}

export function voteRules(w: World, slug: string, who: string, v: Vote, now: number): { world: World; result: VoteResult } {
  const c = clonePot(w, slug)
  if (!c) throw new HubError("ERR_POT_NOT_FOUND")
  const [world, pot] = c
  const p = pot.rulesProposal
  if (!p) return { world: w, result: "decided" }
  if (!isMember(pot, who)) return { world: w, result: "not_member" }
  if (p.votes[who]) return { world: w, result: "already" }
  if (proposalExpired(pot, p, now)) return { world: w, result: "expired" }
  if (p.status !== "proposed" || pot.status !== "open") return { world: w, result: "decided" }
  p.votes[who] = v
  p.voteAt[who] = now
  applyRules(pot, p, now)
  const st = p.status as ProposalRec["status"]
  return { world, result: st === "approved" ? "approved" : st === "rejected" ? "declined" : "counted" }
}

/** Sole member: the change applies at once (hub set_rules; a bigger Pot gets ERR_USE_PROPOSE_RULES). */
export function setRules(w: World, slug: string, who: string, rules: RulesRec, now: number): World {
  const c = clonePot(w, slug)
  if (!c) throw new HubError("ERR_POT_NOT_FOUND")
  const [world, pot] = c
  if (!isMember(pot, who)) throw new HubError("ERR_NOT_MEMBER")
  if (pot.status !== "open") throw new HubError("ERR_POT_NOT_OPEN")
  if (pot.members.length > 1) throw new HubError("ERR_USE_PROPOSE_RULES")
  pot.rules = { ...rules }
  pot.ruleChanges = [...(pot.ruleChanges ?? []), { by: who, at: now, group: false }]
  return world
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 24)
    .replace(/-$/, "")
}

export interface CreateInput {
  name: string
  emoji: string
  cover: number
  goalEachCents: number | null
  /** the Create form's rules (Micro); absent = the default rules */
  rules?: SdkRules
  invite: { pk: string; secret: string }
}

/** The Create form's rules → the mock's record (cents, like the hub's 6 decimals floored to the cent). */
export function rulesRecOf(r: SdkRules | undefined): RulesRec {
  if (!r) return TRIP
  return {
    instantCap: Number(r.instantCap / 10_000n),
    memberBudget: Number(r.memberBudget / 10_000n),
    expiryDays: 7,
    instantPayees: r.instantPayees,
    payeeAllowlist: r.instantPayees === "members" ? [] : [...r.payeeAllowlist],
  }
}

/** Slug = kebab(name) ≤ 24 chars + "-" + 4 base36 chars (frontend-architecture §5.10). */
export function createPot(w: World, who: string, input: CreateInput, now: number, suffix: string): { world: World; slug: string } {
  let slug = `${slugify(input.name) || "pot"}-${suffix}`
  while (w.pots[slug]) slug = `${slug}x` // silent re-suffix on a taken slug (ux-spec 4.12)
  const pot: PotRec = {
    slug,
    name: input.name.trim(),
    emoji: input.emoji,
    cover: input.cover,
    creator: who,
    status: "open",
    createdAt: now,
    goalEach: input.goalEachCents,
    rules: rulesRecOf(input.rules),
    balance: 0,
    members: [member(who, 0, 0, now)],
    requests: [],
    events: [{ id: `cr-${now}`, kind: "created", actor: who, at: now }],
    invite: { ...input.invite, createdBy: who, expiresAt: now + 7 * DAY, maxUses: 10, uses: 0 },
  }
  return { world: { ...w, pots: { ...w.pots, [slug]: pot } }, slug }
}

export function rotateInvite(w: World, slug: string, who: string, invite: { pk: string; secret: string }, now: number): World {
  const c = clonePot(w, slug)
  if (!c) throw new Error("not_found")
  const [world, pot] = c
  pot.invite = { ...invite, createdBy: who, expiresAt: now + 7 * DAY, maxUses: 10, uses: 0 }
  return world
}

// ---------------------------------------------------------------------------------------------------------
// selectors → view models

function requestVM(pot: PotRec, r: RequestRec, me: string | null, now: number): RequestVM {
  const n = pot.members.length
  const k = approvalsNeeded(n)
  const status: RequestVM["status"] =
    r.status === "paid"
      ? r.path === "instant"
        ? "instant"
        : "approved"
      : r.status === "payout_failed"
        ? "failed"
        : r.status === "rejected"
          ? "declined"
          : isExpired(pot, r, now)
            ? "expired"
            : "needs"
  const approvals = Object.entries(r.votes)
    .filter(([, v]) => v === "Approve")
    .map(([id]) => person(pot, id))
  const declines = Object.entries(r.votes)
    .filter(([, v]) => v === "Reject")
    .map(([id]) => person(pot, id))
  const pending = pot.members.filter((m) => !r.votes[m.id]).map((m) => person(pot, m.id))
  return {
    id: r.id,
    // the mock's proposal ids share the request counter (vote path only, like the hub's DAO proposals)
    proposalId: r.path === "vote" ? r.id : null,
    slug: pot.slug,
    potName: pot.name,
    potEmoji: pot.emoji,
    potCover: pot.cover,
    requester: person(pot, r.requester),
    receiver: person(pot, r.receiver),
    amount: cents(r.amount),
    category: r.category,
    note: r.note,
    path: r.path,
    reason: r.reason,
    status,
    approvals,
    declines,
    pending,
    k,
    n,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    expiresAt: expiresAt(r.createdAt, pot.rules),
    myVote: me ? (r.votes[me] ?? null) : null,
    mine: me === r.requester,
    instantCap: cents(pot.rules.instantCap),
    memberBudget: cents(pot.rules.memberBudget),
    balanceAfter: cents(Math.max(0, pot.balance - r.amount)),
    txHash: mockTxHash(`${pot.slug}:request:${r.id}`),
    voteAt: { ...r.voteAt },
    comments: viewCommentCounts[`${pot.slug}:${r.id}`] ?? 0,
  }
}

function proposalStatus(pot: PotRec, p: ProposalRec, now: number): "needs" | "approved" | "declined" | "expired" {
  if (p.status === "approved") return "approved"
  if (p.status === "rejected") return "declined"
  return proposalExpired(pot, p, now) ? "expired" : "needs"
}

function votersOf(pot: PotRec, p: ProposalRec, v: Vote) {
  return Object.entries(p.votes)
    .filter(([, x]) => x === v)
    .map(([id]) => person(pot, id))
}

function closeVM(pot: PotRec, c: CloseRec, me: string | null, now: number): CloseVM {
  return {
    proposalId: c.id,
    proposer: person(pot, c.proposer),
    payouts: c.payouts.map((p) => ({ person: person(pot, p.account), amount: cents(p.amount) })),
    approvals: votersOf(pot, c, "Approve"),
    declines: votersOf(pot, c, "Reject"),
    pending: pot.members.filter((m) => !c.votes[m.id]).map((m) => person(pot, m.id)),
    k: approvalsNeeded(pot.members.length),
    n: pot.members.length,
    myVote: me ? (c.votes[me] ?? null) : null,
    mine: me === c.proposer,
    status: proposalStatus(pot, c, now),
    createdAt: c.createdAt,
    expiresAt: expiresAt(c.createdAt, pot.rules),
    voteAt: { ...c.voteAt },
  }
}

function rulesChangeVM(pot: PotRec, p: RulesProposalRec, me: string | null, now: number): RulesChangeVM {
  return {
    proposalId: p.id,
    proposer: person(pot, p.proposer),
    from: rulesFromRec(p.from),
    to: rulesFromRec(p.rules),
    approvals: votersOf(pot, p, "Approve"),
    declines: votersOf(pot, p, "Reject"),
    pending: pot.members.filter((m) => !p.votes[m.id]).map((m) => person(pot, m.id)),
    k: approvalsNeeded(pot.members.length),
    n: pot.members.length,
    myVote: me ? (p.votes[me] ?? null) : null,
    mine: me === p.proposer,
    status: proposalStatus(pot, p, now),
    createdAt: p.createdAt,
    expiresAt: expiresAt(p.createdAt, pot.rules),
    voteAt: { ...p.voteAt },
  }
}

function closePreviewVM(pot: PotRec, math: ReturnType<typeof closeMath>): ClosePreviewVM {
  const blocked =
    pot.status === "closed"
      ? "pot_not_open"
      : pot.status === "closing"
        ? "close_in_progress"
        : pot.members.every((m) => m.contributed === 0)
          ? "no_contributions"
          : pot.balance <= 0
            ? "nothing_to_refund"
            : null
  return {
    payouts: math.payouts.map((p) => ({ person: person(pot, p.account), amount: cents(p.amount) })),
    dust: cents(math.dust),
    dustTo: math.dustTo ? person(pot, math.dustTo) : null,
    canPropose: blocked === null,
    blockedReason: blocked,
    openRequests: pot.requests.filter((r) => r.status === "proposed").length,
  }
}

export function potView(w: World, slug: string, me: string | null, now: number): PotVM | null {
  withAvatars(w)
  const pot = w.pots[slug]
  if (!pot) return null
  const totalIn = pot.members.reduce((s, m) => s + m.contributed, 0)
  const spentTotal = pot.requests
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + r.amount, 0)
  const balance = cents(pot.balance)
  // "Gets back" = exactly what a close would pay now (the hub's preview_close twin, dust included); once a close
  // is approved, what it paid
  const paid = pot.status === "closed" && pot.close?.status === "approved" ? pot.close.payouts : null
  const math = paid ? null : closeMath(pot)
  const payoutOf = (id: string) => cents((paid ?? math?.payouts ?? []).find((p) => p.account === id)?.amount ?? 0)
  const members: MemberVM[] = pot.members
    .map((m) => {
      const contributed = cents(m.contributed)
      const back = payoutOf(m.id)
      return {
        person: person(pot, m.id),
        contributed,
        getsBack: back,
        spentShare: contributed > back ? contributed - back : 0n,
        spentInstant: cents(m.spentInstant),
        isMe: m.id === me,
      }
    })
    .sort((a, b) => (a.isMe === b.isMe ? (a.person.joinIndex ?? 0) - (b.person.joinIndex ?? 0) : a.isMe ? -1 : 1))
  const meVM = members.find((m) => m.isMe) ?? null
  const reqs = pot.requests.map((r) => requestVM(pot, r, me, now))
  const feed: FeedItemVM[] = [
    ...pot.events.map((e: EventRec): FeedItemVM => {
      const actor = person(pot, e.actor)
      const txHash = mockTxHash(`${pot.slug}:${e.id}`)
      if (e.kind === "contribution") return { key: e.id, kind: "contribution", at: e.at, actor, amount: cents(e.amount ?? 0), txHash }
      return { key: e.id, kind: e.kind, at: e.at, actor, txHash }
    }),
    ...reqs.map((r): FeedItemVM => ({ key: `request:${r.id}`, kind: "request", at: r.decidedAt ?? r.createdAt, request: r, txHash: r.txHash })),
    ...(pot.close
      ? [{ key: `close:${pot.close.id}`, kind: "close_requested" as const, at: pot.close.createdAt, actor: person(pot, pot.close.proposer), k: approvalsNeeded(pot.members.length), txHash: mockTxHash(`${pot.slug}:close:${pot.close.id}`) }]
      : []),
    ...(pot.status === "closed" && pot.closedAt ? [{ key: `closed:${pot.slug}`, kind: "closed" as const, at: pot.closedAt, txHash: mockTxHash(`${pot.slug}:closed`) }] : []),
    ...(pot.rulesProposal && pot.rulesProposal.status === "proposed"
      ? [{ key: `rules:${pot.rulesProposal.id}`, kind: "rules_requested" as const, at: pot.rulesProposal.createdAt, actor: person(pot, pot.rulesProposal.proposer), k: approvalsNeeded(pot.members.length), txHash: mockTxHash(`${pot.slug}:rules:${pot.rulesProposal.id}`) }]
      : []),
    ...(pot.ruleChanges ?? []).map((c, i): FeedItemVM => ({ key: `rules-changed:${i}`, kind: "rules_changed", at: c.at, actor: c.group ? null : person(pot, c.by), txHash: mockTxHash(`${pot.slug}:rules-changed:${i}`) })),
  ].sort((a, b) => b.at - a.at)
  const goalEach = pot.goalEach === null ? null : cents(pot.goalEach)
  return {
    slug: pot.slug,
    name: pot.name,
    emoji: pot.emoji,
    cover: pot.cover,
    status: pot.status,
    creator: person(pot, pot.creator),
    balance,
    totalIn: cents(totalIn),
    goal: goalEach === null ? null : goalEach * BigInt(Math.max(3, pot.members.length)),
    goalEach,
    rules: rulesOf(pot),
    k: approvalsNeeded(pot.members.length),
    n: pot.members.length,
    members,
    me: meVM,
    myShare: meVM ? meVM.getsBack : 0n,
    feed,
    waitingOnMe: reqs.filter((r) => r.status === "needs" && !r.myVote && me !== null && isMember(pot, me)),
    mine: reqs.filter((r) => r.mine && r.path === "vote"),
    spent: cents(spentTotal),
    close: pot.close ? closeVM(pot, pot.close, me, now) : null,
    closedAt: pot.closedAt ?? null,
    rulesChange: pot.rulesProposal ? rulesChangeVM(pot, pot.rulesProposal, me, now) : null,
    rulesPending: !!pot.rulesProposal && pot.rulesProposal.status === "proposed" && !proposalExpired(pot, pot.rulesProposal, now),
    closePreview: math ? closePreviewVM(pot, math) : null,
    closingInFlight: false,
    lastContributor: lastContributorOf(pot) ? person(pot, lastContributorOf(pot)!) : null,
    // the mock's money is whole cents, so its close math runs in cents (the refund preview mirrors that)
    moneyUnit: MICRO_PER_CENT,
    invite: {
      pk: pot.invite.pk,
      secret: pot.invite.secret,
      expiresAt: pot.invite.expiresAt,
      usesLeft: Math.max(0, pot.invite.maxUses - pot.invite.uses),
      createdBy: person(pot, pot.invite.createdBy),
    },
  }
}

export function potsOf(w: World, me: string, now: number): PotCardVM[] {
  withAvatars(w)
  return Object.values(w.pots)
    .filter((p) => isMember(p, me))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => {
      const v = potView(w, p.slug, me, now)!
      return {
        slug: p.slug,
        name: p.name,
        emoji: p.emoji,
        cover: p.cover,
        status: p.status,
        balance: v.balance,
        myShare: v.myShare,
        waiting: v.waitingOnMe.length,
        goal: v.goal,
        totalIn: v.totalIn,
        members: v.members.map((m) => m.person).sort((a, b) => (a.joinIndex ?? 0) - (b.joinIndex ?? 0)),
      }
    })
}

export interface RequestsVM {
  waiting: RequestVM[]
  mine: RequestVM[]
  decided: RequestVM[]
}

export function requestsOf(w: World, me: string, now: number): RequestsVM {
  withAvatars(w)
  const all: RequestVM[] = []
  for (const p of Object.values(w.pots)) {
    if (!isMember(p, me)) continue
    for (const r of p.requests) if (r.path === "vote") all.push(requestVM(p, r, me, now))
  }
  all.sort((a, b) => b.createdAt - a.createdAt)
  return {
    waiting: all.filter((r) => r.status === "needs" && !r.myVote),
    mine: all.filter((r) => r.mine && r.status === "needs"),
    decided: all.filter((r) => r.status !== "needs" && now - (r.decidedAt ?? r.expiresAt) < 30 * DAY),
  }
}

export function waitingCount(w: World, me: string, now: number): number {
  return requestsOf(w, me, now).waiting.length
}

export function requestView(w: World, slug: string, id: number, me: string | null, now: number): RequestVM | null {
  withAvatars(w)
  const pot = w.pots[slug]
  const r = pot?.requests.find((x) => x.id === id)
  return pot && r ? requestVM(pot, r, me, now) : null
}

// ---------------------------------------------------------------------------------------------------------
// comments on requests (the mock's request_comment table): members only, the author removes their own

export type CommentError = "not_member" | "not_found" | "not_author" | "invalid"

export class CommentWorldError extends Error {
  constructor(readonly code: CommentError) {
    super(code)
  }
}

/** One request's thread for `me` (oldest first, newest at the bottom); null when `me` isn't a member. */
export function commentsOf(w: World, slug: string, requestId: number, me: string | null): CommentVM[] | null {
  withAvatars(w)
  const pot = w.pots[slug]
  if (!pot || !me || !isMember(pot, me)) return null
  return (w.comments ?? [])
    .filter((c) => c.pot === slug && c.requestId === requestId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => ({ id: c.id, author: person(pot, c.author), body: c.deletedAt ? null : c.body, createdAt: c.createdAt, deleted: !!c.deletedAt, mine: c.author === me }))
}

/** Add a comment (the text is already cleaned: lib/comment-text.ts). */
export function addComment(w: World, slug: string, requestId: number, who: string, body: string, now: number, id: string): World {
  const pot = w.pots[slug]
  if (!pot || !isMember(pot, who)) throw new CommentWorldError("not_member")
  if (!pot.requests.some((r) => r.id === requestId)) throw new CommentWorldError("not_found")
  if (!body) throw new CommentWorldError("invalid")
  return { ...w, comments: [...(w.comments ?? []), { id, pot: slug, requestId, author: who, body, createdAt: now }] }
}

/** Soft-remove the author's own comment (idempotent). */
export function removeComment(w: World, slug: string, requestId: number, id: string, who: string, now: number): World {
  const pot = w.pots[slug]
  if (!pot || !isMember(pot, who)) throw new CommentWorldError("not_member")
  const c = (w.comments ?? []).find((x) => x.id === id && x.pot === slug && x.requestId === requestId)
  if (!c) throw new CommentWorldError("not_found")
  if (c.author !== who) throw new CommentWorldError("not_author")
  if (c.deletedAt) return w
  return { ...w, comments: (w.comments ?? []).map((x) => (x === c ? { ...x, body: "", deletedAt: now } : x)) }
}

export type { Micro }
