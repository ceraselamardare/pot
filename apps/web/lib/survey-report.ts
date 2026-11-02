// The Pot team's view of "Help us make Pot better" (scripts/survey-report.ts): counts per answer, overall and by
// how people came in (created / joined / other) and by sign-in kind (a NEAR wallet vs Google/email, our stand-in
// for "comfort with crypto", which we don't ask). Pure: rows in, text out. Never per person.
import { HEARD_OPTIONS, SURVEY_CONTEXTS, TODAY_OPTIONS, USE_OPTIONS, type SurveyAnswers } from "./survey"

export interface SurveyRow {
  version: number
  answers: SurveyAnswers
  context: string | null
  /** app_user.kind: "near-auth" (Google/email) | "wallet" */
  kind: string
}

export interface Tally {
  respondents: number
  byVersion: Record<string, number>
  byContext: Record<string, number>
  byKind: Record<string, number>
  use: Record<string, number>
  today: Record<string, number>
  heard: Record<string, number>
  /** people who answered each question (multi-select `use` counts a person once) */
  answered: { use: number; today: number; heard: number }
}

const zero = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>
const bump = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1)

export function tallySurvey(rows: readonly SurveyRow[]): Tally {
  const t: Tally = {
    respondents: rows.length,
    byVersion: {},
    byContext: zero([...SURVEY_CONTEXTS, "unknown"]),
    byKind: {},
    use: zero(USE_OPTIONS),
    today: zero(TODAY_OPTIONS),
    heard: zero(HEARD_OPTIONS),
    answered: { use: 0, today: 0, heard: 0 },
  }
  for (const r of rows) {
    bump(t.byVersion, String(r.version))
    bump(t.byContext, r.context ?? "unknown")
    bump(t.byKind, r.kind)
    const a = r.answers ?? {}
    if (Array.isArray(a.use) && a.use.length) {
      t.answered.use++
      for (const o of new Set(a.use)) bump(t.use, o)
    }
    if (a.today) {
      t.answered.today++
      bump(t.today, a.today)
    }
    if (a.heard) {
      t.answered.heard++
      bump(t.heard, a.heard)
    }
  }
  return t
}

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–")

function block(title: string, counts: Record<string, number>, of: number): string[] {
  const width = Math.max(...Object.keys(counts).map((k) => k.length), 8)
  return [
    `${title} (n=${of})`,
    ...Object.entries(counts)
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `  ${k.padEnd(width)}  ${String(n).padStart(4)}  ${pct(n, of).padStart(4)}`),
  ]
}

/** Plain text for a terminal: every block, then the same split by how people came in. */
export function formatSurveyReport(rows: readonly SurveyRow[]): string {
  const all = tallySurvey(rows)
  const out = [
    `Help us make Pot better: ${all.respondents} people answered`,
    "",
    ...block("Version", all.byVersion, all.respondents),
    ...block("Came in by", all.byContext, all.respondents),
    ...block("Sign-in (wallet = has a NEAR wallet)", all.byKind, all.respondents),
    "",
    ...block("What will you use Pot for? (multi-select; % of people who answered)", all.use, all.answered.use),
    ...block("How does your group mostly handle shared money today?", all.today, all.answered.today),
    ...block("How did you first hear about Pot? (creators only)", all.heard, all.answered.heard),
  ]
  for (const ctx of SURVEY_CONTEXTS) {
    const sub = rows.filter((r) => r.context === ctx)
    if (!sub.length) continue
    const s = tallySurvey(sub)
    out.push("", `--- came in by: ${ctx} (${s.respondents}) ---`, ...block("use", s.use, s.answered.use), ...block("today", s.today, s.answered.today))
  }
  return out.join("\n")
}
