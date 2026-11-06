// A use-case page's worked example, worked out with the app's own rule and close-out math (the /bachelorette-party
// and /group-gift examples; /group-trip's predates this and keeps its own copy in group-trip.ts):
//  - previewSpend (lib/client/rules, the hub's decide() twin) says who approves each spend under a new Pot's defaults:
//    on its own (instant), one OK from another member, or k of n of the group;
//  - refunds (lib/client/refund, the hub's close_split twin) shares out what's left at close, in proportion to what
//    each member put in. Money from outside (a pay-in link) is part of the balance but nobody's contribution, so it is
//    shared among the members like any Pot money and never goes back to whoever paid it in (hub gifts.rs: a gift
//    changes neither contributions nor the last contributor).
// Shares are worked in cents, as the app's close copy describes ("rounded down to the cent; any tiny remainder goes to
// whoever added money last"). Pure and build-time only: the pages are server components.
import { defaultExtras } from "@pot/sdk"
import { MICRO_PER_CENT, type Micro } from "@/lib/client/money"
import { refunds } from "@/lib/client/refund"
import { DEFAULT_RULES, previewSpend } from "@/lib/client/rules"

export type Tier = "instant" | "one_ok" | "group"

/** A new Pot's rules: the Create form's defaults and the hub's default extras (one OK up to 3 × the instant limit). */
export const EXAMPLE_RULES = DEFAULT_RULES
export const EXAMPLE_EXTRAS = defaultExtras({ ...DEFAULT_RULES, payeeAllowlist: [] })

export interface ExampleInput<P extends string, S extends string> {
  /** the members in join order; the last one is the last to add money */
  cast: readonly P[]
  /** what each member puts in */
  each: Micro
  /** money paid in from outside through a pay-in link, by whoever (not members) */
  fromOutside?: readonly { id: string; amount: Micro }[]
  /** the spends in the order they happen; each is paid to the member who asked (they bought or booked it) */
  spends: readonly { id: S; by: P; amount: Micro }[]
}

export interface ExampleSpend<P extends string, S extends string> {
  id: S
  by: P
  amount: Micro
  tier: Tier
  k: number
  n: number
  /** what's in the Pot once it's paid */
  leftAfter: Micro
}

export interface WorkedExample<P extends string, S extends string> {
  people: number
  each: Micro
  /** what the members put in together */
  membersIn: Micro
  /** what came in from outside */
  outside: Micro
  /** everything that came in */
  total: Micro
  spends: ExampleSpend<P, S>[]
  left: Micro
  /** who added money last: the close's remainder goes to them */
  lastContributor: P
  shares: { id: P; putIn: Micro; getsBack: Micro }[]
  /** what everyone but the last contributor gets back (they get it plus the remainder) */
  eachBack: Micro
  /** the remainder (a few cents, or none) */
  remainder: Micro
}

export function workExample<P extends string, S extends string>(input: ExampleInput<P, S>): WorkedExample<P, S> {
  const n = input.cast.length
  const membersIn = input.each * BigInt(n)
  const outside = (input.fromOutside ?? []).reduce((a, g) => a + g.amount, 0n)
  const total = membersIn + outside
  let balance = total
  const spends = input.spends.map((s) => {
    const p = previewSpend({
      amount: s.amount,
      balance,
      rules: EXAMPLE_RULES,
      memberCount: n,
      used: 0n,
      contributed: input.each,
      oneOkUsed: 0n,
      receiverIsMember: true,
      extras: EXAMPLE_EXTRAS,
      trustLevel: 0,
    })
    if (p.path === "blocked" || p.path === "empty") throw new Error(`worked example: ${s.id} can't be spent (${p.reason})`)
    const tier: Tier = p.path === "instant" ? "instant" : (p.tier ?? "group")
    balance -= s.amount
    return { id: s.id, by: s.by, amount: s.amount, tier, k: p.k, n: p.n, leftAfter: balance }
  })
  const lastContributor = input.cast[n - 1]!
  const back = refunds({
    balance,
    members: input.cast.map((id) => ({ id, contributed: input.each })),
    lastContributor,
    unit: MICRO_PER_CENT,
  })
  const shares = input.cast.map((id) => ({ id, putIn: input.each, getsBack: back.get(id) ?? 0n }))
  const eachBack = shares[0]!.getsBack
  return {
    people: n,
    each: input.each,
    membersIn,
    outside,
    total,
    spends,
    left: balance,
    lastContributor,
    shares,
    eachBack,
    remainder: balance - eachBack * BigInt(n),
  }
}
