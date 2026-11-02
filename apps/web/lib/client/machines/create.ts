// Create Pot as a typed reducer (frontend-architecture §5.10, ux-spec §4.12, design-direction 01 §3).
// Lean create (notes/gifts-plan.md "Lean create flow"): ONE screen (step 1) with the name, the emoji + colour (a
// picker behind the cover preview), the optional "$150 each" and one rules summary line → [Create Pot] → step 3
// creating → share. The summary's [Change] opens step 2, the full "Pot rules" form (instant limit, per-person
// limit, who instant payments go to, trust, one OK, the goal; lib/client/create-rules.ts, wave4-form.ts), which
// can create the Pot too. No templates: every Pot is created with preset "custom" and the rules as typed.
import { DEFAULT_RULES_FORM, MAX_NAMED, parseAmount, sanitizeAmount, type PayeeChoice, type RulesForm } from "../create-rules"
import { extrasFormReducer, initialExtrasForm, type ExtrasEvent, type ExtrasForm } from "../wave4-form"

export const NAME_MIN = 2
export const NAME_MAX = 40
/** Letters (any script), numbers, spaces and simple punctuation people put in trip names. */
const NAME_RE = /^[\p{L}\p{N} '’&.-]+$/u

export function validateName(name: string): boolean {
  const n = name.trim()
  return n.length >= NAME_MIN && n.length <= NAME_MAX && NAME_RE.test(n)
}

export interface CreateState {
  /** 1 the one Create screen, 2 the full rules ([Change], `?step=rules`), 3 creating */
  step: 1 | 2 | 3
  /** the screen [Create Pot] was pressed on: a failure returns there */
  from: 1 | 2
  name: string
  emoji: string
  cover: number
  goalOn: boolean
  /** the "$X each" amount as typed (dollars) */
  goalText: string
  rules: RulesForm
  /** hub 1.1.0: trust grows, the one-OK ceiling, the goal with a date (lib/client/wave4-form.ts) */
  extras: ExtrasForm
  /** [Create Pot] was pressed with something to fix: show every inline error */
  attempted: boolean
  nameError: boolean
  status: "editing" | "creating" | "error"
  slow: boolean
  error: "create.error.relayer" | "create.error.limit" | null
  slug: string | null
}

export type CreateEvent =
  | { type: "NAME"; value: string }
  | { type: "EMOJI"; value: string }
  | { type: "COVER"; value: number }
  /** the rules summary's [Change]: open the full rules (no name needed yet) */
  | { type: "RULES" }
  | { type: "BACK" }
  | { type: "GOAL"; on: boolean }
  | { type: "GOAL_AMOUNT"; value: string }
  | { type: "RULE_AMOUNT"; field: "instant" | "perPerson"; value: string }
  | { type: "PAYEES"; value: PayeeChoice }
  | { type: "NAMED"; index: number; value: string }
  | { type: "NAMED_ADD" }
  | { type: "NAMED_REMOVE"; index: number }
  | { type: "EXTRAS"; e: ExtrasEvent }
  /** [Create Pot] with something to fix (the sheet checks the form; see checkRulesForm) */
  | { type: "ATTEMPT" }
  | { type: "SUBMIT" }
  | { type: "SLOW" }
  | { type: "CREATED"; slug: string }
  | { type: "FAILED"; key: "create.error.relayer" | "create.error.limit" }
  | { type: "RESET" }

export const initialCreate: CreateState = {
  step: 1,
  from: 1,
  name: "",
  emoji: "✈️",
  cover: 0,
  goalOn: true,
  goalText: "150",
  rules: DEFAULT_RULES_FORM,
  extras: initialExtrasForm(),
  attempted: false,
  nameError: false,
  status: "editing",
  slow: false,
  error: null,
  slug: null,
}

export function createReducer(s: CreateState, e: CreateEvent): CreateState {
  switch (e.type) {
    case "RESET":
      return initialCreate
    case "NAME":
      return { ...s, name: e.value.slice(0, NAME_MAX), nameError: s.nameError && !validateName(e.value) }
    case "EMOJI":
      return { ...s, emoji: e.value }
    case "COVER":
      return { ...s, cover: e.value }
    case "GOAL":
      return { ...s, goalOn: e.on }
    case "GOAL_AMOUNT":
      return { ...s, goalText: sanitizeAmount(e.value) }
    case "RULE_AMOUNT": {
      const rules = { ...s.rules, [e.field]: sanitizeAmount(e.value) }
      // an untouched one-OK ceiling follows the instant limit (3 ×)
      return { ...s, rules, extras: e.field === "instant" ? extrasFormReducer(s.extras, { type: "INSTANT", instant: parseAmount(rules.instant) }) : s.extras }
    }
    case "EXTRAS":
      return { ...s, extras: extrasFormReducer(s.extras, e.e) }
    case "PAYEES":
      return { ...s, rules: { ...s.rules, payees: e.value } }
    case "NAMED":
      return { ...s, rules: { ...s.rules, named: s.rules.named.map((v, i) => (i === e.index ? e.value.slice(0, 64) : v)) } }
    case "NAMED_ADD":
      return s.rules.named.length >= MAX_NAMED ? s : { ...s, rules: { ...s.rules, named: [...s.rules.named, ""] } }
    case "NAMED_REMOVE": {
      const named = s.rules.named.filter((_, i) => i !== e.index)
      return { ...s, rules: { ...s.rules, named: named.length ? named : [""] } }
    }
    case "ATTEMPT":
      // [Create Pot] with something to fix: every inline error shows, the name's too
      return s.step === 3 ? s : { ...s, attempted: true, nameError: !validateName(s.name) }
    case "RULES":
      return s.step === 1 ? { ...s, step: 2 } : s
    case "BACK":
      return s.step === 2 && s.status !== "creating" ? { ...s, step: 1 } : s
    case "SUBMIT":
      if (s.step === 3 || s.status === "creating") return s
      if (!validateName(s.name)) return { ...s, nameError: true, attempted: true }
      return { ...s, step: 3, from: s.step, status: "creating", slow: false, error: null, attempted: false, nameError: false }
    case "SLOW":
      return s.status === "creating" ? { ...s, slow: true } : s
    case "CREATED":
      return s.status === "creating" ? { ...s, slug: e.slug } : s
    case "FAILED":
      // keep what Maya entered; back on the screen she pressed [Create Pot] on, with the error (ux-spec 4.12 X)
      return { ...s, step: s.from, status: "error", slow: false, error: e.key }
  }
}
