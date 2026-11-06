// A new Pot's spending rules in cents, for the trip cost calculator (lib/marketing/trip-cost.ts takes them as an
// argument, so the client island never imports the SDK). Server-side: the page reads these and passes them in.
// They're the Create form's defaults (DEFAULT_RULES) and the hub's default extras (one OK up to 3 × the instant
// limit), so the calculator can never quote a limit the app doesn't use. Checked in trip-cost.test.ts.
import { defaultExtras } from "@pot/sdk"
import { toCents } from "@/lib/client/money"
import { DEFAULT_RULES } from "@/lib/client/rules"
import type { RuleLimits } from "./trip-cost"

export const DEFAULT_LIMITS: RuleLimits = {
  instant: toCents(DEFAULT_RULES.instantCap),
  perPerson: toCents(DEFAULT_RULES.memberBudget),
  oneOk: toCents(defaultExtras({ ...DEFAULT_RULES, payeeAllowlist: [] }).oneOkCap),
}
