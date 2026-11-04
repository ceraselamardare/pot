// Money-in details (2026-11-04): pure rules shared by the API (server/features/deposits.ts), the mock world and the
// sheet. No I/O.
//  - depositKeyKind: a money-in row's key is its NEAR transaction hash (a member's add) or a pay-in's ref.
//  - originTxUrl / intentsExplorerUrl: receipts on the network the money left from, real transfers only (a testnet
//    demo transfer is simulated and has none).
//  - xcTimeline: the five moments of an add from another app, from what a deposit record knows.
//  - topupFor: the top-up ask an add counted toward (the asks' own rule: every add after the ask by someone it asked).
import { GIFT_REF_RE } from "./gifts"
import { XC_MOMENTS, type XcMoment } from "./deposits-api"

const BASE58_32 = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/

/** What a money-in key names: a contribution's transaction ("tx"), a pay-in ("payin"), or nothing we know. */
export function depositKeyKind(key: string | null | undefined): "tx" | "payin" | null {
  if (typeof key !== "string") return null
  if (GIFT_REF_RE.test(key)) return "payin"
  if (BASE58_32.test(key)) return "tx"
  return null
}

/** Each origin network's public explorer page for a transaction (mainnet; 1Click's own explorerUrl is always ""). */
const ORIGIN_EXPLORER: Record<string, (h: string) => string> = {
  base: (h) => `https://basescan.org/tx/${h}`,
  arb: (h) => `https://arbiscan.io/tx/${h}`,
  eth: (h) => `https://etherscan.io/tx/${h}`,
  op: (h) => `https://optimistic.etherscan.io/tx/${h}`,
  pol: (h) => `https://polygonscan.com/tx/${h}`,
  avax: (h) => `https://snowtrace.io/tx/${h}`,
  sol: (h) => `https://solscan.io/tx/${h}`,
  sui: (h) => `https://suiscan.xyz/mainnet/tx/${h}`,
  aptos: (h) => `https://explorer.aptoslabs.com/txn/${h}?network=mainnet`,
  ton: (h) => `https://tonviewer.com/transaction/${h}`,
  tron: (h) => `https://tronscan.org/#/transaction/${h}`,
  xrp: (h) => `https://livenet.xrpl.org/transactions/${h}`,
  btc: (h) => `https://mempool.space/tx/${h}`,
  doge: (h) => `https://blockchair.com/dogecoin/transaction/${h}`,
  zec: (h) => `https://blockchair.com/zcash/transaction/${h}`,
}

/** A transaction id as the origin networks write them (hex, base58, base64url): nothing that could break out of a URL. */
const ORIGIN_HASH = /^(0x)?[A-Za-z0-9_-]{16,128}$/

/** The origin network's explorer page for a real transfer's transaction, or null (unknown network or odd hash). */
export function originTxUrl(chain: string, hash: string | null | undefined): string | null {
  if (!hash || !ORIGIN_HASH.test(hash)) return null
  const f = ORIGIN_EXPLORER[chain]
  return f ? f(encodeURIComponent(hash)) : null
}

/** NEAR Intents' explorer page for a transfer, by its 1Click deposit address (kb/intents-1click.md "Receipt link"). */
export function intentsExplorerUrl(depositAddress: string): string {
  return `https://explorer.near-intents.org/transactions/${encodeURIComponent(depositAddress)}`
}

/** The moments of an add from another app (ms; undefined = not known). Anything after a missing one stays as given. */
export function xcTimeline(m: Partial<Record<XcMoment, number | null | undefined>>): { step: XcMoment; at: number | null }[] {
  return XC_MOMENTS.map((step) => ({ step, at: typeof m[step] === "number" && Number.isFinite(m[step]) ? (m[step] as number) : null }))
}

/** How long the money took to come across: from sent to arrived (ms), or null without both. */
export function xcTook(timeline: readonly { step: XcMoment; at: number | null }[]): number | null {
  const at = (s: XcMoment) => timeline.find((x) => x.step === s)?.at ?? null
  const from = at("sent") ?? at("address")
  const to = at("arrived") ?? at("added")
  return from !== null && to !== null && to >= from ? to - from : null
}

export interface TopupAsk {
  id: string
  by: string
  createdAt: number
  /** when it was cancelled / closed (done or due), if it was */
  endedAt: number | null
  dueAt: number
  /** who it asked */
  asked: readonly string[]
}

/**
 * The ask an add counted toward: the newest ask that was open when the money came in (made before it, not yet ended,
 * not past its date) and that asked this person. Progress counts every add after an ask (lib/topups.ts), so an add
 * from the hero counts as much as one from the ask's own [Add $50].
 */
export function topupFor<T extends TopupAsk>(asks: readonly T[], who: string, at: number): T | null {
  let best: T | null = null
  for (const a of asks) {
    if (a.createdAt > at) continue
    if (a.endedAt !== null && a.endedAt < at) continue
    if (a.dueAt < at) continue
    if (!a.asked.includes(who)) continue
    if (!best || a.createdAt > best.createdAt) best = a
  }
  return best
}

/** "About $2,318.84 per ETH": the dollars one whole coin brought (USD micro), or null for a stablecoin / unknown. */
export function perCoinUsd(o: { sent: bigint | null; arrived: bigint | null; decimals: number; stable: boolean }): bigint | null {
  if (o.stable || o.sent === null || o.arrived === null || o.sent <= 0n) return null
  return (o.arrived * 10n ** BigInt(o.decimals)) / o.sent
}
