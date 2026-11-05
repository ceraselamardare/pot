// The group's "about $X each" (goal-each route + create's relay meta): micro-USD between $1 and $100,000.
import { describe, expect, it } from "vitest"
import { goalEachPutReq, signedRelayReq } from "./schemas"

describe("goalEachPutReq", () => {
  it("takes $1 to $100,000 in micro-USD, or null to clear", () => {
    expect(goalEachPutReq.safeParse({ goalEach: "50000000" }).success).toBe(true)
    expect(goalEachPutReq.safeParse({ goalEach: "1000000" }).success).toBe(true)
    expect(goalEachPutReq.safeParse({ goalEach: "100000000000" }).success).toBe(true)
    expect(goalEachPutReq.safeParse({ goalEach: null }).success).toBe(true)
  })
  it("refuses under $1, over $100,000, signs, decimals and extra keys", () => {
    for (const goalEach of ["999999", "100000000001", "-5", "5.5", "0", "", "01000000"]) expect(goalEachPutReq.safeParse({ goalEach }).success).toBe(false)
    expect(goalEachPutReq.safeParse({ goalEach: "50000000", extra: 1 }).success).toBe(false)
    expect(goalEachPutReq.safeParse({}).success).toBe(false)
  })
})

describe("create's relay meta", () => {
  it("may carry goalEach next to the cover, validated the same way", () => {
    const base = { signedDelegate: "x", idempotencyKey: "k".repeat(26), intent: "create_pot" }
    const ok = signedRelayReq.safeParse({ ...base, context: { meta: { gradient: "3", goalEach: "50000000" } } })
    const bad = signedRelayReq.safeParse({ ...base, context: { meta: { gradient: "3", goalEach: "5" } } })
    expect(bad.success).toBe(false)
    // the rest of the body may be refused for its own reasons; the meta itself must not be the problem
    if (!ok.success) expect(ok.error.issues.some((i) => i.path.includes("goalEach"))).toBe(false)
  })
})
