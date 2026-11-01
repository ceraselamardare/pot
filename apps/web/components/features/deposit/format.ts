// Small formatting helpers for the deposit flow (xc.* copy may name the coin and the network, ux-spec §1.2).
import { formatUsd, type Micro } from "@/lib/client/money"
import type { XcChain } from "@/lib/deposit"

export const NETWORK: Record<XcChain, string> = { base: "Base", arb: "Arbitrum", sol: "Solana", eth: "Ethereum" }

/** Token units for "Send 150 USDC": whole numbers bare, else at least 2 decimals, trailing zeros trimmed past that. */
export function tokenAmount(m: Micro): string {
  const whole = m / 1_000_000n
  const frac = m % 1_000_000n
  if (frac === 0n) return whole.toLocaleString("en-US")
  let f = frac.toString().padStart(6, "0").replace(/0+$/, "")
  if (f.length < 2) f = f.padEnd(2, "0")
  return `${whole.toLocaleString("en-US")}.${f}`
}

export const usd = (m: Micro | string): string => formatUsd(typeof m === "string" ? BigInt(m) : m)
export const usdShort = (m: Micro | string): string => formatUsd(typeof m === "string" ? BigInt(m) : m, "whole")

/** "0x7a3F…91cE": the first and last 4 characters stay readable (design-direction 01 §4). */
export function shortAddress(a: string): { head: string; mid: string; tail: string } {
  if (a.length <= 14) return { head: a, mid: "", tail: "" }
  return { head: a.slice(0, 4), mid: "…", tail: a.slice(-4) }
}

/** Only https links go into an href (frontend-architecture §4.3 rev4). */
export const safeHref = (u: string | undefined): string | undefined => (u && /^https:\/\//.test(u) ? u : undefined)
