// The Create sheet's "Pot rules" form (step 2): every Pot is created with `preset: "custom"` and explicit rules
// (contracts/pot-hub validate_rules; relayer checkRules). The editable rules are the instant limit, the
// per-person limit and who instant payments can go to (members, or members + up to 10 named people). The form
// keeps what people typed as strings; `checkRulesForm` turns them into the sdk `Rules` (USDC 6 decimals) or the
// inline errors. The fixed rules (majority, pro-rata leftovers, 7-day expiry, 40 people) aren't editable.
import { HUB_LIMITS, parseUsdInput, rulesToRaw, type AccountId, type Micro, type RawRules, type Rules as SdkRules } from "@pot/sdk"

export type PayeeChoice = SdkRules["instantPayees"]

export interface RulesForm {
  /** dollars as typed ("100", "12.5"); "" = not filled in */
  instant: string
  perPerson: string
  payees: PayeeChoice
  /** named people's account names as typed; only sent when `payees` is members_and_allowlist */
  named: string[]
}

export const DEFAULT_RULES_FORM: RulesForm = { instant: "100", perPerson: "200", payees: "members", named: [""] }

/** The relayer's bounds (server/relay/policy MAX_INSTANT_CAP / MAX_MEMBER_BUDGET): $1,000 and $100,000. */
export const INSTANT_MAX: Micro = 1_000_000_000n
export const PERSON_MAX: Micro = 100_000_000_000n
/** contracts MAX_ALLOWLIST */
export const MAX_NAMED = HUB_LIMITS.maxAllowlist
/** Fixed for every Pot (shown, never edited) */
export const FIXED = { maxMembers: HUB_LIMITS.maxMembers, expiryDays: HUB_LIMITS.proposalPeriodMs / 86_400_000 }

export type AmountError = "create.rules.amount.invalid" | "create.rules.instant.max" | "create.rules.person.max" | "create.rules.person.below"
export type NamedError = "create.rules.named.invalid" | "create.rules.named.dup" | "create.rules.named.reserved"

export interface RulesCheck {
  instant: Micro | null
  perPerson: Micro | null
  instantError: AmountError | null
  personError: AmountError | null
  /** one entry per `named` field (null = fine or empty) */
  namedErrors: (NamedError | null)[]
  /** "members and people I name" with nobody named */
  namedEmpty: boolean
  ok: boolean
  /** the rules to send (null while anything is wrong) */
  rules: SdkRules | null
}

/** Keep an amount field to digits, one ".", 2 decimals and 6 whole digits ("$1,000" → "1000", "007" → "7"). */
export function sanitizeAmount(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "")
  const dot = s.indexOf(".")
  if (dot >= 0) s = `${s.slice(0, dot)}.${s.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`
  const [int = "", dec] = s.split(".")
  const whole = int.replace(/^0+(?=\d)/, "").slice(0, 6)
  return dec === undefined ? whole : `${whole}.${dec}`
}

/** "" or junk → null; otherwise USDC base units (6 decimals). */
export function parseAmount(s: string): Micro | null {
  const v = s.trim()
  if (v === "" || v === ".") return null
  return parseUsdInput(v.endsWith(".") ? v.slice(0, -1) : v)
}

/** NEAR account rules (2-64 chars, lowercase parts joined by "." and "-"/"_"); named accounts, implicit hex alike. */
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/
export const normalizeName = (s: string): string => s.trim().toLowerCase()
export const isAccountName = (s: string): boolean => s.length >= 2 && s.length <= 64 && ACCOUNT_RE.test(s)

export function checkRulesForm(f: RulesForm, ids: { hubId: string; usdcId: string }): RulesCheck {
  const instant = parseAmount(f.instant)
  const perPerson = parseAmount(f.perPerson)
  const instantError: AmountError | null = instant === null ? "create.rules.amount.invalid" : instant > INSTANT_MAX ? "create.rules.instant.max" : null
  const personError: AmountError | null =
    perPerson === null
      ? "create.rules.amount.invalid"
      : perPerson > PERSON_MAX
        ? "create.rules.person.max"
        : instant !== null && perPerson < instant
          ? "create.rules.person.below"
          : null

  const named = f.payees === "members_and_allowlist"
  const seen = new Set<string>()
  const list: AccountId[] = []
  const namedErrors = f.named.map((raw): NamedError | null => {
    const a = normalizeName(raw)
    if (!a) return null
    if (!isAccountName(a)) return "create.rules.named.invalid"
    if ((ids.hubId && (a === ids.hubId || a.endsWith(`.${ids.hubId}`))) || (ids.usdcId && a === ids.usdcId)) return "create.rules.named.reserved"
    if (seen.has(a)) return "create.rules.named.dup"
    seen.add(a)
    list.push(a as AccountId)
    return null
  })
  const namedEmpty = named && list.length === 0
  const namedOk = !named || (!namedEmpty && namedErrors.every((e) => e === null) && list.length <= MAX_NAMED)
  const ok = instantError === null && personError === null && namedOk
  return {
    instant,
    perPerson,
    instantError,
    personError,
    namedErrors: named ? namedErrors : f.named.map(() => null),
    namedEmpty,
    ok,
    rules: ok ? { instantCap: instant!, memberBudget: perPerson!, instantPayees: f.payees, payeeAllowlist: named ? list : [] } : null,
  }
}

/** The `rules` argument of create_pot exactly as the contract reads it (U128 strings in 6 decimals). */
export const rulesContractJson = (r: SdkRules): RawRules => rulesToRaw(r)
