// The /group-trip worked example (lib/marketing/group-trip.ts): the page-plan's Ski Weekend numbers, worked out by
// the app's own rule and close-out math, add up to the cent.
import { describe, expect, it } from "vitest"
import { dollars, formatUsd } from "@/lib/client/money"
import { SKI_CAST, SKI_EXTRAS, SKI_GROUP_K, SKI_RULES, SKI_WEEKEND } from "./group-trip"

const usd = (m: bigint) => formatUsd(m)

describe("Ski Weekend", () => {
  it("6 friends at $300 each is $1,800, under a new Pot's default rules", () => {
    expect(SKI_WEEKEND.people).toBe(6)
    expect(usd(SKI_WEEKEND.total)).toBe("$1,800.00")
    expect(SKI_RULES.instantCap).toBe(dollars(100))
    expect(SKI_RULES.memberBudget).toBe(dollars(200))
    expect(SKI_EXTRAS.oneOkCap).toBe(dollars(300))
  })

  it("the cabin needs 4 of 6, the groceries go through on their own, the lift passes need one OK", () => {
    const by = Object.fromEntries(SKI_WEEKEND.spends.map((s) => [s.id, s]))
    expect(by.cabin).toMatchObject({ amount: dollars(1200), tier: "group", k: 4, n: 6 })
    expect(SKI_GROUP_K).toBe(4)
    expect(by.groceries).toMatchObject({ amount: dollars(84), tier: "instant" })
    expect(by.lift).toMatchObject({ amount: dollars(250), tier: "one_ok" })
    expect(SKI_WEEKEND.spends.map((s) => usd(s.leftAfter))).toEqual(["$600.00", "$516.00", "$266.00"])
  })

  it("$1,800 − $1,200 − $84 − $250 = $266 left", () => {
    const spent = SKI_WEEKEND.spends.reduce((a, s) => a + s.amount, 0n)
    expect(SKI_WEEKEND.total - spent).toBe(SKI_WEEKEND.left)
    expect(usd(SKI_WEEKEND.left)).toBe("$266.00")
  })

  it("shares back $44.33 each, rounded down to the cent, with the 2 leftover cents to the last person who put money in", () => {
    expect(usd(SKI_WEEKEND.eachBack)).toBe("$44.33")
    expect(usd(SKI_WEEKEND.remainder)).toBe("$0.02")
    expect(SKI_WEEKEND.lastContributor).toBe(SKI_CAST[5])
    const back = SKI_WEEKEND.shares.map((s) => usd(s.getsBack))
    expect(back).toEqual(["$44.33", "$44.33", "$44.33", "$44.33", "$44.33", "$44.35"])
    // everything that was left goes back, to the micro
    expect(SKI_WEEKEND.shares.reduce((a, s) => a + s.getsBack, 0n)).toBe(SKI_WEEKEND.left)
    // and everyone put in the same, so everyone's part of the spending is the same but for the remainder
    for (const s of SKI_WEEKEND.shares) expect(s.putIn).toBe(dollars(300))
  })
})
