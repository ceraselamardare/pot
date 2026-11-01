// 1Click constants (kb/intents-1click.md, measured 2026-10-21; api-spec §2.7, D-50). Pure data: no I/O, no secrets.
// Origins are the four Pot chains only (Base, Arbitrum, Solana, Ethereum); every HOT-bridge chain has been
// paused since 2026-10-18. Asset ids are allow-listed (never filtered by symbol: look-alike tokens exist).
import type { Api } from "@pot/sdk"

export type XcChain = Api.XcChain
export const XC_CHAINS = ["base", "arb", "sol", "eth"] as const satisfies readonly XcChain[]

export const ONECLICK_URL = "https://1click.chaindefuser.com"
export const SHIELD_STATUS_URL = "https://partners.near-intents.org/api/shield/public/status"
/** 1Click's quote-signing key (SDK ≥ 0.1.24 default, kb §Quote response). */
export const ONECLICK_MANAGER_PK = "ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc"

/** USDC on NEAR mainnet (the 1Click destination asset). */
export const NEAR_USDC_ASSET = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"

export const ORIGIN_ASSET: Record<XcChain, string> = {
  base: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  arb: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  sol: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  eth: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
}

/** Shield `scopeValue` per chain (the incidents API uses these short ids). */
export const SHIELD_SCOPE: Record<XcChain, string> = { base: "base", arb: "arb", sol: "sol", eth: "eth" }

export const CHAIN_LABEL: Record<XcChain, string> = { base: "Base", arb: "Arbitrum", sol: "Solana", eth: "Ethereum" }

/** Measured p50, deposit mined → SUCCESS (n = 8 each). */
export const TYPICAL_SECONDS: Record<XcChain, number> = { arb: 18, base: 29, sol: 42, eth: 84 }

/** Measured minimums ("Amount is too low for bridge, try at least N"), in USDC base units. */
export const MIN_AMOUNT: Record<XcChain, bigint> = { base: 150_000n, arb: 10_000n, sol: 283_802n, eth: 300_001n }

/** Simulator profiles (api-spec §2.7): seconds PENDING_DEPOSIT after "send", then PROCESSING; ± 20 % jitter. */
export const SIM_PROFILE: Record<XcChain, { pendingSec: number; processingSec: number }> = {
  arb: { pendingSec: 6, processingSec: 12 },
  base: { pendingSec: 17, processingSec: 12 },
  sol: { pendingSec: 30, processingSec: 12 },
  eth: { pendingSec: 72, processingSec: 12 },
}

/** The QR text of a simulated quote: deliberately not an address (kb "Testnet: simulated deposit"). */
export const SIM_QR_TEXT = "POT TESTNET DEMO - DO NOT SEND FUNDS"

/** FLEX_INPUT at 100 bps: 150 accepts ≥ 148.50 (kb TL;DR 6). */
export const SLIPPAGE_BPS = 100
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
