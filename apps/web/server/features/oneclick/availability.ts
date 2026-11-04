// Which curated origins (origins.ts) are offered right now, beyond Shield pauses:
//  - the catalogue: every curated asset must still be in 1Click's GET /v0/tokens with the same decimals (cached 1 h
//    by the client; when the list can't be read nothing is hidden: fail open, like Shield);
//  - quote errors: a "not available" / "Incorrect depositMode" answer hides that coin for 10 min, and a minimum
//    ("try at least N", "Temporary swap limits: minimum swap amount is $X") is remembered for 10 min so the pickers
//    can explain it ("From $100") instead of failing at [Get address].
// The memo is per server instance (no DB): it only saves people a failed tap, the quote itself stays the authority.
import type { TokenInfo } from "./client"
import { XC_CHAINS, XC_CONFIG, type XcChain, type XcCoin } from "./origins"

export const UNAVAILABLE_TTL_MS = 10 * 60_000

export type Unavailable = { kind: "paused"; why?: "unsupported" } | { kind: "min"; minUsd: bigint }

const key = (chain: XcChain, coin: XcCoin) => `${chain}:${coin}`

/** Curated `chain:coin` keys that 1Click's token list no longer has (or lists with other decimals). */
export function missingFromCatalogue(tokens: readonly TokenInfo[] | null | undefined): Set<string> {
  const missing = new Set<string>()
  if (!tokens || tokens.length === 0) return missing
  const byId = new Map(tokens.map((t) => [t.assetId, t]))
  for (const chain of XC_CHAINS)
    for (const a of XC_CONFIG[chain].assets) {
      const t = byId.get(a.assetId)
      if (!t || t.decimals !== a.decimals) missing.add(key(chain, a.coin))
    }
  return missing
}

/** The listed USD price of an asset, or null. */
export function listedPrice(tokens: readonly TokenInfo[] | null | undefined, assetId: string): number | null {
  const p = tokens?.find((t) => t.assetId === assetId)?.price
  return typeof p === "number" && p > 0 ? p : null
}

const memo = new Map<string, { until: number; state: Unavailable }>()

export function noteUnavailable(chain: XcChain, coin: XcCoin, state: Unavailable, nowMs: number): void {
  memo.set(key(chain, coin), { until: nowMs + UNAVAILABLE_TTL_MS, state })
}

export function unavailableNow(chain: XcChain, coin: XcCoin, nowMs: number): Unavailable | null {
  const k = key(chain, coin)
  const m = memo.get(k)
  if (!m) return null
  if (nowMs >= m.until) {
    memo.delete(k)
    return null
  }
  return m.state
}

export function resetAvailabilityForTests(): void {
  memo.clear()
}
