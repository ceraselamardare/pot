// @vitest-environment jsdom
// The mock's POST/GET /api/me/survey (localStorage['pot.mock.survey']): one record per mock person (upsert), only
// your own comes back, the fault hook, and signed out.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSurvey, saveSurvey, setSession, SURVEY_KEY } from "./store"

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

async function save(...args: Parameters<typeof saveSurvey>) {
  const p = saveSurvey(...args)
  await vi.runAllTimersAsync()
  return p
}

describe("mock survey store", () => {
  it("saves per person and upserts", async () => {
    setSession("maya")
    const a = await save({ version: 1, answers: { use: ["club", "trip"], today: "fronts" }, context: "created" })
    expect(a).toMatchObject({ version: 1, answers: { use: ["trip", "club"], today: "fronts" }, context: "created" })
    const b = await save({ version: 1, answers: { heard: "search" } })
    expect(b.answers).toEqual({ heard: "search" })
    expect(b.createdAt).toBe(a.createdAt)
    expect(Object.keys(JSON.parse(localStorage.getItem(SURVEY_KEY)!))).toEqual(["maya"])
    expect(await getSurvey()).toMatchObject({ answers: { heard: "search" }, context: null })
  })

  it("only your own answers come back", async () => {
    setSession("maya")
    await save({ version: 1, answers: { today: "cash" } })
    setSession("leo")
    expect(await getSurvey()).toBeNull()
    setSession(null)
    expect(await getSurvey()).toBeNull()
  })

  it("the fault hook fails the next save, nothing stored", async () => {
    setSession("sam")
    localStorage.setItem("pot.mock.fail", "survey")
    const p = saveSurvey({ version: 1, answers: { today: "bank" } })
    const caught = p.catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    expect(await caught).toBeInstanceOf(Error)
    expect(localStorage.getItem(SURVEY_KEY)).toBeNull()
  })
})
