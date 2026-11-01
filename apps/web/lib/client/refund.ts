// Refund preview (risk-register R-33 M-6): "what would I get back if this Pot closed now?", and how one action
// would change it. Pure, so the Pot screen, the Add and Spend sheets and the tests share one answer.
//
// The math is the hub's own close-out (contracts/pot-hub/src/prorata.rs, through its parity-tested TS twin
// `prorata` in @pot/sdk; get_members.would_get_back and preview_close use exactly this):
//   share_i = floor(B × c_i / C) over the active members in join order, C = Σ c_i;
//   dust = B − Σ share_i goes to the last contributor (else the last member in join order with c > 0);
//   B = 0 or C = 0 → nobody gets anything back.
// B is the Pot's live balance (usdc.ft_balance_of(dao), the same number the UI passes to preview_close).
//  - Add a: B + a, c_me + a, and the last contributor becomes me (contribute() sets it).
//  - Spend s (once paid): B − s; contributions and the last contributor don't change.
// `unit` is the smallest amount the close math works in: 1 micro on testnet; the mock world keeps cents, so its
// close runs in cents (10 000 micro) and the preview must too, or a $0.01 remainder could land elsewhere.
import { prorata } from "@pot/sdk"
import type { Micro } from "./money"
import type { PotVM } from "./mock/types"

export interface RefundBasis {
  /** what's in the Pot now */
  balance: Micro
  /** active members in join order */
  members: readonly { id: string; contributed: Micro }[]
  /** who added money last (the tiny remainder goes to them) */
  lastContributor: string | null
  /** the close math's smallest amount (1n live, 10 000n in the mock) */
  unit: Micro
}

/** What each person would get back if the Pot closed with this basis (people with nothing back are absent). */
export function refunds(b: RefundBasis): Map<string, Micro> {
  const u = b.unit > 0n ? b.unit : 1n
  const r = prorata(
    b.balance > 0n ? b.balance / u : 0n,
    b.members.map((m) => ({ account: m.id, contributed: m.contributed > 0n ? m.contributed / u : 0n })),
    b.lastContributor,
  )
  const out = new Map<string, Micro>()
  for (const p of r?.payouts ?? []) out.set(p.account, p.amount * u)
  return out
}

export const refundOf = (b: RefundBasis, id: string): Micro => refunds(b).get(id) ?? 0n

/** The basis after `who` adds `amount` (they become the last contributor). */
export function withAdd(b: RefundBasis, who: string, amount: Micro): RefundBasis {
  if (amount <= 0n) return b
  return {
    ...b,
    balance: b.balance + amount,
    members: b.members.map((m) => (m.id === who ? { id: m.id, contributed: m.contributed + amount } : m)),
    lastContributor: who,
  }
}

/** The basis once a spend of `amount` is paid out of the Pot. */
export function withSpend(b: RefundBasis, amount: Micro): RefundBasis {
  if (amount <= 0n) return b
  return { ...b, balance: b.balance > amount ? b.balance - amount : 0n }
}

/** The basis of an open Pot as the UI sees it; null once it is closing or closed (the close record decides). */
export function refundBasis(pot: PotVM): RefundBasis | null {
  if (pot.status !== "open") return null
  return {
    balance: pot.balance,
    members: [...pot.members]
      .sort((a, c) => (a.person.joinIndex ?? 0) - (c.person.joinIndex ?? 0))
      .map((m) => ({ id: m.person.id, contributed: m.contributed })),
    lastContributor: pot.lastContributor?.id ?? null,
    unit: pot.moneyUnit ?? 1n,
  }
}

/** "If the Pot closed after adding `amount`, you'd get back …" (null when the Pot isn't open or you aren't in it). */
export function refundAfterAdd(pot: PotVM, amount: Micro): Micro | null {
  const b = refundBasis(pot)
  if (!b || !pot.me) return null
  return refundOf(withAdd(b, pot.me.person.id, amount), pot.me.person.id)
}

/** "Once this is paid, you'd get back …" (null when the Pot isn't open or you aren't in it). */
export function refundAfterSpend(pot: PotVM, amount: Micro): Micro | null {
  const b = refundBasis(pot)
  if (!b || !pot.me) return null
  return refundOf(withSpend(b, amount), pot.me.person.id)
}

export interface RefundBreakdown {
  putIn: Micro
  /** put in − gets back (never below 0): the hub's share_of_spending */
  partOfSpending: Micro
  getsBack: Micro
  /** everyone's money in, and what's in the Pot (the "how it's worked out" line) */
  totalIn: Micro
  left: Micro
}

/** The hero's "You'd get back", explained: the same numbers the Members tab shows for you. */
export function refundBreakdown(pot: PotVM): RefundBreakdown | null {
  const me = pot.me
  if (!me) return null
  return {
    putIn: me.contributed,
    partOfSpending: me.contributed > me.getsBack ? me.contributed - me.getsBack : 0n,
    getsBack: me.getsBack,
    totalIn: pot.totalIn,
    left: pot.balance,
  }
}
