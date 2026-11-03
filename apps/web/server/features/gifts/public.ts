// Gifts: what anyone may read, by a gift link's id (`/g/<slug>/<id>`) or a Pot's slug (`/give/<slug>`). Used by the
// public GET routes and by the server components directly. Privacy (notes/backend.md "Privacy audit 2026-11-02"):
// only ledger facts (name, emoji, status, member count, totals), the link's own amount and note (written by a member
// FOR the givers, so public to whoever holds the link, and only while it works), the members' one-liner while the
// page is on, and the givers who chose "show my name" (page gifts). Never a member's name, never another note.
import "server-only"
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { gift, giftLink } from "@/db/schema"
import { GIFT_LINK_ID_RE } from "@/lib/gifts"
import type { GiftLandingRes, GiftPageRes, PublicGiftWire } from "@/lib/gifts-api"
import { ApiError } from "../../http/errors"
import { resolvePotId } from "../feed"
import { giftsEnabled, linkStatusOf, nowOf, pageOf, potInfo, takingOf, totalsOf, type GiftDeps } from "./core"

/** The newest this many opted-in givers on the public page. */
export const PUBLIC_GIVERS = 50

/** A gift link's landing; null = no such link (or the flag is off): the page 404s. */
export async function resolveGiftLanding(deps: GiftDeps, id: string): Promise<Omit<GiftLandingRes, "ok" | "requestId"> | null> {
  if (!giftsEnabled() || !GIFT_LINK_ID_RE.test(id)) return null
  const row = (await deps.db.select().from(giftLink).where(eq(giftLink.id, id)).limit(1))[0]
  if (!row) return null
  const info = await potInfo(deps, row.potId)
  if (!info) return null
  const status = linkStatusOf(row, nowOf(deps))
  const taking = await takingOf(deps.chain, row.potId, info.status)
  return {
    // a link that no longer works shows why, without the members' note
    link: { id: row.id, amount: row.amount, note: status === "active" ? row.note : null, status, expiresAt: row.expiresAt.toISOString(), tone: row.tone },
    pot: info,
    taking,
  }
}

/** A Pot's public gift page; null = no such Pot (or the flag is off). While the page is off: the Pot only. */
export async function resolveGiftPage(deps: GiftDeps, slug: string): Promise<Omit<GiftPageRes, "ok" | "requestId"> | null> {
  if (!giftsEnabled()) return null
  let potId: string
  try {
    potId = resolvePotId(slug, deps.cfg.hubId)
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
  const info = await potInfo(deps, potId)
  if (!info) return null
  const page = await pageOf(deps.db, potId)
  if (!page.on) return { pot: info, page: { on: false, line: null, tone: page.tone } }
  const [taking, totals, rows] = await Promise.all([
    takingOf(deps.chain, potId, info.status),
    totalsOf(deps, potId),
    deps.db
      .select({ name: gift.displayName, note: gift.note, amount: gift.amount, at: gift.receivedAt })
      .from(gift)
      .where(
        and(
          eq(gift.potId, potId),
          eq(gift.status, "received"),
          eq(gift.showPublic, true),
          isNull(gift.linkId),
          isNotNull(gift.displayName),
          isNotNull(gift.receivedAt),
        ),
      )
      .orderBy(desc(gift.receivedAt))
      .limit(PUBLIC_GIVERS),
  ])
  const givers: PublicGiftWire[] = rows.map((r) => ({ name: r.name!, note: r.note, amount: r.amount, at: r.at!.toISOString() }))
  return { pot: info, page, taking, totals, givers }
}
