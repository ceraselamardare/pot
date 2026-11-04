// 1Click constants (kb/intents-1click.md; api-spec §2.7, D-50). Pure data: no I/O, no secrets. The networks and coins
// Pot offers live in origins.ts (the curated config, 2026-11-04); this file keeps the API-wide constants and the
// per-network views older code reads.
import { XC_CHAINS, XC_CONFIG, type XcChain } from "./origins"

export { XC_CHAINS, type XcChain } from "./origins"
export type { XcCoin } from "./origins"

export const ONECLICK_URL = "https://1click.chaindefuser.com"
export const SHIELD_STATUS_URL = "https://partners.near-intents.org/api/shield/public/status"
/** 1Click's quote-signing key (SDK ≥ 0.1.24 default, kb §Quote response). */
export const ONECLICK_MANAGER_PK = "ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc"

/** USDC on NEAR mainnet (the 1Click destination asset). */
export const NEAR_USDC_ASSET = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"

const per = <T>(f: (id: XcChain) => T): Record<XcChain, T> => Object.fromEntries(XC_CHAINS.map((id) => [id, f(id)])) as Record<XcChain, T>

export const CHAIN_LABEL: Record<XcChain, string> = per((id) => XC_CONFIG[id].label)

/** Typical seconds, deposit mined → SUCCESS (measured p50 on Base/Arbitrum/Solana/Ethereum, estimated elsewhere). */
export const TYPICAL_SECONDS: Record<XcChain, number> = per((id) => XC_CONFIG[id].typicalSeconds)

/** The smallest amount offered per network, USD micro ($1 floor; Tron $100, Bitcoin $10, XRP / Zcash $5). */
export const MIN_AMOUNT: Record<XcChain, bigint> = per((id) => XC_CONFIG[id].minUsd)

/** The QR text of a simulated quote: deliberately not an address (kb "Testnet: simulated deposit"). */
export const SIM_QR_TEXT = "POT TESTNET DEMO - DO NOT SEND FUNDS"

/** request deadline = now + 2 h (D-50) */
export const DEADLINE_MS = 2 * 3600_000

export const TERMINAL = new Set<string>(["SUCCESS", "REFUNDED", "FAILED", "EXPIRED", "ADDED", "STUCK"])
export const OPEN_STATUSES = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "INCOMPLETE_DEPOSIT"] as const

/** D-50 stepper position for a status (1 waiting, 2 spotted, 3 converting, 4 arrived, 5 added). */
export function stepOf(status: string, reached: 1 | 2 | 3 | 4 | 5 = 1): 1 | 2 | 3 | 4 | 5 {
  switch (status) {
    case "PENDING_DEPOSIT":
    case "INCOMPLETE_DEPOSIT":
      return 1
    case "KNOWN_DEPOSIT_TX":
      return 2
    case "PROCESSING":
      return 3
    case "SUCCESS":
      return 4
    case "ADDED":
      return 5
    default:
      return reached
  }
}
