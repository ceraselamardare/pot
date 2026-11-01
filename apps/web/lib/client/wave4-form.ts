// hub 1.1.0 rule extras in the forms (Create step 2, the rules change sheet): earned trust, the one-OK ceiling and
// the goal with a date. The forms keep what people typed as strings; `checkExtrasForm` turns them into the sdk
// `RuleExtras` (USDC 6 decimals) or the inline errors, mirroring the hub's validate_extras (sdk validateExtras):
// the one-OK ceiling is $0 (off) or at least the instant limit; a goal is > $0 with a date from tomorrow up to a
// year ahead. Create always sends extras (explicit beats the hub's defaults, notes/contracts-wave4.md §8).
import { MAX_AMOUNT, WAVE4_LIMITS, type Micro, type RuleExtras } from "@pot/sdk"
import { parseAmount, sanitizeAmount } from "./create-rules"
import type { ExtrasRec, ExtrasVM, GoalVM } from "./mock/types"
import { toCents, cents } from "./money"

export const ONE_OK_MULT = WAVE4_LIMITS.defaultOneOkMult
const DAY = 86_400_000

export interface ExtrasForm {
  trust: boolean
  /** dollars as typed; follows 3 × the instant limit until the person edits it */
  oneOk: string
  oneOkEdited: boolean
  goalOn: boolean
  /** dollars as typed */
  goal: string
  /** yyyy-mm-dd (a native date input) */
  goalDate: string
  allOrNothing: boolean
}

/** yyyy-mm-dd of a local day `days` from `now`. */
export function isoDay(now: number, days: number): string {
  const d = new Date(now + days * DAY)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** The goal's deadline: the end of the picked local day (23:59). null for junk. */
export function deadlineOf(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0)
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3]) ? null : d.getTime()
}

export const dollarsText = (m: Micro): string => {
  const c = toCents(m)
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2)
}

/** Trust on, one OK up to 3 × the instant limit, no goal (the date is filled in when the goal is turned on). */
export function initialExtrasForm(instant: Micro = 100_000_000n): ExtrasForm {
  return {
    trust: true,
    oneOk: dollarsText(instant * ONE_OK_MULT),
    oneOkEdited: false,
    goalOn: false,
    goal: "",
    goalDate: "",
    allOrNothing: true,
  }
}

/** The goal date a fresh goal starts with: two weeks from today. */
export const defaultGoalDate = (now: number) => isoDay(now, 14)

export type ExtrasEvent =
  | { type: "TRUST"; on: boolean }
  | { type: "ONE_OK"; value: string }
  /** the instant limit changed: an untouched one-OK ceiling follows it (3 ×) */
  | { type: "INSTANT"; instant: Micro | null }
  /** `defaultDate`: the date to start from when none was picked yet (two weeks out) */
  | { type: "GOAL_ON"; on: boolean; defaultDate?: string }
  | { type: "GOAL"; value: string }
  | { type: "GOAL_DATE"; value: string }
  | { type: "AON"; on: boolean }

export function extrasFormReducer(f: ExtrasForm, e: ExtrasEvent): ExtrasForm {
  switch (e.type) {
    case "TRUST":
      return { ...f, trust: e.on }
    case "ONE_OK":
      return { ...f, oneOk: sanitizeAmount(e.value), oneOkEdited: true }
    case "INSTANT":
      return f.oneOkEdited || e.instant === null ? f : { ...f, oneOk: dollarsText(e.instant * ONE_OK_MULT) }
    case "GOAL_ON":
      return { ...f, goalOn: e.on, goalDate: f.goalDate || e.defaultDate || "" }
    case "GOAL":
      return { ...f, goal: sanitizeAmount(e.value) }
    case "GOAL_DATE":
      return { ...f, goalDate: e.value }
    case "AON":
      return { ...f, allOrNothing: e.on }
  }
}

export type OneOkError = "create.oneok.below" | "create.rules.amount.invalid"
export type GoalAmountError = "create.target.amount.invalid"
export type GoalDateError = "create.target.date.invalid"

export interface ExtrasCheck {
  oneOk: Micro | null
  oneOkError: OneOkError | null
  goalAmount: Micro | null
  goalAmountError: GoalAmountError | null
  deadline: number | null
  goalDateError: GoalDateError | null
  ok: boolean
  extras: RuleExtras | null
}

export function checkExtrasForm(f: ExtrasForm, instant: Micro | null, now: number): ExtrasCheck {
  const oneOk = parseAmount(f.oneOk)
  const oneOkError: OneOkError | null =
    oneOk === null || oneOk > MAX_AMOUNT ? "create.rules.amount.invalid" : oneOk > 0n && instant !== null && oneOk < instant ? "create.oneok.below" : null
  const goalAmount = f.goalOn ? parseAmount(f.goal) : null
  const goalAmountError: GoalAmountError | null = f.goalOn && (goalAmount === null || goalAmount <= 0n || goalAmount > MAX_AMOUNT) ? "create.target.amount.invalid" : null
  const deadline = f.goalOn ? deadlineOf(f.goalDate) : null
  // from tomorrow (well past the hub's 60 s minimum) up to a year (the hub allows 366 days)
  const tomorrow = deadlineOf(isoDay(now, 1))!
  const goalDateError: GoalDateError | null =
    f.goalOn && (deadline === null || deadline < tomorrow || deadline > now + WAVE4_LIMITS.maxGoalLeadMs - DAY) ? "create.target.date.invalid" : null
  const ok = oneOkError === null && goalAmountError === null && goalDateError === null
  return {
    oneOk,
    oneOkError,
    goalAmount,
    goalAmountError,
    deadline,
    goalDateError,
    ok,
    extras: ok
      ? {
          trust: f.trust,
          oneOkCap: oneOk!,
          // pay by link stays on (the hub's default; the link UI is its own feature)
          links: true,
          goal: f.goalOn ? { amount: goalAmount!, deadlineMs: deadline!, allOrNothing: f.allOrNothing } : null,
        }
      : null,
  }
}

/** sdk RuleExtras (Micro) → the mock world's record (cents, floored like the hub's 6 decimals to the cent). */
export function extrasRecOf(x: RuleExtras): ExtrasRec {
  return {
    trust: x.trust,
    oneOkCap: toCents(x.oneOkCap),
    links: x.links,
    goal: x.goal ? { amount: toCents(x.goal.amount), deadline: x.goal.deadlineMs, allOrNothing: x.goal.allOrNothing } : null,
  }
}

/** A Pot's current extras as the sdk shape (a rules change sends them whole: the goal is kept as it is). */
export function currentExtras(pot: { extras?: ExtrasVM; goalDetail?: GoalVM | null }): RuleExtras {
  const x = pot.extras ?? { trust: false, oneOkCap: 0n, links: false }
  const g = pot.goalDetail
  return { trust: x.trust, oneOkCap: x.oneOkCap, links: x.links, goal: g ? { amount: g.amount, deadlineMs: g.deadline, allOrNothing: g.allOrNothing } : null }
}

export { cents }
