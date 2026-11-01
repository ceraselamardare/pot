// U-03 (money) + PR-04 (display never exceeds the real amount).
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import {
  FIGURE_SPACE,
  MAX_AMOUNT,
  MINUS_SIGN,
  alignTabular,
  centsToMicro,
  dollars,
  formatUsd,
  formatUsdParts,
  formatUsdShort,
  micro,
  microToCents,
  parseMicroStr,
  parseUsdInput,
  sumMicro,
} from "./money.ts"

describe("money: parsing", () => {
  it("parses keypad input to 6-dp base units", () => {
    expect(parseUsdInput("84")).toBe(84_000_000n)
    expect(parseUsdInput("84.5")).toBe(84_500_000n)
    expect(parseUsdInput("84.50")).toBe(84_500_000n)
    expect(parseUsdInput("$1,234.50")).toBe(1_234_500_000n)
    expect(parseUsdInput(".5")).toBe(500_000n)
    expect(parseUsdInput("0")).toBe(0n)
    expect(parseUsdInput("150.")).toBe(150_000_000n)
  })

  it("rejects non-amounts and over-precise input", () => {
    for (const bad of ["", ".", "abc", "-5", "1.234", "1..2", "1e5", "$", "12 34"]) expect(parseUsdInput(bad)).toBeNull()
    expect(parseUsdInput("1.234567", { maxDecimals: 6 })).toBe(1_234_567n)
    expect(parseUsdInput("1000000001")).toBeNull() // > MAX_AMOUNT ($1B)
  })

  it("dollars(), micro() and MicroStr", () => {
    expect(dollars(84)).toBe(84_000_000n)
    expect(dollars("0.000001")).toBe(1n)
    expect(dollars(22.5)).toBe(22_500_000n)
    expect(() => dollars("1.0000001")).toThrow()
    expect(micro("150000000")).toBe(150_000_000n)
    expect(micro(5)).toBe(5n)
    expect(() => micro(1.5)).toThrow()
    expect(parseMicroStr("0")).toBe(0n)
    expect(() => parseMicroStr("007")).toThrow()
    expect(() => parseMicroStr("-1")).toThrow()
    expect(sumMicro([1n, 2n, 3n])).toBe(6n)
    expect(MAX_AMOUNT).toBe(10n ** 15n)
  })

  it("cents", () => {
    expect(microToCents(29_333_333n)).toBe(2933n)
    expect(centsToMicro(2200)).toBe(22_000_000n)
  })
})

describe("money: display (ux-spec §1.3)", () => {
  it("two decimals everywhere, floored to the cent", () => {
    expect(formatUsd(450_000_000n)).toBe("$450.00")
    expect(formatUsd(84_000_000n)).toBe("$84.00")
    expect(formatUsd(1_234_500_000n)).toBe("$1,234.50")
    expect(formatUsd(29_333_333n)).toBe("$29.33")
    expect(formatUsd(14_666_667n)).toBe("$14.66") // floor, not round (ux-spec §4.14: $14.66)
    expect(formatUsd(9_999n)).toBe("$0.00")
    expect(formatUsd(1_000_000_000_000_000n)).toBe("$1,000,000,000.00")
  })

  it("sentences and buttons keep whole dollars", () => {
    expect(formatUsdShort(150_000_000n)).toBe("$150")
    expect(formatUsdShort(84_500_000n)).toBe("$84.50")
  })

  it("feed signs: '+ $150.00' and '\u2212 $84.00' with U+2212", () => {
    expect(formatUsd(150_000_000n, { sign: "in" })).toBe("+ $150.00")
    expect(formatUsd(84_000_000n, { sign: "out" })).toBe(`${MINUS_SIGN} $84.00`)
    expect(formatUsd(-84_000_000n)).toBe(`${MINUS_SIGN} $84.00`)
    expect(formatUsd(-84_000_000n, { sign: "auto" })).toBe(`${MINUS_SIGN} $84.00`)
    expect(formatUsd(1n * 1_000_000n, { sign: "auto" })).toBe("+ $1.00")
    expect(formatUsd(0n, { sign: "auto" })).toBe("$0.00")
  })

  it("parts for tabular hero layouts", () => {
    expect(formatUsdParts(1_234_500_000n)).toEqual({ sign: "", symbol: "$", whole: "1,234", fraction: "50", text: "$1,234.50" })
    expect(formatUsdParts(150_000_000n, { decimals: "auto" }).fraction).toBe("")
  })

  it("alignTabular pads with figure spaces to equal width", () => {
    const out = alignTabular(["$22.00", "$1,234.50", "$5.00"])
    expect(out.map((s) => [...s].length)).toEqual([9, 9, 9])
    expect(out[0]).toBe(`${FIGURE_SPACE.repeat(3)}$22.00`)
  })

  it("PR-04: displayed cents never exceed the real amount; parse(format(x)) = floor to cent", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MAX_AMOUNT }), (m) => {
        const shown = parseUsdInput(formatUsd(m))
        expect(shown).not.toBeNull()
        expect(shown as bigint).toBeLessThanOrEqual(m)
        expect(m - (shown as bigint)).toBeLessThan(10_000n)
      }),
      { numRuns: 2000 },
    )
  })

  it("PR-04: 'Gets back' rows sum to ≤ the balance they split", () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: 0n, max: 10n ** 12n }), { minLength: 1, maxLength: 40 }), (xs) => {
        const shownSum = sumMicro(xs.map((x) => parseUsdInput(formatUsd(x)) as bigint))
        expect(shownSum).toBeLessThanOrEqual(sumMicro(xs))
      }),
      { numRuns: 2000 },
    )
  })
})
