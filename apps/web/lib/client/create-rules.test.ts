// The Create sheet's "Pot rules" form → the create_pot `rules` argument (preset "custom"): defaults, the amount
// checks (per-person ≥ instant, $0, the relayer's bounds), the named-people list (format, duplicates, the hub /
// its Pots / the token, the limit of 10) and the contract JSON in 6 decimals.
import { describe, expect, it } from "vitest"
import { checkRulesForm, DEFAULT_RULES_FORM, MAX_NAMED, parseAmount, rulesContractJson, sanitizeAmount, type RulesForm } from "./create-rules"
import { createReducer, initialCreate, type CreateEvent } from "./machines/create"

const IDS = { hubId: "pots.potprev.testnet", usdcId: "usdc.potprev.testnet" }
const form = (over: Partial<RulesForm> = {}): RulesForm => ({ ...DEFAULT_RULES_FORM, ...over })
const check = (over: Partial<RulesForm> = {}) => checkRulesForm(form(over), IDS)

describe("defaults", () => {
  it("$100 at a time, $200 per person, members only, one empty name field", () => {
    expect(DEFAULT_RULES_FORM).toEqual({ instant: "100", perPerson: "200", payees: "members", named: [""] })
    expect(initialCreate.rules).toEqual(DEFAULT_RULES_FORM)
    expect(initialCreate).toMatchObject({ goalOn: true, goalText: "150", attempted: false })
  })
  it("are valid and become the old Trip numbers in 6 decimals", () => {
    const c = check()
    expect(c.ok).toBe(true)
    expect(c.rules).toEqual({ instantCap: 100_000_000n, memberBudget: 200_000_000n, instantPayees: "members", payeeAllowlist: [] })
    expect(rulesContractJson(c.rules!)).toEqual({ instant_cap: "100000000", member_budget: "200000000", instant_payees: "members", payee_allowlist: [] })
  })
})

describe("amounts", () => {
  it.each([
    ["1000", "1000"],
    ["$1,000", "1000"],
    ["007", "7"],
    ["0", "0"],
    ["12.345", "12.34"],
    ["1.2.3", "1.23"],
    ["abc", ""],
    ["1234567", "123456"],
  ])("sanitizeAmount(%j) = %j", (raw, out) => expect(sanitizeAmount(raw)).toBe(out))

  it("parses dollars to 6 decimals; empty is not an amount", () => {
    expect(parseAmount("25")).toBe(25_000_000n)
    expect(parseAmount("12.5")).toBe(12_500_000n)
    expect(parseAmount("12.")).toBe(12_000_000n)
    expect(parseAmount("")).toBeNull()
  })

  it("the per-person limit must be at least the instant limit", () => {
    expect(check({ instant: "100", perPerson: "50" })).toMatchObject({ ok: false, personError: "create.rules.person.below", rules: null })
    expect(check({ instant: "100", perPerson: "100" }).ok).toBe(true)
  })

  it("$0 at a time is allowed (every spend goes to the group)", () => {
    const c = check({ instant: "0", perPerson: "0" })
    expect(c.ok).toBe(true)
    expect(c.rules).toMatchObject({ instantCap: 0n, memberBudget: 0n })
    expect(check({ instant: "0", perPerson: "200" }).ok).toBe(true)
  })

  it("empty fields and the relayer's bounds ($1,000 at a time, $100,000 per person)", () => {
    expect(check({ instant: "" })).toMatchObject({ ok: false, instantError: "create.rules.amount.invalid" })
    expect(check({ perPerson: "" })).toMatchObject({ ok: false, personError: "create.rules.amount.invalid" })
    expect(check({ instant: "1000", perPerson: "1000" }).ok).toBe(true)
    expect(check({ instant: "1000.01", perPerson: "2000" }).instantError).toBe("create.rules.instant.max")
    expect(check({ perPerson: "100000" }).ok).toBe(true)
    expect(check({ perPerson: "100000.01" }).personError).toBe("create.rules.person.max")
  })

  it("$25 / $60 → the contract's U128 strings", () => {
    const c = check({ instant: "25", perPerson: "60" })
    expect(rulesContractJson(c.rules!)).toEqual({ instant_cap: "25000000", member_budget: "60000000", instant_payees: "members", payee_allowlist: [] })
    expect(rulesContractJson(check({ instant: "12.34", perPerson: "99.99" }).rules!)).toMatchObject({ instant_cap: "12340000", member_budget: "99990000" })
  })
})

describe("people I name", () => {
  const named = (names: string[]) => check({ payees: "members_and_allowlist", named: names })

  it("members only never sends names, even if some were typed", () => {
    const c = check({ payees: "members", named: ["sam.near", "Not valid!"] })
    expect(c.ok).toBe(true)
    expect(c.rules!.payeeAllowlist).toEqual([])
    expect(c.namedErrors).toEqual([null, null])
  })

  it("trims, lowercases and skips empty fields", () => {
    const c = named(["  Sam.Near ", "", "lisbon-bakery.testnet"])
    expect(c.ok).toBe(true)
    expect(rulesContractJson(c.rules!)).toEqual({
      instant_cap: "100000000",
      member_budget: "200000000",
      instant_payees: "members_and_allowlist",
      payee_allowlist: ["sam.near", "lisbon-bakery.testnet"],
    })
  })

  it("needs at least one person", () => {
    expect(named(["", " "])).toMatchObject({ ok: false, namedEmpty: true })
  })

  it.each([
    ["a", "create.rules.named.invalid"],
    ["sam..near", "create.rules.named.invalid"],
    ["sam near", "create.rules.named.invalid"],
    ["-sam.near", "create.rules.named.invalid"],
    ["x".repeat(65), "create.rules.named.invalid"],
    ["pots.potprev.testnet", "create.rules.named.reserved"],
    ["lisbon-trip.pots.potprev.testnet", "create.rules.named.reserved"],
    ["usdc.potprev.testnet", "create.rules.named.reserved"],
  ])("%j → %s", (name, err) => {
    const c = named([name])
    expect(c.ok).toBe(false)
    expect(c.namedErrors[0]).toBe(err)
  })

  it("flags the second copy of a name", () => {
    const c = named(["sam.near", "SAM.near"])
    expect(c.namedErrors).toEqual([null, "create.rules.named.dup"])
    expect(c.ok).toBe(false)
  })

  it("accepts implicit accounts", () => {
    expect(named(["a".repeat(64)]).ok).toBe(true)
  })

  it("the form holds at most 10 fields; Remove keeps one", () => {
    const run = (events: CreateEvent[]) => events.reduce(createReducer, { ...initialCreate, step: 2 as const })
    const many = run(Array.from({ length: 15 }, () => ({ type: "NAMED_ADD" }) as const))
    expect(many.rules.named).toHaveLength(MAX_NAMED)
    const ten = Array.from({ length: MAX_NAMED }, (_, i) => `p${i}.near`)
    const c = named(ten)
    expect(c.ok).toBe(true)
    expect(c.rules!.payeeAllowlist).toHaveLength(10)
    expect(run([{ type: "NAMED", index: 0, value: "sam.near" }, { type: "NAMED_REMOVE", index: 0 }]).rules.named).toEqual([""])
  })
})
