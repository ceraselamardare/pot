// Any-chain deposit wire shapes as the UI reads them (api-spec §2.7 + the additive fields statusBody returns).
import type { Api } from "@pot/sdk"

export type XcChain = Api.XcChain
export type DepositStatus = Api.DepositStatus
export type SimScenario = "ok" | "partial" | "no_liquidity" | "failed" | "slow" | "expired"

export interface ChainInfo {
  id: XcChain
  label: string
  status: "ok" | "paused" | "slower"
  minAmount: string
  typicalSeconds: number
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
  quote: QuoteNumbers
  depositAddress?: string
  depositMemo?: string
  deadline?: string
  qrText?: string
  correlationId?: string
}

export interface DepositView {
  mode: "real" | "simulated"
  id: string
  pot: string
  chain: XcChain
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
  simulated?: { sent: boolean }
  deadline: string
  updatedAt: string
  processingSince?: string
  addedRelayId?: string
  createdAt: string
}

export interface DepositApi {
  chains(): Promise<ChainsRes>
  quote(req: { pot: string; chain: XcChain; amount: string; dry?: boolean; idempotencyKey: string }): Promise<QuoteRes>
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
