// Create Pot as a typed reducer (frontend-architecture §5.10, ux-spec §4.12, design-direction 01 §3).
// Step 1 name + emoji + colour → step 2 preset (Trip) + optional "$150 each" → step 3 creating → share.

export const NAME_MIN = 2
export const NAME_MAX = 40
/** Letters (any script), numbers, spaces and simple punctuation people put in trip names. */
const NAME_RE = /^[\p{L}\p{N} '’&.-]+$/u

export function validateName(name: string): boolean {
  const n = name.trim()
  return n.length >= NAME_MIN && n.length <= NAME_MAX && NAME_RE.test(n)
}

export interface CreateState {
  step: 1 | 2 | 3
  name: string
  emoji: string
  cover: number
  goalOn: boolean
  goalEachCents: number
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
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GOAL"; on: boolean }
  | { type: "SUBMIT" }
  | { type: "SLOW" }
  | { type: "CREATED"; slug: string }
  | { type: "FAILED"; key: "create.error.relayer" | "create.error.limit" }
  | { type: "RESET" }

export const initialCreate: CreateState = {
  step: 1,
  name: "",
  emoji: "✈️",
  cover: 0,
  goalOn: true,
  goalEachCents: 15_000,
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
    case "NEXT":
      if (s.step !== 1) return s
      return validateName(s.name) ? { ...s, step: 2, nameError: false } : { ...s, nameError: true }
    case "BACK":
      return s.step === 2 && s.status !== "creating" ? { ...s, step: 1 } : s
    case "SUBMIT":
      if (s.step !== 2 || s.status === "creating") return s
      return { ...s, step: 3, status: "creating", slow: false, error: null }
    case "SLOW":
      return s.status === "creating" ? { ...s, slow: true } : s
    case "CREATED":
      return s.status === "creating" ? { ...s, slug: e.slug } : s
    case "FAILED":
      // keep what Maya entered; back on step 2 with the error (ux-spec 4.12 X)
      return { ...s, step: 2, status: "error", slow: false, error: e.key }
  }
}
