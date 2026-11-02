// The team's survey report (scripts/survey-report.ts): counts per answer, a multi-select person counted once per
// option, splits by how people came in and by sign-in kind; never a per-person line.
import { describe, expect, it } from "vitest"
import { formatSurveyReport, tallySurvey, type SurveyRow } from "./survey-report"

const ROWS: SurveyRow[] = [
  { version: 1, answers: { use: ["trip", "club"], today: "fronts", heard: "hackathon" }, context: "created", kind: "wallet" },
  { version: 1, answers: { use: ["trip", "trip"] as never, today: "cash" }, context: "joined", kind: "near-auth" },
  { version: 1, answers: { today: "fronts" }, context: null, kind: "near-auth" },
]

describe("survey report", () => {
  it("tallies answers, people per question and the splits", () => {
    const t = tallySurvey(ROWS)
    expect(t.respondents).toBe(3)
    expect(t.use).toMatchObject({ trip: 2, club: 1, home: 0 })
    expect(t.today).toMatchObject({ fronts: 2, cash: 1 })
    expect(t.heard).toMatchObject({ hackathon: 1 })
    expect(t.answered).toEqual({ use: 2, today: 3, heard: 1 })
    expect(t.byContext).toMatchObject({ created: 1, joined: 1, other: 0, unknown: 1 })
    expect(t.byKind).toEqual({ wallet: 1, "near-auth": 2 })
    expect(t.byVersion).toEqual({ "1": 3 })
  })
  it("prints counts and shares, no accounts", () => {
    const text = formatSurveyReport(ROWS)
    expect(text).toContain("Help us make Pot better: 3 people answered")
    expect(text).toMatch(/fronts\s+2\s+67%/)
    expect(text).toContain("--- came in by: created (1) ---")
    expect(text).not.toMatch(/testnet|@/)
  })
  it("empty: no division by zero", () => {
    expect(formatSurveyReport([])).toContain("0 people answered")
  })
})
