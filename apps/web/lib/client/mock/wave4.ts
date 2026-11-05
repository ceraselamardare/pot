// hub 1.1.0 (wave 4) in the mock world: earned trust, the one-OK tier, the goal with a date (all or nothing), the
// public Pot record's seed. Pure functions over the JSON-safe records (cents), mirroring contracts/pot-hub
// (wave4.rs, lib.rs trust_settle / trust_decline, goal_state) so the mock beats match testnet:
//  - trust: +1 level per TRUST_STEP qualifying paid spends (amount × 10 ≥ the instant limit), max level 2, the
//    instant limit is instantCap × (1 + level) with trust on; a declined request drops a level and restarts the
//    streak. Counted once, when a request is paid; kept even with trust off (the public record).
//  - one OK: a spend over your (trust-adjusted) instant limit but ≤ the one-OK ceiling, in a Pot of ≥ 2, needs one
//    other member's OK; an earlier "no" (a Reject) is an objection, and then the group decides.
//  - goal: while an all-or-nothing goal isn't reached every spend waits; once the date passes short, money in is
//    refused and the hub refunds everyone (phase 1 propose, phase 2 approve: the mock's "cron" in store.ts).
// A Pot without `extras` is a Pot made before hub 1.1.0: everything off (LEGACY).
import { spendRef } from "@pot/sdk"
import { isoDayUtc } from "@/lib/receipt"
import { RECEIPT_VERIFY_URL, receiptFingerprint, type SavedReceipt } from "@/lib/receipt-saved"
import { cents, type Micro } from "../money"
import type {
  CloseRec,
  ExtrasRec,
  ExtrasVM,
  GoalStateVM,
  GoalVM,
  MemberRec,
  PotRec,
  RequestRec,
  RulesRec,
  TrustRec,
  TrustVM,
  World,
  XcAddRecord,
} from "./types"

export const TRUST_STEP = 3
export const TRUST_MAX_LEVEL = 2
export const TRUST_MIN_SPEND_DIV = 10
export const ONE_OK_MULT = 3
/** the mock "cron": how long the refund's two steps take (propose → approve) */
export const REFUND_PHASE_MS = 5_000

export const LEGACY_EXTRAS_REC: ExtrasRec = { trust: false, oneOkCap: 0, links: false, goal: null }

/** The hub's defaults for a Pot made without extras: trust on, one OK up to 3 × the instant limit, links on, no goal. */
export function defaultExtrasRec(rules: Pick<RulesRec, "instantCap">): ExtrasRec {
  return { trust: true, oneOkCap: rules.instantCap * ONE_OK_MULT, links: true, goal: null }
}

export const extrasOf = (pot: PotRec): ExtrasRec => pot.extras ?? LEGACY_EXTRAS_REC

export function extrasVM(x: ExtrasRec): ExtrasVM {
  return { trust: x.trust, oneOkCap: cents(x.oneOkCap), links: x.links }
}

const EMPTY_TRUST: TrustRec = { level: 0, streak: 0, settled: 0, settledAmount: 0, declined: 0, lastDeclinedAt: null }

export function trustOf(pot: PotRec, id: string): TrustRec {
  return pot.trust?.[id] ?? EMPTY_TRUST
}

function putTrust(pot: PotRec, id: string, t: TrustRec) {
  pot.trust = { ...(pot.trust ?? {}), [id]: t }
}

export interface TrustChange {
  member: string
  from: number
  to: number
}

/** A paid request (counted once per request): may level its requester up. Mutates `pot`. */
export function trustSettle(pot: PotRec, r: RequestRec): TrustChange | null {
  const t = { ...trustOf(pot, r.requester) }
  t.settled += 1
  t.settledAmount += r.amount
  let change: TrustChange | null = null
  if (r.amount * TRUST_MIN_SPEND_DIV >= pot.rules.instantCap) {
    t.streak = Math.min(TRUST_STEP, t.streak + 1)
    if (t.streak >= TRUST_STEP && t.level < TRUST_MAX_LEVEL) {
      change = { member: r.requester, from: t.level, to: t.level + 1 }
      t.level += 1
      t.streak = 0
    }
  }
  putTrust(pot, r.requester, t)
  return change
}

/** A declined request: its requester drops a level and the streak restarts. Mutates `pot`. */
export function trustDecline(pot: PotRec, r: RequestRec, now: number): TrustChange | null {
  const t = { ...trustOf(pot, r.requester) }
  const from = t.level
  t.level = Math.max(0, t.level - 1)
  t.streak = 0
  t.declined += 1
  t.lastDeclinedAt = now
  putTrust(pot, r.requester, t)
  return from !== t.level ? { member: r.requester, from, to: t.level } : null
}

/** The trust level the rules use for this member (0 with trust off: the cap doesn't grow). */
export const trustLevelFor = (pot: PotRec, id: string): number => (extrasOf(pot).trust ? trustOf(pot, id).level : 0)

export function trustVM(pot: PotRec, m: Pick<MemberRec, "id" | "spentInstant">): TrustVM {
  const x = extrasOf(pot)
  const t = trustOf(pot, m.id)
  const base = cents(pot.rules.instantCap)
  const level = x.trust ? t.level : 0
  const eff = base * BigInt(1 + level)
  const left = cents(Math.max(0, pot.rules.memberBudget - m.spentInstant))
  const growing = x.trust && t.level < TRUST_MAX_LEVEL
  return {
    enabled: x.trust,
    level: t.level,
    maxLevel: TRUST_MAX_LEVEL,
    nextLevelIn: growing ? TRUST_STEP - t.streak : 0,
    step: TRUST_STEP,
    minQualifying: cents(Math.ceil(pot.rules.instantCap / TRUST_MIN_SPEND_DIV)),
    settled: t.settled,
    declined: t.declined,
    baseCap: base,
    effectiveCap: eff,
    instantUpTo: eff < left ? eff : left,
    nextCap: growing ? base * BigInt(t.level + 2) : null,
  }
}

// ------------------------------------------------------------------------------------------------- goal

/** The hub's goal_state over the mock Pot; null without a goal. */
export function goalStateOf(pot: PotRec, now: number): GoalStateVM | null {
  const g = extrasOf(pot).goal
  if (!g) return null
  const gs = pot.goalState ?? {}
  if (gs.refundedAt) return "refunded"
  if (gs.refundStartedAt) return "refunding"
  if (gs.reachedAt) return "reached"
  if (now < g.deadline) return "collecting"
  if (g.allOrNothing && pot.status !== "closed" && (pot.policyVersion ?? 1) >= 2) return "refundable"
  return "missed"
}

/** An all-or-nothing goal not reached yet: every spend waits (before and after the date). */
export function goalBlocksSpends(pot: PotRec): boolean {
  const g = extrasOf(pot).goal
  return !!g && g.allOrNothing && !pot.goalState?.reachedAt
}

/** Money in after an all-or-nothing goal's date passed short is refused (ERR_GOAL_MISSED). */
export function goalRefusesMoney(pot: PotRec, now: number): boolean {
  const g = extrasOf(pot).goal
  return !!g && g.allOrNothing && !pot.goalState?.reachedAt && now >= g.deadline
}

const totalInOf = (pot: PotRec) => pot.members.reduce((s, m) => s + m.contributed, 0)

/** After money in: mark the goal reached (an all-or-nothing one only before its date). Never un-reaches. Mutates. */
export function checkGoalReached(pot: PotRec, now: number): boolean {
  const g = extrasOf(pot).goal
  if (!g || pot.goalState?.reachedAt) return false
  if (totalInOf(pot) >= g.amount && (!g.allOrNothing || now < g.deadline)) {
    pot.goalState = { ...(pot.goalState ?? {}), reachedAt: now }
    return true
  }
  return false
}

export function goalVM(pot: PotRec, now: number): GoalVM | null {
  const g = extrasOf(pot).goal
  const state = goalStateOf(pot, now)
  if (!g || !state) return null
  return {
    amount: cents(g.amount),
    deadline: g.deadline,
    allOrNothing: g.allOrNothing,
    totalIn: cents(totalInOf(pot)),
    state,
    reachedAt: pot.goalState?.reachedAt ?? null,
    spendsBlocked: goalBlocksSpends(pot),
  }
}

/**
 * The mock's refund_unfunded (the server cron on testnet): phase 1 when the goal is refundable (the refund close is
 * proposed: the Pot is closing), phase 2 `REFUND_PHASE_MS` later (approved: everyone gets back exactly what they put
 * in, the Pot closes). Returns the next world, or null when nothing was due.
 */
export function refundDue(w: World, now: number): World | null {
  let changed = false
  const pots = { ...w.pots }
  for (const [slug, p] of Object.entries(w.pots)) {
    const state = goalStateOf(p, now)
    if (state === "refundable") {
      const pot = structuredClone(p)
      pot.goalState = { ...(pot.goalState ?? {}), refundStartedAt: now }
      pot.status = "closing"
      pots[slug] = pot
      changed = true
    } else if (state === "refunding" && now - (p.goalState?.refundStartedAt ?? now) >= REFUND_PHASE_MS) {
      const pot = structuredClone(p)
      // spends waited the whole time, so the balance is exactly what everyone put in: each gets theirs back
      const refunds = [...pot.members].sort((a, b) => a.joinIndex - b.joinIndex).map((m) => ({ account: m.id, amount: m.contributed }))
      const close: CloseRec = {
        id: -1,
        proposer: pot.creator,
        votes: {},
        voteAt: {},
        createdAt: pot.goalState?.refundStartedAt ?? now,
        status: "approved",
        decidedAt: now,
        payouts: refunds,
        balance: pot.balance,
        dust: 0,
        dustTo: null,
      }
      pot.close = { ...close, refund: true }
      pot.goalState = { ...(pot.goalState ?? {}), refundedAt: now, refunds }
      pot.balance = 0
      pot.status = "closed"
      pot.closedAt = now
      for (const r of pot.requests) {
        if (r.status !== "proposed") continue
        r.status = "rejected"
        r.decidedAt = now
      }
      pots[slug] = pot
      changed = true
    }
  }
  return changed ? { ...w, pots } : null
}

// ------------------------------------------------------------------------------------------------- one OK

export type OkResult = "approved" | "failed" | "objection" | "decided" | "expired" | "self" | "not_one_ok" | "not_member" | "not_eligible"

/**
 * hub 1.3.0 (W4-1 c): what's charged to `who`'s lifetime one-OK allowance (= the Pot's one-OK ceiling), in cents: their
 * requests that one OK approved (a payout that failed afterwards still counts: the approval landed). A refused, objected,
 * declined or expired one never counts (the hub releases its charge). Derived from the requests, so older worlds work.
 */
export function oneOkUsedOf(pot: Pick<PotRec, "requests">, who: string): number {
  return pot.requests
    .filter((r) => r.requester === who && r.tier === "one_ok" && !!r.okBy && (r.status === "paid" || r.status === "payout_failed"))
    .reduce((s, r) => s + r.amount, 0)
}

/** Is `who` allowed to give the OK on this request right now (UI guard; the action re-checks)? */
export function canOk(r: Pick<RequestRec, "tier" | "status" | "requester" | "votes">, who: string | null): boolean {
  if (!who || r.tier !== "one_ok" || r.status !== "proposed" || r.requester === who) return false
  return !Object.values(r.votes).includes("Reject")
}

// ------------------------------------------------------------------------------------------------- showcase seed

const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000

function m(id: string, joinIndex: number, contributed: number, joinedAt: number, spentInstant = 0): MemberRec {
  return { id, joinIndex, contributed, spentInstant, joinedAt }
}

/**
 * Two Pots that show hub 1.1.0 at work (the mock build for people; automated tests opt in, store.ts):
 *  - Ski Chalet: Maya is Trusted (3 paid spends), Leo's $180 was approved by Sam's OK, Sam's $250 waits for one OK.
 *  - Festival Fund: $300 of a $1,200 all-or-nothing goal, 3 days left; spending waits for the goal.
 */
export function seedShowcase(now: number): Record<string, PotRec> {
  const ski: PotRec = {
    slug: "ski-chalet",
    name: "Ski Chalet",
    emoji: "🎿",
    cover: 4,
    creator: "sam",
    status: "open",
    createdAt: now - 6 * DAY,
    goalEach: 30_000,
    rules: { instantCap: 10_000, memberBudget: 30_000, expiryDays: 7 },
    extras: { trust: true, oneOkCap: 30_000, links: true, goal: null },
    policyVersion: 1,
    balance: 90_000 - 4_000 - 6_000 - 3_500 - 18_000,
    members: [m("sam", 0, 30_000, now - 6 * DAY), m("maya", 1, 30_000, now - 6 * DAY + 3 * HOUR, 13_500), m("leo", 2, 30_000, now - 5 * DAY)],
    requests: [
      { id: 101, requester: "maya", receiver: "maya", amount: 4_000, category: "groceries", note: "Supermarket run", path: "instant", reason: "ok", status: "paid", votes: {}, voteAt: {}, createdAt: now - 5 * DAY + 2 * HOUR, decidedAt: now - 5 * DAY + 2 * HOUR, tier: "instant" },
      { id: 102, requester: "maya", receiver: "maya", amount: 6_000, category: "transport", note: "Train to the valley", path: "instant", reason: "ok", status: "paid", votes: {}, voteAt: {}, createdAt: now - 4 * DAY, decidedAt: now - 4 * DAY, tier: "instant" },
      { id: 103, requester: "maya", receiver: "maya", amount: 3_500, category: "food", path: "instant", reason: "ok", status: "paid", votes: {}, voteAt: {}, createdAt: now - 3 * DAY, decidedAt: now - 3 * DAY, tier: "instant" },
      {
        id: 104,
        requester: "leo",
        receiver: "leo",
        amount: 18_000,
        category: "stay",
        note: "Chalet deposit",
        path: "vote",
        reason: "over_cap",
        status: "paid",
        votes: { leo: "Approve" },
        voteAt: { leo: now - 2 * DAY },
        createdAt: now - 2 * DAY,
        decidedAt: now - 2 * DAY + 40 * MIN,
        tier: "one_ok",
        okBy: "sam",
      },
      {
        id: 105,
        requester: "sam",
        receiver: "sam",
        amount: 25_000,
        category: "tickets",
        note: "Lift passes",
        path: "vote",
        reason: "over_cap",
        status: "proposed",
        votes: { sam: "Approve" },
        voteAt: { sam: now - 3 * HOUR },
        createdAt: now - 3 * HOUR,
        tier: "one_ok",
      },
    ],
    events: [
      { id: "s1", kind: "created", actor: "sam", at: now - 6 * DAY },
      { id: "s2", kind: "contribution", actor: "sam", amount: 30_000, at: now - 6 * DAY + 4 * MIN },
      { id: "s3", kind: "joined", actor: "maya", at: now - 6 * DAY + 3 * HOUR },
      { id: "s4", kind: "contribution", actor: "maya", amount: 30_000, at: now - 6 * DAY + 3 * HOUR + 6 * MIN },
      { id: "s5", kind: "joined", actor: "leo", at: now - 5 * DAY },
      // money-in details showcase: Leo's $300 came from another app (ETH on Base, the testnet demo's simulated transfer)
      { id: "s6", kind: "contribution", actor: "leo", amount: 30_000, at: now - 5 * DAY + 2 * MIN, source: "xc", xc: showcaseXc(now - 5 * DAY + 2 * MIN) },
    ],
    invite: { pk: "ed25519:DLB1QyyAJXtysL5bDPxW3kH9aGeMwUAcZ5C9MeBbnjhn", secret: "BS5XgKnS-yRNdp_I8RpDbJW-5xA5You03QYvWIGq0_w", createdBy: "sam", expiresAt: now + 3 * DAY, maxUses: 10, uses: 2 },
    trust: {
      maya: { level: 1, streak: 0, settled: 3, settledAmount: 13_500, declined: 0, lastDeclinedAt: null },
      leo: { level: 0, streak: 1, settled: 1, settledAmount: 18_000, declined: 0, lastDeclinedAt: null },
    },
    lastContributor: "leo",
  }
  const festival: PotRec = {
    slug: "festival-fund",
    name: "Festival Fund",
    emoji: "🎸",
    cover: 2,
    creator: "leo",
    status: "open",
    createdAt: now - 2 * DAY,
    goalEach: 40_000,
    rules: { instantCap: 10_000, memberBudget: 20_000, expiryDays: 7 },
    extras: { trust: true, oneOkCap: 30_000, links: true, goal: { amount: 120_000, deadline: now + 3 * DAY + 2 * HOUR, allOrNothing: true } },
    policyVersion: 2,
    balance: 30_000,
    members: [m("leo", 0, 15_000, now - 2 * DAY), m("maya", 1, 15_000, now - 1 * DAY), m("sam", 2, 0, now - 20 * HOUR)],
    requests: [],
    events: [
      { id: "f1", kind: "created", actor: "leo", at: now - 2 * DAY },
      { id: "f2", kind: "contribution", actor: "leo", amount: 15_000, at: now - 2 * DAY + 5 * MIN },
      { id: "f3", kind: "joined", actor: "maya", at: now - 1 * DAY },
      { id: "f4", kind: "contribution", actor: "maya", amount: 15_000, at: now - 1 * DAY + 8 * MIN },
      { id: "f5", kind: "joined", actor: "sam", at: now - 20 * HOUR },
    ],
    invite: { pk: "ed25519:91E4MQxKPS3jg9zBQbnQmZA29oN5NqTXAPxo1n6fM6fN", secret: "BUiLzhFUl9odYKPmKWyv8jV4u_5BhMcKTZDTFlmc3yI", createdBy: "leo", expiresAt: now + 5 * DAY, maxUses: 10, uses: 2 },
    lastContributor: "maya",
  }
  return { [ski.slug]: ski, [festival.slug]: festival }
}

/**
 * The showcase's add from another app (Ski Chalet, Leo's $300): 0.1293 ETH sent on Base, $300.00 arrived, each moment
 * a little before the add at `addedAt` (address shown 4 min before, sent, converting, arrived 58 s after sending).
 */
export function showcaseXc(addedAt: number): XcAddRecord {
  const SEC = 1_000
  return {
    id: "dp_showcase0000000000000base1",
    mode: "simulated",
    chain: "base",
    coin: "ETH",
    decimals: 18,
    stable: false,
    sent: "129300000000000000",
    usdTarget: "300000000",
    arrived: "300000000",
    depositAddress: "SIMULATED-base-5k1a2c3e",
    addressAt: addedAt - 4 * MIN,
    sentAt: addedAt - 3 * MIN - 20 * SEC,
    convertingAt: addedAt - 2 * MIN - 50 * SEC,
    arrivedAt: addedAt - 2 * MIN - 22 * SEC,
  }
}

/** Add the showcase Pots to a world (ids above every seeded one). */
/**
 * The showcase's saved receipt (Ski Chalet, Maya's $35 food, request 103): a euro receipt read three days ago and
 * converted at the ECB's rate (€32.25 × 1.0852 = $35.00), with the place it was read (a model-only check link).
 * Fake content for the mock build only; its fingerprint rides in the request's ref like a real one.
 */
export function showcaseReceipt(now: number): SavedReceipt {
  const day = isoDayUtc(now - 3 * DAY)
  return {
    v: 1,
    nonce: "5c0a1e7d9b3f4a6c8e2d1b0f7a9c3e5d",
    merchant: "Café du Col",
    date: day,
    currency: "EUR",
    totalCents: 3_225,
    taxCents: 270,
    tipCents: 250,
    items: [
      { name: "Raclette for two", qty: 1, amountCents: 1_950 },
      { name: "Hot chocolate", qty: 2, amountCents: 650 },
      { name: "Apple strudel", qty: 1, amountCents: 375 },
    ],
    fx: { from: "EUR", amountCents: 3_225, usdCents: 3_500, rate: "1.0852", rateDate: day, source: "ecb" },
    proof: { verifyUrl: `${RECEIPT_VERIFY_URL}?model=z-ai%2Fglm-5.3-flash`, reply: false, model: "z-ai/glm-5.3-flash" },
    source: "near-ai",
    readAt: new Date(now - 3 * DAY + 5 * MIN).toISOString(),
  }
}

export function withShowcase(w: World, now: number): World {
  const pots = seedShowcase(now)
  const receipt = showcaseReceipt(now)
  const r103 = pots["ski-chalet"]!.requests.find((r) => r.id === 103)!
  r103.ref = spendRef("skc0000000000103", receiptFingerprint(receipt))
  return {
    ...w,
    pots: { ...w.pots, ...pots },
    nextRequestId: Math.max(w.nextRequestId, 110),
    receipts: { ...(w.receipts ?? {}), "ski-chalet:103": receipt },
  }
}

export type { Micro }
