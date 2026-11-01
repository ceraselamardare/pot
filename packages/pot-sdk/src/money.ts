// USDC (test) money: 6-decimal base units as bigint ("Micro"), keypad parsing and display.
// Display rules (ux-spec §1.3): en-US "$1,234.50"; amounts are floored to the cent (the same
// integer math as the contract); two decimals everywhere incl. the hero; sentences/buttons keep
// whole dollars ("Add $150"); feed amounts may carry "+ " / "\u2212 " (U+2212) but never a bare sign.
// Every displayed amount must also use tabular figures (CSS `tabular-nums`): see formatUsdParts
// and alignTabular for column layouts.

/** USDC base units (6 decimals). */
export type Micro = bigint
/** Micro as a decimal string on the wire. */
export type MicroStr = string

export const USDC_DECIMALS = 6
export const MICRO_PER_DOLLAR = 1_000_000n
export const MICRO_PER_CENT = 10_000n
/** contracts-spec §2.3 MAX_AMOUNT: 1e15 = $1B (the test-USDC supply). */
export const MAX_AMOUNT: Micro = 1_000_000_000_000_000n
/** api-spec §0.3 MicroStr pattern (≤ 16 digits, no leading zeros). */
export const MICRO_STR_RE = /^(0|[1-9][0-9]{0,15})$/

export const MINUS_SIGN = "\u2212"
export const FIGURE_SPACE = "\u2007"

/** Parses a base-unit string or number (or passes a bigint through). Throws on anything else. */
export function micro(x: bigint | number | string): Micro {
  if (typeof x === "bigint") return x
  if (typeof x === "number") {
    if (!Number.isSafeInteger(x)) throw new Error(`micro: ${x} is not a safe integer`)
    return BigInt(x)
  }
  if (!/^-?\d+$/.test(x)) throw new Error(`micro: ${JSON.stringify(x)} is not an integer string`)
  return BigInt(x)
}

/** Strict wire parse (api-spec MicroStr). */
export function parseMicroStr(s: string): Micro {
  if (!MICRO_STR_RE.test(s)) throw new Error(`invalid MicroStr ${JSON.stringify(s)}`)
  return BigInt(s)
}

export const microStr = (m: Micro): MicroStr => m.toString()

/**
 * Exact decimal dollars → Micro. Accepts a number (only if it is exact to 6 dp, e.g. 84.5) or a
 * decimal string with ≤ 6 decimals. `dollars(84)` = 84_000_000n.
 */
export function dollars(x: number | string): Micro {
  const s = typeof x === "number" ? String(x) : x.trim()
  const m = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(s)
  if (!m) throw new Error(`dollars: ${JSON.stringify(x)} is not a decimal with ≤ 6 dp`)
  const v = BigInt((m[2] as string) + (m[3] ?? "").padEnd(6, "0"))
  return m[1] === "-" ? -v : v
}

/**
 * Keypad / text input → Micro, or null when it isn't a valid amount yet.
 * Accepts "84", "84.5", "84.50", "$1,234.50", ".5"; rejects more than `maxDecimals` decimals
 * (default 2, cents), negative values, letters, and values above MAX_AMOUNT.
 */
export function parseUsdInput(input: string, opts: { maxDecimals?: number } = {}): Micro | null {
  const maxDecimals = opts.maxDecimals ?? 2
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "").trim()
  if (s === "" || s === ".") return null
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m) return null
  const whole = m[1] || "0"
  const frac = m[2] ?? ""
  if (frac.length > maxDecimals || frac.length > USDC_DECIMALS) return null
  const v = BigInt(whole) * MICRO_PER_DOLLAR + BigInt(frac.padEnd(USDC_DECIMALS, "0") || "0")
  return v > MAX_AMOUNT ? null : v
}

/** Floors to whole cents (display uses the floor, ux-spec §1.3). Negative values floor toward 0. */
export function microToCents(m: Micro): bigint {
  return m / MICRO_PER_CENT
}
export const centsToMicro = (cents: bigint | number): Micro => BigInt(cents) * MICRO_PER_CENT

export function sumMicro(xs: Iterable<Micro>): Micro {
  let t = 0n
  for (const x of xs) t += x
  return t
}

function group3(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export type UsdSign = "none" | "in" | "out" | "auto"
export interface FormatUsdOptions {
  /** "always" (default) → "$150.00"; "auto" → "$150" when whole cents are .00, else "$84.50". */
  decimals?: "always" | "auto"
  /** "in" → "+ $150.00", "out" → "\u2212 $84.00" (U+2212), "auto" → by the value's sign. Default "none". */
  sign?: UsdSign
}

export interface UsdParts {
  /** "", "+" or "\u2212" (U+2212). */
  sign: "" | "+" | typeof MINUS_SIGN
  symbol: "$"
  /** Grouped whole dollars, e.g. "1,234". */
  whole: string
  /** Two cent digits, or "" when decimals are "auto" and the amount is whole. */
  fraction: string
  /** The joined text, e.g. "\u2212 $1,234.50". */
  text: string
}

/** Splits an amount into renderable parts (for hero layouts that style cents separately). */
export function formatUsdParts(m: Micro, opts: FormatUsdOptions = {}): UsdParts {
  const neg = m < 0n
  const abs = neg ? -m : m
  const cents = microToCents(abs)
  const whole = group3((cents / 100n).toString())
  const c = (cents % 100n).toString().padStart(2, "0")
  const fraction = opts.decimals === "auto" && c === "00" ? "" : c
  const signOpt = opts.sign ?? "none"
  let sign: UsdParts["sign"] = ""
  if (signOpt === "in") sign = "+"
  else if (signOpt === "out") sign = MINUS_SIGN
  else if (signOpt === "auto") sign = neg ? MINUS_SIGN : abs > 0n ? "+" : ""
  else if (neg) sign = MINUS_SIGN
  const body = `$${whole}${fraction ? `.${fraction}` : ""}`
  return { sign, symbol: "$", whole, fraction, text: sign ? `${sign} ${body}` : body }
}

/** "$1,234.50" (floored to the cent). See FormatUsdOptions for whole-dollar and signed variants. */
export function formatUsd(m: Micro, opts: FormatUsdOptions = {}): string {
  return formatUsdParts(m, opts).text
}

/** Sentence / button style: "$150" when whole, "$84.50" otherwise (ux-spec §1.3). */
export const formatUsdShort = (m: Micro): string => formatUsd(m, { decimals: "auto" })

/**
 * Right-aligns formatted amounts for a column by left-padding with FIGURE SPACE (U+2007), which
 * has the width of a tabular digit. Only correct when rendered with tabular figures, and the
 * strings must share the same punctuation layout (e.g. all from formatUsd with decimals "always").
 */
export function alignTabular(texts: readonly string[]): string[] {
  const w = Math.max(0, ...texts.map((t) => [...t].length))
  return texts.map((t) => FIGURE_SPACE.repeat(w - [...t].length) + t)
}
