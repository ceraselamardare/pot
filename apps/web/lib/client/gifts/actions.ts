"use client"
// Gift actions, one implementation per data source (mock store / our API + the hub through the relayer):
//  - members: make and revoke gift links, turn gifts on/off (the hub's set_gifts), the public gift page;
//  - the giver: send a gift = POST /api/gifts (the server checks the link and makes the ref) → demo dollars from the
//    faucet when they fall short (like Add money) → one ft_transfer_call to the hub with the gift msg (chain.ts).
// Errors are ActionError reasons (api / relay / the mock store's), mapped to copy by giftErrorKey.
import { newOpKey, type Micro } from "@pot/sdk"
import type { MessageKey } from "@/i18n/t"
import type { GiftLinkWire, GiftStartWire, GiftPageWire } from "@/lib/gifts-api"
import { daoOf, IS_LIVE } from "../config"
import { ActionError, isTransportError } from "../errors"
import { api } from "../live/api"
import { chain } from "../live/chain"
import * as store from "../mock/store"
import { mockTxHash } from "../mock/world"
import { toCents } from "../money"
import { queryClient } from "../query"
import { sendGiftTransfer, setGiftsOnChain } from "./chain"
import { giftKeys } from "./data"

const FAUCET_MIN: Micro = 50_000_000n
const FAUCET_MAX: Micro = 500_000_000n

const refresh = (key: readonly unknown[]) => void queryClient().invalidateQueries({ queryKey: key, refetchType: "active" })

export interface GiftLinkInput {
  /** null = the giver chooses */
  amount: Micro | null
  note?: string | null
  /** default true */
  reusable?: boolean
}

/** A member makes a gift link; resolves with its id. */
export async function createGiftLink(slug: string, input: GiftLinkInput): Promise<string> {
  if (!IS_LIVE) return store.createGiftLink(slug, { amount: input.amount === null ? null : toCents(input.amount), note: input.note ?? null, reusable: input.reusable ?? true })
  const r = await api<{ link: GiftLinkWire }>("POST", `/api/pots/${slug}/gift-links`, {
    amount: input.amount === null ? null : input.amount.toString(),
    note: input.note ?? null,
    reusable: input.reusable ?? true,
    idempotencyKey: newOpKey(),
  })
  refresh(giftKeys.links(slug))
  return r.data.link.id
}

export async function revokeGiftLink(slug: string, id: string): Promise<void> {
  if (!IS_LIVE) return store.revokeGiftLink(slug, id)
  await api("DELETE", `/api/pots/${slug}/gift-links/${id}`, {}) // same-origin JSON (checkCsrf needs the content type)
  refresh(giftKeys.links(slug))
}

/** ••• → Gifts → on/off (any member; the hub's set_gifts). */
export async function setGiftsOn(slug: string, on: boolean): Promise<void> {
  if (!IS_LIVE) return store.setGiftsOn(slug, on)
  await setGiftsOnChain(daoOf(slug), on)
  refresh(giftKeys.pot(slug))
}

/** ••• → Gifts → the public gift page (on/off) and the members' one-liner (`line` undefined = keep). */
export async function setGiftPage(slug: string, input: { on: boolean; line?: string | null }): Promise<void> {
  if (!IS_LIVE) return store.setGiftPage(slug, input)
  await api<{ page: GiftPageWire }>("PUT", `/api/pots/${slug}/gift-page`, input)
  refresh(giftKeys.pot(slug))
  refresh(giftKeys.page(slug))
}

export interface SendGiftInput {
  slug: string
  /** a gift link, or null for the public gift page */
  linkId: string | null
  amount: Micro
  name?: string | null
  note?: string | null
  /** public page only */
  showPublic?: boolean
  /** a retried send reuses the same key (the server answers with the same ref) */
  idempotencyKey: string
  /** "pot_dollars": the giver's own Pot dollars (no demo top-up); default demo dollars */
  source?: "demo" | "pot_dollars"
}

export interface SendGiftResult {
  ref: string
  /** the gift's receipt */
  txHash?: string
}

/** Send a gift as the signed-in person: demo dollars are claimed and sent behind the one button. */
export async function sendGift(input: SendGiftInput): Promise<SendGiftResult> {
  if (!IS_LIVE) {
    const r = await store.giveGift({
      slug: input.slug,
      linkId: input.linkId,
      amount: toCents(input.amount),
      name: input.name ?? null,
      note: input.note ?? null,
      showPublic: input.showPublic,
      source: input.source ?? "demo",
    })
    return { ref: r.ref, txHash: mockTxHash(`${input.slug}:gift:${r.ref}`) }
  }
  const started = (
    await api<{ gift: GiftStartWire }>("POST", "/api/gifts", {
      pot: input.slug,
      ...(input.linkId ? { linkId: input.linkId } : { page: true }),
      amount: input.amount.toString(),
      name: input.name ?? null,
      note: input.note ?? null,
      ...(input.linkId ? {} : { showPublic: !!input.showPublic }),
      idempotencyKey: input.idempotencyKey,
    })
  ).data.gift
  // demo dollars (testnet): top up from the faucet when this person's own fall short, then send (Add money's pattern)
  const me = (await import("../live/session")).ensureLiveSession
  const s = await me()
  if (!s) throw new ActionError("session", "not_signed_in")
  const own = (await chain().usdc.balanceOf(s.accountId as never)).value
  if ((input.source ?? "demo") === "pot_dollars") {
    // their own Pot dollars only: never a demo top-up behind their back
    if (own < input.amount) throw new ActionError("failed", "insufficient_own")
  } else if (own < input.amount) {
    let claim = input.amount - own
    if (claim < FAUCET_MIN) claim = FAUCET_MIN
    if (claim > FAUCET_MAX) claim = FAUCET_MAX
    await api("POST", "/api/faucet", { amount: claim.toString(), idempotencyKey: newOpKey() })
  }
  const r = await sendGiftTransfer({ dao: started.pot, amount: BigInt(started.amount), ref: started.ref })
  refresh(giftKeys.mine(s.accountId))
  return { ref: started.ref, txHash: r.txHash }
}

/** The giver changes their name / note / "show my name" afterwards. */
export async function editGift(ref: string, patch: { name?: string | null; note?: string | null; showPublic?: boolean }): Promise<void> {
  if (!IS_LIVE) return store.editGift(ref, patch)
  await api("PATCH", `/api/gifts/${ref}`, patch)
}

/** Copy for a failed gift action (what happened; whether money moved: it never did when we get here). */
export function giftErrorKey(e: unknown): MessageKey {
  const reason = e instanceof ActionError ? e.reason : ""
  if (e instanceof ActionError && (e.cls === "rate_limited" || reason === "rate_limited" || reason === "quota_exceeded")) return "gift.error.limit"
  switch (reason) {
    case "not_signed_in":
      return "gift.error.signin"
    case "pot_closed":
      return "gift.state.closed.body"
    case "amount_too_low":
      return "gift.amount.min"
    case "amount_too_high":
      return "gift.amount.max"
    case "not_found":
    case "action_not_allowed":
    case "args_invalid":
    // the relayer's pre-flight (409 gifts_unavailable {why}): the link or the Pot changed since the page loaded
    case "gifts_unavailable":
      return "gift.error.changed"
    // hub 1.2.0 refusals (inner_failed): the token refunded the giver
    case "ERR_GIFTS_OFF":
      return "gift.state.off.body"
    case "ERR_GOAL_COLLECTING":
    case "ERR_GOAL_MISSED":
      return "gift.state.goal.body"
    case "ERR_POT_NOT_OPEN":
      return "gift.state.closed.body"
    case "ERR_GIFT_TOO_SMALL":
      return "gift.amount.min"
    case "GIFT_REFUNDED":
      return "gift.error.refunded"
    case "insufficient_own":
    case "insufficient_balance":
      return "gift.error.own_short"
  }
  return isTransportError(e) ? "gift.error.network" : "gift.error.failed"
}
