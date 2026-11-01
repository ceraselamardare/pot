// Proposal expiry (kb/sputnik-dao.md R7, test U-05). Sputnik expiry is lazy: an InProgress
// proposal past `submission_time + proposal_period` is effectively expired even though the DAO
// still says InProgress, so the UI derives it.

import type { ProposalStatus } from "../types/dao.ts"

const NS_PER_MS = 1_000_000n

/** ms timestamp at which a proposal expires (submission_time + proposal_period). */
export function expiresAtMs(submissionTimeNs: bigint, proposalPeriodNs: bigint): number {
  return Number((submissionTimeNs + proposalPeriodNs) / NS_PER_MS)
}

/** ms left until expiry (≤ 0 when expired). */
export function msUntilExpiry(submissionTimeNs: bigint, proposalPeriodNs: bigint, nowMs: number): number {
  return expiresAtMs(submissionTimeNs, proposalPeriodNs) - nowMs
}

/** Sputnik's own rule: expired when submission + period < now (strict). */
export function isExpired(submissionTimeNs: bigint, proposalPeriodNs: bigint, nowMs: number): boolean {
  return submissionTimeNs + proposalPeriodNs < BigInt(nowMs) * NS_PER_MS
}

/** The status to show: InProgress past its period reads as Expired. */
export function effectiveStatus(status: ProposalStatus, submissionTimeNs: bigint, proposalPeriodNs: bigint, nowMs: number): ProposalStatus {
  return status === "InProgress" && isExpired(submissionTimeNs, proposalPeriodNs, nowMs) ? "Expired" : status
}
