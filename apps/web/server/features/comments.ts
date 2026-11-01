// Comments on spend requests (GET/POST /api/pots/[pot]/requests/[id]/comments, DELETE …/comments/[commentId]):
// a short off-chain thread per (Pot, hub request id) so the group can talk about a spend inside Pot. Never on chain,
// no transactions. Members only: every call checks hub.get_members like notes and the feed's member-only fields
// (never the client's word). Text: cleanComment (1-280 code points, NFC, trimmed, line breaks allowed); React
// escapes it on render. Writes: per-user burst (10/min) + daily (200) quotas, an optional idempotency key so a
// retried send never posts twice. A delete is soft and the author's own only; the thread keeps "Comment removed".
import "server-only"
import type * as Api from "@pot/sdk/api"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { appUser, requestComment } from "@/db/schema"
import { avatarOrNull } from "@/lib/avatars"
import type { HubReader, RequestView } from "../chain/hub"
import { RpcUnavailableError } from "../chain/rpc"
import type { Config } from "../config"
import { ApiError, unavailable } from "../http/errors"
import { limit } from "../quotas"
import type { SessionCtx } from "../session/store"
import { cleanComment } from "@/lib/comment-text"
import { resolvePotId } from "./feed"
import { ensurePot, isMember } from "./notes"

/** The newest this many comments are returned (oldest first). */
export const THREAD_LIMIT = 200

const REQUEST_ID_RE = /^(0|[1-9][0-9]{0,8})$/
const COMMENT_ID_RE = /^[1-9][0-9]{0,15}$/

type Row = typeof requestComment.$inferSelect

/** What a new comment needs for its notifications (requester and earlier commenters, never the author). */
export interface PostedComment {
  pot: string
  requestId: number
  commentId: string
  actor: string
  requester: string
  amount: string
  category: string
  /** earlier commenters on this request (removed comments included), without the author */
  earlier: string[]
}

export interface CommentDeps {
  db: Db
  hub: HubReader
  cfg: Config
  /** after the insert (the route defers the push fan-out to after()) */
  onPosted?: (c: PostedComment) => void
}

export const commentShape = (r: Row): Api.RequestComment => ({
  id: String(r.id),
  author: r.authorAccount,
  body: r.deletedAt ? null : r.body,
  createdAt: r.createdAt.toISOString(),
  deleted: !!r.deletedAt,
})

export function parseRequestId(param: string): number {
  if (!REQUEST_ID_RE.test(param)) throw new ApiError("bad_request", { detail: { field: "id" } })
  return Number(param)
}

async function requireMember(hub: HubReader, potId: string, account: string): Promise<void> {
  if (!(await isMember(hub, potId, account))) throw new ApiError("not_a_member")
}

async function hubRequest(hub: HubReader, potId: string, requestId: number): Promise<RequestView | null> {
  try {
    const [r] = await hub.getRequests(potId, requestId, 1)
    return r && r.request_id === requestId ? r : null
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  }
}

export async function listComments(
  deps: CommentDeps,
  s: SessionCtx,
  potParam: string,
  idParam: string,
): Promise<Omit<Api.CommentsRes, "ok" | "requestId">> {
  const { db, hub, cfg } = deps
  const potId = resolvePotId(potParam, cfg.hubId)
  const requestId = parseRequestId(idParam)
  await ensurePot(db, hub, cfg, potId)
  await requireMember(hub, potId, s.user.nearAccount)
  const rows = (
    await db
      .select()
      .from(requestComment)
      .where(and(eq(requestComment.potId, potId), eq(requestComment.requestId, requestId)))
      .orderBy(desc(requestComment.createdAt), desc(requestComment.id))
      .limit(THREAD_LIMIT)
  ).reverse()
  const authors = [...new Set(rows.map((r) => r.authorAccount))]
  const profiles: Api.CommentsRes["profiles"] = {}
  if (authors.length) {
    const users = await db
      .select({ a: appUser.nearAccount, n: appUser.displayName, av: appUser.avatar })
      .from(appUser)
      .where(inArray(appUser.nearAccount, authors))
    for (const u of users) profiles[u.a] = { name: u.n, avatar: avatarOrNull(u.av) }
  }
  return { pot: potId, hubRequestId: requestId, comments: rows.map(commentShape), profiles }
}

export async function postComment(
  deps: CommentDeps,
  s: SessionCtx,
  potParam: string,
  idParam: string,
  input: { body: string; idempotencyKey?: string },
): Promise<{ comment: Api.RequestComment; replayed?: true; status: number }> {
  const { db, hub, cfg } = deps
  const potId = resolvePotId(potParam, cfg.hubId)
  const requestId = parseRequestId(idParam)
  const text = cleanComment(input.body)
  if (!text.ok) throw new ApiError("bad_request", { detail: { field: "body", why: text.why } })
  const author = s.user.nearAccount
  await ensurePot(db, hub, cfg, potId)
  await requireMember(hub, potId, author)

  const key = input.idempotencyKey ?? null
  const byKey = async () =>
    key
      ? (await db.select().from(requestComment).where(and(eq(requestComment.authorAccount, author), eq(requestComment.clientKey, key))).limit(1))[0]
      : undefined
  const replay = (r: Row) => {
    if (r.potId !== potId || r.requestId !== requestId || (!r.deletedAt && r.body !== text.value)) throw new ApiError("idempotency_conflict")
    return { comment: commentShape(r), replayed: true as const, status: 200 }
  }
  const prior = await byKey()
  if (prior) return replay(prior)

  const request = await hubRequest(hub, potId, requestId)
  if (!request) throw new ApiError("not_found", { detail: { field: "id" } })

  const q = await chargeQuotas(db, [
    { subject: `user:${s.user.id}`, action: "comment_burst", amount: 1n, limit: limit("user_comment_burst"), period: "minute", tag: "burst" },
    { subject: `user:${s.user.id}`, action: "comments", amount: 1n, limit: limit("user_comments"), tag: "family:comments" },
  ])
  if (!q.ok) {
    if (q.failed.tag === "burst") throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (Date.now() % 60_000), detail: { limit: Number(q.failed.limit) } })
    throw new ApiError("quota_exceeded", { detail: { family: "comments", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
  }

  const inserted = await db
    .insert(requestComment)
    .values({ potId, requestId, authorAccount: author, body: text.value, clientKey: key })
    .onConflictDoNothing()
    .returning()
  const row = inserted[0]
  if (!row) {
    // a concurrent send with the same key won the insert
    const raced = await byKey()
    if (raced) return replay(raced)
    throw new ApiError("internal")
  }

  if (deps.onPosted) {
    const earlier = await db
      .selectDistinct({ a: requestComment.authorAccount })
      .from(requestComment)
      .where(and(eq(requestComment.potId, potId), eq(requestComment.requestId, requestId)))
    deps.onPosted({
      pot: potId,
      requestId,
      commentId: String(row.id),
      actor: author,
      requester: request.requester,
      amount: request.amount,
      category: request.category,
      earlier: earlier.map((e) => e.a).filter((a) => a !== author),
    })
  }
  return { comment: commentShape(row), status: 201 }
}

export async function deleteComment(
  deps: CommentDeps,
  s: SessionCtx,
  potParam: string,
  idParam: string,
  commentParam: string,
): Promise<{ comment: Api.RequestComment }> {
  const { db, hub, cfg } = deps
  const potId = resolvePotId(potParam, cfg.hubId)
  const requestId = parseRequestId(idParam)
  if (!COMMENT_ID_RE.test(commentParam)) throw new ApiError("not_found")
  const author = s.user.nearAccount
  await requireMember(hub, potId, author)
  const where = and(eq(requestComment.id, Number(commentParam)), eq(requestComment.potId, potId), eq(requestComment.requestId, requestId))
  const row = (await db.select().from(requestComment).where(where).limit(1))[0]
  // someone else's comment answers like a missing one: only its author may remove it
  if (!row || row.authorAccount !== author) throw new ApiError("not_found")
  if (row.deletedAt) return { comment: commentShape(row) }
  const [done] = await db
    .update(requestComment)
    .set({ deletedAt: new Date(), body: "" })
    .where(and(where, eq(requestComment.authorAccount, author), isNull(requestComment.deletedAt)))
    .returning()
  return { comment: commentShape(done ?? (await db.select().from(requestComment).where(where).limit(1))[0]!) }
}

/** Per request: comments not removed (the feed's `commentCounts`, members only). */
export async function commentCounts(db: Db, potId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ r: requestComment.requestId, n: sql<number>`count(*)::int` })
    .from(requestComment)
    .where(and(eq(requestComment.potId, potId), isNull(requestComment.deletedAt)))
    .groupBy(requestComment.requestId)
  return Object.fromEntries(rows.map((r) => [String(r.r), Number(r.n)]))
}
