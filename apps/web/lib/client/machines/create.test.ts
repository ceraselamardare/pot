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

  it("blocks Next on a bad name and clears the error once fixed", () => {
    const bad = run([{ type: "NAME", value: "A" }, { type: "NEXT" }])
    expect(bad).toMatchObject({ step: 1, nameError: true })
    expect(createReducer(bad, { type: "NAME", value: "Ab" }).nameError).toBe(false)
  })

  it("name → rules → creating → created", () => {
    const s = run([{ type: "NAME", value: "Lisbon Trip" }, { type: "EMOJI", value: "🇵🇹" }, { type: "NEXT" }, { type: "SUBMIT" }])
    expect(s).toMatchObject({ step: 3, status: "creating", emoji: "🇵🇹" })
    expect(createReducer(s, { type: "SLOW" }).slow).toBe(true)
    expect(createReducer(s, { type: "CREATED", slug: "lisbon-trip-a1b2" }).slug).toBe("lisbon-trip-a1b2")
  })

  it("a relay failure goes back to step 2 with the error, keeping the input", () => {
    const s = run([{ type: "NAME", value: "Lisbon Trip" }, { type: "NEXT" }, { type: "SUBMIT" }, { type: "FAILED", key: "create.error.relayer" }])
    expect(s).toMatchObject({ step: 2, status: "error", error: "create.error.relayer", name: "Lisbon Trip" })
  })

  it("rule fields keep what was typed as clean amounts; payees and attempts", () => {
    const s = run([
      { type: "NAME", value: "Ski Weekend" },
      { type: "NEXT" },
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
    expect(createReducer(s, { type: "SUBMIT" })).toMatchObject({ step: 3, attempted: false })
  })

  it("the goal toggle and Back", () => {
    const s = run([{ type: "NAME", value: "Trip" }, { type: "NEXT" }, { type: "GOAL", on: false }, { type: "BACK" }])
    expect(s).toMatchObject({ step: 1, goalOn: false })
  })
})
