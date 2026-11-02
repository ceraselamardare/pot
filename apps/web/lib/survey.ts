// "Help us make Pot better" (first-run onboarding, 2026-11-02; notes/frontend.md "Onboarding"): the optional
// questions after the intro, shared by the browser (components/onboarding), the route (POST/GET /api/me/survey,
// zod in server/http/schemas.ts) and the team's report (scripts/survey-report.ts). Types and constants only.
//
// Versioned: `SURVEY_VERSION` goes into every saved row. Changing a question's meaning or its options means a new
// version (old rows keep theirs; the report groups by version). Adding an option at the end of a list is fine
// within a version. Answers are enum ids only, never free text.
//
// Why these questions (each one changes a decision; the rest is derived from data we already have):
//  - use:   what they'll use Pot for → rule templates and default limits, the demo's story, which track we lead with.
//  - today: how their group handles shared money now → who we position against ("replace one person chasing
//           everyone" vs "replace Splitwise"), whether reminders/chasing come next.
//  - heard: how they first heard of Pot (creators only; joiners came from an invite, recorded as context) →
//           where outreach goes, evidence for the judges.
// Dropped: crypto comfort (inferred from the sign-in kind: NEAR wallet vs Google/email; and it would put jargon on
// a main path), group size (on the ledger once the Pot fills), role (known from the entry path: `context`),
// age/gender/income/location (sensitive; no decision depends on them).

export const SURVEY_VERSION = 1

export const USE_OPTIONS = ["trip", "home", "plans", "club", "family", "cause", "other"] as const
export const TODAY_OPTIONS = ["fronts", "split_app", "bank", "cash", "none", "other"] as const
export const HEARD_OPTIONS = ["friend", "hackathon", "social", "search", "other"] as const
/** How the person came in: created a Pot / joined by invite / neither yet (a replay from You, a returning user). */
export const SURVEY_CONTEXTS = ["created", "joined", "other"] as const

export type UseOption = (typeof USE_OPTIONS)[number]
export type TodayOption = (typeof TODAY_OPTIONS)[number]
export type HeardOption = (typeof HEARD_OPTIONS)[number]
export type SurveyContext = (typeof SURVEY_CONTEXTS)[number]

export interface SurveyAnswers {
  /** multi-select */
  use?: UseOption[]
  /** single-select: what the group mostly does */
  today?: TodayOption
  /** single-select; asked of creators only */
  heard?: HeardOption
}

export type SurveyQuestionId = keyof SurveyAnswers

export interface SurveyQuestion<Id extends SurveyQuestionId = SurveyQuestionId> {
  id: Id
  multi: boolean
  options: readonly string[]
  /** shuffle the options (all but the last, "other") per person, against first-option bias */
  shuffle?: boolean
  /** joiners aren't asked (their source is the invite) */
  creatorsOnly?: boolean
}

export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  { id: "use", multi: true, options: USE_OPTIONS },
  { id: "today", multi: false, options: TODAY_OPTIONS },
  { id: "heard", multi: false, options: HEARD_OPTIONS, shuffle: true, creatorsOnly: true },
]

/** The questions a person sees: joiners skip `heard`. */
export function questionsFor(context: SurveyContext): readonly SurveyQuestion[] {
  return SURVEY_QUESTIONS.filter((q) => !(q.creatorsOnly && context === "joined"))
}

/** POST /api/me/survey body. */
export interface SurveyReq {
  version: typeof SURVEY_VERSION
  answers: SurveyAnswers
  context?: SurveyContext
}

/** A saved survey (GET/POST /api/me/survey). */
export interface SurveyWire {
  version: number
  answers: SurveyAnswers
  context: SurveyContext | null
  createdAt: string
  updatedAt: string
}

/** Anything answered? (an all-empty survey isn't sent) */
export function hasAnswers(a: SurveyAnswers): boolean {
  return (a.use?.length ?? 0) > 0 || !!a.today || !!a.heard
}

/** Drop empty fields so the stored JSON is canonical. */
export function compactAnswers(a: SurveyAnswers): SurveyAnswers {
  const out: SurveyAnswers = {}
  if (a.use?.length) out.use = USE_OPTIONS.filter((o) => a.use!.includes(o))
  if (a.today) out.today = a.today
  if (a.heard) out.heard = a.heard
  return out
}

/**
 * A stable per-person order: all options but the last ("other") shuffled with a seed (the person's id), so one
 * person always sees the same order and the first-option bias spreads across people.
 */
export function seededOrder<T>(options: readonly T[], seed: string): T[] {
  const head = options.slice(0, -1)
  const tail = options.slice(-1)
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  const rand = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) >>> 0
    return h / 4294967296
  }
  for (let i = head.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[head[i], head[j]] = [head[j]!, head[i]!]
  }
  return [...head, ...tail]
}
