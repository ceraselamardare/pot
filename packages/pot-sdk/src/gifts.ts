// Hub 1.2.0 gifts (notes/contracts-gifts.md): anyone, member or not, can send a Pot a gift with
// usdc.ft_transfer_call(hub, amount, msg = {"pot":<dao>,"gift":"<ref>"}). It is group money: never a
// contribution, spendable like any Pot money, shared pro-rata at close (equally if nobody added money).
// The hub refuses (and the token refunds) when the Pot isn't open, the hub is paused, gifts are off,
// the amount is < $1, or an all-or-nothing goal is still collecting.

import type { Micro } from "./money.ts"
import type { HubEvent } from "./types/events.ts"
import { GIFT_LIMITS, type GiftReceived } from "./types/hub.ts"
import type { AccountId, DaoId } from "./types/ids.ts"

/** A gift's ref: 1-32 chars of [A-Za-z0-9_-] (a 128-bit base64url gift-link id is 22). */
export const GIFT_REF_RE = /^[A-Za-z0-9_-]{1,32}$/
export const isValidGiftRef = (r: string): boolean => GIFT_REF_RE.test(r)

/** The exact ft_transfer_call `msg` for a gift (key order pot, gift; parse order on chain: link → gift → contribute). */
export function giftMsg(pot: DaoId | string, giftRef: string): string {
  if (!isValidGiftRef(giftRef)) throw new Error("giftRef must match ^[A-Za-z0-9_-]{1,32}$")
  return JSON.stringify({ pot, gift: giftRef })
}

/** Parses an ft_transfer_call msg as a gift ({pot, gift} exactly), else null (a contribution, a link, garbage). */
export function parseGiftMsg(msg: string): { pot: string; giftRef: string } | null {
  let v: unknown
  try {
    v = JSON.parse(msg)
  } catch {
    return null
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const keys = Object.keys(o)
  if (keys.length !== 2 || typeof o.pot !== "string" || typeof o.gift !== "string") return null
  return { pot: o.pot, giftRef: o.gift }
}

/** Why a gift amount would be refused before it reaches the chain (null = fine). */
export function giftAmountError(amount: Micro): "too_small" | "too_large" | null {
  if (amount < GIFT_LIMITS.minAmount) return "too_small"
  if (amount > GIFT_LIMITS.maxAmount) return "too_large"
  return null
}

/** A `gift_received` hub event → domain (null for any other event). */
export function parseGiftReceived(e: { standard: string; event: string; data: unknown } | null | undefined): GiftReceived | null {
  if (!e || e.standard !== "pot" || e.event !== "gift_received") return null
  const d = (e as Extract<HubEvent, { event: "gift_received" }>).data
  if (!d || typeof d.pot !== "string" || typeof d.from !== "string" || typeof d.ref !== "string") return null
  return {
    pot: d.pot as DaoId,
    from: d.from as AccountId,
    amount: BigInt(d.amount),
    ref: d.ref,
    giftsTotal: BigInt(d.gifts_total),
    giftsCount: Number(d.gifts_count),
  }
}
