// Money strings exactly as @pot/sdk formats them (packages/pot-sdk/src/money.ts): "$1,234.50", whole style
// "$150" / "$84.50", signed "+ $150.00" / "− $84.00" (U+2212 + a space). Amounts here are dollars (numbers),
// rounded to the cent, so scenes can interpolate them frame by frame.

export const MINUS = "−";

export type MoneyStyle = "fixed" | "whole";

const group3 = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Dollars → integer cents (rounded; scenes interpolate floats). */
export const toCents = (dollars: number) => Math.round(dollars * 100);

/**
 * "fixed": "$450.00" (the hero, rows, tables). "whole": "$150" when whole, else "$84.50" (sentences, buttons).
 * Negative amounts get U+2212.
 */
export function formatUsd(dollars: number, style: MoneyStyle = "fixed"): string {
  const cents = toCents(dollars);
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = group3(Math.floor(abs / 100).toString());
  const frac = (abs % 100).toString().padStart(2, "0");
  const body = style === "whole" && frac === "00" ? `$${whole}` : `$${whole}.${frac}`;
  return neg ? `${MINUS} ${body}` : body;
}

/** Feed amount column: "+ $150.00" (in) or "− $84.00" (out). */
export function formatSigned(dollars: number, sign: "in" | "out"): string {
  const body = formatUsd(Math.abs(dollars), "fixed");
  return `${sign === "in" ? "+" : MINUS} ${body}`;
}

/** Keypad display: "$0", "$8", "$84", "$1,250", "$84.5" (typed decimals kept), like the app's keypadDisplay. */
export function keypadDisplay(typed: string): string {
  if (!typed) return "$0";
  const [int = "0", dec] = typed.split(".");
  const grouped = group3(String(Number(int || "0")));
  return dec === undefined ? `$${grouped}` : `$${grouped}.${dec}`;
}

/** "Maya", "Maya and Leo", "Maya, Sam and Leo" (feed.and). */
export function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
