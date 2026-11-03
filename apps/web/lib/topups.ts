// "Ask for a top-up" (2026-11-03): a member asks everyone in the Pot to add more money. Off-chain only (no contract
// change): an ask is a row on our server (`topup_request`), progress is read from the hub (`get_members.contributed`).
// Isomorphic rules shared by the API, the mock world and the screens: amounts, the reason, the due date, the split,
// progress and status.
//  - "$50 each" (mode `each`): every member asked adds $50. "$200 in total" (mode `total`): split equally among the
//    members asked, rounded UP to the cent, so the parts always cover the total.
//  - Who is asked: the Pot's active members when the ask is made (the asker too: everyone chips in). Each one's
//    `contributed` then is their baseline; they're done once contributed − baseline ≥ their part. Someone who joins
//    later isn't asked; someone who leaves drops out of the count.
//  - One open ask per Pot. It ends when everyone asked has added (`done`), at its due date (`ended`), or when the
//    asker cancels it (`cancelled`). A new ask waits until the open one ends (the asker can cancel theirs).
//  - Nudges: once per person per Pot per rolling 24 h, whoever sends it.
import type { Micro } from "@pot/sdk"

/** The smallest part anyone is asked for: $1. */
export const TOPUP_MIN: Micro = 1_000_000n
/** The largest part: $10,000, what one add can carry (the Add sheet's MAX_ADD, the relayer's MAX_CONTRIBUTION). */
export const TOPUP_MAX: Micro = 10_000_000_000n
/** The default "$X each" when the Pot has no chip-in amount. */
export const TOPUP_DEFAULT_EACH: Micro = 50_000_000n
/** The optional short reason ("Hotel went up"), in code points. */
export const TOPUP_REASON_MAX = 80
/** The due-date choices, in days (the default is a week). */
export const TOPUP_DUE_DAYS = [3, 7, 14] as const
export const TOPUP_DUE_DEFAULT_DAYS = 7
/** A due date the API takes: from 1 hour to 60 days ahead. */
export const TOPUP_DUE_MIN_MS = 3_600_000
export const TOPUP_DUE_MAX_MS = 60 * 86_400_000
/** The gentle reminder goes to the people who haven't added once the due date is this close (the daily job). */
export const TOPUP_REMIND_WITHIN_MS = 36 * 3_600_000
/** One nudge per (Pot, person) per this window, whoever sends it. */
export const NUDGE_WINDOW_MS = 86_400_000

const DAY = 86_400_000
const CENT = 10_000n

export type TopupMode = "each" | "total"
export type TopupStatus = "open" | "done" | "ended" | "cancelled"

/** Each person's part: the amount (each), or the total split equally, rounded up to the cent. */
export function partOf(mode: TopupMode, amount: Micro, people: number): Micro {
  if (mode === "each") return amount
  const n = BigInt(Math.max(1, people))
  const raw = (amount + n - 1n) / n
  return ((raw + CENT - 1n) / CENT) * CENT
}

/** The total asked: each × people, or the amount itself. */
export const totalOf = (mode: TopupMode, amount: Micro, people: number): Micro => (mode === "each" ? amount * BigInt(Math.max(1, people)) : amount)

export type AmountCheck = { ok: true; part: Micro; total: Micro } | { ok: false; why: "too_low" | "too_high" }

/** The amount and the split as the API checks them: every part is $1 … $10,000. */
export function checkTopupAmount(mode: TopupMode, amount: Micro, people: number): AmountCheck {
  const part = partOf(mode, amount, people)
  if (amount < TOPUP_MIN || part < TOPUP_MIN) return { ok: false, why: "too_low" }
  if (part > TOPUP_MAX) return { ok: false, why: "too_high" }
  return { ok: true, part, total: totalOf(mode, amount, people) }
}

export type ReasonCheck = { ok: true; value: string | null } | { ok: false; why: "length" | "control" | "format" }

/**
 * The optional reason: NFC, one line (line breaks and tabs → a space, runs of spaces → one), trimmed; empty → none;
 * 1-80 code points; no control characters; no Unicode format characters (Cf) except ZWJ and VS16. Never HTML-escaped
 * here: React escapes on render.
 */
export function cleanReason(input: string | null | undefined): ReasonCheck {
  if (input === null || input === undefined) return { ok: true, value: null }
  const value = input
    .normalize("NFC")
    .replace(/[\r\n\t\u2028\u2029]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
  if (value === "") return { ok: true, value: null }
  const cps = [...value]
  if (cps.length > TOPUP_REASON_MAX) return { ok: false, why: "length" }
  for (const ch of cps) {
    if (/\p{Cc}/u.test(ch)) return { ok: false, why: "control" }
    if (/\p{Cf}/u.test(ch) && ch !== "\u200d" && ch !== "\ufe0f") return { ok: false, why: "format" }
  }
  return { ok: true, value }
}

/** Code points, as the server counts them. */
export const reasonLength = (s: string): number => [...s].length

/** The due date for "in N days" (end of that day is not needed: the same time N days later). */
export const dueIn = (days: number, now: number): number => now + days * DAY

/** Is this due date one the API takes? */
export const dueOk = (dueAt: number, now: number): boolean => dueAt - now >= TOPUP_DUE_MIN_MS && dueAt - now <= TOPUP_DUE_MAX_MS

export interface ProgressInput {
  account: string
  /** contributed when the ask was made */
  baseline: Micro
  /** contributed now; null = no longer an active member (left: not counted) */
  contributed: Micro | null
}

export interface MemberProgress {
  account: string
  part: Micro
  /** what they added since the ask (never below 0) */
  added: Micro
  done: boolean
}

/** Each asked person still in the Pot: what they added since the ask and whether it covers their part. */
export function progressOf(asked: readonly ProgressInput[], part: Micro): MemberProgress[] {
  const out: MemberProgress[] = []
  for (const a of asked) {
    if (a.contributed === null) continue
    const added = a.contributed > a.baseline ? a.contributed - a.baseline : 0n
    out.push({ account: a.account, part, added, done: added >= part })
  }
  return out
}

/** What an open ask is now: done once everyone still in has added (and someone is), ended at its due date. */
export function statusOf(rec: { cancelledAt?: number | null; closedCause?: "done" | "due" | null }, progress: readonly MemberProgress[], dueAt: number, now: number): TopupStatus {
  if (rec.cancelledAt) return "cancelled"
  if (rec.closedCause === "done") return "done"
  if (rec.closedCause === "due") return "ended"
  if (progress.length > 0 && progress.every((p) => p.done)) return "done"
  if (now >= dueAt) return "ended"
  return "open"
}

/** Who a nudge may reach now: asked, still in, not done, not the sender, not nudged in the last 24 h. */
export function nudgeable(progress: readonly MemberProgress[], sender: string, lastNudged: Readonly<Record<string, number>>, now: number): string[] {
  return progress.filter((p) => !p.done && p.account !== sender && !(now - (lastNudged[p.account] ?? -Infinity) < NUDGE_WINDOW_MS)).map((p) => p.account)
}

/** What's left of one person's part (0 once done). */
export const leftOf = (p: Pick<MemberProgress, "part" | "added">): Micro => (p.added >= p.part ? 0n : p.part - p.added)

/** An amount as the Add sheet's `?amount=` takes it ("50", "12.5", "12.05"), floored to the cent. */
export function amountParam(m: Micro): string {
  const c = m / CENT
  const whole = c / 100n
  const frac = c % 100n
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")}`
}

/** The Add sheet for one person's part of an ask: `?sheet=add&amount=<left>&topup=<id>`. */
export const addHref = (slug: string, id: string, left: Micro): string => `/p/${encodeURIComponent(slug)}?sheet=add&amount=${amountParam(left)}&topup=${encodeURIComponent(id)}`

/** A top-up ask's id as the URL carries it. */
export const TOPUP_ID_RE = /^[A-Za-z0-9_-]{1,40}$/
