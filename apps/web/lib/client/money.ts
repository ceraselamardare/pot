// Money for the UI (ux-spec §1.3, brand README §9, frontend-architecture §7.2). Amounts are USDC base units
// (`Micro`, 6 decimals) as in @pot/sdk. Display floors to the cent. Every displayed amount renders through
// <MoneyText>, which adds `tabular-nums`; these helpers only build the strings.
// Formatting and parsing come from @pot/sdk (F-03); this file keeps only the UI's keypad helpers on top.

import {
  centsToMicro,
  dollars as sdkDollars,
  formatUsd as sdkFormatUsd,
  formatUsdShort,
  microToCents,
  MINUS_SIGN,
  parseUsdInput,
  type Micro,
} from "@pot/sdk"

export type { Micro }
export const MICRO_PER_CENT = 10_000n
/** U+2212 MINUS SIGN: the same advance as "+" in Gabarito and Figtree (brand README §5). */
export const MINUS = MINUS_SIGN

export const cents = (c: number): Micro => centsToMicro(Math.round(c))
export const dollars = (d: number): Micro => sdkDollars(d)
/** Floor to whole cents (never round up money). */
export const toCents = (m: Micro): number => Number(microToCents(m < 0n ? -m : m)) * (m < 0n ? -1 : 1)

export type MoneyStyle = "fixed" | "whole"

/**
 * "fixed": always two decimals ("$450.00"), for the hero, rows and keypad results.
 * "whole": sentences and buttons drop ".00" for whole amounts ("Add $150"), else two decimals.
 * Both come from @pot/sdk's formatUsd (floored to the cent, U+2212 for negatives).
 */
export function formatUsd(m: Micro, style: MoneyStyle = "fixed"): string {
  return style === "whole" ? formatUsdShort(m) : sdkFormatUsd(m)
}

/** Feed amount column: "+ $150.00" in, "− $84.00" out (ux-spec §1.3). */
export function formatSigned(m: Micro, sign: "in" | "out"): string {
  return sdkFormatUsd(m < 0n ? -m : m, { sign })
}

// ---------------------------------------------------------------------------------------------------------
// Keypad input: a string of digits with at most one "." and 2 decimals. No OS keyboard (ux-spec §3).

export const KEYPAD_MAX_INT_DIGITS = 6

/** Apply one key ("0"-"9", ".", "del") to the keypad string. Returns the same string when the key is refused. */
export function keypadPress(value: string, key: string): string {
  if (key === "del") return value.slice(0, -1)
  if (key === ".") {
    if (value.includes(".")) return value
    return value === "" ? "0." : `${value}.`
  }
  if (!/^\d$/.test(key)) return value
  const [int = "", dec] = value.split(".")
  if (dec !== undefined) return dec.length >= 2 ? value : `${value}${key}`
  if (int === "0") return key // no leading zeros
  if (int.length >= KEYPAD_MAX_INT_DIGITS) return value
  return `${value}${key}`
}

/** Keypad string → Micro (@pot/sdk parseUsdInput, ≤ 2 decimals). "" → 0. */
export function parseKeypad(value: string): Micro {
  if (!value || value === ".") return 0n
  return parseUsdInput(value.endsWith(".") ? value.slice(0, -1) : value) ?? 0n
}

/** Micro → keypad string ("150", "84.5", "12.05"). */
export function toKeypad(m: Micro): string {
  const c = toCents(m)
  const whole = Math.floor(c / 100)
  const frac = c % 100
  if (frac === 0) return String(whole)
  return `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`
}

/** Keypad display ("$84", "$84.5", "$0") with the typed decimals kept, for the amount display. */
export function keypadDisplay(value: string): string {
  if (!value) return "$0"
  const [int = "0", dec] = value.split(".")
  const grouped = Number(int).toLocaleString("en-US")
  return dec === undefined ? `$${grouped}` : `$${grouped}.${dec}`
}
