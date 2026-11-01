// Rules helpers: wire ↔ domain, preset defaults, and the hub's validate_rules twin.

import type { AccountId } from "./types/ids.ts"
import type { RawRules } from "./types/hub-raw.ts"
import type { PresetId, Rules } from "./types/hub.ts"
import { HUB_LIMITS, PRESET_RULES } from "./types/hub.ts"
import type { RulesWire } from "./types/intents.ts"
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
