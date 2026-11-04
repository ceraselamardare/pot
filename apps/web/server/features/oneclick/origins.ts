// The curated "Add from another app or exchange" origins (kb/intents-1click.md, measured 2026-11-04): which networks
// and which coins on each one Pot offers, with per-network speed, minimums and simulator timing. Pure data + helpers,
// no I/O and no `server-only`: the browser mock (lib/deposit/mock.ts) and the UI read it too.
//
// Rules for this list (kb "Asset ids", "Gotchas"):
//  - asset ids are allow-listed here and NEVER matched by symbol (look-alike tokens such as sUSDC exist);
//  - the server checks the list against 1Click's GET /v0/tokens (cached 1 h) and hides an asset that disappears or
//    whose decimals changed; quote errors mark an asset "temporarily unavailable" for 10 min (availability.ts);
//  - left out on purpose: BSC (1Click: "Temporary swap limits: minimum swap amount is $1,000", above our $500 cap),
//    Stellar ("Incorrect depositMode": it needs MEMO deposits), and every look-alike or vault token.
// Stablecoins (USDC/USDT, all 6 decimals here) keep the original 1:1 behaviour: FLEX_INPUT at 100 bps. Other coins use
// FLEX_INPUT at 300 bps with an amount from an EXACT_OUTPUT probe (see coinAmountFor / kb "Any coin").

export const XC_CHAINS = ["base", "arb", "sol", "eth", "pol", "op", "avax", "sui", "aptos", "ton", "tron", "xrp", "btc", "doge", "zec"] as const
export type XcChain = (typeof XC_CHAINS)[number]

export const XC_COINS = ["USDC", "USDT", "ETH", "SOL", "POL", "AVAX", "SUI", "APT", "TON", "XRP", "BTC", "DOGE", "ZEC"] as const
export type XcCoin = (typeof XC_COINS)[number]

/** How long a transfer usually takes once it's sent: under a minute · 1-3 minutes · longer (flagged in the UI). */
export type XcSpeed = "fast" | "slower" | "slow"

export interface XcAsset {
  coin: XcCoin
  /** the 1Click asset id (allow-listed) */
  assetId: string
  decimals: number
  /** the symbol GET /v0/tokens lists it under (checked with the decimals; TON's native coin is listed as GRAM) */
  listedAs: string
  stable: boolean
  /** USD price on 2026-11-04 (GET /v0/tokens): only for the browser mock and when 1Click can't be reached */
  refUsd: number
}

export interface XcChainConfig {
  id: XcChain
  label: string
  /** the Shield incident `scopeValue` for this chain (= 1Click's `blockchain`) */
  shield: string
  /** HOT-bridge chains also pause with a `hot` incident */
  bridge?: "hot"
  speed: XcSpeed
  /** seconds from the send being mined to the money arriving: measured p50 (n = 8) or ~1.5 × 1Click's timeEstimate */
  typicalSeconds: number
  measured: boolean
  /** 1Click's quote `timeEstimate` (s), 2026-11-04 */
  quoteEstimate: number
  /** the smallest amount we offer, USD micro (1Click minimums with headroom; $1 is the global floor) */
  minUsd: bigint
  /** in the order the coin step lists them: stablecoins first, then the network's own coin */
  assets: readonly XcAsset[]
}

const USD = 1_000_000n

const stable = (coin: "USDC" | "USDT", assetId: string): XcAsset => ({ coin, assetId, decimals: 6, listedAs: coin, stable: true, refUsd: 1 })
const coin = (coin: XcCoin, assetId: string, decimals: number, refUsd: number, listedAs: string = coin): XcAsset => ({
  coin,
  assetId,
  decimals,
  listedAs,
  stable: false,
  refUsd,
})

const ETH_USD = 2324.78

export const XC_CONFIG: Record<XcChain, XcChainConfig> = {
  base: {
    id: "base",
    label: "Base",
    shield: "base",
    speed: "fast",
    typicalSeconds: 29,
    measured: true,
    quoteEstimate: 35,
    minUsd: USD,
    assets: [stable("USDC", "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near"), coin("ETH", "nep141:base.omft.near", 18, ETH_USD)],
  },
  arb: {
    id: "arb",
    label: "Arbitrum",
    shield: "arb",
    speed: "fast",
    typicalSeconds: 18,
    measured: true,
    quoteEstimate: 25,
    minUsd: USD,
    assets: [stable("USDC", "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near"), coin("ETH", "nep141:arb.omft.near", 18, ETH_USD)],
  },
  sol: {
    id: "sol",
    label: "Solana",
    shield: "sol",
    speed: "fast",
    typicalSeconds: 42,
    measured: true,
    quoteEstimate: 20,
    minUsd: USD,
    assets: [
      stable("USDC", "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near"),
      stable("USDT", "nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near"),
      coin("SOL", "nep141:sol.omft.near", 9, 93.42),
    ],
  },
  eth: {
    id: "eth",
    label: "Ethereum",
    shield: "eth",
    speed: "slower",
    typicalSeconds: 84,
    measured: true,
    quoteEstimate: 45,
    minUsd: USD,
    assets: [
      stable("USDC", "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near"),
      stable("USDT", "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near"),
      coin("ETH", "nep141:eth.omft.near", 18, ETH_USD),
    ],
  },
  pol: {
    id: "pol",
    label: "Polygon",
    shield: "pol",
    bridge: "hot",
    speed: "fast",
    typicalSeconds: 50,
    measured: false,
    quoteEstimate: 35,
    minUsd: USD,
    assets: [
      stable("USDC", "nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L"),
      stable("USDT", "nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr"),
      coin("POL", "nep245:v2_1.omni.hot.tg:137_11111111111111111111", 18, 0.096151),
    ],
  },
  op: {
    id: "op",
    label: "Optimism",
    shield: "op",
    bridge: "hot",
    speed: "fast",
    typicalSeconds: 50,
    measured: false,
    quoteEstimate: 35,
    minUsd: USD,
    assets: [
      stable("USDC", "nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ"),
      stable("USDT", "nep245:v2_1.omni.hot.tg:10_359RPSJVdTxwTJT9TyGssr2rFoWo"),
      coin("ETH", "nep245:v2_1.omni.hot.tg:10_11111111111111111111", 18, ETH_USD),
    ],
  },
  avax: {
    id: "avax",
    label: "Avalanche",
    shield: "avax",
    bridge: "hot",
    speed: "fast",
    typicalSeconds: 50,
    measured: false,
    quoteEstimate: 35,
    minUsd: USD,
    assets: [
      stable("USDC", "nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o"),
      stable("USDT", "nep245:v2_1.omni.hot.tg:43114_372BeH7ENZieCaabwkbWkBiTTgXp"),
      coin("AVAX", "nep245:v2_1.omni.hot.tg:43114_11111111111111111111", 18, 8.69),
    ],
  },
  sui: {
    id: "sui",
    label: "Sui",
    shield: "sui",
    speed: "fast",
    typicalSeconds: 40,
    measured: false,
    quoteEstimate: 25,
    minUsd: USD,
    assets: [stable("USDC", "nep141:sui-c1b81ecaf27933252d31a963bc5e9458f13c18ce.omft.near"), coin("SUI", "nep141:sui.omft.near", 9, 0.914066)],
  },
  aptos: {
    id: "aptos",
    label: "Aptos",
    shield: "aptos",
    speed: "fast",
    typicalSeconds: 40,
    measured: false,
    quoteEstimate: 25,
    minUsd: USD,
    assets: [
      stable("USDC", "nep141:aptos-34ee497f210c5a511e8d5b53bc56d75b63612bb5.omft.near"),
      stable("USDT", "nep141:aptos-88cb7619440a914fe6400149a12b443c3ac21d59.omft.near"),
      coin("APT", "nep141:aptos.omft.near", 8, 0.637112),
    ],
  },
  ton: {
    id: "ton",
    label: "TON",
    shield: "ton",
    bridge: "hot",
    speed: "slower",
    typicalSeconds: 100,
    measured: false,
    quoteEstimate: 65,
    minUsd: USD,
    assets: [
      stable("USDT", "nep245:v2_1.omni.hot.tg:1117_3tsdfyziyc7EJbP2aULWSKU4toBaAcN4FdTgfm5W1mC4ouR"),
      coin("TON", "nep245:v2_1.omni.hot.tg:1117_", 9, 1.19, "GRAM"),
    ],
  },
  tron: {
    id: "tron",
    label: "Tron",
    shield: "tron",
    speed: "slower",
    typicalSeconds: 120,
    measured: false,
    quoteEstimate: 80,
    // 1Click: "Temporary swap limits: minimum swap amount is $100" (changelog 2026-09-14, still on 2026-11-04), checked on
    // the USD value sent: 100 USDT (= $99.88) is refused, 100.50 USDT accepted. Offered from $101.
    minUsd: 101n * USD,
    assets: [stable("USDT", "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near")],
  },
  xrp: {
    id: "xrp",
    label: "XRP Ledger",
    shield: "xrp",
    speed: "fast",
    typicalSeconds: 40,
    measured: false,
    quoteEstimate: 27,
    // "try at least 2000000" (2 XRP ≈ $2.58)
    minUsd: 5n * USD,
    assets: [coin("XRP", "nep141:xrp.omft.near", 6, 1.29)],
  },
  btc: {
    id: "btc",
    label: "Bitcoin",
    shield: "btc",
    speed: "slow",
    typicalSeconds: 20 * 60,
    measured: false,
    quoteEstimate: 805,
    // "try at least 6400" (6,400 sats ≈ $5.02)
    minUsd: 10n * USD,
    assets: [coin("BTC", "nep141:btc.omft.near", 8, 78_490)],
  },
  doge: {
    id: "doge",
    label: "Dogecoin",
    shield: "doge",
    speed: "slow",
    typicalSeconds: 3 * 60,
    measured: false,
    quoteEstimate: 127,
    minUsd: USD,
    assets: [coin("DOGE", "nep141:doge.omft.near", 8, 0.075161)],
  },
  zec: {
    id: "zec",
    label: "Zcash",
    shield: "zec",
    speed: "slow",
    typicalSeconds: 11 * 60,
    measured: false,
    quoteEstimate: 455,
    // "try at least 100000" (0.001 ZEC ≈ $1.32)
    minUsd: 5n * USD,
    assets: [coin("ZEC", "nep141:zec.omft.near", 8, 1315.82)],
  },
}

/** Display names for the coin step ("ETH · Ether"). */
export const COIN_NAME: Record<XcCoin, string> = {
  USDC: "USD Coin",
  USDT: "Tether",
  ETH: "Ether",
  SOL: "Solana",
  POL: "Polygon",
  AVAX: "Avalanche",
  SUI: "Sui",
  APT: "Aptos",
  TON: "Toncoin",
  XRP: "XRP",
  BTC: "Bitcoin",
  DOGE: "Dogecoin",
  ZEC: "Zcash",
}

export const isXcChain = (v: unknown): v is XcChain => typeof v === "string" && (XC_CHAINS as readonly string[]).includes(v)
export const isXcCoin = (v: unknown): v is XcCoin => typeof v === "string" && (XC_COINS as readonly string[]).includes(v)

/** The asset for (chain, coin), or null when that network doesn't offer that coin. */
export function assetOf(chain: XcChain, c: XcCoin): XcAsset | null {
  return XC_CONFIG[chain].assets.find((a) => a.coin === c) ?? null
}

/** The coin a request means when it names none: USDC where offered (the original behaviour), else the first. */
export function defaultCoin(chain: XcChain): XcCoin {
  const as = XC_CONFIG[chain].assets
  return (as.find((a) => a.coin === "USDC") ?? as[0]!).coin
}

/** FLEX_INPUT tolerance: 100 bps for stablecoins (kb TL;DR 6), 300 bps for coins whose price moves (see kb "Any coin"). */
export const slippageFor = (a: Pick<XcAsset, "stable">): number => (a.stable ? 100 : 300)

/** Round a base-unit amount UP to `digits` significant digits (people type "0.008638 ETH", not 18 decimals). */
export function roundUpSig(units: bigint, digits = 4): bigint {
  if (units <= 0n) return units
  const len = units.toString().length
  if (len <= digits) return units
  const step = 10n ** BigInt(len - digits)
  return ((units + step - 1n) / step) * step
}

/** USD micro → stablecoin base units (1:1 by value; every curated stablecoin has 6 decimals, kept general). */
export function stableUnits(usd: bigint, decimals: number): bigint {
  return decimals >= 6 ? usd * 10n ** BigInt(decimals - 6) : usd / 10n ** BigInt(6 - decimals)
}

/**
 * Offline coin amount for `usd` at `price` (the browser mock and the unreachable-1Click fallback): the 1Click fee seen
 * on coin → USDC quotes (20 bps) + a little spread, rounded up to 4 significant digits.
 */
export function offlineCoinAmount(usd: bigint, a: Pick<XcAsset, "decimals">, price: number): bigint {
  if (!(price > 0)) return 0n
  // units = usd / 1e6 / price × 10^dec × 1.0025, in integers (price to 1e-8)
  const p = BigInt(Math.round(price * 1e8))
  const raw = (usd * 10n ** BigInt(a.decimals) * 100_000_000n * 10_025n) / (1_000_000n * p * 10_000n)
  return roundUpSig(raw + 1n)
}

/** What `units` of a coin are worth at `price`, USD micro, after the same 25 bps (rounded down). */
export function offlineUsdOut(units: bigint, a: Pick<XcAsset, "decimals">, price: number): bigint {
  const p = BigInt(Math.round(price * 1e8))
  return (units * p * 1_000_000n * 10_000n) / (10n ** BigInt(a.decimals) * 100_000_000n * 10_025n)
}

/** Simulator timing: the chain's typical time, PENDING (origin confirmation) then ~12 s PROCESSING, capped for demos. */
export const SIM_MAX_SECONDS = 30
const SIM_PROCESSING_SEC = 12

export function simBaseProfile(chain: XcChain): { pendingSec: number; processingSec: number } {
  const c = XC_CONFIG[chain]
  // the four measured chains keep their measured split (api-spec §2.7: Arbitrum 6 + 12, Base 17 + 12)
  const pending = Math.max(3, c.typicalSeconds - SIM_PROCESSING_SEC)
  return { pendingSec: pending, processingSec: SIM_PROCESSING_SEC }
}

/** Whether the demo runs faster than the real network would (the UI says so). */
export const simIsSpedUp = (chain: XcChain): boolean => XC_CONFIG[chain].typicalSeconds > SIM_MAX_SECONDS

/** Minutes for copy ("about 20 minutes"), at least 1. */
export const typicalMinutes = (chain: XcChain): number => Math.max(1, Math.round(XC_CONFIG[chain].typicalSeconds / 60))

/** Quote numbers without 1Click for a coin whose price moves (FLEX at 300 bps). Origin amounts in base units, out in USD micro. */
export function offlineCoinNumbers(chain: XcChain, a: XcAsset, usd: bigint, price = a.refUsd) {
  const amountIn = offlineCoinAmount(usd, a, price)
  const out = offlineUsdOut(amountIn, a, price)
  const keep = BigInt(10_000 - slippageFor(a))
  return {
    amountIn: amountIn.toString(),
    minAmountIn: ((amountIn * keep) / 10_000n).toString(),
    amountOut: out.toString(),
    minAmountOut: ((out * keep) / 10_000n).toString(),
    timeEstimateSec: XC_CONFIG[chain].typicalSeconds,
    refundFee: "0",
    withdrawFee: "0",
  }
}
