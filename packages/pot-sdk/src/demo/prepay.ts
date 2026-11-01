// TS twin of the hub's per-proposal storage prepay (contracts/pot-hub/src/lib.rs `prepay_bytes`,
// `bytes_cost`, `spend_prepay`, `close_prepay_upper_bound`; contracts-spec §3.11). MockChain does
// not model NEAR, so the demo dataset computes the Hub's prepay Transfers with this.

import { closeDescription, closeKind } from "../actions/kinds.ts"
import { utf8Encode } from "../encoding.ts"
import { MAX_AMOUNT } from "../money.ts"
import type { ProposalKind } from "../types/dao.ts"

export const PREPAY_PROPOSAL_OVERHEAD_BYTES = 250
export const PREPAY_FIRST_VOTE_BYTES = 160
export const PREPAY_EXTRA_VOTE_BYTES = 100
/** env::storage_byte_cost() on NEAR: 10^19 yocto per byte. */
export const YOCTO_PER_BYTE = 10_000_000_000_000_000_000n
export const PREPAY_MODEL = `${PREPAY_PROPOSAL_OVERHEAD_BYTES}/${PREPAY_FIRST_VOTE_BYTES}/${PREPAY_EXTRA_VOTE_BYTES}`

const len = (s: string): number => utf8Encode(s).length

/** `prepay_bytes(description, kind, extra_votes)`: serde_json(kind) has the same bytes as JSON.stringify here. */
export function prepayBytes(description: string, kind: ProposalKind, extraVotes: number): number {
  return PREPAY_PROPOSAL_OVERHEAD_BYTES + len(description) + len(JSON.stringify(kind)) + PREPAY_FIRST_VOTE_BYTES + PREPAY_EXTRA_VOTE_BYTES * extraVotes
}

export const bytesCost = (bytes: number): bigint => BigInt(bytes) * YOCTO_PER_BYTE

/** Join (AddMemberToRole) and instant spends reserve no extra vote; a vote-path spend reserves one per member. */
export const proposalPrepay = (description: string, kind: ProposalKind, extraVotes: number): bigint => bytesCost(prepayBytes(description, kind, extraVotes))

/**
 * The close prepay: `max(call-time upper bound, actual)`, where the upper bound prices every
 * contributor's payout at MAX_AMOUNT (`close_prepay_upper_bound`), as `on_close_balance` does.
 */
export function closePrepay(usdc: string, payouts: readonly { account: string; amount: bigint }[], memberCount: number): bigint {
  const upper = proposalPrepay(
    closeDescription(MAX_AMOUNT, payouts.length),
    closeKind(
      usdc,
      payouts.map((p) => ({ account: p.account, amount: MAX_AMOUNT })),
    ),
    memberCount,
  )
  const total = payouts.reduce((t, p) => t + p.amount, 0n)
  const actual = proposalPrepay(closeDescription(total, payouts.length), closeKind(usdc, payouts), memberCount)
  return upper > actual ? upper : actual
}

/** yocto → "0.0059" style decimal NEAR (rounded half-up to `dp` places). */
export function yoctoToNear(yocto: bigint, dp = 4): string {
  const unit = 10n ** BigInt(24 - dp)
  const q = (yocto + unit / 2n) / unit
  const s = q.toString().padStart(dp + 1, "0")
  return `${s.slice(0, -dp)}.${s.slice(-dp)}`
}

/** yocto → its exact decimal NEAR, trailing zeros trimmed but at least `minDp` places ("0.00125", "0.0500", "0"). */
export function yoctoToNearExact(yocto: bigint, minDp = 4): string {
  if (yocto === 0n) return "0"
  const s = yocto.toString().padStart(25, "0")
  const frac = s.slice(-24).replace(/0+$/, "").padEnd(minDp, "0")
  return `${s.slice(0, -24)}.${frac}`
}
