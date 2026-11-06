// The /group-trip worked example, "Ski Weekend" (page-plan: 6 friends, $300 each), computed with the app's own rule
// and close-out math so the page can never show numbers the product wouldn't: previewSpend (lib/client/rules, the
// hub's decide() twin) says who approves each spend under a new Pot's defaults, and refunds (lib/client/refund, the
// hub's close_split twin) shares out what's left. Shares are worked in cents, as the app's close copy describes
// ("rounded down to the cent; any tiny remainder goes to whoever added money last"). Pure and build-time only: the
// page is a server component, so none of this reaches the browser. Asserted in group-trip.test.ts.
import { defaultExtras } from "@pot/sdk"
import { dollars, MICRO_PER_CENT, type Micro } from "@/lib/client/money"
import { refunds } from "@/lib/client/refund"
import { approvalsNeeded, DEFAULT_RULES, previewSpend } from "@/lib/client/rules"

/** The six friends in join order (avatar colours member-1…6). Their names are en.json `uc.trip.cast.*`. */
export const SKI_CAST = ["maya", "sam", "leo", "priya", "tom", "ines"] as const
export type SkiPerson = (typeof SKI_CAST)[number]

/** What each person puts in before anything is booked. */
export const SKI_EACH: Micro = dollars(300)

/** A new Pot's rules: the Create form's defaults and the hub's default extras (one OK up to 3 × the instant limit). */
export const SKI_RULES = DEFAULT_RULES
export const SKI_EXTRAS = defaultExtras({ ...DEFAULT_RULES, payeeAllowlist: [] })

/** The spends in the order they happen; each is paid to the member who asked (they book or buy it). */
const SPENDS = [
  { id: "cabin", by: "maya", amount: dollars(1200) },
  { id: "groceries", by: "sam", amount: dollars(84) },
  { id: "lift", by: "leo", amount: dollars(250) },
] as const satisfies readonly { id: string; by: SkiPerson; amount: Micro }[]

export type SkiSpendId = (typeof SPENDS)[number]["id"]
export type Tier = "instant" | "one_ok" | "group"

export interface SkiSpend {
  id: SkiSpendId
  by: SkiPerson
  amount: Micro
  /** who approves it: Pot rules on their own, one OK from another member, or k of n of the group */
  tier: Tier
  k: number
  n: number
  /** what's in the Pot once it's paid */
  leftAfter: Micro
}

export interface SkiWeekend {
  people: number
  each: Micro
  total: Micro
  spends: SkiSpend[]
  left: Micro
  /** who added money last: the close's remainder goes to them */
  lastContributor: SkiPerson
  shares: { id: SkiPerson; putIn: Micro; getsBack: Micro }[]
  /** what everyone but the last contributor gets back (they get it plus the remainder) */
  eachBack: Micro
  /** the remainder, in micro (a few cents) */
  remainder: Micro
}

function compute(): SkiWeekend {
  const n = SKI_CAST.length
  const total = SKI_EACH * BigInt(n)
  let balance = total
  const spends: SkiSpend[] = SPENDS.map((s) => {
    const p = previewSpend({
      amount: s.amount,
      balance,
      rules: SKI_RULES,
      memberCount: n,
      used: 0n,
      contributed: SKI_EACH,
      oneOkUsed: 0n,
      receiverIsMember: true,
      extras: SKI_EXTRAS,
      trustLevel: 0,
    })
    if (p.path === "blocked" || p.path === "empty") throw new Error(`ski weekend: ${s.id} can't be spent (${p.reason})`)
    const tier: Tier = p.path === "instant" ? "instant" : (p.tier ?? "group")
    balance -= s.amount
    return { id: s.id, by: s.by, amount: s.amount, tier, k: p.k, n: p.n, leftAfter: balance }
  })
  const lastContributor = SKI_CAST[n - 1]!
  const back = refunds({
    balance,
    members: SKI_CAST.map((id) => ({ id, contributed: SKI_EACH })),
    lastContributor,
    unit: MICRO_PER_CENT,
  })
  const shares = SKI_CAST.map((id) => ({ id, putIn: SKI_EACH, getsBack: back.get(id) ?? 0n }))
  const eachBack = shares[0]!.getsBack
  return {
    people: n,
    each: SKI_EACH,
    total,
    spends,
    left: balance,
    lastContributor,
    shares,
    eachBack,
    remainder: balance - eachBack * BigInt(n),
  }
}

export const SKI_WEEKEND: SkiWeekend = compute()

/** k of n for a group of this size (the "4 of 6" in the copy). */
export const SKI_GROUP_K = approvalsNeeded(SKI_CAST.length)
