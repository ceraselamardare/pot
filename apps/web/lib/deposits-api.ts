// Money-in details (2026-11-04): the wire shape of GET /api/pots/[pot]/deposits/[key] (members only), keyed by what
// a money-in feed row already has: a contribution's NEAR transaction hash, or a pay-in's ref. Isomorphic (no I/O).
// The UI maps it to DepositDetailsVM (lib/client/deposits/vm.ts); the mock world builds the same VM directly.
import type { PayInTone } from "./gifts"

/** The 5 moments of an add from another app (any coin, any network): address shown → sent → converting → arrived → added. */
export const XC_MOMENTS = ["address", "sent", "converting", "arrived", "added"] as const
export type XcMoment = (typeof XC_MOMENTS)[number]

/** Where the money came from. */
export type DepositSourceWire =
  /** demo dollars (testnet's test money, claimed as it's added) */
  | { kind: "demo" }
  /** the person's own Pot dollars (what Pots paid them) */
  | { kind: "pot_dollars" }
  /** an add from before sources were recorded: we only know it came from their balance */
  | { kind: "balance" }
  /** someone outside paid in (a pay-in link or the public page) */
  | {
      kind: "payin"
      tone: PayInTone
      /** the account that paid (members only; the name below is what they chose, if anything) */
      from: string
      name: string | null
      note: string | null
      showPublic: boolean
      /** null = the public page */
      link: { id: string; createdBy: string; amount: string | null; createdAt: string } | null
    }
  /** from another app or exchange (1Click): the coin, the network, what was sent and what arrived */
  | {
      kind: "xc"
      /** simulated = the testnet demo (no real money, no real origin transaction) */
      mode: "real" | "simulated"
      chain: string
      coin: string
      decimals: number
      stable: boolean
      /** what was sent, the coin's base units (null: unknown) */
      sent: string | null
      /** the dollars asked for, USD micro */
      usdTarget: string
      /** what arrived as Pot dollars, USD micro (null: unknown) */
      arrived: string | null
      /** sent back to the sender (the coin's base units), with 1Click's reason */
      refunded: string | null
      refundReason: string | null
      /** each moment's time (ISO), null when not known */
      timeline: { step: XcMoment; at: string | null }[]
      /** the origin network's transaction (real mode only), with its explorer page when we know one */
      originTx: { hash: string; url: string | null } | null
      /** NEAR Intents' explorer page for this transfer (real mode only) */
      intentsUrl: string | null
    }

export interface DepositDetailsWire {
  /** the key it was asked by (a NEAR transaction hash or a pay-in ref) */
  key: string
  /** a member added money, or someone outside paid in */
  kind: "added" | "payin"
  /** the account the money came from (the member, or the payer) */
  who: string
  /** USD micro */
  amount: string
  at: string
  status: "added" | "pending" | "failed"
  /** the NEAR receipt of the money reaching the Pot */
  txHash: string | null
  source: DepositSourceWire
  /** an add made while a top-up ask was open, by someone it asked: that ask */
  topup: { id: string; by: string; perPerson: string; mode: "each" | "total" } | null
}

export interface DepositDetailsRes {
  ok: true
  requestId?: string
  deposit: DepositDetailsWire
  /** names of the accounts named above (members only, like the feed's) */
  profiles: Record<string, { name: string }>
}
