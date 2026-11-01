// Rules helpers: wire ↔ domain, preset defaults, and the hub's validate_rules twin.

import type { AccountId } from "./types/ids.ts"
import type { RawRuleExtras, RawRules } from "./types/hub-raw.ts"
import type { Goal, PresetId, RuleExtras, Rules } from "./types/hub.ts"
import { HUB_LIMITS, LEGACY_EXTRAS, PRESET_RULES, WAVE4_LIMITS } from "./types/hub.ts"
import type { RuleExtrasWire, RulesWire } from "./types/intents.ts"
import { MAX_AMOUNT } from "./money.ts"

/** Domain → the contract's JSON, keys in the struct's order (instant_cap, member_budget, instant_payees, payee_allowlist). */
export function rulesToRaw(r: Rules): RawRules {
  return {
    instant_cap: r.instantCap.toString(),
    member_budget: r.memberBudget.toString(),
    instant_payees: r.instantPayees,
    payee_allowlist: [...r.payeeAllowlist],
  }
}

export function rulesFromRaw(r: RawRules): Rules {
  return {
    instantCap: BigInt(r.instant_cap),
    memberBudget: BigInt(r.member_budget),
    instantPayees: r.instant_payees,
    payeeAllowlist: r.payee_allowlist as AccountId[],
  }
}

export const rulesToWire = (r: Rules): RulesWire => ({
  instantCap: r.instantCap.toString(),
  memberBudget: r.memberBudget.toString(),
  instantPayees: r.instantPayees,
  payeeAllowlist: [...r.payeeAllowlist],
})
export const rulesFromWire = (r: RulesWire): Rules => ({
  instantCap: BigInt(r.instantCap),
  memberBudget: BigInt(r.memberBudget),
  instantPayees: r.instantPayees,
  payeeAllowlist: r.payeeAllowlist as AccountId[],
})

/** The rules a preset starts with (null for custom). */
export function presetRules(preset: PresetId): Rules | null {
  return preset === "custom" ? null : { ...PRESET_RULES[preset], payeeAllowlist: [] }
}

export const rulesEqual = (a: Rules, b: Rules): boolean =>
  a.instantCap === b.instantCap &&
  a.memberBudget === b.memberBudget &&
  a.instantPayees === b.instantPayees &&
  a.payeeAllowlist.length === b.payeeAllowlist.length &&
  a.payeeAllowlist.every((x, i) => x === b.payeeAllowlist[i])

/**
 * The hub's validate_rules (→ ERR_RULES_INVALID): caps ≤ MAX_AMOUNT; allowlist ≤ 10, no
 * duplicates, none of {hub, any DAO of this hub, usdc}; "members" ⇒ empty allowlist.
 */
export function validateRules(r: Rules, ctx: { hubId: string; usdcId: string }): boolean {
  if (r.instantCap < 0n || r.memberBudget < 0n || r.instantCap > MAX_AMOUNT || r.memberBudget > MAX_AMOUNT) return false
  if (r.payeeAllowlist.length > HUB_LIMITS.maxAllowlist) return false
  if (r.instantPayees === "members" && r.payeeAllowlist.length > 0) return false
  const seen = new Set<string>()
  for (const a of r.payeeAllowlist) {
    if (seen.has(a)) return false
    seen.add(a)
    if (a === ctx.hubId || a.endsWith(`.${ctx.hubId}`) || a === ctx.usdcId) return false
  }
  return true
}

// ---------------------------------------------------------------- hub 1.1.0 rule extras

/** Domain → the contract's JSON (key order = the struct's: trust, one_ok_cap, links, goal). */
export function extrasToRaw(x: RuleExtras): RawRuleExtras {
  return {
    trust: x.trust,
    one_ok_cap: x.oneOkCap.toString(),
    links: x.links,
    goal: x.goal ? { amount: x.goal.amount.toString(), deadline_ms: x.goal.deadlineMs, all_or_nothing: x.goal.allOrNothing } : null,
  }
}

/** Contract JSON → domain; `undefined` (hub 1.0.0) → LEGACY_EXTRAS. */
export function extrasFromRaw(r: RawRuleExtras | undefined | null): RuleExtras {
  if (!r) return { ...LEGACY_EXTRAS }
  return {
    trust: r.trust,
    oneOkCap: BigInt(r.one_ok_cap),
    links: r.links,
    goal: r.goal ? { amount: BigInt(r.goal.amount), deadlineMs: r.goal.deadline_ms, allOrNothing: r.goal.all_or_nothing } : null,
  }
}

export const extrasToWire = (x: RuleExtras): RuleExtrasWire => ({
  trust: x.trust,
  oneOkCap: x.oneOkCap.toString(),
  links: x.links,
  goal: x.goal ? { amount: x.goal.amount.toString(), deadlineMs: x.goal.deadlineMs, allOrNothing: x.goal.allOrNothing } : null,
})
export const extrasFromWire = (w: RuleExtrasWire): RuleExtras => ({
  trust: w.trust,
  oneOkCap: BigInt(w.oneOkCap),
  links: w.links,
  goal: w.goal ? { amount: BigInt(w.goal.amount), deadlineMs: w.goal.deadlineMs, allOrNothing: w.goal.allOrNothing } : null,
})

/** The hub's defaults for a new Pot created without extras: trust on, one-OK up to 3 × the cap, links on, no goal. */
export function defaultExtras(rules: Rules): RuleExtras {
  const oneOk = rules.instantCap * WAVE4_LIMITS.defaultOneOkMult
  return { trust: true, oneOkCap: oneOk > MAX_AMOUNT ? MAX_AMOUNT : oneOk, links: true, goal: null }
}

/** The instant cap after earned trust: instantCap × (1 + level) with trust on. The budget still applies. */
export const effectiveCap = (rules: Rules, extras: RuleExtras, level: number): bigint =>
  extras.trust ? rules.instantCap * BigInt(1 + level) : rules.instantCap

export type ExtrasError = "ERR_EXTRAS_INVALID" | "ERR_GOAL_INVALID" | "ERR_GOAL_LOCKED" | "ERR_GOAL_UNSUPPORTED"

/**
 * The hub's validate_extras twin. `current` = the Pot's present extras + policy version + whether its
 * all-or-nothing goal is locked (missed or refunding) for a rules change; omit it at creation.
 */
export function validateExtras(
  rules: Rules,
  x: RuleExtras,
  nowMs: number,
  current?: { extras: RuleExtras; policyVersion: number; goalLocked: boolean },
): ExtrasError | null {
  if (x.oneOkCap < 0n || x.oneOkCap > MAX_AMOUNT || (x.oneOkCap > 0n && x.oneOkCap < rules.instantCap)) return "ERR_EXTRAS_INVALID"
  if (current && goalsEqual(current.extras.goal, x.goal)) return null
  if (current?.goalLocked) return "ERR_GOAL_LOCKED"
  const g = x.goal
  if (g) {
    if (g.amount <= 0n || g.amount > MAX_AMOUNT) return "ERR_GOAL_INVALID"
    if (g.deadlineMs <= nowMs + WAVE4_LIMITS.minGoalLeadMs || g.deadlineMs > nowMs + WAVE4_LIMITS.maxGoalLeadMs) return "ERR_GOAL_INVALID"
    if (g.allOrNothing && current && current.policyVersion < 2) return "ERR_GOAL_UNSUPPORTED"
  }
  return null
}

export const goalsEqual = (a: Goal | null, b: Goal | null): boolean =>
  a === b || (!!a && !!b && a.amount === b.amount && a.deadlineMs === b.deadlineMs && a.allOrNothing === b.allOrNothing)
