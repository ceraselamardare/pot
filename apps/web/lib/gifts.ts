// Gifts (notes/gifts-plan.md, approved 2026-11-02): anyone can send a Pot a gift ("Buy-Me-a-Coffee", not fundraising).
// Isomorphic rules shared by the API, the mock world and the screens: amounts, text limits, ids and the hub message.
// On chain (hub 1.2.0): `usdc.ft_transfer_call(hub, amount, msg = {"pot":"<dao>","gift":"<ref>"})` from ANY account;
// the hub checks the Pot is open, gifts aren't off, $1 ≤ amount ≤ MAX_AMOUNT and no all-or-nothing goal is still
// collecting, forwards the money to the Pot and emits `gift_received{pot,from,amount,ref}`.
// Off chain (our server): gift links (`gift_link`), the giver's name/note (`gift`, keyed by the ref) and the public
// gift page (`gift_page`). Privacy: notes are for the Pot's members (and the giver); the public page shows a name or
// a note only when the giver chose "show my name publicly".
import type { Micro } from "@pot/sdk"

/** The smallest gift the hub takes: $1 (1_000_000 base units). */
export const GIFT_MIN: Micro = 1_000_000n
/** The largest gift we let a person send at once ($10,000, the relayer's MAX_CONTRIBUTION and the Add sheet's MAX_ADD). */
export const GIFT_MAX: Micro = 10_000_000_000n
/** ☕ one coffee: the gift tone's preset unit. */
export const GIFT_COFFEE: Micro = 5_000_000n
/** The gift tone's presets: ☕ × 1 / × 2 / × 4 ($5 / $10 / $20). */
export const GIFT_PRESETS = [1, 2, 4] as const
/** The payment tone's presets ($10 / $25 / $50). */
export const PAYMENT_PRESETS: readonly Micro[] = [10_000_000n, 25_000_000n, 50_000_000n]

/**
 * "Pay in" (2026-11-03, notes/frontend.md): money from people outside the Pot comes through a pay-in link or the public
 * page. The member who makes one picks its tone ("What's it for?"): a plain **payment** (the default: "Pay Lisbon
 * Trip", [Pay $25], presets $10/$25/$50) or a **gift** ("Send Lisbon Trip a gift", [Send $10 ☕], presets ☕ $5/$10/$20).
 * The tone only changes words and presets; on chain both are the hub's gift message. Stored off chain on gift_link,
 * gift_page and each gift (a snapshot, so a later page change doesn't rewrite old rows). Rows from before the tone
 * existed are gifts.
 */
export type PayInTone = "payment" | "gift"
export const PAYIN_TONES: readonly PayInTone[] = ["payment", "gift"]
export const isPayInTone = (v: unknown): v is PayInTone => v === "payment" || v === "gift"
/** A record from before the tone existed reads as a gift (that's what it said then). */
export const toneOf = (v: PayInTone | null | undefined): PayInTone => v ?? "gift"
/** The giver's note (members see it; the public page only if the giver chose to show it). */
export const GIFT_NOTE_MAX = 140
/** The giver's name as they want the Pot to see it. */
export const GIFT_NAME_MAX = 40
/** The members' one-liner on the public gift page. */
export const GIFT_LINE_MAX = 100
/** A gift link works this long. */
export const GIFT_LINK_DAYS = 14
export const GIFT_LINK_TTL_MS = GIFT_LINK_DAYS * 86_400_000

/** A gift's ref (the hub's `gift` field and our `gift.ref`): "g" + 23 base-32 characters = 24 ≤ 32, [a-z0-9]. */
export const GIFT_REF_RE = /^g[0-9a-hjkmnp-tv-z]{23}$/
/** A gift link's id: 128 random bits, base64url (22 characters). */
export const GIFT_LINK_ID_RE = /^[A-Za-z0-9_-]{22}$/

const B32 = "0123456789abcdefghjkmnpqrstvwxyz"

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  globalThis.crypto.getRandomValues(b)
  return b
}

/** A fresh gift ref (115 random bits). The server makes it; the browser never needs to. */
export function newGiftRef(): string {
  const b = randomBytes(23)
  let s = "g"
  for (const x of b) s += B32[x & 31]
  return s
}

/** A fresh gift link id (128 random bits, base64url without padding). */
export function newGiftLinkId(): string {
  const b = randomBytes(16)
  let bin = ""
  for (const x of b) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** The hub message for a gift (the ft_transfer_call `msg`): parse order on chain is link → gift → contribute. */
export function giftMsg(potDao: string, ref: string): string {
  return JSON.stringify({ pot: potDao, gift: ref })
}

export type GiftAmountCheck = { ok: true } | { ok: false; why: "too_low" | "too_high" }

export function checkGiftAmount(m: Micro): GiftAmountCheck {
  if (m < GIFT_MIN) return { ok: false, why: "too_low" }
  if (m > GIFT_MAX) return { ok: false, why: "too_high" }
  return { ok: true }
}

export type GiftTextCheck = { ok: true; value: string } | { ok: false; why: "length" | "control" | "format" }

/**
 * One line of the giver's (or the members') own words: NFC, whitespace runs collapsed to one space (no line breaks),
 * trimmed, 1..max code points, no control characters, no format characters except ZWJ and VS16 (emoji).
 * Never HTML-escaped here: React escapes on render; push bodies never carry it.
 */
export function cleanGiftText(input: string, max: number): GiftTextCheck {
  const value = input.normalize("NFC").replace(/[\s\u2028\u2029]+/gu, " ").trim()
  const cps = [...value]
  if (cps.length < 1 || cps.length > max) return { ok: false, why: "length" }
  for (const ch of cps) {
    if (/\p{Cc}/u.test(ch)) return { ok: false, why: "control" }
    if (/\p{Cf}/u.test(ch) && ch !== "‍" && ch !== "️") return { ok: false, why: "format" }
  }
  return { ok: true, value }
}

/** Optional text: blank → null; else cleaned (or the reason it can't be). */
export function optionalGiftText(input: string | null | undefined, max: number): { ok: true; value: string | null } | { ok: false; why: "length" | "control" | "format" } {
  if (input === null || input === undefined || input.trim() === "") return { ok: true, value: null }
  return cleanGiftText(input, max)
}

export const giftTextLength = (s: string): number => [...s].length

/**
 * Is a Pot taking gifts right now? (what the hub checks, as far as a page can know it before sending):
 *  yes · off (a member turned gifts off) · goal (an all-or-nothing goal is still collecting) · closed (closing/closed).
 */
export type GiftTaking = "yes" | "off" | "goal" | "closed"

/** A gift link's state for the landing: active, or why it doesn't work any more. */
export type GiftLinkStatus = "active" | "revoked" | "expired" | "used"

export function giftLinkStatus(
  l: { revokedAt: number | null; expiresAt: number; reusable: boolean; uses: number },
  now: number,
): GiftLinkStatus {
  if (l.revokedAt !== null) return "revoked"
  if (now >= l.expiresAt) return "expired"
  if (!l.reusable && l.uses >= 1) return "used"
  return "active"
}
