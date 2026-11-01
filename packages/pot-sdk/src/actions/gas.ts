// Gas and deposits (frontend-architecture §1.4 table, contracts-spec §3.0/§3.12, api-spec §3.1
// relayer policy R1-R11). The relayer requires EXACTLY 100 Tgas for votes on Transfer /
// AddMemberToRole proposals and EXACTLY 300 Tgas for votes and Finalize on FunctionCall (`call`)
// proposals (rev3/rev4). Relayed hub calls carry 0 deposit; only usdc.ft_transfer_call carries 1 yocto.

import type { ProposalKind } from "../types/dao.ts"

export const TGAS = 1_000_000_000_000n
export const tgas = (n: number | bigint): bigint => BigInt(n) * TGAS

export const ONE_YOCTO = 1n
export const ONE_NEAR = 10n ** 24n
export const MILLI_NEAR = 10n ** 21n

/** Default gas per call (Tgas). */
export const GAS_TGAS = {
  ft_transfer_call: 100,
  request_spend: 150,
  vote_transfer: 100,
  vote_call: 300,
  join: 100,
  create_pot: 300,
  add_invite: 30,
  revoke_invite: 30,
  set_rules: 30,
  propose_rules: 100,
  propose_close: 150,
  retry_payout: 100,
  sync: 50,
  // hub 1.1.0 (contracts notes/contracts-wave4.md §gas): an instant link payout is ft_transfer_call
  // inside the hub's chain (GAS_ACT_LINK 100), so a link request_spend needs ≈ 190 Tgas
  request_spend_link: 250,
  ok_request: 200,
  claim_link: 100,
  reclaim_link: 50,
  refund_unfunded: 300,
} as const

export const GAS = Object.fromEntries(Object.entries(GAS_TGAS).map(([k, v]) => [k, tgas(v)])) as { readonly [K in keyof typeof GAS_TGAS]: bigint }

/** The kind's top-level variant name ("Transfer", "FunctionCall", …), or null. */
export function kindVariant(kind: ProposalKind): string | null {
  if (typeof kind === "string") return kind
  if (kind && typeof kind === "object") {
    const keys = Object.keys(kind)
    return keys.length === 1 ? (keys[0] as string) : null
  }
  return null
}

/** Vote / Finalize gas from the proposal kind: FunctionCall → 300 Tgas, everything else → 100 Tgas. */
export function voteGas(kind: ProposalKind): bigint {
  return kindVariant(kind) === "FunctionCall" ? GAS.vote_call : GAS.vote_transfer
}

/**
 * What a direct (non-relayed, unsponsored) caller attaches to the six hub-funded methods
 * (contracts-spec §3.0, rev4; the hub refunds the excess). `create_pot` = dao_float + 0.02 NEAR.
 */
export function directDeposit(method: string, opts: { daoFloat?: bigint } = {}): bigint {
  const daoFloat = opts.daoFloat ?? 50n * MILLI_NEAR
  switch (method) {
    case "create_pot":
      return daoFloat + 20n * MILLI_NEAR
    case "join":
      return 20n * MILLI_NEAR
    case "request_spend":
      return 60n * MILLI_NEAR
    case "add_invite":
      return 5n * MILLI_NEAR
    case "propose_rules":
      return 60n * MILLI_NEAR
    case "propose_close":
      return 150n * MILLI_NEAR
    case "claim_link":
      // the claimer's token registration (0.00125, refunded by the token if already registered) + state
      return 3n * MILLI_NEAR
    case "refund_unfunded":
      return 200n * MILLI_NEAR
    default:
      return 0n
  }
}

/** api-spec §3.1 relayer policy, per method: exact deposit and the accepted gas range (Tgas). */
export interface RelayRule {
  rule: string
  receiver: "usdc" | "hub" | "dao"
  deposit: bigint
  gasMinTgas: number
  gasMaxTgas: number
  defaultTgas: number
}

export const RELAY_POLICY: Readonly<Record<string, RelayRule>> = {
  ft_transfer_call: { rule: "R1", receiver: "usdc", deposit: ONE_YOCTO, gasMinTgas: 100, gasMaxTgas: 150, defaultTgas: 100 },
  create_pot: { rule: "R2", receiver: "hub", deposit: 0n, gasMinTgas: 150, gasMaxTgas: 300, defaultTgas: 300 },
  // hub 1.1.0: up to 300 for pay-by-link requests (GAS_TGAS.request_spend_link)
  request_spend: { rule: "R3", receiver: "hub", deposit: 0n, gasMinTgas: 100, gasMaxTgas: 300, defaultTgas: 150 },
  join: { rule: "R4", receiver: "hub", deposit: 0n, gasMinTgas: 100, gasMaxTgas: 150, defaultTgas: 100 },
  add_invite: { rule: "R5", receiver: "hub", deposit: 0n, gasMinTgas: 10, gasMaxTgas: 50, defaultTgas: 30 },
  revoke_invite: { rule: "R5", receiver: "hub", deposit: 0n, gasMinTgas: 10, gasMaxTgas: 50, defaultTgas: 30 },
  set_rules: { rule: "R6", receiver: "hub", deposit: 0n, gasMinTgas: 10, gasMaxTgas: 50, defaultTgas: 30 },
  propose_rules: { rule: "R7", receiver: "hub", deposit: 0n, gasMinTgas: 80, gasMaxTgas: 150, defaultTgas: 100 },
  propose_close: { rule: "R8", receiver: "hub", deposit: 0n, gasMinTgas: 150, gasMaxTgas: 300, defaultTgas: 150 },
  retry_payout: { rule: "R9", receiver: "hub", deposit: 0n, gasMinTgas: 80, gasMaxTgas: 150, defaultTgas: 100 },
  sync: { rule: "R9", receiver: "hub", deposit: 0n, gasMinTgas: 50, gasMaxTgas: 150, defaultTgas: 50 },
  // hub 1.1.0 (wave 4). refund_unfunded is NOT relayed for users: the cron calls it with a relayer key.
  ok_request: { rule: "R13", receiver: "hub", deposit: 0n, gasMinTgas: 100, gasMaxTgas: 250, defaultTgas: 200 },
  claim_link: { rule: "R14", receiver: "hub", deposit: 0n, gasMinTgas: 50, gasMaxTgas: 150, defaultTgas: 100 },
  reclaim_link: { rule: "R15", receiver: "hub", deposit: 0n, gasMinTgas: 30, gasMaxTgas: 100, defaultTgas: 50 },
  // R11: exactly 100 (Transfer, AddMemberToRole) or exactly 300 (FunctionCall); see voteGas().
  act_proposal: { rule: "R11", receiver: "dao", deposit: 0n, gasMinTgas: 100, gasMaxTgas: 300, defaultTgas: 100 },
}
