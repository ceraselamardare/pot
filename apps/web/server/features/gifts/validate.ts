// Gifts: the relayer's pre-flight for a gift msg (`{"pot":X,"gift":"<ref>"}`, hub 1.2.0) and the failure mark.
// Pure DB, no chain: is this ref a gift our server started, for this Pot, this amount and this sender, through a link
// that still works (or a public page that is still on)? The hub checks the rest (open, gifts on, goal, bounds).
import "server-only"
import { and, eq, ne } from "drizzle-orm"
import type { Db, DbOrTx } from "@/db/client"
import { gift, giftLink, giftPage } from "@/db/schema"
import { GIFT_REF_RE } from "@/lib/gifts"
import type { GiftRefCheck } from "@/lib/gifts-api"
import { giftsEnabled, linkStatusOf, PENDING_TTL_MS } from "./core"

type LinkRow = typeof giftLink.$inferSelect
export type LinkBlock = "link_revoked" | "link_expired" | "link_used"

/**
 * Why a link no longer takes gifts (null = it does): revoked, expired, or a one-time link that is used (a gift on it
 * was received; `uses` counts those, the row check covers the moment between the event and the count).
 */
export async function linkBlock(db: DbOrTx, link: LinkRow, now: number, exceptRef?: string): Promise<LinkBlock | null> {
  const st = linkStatusOf(link, now)
  if (st === "revoked") return "link_revoked"
  if (st === "expired") return "link_expired"
  if (st === "used") return "link_used"
  if (!link.reusable) {
    const received = await db
      .select({ ref: gift.ref })
      .from(gift)
      .where(and(eq(gift.linkId, link.id), eq(gift.status, "received"), exceptRef ? ne(gift.ref, exceptRef) : undefined))
      .limit(1)
    if (received.length) return "link_used"
  }
  return null
}

export interface GiftRefQuery {
  pot: string
  ref: string
  /** Micro (base units) */
  amount: string | bigint
  /** the ft_transfer_call's signer (predecessor); checked when given */
  sender?: string
}

/** The relayer's pre-flight hook (lib/gifts-api.ts GiftRefCheck). Never throws for a bad input; DB errors do throw. */
export async function validateGiftRef(db: Db, q: GiftRefQuery, now: number = Date.now()): Promise<GiftRefCheck> {
  if (!giftsEnabled() || typeof q.ref !== "string" || !GIFT_REF_RE.test(q.ref)) return { ok: false, why: "unknown_ref" }
  const row = (await db.select().from(gift).where(eq(gift.ref, q.ref)).limit(1))[0]
  if (!row) return { ok: false, why: "unknown_ref" }
  if (row.potId !== q.pot) return { ok: false, why: "wrong_pot" }
  let amount: bigint
  try {
    amount = typeof q.amount === "bigint" ? q.amount : BigInt(q.amount)
  } catch {
    return { ok: false, why: "wrong_amount" }
  }
  if (amount !== BigInt(row.amount)) return { ok: false, why: "wrong_amount" }
  if (q.sender !== undefined && q.sender !== row.giverAccount) return { ok: false, why: "wrong_sender" }
  // received, failed, or a pending one nobody sent within a day
  if (row.status !== "pending" || row.createdAt.getTime() < now - PENDING_TTL_MS) return { ok: false, why: "not_pending" }
  if (row.linkId) {
    const link = (await db.select().from(giftLink).where(eq(giftLink.id, row.linkId)).limit(1))[0]
    if (!link) return { ok: false, why: "link_revoked" }
    const why = await linkBlock(db, link, now, row.ref)
    if (why) return { ok: false, why }
    return { ok: true, linkId: link.id }
  }
  const page = (await db.select({ on: giftPage.on }).from(giftPage).where(eq(giftPage.potId, row.potId)).limit(1))[0]
  if (!page?.on) return { ok: false, why: "page_off" }
  return { ok: true, linkId: null }
}

/** The relayer's 3(+1)-argument form: `validate(pot, ref, amount, sender?)`. */
export function giftRefValidator(db: Db): (pot: string, ref: string, amount: string | bigint, sender?: string) => Promise<GiftRefCheck> {
  return (pot, ref, amount, sender) => validateGiftRef(db, { pot, ref, amount, ...(sender !== undefined ? { sender } : {}) })
}

/** The transfer failed (the relayer saw the money bounce): pending → failed. Returns whether a row changed. */
export async function markGiftFailed(db: Db, ref: string): Promise<boolean> {
  if (!GIFT_REF_RE.test(ref)) return false
  const r = await db.update(gift).set({ status: "failed" }).where(and(eq(gift.ref, ref), eq(gift.status, "pending"))).returning({ ref: gift.ref })
  return r.length > 0
}
