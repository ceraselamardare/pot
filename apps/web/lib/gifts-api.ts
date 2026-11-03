// Gifts API wire types (shared by the routes in app/api/** and the browser; types only, no I/O).
// Amounts are Micro strings (USDC base units, 6 decimals), times ISO strings. Every response also carries the
// envelope's `ok: true` + `requestId` (server/http/context.ts). `pot` in a path is a slug or a Pot id.
//
//   members of the Pot (signed in; writes need an active device):
//     POST   /api/pots/[pot]/gift-links            GiftLinkCreateReq → 201 { link: GiftLinkWire }
//     GET    /api/pots/[pot]/gift-links            → { links: GiftLinkWire[] }   (active ones, newest first)
//     DELETE /api/pots/[pot]/gift-links/[id]       → { link: GiftLinkWire }      (revoke; idempotent)
//     GET    /api/pots/[pot]/gifts                 → GiftsRes                    (every received gift, notes included)
//     PUT    /api/pots/[pot]/gift-page             GiftPagePutReq → { page: GiftPageWire }
//   anyone (public, by id / slug; no names except the ones givers chose to show):
//     GET    /api/gift-links/[id]                  → GiftLandingRes
//     GET    /api/give/[slug]                      → GiftPageRes
//   the giver (signed in, any account; need not be a member):
//     POST   /api/gifts                            GiftStartReq → 201 { gift: GiftStartWire }   (replay 200)
//     PATCH  /api/gifts/[ref]                      GiftPatchReq → { gift: MyGiftWire }
//     GET    /api/me/gifts                         → { gifts: MyGiftWire[] }
import type { GiftLinkStatus, GiftTaking, PayInTone } from "./gifts"

export interface GiftLinkWire {
  id: string
  /** the Pot id (`<slug>.<hub>`) */
  pot: string
  slug: string
  createdBy: string
  /** null = the giver chooses */
  amount: string | null
  note: string | null
  /** "What's it for?": "payment" (default) or "gift" (the words and presets on the page) */
  tone: PayInTone
  /** true (default) = many people can use it; false = one gift, then it's used */
  reusable: boolean
  uses: number
  expiresAt: string
  revokedAt: string | null
  createdAt: string
  status: GiftLinkStatus
}

export interface GiftLinkCreateReq {
  /** null/absent = the giver chooses; else a fixed amount (≥ $1) */
  amount?: string | null
  note?: string | null
  /** default true */
  reusable?: boolean
  /** default "payment" */
  tone?: PayInTone
  /** a retried create returns the same link */
  idempotencyKey?: string
}

/** What any page about a Pot may show to someone outside it (all public on the ledger, except the members' one-liner). */
export interface GiftPotWire {
  pot: string
  slug: string
  name: string
  emoji: string
  /** how many people are in it */
  members: number
  status: "open" | "closing" | "closed"
}

export interface GiftLandingRes {
  ok: true
  requestId?: string
  link: { id: string; amount: string | null; note: string | null; status: GiftLinkStatus; expiresAt: string; tone: PayInTone }
  pot: GiftPotWire
  taking: GiftTaking
}

export interface GiftPageWire {
  on: boolean
  /** the members' optional one-liner shown on the page */
  line: string | null
  /** the page's words: "payment" (default for a new page) or "gift" */
  tone: PayInTone
}

export interface GiftPagePutReq {
  on: boolean
  /** absent = keep; null or "" = remove */
  line?: string | null
  /** absent = keep */
  tone?: PayInTone
}

/** A gift on the public page: only givers who chose to be shown (their name, and their note if they wrote one). */
export interface PublicGiftWire {
  name: string
  note: string | null
  amount: string
  at: string
}

export interface GiftTotalsWire {
  /** Micro string */
  amount: string
  count: number
}

export interface GiftPageRes {
  ok: true
  requestId?: string
  pot: GiftPotWire
  page: GiftPageWire
  /** present only while the page is on */
  taking?: GiftTaking
  totals?: GiftTotalsWire
  givers?: PublicGiftWire[]
}

/** A received gift as the Pot's members see it. */
export interface GiftWire {
  ref: string
  /** the giver's account (public on the ledger anyway) */
  from: string
  /** the name the giver chose (null = none; the UI derives one from the account) */
  name: string | null
  note: string | null
  showPublic: boolean
  amount: string
  at: string
  status: "pending" | "received" | "failed"
  txHash: string | null
  /** the gift link it came through (null = the public page) */
  linkId: string | null
  /** its link's (or the page's) tone when it was sent */
  tone: PayInTone
}

export interface GiftsRes {
  ok: true
  requestId?: string
  gifts: GiftWire[]
  totals: GiftTotalsWire
  page: GiftPageWire
}

export interface GiftStartReq {
  /** slug or Pot id */
  pot: string
  /** through a gift link … */
  linkId?: string
  /** … or the public gift page */
  page?: true
  amount: string
  name?: string | null
  note?: string | null
  /** public page only: show my name (and note) on the page */
  showPublic?: boolean
  idempotencyKey: string
}

export interface GiftStartWire {
  ref: string
  pot: string
  amount: string
  /** the ft_transfer_call msg to sign: {"pot":"<dao>","gift":"<ref>"} */
  msg: string
}

export interface GiftPatchReq {
  name?: string | null
  note?: string | null
  showPublic?: boolean
}

/** One of my own gifts (You → Your activity). */
export interface MyGiftWire {
  ref: string
  pot: string
  slug: string
  potName: string
  potEmoji: string
  amount: string
  name: string | null
  note: string | null
  showPublic: boolean
  status: "pending" | "received" | "failed"
  at: string
  txHash: string | null
  tone: PayInTone
}

/**
 * The relayer's pre-flight hook (server/relay/*, hub 1.2.0 R1 gift msg): is this ref a gift our server started, for
 * this Pot, this amount and this sender, through a link that still works (or a public page that is still on)?
 * Implemented by server/features/gifts/validate.ts `validateGiftRef`.
 */
export type GiftRefCheck =
  | { ok: true; linkId: string | null }
  | {
      ok: false
      /** unknown_ref · wrong_pot · wrong_amount · wrong_sender · not_pending · link_revoked · link_expired · link_used · page_off */
      why: "unknown_ref" | "wrong_pot" | "wrong_amount" | "wrong_sender" | "not_pending" | "link_revoked" | "link_expired" | "link_used" | "page_off"
    }
