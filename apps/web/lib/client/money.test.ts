import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { cents, dollars, formatSigned, formatUsd, keypadDisplay, keypadPress, MINUS, parseKeypad, toCents, toKeypad } from "./money"

describe("formatUsd (ux-spec §1.3)", () => {
  it("shows two decimals for displayed amounts", () => {
    expect(formatUsd(dollars(450))).toBe("$450.00")
    expect(formatUsd(cents(123450))).toBe("$1,234.50")
  })
  it("drops .00 for whole amounts in sentences and buttons", () => {
    expect(formatUsd(dollars(150), "whole")).toBe("$150")
    expect(formatUsd(cents(8450), "whole")).toBe("$84.50")
  })
  it("floors to the cent, never rounds money up", () => {
    expect(formatUsd(22_666_666n)).toBe("$22.66")
  })
  it("writes money out with U+2212 and money in with +", () => {
    expect(formatSigned(dollars(84), "out")).toBe(`${MINUS} $84.00`)
    expect(formatSigned(dollars(150), "in")).toBe("+ $150.00")
  })
})

describe("keypad", () => {
  const type = (keys: string[]) => keys.reduce(keypadPress, "")
  it("types digits, one decimal point and two decimals", () => {
    expect(type(["8", "4"])).toBe("84")
    expect(type([".", "5"])).toBe("0.5")
    expect(type(["1", ".", "2", "3", "4"])).toBe("1.23")
    expect(type(["1", ".", "."])).toBe("1.")
    expect(type(["0", "0", "7"])).toBe("7")
    expect(type(["3", "0", "0", "del"])).toBe("30")
  })
  it("caps the integer part at 6 digits", () => {
    expect(type(["9", "9", "9", "9", "9", "9", "9"])).toBe("999999")
  })
  it("parses to Micro", () => {
    expect(parseKeypad("84")).toBe(dollars(84))
    expect(parseKeypad("84.5")).toBe(cents(8450))
    expect(parseKeypad("")).toBe(0n)
    expect(parseKeypad("0.")).toBe(0n)
  })
  it("round-trips Micro ↔ keypad", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999 }), (c) => {
        expect(toCents(parseKeypad(toKeypad(cents(c))))).toBe(c)
      }),
    )
  })
  it("displays what was typed", () => {
    expect(keypadDisplay("")).toBe("$0")
    expect(keypadDisplay("1234.5")).toBe("$1,234.5")
  })
})
