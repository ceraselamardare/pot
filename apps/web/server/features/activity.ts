// GET /api/me/activity: the signed-in person's own history across every Pot (newest first, cursor pagination).
// Two sources, merged by (at, source, id) so a page boundary never drops or repeats a row:
//  - feed_event rows the person caused: pot_created, member_joined, contribution, spend_requested,
//    rules_change_proposed, rules_changed (actor), close_proposed; plus pot_closed rows whose payouts name them
//    (the refund at close);
//  - relay_log rows of their own approvals/declines (intent = vote, executed, success). What the approval was
//    about comes from the Pot's feed (the spend / close / rules request with that proposal id). Their own
//    automatic approval of something they asked for is part of the asking, so it isn't listed again.
// The chain stays the truth for statuses: the client merges these rows with what its chain views say
// (lib/client/activity.ts) and fills in what this DB never saw.
// Privacy (audit 2026-11-02): the rows are the person's own (on the public ledger anyway), but other people's chosen
// names (`profiles`) come only for Pots the person is still an active member of (hub.get_members, like the feed);
// someone who left a Pot, or a hub that can't be read, gets none (the client falls back to account-derived names).
import "server-only"
import { and, desc, eq, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm"
import type { Db } from "@/db/client"
import { appUser, feedEvent, pot, relayLog } from "@/db/schema"
import { activityKey, type ActivityApiItem, type ActivityApiPot, type ActivityApiRes } from "@/lib/activity-api"
import type { HubReader } from "../chain/hub"
import { ApiError } from "../http/errors"
import type { SessionCtx } from "../session/store"
import { b64url, fromB64url } from "../util/crypto"

const OWN_KINDS = ["pot_created", "member_joined", "contribution", "spend_requested", "rules_change_proposed", "rules_changed", "close_proposed"] as const
const SUBJECT_KINDS = ["spend_requested", "close_proposed", "rules_change_proposed"] as const
const STATUS_KINDS = ["spend_auto_approved", "spend_payout_failed", "proposal_synced"] as const

/** Sort/cursor position: newest first; at equal times feed rows (1) before votes (0), then id descending. */
interface Pos {
  at: Date
  src: 0 | 1
  id: string
}

export const encodeActivityCursor = (p: Pos) => b64url(new TextEncoder().encode(`${p.at.toISOString()}|${p.src}|${p.id}`))
export function decodeActivityCursor(c: string): Pos {
  try {
    const [iso, src, id] = new TextDecoder().decode(fromB64url(c)).split("|")
    const at = new Date(iso ?? "")
    if (Number.isNaN(at.getTime()) || (src !== "0" && src !== "1") || !id || id.length > 64) throw new Error()
    if (src === "1" && !/^[0-9]+$/.test(id)) throw new Error()
    return { at, src: src === "1" ? 1 : 0, id }
  } catch {
    throw new ApiError("bad_request", { detail: { field: "before" } })
  }
}

const cmp = (a: Pos, b: Pos): number => {
  const t = b.at.getTime() - a.at.getTime()
  if (t) return t
  if (a.src !== b.src) return b.src - a.src
  if (a.src === 1) return Number(b.id) - Number(a.id)
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {})
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^[0-9]+$/.test(v) ? Number(v) : undefined)

function potOf(r: { potId: string; slug: string | null; name: string | null; emoji: string | null; gradient: string | null }): ActivityApiPot {
  const slug = r.slug ?? r.potId.split(".")[0] ?? r.potId
  return { potId: r.potId, slug, name: r.name || slug, ...(r.emoji ? { emoji: r.emoji } : {}), ...(r.gradient ? { gradient: r.gradient } : {}) }
}

export async function getMyActivity(
  deps: { db: Db; hub: HubReader },
  s: SessionCtx,
  q: { before?: string; limit?: number },
): Promise<{ body: Omit<ActivityApiRes, "ok" | "requestId"> }> {
  const { db } = deps
  const me = s.user.nearAccount
  const lim = Math.min(Math.max(q.limit ?? 30, 1), 100)
  const cursor = q.before ? decodeActivityCursor(q.before) : null

  // ---- feed rows (src 1)
  const feedAfter: SQL | undefined = cursor
    ? cursor.src === 1
      ? or(lt(feedEvent.at, cursor.at), and(eq(feedEvent.at, cursor.at), lt(feedEvent.id, Number(cursor.id))))
      : lt(feedEvent.at, cursor.at) // same instant: feed rows sort before votes, so they were already served
    : undefined
  const refundOf = sql`${feedEvent.data} -> 'payouts' @> ${JSON.stringify([{ account_id: me }])}::jsonb`
  const feedRows = await db
    .select({
      id: feedEvent.id,
      potId: feedEvent.potId,
      kind: feedEvent.kind,
      actor: feedEvent.actor,
      subject: feedEvent.subject,
      amount: feedEvent.amount,
      proposalId: feedEvent.proposalId,
      category: feedEvent.category,
      path: feedEvent.path,
      txHash: feedEvent.txHash,
      at: feedEvent.at,
      data: feedEvent.data,
      slug: pot.slug,
      name: pot.name,
      emoji: pot.emoji,
      gradient: pot.gradient,
    })
    .from(feedEvent)
    .leftJoin(pot, eq(pot.daoId, feedEvent.potId))
    .where(
      and(
        or(and(eq(feedEvent.actor, me), inArray(feedEvent.kind, [...OWN_KINDS])), and(eq(feedEvent.kind, "pot_closed"), refundOf)),
        feedAfter,
      ),
    )
    .orderBy(desc(feedEvent.at), desc(feedEvent.id))
    .limit(lim + 1)

  // ---- own approvals/declines (src 0)
  // relay times carry microseconds; the cursor (a JS Date) has milliseconds, so compare and sort at ms precision
  const voteAt = sql`date_trunc('milliseconds', ${relayLog.createdAt})`
  const voteAfter: SQL | undefined = cursor
    ? cursor.src === 0
      ? or(lt(voteAt, cursor.at), and(eq(voteAt, cursor.at), lt(relayLog.id, cursor.id)))
      : lte(voteAt, cursor.at)
    : undefined
  const voteRows = await db
    .select({
      id: relayLog.id,
      potId: relayLog.potId,
      txHash: relayLog.outerTxHash,
      result: relayLog.result,
      at: relayLog.createdAt,
      slug: pot.slug,
      name: pot.name,
      emoji: pot.emoji,
      gradient: pot.gradient,
    })
    .from(relayLog)
    .leftJoin(pot, eq(pot.daoId, relayLog.potId))
    .where(
      and(
        eq(relayLog.userId, s.user.id),
        eq(relayLog.intent, "vote"),
        eq(relayLog.status, "executed"),
        eq(relayLog.outcome, "success"),
        sql`${relayLog.result} ->> 'action' in ('VoteApprove', 'VoteReject')`,
        voteAfter,
      ),
    )
    .orderBy(desc(voteAt), desc(relayLog.id))
    .limit(lim + 1)

  // what each approval was about, and the last known status of each asked spend (one query each)
  const pairs = new Map<string, { potId: string; pid: number }>()
  for (const v of voteRows) {
    const pid = int(obj(v.result).proposalId)
    if (v.potId && pid !== undefined) pairs.set(`${v.potId}|${pid}`, { potId: v.potId, pid })
  }
  for (const f of feedRows) if (f.kind === "spend_requested" && f.proposalId !== null) pairs.set(`${f.potId}|${f.proposalId}`, { potId: f.potId, pid: f.proposalId })
  const pots = [...new Set([...pairs.values()].map((p) => p.potId))]
  const pids = [...new Set([...pairs.values()].map((p) => p.pid))]
  const related = pairs.size
    ? await db
        .select({ potId: feedEvent.potId, kind: feedEvent.kind, actor: feedEvent.actor, amount: feedEvent.amount, proposalId: feedEvent.proposalId, status: feedEvent.status, data: feedEvent.data, at: feedEvent.at, id: feedEvent.id })
        .from(feedEvent)
        .where(and(inArray(feedEvent.potId, pots), inArray(feedEvent.proposalId, pids), inArray(feedEvent.kind, [...SUBJECT_KINDS, ...STATUS_KINDS])))
        .orderBy(feedEvent.at, feedEvent.id)
    : []
  const subjectOf = new Map<string, (typeof related)[number]>()
  const statusOf = new Map<string, string>()
  for (const r of related) {
    const k = `${r.potId}|${r.proposalId}`
    if (!pairs.has(k)) continue
    if ((SUBJECT_KINDS as readonly string[]).includes(r.kind)) subjectOf.set(k, r)
    else if (r.kind === "spend_auto_approved") statusOf.set(k, "paid")
    else if (r.kind === "spend_payout_failed") statusOf.set(k, "payout_failed")
    else if (r.kind === "proposal_synced" && r.status) statusOf.set(k, r.status)
  }

  type Row = { pos: Pos; item: ActivityApiItem | null }
  const rows: Row[] = []
  for (const f of feedRows) {
    const p = potOf(f)
    const d = obj(f.data)
    const base = { pot: p, at: f.at.toISOString(), ...(f.txHash ? { txHash: f.txHash } : {}) }
    let item: ActivityApiItem | null = null
    switch (f.kind) {
      case "pot_created":
        item = { ...base, key: activityKey.created(p.slug), kind: "created" }
        break
      case "member_joined":
        item = { ...base, key: activityKey.joined(p.slug, me), kind: "joined" }
        break
      case "contribution":
        item = f.txHash && f.amount ? { ...base, key: activityKey.added(f.txHash), kind: "added", amount: f.amount } : null
        break
      case "spend_requested": {
        const requestId = int(d.request_id)
        if (requestId === undefined) break
        const status = f.proposalId !== null ? statusOf.get(`${f.potId}|${f.proposalId}`) : undefined
        item = {
          ...base,
          key: activityKey.asked(p.slug, requestId),
          kind: "asked",
          requestId,
          ...(f.proposalId !== null ? { proposalId: f.proposalId } : {}),
          ...(f.amount ? { amount: f.amount } : {}),
          ...(f.path ? { path: f.path } : {}),
          ...(f.category ? { category: f.category } : {}),
          ...(f.subject ? { receiver: f.subject } : {}),
          ...(status ? { status } : f.path === "instant" ? { status: "paid" } : {}),
        }
        break
      }
      case "rules_change_proposed":
        item = f.proposalId !== null ? { ...base, key: activityKey.rulesAsked(p.slug, f.proposalId), kind: "rules_asked", proposalId: f.proposalId } : null
        break
      case "rules_changed":
        // a group change is applied by the last approval; only a sole member's direct change is "theirs"
        item = d.by === "sole_member" ? { ...base, key: activityKey.rulesChanged(p.slug, f.txHash ?? String(f.id)), kind: "rules_changed" } : null
        break
      case "close_proposed":
        item = f.proposalId !== null ? { ...base, key: activityKey.closeAsked(p.slug, f.proposalId), kind: "close_asked", proposalId: f.proposalId } : null
        break
      case "pot_closed": {
        const mine = Array.isArray(d.payouts) ? (d.payouts as unknown[]).map(obj).find((x) => x.account_id === me) : undefined
        const amount = typeof mine?.amount === "string" ? mine.amount : undefined
        item = amount && amount !== "0" ? { ...base, key: activityKey.refund(p.slug, me), kind: "refund", amount } : null
        break
      }
    }
    rows.push({ pos: { at: f.at, src: 1, id: String(f.id) }, item })
  }
  for (const v of voteRows) {
    const r = obj(v.result)
    const pid = int(r.proposalId)
    let item: ActivityApiItem | null = null
    if (v.potId && pid !== undefined) {
      const p = potOf({ ...v, potId: v.potId })
      const subject = subjectOf.get(`${v.potId}|${pid}`)
      const type = subject?.kind === "spend_requested" ? "spend" : subject?.kind === "close_proposed" ? "close" : subject?.kind === "rules_change_proposed" ? "rules" : "other"
      // the asker's own approval is part of asking (D-61), not a separate action
      if (!(subject && subject.actor === me)) {
        const requestId = subject ? int(obj(subject.data).request_id) : undefined
        item = {
          key: activityKey.voted(p.slug, pid, me),
          kind: "voted",
          pot: p,
          at: v.at.toISOString(),
          ...(v.txHash ? { txHash: v.txHash } : {}),
          proposalId: pid,
          vote: r.action === "VoteReject" ? "Reject" : "Approve",
          about: {
            type,
            ...(subject?.actor ? { actor: subject.actor } : {}),
            ...(type === "spend" && subject?.amount ? { amount: subject.amount } : {}),
            ...(requestId !== undefined ? { requestId } : {}),
          },
        }
      }
    }
    rows.push({ pos: { at: v.at, src: 0, id: v.id }, item })
  }

  // merge both sources, cut at the limit (every source row counts toward the page, so the cursor is exact)
  rows.sort((a, b) => cmp(a.pos, b.pos))
  const page = rows.slice(0, lim)
  const more = rows.length > lim || feedRows.length > lim || voteRows.length > lim
  const items = page.map((r) => r.item).filter((x): x is ActivityApiItem => x !== null)

  // names only from Pots I'm still in (fail closed: an unreadable member list gives none)
  const potsWithActors = [...new Set(items.filter((i) => i.about?.actor).map((i) => i.pot.potId))]
  const stillIn = new Set<string>()
  await Promise.all(
    potsWithActors.map(async (p) => {
      const ms = await deps.hub.getMembers(p).catch(() => [])
      if (ms.some((m) => m.account_id === me && m.status === "active")) stillIn.add(p)
    }),
  )
  const actors = [...new Set(items.filter((i) => stillIn.has(i.pot.potId)).map((i) => i.about?.actor).filter((x): x is string => !!x))]
  const profiles: Record<string, { name: string }> = {}
  if (actors.length) {
    const users = await db.select({ a: appUser.nearAccount, n: appUser.displayName }).from(appUser).where(inArray(appUser.nearAccount, actors))
    for (const u of users) profiles[u.a] = { name: u.n }
  }
  const body: Omit<ActivityApiRes, "ok" | "requestId"> = { items, profiles }
  if (more && page.length) body.nextCursor = encodeActivityCursor(page[page.length - 1]!.pos)
  return { body }
}
