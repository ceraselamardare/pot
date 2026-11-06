// The /bachelorette-party worked example, "Lake House Weekend" (page-plan: 8 friends, $250 suggested each = $2,000;
// the house $1,200 needs 5 of 8, decorations $60 go through on their own, the dinner $280 needs one OK), worked out by
// the app's own rule and close-out math (lib/marketing/example-math.ts). The guest of honour isn't in the Pot, so
// she's not in the cast. Asserted in bachelorette-party.test.ts.
import { dollars, type Micro } from "@/lib/client/money"
import { approvalsNeeded } from "@/lib/client/rules"
import { workExample } from "./example-math"

/** The eight friends in join order (avatar colours member-1…6, then again). Names: en.json `uc.party.cast.*`. */
export const PARTY_CAST = ["chloe", "amara", "bea", "dani", "ellie", "hana", "rosa", "zoe"] as const
export type PartyPerson = (typeof PARTY_CAST)[number]

/** The suggested amount each: it covers the guest of honour's share too. */
export const PARTY_EACH: Micro = dollars(250)

export const LAKE_HOUSE = workExample({
  cast: PARTY_CAST,
  each: PARTY_EACH,
  spends: [
    { id: "house", by: "chloe", amount: dollars(1200) },
    { id: "decorations", by: "bea", amount: dollars(60) },
    { id: "dinner", by: "amara", amount: dollars(280) },
  ],
})

export type PartySpend = (typeof LAKE_HOUSE.spends)[number]
export type PartySpendId = PartySpend["id"]

/** k of n for a group of eight (the "5 of 8" in the copy). */
export const PARTY_GROUP_K = approvalsNeeded(PARTY_CAST.length)
