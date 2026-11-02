import { describe, expect, it } from "vitest"
import { createReducer, initialCreate, validateName, type CreateEvent } from "./create"

const run = (events: CreateEvent[]) => events.reduce(createReducer, initialCreate)

describe("create machine (frontend-architecture §5.10)", () => {
  it.each([
    ["Lisbon Trip", true],
    ["Ski 2027", true],
    ["Café São Paulo", true],
    ["A", false],
    ["   ", false],
    ["x".repeat(41), false],
    ["<script>", false],
  ])("validateName(%j) = %s", (name, ok) => expect(validateName(name)).toBe(ok))

  it("defaults are the same as before the lean screen: $100 / $200, members, $150 each, trust on, one OK $300, no goal", () => {
    expect(initialCreate).toMatchObject({ step: 1, goalOn: true, goalText: "150", rules: { instant: "100", perPerson: "200", payees: "members", named: [""] } })
    expect(initialCreate.extras).toMatchObject({ trust: true, oneOk: "300", goalOn: false, allOrNothing: true })
  })

  it("[Create Pot] with a bad name stays on the one screen and flags it; the error clears once fixed", () => {
    const bad = run([{ type: "NAME", value: "A" }, { type: "SUBMIT" }])
    expect(bad).toMatchObject({ step: 1, nameError: true, attempted: true, status: "editing" })
    expect(createReducer(bad, { type: "NAME", value: "Ab" }).nameError).toBe(false)
    expect(run([{ type: "NAME", value: "" }, { type: "ATTEMPT" }])).toMatchObject({ step: 1, nameError: true, attempted: true })
  })

  it("one screen: name → creating → created (no rules step on the default path)", () => {
    const s = run([{ type: "NAME", value: "Lisbon Trip" }, { type: "EMOJI", value: "🇵🇹" }, { type: "COVER", value: 3 }, { type: "SUBMIT" }])
    expect(s).toMatchObject({ step: 3, from: 1, status: "creating", emoji: "🇵🇹", cover: 3 })
    expect(createReducer(s, { type: "SLOW" }).slow).toBe(true)
    expect(createReducer(s, { type: "CREATED", slug: "lisbon-trip-a1b2" }).slug).toBe("lisbon-trip-a1b2")
    expect(createReducer(s, { type: "SUBMIT" })).toBe(s)
  })

  it("[Change] opens the rules without a name; Back returns with everything kept", () => {
    const s = run([{ type: "RULES" }, { type: "RULE_AMOUNT", field: "instant", value: "40" }, { type: "BACK" }, { type: "NAME", value: "Ski" }])
    expect(s).toMatchObject({ step: 1, name: "Ski", rules: { instant: "40" } })
    expect(createReducer(s, { type: "RULES" }).step).toBe(2)
    expect(createReducer({ ...s, step: 3, status: "creating" }, { type: "RULES" }).step).toBe(3)
  })

  it("a relay failure goes back to the screen [Create Pot] was pressed on, keeping the input", () => {
    const one = run([{ type: "NAME", value: "Lisbon Trip" }, { type: "SUBMIT" }, { type: "FAILED", key: "create.error.relayer" }])
    expect(one).toMatchObject({ step: 1, status: "error", error: "create.error.relayer", name: "Lisbon Trip" })
    const two = run([{ type: "NAME", value: "Lisbon Trip" }, { type: "RULES" }, { type: "SUBMIT" }, { type: "FAILED", key: "create.error.limit" }])
    expect(two).toMatchObject({ step: 2, status: "error", error: "create.error.limit", name: "Lisbon Trip" })
  })

  it("rule fields keep what was typed as clean amounts; payees and attempts", () => {
    const s = run([
      { type: "NAME", value: "Ski Weekend" },
      { type: "RULES" },
      { type: "RULE_AMOUNT", field: "instant", value: "$25" },
      { type: "RULE_AMOUNT", field: "perPerson", value: "60.505" },
      { type: "PAYEES", value: "members_and_allowlist" },
      { type: "NAMED", index: 0, value: "sam.near" },
      { type: "NAMED_ADD" },
      { type: "GOAL_AMOUNT", value: "1,200" },
      { type: "ATTEMPT" },
    ])
    expect(s.rules).toEqual({ instant: "25", perPerson: "60.50", payees: "members_and_allowlist", named: ["sam.near", ""] })
    expect(s).toMatchObject({ goalText: "1200", attempted: true, step: 2 })
    expect(createReducer(s, { type: "SUBMIT" })).toMatchObject({ step: 3, from: 2, attempted: false })
  })

  it("the $X each switch", () => {
    const s = run([{ type: "NAME", value: "Trip" }, { type: "GOAL", on: false }])
    expect(s).toMatchObject({ step: 1, goalOn: false })
  })
})
