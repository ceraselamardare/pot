// "Ask for a top-up" (2026-11-03; rules in lib/topups.ts, wire in lib/topups-api.ts): a member asks everyone in the
// Pot to add more money, and members nudge the people who haven't added. Off-chain only: no transaction, no contract
// change. Progress is read from the hub (get_members.contributed − the baseline saved with the ask).
// Members only, like comments and notes: every call checks hub.get_members (active) on the server, never the client's
// word; a person who left loses access (≤ 10 s, the reader's cache). The reason is the asker's words: it reaches the
// Pot's active members only (the API, the card, the push).
// Ending: an open ask is closed lazily wherever it's read (everyone added → `done`, its date passed → `due`), and by
// the daily job (reconcileTopups), which also sends the gentle reminder the day before it's due.
import "server-only"
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import type { Db, DbOrTx } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { appUser, nudge, pot, pushSubscription, topupRequest } from "@/db/schema"
import { avatarOrNull } from "@/lib/avatars"
import {
  checkTopupAmount,
  cleanReason,
  dueOk,
  leftOf,
  NUDGE_WINDOW_MS,
  progressOf,
  statusOf,
  TOPUP_DUE_DEFAULT_DAYS,
  TOPUP_MAX,
  TOPUP_MIN,
  TOPUP_REMIND_WITHIN_MS,
  type MemberProgress,
  type TopupMode,
  type TopupStatus,
} from "@/lib/topups"
import type { MyTopupsRes, NudgeRes, NudgeSkip, ProfilesWire, TopupWire } from "@/lib/topups-api"
import type { HubReader } from "../chain/hub"
import { RpcUnavailableError } from "../chain/rpc"
import type { Config } from "../config"
import { ApiError, unavailable } from "../http/errors"
import { limit } from "../quotas"
import type { SessionCtx } from "../session/store"
import { errText } from "../util/errtext"
import { MICRO_RE } from "../util/ids"
import { resolvePotId } from "./feed"
import { ensurePot } from "./notes"

type Row = typeof topupRequest.$inferSelect
type PotRow = { daoId: string; slug: string; name: string; emoji: string | null }
interface Baseline {
  a: string
  c: string
}

const ID_RE = /^[1-9][0-9]{0,15}$/
const DAY = 86_400_000
/** recent asks on a Pot (ended / cancelled) returned with the open one */
const RECENT = 20

/** A new ask, for its push (members asked, minus the asker). */
export interface AskedTopup {
  pot: string
  id: string
  actor: string
  /** Micro string: each person's part */
  amount: string
  reason: string | null
  recipients: string[]
}

/** Nudges just saved, for their pushes (one per person). */
export interface NudgedPeople {
  pot: string
  actor: string
  topupId: string | null
  nudges: { id: string; to: string; amount?: string }[]
}

export interface TopupDeps {
  db: Db
  hub: HubReader
  cfg: Config
  onAsked?: (a: AskedTopup) => void
  onNudged?: (n: NudgedPeople) => void
  now?: () => number
}

const nowOf = (deps: { now?: () => number }) => (deps.now ? deps.now() : Date.now())

// ------------------------------------------------------------------------------------------------- reading

interface Member {
  account: string
  contributed: bigint
}

/** The Pot's active members in join order, with what each has put in (hub get_members). */
async function activeMembers(hub: HubReader, potId: string, fresh = false): Promise<Member[]> {
  try {
    return (await hub.getMembers(potId, { fresh }))
      .filter((m) => m.status === "active")
      .sort((a, b) => a.join_index - b.join_index)
      .map((m) => ({ account: m.account_id, contributed: BigInt(/^[0-9]+$/.test(m.contributed ?? "") ? m.contributed : "0") }))
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  }
}

async function requireMember(hub: HubReader, potId: string, account: string, fresh = false): Promise<Member[]> {
  const members = await activeMembers(hub, potId, fresh)
  if (!members.some((m) => m.account === account)) throw new ApiError("not_a_member")
  return members
}

const isOpen = (r: Row) => !r.closedAt && !r.cancelledAt
const baselinesOf = (r: Row): Baseline[] => (Array.isArray(r.baselines) ? (r.baselines as Baseline[]) : [])

/** Who was asked and how far each one is: live (open: from the hub now) or frozen (ended / cancelled). */
export function progressFor(r: Row, members: readonly Member[] | null): MemberProgress[] {
  const part = BigInt(r.perPerson)
  const base = baselinesOf(r)
  if (!isOpen(r)) {
    const snap = (r.progress ?? {}) as Record<string, string>
    return base
      .filter((b) => b.a in snap)
      .map((b) => {
        const added = BigInt(snap[b.a]!)
        return { account: b.a, part, added, done: added >= part }
      })
  }
  const now = new Map((members ?? []).map((m) => [m.account, m.contributed]))
  return progressOf(
    base.map((b) => ({ account: b.a, baseline: BigInt(b.c), contributed: now.get(b.a) ?? null })),
    part,
  )
}

const snapshot = (p: readonly MemberProgress[]) => Object.fromEntries(p.map((x) => [x.account, x.added.toString()]))

export function rowStatus(r: Row, progress: readonly MemberProgress[], now: number): TopupStatus {
  return statusOf(
    { cancelledAt: r.cancelledAt?.getTime() ?? null, closedCause: r.closeCause === "done" || r.closeCause === "due" ? r.closeCause : null },
    progress,
    r.dueAt.getTime(),
    now,
  )
}

/** An open ask whose people all added, or whose date passed, is closed now (once: guarded on still being open). */
async function settle(db: DbOrTx, r: Row, progress: readonly MemberProgress[], now: number): Promise<Row> {
  if (!isOpen(r)) return r
  const status = rowStatus(r, progress, now)
  if (status !== "done" && status !== "ended") return r
  const [done] = await db
    .update(topupRequest)
    .set({ closedAt: new Date(now), closeCause: status === "done" ? "done" : "due", progress: snapshot(progress) })
    .where(and(eq(topupRequest.id, r.id), isNull(topupRequest.closedAt), isNull(topupRequest.cancelledAt)))
    .returning()
  return done ?? (await db.select().from(topupRequest).where(eq(topupRequest.id, r.id)).limit(1))[0] ?? r
}

/** person → the newest nudge they got in this Pot in the last 24 h (ms). */
async function lastNudges(db: DbOrTx, potId: string, accounts: readonly string[], now: number): Promise<Record<string, number>> {
  if (accounts.length === 0) return {}
  const rows = await db
    .select({ t: nudge.targetAccount, at: sql<Date>`max(${nudge.createdAt})` })
    .from(nudge)
    .where(and(eq(nudge.potId, potId), inArray(nudge.targetAccount, [...accounts]), gt(nudge.createdAt, new Date(now - NUDGE_WINDOW_MS))))
    .groupBy(nudge.targetAccount)
  return Object.fromEntries(rows.map((r) => [r.t, new Date(r.at).getTime()]))
}

function toWire(r: Row, p: PotRow, progress: readonly MemberProgress[], nudged: Record<string, number>, now: number): TopupWire {
  return {
    id: String(r.id),
    pot: r.potId,
    slug: p.slug,
    potName: p.name,
    potEmoji: p.emoji ?? "",
    createdBy: r.createdBy,
    mode: r.mode === "total" ? "total" : "each",
    perPerson: r.perPerson,
    total: r.total,
    reason: r.reason,
    dueAt: r.dueAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    status: rowStatus(r, progress, now),
    endedAt: (r.closedAt ?? r.cancelledAt)?.toISOString() ?? null,
    members: progress.map((m) => ({
      account: m.account,
      part: m.part.toString(),
      added: m.added.toString(),
      done: m.done,
      nudgedAt: nudged[m.account] !== undefined ? new Date(nudged[m.account]!).toISOString() : null,
    })),
  }
}

export function parseTopupId(param: string): number {
  if (!ID_RE.test(param)) throw new ApiError("not_found", { detail: { field: "id" } })
  return Number(param)
}

async function potRows(db: DbOrTx, ids: readonly string[]): Promise<Map<string, PotRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ daoId: pot.daoId, slug: pot.slug, name: pot.name, emoji: pot.emoji }).from(pot).where(inArray(pot.daoId, [...ids]))
  return new Map(rows.map((r) => [r.daoId, r]))
}

/** The open ask on a Pot, settled (null once it ended). */
async function openAsk(db: DbOrTx, potId: string, members: readonly Member[], now: number): Promise<{ row: Row; progress: MemberProgress[] } | null> {
  const row = (await db.select().from(topupRequest).where(and(eq(topupRequest.potId, potId), isNull(topupRequest.closedAt), isNull(topupRequest.cancelledAt))).limit(1))[0]
  if (!row) return null
  const progress = progressFor(row, members)
  const settled = await settle(db, row, progress, now)
  return isOpen(settled) ? { row: settled, progress } : null
}

// ------------------------------------------------------------------------------------------------- GET (members)

/** GET /api/pots/[pot]/topups: the open ask (live progress, who was nudged today) and the recent ones. */
export async function listTopups(deps: TopupDeps, s: SessionCtx, potParam: string): Promise<{ topups: TopupWire[] }> {
  const { db, hub, cfg } = deps
  const now = nowOf(deps)
  const potId = resolvePotId(potParam, cfg.hubId)
  const p = await ensurePot(db, hub, cfg, potId)
  const members = await requireMember(hub, potId, s.user.nearAccount)
  const rows = await db.select().from(topupRequest).where(eq(topupRequest.potId, potId)).orderBy(desc(topupRequest.createdAt), desc(topupRequest.id)).limit(RECENT + 1)
  const out: TopupWire[] = []
  for (let r of rows) {
    if (isOpen(r)) r = await settle(db, r, progressFor(r, members), now)
    // an ask that just ended reads from its frozen progress, like any other ended one
    const progress = progressFor(r, members)
    const nudged = isOpen(r) ? await lastNudges(db, potId, progress.map((m) => m.account), now) : {}
    out.push(toWire(r, p, progress, nudged, now))
  }
  // the open one first (there's at most one)
  out.sort((a, b) => Number(b.status === "open") - Number(a.status === "open"))
  return { topups: out }
}

// ------------------------------------------------------------------------------------------------- POST (ask)

export interface AskInput {
  mode: TopupMode
  amount: string
  reason?: string | null
  dueAt?: string
  idempotencyKey: string
}

/** POST /api/pots/[pot]/topups: ask everyone in the Pot for more money. */
export async function askTopup(deps: TopupDeps, s: SessionCtx, potParam: string, input: AskInput): Promise<{ topup: TopupWire; status: number; replayed?: true }> {
  const { db, hub, cfg } = deps
  const now = nowOf(deps)
  const potId = resolvePotId(potParam, cfg.hubId)
  const me = s.user.nearAccount
  if (!MICRO_RE.test(input.amount)) throw new ApiError("bad_request", { detail: { field: "amount" } })
  const amount = BigInt(input.amount)
  const reason = cleanReason(input.reason)
  if (!reason.ok) throw new ApiError("bad_request", { detail: { field: "reason", why: reason.why } })
  const dueAt = input.dueAt === undefined ? now + TOPUP_DUE_DEFAULT_DAYS * DAY : Date.parse(input.dueAt)
  if (!Number.isFinite(dueAt) || !dueOk(dueAt, now)) throw new ApiError("bad_request", { detail: { field: "dueAt" } })
  const p = await ensurePot(db, hub, cfg, potId)
  const members = await requireMember(hub, potId, me, true)

  // a retry with the same key: the same ask back (another body under that key: a conflict)
  const prior = (await db.select().from(topupRequest).where(and(eq(topupRequest.createdBy, me), eq(topupRequest.clientKey, input.idempotencyKey))).limit(1))[0]
  if (prior) {
    const same = prior.potId === potId && prior.mode === input.mode && (prior.mode === "each" ? prior.perPerson : prior.total) === input.amount && prior.reason === reason.value
    if (!same) throw new ApiError("idempotency_conflict")
    const progress = progressFor(prior, members)
    return { topup: toWire(prior, p, progress, await lastNudges(db, potId, progress.map((m) => m.account), now), now), status: 200, replayed: true }
  }

  let view
  try {
    view = await hub.getPot(potId, { fresh: true })
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  }
  if (!view) throw new ApiError("pot_unknown")
  if (view.status !== "open") throw new ApiError("pot_closed")
  if (members.length < 2) throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "alone" } })
  const check = checkTopupAmount(input.mode, amount, members.length)
  if (!check.ok)
    throw check.why === "too_low"
      ? new ApiError("amount_too_low", { detail: { min: TOPUP_MIN.toString() } })
      : new ApiError("amount_too_high", { detail: { max: TOPUP_MAX.toString() } })

  // one open ask per Pot (the partial unique index backs this up against a race)
  const open = await openAsk(db, potId, members, now)
  if (open) throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "topup_open", id: String(open.row.id) } })

  const q = await chargeQuotas(db, [
    { subject: `user:${s.user.id}`, action: "topup_burst", amount: 1n, limit: limit("user_topup_burst"), period: "minute", tag: "burst" },
    { subject: `user:${s.user.id}`, action: "topups", amount: 1n, limit: limit("user_topups"), tag: "family:topups" },
  ])
  if (!q.ok) {
    if (q.failed.tag === "burst") throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (now % 60_000), detail: { limit: Number(q.failed.limit) } })
    throw new ApiError("quota_exceeded", { detail: { family: "topups", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
  }

  const inserted = await db
    .insert(topupRequest)
    .values({
      potId,
      createdBy: me,
      mode: input.mode,
      perPerson: check.part.toString(),
      total: check.total.toString(),
      reason: reason.value,
      dueAt: new Date(dueAt),
      baselines: members.map((m) => ({ a: m.account, c: m.contributed.toString() })),
      clientKey: input.idempotencyKey,
      createdAt: new Date(now),
    })
    .onConflictDoNothing()
    .returning()
  const row = inserted[0]
  if (!row) {
    // a concurrent ask won the Pot's one open slot (or the same key raced)
    const raced = (await db.select().from(topupRequest).where(and(eq(topupRequest.createdBy, me), eq(topupRequest.clientKey, input.idempotencyKey))).limit(1))[0]
    if (raced) return askTopup(deps, s, potParam, input)
    const other = await openAsk(db, potId, members, now)
    throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "topup_open", ...(other ? { id: String(other.row.id) } : {}) } })
  }
  const progress = progressFor(row, members)
  deps.onAsked?.({ pot: potId, id: String(row.id), actor: me, amount: row.perPerson, reason: row.reason, recipients: members.map((m) => m.account).filter((a) => a !== me) })
  return { topup: toWire(row, p, progress, {}, now), status: 201 }
}

// ------------------------------------------------------------------------------------------------- DELETE (cancel)

/** DELETE /api/pots/[pot]/topups/[id]: the asker cancels their open ask (a second cancel answers the same). */
export async function cancelTopup(deps: TopupDeps, s: SessionCtx, potParam: string, idParam: string): Promise<{ topup: TopupWire }> {
  const { db, hub, cfg } = deps
  const now = nowOf(deps)
  const potId = resolvePotId(potParam, cfg.hubId)
  const id = parseTopupId(idParam)
  const me = s.user.nearAccount
  const p = await ensurePot(db, hub, cfg, potId)
  const members = await requireMember(hub, potId, me)
  let row = (await db.select().from(topupRequest).where(and(eq(topupRequest.id, id), eq(topupRequest.potId, potId))).limit(1))[0]
  if (!row) throw new ApiError("not_found", { detail: { field: "id" } })
  if (row.createdBy !== me) throw new ApiError("action_not_allowed", { detail: { cause: "not_asker" } })
  if (row.cancelledAt) return { topup: toWire(row, p, progressFor(row, members), {}, now) }
  const progress = progressFor(row, members)
  row = await settle(db, row, progress, now)
  if (!isOpen(row)) throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "topup_ended" } })
  const q = await chargeQuotas(db, [{ subject: `user:${s.user.id}`, action: "topup_burst", amount: 1n, limit: limit("user_topup_burst"), period: "minute", tag: "burst" }])
  if (!q.ok) throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (now % 60_000) })
  const [done] = await db
    .update(topupRequest)
    .set({ cancelledAt: new Date(now), progress: snapshot(progress) })
    .where(and(eq(topupRequest.id, id), isNull(topupRequest.closedAt), isNull(topupRequest.cancelledAt)))
    .returning()
  const final = done ?? (await db.select().from(topupRequest).where(eq(topupRequest.id, id)).limit(1))[0]!
  return { topup: toWire(final, p, progressFor(final, members), {}, now) }
}

// ------------------------------------------------------------------------------------------------- GET /api/me/topups

/** Open asks in the Pots I'm still in where I'm asked and haven't added yet (Requests), and the asks I made (Your activity). */
export async function myTopups(deps: TopupDeps, s: SessionCtx): Promise<Omit<MyTopupsRes, "ok" | "requestId">> {
  const { db, hub } = deps
  const now = nowOf(deps)
  const me = s.user.nearAccount
  const openRows = await db
    .select()
    .from(topupRequest)
    .where(and(isNull(topupRequest.closedAt), isNull(topupRequest.cancelledAt), sql`${topupRequest.baselines} @> ${JSON.stringify([{ a: me }])}::jsonb`))
    .orderBy(desc(topupRequest.createdAt))
    .limit(50)
  const mineRows = await db
    .select()
    .from(topupRequest)
    .where(and(eq(topupRequest.createdBy, me), gt(topupRequest.createdAt, new Date(now - 90 * DAY))))
    .orderBy(desc(topupRequest.createdAt), desc(topupRequest.id))
    .limit(50)
  const potIds = [...new Set([...openRows, ...mineRows].map((r) => r.potId))]
  // only Pots I'm still in (a person who left sees none of it, their own asks included)
  const membersOf = new Map<string, Member[]>()
  for (const id of potIds) {
    try {
      const ms = await activeMembers(hub, id)
      if (ms.some((m) => m.account === me)) membersOf.set(id, ms)
    } catch (e) {
      console.error(JSON.stringify({ level: "error", where: "topups.mine", err: errText(e, 200) }))
    }
  }
  const pots = await potRows(db, [...membersOf.keys()])
  const wire = async (r: Row): Promise<TopupWire | null> => {
    const members = membersOf.get(r.potId)
    const p = pots.get(r.potId)
    if (!members || !p) return null
    let progress = progressFor(r, members)
    if (isOpen(r)) {
      r = await settle(db, r, progress, now)
      if (!isOpen(r)) progress = progressFor(r, members)
    }
    const nudged = isOpen(r) ? await lastNudges(db, r.potId, progress.map((m) => m.account), now) : {}
    return toWire(r, p, progress, nudged, now)
  }
  const open = (await Promise.all(openRows.map(wire))).filter((w): w is TopupWire => !!w && w.status === "open" && w.members.some((m) => m.account === me && !m.done))
  const mine = (await Promise.all(mineRows.map(wire))).filter((w): w is TopupWire => !!w)
  // the chosen names of the askers and the people asked (all in Pots I'm in: members-only data for a member)
  const people = [...new Set([...open, ...mine].flatMap((w) => [w.createdBy, ...w.members.map((m) => m.account)]))]
  const profiles: ProfilesWire = {}
  if (people.length) {
    for (const u of await db.select({ a: appUser.nearAccount, n: appUser.displayName, av: appUser.avatar }).from(appUser).where(inArray(appUser.nearAccount, people)))
      profiles[u.a] = { name: u.n, avatar: avatarOrNull(u.av) }
  }
  return { open, mine, profiles }
}

// ------------------------------------------------------------------------------------------------- POST /api/nudges

export interface NudgeInput {
  pot: string
  to: string | string[]
  topup?: string
  idempotencyKey: string
}

/**
 * POST /api/nudges: remind people who haven't added. Skipped (with why): yourself, someone not in the Pot, someone not
 * asked by the ask or already done, someone nudged in this Pot in the last 24 h (by anyone). Nobody left to nudge:
 * 429 nudge_too_soon (all were nudged today) or 409 action_not_allowed {cause: nothing_to_nudge}.
 */
export async function sendNudges(deps: TopupDeps, s: SessionCtx, input: NudgeInput): Promise<Omit<NudgeRes, "ok" | "requestId"> & { status: number }> {
  const { db, hub, cfg } = deps
  const now = nowOf(deps)
  const potId = resolvePotId(input.pot, cfg.hubId)
  const me = s.user.nearAccount
  const targets = [...new Set(Array.isArray(input.to) ? input.to : [input.to])]
  if (targets.length === 0 || targets.length > 50) throw new ApiError("bad_request", { detail: { field: "to" } })
  await ensurePot(db, hub, cfg, potId)
  const members = await requireMember(hub, potId, me, true)

  const prior = await db.select().from(nudge).where(and(eq(nudge.senderAccount, me), eq(nudge.clientKey, input.idempotencyKey)))
  if (prior.length) {
    if (prior.some((n) => n.potId !== potId)) throw new ApiError("idempotency_conflict")
    return { delivered: await delivery(db, prior.map((n) => n.targetAccount)), nudged: prior.map((n) => n.targetAccount), skipped: [], replayed: true, status: 200 }
  }

  let progress: MemberProgress[] | null = null
  let topupId: number | null = null
  if (input.topup !== undefined) {
    topupId = parseTopupId(input.topup)
    const row = (await db.select().from(topupRequest).where(and(eq(topupRequest.id, topupId), eq(topupRequest.potId, potId))).limit(1))[0]
    if (!row) throw new ApiError("not_found", { detail: { field: "topup" } })
    progress = progressFor(row, members)
    if (!isOpen(await settle(db, row, progress, now))) throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "topup_ended" } })
  }
  const active = new Set(members.map((m) => m.account))
  const skipped: { account: string; why: NudgeSkip }[] = []
  const candidates: string[] = []
  for (const to of targets) {
    if (to === me) skipped.push({ account: to, why: "self" })
    else if (!active.has(to)) skipped.push({ account: to, why: "not_member" })
    else if (progress && !progress.some((p) => p.account === to)) skipped.push({ account: to, why: "not_asked" })
    else if (progress && progress.find((p) => p.account === to)!.done) skipped.push({ account: to, why: "done" })
    else candidates.push(to)
  }

  type Saved = { id: number; to: string }
  const result = await db.transaction(async (tx) => {
    // one at a time per Pot, so two nudges for the same person can't both pass the 24 h check
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`nudge:${potId}`}))`)
    const last = await lastNudges(tx, potId, candidates, now)
    const ok = candidates.filter((a) => last[a] === undefined)
    for (const a of candidates) if (last[a] !== undefined) skipped.push({ account: a, why: "too_soon" })
    if (ok.length === 0) return { saved: [] as Saved[], last }
    const q = await chargeQuotas(tx, [{ subject: `user:${s.user.id}`, action: "nudges", amount: BigInt(ok.length), limit: limit("user_nudges"), tag: "family:nudges" }])
    if (!q.ok) throw new ApiError("quota_exceeded", { detail: { family: "nudges", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
    const rows = await tx
      .insert(nudge)
      .values(ok.map((to) => ({ potId, topupId, senderAccount: me, targetAccount: to, clientKey: input.idempotencyKey, createdAt: new Date(now) })))
      .returning({ id: nudge.id, to: nudge.targetAccount })
    return { saved: rows, last }
  })

  if (result.saved.length === 0) {
    const soon = Object.values(result.last)
    if (soon.length) throw new ApiError("nudge_too_soon", { retryAfterMs: Math.max(1_000, Math.min(...soon) + NUDGE_WINDOW_MS - now), detail: { skipped } })
    throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "nothing_to_nudge", skipped } })
  }
  const left = new Map((progress ?? []).map((p) => [p.account, leftOf(p)]))
  deps.onNudged?.({
    pot: potId,
    actor: me,
    topupId: topupId === null ? null : String(topupId),
    nudges: result.saved.map((n) => ({ id: String(n.id), to: n.to, ...(left.get(n.to) ? { amount: left.get(n.to)!.toString() } : {}) })),
  })
  const nudged = result.saved.map((n) => n.to)
  return { delivered: await delivery(db, nudged), nudged, skipped, status: 200 }
}

/** "push" when at least one of them has push on (the push itself goes out after the response). */
async function delivery(db: DbOrTx, accounts: readonly string[]): Promise<"push" | "none"> {
  if (accounts.length === 0) return "none"
  const r = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pushSubscription)
    .innerJoin(appUser, eq(appUser.id, pushSubscription.userId))
    .where(inArray(appUser.nearAccount, [...accounts]))
  return Number(r[0]?.n ?? 0) > 0 ? "push" : "none"
}

// ------------------------------------------------------------------------------------------------- the daily job

export interface TopupsReport {
  scanned: number
  done: number
  ended: number
  reminders: number
}

/** A reminder to send: the people asked who haven't added (the asker left out), the day before it's due. */
export interface TopupReminder {
  pot: string
  id: string
  actor: string
  amount: string
  dueAt: number
  recipients: string[]
}

/**
 * The reconcile step: every open ask is closed when everyone added or its date passed; one due within 36 h gets its
 * one reminder (`reminder_at`; the notification log dedupes too). Never throws for one Pot's trouble.
 */
export async function reconcileTopups(
  deps: { db: Db; hub: HubReader; remind?: (r: TopupReminder) => Promise<void> },
  now = Date.now(),
): Promise<TopupsReport> {
  const out: TopupsReport = { scanned: 0, done: 0, ended: 0, reminders: 0 }
  const rows = await deps.db.select().from(topupRequest).where(and(isNull(topupRequest.closedAt), isNull(topupRequest.cancelledAt))).orderBy(topupRequest.dueAt).limit(500)
  for (const r of rows) {
    out.scanned++
    let members: Member[]
    try {
      members = await activeMembers(deps.hub, r.potId, true)
    } catch {
      continue
    }
    const progress = progressFor(r, members)
    const after = await settle(deps.db, r, progress, now)
    if (!isOpen(after)) {
      if (after.closeCause === "done") out.done++
      else out.ended++
      continue
    }
    if (after.reminderAt || after.dueAt.getTime() - now > TOPUP_REMIND_WITHIN_MS) continue
    const recipients = progress.filter((p) => !p.done && p.account !== r.createdBy).map((p) => p.account)
    const [claimed] = await deps.db
      .update(topupRequest)
      .set({ reminderAt: new Date(now) })
      .where(and(eq(topupRequest.id, r.id), isNull(topupRequest.reminderAt)))
      .returning({ id: topupRequest.id })
    if (!claimed || recipients.length === 0) continue
    out.reminders++
    await deps.remind?.({ pot: r.potId, id: String(r.id), actor: r.createdBy, amount: r.perPerson, dueAt: r.dueAt.getTime(), recipients }).catch((e) =>
      console.error(JSON.stringify({ level: "error", where: "topups.remind", err: errText(e, 200) })),
    )
  }
  return out
}
