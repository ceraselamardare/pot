// Gifts: what the Pot's members do (signed in; members only, checked with hub.get_members on every call before any
// gift row is read, so an outsider gets the same 403 whether the thing exists or not): gift links (create, list the
// active ones, revoke), the received gifts with the givers' names and notes, and the public gift page switch.
import "server-only"
import { and, desc, eq, gt, isNull, or } from "drizzle-orm"
import { gift, giftLink, giftPage } from "@/db/schema"
import { checkGiftAmount, GIFT_LINK_ID_RE, GIFT_LINK_TTL_MS, GIFT_LINE_MAX, GIFT_NOTE_MAX, newGiftLinkId, optionalGiftText } from "@/lib/gifts"
import type { GiftLinkWire, GiftPageWire, GiftsRes } from "@/lib/gifts-api"
import { ApiError } from "../../http/errors"
import type { SessionCtx } from "../../session/store"
import { resolvePotId } from "../feed"
import { ensurePot } from "../notes"
import {
  chargeGiftQuotas,
  giftLimit,
  giftShape,
  linkShape,
  nowOf,
  pageOf,
  potInfo,
  requireGiftMember,
  totalsOf,
  type GiftDeps,
} from "./core"
import type { GiftLinkCreateBody, GiftPagePutBody } from "./schemas"

/** At most this many links / gifts in a list. */
export const LIST_LIMIT = 200

async function memberPot(deps: GiftDeps, s: SessionCtx, potParam: string) {
  const potId = resolvePotId(potParam, deps.cfg.hubId)
  const row = await ensurePot(deps.db, deps.hub, deps.cfg, potId)
  await requireGiftMember(deps.hub, potId, s.user.nearAccount)
  return row
}

/** Amount: null = the giver chooses; else $1..$10,000 (→ amount_too_low / amount_too_high). */
function linkAmount(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const c = checkGiftAmount(BigInt(raw))
  if (!c.ok) throw new ApiError(c.why === "too_low" ? "amount_too_low" : "amount_too_high", { detail: { field: "amount" } })
  return BigInt(raw).toString()
}

function textOrBad(field: string, raw: string | null | undefined, max: number): string | null {
  const r = optionalGiftText(raw, max)
  if (!r.ok) throw new ApiError("bad_request", { detail: { field, why: r.why } })
  return r.value
}

export async function createGiftLink(
  deps: GiftDeps,
  s: SessionCtx,
  potParam: string,
  body: GiftLinkCreateBody,
): Promise<{ link: GiftLinkWire; replayed?: true; status: number }> {
  const { db } = deps
  const potRow = await memberPot(deps, s, potParam)
  const amount = linkAmount(body.amount)
  const note = textOrBad("note", body.note, GIFT_NOTE_MAX)
  const reusable = body.reusable ?? true
  const me = s.user.nearAccount
  const key = body.idempotencyKey ?? null
  const now = nowOf(deps)

  const byKey = async () =>
    key ? (await db.select().from(giftLink).where(and(eq(giftLink.createdBy, me), eq(giftLink.clientKey, key))).limit(1))[0] : undefined
  const replay = (r: typeof giftLink.$inferSelect) => {
    if (r.potId !== potRow.daoId || r.amount !== amount || r.note !== note || r.reusable !== reusable) throw new ApiError("idempotency_conflict")
    return { link: linkShape(r, potRow.slug, now), replayed: true as const, status: 200 }
  }
  const prior = await byKey()
  if (prior) return replay(prior)

  // a link to a Pot that is closing or closed would only ever say "closed"
  const info = await potInfo(deps, potRow.daoId)
  if (info && info.status !== "open") throw new ApiError("pot_closed")

  await chargeGiftQuotas(db, [
    { subject: `user:${s.user.id}`, action: "gift_link_burst", amount: 1n, limit: giftLimit("gifts_user_link_burst", deps.cfg), period: "minute" },
    { subject: `user:${s.user.id}`, action: "gift_link", amount: 1n, limit: giftLimit("gifts_user_link", deps.cfg) },
  ])
  const [row] = await db
    .insert(giftLink)
    .values({ id: newGiftLinkId(), potId: potRow.daoId, createdBy: me, amount, note, reusable, expiresAt: new Date(now + GIFT_LINK_TTL_MS), clientKey: key })
    .onConflictDoNothing()
    .returning()
  if (!row) {
    // a concurrent create with the same key won the insert
    const raced = await byKey()
    if (raced) return replay(raced)
    throw new ApiError("internal")
  }
  return { link: linkShape(row, potRow.slug, now), status: 201 }
}

/** The Pot's links that still work (not revoked, not expired, not a used one-time link), newest first. */
export async function listGiftLinks(deps: GiftDeps, s: SessionCtx, potParam: string): Promise<{ links: GiftLinkWire[] }> {
  const potRow = await memberPot(deps, s, potParam)
  const now = nowOf(deps)
  const rows = await deps.db
    .select()
    .from(giftLink)
    .where(
      and(
        eq(giftLink.potId, potRow.daoId),
        isNull(giftLink.revokedAt),
        gt(giftLink.expiresAt, new Date(now)),
        or(eq(giftLink.reusable, true), eq(giftLink.uses, 0)),
      ),
    )
    .orderBy(desc(giftLink.createdAt))
    .limit(LIST_LIMIT)
  return { links: rows.map((r) => linkShape(r, potRow.slug, now)) }
}

/** Any member may revoke any of the Pot's links; idempotent. Another Pot's link (or none) → 404. */
export async function revokeGiftLink(deps: GiftDeps, s: SessionCtx, potParam: string, id: string): Promise<{ link: GiftLinkWire }> {
  const potRow = await memberPot(deps, s, potParam)
  if (!GIFT_LINK_ID_RE.test(id)) throw new ApiError("not_found", { detail: { cause: "link_unknown" } })
  const now = nowOf(deps)
  const where = and(eq(giftLink.id, id), eq(giftLink.potId, potRow.daoId))
  const row = (await deps.db.select().from(giftLink).where(where).limit(1))[0]
  if (!row) throw new ApiError("not_found", { detail: { cause: "link_unknown" } })
  if (row.revokedAt) return { link: linkShape(row, potRow.slug, now) }
  const [done] = await deps.db
    .update(giftLink)
    .set({ revokedAt: new Date(now), revokedBy: s.user.nearAccount })
    .where(and(where, isNull(giftLink.revokedAt)))
    .returning()
  return { link: linkShape(done ?? (await deps.db.select().from(giftLink).where(where).limit(1))[0]!, potRow.slug, now) }
}

/** Every received gift with the givers' names and notes (members only), newest first; totals; the page. */
export async function listPotGifts(deps: GiftDeps, s: SessionCtx, potParam: string): Promise<Omit<GiftsRes, "ok" | "requestId">> {
  const potRow = await memberPot(deps, s, potParam)
  const [rows, totals, page] = await Promise.all([
    deps.db
      .select()
      .from(gift)
      .where(and(eq(gift.potId, potRow.daoId), eq(gift.status, "received")))
      .orderBy(desc(gift.receivedAt), desc(gift.createdAt))
      .limit(LIST_LIMIT),
    totalsOf(deps, potRow.daoId),
    pageOf(deps.db, potRow.daoId),
  ])
  return { gifts: rows.map(giftShape), totals, page }
}

/** Turn the public page on/off; `line` absent = keep, null/"" = remove, else cleaned (≤ 100). */
export async function putGiftPage(deps: GiftDeps, s: SessionCtx, potParam: string, body: GiftPagePutBody): Promise<{ page: GiftPageWire }> {
  const potRow = await memberPot(deps, s, potParam)
  const line = body.line === undefined ? undefined : textOrBad("line", body.line, GIFT_LINE_MAX)
  if (body.on) {
    const info = await potInfo(deps, potRow.daoId)
    if (info && info.status !== "open") throw new ApiError("pot_closed")
  }
  await chargeGiftQuotas(deps.db, [{ subject: `user:${s.user.id}`, action: "gift_page", amount: 1n, limit: giftLimit("gifts_user_page", deps.cfg) }])
  const set = { on: body.on, ...(line !== undefined ? { line } : {}), updatedBy: s.user.nearAccount, updatedAt: new Date(nowOf(deps)) }
  await deps.db
    .insert(giftPage)
    .values({ potId: potRow.daoId, line: line ?? null, ...set })
    .onConflictDoUpdate({ target: giftPage.potId, set })
  return { page: await pageOf(deps.db, potRow.daoId) }
}
