// The /bachelorette-party worked example (lib/marketing/bachelorette-party.ts): the page-plan's Lake House Weekend
// numbers, worked out by the app's own rule and close-out math, add up to the cent.
import { describe, expect, it } from "vitest"
import { dollars, formatUsd } from "@/lib/client/money"
import { EXAMPLE_EXTRAS, EXAMPLE_RULES } from "./example-math"
import { LAKE_HOUSE, PARTY_CAST, PARTY_GROUP_K } from "./bachelorette-party"

const usd = (m: bigint) => formatUsd(m)

describe("Lake House Weekend", () => {
  it("8 friends at $250 each is $2,000, under a new Pot's default rules", () => {
    expect(LAKE_HOUSE.people).toBe(8)
    expect(usd(LAKE_HOUSE.total)).toBe("$2,000.00")
    expect(LAKE_HOUSE.outside).toBe(0n)
    expect(EXAMPLE_RULES.instantCap).toBe(dollars(100))
    expect(EXAMPLE_RULES.memberBudget).toBe(dollars(200))
    expect(EXAMPLE_EXTRAS.oneOkCap).toBe(dollars(300))
  })

  it("the house needs 5 of 8, the decorations go through on their own, the dinner needs one OK", () => {
    const by = Object.fromEntries(LAKE_HOUSE.spends.map((s) => [s.id, s]))
    expect(by.house).toMatchObject({ amount: dollars(1200), tier: "group", k: 5, n: 8 })
    expect(PARTY_GROUP_K).toBe(5)
    expect(by.decorations).toMatchObject({ amount: dollars(60), tier: "instant" })
    expect(by.dinner).toMatchObject({ amount: dollars(280), tier: "one_ok" })
    expect(LAKE_HOUSE.spends.map((s) => usd(s.leftAfter))).toEqual(["$800.00", "$740.00", "$460.00"])
  })

  it("$2,000 − $1,200 − $60 − $280 = $460 left, $57.50 back each with nothing left over", () => {
    const spent = LAKE_HOUSE.spends.reduce((a, s) => a + s.amount, 0n)
    expect(LAKE_HOUSE.total - spent).toBe(LAKE_HOUSE.left)
    expect(usd(LAKE_HOUSE.left)).toBe("$460.00")
    expect(usd(LAKE_HOUSE.eachBack)).toBe("$57.50")
    expect(LAKE_HOUSE.remainder).toBe(0n)
    expect(LAKE_HOUSE.lastContributor).toBe(PARTY_CAST[7])
    expect(LAKE_HOUSE.shares.map((s) => usd(s.getsBack))).toEqual(Array(8).fill("$57.50"))
    expect(LAKE_HOUSE.shares.reduce((a, s) => a + s.getsBack, 0n)).toBe(LAKE_HOUSE.left)
    // each friend's part of the spending: $250 − $57.50
    expect(usd(LAKE_HOUSE.each - LAKE_HOUSE.eachBack)).toBe("$192.50")
  })
})
