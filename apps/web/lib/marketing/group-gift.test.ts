// The /group-gift worked example (lib/marketing/group-gift.ts): six friends plus two relatives paying in from
// outside, worked out by the app's own rule and close-out math. The money from outside is shared among the members at
// close, in proportion to what each put in, and none of it goes back to whoever paid it in.
import { describe, expect, it } from "vitest"
import { dollars, formatUsd, MICRO_PER_CENT } from "@/lib/client/money"
import { refunds } from "@/lib/client/refund"
import { GIFT_CAST, GIFT_OUTSIDE, NORA_GIFT } from "./group-gift"

const usd = (m: bigint) => formatUsd(m)

describe("Nora Turns 30", () => {
  it("6 friends at $40 is $240, plus $60 paid in from outside: $300", () => {
    expect(NORA_GIFT.people).toBe(6)
    expect(usd(NORA_GIFT.membersIn)).toBe("$240.00")
    expect(usd(NORA_GIFT.outside)).toBe("$60.00")
    expect(GIFT_OUTSIDE.map((g) => usd(g.amount))).toEqual(["$35.00", "$25.00"])
    expect(usd(NORA_GIFT.total)).toBe("$300.00")
  })

  it("the gift needs one OK, the cake goes through on its own", () => {
    const by = Object.fromEntries(NORA_GIFT.spends.map((s) => [s.id, s]))
    expect(by.gift).toMatchObject({ amount: dollars(260), tier: "one_ok", by: "ana" })
    expect(by.cake).toMatchObject({ amount: dollars(25), tier: "instant", by: "mia" })
    expect(NORA_GIFT.spends.map((s) => usd(s.leftAfter))).toEqual(["$40.00", "$15.00"])
  })

  it("$300 − $260 − $25 = $15 left, shared among the six friends: $2.50 each, nothing to the relatives", () => {
    expect(usd(NORA_GIFT.left)).toBe("$15.00")
    expect(NORA_GIFT.shares.map((s) => s.id)).toEqual([...GIFT_CAST])
    expect(NORA_GIFT.shares.map((s) => usd(s.getsBack))).toEqual(Array(6).fill("$2.50"))
    expect(NORA_GIFT.remainder).toBe(0n)
    expect(NORA_GIFT.shares.reduce((a, s) => a + s.getsBack, 0n)).toBe(NORA_GIFT.left)
  })

  it("the money from outside is everyone's: with it, each friend's part of the spending is less than $40", () => {
    // $285 was spent: the relatives' $60 covers part of it, and each friend's part is $37.50
    expect(usd(NORA_GIFT.each - NORA_GIFT.eachBack)).toBe("$37.50")
    expect((NORA_GIFT.each - NORA_GIFT.eachBack) * 6n + NORA_GIFT.outside).toBe(dollars(285))
  })

  it("the close split matches the app's: the $55 version would leave awkward cents ($1.66 × 5 + $1.70)", () => {
    const back = refunds({
      balance: dollars(10),
      members: GIFT_CAST.map((id) => ({ id, contributed: dollars(40) })),
      lastContributor: "zara",
      unit: MICRO_PER_CENT,
    })
    expect(GIFT_CAST.map((id) => usd(back.get(id)!))).toEqual(["$1.66", "$1.66", "$1.66", "$1.66", "$1.66", "$1.70"])
  })
})
