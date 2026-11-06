// The /shared-account-with-friends worked example (lib/marketing/shared-account.ts): five friends, different amounts
// in, the app's own rule and close-out math, and it adds up to the cent.
import { describe, expect, it } from "vitest"
import { dollars, formatUsd } from "@/lib/client/money"
import { CREW_CAST, CREW_EXTRAS, CREW_RULES, THE_CREW } from "./shared-account"

const usd = (m: bigint) => formatUsd(m)

describe("The Crew", () => {
  it("five friends put in $800 between them, under a new Pot's default rules", () => {
    expect(THE_CREW.people).toBe(5)
    expect(usd(THE_CREW.total)).toBe("$800.00")
    expect(CREW_RULES.instantCap).toBe(dollars(100))
    expect(CREW_EXTRAS.oneOkCap).toBe(dollars(300))
  })

  it("the snacks go through on their own, the tickets need one OK, the lake house needs 3 of 5", () => {
    const by = Object.fromEntries(THE_CREW.spends.map((s) => [s.id, s]))
    expect(by.snacks).toMatchObject({ amount: dollars(45), tier: "instant" })
    expect(by.tickets).toMatchObject({ amount: dollars(250), tier: "one_ok" })
    expect(by.house).toMatchObject({ amount: dollars(420), tier: "group", k: 3, n: 5 })
    expect(THE_CREW.spends.map((s) => usd(s.leftAfter))).toEqual(["$755.00", "$505.00", "$85.00"])
  })

  it("$800 − $45 − $250 − $420 = $85, shared back in proportion to what each put in", () => {
    const spent = THE_CREW.spends.reduce((a, s) => a + s.amount, 0n)
    expect(THE_CREW.total - spent).toBe(THE_CREW.left)
    expect(usd(THE_CREW.left)).toBe("$85.00")
    // Jo and Ama put in a quarter each; Dev an eighth; Kit and Lou 3/16 each. Rounded down to the cent, and the
    // 2 cents left over go to Lou, who added money last.
    expect(THE_CREW.lastContributor).toBe(CREW_CAST[4])
    expect(THE_CREW.shares.map((s) => usd(s.getsBack))).toEqual(["$21.25", "$21.25", "$10.62", "$15.93", "$15.95"])
    expect(THE_CREW.shares.reduce((a, s) => a + s.getsBack, 0n)).toBe(THE_CREW.left)
  })
})
