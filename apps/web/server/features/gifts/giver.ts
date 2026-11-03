// Gifts: what the giver does (signed in, any account; need not be a member). POST /api/gifts starts a gift (a
// `pending` row and a fresh ref; the browser then signs `usdc.ft_transfer_call(hub, amount, giftMsg(pot, ref))`
// through the relayer), PATCH /api/gifts/[ref] edits the giver's own name/note/"show my name", GET /api/me/gifts lists
// the giver's own gifts (with their own notes).
import "server-only"
import { and, desc, eq, gt, ne, or } from "drizzle-orm"
import type { Db } from "@/db/client"
import { gift, giftLink, giftPage, pot } from "@/db/schema"
import { checkGiftAmount, GIFT_MAX, GIFT_MIN, GIFT_NAME_MAX, GIFT_NOTE_MAX, GIFT_REF_RE, giftMsg, newGiftRef, optionalGiftText } from "@/lib/gifts"
import type { GiftStartWire, MyGiftWire } from "@/lib/gifts-api"
import { ApiError } from "../../http/errors"
import type { SessionCtx } from "../../session/store"
import { resolvePotId } from "../feed"
import { ensurePot } from "../notes"
import { chargeGiftQuotas, giftLimit, myGiftShape, nowOf, PENDING_TTL_MS, potInfo, RESERVATION_MS, takingOf, type GiftDeps } from "./core"
import type { GiftPatchBody, GiftStartBody } from "./schemas"
import { linkBlock } from "./validate"

/** At most this many of my own gifts. */
export const MY_GIFTS_LIMIT = 100

type GiftRow = typeof gift.$inferSelect

function textOrBad(field: string, raw: string | null | undefined, max: number): string | null {
  const r = optionalGiftText(raw, max)
  if (!r.ok) throw new ApiError("bad_request", { detail: { field, why: r.why } })
  return r.value
}

const linkRefusal = (cause: "link_revoked" | "link_expired" | "link_used") => new ApiError("action_not_allowed", { status: 409, detail: { cause } })

export async function startGift(
  deps: GiftDeps,
  s: SessionCtx,
  body: GiftStartBody,
  ctx: { ipHash: string },
): Promise<{ gift: GiftStartWire; replayed?: true; status: number }> {
  const { db, cfg } = deps
  if ((body.linkId === undefined) === (body.page === undefined))
    throw new ApiError("bad_request", { detail: { field: "linkId", cause: "link_or_page" } })
  const potId = resolvePotId(body.pot, cfg.hubId)
  const viaPage = body.page === true
  const name = textOrBad("name", body.name, GIFT_NAME_MAX)
  const note = textOrBad("note", body.note, GIFT_NOTE_MAX)
  // "show my name on the public page" exists only on the public page
  const showPublic = viaPage && body.showPublic === true
  const amount = BigInt(body.amount)
  const me = s.user.nearAccount
  const key = body.idempotencyKey
  const now = nowOf(deps)

  const shape = (r: GiftRow): GiftStartWire => ({ ref: r.ref, pot: r.potId, amount: r.amount, msg: giftMsg(r.potId, r.ref) })
  const byKey = async () => (await db.select().from(gift).where(and(eq(gift.giverAccount, me), eq(gift.clientKey, key))).limit(1))[0]
  const replay = (r: GiftRow) => {
    if (
      r.potId !== potId ||
      r.linkId !== (viaPage ? null : body.linkId) ||
      BigInt(r.amount) !== amount ||
      r.displayName !== name ||
      r.note !== note ||
      r.showPublic !== showPublic
    )
      throw new ApiError("idempotency_conflict")
    return { gift: shape(r), replayed: true as const, status: 200 }
  }
  const prior = await byKey()
  if (prior) return replay(prior)

  const potRow = await ensurePot(db, deps.hub, cfg, potId)

  // the way in: a link of this Pot that still works, or the Pot's public page while it's on
  let linkId: string | null = null
  let oneTime = false
  // "pay in": the words this one came with (its link's or the page's tone), kept on the row for the feed and the push
  let tone: GiftRow["tone"]
  if (viaPage) {
    const page = (await db.select({ on: giftPage.on, tone: giftPage.tone }).from(giftPage).where(eq(giftPage.potId, potRow.daoId)).limit(1))[0]
    if (!page?.on) throw new ApiError("not_found", { detail: { cause: "page_off" } })
    tone = page.tone
  } else {
    const link = (await db.select().from(giftLink).where(and(eq(giftLink.id, body.linkId!), eq(giftLink.potId, potRow.daoId))).limit(1))[0]
    if (!link) throw new ApiError("not_found", { detail: { cause: "link_unknown" } })
    const block = await linkBlock(db, link, now)
    if (block) throw linkRefusal(block)
    if (link.amount !== null && BigInt(link.amount) !== amount)
      throw new ApiError("args_invalid", { detail: { field: "amount", cause: "fixed_amount", amount: link.amount } })
    linkId = link.id
    oneTime = !link.reusable
    tone = link.tone
  }

  const c = checkGiftAmount(amount)
  if (!c.ok)
    throw c.why === "too_low"
      ? new ApiError("amount_too_low", { detail: { field: "amount", min: GIFT_MIN.toString() } })
      : new ApiError("amount_too_high", { detail: { field: "amount", max: GIFT_MAX.toString() } })

  // what the hub will check when the money arrives, as far as we can know it now
  const info = await potInfo(deps, potRow.daoId)
  const taking = await takingOf(deps.chain, potRow.daoId, info?.status ?? potRow.status)
  if (taking === "closed") throw new ApiError("pot_closed")
  if (taking === "off") throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "gifts_off" } })
  if (taking === "goal") throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "goal_collecting" } })

  // a one-time link someone else is sending through right now (a pending gift younger than 10 min)
  const reserved = async (tx: Pick<Db, "select">) =>
    oneTime &&
    (
      await tx
        .select({ ref: gift.ref })
        .from(gift)
        .where(and(eq(gift.linkId, linkId!), eq(gift.status, "pending"), ne(gift.giverAccount, me), gt(gift.createdAt, new Date(now - RESERVATION_MS))))
        .limit(1)
    ).length > 0
  if (await reserved(db)) throw linkRefusal("link_used")

  await chargeGiftQuotas(db, [
    { subject: `user:${s.user.id}`, action: "gift_start_burst", amount: 1n, limit: giftLimit("gifts_user_start_burst", cfg), period: "minute" },
    { subject: `user:${s.user.id}`, action: "gift_start", amount: 1n, limit: giftLimit("gifts_user_start", cfg) },
    { subject: `ip:${ctx.ipHash}`, action: "gift_start", amount: 1n, limit: giftLimit("gifts_ip_start", cfg) },
    { subject: `pot:${potRow.daoId}`, action: "gift_start", amount: 1n, limit: giftLimit("gifts_pot_start", cfg) },
  ])

  const values = {
    ref: newGiftRef(),
    potId: potRow.daoId,
    linkId,
    giverAccount: me,
    giverUserId: s.user.id,
    displayName: name,
    note,
    showPublic,
    amount: amount.toString(),
    clientKey: key,
    tone,
  }
  // one-time links: the reservation check and the insert under the link's row lock (two givers can't both get it)
  const row = await db.transaction(async (tx) => {
    if (oneTime) {
      await tx.select({ id: giftLink.id }).from(giftLink).where(eq(giftLink.id, linkId!)).for("update")
      if (await reserved(tx)) throw linkRefusal("link_used")
    }
    return (await tx.insert(gift).values(values).onConflictDoNothing().returning())[0]
  })
  if (!row) {
    // a concurrent start with the same key won the insert
    const raced = await byKey()
    if (raced) return replay(raced)
    throw new ApiError("internal")
  }
  return { gift: shape(row), status: 201 }
}

/** The giver edits their own gift; someone else's ref answers like a missing one. */
export async function patchGift(deps: GiftDeps, s: SessionCtx, ref: string, body: GiftPatchBody): Promise<{ gift: MyGiftWire }> {
  const { db } = deps
  if (!GIFT_REF_RE.test(ref)) throw new ApiError("not_found")
  const me = s.user.nearAccount
  const where = and(eq(gift.ref, ref), eq(gift.giverAccount, me))
  const row = (await db.select().from(gift).where(where).limit(1))[0]
  if (!row) throw new ApiError("not_found")
  const set: Partial<Pick<GiftRow, "displayName" | "note" | "showPublic">> = {}
  if (body.name !== undefined) set.displayName = textOrBad("name", body.name, GIFT_NAME_MAX)
  if (body.note !== undefined) set.note = textOrBad("note", body.note, GIFT_NOTE_MAX)
  if (body.showPublic !== undefined) {
    if (body.showPublic && row.linkId !== null) throw new ApiError("args_invalid", { detail: { field: "showPublic", cause: "page_only" } })
    set.showPublic = body.showPublic
  }
  await chargeGiftQuotas(db, [{ subject: `user:${s.user.id}`, action: "gift_patch", amount: 1n, limit: giftLimit("gifts_user_patch", deps.cfg) }])
  const [done] = await db.update(gift).set(set).where(where).returning()
  const p = (await db.select({ slug: pot.slug, name: pot.name, emoji: pot.emoji }).from(pot).where(eq(pot.daoId, done!.potId)).limit(1))[0]
  return { gift: myGiftShape(done!, p ?? { slug: done!.potId.split(".")[0]!, name: done!.potId, emoji: null }) }
}

/** My own gifts, newest first (≤ 100); pending ones nobody sent within a day are left out. */
export async function myGifts(deps: Pick<GiftDeps, "db" | "now">, s: SessionCtx): Promise<{ gifts: MyGiftWire[] }> {
  const now = nowOf(deps)
  const rows = await deps.db
    .select({ g: gift, slug: pot.slug, name: pot.name, emoji: pot.emoji })
    .from(gift)
    .innerJoin(pot, eq(pot.daoId, gift.potId))
    .where(and(eq(gift.giverAccount, s.user.nearAccount), or(ne(gift.status, "pending"), gt(gift.createdAt, new Date(now - PENDING_TTL_MS)))))
    .orderBy(desc(gift.createdAt))
    .limit(MY_GIFTS_LIMIT)
  return { gifts: rows.map((r) => myGiftShape(r.g, r)) }
}
