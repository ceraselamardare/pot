// The testnet 1Click simulator (kb/intents-1click.md "Testnet: simulated deposit"; api-spec §2.7, rev4 H-3).
// There is no 1Click testnet, so a simulated deposit answers with the SAME status shapes, driven by server
// time since "Simulate sending" and the measured chain profile (± 20 % jitter, deterministic per deposit).
// Pure: no I/O. The service delivers real "USDC (test)" from the treasury once this reaches SUCCESS.
import { SIM_PROFILE, type XcChain } from "./assets"

export const SIM_SCENARIOS = ["ok", "partial", "no_liquidity", "failed", "slow", "expired"] as const
export type SimScenario = (typeof SIM_SCENARIOS)[number]

export interface SimSend {
  /** Unix ms */
  at: number
  /** what "arrived", base units */
  amount: string
}

/** Kept in deposit_intent.quote.__sim (the simulated quote record). */
export interface SimState {
  scenario: SimScenario
  sends: SimSend[]
  /** jitter factor in [0.8, 1.2], fixed per deposit */
  jitter: number
  /** the shortened request deadline of `partial` / `expired` (ms) */
  deadlineMs?: number
}

export interface SimView {
  status: "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED" | "EXPIRED"
  depositedAmount?: bigint
  amountOut?: bigint
  refundedAmount?: bigint
  refundReason?: string | null
  /** when PROCESSING started (ms), for "Taking longer" */
  processingSince?: number
  /** when the status last changed (ms) */
  updatedAt: number
}

/** 1 bp platform fee on USDC → USDC (measured), rounded down. */
export const simAmountOut = (amount: bigint, withdrawFee = 0n): bigint => {
  const out = amount - (amount + 9_999n) / 10_000n - withdrawFee
  return out > 0n ? out : 0n
}

/** Deterministic jitter in [0.8, 1.2] from the deposit id. */
export function jitterFor(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  return 0.8 + (h % 4001) / 10_000
}

export const SLOW_PROCESSING_SEC = 6 * 60
const PARTIAL_GRACE_SEC = 60
const REFUND_LAG_SEC = 10

export function simProfile(chain: XcChain, jitter: number): { pendingSec: number; processingSec: number } {
  const p = SIM_PROFILE[chain]
  return { pendingSec: Math.round(p.pendingSec * jitter), processingSec: Math.round(p.processingSec * jitter) }
}

/**
 * The status at `nowMs`. `required` = minAmountIn (FLEX_INPUT accepts ≥ it); `deadlineMs` = the request deadline.
 * Timeline after the first send: PENDING_DEPOSIT (origin confirmation) → KNOWN_DEPOSIT_TX for the last 40 % of that
 * wait → PROCESSING → SUCCESS, or the scenario's failure.
 */
export function simStatus(
  sim: SimState | null,
  o: { chain: XcChain; required: bigint; quoted: bigint; deadlineMs: number; withdrawFee?: bigint; createdAt: number },
  nowMs: number,
): SimView {
  const deadline = sim?.deadlineMs ?? o.deadlineMs
  if (!sim || sim.sends.length === 0) {
    if (nowMs >= deadline) return { status: "EXPIRED", updatedAt: deadline }
    return { status: "PENDING_DEPOSIT", updatedAt: o.createdAt }
  }
  const { pendingSec, processingSec } = simProfile(o.chain, sim.jitter)
  const first = sim.sends[0]!
  const detectedAt = first.at + pendingSec * 1000
  const spottedAt = first.at + Math.round(pendingSec * 600)
  if (nowMs < spottedAt) return { status: "PENDING_DEPOSIT", updatedAt: first.at }
  if (nowMs < detectedAt) return { status: "KNOWN_DEPOSIT_TX", updatedAt: spottedAt }

  // what arrived, counting top-ups that were themselves detected by now
  const arrived = sim.sends.filter((s) => s.at + pendingSec * 1000 <= nowMs || s === first).reduce((a, s) => a + BigInt(s.amount), 0n)
  const enough = arrived >= o.required

  if (sim.scenario === "partial" && !enough) {
    // the rest sent before the deadline still counts once it's detected (like 1Click): no refund meanwhile
    const sentInTime = sentBy(sim, deadline)
    if (nowMs >= deadline + REFUND_LAG_SEC * 1000 && sentInTime < o.required)
      return { status: "REFUNDED", depositedAmount: arrived, refundedAmount: arrived, refundReason: "PARTIAL_DEPOSIT", updatedAt: deadline + REFUND_LAG_SEC * 1000 }
    return { status: "INCOMPLETE_DEPOSIT", depositedAmount: arrived, updatedAt: detectedAt }
  }

  // PROCESSING starts once enough has been detected (a partial that was topped up starts at the top-up's detection)
  let processingAt = detectedAt
  if (sim.scenario === "partial") {
    let sum = 0n
    for (const s of sim.sends) {
      sum += BigInt(s.amount)
      if (sum >= o.required) {
        processingAt = Math.max(detectedAt, s.at + pendingSec * 1000)
        break
      }
    }
  }
  const processingFor =
    sim.scenario === "slow" ? SLOW_PROCESSING_SEC : sim.scenario === "no_liquidity" ? 20 : sim.scenario === "failed" ? 30 : processingSec
  const doneAt = processingAt + processingFor * 1000
  if (nowMs < doneAt) return { status: "PROCESSING", depositedAmount: arrived, processingSince: processingAt, updatedAt: processingAt }
  if (sim.scenario === "no_liquidity")
    return { status: "REFUNDED", depositedAmount: arrived, refundedAmount: arrived, refundReason: "NO_LIQUIDITY", updatedAt: doneAt }
  if (sim.scenario === "failed") return { status: "FAILED", depositedAmount: arrived, refundedAmount: 0n, refundReason: null, updatedAt: doneAt }
  return { status: "SUCCESS", depositedAmount: arrived, amountOut: simAmountOut(arrived, o.withdrawFee ?? 0n), updatedAt: doneAt }
}

/** Everything "sent" so far (detected or not), base units. */
export const simSent = (sim: Pick<SimState, "sends"> | null | undefined): bigint => (sim?.sends ?? []).reduce((a, s) => a + BigInt(s.amount), 0n)

/** What was sent before `atMs` (a send at the deadline itself is late). */
const sentBy = (sim: SimState, atMs: number): bigint => sim.sends.filter((s) => s.at < atMs).reduce((a, s) => a + BigInt(s.amount), 0n)

export type SimSendPlan =
  /** send this much now (a first send, or the missing part of a partial one) */
  | { kind: "send"; amount: bigint }
  /** a top-up whose rest was already sent and is waiting to be detected: answer as done, send nothing */
  | { kind: "already_sent" }
  | { kind: "refused"; why: "already_sent" | "too_late" | "amount_too_high"; maximum?: bigint }

/**
 * What one "Simulate sending" tap does (server and browser mock alike). A partial deposit can be topped up, but only
 * with what is still missing (`required − everything sent`, not what has been detected), only before its deadline,
 * and a second tap while the first top-up is still on its way is the same top-up (a no-op), never a refusal.
 */
export function planSimSend(
  sim: SimState | null,
  o: { status: string; scenario: SimScenario; required: bigint; quoted: bigint; cap: bigint; deadlineMs: number; amount?: bigint },
  nowMs: number,
): SimSendPlan {
  const sent = simSent(sim)
  if (sim && sim.sends.length > 0) {
    if (o.scenario !== "partial" || o.status !== "INCOMPLETE_DEPOSIT") return { kind: "refused", why: "already_sent" }
    const missing = o.required - sent
    if (missing <= 0n) return { kind: "already_sent" }
    if (nowMs >= o.deadlineMs) return { kind: "refused", why: "too_late" }
    // the caller's amount is what the screen thought was missing (it only counts what was detected): never more
    const amount = o.amount !== undefined && o.amount < missing ? o.amount : missing
    if (amount <= 0n) return { kind: "refused", why: "amount_too_high", maximum: o.cap - sent }
    return { kind: "send", amount: sent + amount > o.cap ? o.cap - sent : amount }
  }
  const amount = o.amount !== undefined ? o.amount : o.scenario === "expired" ? 0n : o.scenario === "partial" ? (o.quoted * 8n) / 10n : o.quoted
  if (amount < 0n || amount > o.cap) return { kind: "refused", why: "amount_too_high", maximum: o.cap }
  return { kind: "send", amount }
}

/** A short deadline for scenarios that end at the deadline (`partial`, `expired`): send time + profile + 60 s. */
export function shortenedDeadline(chain: XcChain, jitter: number, fromMs: number): number {
  const { pendingSec } = simProfile(chain, jitter)
  return fromMs + (pendingSec + PARTIAL_GRACE_SEC) * 1000
}
