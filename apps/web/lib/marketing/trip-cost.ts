// The group trip cost calculator's math (/tools/group-trip-cost-calculator; page-plan "The tool"). Pure and
// import-free on purpose: the page's one client island (components/marketing/calculator/TripCalculator.tsx) imports
// it, so nothing from the app's data layer or the SDK reaches the browser. All money is whole cents (numbers).
//
// The method, as the page explains it:
//   trip cost = stay + travel each × people + food each per day × days × people + activities
//   in the Pot = trip cost + the cushion (a % of it), divided by people and rounded UP to the next $5 each
//
// Who would approve each payment is the app's own rule, restated for one payment from a member who has put money in
// and hasn't spent from the Pot yet (lib/client/rules previewSpend; trip-cost.test.ts checks the two agree):
//   - up to the instant limit (and within the per-person limit) → goes through on its own;
//   - up to the one-OK limit, with at least 2 people → one OK from another member;
//   - anything bigger → more than half the group (k of n, the app's approvalsNeeded).
// The limits come in as an argument (the page passes a new Pot's defaults), so this file holds no product numbers.

export type Tier = "instant" | "one_ok" | "group"

/** A Pot's spending rules, in cents. */
export interface RuleLimits {
  /** "Anyone can spend up to $100 at a time without asking" */
  instant: number
  /** "and up to $200 each in total" */
  perPerson: number
  /** one OK from another member covers spends up to this ($300 by default) */
  oneOk: number
}

/** What the visitor types. Money in cents; `people` and `days` whole numbers; `cushionPct` a whole percent. */
export interface TripInputs {
  people: number
  days: number
  /** the place to stay, in total */
  stay: number
  /** travel per person (tickets, fuel share) */
  travelEach: number
  /** food per person per day */
  foodEachPerDay: number
  /** activities, in total */
  activities: number
  cushionPct: number
}

export type CostId = "stay" | "travel" | "food" | "activities"

export interface CostLine {
  id: CostId
  /** what it adds to the trip cost */
  total: number
  /** one payment from the Pot for it: the whole booking, or (food) one day's shop for everyone */
  payment: number
  /** food is paid day by day; the rest in one go */
  paid: "once" | "daily"
  /** who approves that payment; null when there's nothing to pay */
  approval: Approval | null
}

export interface Approval {
  tier: Tier
  /** approvals needed when it goes to the group (k of n) */
  k: number
  n: number
}

export interface TripResult {
  lines: CostLine[]
  /** the four costs added up */
  tripCost: number
  cushion: number
  /** what rounding each share up to $5 adds */
  rounding: number
  /** what each person puts in, rounded up to $5 */
  each: number
  /** each × people: what's in the Pot */
  pot: number
  /** if everything costs what you planned: what comes back at the end (cushion + rounding) */
  spare: number
}

/** Rounding step for each person's share: $5. */
export const ROUND_TO = 500

/** The input ranges the form accepts (a Pot fits up to 40 people; days up to a year). */
export const LIMITS = {
  people: { min: 1, max: 40 },
  days: { min: 1, max: 365 },
  money: { max: 100_000_00 },
  cushionPct: { min: 0, max: 100 },
} as const

/** k of n: more than half the group, floor(n / 2) + 1, at least 1 (the app's approvalsNeeded with quorum 1). */
export function approvalsNeeded(n: number): number {
  return Math.max(1, Math.min(Math.floor(n / 2) + 1, n))
}

/** Who approves one payment of `amount` cents in a Pot of `people` under `rules`. */
export function approvalFor(amount: number, people: number, rules: RuleLimits): Approval {
  const n = people
  const k = approvalsNeeded(n)
  if (rules.instant > 0 && amount <= rules.instant && amount <= rules.perPerson) return { tier: "instant", k, n }
  if (rules.oneOk > 0 && amount <= rules.oneOk && n >= 2) return { tier: "one_ok", k, n }
  return { tier: "group", k, n }
}

export function tripCost(i: TripInputs, rules: RuleLimits): TripResult {
  const people = Math.max(LIMITS.people.min, Math.floor(i.people))
  const days = Math.max(LIMITS.days.min, Math.floor(i.days))
  const line = (id: CostId, total: number, payment: number, paid: CostLine["paid"]): CostLine => ({
    id,
    total,
    payment,
    paid,
    approval: payment > 0 ? approvalFor(payment, people, rules) : null,
  })
  const foodDaily = i.foodEachPerDay * people
  const lines = [
    line("stay", i.stay, i.stay, "once"),
    line("travel", i.travelEach * people, i.travelEach * people, "once"),
    line("food", foodDaily * days, foodDaily, "daily"),
    line("activities", i.activities, i.activities, "once"),
  ]
  const tripCost = lines.reduce((a, l) => a + l.total, 0)
  // the cushion to the cent, rounded half up (a percent of whole cents)
  const cushion = Math.round((tripCost * i.cushionPct) / 100)
  const withCushion = tripCost + cushion
  // each person's share, rounded up to the next $5 (an exact multiple stays as it is)
  // (one division of two integers: exact whenever it divides evenly, so ceil never bumps an exact multiple)
  const each = Math.ceil(withCushion / (people * ROUND_TO)) * ROUND_TO
  const pot = each * people
  return { lines, tripCost, cushion, rounding: pot - withCushion, each, pot, spare: pot - tripCost }
}

/**
 * Parse what someone typed into a money field: "$1,200", "1200.50", " 85 " → cents. Empty → 0. Anything else (or
 * negative, or over the max) → null, so the field can say so.
 */
export function parseMoney(text: string): number | null {
  const s = text.replace(/[$,\s]/g, "")
  if (s === "") return 0
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null
  const cents = Math.round(Number(s) * 100)
  return cents <= LIMITS.money.max ? cents : null
}

/** A whole number within [min, max], or null. Empty is null (people and days can't be blank). */
export function parseWhole(text: string, min: number, max: number): number | null {
  const s = text.trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n >= min && n <= max ? n : null
}

/** The presets (page-plan: weekend away, a week abroad, bachelorette weekend). Money in cents. */
export const PRESETS = {
  weekend: { people: 6, days: 2, stay: 1200_00, travelEach: 40_00, foodEachPerDay: 35_00, activities: 240_00, cushionPct: 10 },
  abroad: { people: 4, days: 7, stay: 2100_00, travelEach: 380_00, foodEachPerDay: 40_00, activities: 500_00, cushionPct: 10 },
  party: { people: 8, days: 3, stay: 1400_00, travelEach: 60_00, foodEachPerDay: 45_00, activities: 600_00, cushionPct: 10 },
} as const satisfies Record<string, TripInputs>

export type PresetId = keyof typeof PRESETS
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

/** The example the server renders (and the calculator starts from). */
export const DEFAULT_PRESET: PresetId = "weekend"

/** "$1,200.00" (two decimals: a displayed amount) or "$1,200" (whole: inside a sentence). */
const FIXED = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 })
export const usd = (cents: number) => FIXED.format(cents / 100)
/** whole dollars when it is whole, else with its cents */
export const usdWhole = (cents: number) => (cents % 100 === 0 ? WHOLE.format(cents / 100) : FIXED.format(cents / 100))

/** A cents amount as the text a field shows ("1200", "85.5" → "85.50"). */
export const fieldText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2))

/** Fill `{name}` placeholders (the island gets raw en.json templates from the server, not the whole table). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
