// CLI-4 (security audit 2026-11-04): names that would make a public pay-in page look official are refused; everyday
// group names are not.
import { describe, expect, it } from "vitest"
import { isReservedNameError, isReservedPublicName, publicPageRefusal, RESERVED_DETAIL } from "./reserved-names"

describe("isReservedPublicName (CLI-4)", () => {
  it.each([
    "Pot",
    "pot",
    "POT Support",
    "Pot Official",
    "The Pot app",
    "NEAR Foundation",
    "near foundation grants",
    "NEAR Hackathon refunds",
    "Official Lisbon Trip",
    "Verified fundraiser",
    "Customer Support",
    "Red Cross Ukraine",
    "redcross relief",
    "UNICEF for kids",
    "Save the Children 2026",
    "Médecins Sans Frontières",
    "Doctors Without Borders",
    "Coinbase refunds",
    "PayPal",
    "Binance giveaway",
    "Sputnik DAO",
    "Trezu",
    "USDC airdrop",
    "0ff1cial page", // look-alike digits
    "Ｏｆｆｉｃｉａｌ", // full-width letters
    "Red​Cross", // an invisible character in the middle
    "P0T",
  ])("refuses %j", (name) => expect(isReservedPublicName(name)).toBe(true))

  it.each([
    "Lisbon Trip",
    "Pot luck dinner",
    "Potluck",
    "Near the beach house",
    "Support Leo's surgery",
    "Amazon rainforest trip",
    "Aurora hunting 2026",
    "Linear AI study group",
    "Visa fees for Japan",
    "Ski Chalet",
    "Maya's birthday 🎂",
    "Rent · Flat 3B",
    "",
  ])("allows %j", (name) => expect(isReservedPublicName(name)).toBe(false))

  it("checks the name, the slug (the page's address) and the one-liner", () => {
    expect(publicPageRefusal({ name: "Lisbon Trip", slug: "lisbon-trip", line: "Thanks for chipping in!" })).toBeNull()
    expect(publicPageRefusal({ name: "Relief fund", slug: "red-cross-relief" })).toBe("reserved_name")
    expect(publicPageRefusal({ name: "Relief fund", slug: "relief", line: "Official UNICEF partner" })).toBe("reserved_name")
    expect(publicPageRefusal({ name: "NEAR Foundation" })).toBe("reserved_name")
  })

  it("recognises the API's refusal", () => {
    expect(isReservedNameError({ reason: "bad_request", detail: RESERVED_DETAIL })).toBe(true)
    expect(isReservedNameError({ reason: "bad_request", detail: { field: "line", why: "too_long" } })).toBe(false)
    expect(isReservedNameError(new Error("x"))).toBe(false)
    expect(isReservedNameError(null)).toBe(false)
  })
})
