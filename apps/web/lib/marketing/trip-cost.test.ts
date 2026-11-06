// The trip cost calculator (lib/marketing/trip-cost.ts): the method's arithmetic to the cent, the $5 rounding, the
// presets the page quotes, input parsing, and the rule classification, which must agree with the app's own
// previewSpend (lib/client/rules) for every amount and group size we try.
import { describe, expect, it } from "vitest"
import { cents, dollars } from "@/lib/client/money"
import { DEFAULT_RULES, previewSpend } from "@/lib/client/rules"
import { defaultExtras } from "@pot/sdk"
import { approvalFor, approvalsNeeded, parseMoney, parseWhole, PRESETS, tripCost, usd, usdWhole, type TripInputs } from "./trip-cost"
import { DEFAULT_LIMITS } from "./trip-cost-defaults"
import { toolApplication } from "./schema"

describe("a new Pot's limits", () => {
  it("are $100 at a time, $200 each in total, one OK up to $300", () => {
    expect(DEFAULT_LIMITS).toEqual({ instant: 100_00, perPerson: 200_00, oneOk: 300_00 })
  })
})

describe("tripCost", () => {
  it("weekend away: 6 people, $2,100 + a 10% cushion = $2,310, so $385 each (already a multiple of $5)", () => {
    const r = tripCost(PRESETS.weekend, DEFAULT_LIMITS)
    expect(r.lines.map((l) => [l.id, l.total])).toEqual([
      ["stay", 1200_00],
      ["travel", 240_00],
      ["food", 420_00],
      ["activities", 240_00],
    ])
    expect(r.tripCost).toBe(2100_00)
    expect(r.cushion).toBe(210_00)
    expect(r.rounding).toBe(0)
    expect(r.each).toBe(385_00)
    expect(r.pot).toBe(2310_00)
    expect(r.spare).toBe(210_00)
  })

  it("a week abroad: 4 people, $5,240 + $524 = $5,764 → $1,441 each, rounded up to $1,445", () => {
    const r = tripCost(PRESETS.abroad, DEFAULT_LIMITS)
    expect(r.tripCost).toBe(5240_00)
    expect(r.cushion).toBe(524_00)
    expect(r.each).toBe(1445_00)
    expect(r.pot).toBe(5780_00)
    expect(r.rounding).toBe(16_00)
    expect(r.spare).toBe(540_00)
    // everything adds up: trip cost + cushion + rounding = what's in the Pot = each × people
    expect(r.tripCost + r.cushion + r.rounding).toBe(r.pot)
    expect(r.each * PRESETS.abroad.people).toBe(r.pot)
  })

  it("bachelorette weekend: 8 people, $3,916 with the cushion → $489.50 each, rounded up to $490", () => {
    const r = tripCost(PRESETS.party, DEFAULT_LIMITS)
    expect(r.tripCost).toBe(3560_00)
    expect(r.each).toBe(490_00)
    expect(r.rounding).toBe(4_00)
  })

  it("rounds each share UP to the next $5, never down", () => {
    const base: TripInputs = { people: 3, days: 1, stay: 0, travelEach: 0, foodEachPerDay: 0, activities: 0, cushionPct: 0 }
    expect(tripCost({ ...base, stay: 300_00 }, DEFAULT_LIMITS).each).toBe(100_00)
    expect(tripCost({ ...base, stay: 300_03 }, DEFAULT_LIMITS).each).toBe(105_00)
    expect(tripCost({ ...base, stay: 1 }, DEFAULT_LIMITS).each).toBe(5_00)
    expect(tripCost(base, DEFAULT_LIMITS).each).toBe(0)
  })

  it("the cushion is a percent of the trip cost, to the cent", () => {
    const r = tripCost({ people: 1, days: 1, stay: 333_33, travelEach: 0, foodEachPerDay: 0, activities: 0, cushionPct: 15 }, DEFAULT_LIMITS)
    expect(r.cushion).toBe(50_00) // 15% of $333.33 = $49.9995 → $50.00
  })

  it("food is paid day by day: one day's shop for everyone is the payment that needs approving", () => {
    const r = tripCost(PRESETS.weekend, DEFAULT_LIMITS)
    const food = r.lines.find((l) => l.id === "food")!
    expect(food).toMatchObject({ payment: 210_00, paid: "daily", approval: { tier: "one_ok" } })
    const stay = r.lines.find((l) => l.id === "stay")!
    expect(stay.approval).toEqual({ tier: "group", k: 4, n: 6 })
  })

  it("a cost of nothing needs no approval", () => {
    const r = tripCost({ ...PRESETS.weekend, activities: 0 }, DEFAULT_LIMITS)
    expect(r.lines.find((l) => l.id === "activities")!.approval).toBeNull()
  })
})

describe("approvalFor agrees with the app's previewSpend", () => {
  const extras = defaultExtras({ ...DEFAULT_RULES, payeeAllowlist: [] })
  const amounts = [1, 50_00, 99_99, 100_00, 100_01, 200_00, 299_99, 300_00, 300_01, 420_00, 1200_00, 9999_00]
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8, 12, 20, 39, 40]

  for (const n of sizes) {
    it(`for a group of ${n}`, () => {
      for (const a of amounts) {
        const app = previewSpend({
          amount: cents(a),
          balance: dollars(1_000_000),
          rules: DEFAULT_RULES,
          memberCount: n,
          used: 0n,
          contributed: dollars(10),
          oneOkUsed: 0n,
          receiverIsMember: true,
          extras,
          trustLevel: 0,
        })
        const appTier = app.path === "instant" ? "instant" : app.tier
        expect(approvalFor(a, n, DEFAULT_LIMITS), `$${a / 100} with ${n}`).toEqual({ tier: appTier, k: app.k, n: app.n })
        expect(approvalsNeeded(n)).toBe(app.k)
      }
    })
  }
})

describe("parsing and formatting", () => {
  it("reads what people type into a money field", () => {
    expect(parseMoney("1200")).toBe(1200_00)
    expect(parseMoney("$1,200.50")).toBe(1200_50)
    expect(parseMoney(" 85 ")).toBe(85_00)
    expect(parseMoney(".5")).toBe(50)
    expect(parseMoney("")).toBe(0)
    expect(parseMoney("-5")).toBeNull()
    expect(parseMoney("12.345")).toBeNull()
    expect(parseMoney("abc")).toBeNull()
    expect(parseMoney("100001")).toBeNull()
  })

  it("reads whole numbers within a range", () => {
    expect(parseWhole("6", 1, 40)).toBe(6)
    expect(parseWhole("41", 1, 40)).toBeNull()
    expect(parseWhole("0", 1, 40)).toBeNull()
    expect(parseWhole("2.5", 1, 40)).toBeNull()
    expect(parseWhole("", 1, 40)).toBeNull()
  })

  it("formats amounts the way the app does", () => {
    expect(usd(1445_00)).toBe("$1,445.00")
    expect(usdWhole(1445_00)).toBe("$1,445")
    expect(usdWhole(489_50)).toBe("$489.50")
  })
})

describe("the calculator's JSON-LD", () => {
  it("is a free WebApplication of its own, on its page, with no ratings", () => {
    const node = toolApplication({ path: "/tools/group-trip-cost-calculator", name: "Group trip cost calculator", description: "d", category: "TravelApplication" })
    expect(node).toMatchObject({
      "@type": "WebApplication",
      applicationCategory: "TravelApplication",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    })
    expect(String(node["@id"])).toMatch(/\/tools\/group-trip-cost-calculator#tool$/)
    expect(JSON.stringify(node)).not.toMatch(/aggregateRating|review/)
  })
})
