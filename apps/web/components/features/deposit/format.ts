// Small formatting helpers for the deposit flow (xc.* copy may name the coin and the network, ux-spec §1.2).
import { formatUsd, type Micro } from "@/lib/client/money"
import { XC_CHAINS, XC_CONFIG, typicalMinutes } from "@/server/features/oneclick/origins"
import { coinOf, type DepositView, type XcChain } from "@/lib/deposit"

export const NETWORK: Record<XcChain, string> = Object.fromEntries(XC_CHAINS.map((id) => [id, XC_CONFIG[id].label])) as Record<XcChain, string>

/** Token units for "Send 150 USDC": whole numbers bare, else at least 2 decimals, trailing zeros trimmed past that. */
export function tokenAmount(m: Micro): string {
  const whole = m / 1_000_000n
  const frac = m % 1_000_000n
  if (frac === 0n) return whole.toLocaleString("en-US")
  let f = frac.toString().padStart(6, "0").replace(/0+$/, "")
  if (f.length < 2) f = f.padEnd(2, "0")
  return `${whole.toLocaleString("en-US")}.${f}`
}

/**
 * A coin amount in its own units: stablecoins like tokenAmount ("148.50"); other coins with the digits that matter,
 * trailing zeros trimmed ("0.008625", "208.5", "0.0002556"). `sig` rounds DOWN to that many significant digits
 * (for a minimum: never show more than is needed).
 */
export function coinAmount(units: bigint, decimals: number, stable = false, sig?: number): string {
  if (stable && decimals === 6) return tokenAmount(units)
  let u = units
  if (sig && u > 0n) {
    const len = u.toString().length
    if (len > sig) {
      const step = 10n ** BigInt(len - sig)
      u = (u / step) * step
    }
  }
  const scale = 10n ** BigInt(decimals)
  const whole = u / scale
  const frac = (u % scale).toString().padStart(decimals, "0").replace(/0+$/, "")
  const w = whole.toLocaleString("en-US")
  if (stable && frac.length < 2 && frac.length > 0) return `${w}.${frac.padEnd(2, "0")}`
  return frac ? `${w}.${frac}` : w
}

/** "0.008625 ETH" / "150 USDC": a deposit's coin amount with its symbol. */
export function coinText(d: Pick<DepositView, "coin" | "decimals" | "stable">, units: bigint, sig?: number): string {
  const c = coinOf(d)
  return `${coinAmount(units, c.decimals, c.stable, sig)} ${c.coin}`
}

/**
 * What a simulated send / top-up button names: dollars for a stablecoin ("$150", as before), the coin amount for a
 * coin whose price moves ("0.008625 ETH").
 */
export function sendText(d: Pick<DepositView, "coin" | "decimals" | "stable">, units: bigint): string {
  return coinOf(d).stable ? usdShort(units) : coinText(d, units)
}

export const usd = (m: Micro | string): string => formatUsd(typeof m === "string" ? BigInt(m) : m)
export const usdShort = (m: Micro | string): string => formatUsd(typeof m === "string" ? BigInt(m) : m, "whole")

/** The per-network minutes for "about {minutes} minutes" copy. */
export const minutesOf = (chain: XcChain): number => typicalMinutes(chain)

/** "0x7a3F…91cE": the first and last 4 characters stay readable (design-direction 01 §4). */
export function shortAddress(a: string): { head: string; mid: string; tail: string } {
  if (a.length <= 14) return { head: a, mid: "", tail: "" }
  return { head: a.slice(0, 4), mid: "…", tail: a.slice(-4) }
}

/** Only https links go into an href (frontend-architecture §4.3 rev4). */
export const safeHref = (u: string | undefined): string | undefined => (u && /^https:\/\//.test(u) ? u : undefined)
