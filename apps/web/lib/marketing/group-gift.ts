// The /group-gift worked example, "Nora Turns 30" (page-plan: 6 friends at $40 suggested, plus money from two
// relatives through a pay-in link; the gift $260 needs one OK, the cake $25 goes through on its own), worked out by
// the app's own rule and close-out math (lib/marketing/example-math.ts).
// The relatives put in $35 and $25 ($60, not the plan's $55): with $55 the $10 left would come back as $1.66 five
// times and $1.70 once; with $60 the $15 left is $2.50 each, which reads as what it is. Their money belongs to the
// whole group: it's part of what's left, shared among the six friends in proportion to what each put in, and none of
// it goes back to them (hub gifts.rs; en.json gift.details.shared). Asserted in group-gift.test.ts.
import { dollars, type Micro } from "@/lib/client/money"
import { workExample } from "./example-math"

/** The six friends in join order (avatar colours member-1…6). Names: en.json `uc.gift.cast.*`. */
export const GIFT_CAST = ["ana", "ben", "kofi", "mia", "raj", "zara"] as const
export type GiftPerson = (typeof GIFT_CAST)[number]

/** The suggested amount each. */
export const GIFT_EACH: Micro = dollars(40)

/** Paid in through a pay-in link by two of Nora's relatives, who don't join. Names: en.json `uc.gift.outside.*`. */
export const GIFT_OUTSIDE = [
  { id: "ruth", amount: dollars(35) },
  { id: "theo", amount: dollars(25) },
] as const

export const NORA_GIFT = workExample({
  cast: GIFT_CAST,
  each: GIFT_EACH,
  fromOutside: GIFT_OUTSIDE,
  spends: [
    { id: "gift", by: "ana", amount: dollars(260) },
    { id: "cake", by: "mia", amount: dollars(25) },
  ],
})

export type GiftSpend = (typeof NORA_GIFT.spends)[number]
export type GiftSpendId = GiftSpend["id"]
