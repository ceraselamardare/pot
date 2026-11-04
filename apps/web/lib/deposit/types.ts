// Any-chain deposit wire shapes as the UI reads them (api-spec §2.7 + the additive fields statusBody returns).
import type { Api } from "@pot/sdk"

export type XcChain = Api.XcChain
export type XcCoin = Api.XcCoin
export type XcSpeed = Api.XcSpeed
export type DepositStatus = Api.DepositStatus
export type SimScenario = "ok" | "partial" | "no_liquidity" | "failed" | "slow" | "expired"

export interface CoinInfo {
  coin: XcCoin
  name: string
  stable: boolean
  decimals: number
  status: "ok" | "unavailable"
  /** USD micro */
  minAmount: string
}

export interface ChainInfo {
  id: XcChain
  label: string
  status: "ok" | "paused" | "slower"
  speed: XcSpeed
  /** USD micro: the smallest amount offered on this network right now */
  minAmount: string
  typicalSeconds: number
  coins: CoinInfo[]
}

export interface ChainsRes {
  mode: "real" | "simulated"
  chains: ChainInfo[]
}

export interface QuoteNumbers {
  amountIn: string
  minAmountIn: string
  amountOut: string
  minAmountOut: string
  timeEstimateSec: number
  refundFee: string
  withdrawFee: string
}

export interface QuoteRes {
  mode: "real" | "simulated"
  depositIntentId?: string
  coin?: XcCoin
  decimals?: number
  stable?: boolean
  usdTarget?: string
  quote: QuoteNumbers
  depositAddress?: string
  depositMemo?: string
  deadline?: string
  qrText?: string
  correlationId?: string
}

/** The coin step's live dry quote (POST /api/oneclick/price). */
export interface PriceRes {
  mode: "real" | "simulated"
  chain: XcChain
  coin: XcCoin
  decimals: number
  stable: boolean
  /** USD micro asked for */
  usdTarget: string
  slippageBps: number
  /** amountIn / minAmountIn in the coin's base units; amountOut USD micro */
  quote: QuoteNumbers
  quotedAt: string
  correlationId?: string
}

export interface DepositView {
  mode: "real" | "simulated"
  id: string
  pot: string
  chain: XcChain
  /** the coin sent (absent on rows from before any-coin: USDC) */
  coin?: XcCoin
  decimals?: number
  stable?: boolean
  /** what the person asked to add, USD micro (absent: = amountIn, a USDC deposit) */
  usdTarget?: string
  status: DepositStatus
  step: 1 | 2 | 3 | 4 | 5
  amountIn: string
  minAmountIn: string
  amountOutQuoted?: string
  depositedAmount?: string
  amountOut?: string
  refundedAmount?: string
  refundReason?: string | null
  destinationTxHash?: string
  explorerUrl?: string
  depositAddress: string
  depositMemo?: string
  qrText: string
  correlationId?: string
  scenario?: SimScenario
  /** simulator: whether anything was "sent", and how much in total (detected or still on its way), base units */
  simulated?: { sent: boolean; sentAmount?: string }
  deadline: string
  updatedAt: string
  processingSince?: string
  addedRelayId?: string
  createdAt: string
}

export interface DepositApi {
  chains(): Promise<ChainsRes>
  /** amount = USD micro to add; amountIn etc. in the answer are the coin's base units */
  quote(req: { pot: string; chain: XcChain; coin?: XcCoin; amount: string; dry?: boolean; idempotencyKey: string }): Promise<QuoteRes>
  price(req: { chain: XcChain; coin: XcCoin; amount: string }): Promise<PriceRes>
  status(id: string, relayId?: string): Promise<DepositView>
  list(pot: string): Promise<{ deposits: DepositView[] }>
  simulate(req: { depositIntentId: string; scenario?: SimScenario; amount?: string; idempotencyKey: string }): Promise<{ startedAt: string; profile: { pendingSec: number; processingSec: number } }>
}

export const TERMINAL: ReadonlySet<DepositStatus> = new Set(["SUCCESS", "REFUNDED", "FAILED", "EXPIRED", "ADDED", "STUCK"])
/** still moving on its own (the client keeps polling) */
export const isMoving = (d: DepositView): boolean => !TERMINAL.has(d.status)
/** "Taking longer than usual" 5 min into converting (D-50) */
export const SLOW_AFTER_MS = 5 * 60_000
export const isSlow = (d: DepositView, now: number): boolean =>
  d.status === "PROCESSING" && !!d.processingSince && now - Date.parse(d.processingSince) >= SLOW_AFTER_MS

/** A deposit's coin (rows from before any-coin are USDC, 6 decimals, 1:1). */
export const coinOf = (d: Pick<DepositView, "coin" | "decimals" | "stable">): { coin: XcCoin; decimals: number; stable: boolean } => ({
  coin: d.coin ?? "USDC",
  decimals: d.decimals ?? 6,
  stable: d.stable ?? true,
})

/** The dollars the person asked to add (USD micro). */
export const usdTargetOf = (d: Pick<DepositView, "usdTarget" | "amountIn">): bigint => BigInt(d.usdTarget ?? d.amountIn)
