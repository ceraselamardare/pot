import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { SDK_VERSION, daoIdFromSlug } from "./index.ts"

describe("@pot/sdk smoke", () => {
  it("exports a version", () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("daoIdFromSlug puts the slug under the hub account (D-02)", () => {
    expect(daoIdFromSlug("lisbon-trip", "pots.pot.testnet")).toBe("lisbon-trip.pots.pot.testnet")
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,30}$/), (slug) => {
        const id = daoIdFromSlug(slug, "pots.pot.testnet")
        expect(id.startsWith(`${slug}.`)).toBe(true)
        expect(id.endsWith(".pots.pot.testnet")).toBe(true)
      }),
    )
  })
})
