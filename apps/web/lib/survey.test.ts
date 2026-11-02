// "Help us make Pot better" definitions (lib/survey.ts): who's asked what, the canonical answers, the per-person
// option order, and the copy for every option (plain words: the jargon lint covers en.json, this checks coverage).
import { describe, expect, it } from "vitest"
import { findBanned } from "@/i18n/banned.mjs"
import { hasKey, t } from "@/i18n/t"
import { compactAnswers, hasAnswers, HEARD_OPTIONS, questionsFor, seededOrder, SURVEY_QUESTIONS, TODAY_OPTIONS, USE_OPTIONS } from "./survey"

describe("survey definitions", () => {
  it("creators get 3 questions, joiners 2 (their source is the invite)", () => {
    expect(questionsFor("created").map((q) => q.id)).toEqual(["use", "today", "heard"])
    expect(questionsFor("other").map((q) => q.id)).toEqual(["use", "today", "heard"])
    expect(questionsFor("joined").map((q) => q.id)).toEqual(["use", "today"])
  })

  it("at most 4 questions, each with ≤ 7 options and an 'other' way out last", () => {
    expect(SURVEY_QUESTIONS.length).toBeLessThanOrEqual(4)
    for (const q of SURVEY_QUESTIONS) {
      expect(q.options.length).toBeLessThanOrEqual(7)
      expect(q.options.at(-1)).toBe("other")
    }
  })

  it("every question and option has plain-words copy", () => {
    for (const k of ["survey.q.use", "survey.q.today", "survey.q.heard", "survey.privacy", "survey.title"]) {
      expect(hasKey(k), k).toBe(true)
      expect(findBanned(t(k as "survey.title")), k).toBeNull()
    }
    for (const [q, opts] of [["use", USE_OPTIONS], ["today", TODAY_OPTIONS], ["heard", HEARD_OPTIONS]] as const)
      for (const o of opts) {
        const key = `survey.${q}.${o}`
        expect(hasKey(key), key).toBe(true)
        expect(findBanned(t(key as "survey.use.trip")), key).toBeNull()
      }
  })

  it("hasAnswers / compactAnswers", () => {
    expect(hasAnswers({})).toBe(false)
    expect(hasAnswers({ use: [] })).toBe(false)
    expect(hasAnswers({ today: "cash" })).toBe(true)
    expect(compactAnswers({ use: ["other", "trip"], today: undefined })).toEqual({ use: ["trip", "other"] })
    expect(compactAnswers({ use: [], heard: "search" })).toEqual({ heard: "search" })
  })

  it("seededOrder: a stable per-person permutation with 'other' last", () => {
    const a = seededOrder(HEARD_OPTIONS, "maya.testnet")
    expect(seededOrder(HEARD_OPTIONS, "maya.testnet")).toEqual(a)
    expect([...a].sort()).toEqual([...HEARD_OPTIONS].sort())
    expect(a.at(-1)).toBe("other")
    // the first option varies across people
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => seededOrder(HEARD_OPTIONS, `person-${i}`)[0]))
    expect(firsts.size).toBeGreaterThan(1)
    expect(firsts.has("other")).toBe(false)
  })
})
