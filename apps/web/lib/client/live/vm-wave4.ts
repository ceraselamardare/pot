// hub 1.1.0 view models on testnet (pure, like vm.ts): get_trusts → TrustVM, PotView.extras → ExtrasVM,
// get_goal (or the Pot's extras.goal + goal_state when the view isn't there) → GoalVM, and the goal's feed lines.
import type { GoalView, PotView, RuleExtras, TrustView } from "@pot/sdk"
import type { ExtrasVM, FeedItemVM, GoalStateVM, GoalVM, TrustVM } from "../mock/types"

export function trustVMOf(tv: TrustView): TrustVM {
  const growing = tv.enabled && tv.level < tv.maxLevel
  return {
    enabled: tv.enabled,
    level: tv.level,
    maxLevel: tv.maxLevel,
    nextLevelIn: tv.nextLevelIn,
    step: tv.step,
    minQualifying: tv.minQualifying,
    settled: tv.settled,
    declined: tv.declined,
    baseCap: tv.baseCap,
    effectiveCap: tv.effectiveCap,
    instantUpTo: tv.instantUpTo,
    nextCap: growing ? tv.baseCap * BigInt(tv.level + 2) : null,
  }
}

export function extrasVMOf(x: RuleExtras): ExtrasVM {
  return { trust: x.trust, oneOkCap: x.oneOkCap, links: x.links }
}

const STATES: readonly GoalStateVM[] = ["collecting", "reached", "missed", "refundable", "refunding", "refunded"]

/** The Pot's goal: get_goal when the hub answered it, else extras.goal + goal_state from get_pot. */
export function goalVMOf(v: PotView, g: GoalView | null, now: number): GoalVM | null {
  if (g)
    return {
      amount: g.amount,
      deadline: g.deadlineMs,
      allOrNothing: g.allOrNothing,
      totalIn: g.totalIn,
      state: g.state,
      reachedAt: g.reachedAtMs,
      spendsBlocked: g.spendsBlocked,
    }
  const goal = v.extras?.goal
  if (!goal) return null
  const raw = v.goalState
  const state: GoalStateVM = raw && raw !== "none" && STATES.includes(raw) ? raw : now < goal.deadlineMs ? "collecting" : "missed"
  return {
    amount: goal.amount,
    deadline: goal.deadlineMs,
    allOrNothing: goal.allOrNothing,
    totalIn: v.totalIn,
    state,
    reachedAt: null,
    spendsBlocked: goal.allOrNothing && state !== "reached",
  }
}

/** Feed lines: the goal reached (when), everyone refunded (the close's time). The refund in progress is the banner's. */
export function goalFeedOf(dao: string, v: PotView, g: GoalView | null, now: number): FeedItemVM[] {
  const goal = goalVMOf(v, g, now)
  if (!goal) return []
  const out: FeedItemVM[] = []
  if (goal.reachedAt) out.push({ key: `goal:reached:${dao}`, kind: "goal", at: goal.reachedAt, state: "reached", amount: goal.amount })
  if (goal.state === "refunded") out.push({ key: `goal:refunded:${dao}`, kind: "goal", at: (v.closedAtMs ?? now) + 1, state: "refunded", amount: goal.amount })
  return out
}
