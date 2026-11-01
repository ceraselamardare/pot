// GET /api/pots/[pot]/feed (X-05; api-spec §2.5): feed_event history (newest first, cursor pagination) plus
// enrichment. Everyone gets items (public on-chain data); rev4 (M-7): `profiles`, memos and decline reasons
// only for members. Display rules: a memo shows only if its author is the on-chain requester of that request_ref;
// a decline reason only if its author voted Reject. The lazy reconcile is Phase 2 (not here).
import "server-only"
import type * as Api from "@pot/sdk/api"
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { appUser, feedEvent, note } from "@/db/schema"
import type { HubReader } from "../chain/hub"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import type { SessionCtx } from "../session/store"
import { b64url, fromB64url } from "../util/crypto"
import { daoSlug, SLUG_RE } from "../util/ids"
import { commentCounts } from "./comments"
import { linkEnrichment } from "./paylink"
import { ensurePot, isMember } from "./notes"
import { avatarOrNull } from "@/lib/avatars"

export type FeedApiItem = Api.FeedApiItem

const TYPE: Record<string, FeedApiItem["type"]> = {
  member_joined: "joined",
  contribution: "contribution",
  spend_requested: "request",
  rules_changed: "rule_change",
  rules_change_proposed: "rule_change",
  close_proposed: "close_requested",
  pot_closed: "closed",
}

export function resolvePotId(param: string, hubId: string): string {
  const p = decodeURIComponent(param).toLowerCase()
  if (p.includes(".")) {
    if (!daoSlug(p, hubId)) throw new ApiError("pot_unknown")
    return p
  }
  if (!SLUG_RE.test(p) || p.length < 2 || p.length > 32) throw new ApiError("pot_unknown")
  return `${p}.${hubId}`
}

const encodeCursor = (at: Date, id: number) => b64url(new TextEncoder().encode(`${at.toISOString()}|${id}`))
function decodeCursor(c: string): { at: Date; id: number } {
  try {
    const [iso, id] = new TextDecoder().decode(fromB64url(c)).split("|")
    const at = new Date(iso ?? "")
    if (Number.isNaN(at.getTime()) || !/^[0-9]+$/.test(id ?? "")) throw new Error()
    return { at, id: Number(id) }
  } catch {
    throw new ApiError("bad_request", { detail: { field: "before" } })
  }
}

export async function getFeed(
  deps: { db: Db; hub: HubReader; cfg: Config },
  s: SessionCtx | null,
  potParam: string,
  q: { before?: string; limit?: number },
): Promise<{ body: Record<string, unknown>; cacheControl: string }> {
  const { db, hub, cfg } = deps
  const potId = resolvePotId(potParam, cfg.hubId)
  const potRow = await ensurePot(db, hub, cfg, potId)
  const lim = Math.min(Math.max(q.limit ?? 50, 1), 100)
  const member = !!s && (await isMember(hub, potId, s.user.nearAccount).catch(() => false))

  const cursor = q.before ? decodeCursor(q.before) : null
  const kinds = [...Object.keys(TYPE), "spend_payout_failed"] as (typeof feedEvent.$inferSelect)["kind"][]
  const rows = await db
    .select()
    .from(feedEvent)
    .where(
      and(
        eq(feedEvent.potId, potId),
        inArray(feedEvent.kind, kinds.filter((k) => k !== "spend_payout_failed")),
        cursor ? or(lt(feedEvent.at, cursor.at), and(eq(feedEvent.at, cursor.at), lt(feedEvent.id, cursor.id))) : undefined,
      ),
    )
    .orderBy(desc(feedEvent.at), desc(feedEvent.id))
    .limit(lim + 1)
  const page = rows.slice(0, lim)
  const pids = page.map((r) => r.proposalId).filter((x): x is number => x !== null)
  const failed = pids.length
    ? new Set(
        (
          await db
            .select({ p: feedEvent.proposalId })
            .from(feedEvent)
            .where(and(eq(feedEvent.potId, potId), eq(feedEvent.kind, "spend_payout_failed"), inArray(feedEvent.proposalId, pids)))
        ).map((r) => r.p),
      )
    : new Set<number | null>()

  const items: FeedApiItem[] = page.map((r) => {
    const it: FeedApiItem = { key: r.key, type: TYPE[r.kind]!, actor: r.actor ?? "", at: r.at.toISOString() }
    if (r.txHash) it.txHash = r.txHash
    if (r.amount) it.amount = r.amount
    if (r.proposalId !== null) it.proposalId = r.proposalId
    if (r.requestRef) it.requestRef = r.requestRef
    if (r.category) it.category = r.category as Api.Category
    if (r.path) it.path = r.path
    if (r.kind === "spend_requested" && r.subject) it.receiver = r.subject
    if (r.kind === "spend_requested" && r.proposalId !== null && failed.has(r.proposalId)) it.payoutFailed = true
    return it
  })

  const body: Record<string, unknown> = {
    pot: {
      potId,
      slug: potRow.slug,
      name: potRow.name,
      ...(potRow.emoji ? { emoji: potRow.emoji } : {}),
      ...(potRow.gradient ? { gradient: potRow.gradient } : {}),
    },
    items,
    profiles: {},
    syncedAt: new Date().toISOString(),
  }
  if (rows.length > lim) {
    const last = page[page.length - 1]!
    body.nextCursor = encodeCursor(last.at, last.id)
  }

  // profiles: members only (rev4 M-7). Every active (or joining) member is included, not just the actors on
  // this page: the creator often has no item (wave 3, request 3).
  if (member) {
    const members = await hub.getMembers(potId).catch(() => [])
    const accounts = [
      ...new Set([
        ...items.flatMap((i) => [i.actor, i.receiver].filter((x): x is string => !!x)),
        ...members.map((m) => m.account_id),
      ]),
    ]
    if (accounts.length) {
      const users = await db
        .select({ a: appUser.nearAccount, n: appUser.displayName, t: appUser.avatarTint, av: appUser.avatar })
        .from(appUser)
        .where(inArray(appUser.nearAccount, accounts))
      body.profiles = Object.fromEntries(users.map((u) => [u.a, { name: u.n, tint: u.t, avatarUrl: null, avatar: avatarOrNull(u.av) }]))
    }
  }

  if (member) {
    // memos: only when the author is the on-chain requester of that request_ref
    const requesterByRef = new Map(
      page.filter((r) => r.kind === "spend_requested" && r.requestRef).map((r) => [r.requestRef!, r.actor ?? ""]),
    )
    const memos: Record<string, string> = {}
    if (requesterByRef.size) {
      const ns = await db
        .select()
        .from(note)
        .where(and(eq(note.potId, potId), eq(note.kind, "memo"), inArray(note.ref, [...requesterByRef.keys()])))
      for (const n of ns) if (requesterByRef.get(n.ref) === n.authorAccount) memos[n.ref] = n.text
      // matched memos survive the 24 h cleanup of unmatched ones
      const matched = ns.filter((n) => requesterByRef.get(n.ref) === n.authorAccount && !n.matchedAt)
      for (const n of matched)
        await db
          .update(note)
          .set({ matchedAt: sql`now()` })
          .where(and(eq(note.potId, potId), eq(note.kind, "memo"), eq(note.ref, n.ref), eq(note.authorAccount, n.authorAccount)))
    }
    body.memos = memos
    // decline reasons: only when the author's vote on that proposal is Reject (bounded: ≤ 20 proposals)
    const declineReasons: Record<string, Record<string, string>> = {}
    const refs = [...new Set(page.filter((r) => r.kind === "spend_requested" && r.proposalId !== null).map((r) => String(r.proposalId)))]
    if (refs.length) {
      const ns = await db
        .select()
        .from(note)
        .where(and(eq(note.potId, potId), eq(note.kind, "decline_reason"), inArray(note.ref, refs)))
      const byPid = new Map<string, typeof ns>()
      for (const n of ns) byPid.set(n.ref, [...(byPid.get(n.ref) ?? []), n])
      for (const [pid, list] of [...byPid.entries()].slice(0, 20)) {
        const p = await hub.getProposal(potId, Number(pid)).catch(() => null)
        for (const n of list)
          if (p?.votes[n.authorAccount] === "Reject") (declineReasons[pid] ??= {})[n.authorAccount] = n.text
      }
    }
    body.declineReasons = declineReasons
    // comments on requests (off-chain): how many each request has, for the cards' count
    // (never fails the feed: a DB without migration 0003 just shows no counts)
    body.commentCounts = await commentCounts(db, potId).catch((e: unknown) => {
      console.error(JSON.stringify({ level: "error", where: "feed.commentCounts", err: String(e).slice(0, 200) }))
      return {}
    })
    // pay by link (hub 1.1.0): who each link is for (the requester's note) and who claimed it (Pot users' names only)
    Object.assign(
      body,
      await linkEnrichment(db, potId, page).catch((e: unknown) => {
        console.error(JSON.stringify({ level: "error", where: "feed.links", err: String(e).slice(0, 200) }))
        return { linkLabels: {}, linkClaimers: {} }
      }),
    )
  }

  const cacheControl = s ? "private, no-store" : "public, s-maxage=5, stale-while-revalidate=30"
  return { body, cacheControl }
}
