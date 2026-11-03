// Create / rules-change extras form: the one-OK ceiling follows 3 × the instant limit until edited, $0 turns it off,
// below the instant limit is refused (the hub's ERR_EXTRAS_INVALID); the goal needs > $0 and a date from tomorrow up
// to a year; Create sends explicit extras; the mock record is cents.
import { validateExtras } from "@pot/sdk"
import { describe, expect, it } from "vitest"
import { createReducer, initialCreate } from "./machines/create"
import { changedExtras, checkExtrasForm, currentExtras, deadlineOf, defaultGoalDate, extrasEditOf, extrasFormReducer, extrasRecOf, initialExtrasForm, isoDay, rulesChangeExtras } from "./wave4-form"

const NOW = new Date(2026, 10, 1, 10, 0).getTime()
const RULES = { instantCap: 100_000_000n, memberBudget: 200_000_000n, instantPayees: "members" as const, payeeAllowlist: [] }

describe("extras form", () => {
  it("defaults: trust on, one OK up to $300, links on, no goal → valid against the hub's own check", () => {
    const c = checkExtrasForm(initialExtrasForm(), 100_000_000n, NOW)
    expect(c.ok).toBe(true)
    expect(c.extras).toEqual({ trust: true, oneOkCap: 300_000_000n, links: true, goal: null })
    expect(validateExtras(RULES, c.extras!, NOW)).toBeNull()
  })

  it("the one-OK ceiling follows the instant limit until someone types it", () => {
    let s = createReducer(initialCreate, { type: "RULE_AMOUNT", field: "instant", value: "25" })
    expect(s.extras.oneOk).toBe("75")
    s = createReducer(s, { type: "EXTRAS", e: { type: "ONE_OK", value: "60" } })
    s = createReducer(s, { type: "RULE_AMOUNT", field: "instant", value: "40" })
    expect(s.extras.oneOk).toBe("60")
    expect(checkExtrasForm(s.extras, 40_000_000n, NOW).ok).toBe(true)
    expect(checkExtrasForm(s.extras, 70_000_000n, NOW).oneOkError).toBe("create.oneok.below")
    s = createReducer(s, { type: "EXTRAS", e: { type: "ONE_OK", value: "0" } })
    expect(checkExtrasForm(s.extras, 70_000_000n, NOW).extras?.oneOkCap).toBe(0n)
    s = createReducer(s, { type: "EXTRAS", e: { type: "ONE_OK", value: "" } })
    expect(checkExtrasForm(s.extras, 70_000_000n, NOW).oneOkError).toBe("create.rules.amount.invalid")
  })

  it("the goal: amount > $0, a date from tomorrow up to a year; all or nothing by default", () => {
    let f = extrasFormReducer(initialExtrasForm(), { type: "GOAL_ON", on: true, defaultDate: defaultGoalDate(NOW) })
    expect(f.goalDate).toBe(isoDay(NOW, 14))
    expect(checkExtrasForm(f, 100_000_000n, NOW).goalAmountError).toBe("create.target.amount.invalid")
    f = extrasFormReducer(f, { type: "GOAL", value: "1,200" })
    let c = checkExtrasForm(f, 100_000_000n, NOW)
    expect(c.ok).toBe(true)
    expect(c.extras!.goal).toEqual({ amount: 1_200_000_000n, deadlineMs: deadlineOf(isoDay(NOW, 14)), allOrNothing: true })
    expect(validateExtras(RULES, c.extras!, NOW)).toBeNull()
    for (const bad of [isoDay(NOW, 0), isoDay(NOW, -3), isoDay(NOW, 400), "2026-02-30", "soon"]) {
      c = checkExtrasForm(extrasFormReducer(f, { type: "GOAL_DATE", value: bad }), 100_000_000n, NOW)
      expect(c.goalDateError, bad).toBe("create.target.date.invalid")
    }
    expect(checkExtrasForm(extrasFormReducer(f, { type: "GOAL_DATE", value: isoDay(NOW, 1) }), 100_000_000n, NOW).ok).toBe(true)
    f = extrasFormReducer(f, { type: "AON", on: false })
    expect(checkExtrasForm(f, 100_000_000n, NOW).extras!.goal!.allOrNothing).toBe(false)
    // turning the goal off drops it but keeps what was typed
    f = extrasFormReducer(f, { type: "GOAL_ON", on: false })
    expect(checkExtrasForm(f, 100_000_000n, NOW).extras!.goal).toBeNull()
    expect(f.goal).toBe("1200")
  })

  it("the end of the picked local day is the deadline", () => {
    expect(new Date(deadlineOf("2026-11-20")!).getHours()).toBe(23)
    expect(deadlineOf("2026-11-31")).toBeNull()
  })

  it("Micro → the mock's cents, and a Pot's current extras for a rules change", () => {
    expect(extrasRecOf({ trust: true, oneOkCap: 300_000_000n, links: true, goal: { amount: 1_200_000_000n, deadlineMs: 5, allOrNothing: true } })).toEqual({
      trust: true,
      oneOkCap: 30_000,
      links: true,
      goal: { amount: 120_000, deadline: 5, allOrNothing: true },
    })
    expect(currentExtras({})).toEqual({ trust: false, oneOkCap: 0n, links: false, goal: null })
    expect(
      currentExtras({ extras: { trust: true, oneOkCap: 1n, links: true }, goalDetail: { amount: 2n, deadline: 3, allOrNothing: false, totalIn: 0n, state: "collecting", reachedAt: null, spendsBlocked: false } }),
    ).toEqual({ trust: true, oneOkCap: 1n, links: true, goal: { amount: 2n, deadlineMs: 3, allOrNothing: false } })
  })
})

// The rules change sheet: it starts from what the Pot really has (an old Pot: all off), sends extras only when one of
// them changes, and then sends them whole with the goal kept as it is.
describe("rules change extras", () => {
  const GOAL = { amount: 500_000_000n, deadline: NOW - 86_400_000, allOrNothing: true, totalIn: 600_000_000n, state: "reached" as const, reachedAt: NOW - 2, spendsBlocked: false }
  it("prefill: a Pot from before hub 1.1.0 reads all off (not the new-Pot defaults); a new Pot reads its own", () => {
    expect(extrasEditOf({})).toEqual({ trust: false, oneOkCap: 0n, links: false })
    expect(extrasEditOf({ extras: { trust: false, oneOkCap: 0n, links: false } })).toEqual({ trust: false, oneOkCap: 0n, links: false })
    expect(extrasEditOf({ extras: { trust: true, oneOkCap: 300_000_000n, links: true } })).toEqual({ trust: true, oneOkCap: 300_000_000n, links: true })
  })
  it("diff: which extras changed, in the review's order", () => {
    const off = { trust: false, oneOkCap: 0n, links: false }
    expect(changedExtras(off, off)).toEqual([])
    expect(changedExtras(off, { ...off, links: true })).toEqual(["links"])
    expect(changedExtras(off, { trust: true, oneOkCap: 300_000_000n, links: true })).toEqual(["oneOk", "trust", "links"])
  })
  it("payload: none when unchanged; an old Pot turning links on sends everything else as it is", () => {
    expect(rulesChangeExtras({}, { trust: false, oneOkCap: 0n, links: false })).toBeNull()
    const x = rulesChangeExtras({}, { trust: false, oneOkCap: 0n, links: true })
    expect(x).toEqual({ trust: false, oneOkCap: 0n, links: true, goal: null })
    expect(validateExtras(RULES, x!, NOW)).toBeNull()
  })
  it("payload: turning links off keeps trust, the one-OK limit and the goal (even past its date) exactly", () => {
    const pot = { extras: { trust: true, oneOkCap: 300_000_000n, links: true }, goalDetail: GOAL }
    expect(rulesChangeExtras(pot, { trust: true, oneOkCap: 300_000_000n, links: false })).toEqual({
      trust: true,
      oneOkCap: 300_000_000n,
      links: false,
      goal: { amount: 500_000_000n, deadlineMs: NOW - 86_400_000, allOrNothing: true },
    })
  })
})
