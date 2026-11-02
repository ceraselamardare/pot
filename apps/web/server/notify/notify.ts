// X-06 notification fan-out (api-spec §6.1; architecture §3.14; D-51, P-10). Runs in after() from relay
// outcomes (and from the server's own sync/retry txs and the cron), never inside a response. Push only (email
// is B-16, Telegram is cut). Dedupe: notification_log (event_key, user, channel) INSERT … ON CONFLICT DO
// NOTHING, so a cron re-run or a replayed outcome never notifies twice. Copy comes from i18n/en.json `notif.*`
// (the same strings as the UI). Push text never carries Pot balances, account ids or tx hashes.
import "server-only"
import { and, eq, inArray, sql } from "drizzle-orm"
import { formatUsdShort } from "@pot/sdk"
import type { Db } from "@/db/client"
import { appUser, notificationLog, pot, pushSubscription } from "@/db/schema"
import { t } from "@/i18n/t"
import type { HubReader } from "../chain/hub"
import type { RawEvent } from "../chain/outcome"
import type { Config } from "../config"
import { sendAlert } from "../alerts"
import { buildPayload, topic, type NotificationType } from "./payload"
import type { PushSender, PushOptions } from "./webpush"
import { errText } from "../util/errtext"

export interface NotifyDeps {
  db: Db
  hub: HubReader
  cfg: Config
  sender: PushSender | null
  sleep?: (ms: number) => Promise<void>
}

type Category = "groceries" | "food" | "transport" | "stay" | "tickets" | "other"

export type NotifyEvent =
  /** `tier: "one_ok"` (hub 1.1.0): one OK from anyone else approves it ("Sam needs one OK") */
  | { type: "approval_needed"; subject: "spend" | "close" | "rules"; pot: string; proposalId: number; actor: string; amount?: string; category?: string; tier?: "one_ok" | "group" }
  /** `okBy` (hub 1.1.0): approved by that member's one OK */
  | { type: "request_resolved"; pot: string; proposalId: number; requester: string; status: "approved" | "declined" | "expired"; amount?: string; category?: string; okBy?: string }
  /** hub 1.1.0 earned trust: the member's level went up ("You're now Trusted in Lisbon Trip") */
  | { type: "trust_up"; pot: string; member: string; level: number }
  /** hub 1.1.0 goal: reached (everyone), missed → refund started, refunded (everyone who got money back) */
  | { type: "goal"; pot: string; state: "reached" | "missed" | "refunded"; goal?: string; recipients?: string[] }
  | { type: "money_arrived"; pot: string; actor: string; amount: string; txHash: string }
  | { type: "pot_closed"; pot: string; recipients: string[] }
  /** pay by link (hub 1.1.0): the requester learns their link was claimed (`claimer` = the account, named only if a Pot user) */
  | { type: "link_claimed"; pot: string; requestId: number; requester: string; claimer: string; amount?: string }
  /** pay by link: an unclaimed link's money came back (cancelled by its requester, or after its date): every member */
  | { type: "link_returned"; pot: string; requestId: number; by: string; requester?: string; amount?: string }
  /** a comment on a request: `requester` audience = the requester; `thread` = earlier commenters (never the author) */
  | {
      type: "comment"
      audience: "requester" | "thread"
      pot: string
      requestId: number
      commentId: string
      actor: string
      requester: string
      recipients: string[]
      amount?: string
      category?: string
    }

export interface NotifyReport {
  eventKey: string
  recipients: number
  sent: number
  skipped: number
  failed: number
  deleted: number
}

const DAY = 86_400
const sleepDefault = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function eventKey(ev: NotifyEvent): string {
  switch (ev.type) {
    case "approval_needed":
      return `approval_needed:${ev.pot}:${ev.proposalId}`
    case "request_resolved":
      return `resolved:${ev.pot}:${ev.proposalId}:${ev.status}`
    case "money_arrived":
      return `contribution:${ev.txHash}`
    case "pot_closed":
      return `closed:${ev.pot}`
    case "trust_up":
      return `trust:${ev.pot}:${ev.member}:${ev.level}`
    case "goal":
      return `goal:${ev.pot}:${ev.state}`
    case "comment":
      return `comment:${ev.pot}:${ev.requestId}:${ev.commentId}:${ev.audience}`
    case "link_claimed":
      return `link_claimed:${ev.pot}:${ev.requestId}`
    case "link_returned":
      return `link_returned:${ev.pot}:${ev.requestId}`
  }
}

const money = (micro: string | undefined) => (micro && /^[0-9]+$/.test(micro) ? formatUsdShort(BigInt(micro)) : "")
const reasonWord = (c: string | undefined) =>
  t(`spend.reason.word.${(["groceries", "food", "transport", "stay", "tickets", "other"].includes(c ?? "") ? c : "other") as Category}`)

/** Recipients' accounts per event (api-spec §6.1). */
async function recipientAccounts(deps: NotifyDeps, ev: NotifyEvent): Promise<string[]> {
  if (ev.type === "pot_closed") return ev.recipients
  if (ev.type === "comment") {
    // only people still in the Pot, never the author
    const active = new Set((await deps.hub.getMembers(ev.pot, { fresh: true }).catch(() => [])).filter((m) => m.status === "active").map((m) => m.account_id))
    return ev.recipients.filter((a) => a !== ev.actor && active.has(a))
  }
  if (ev.type === "request_resolved") return [ev.requester]
  if (ev.type === "trust_up") return [ev.member]
  if (ev.type === "goal" && ev.recipients?.length) return ev.recipients
  if (ev.type === "link_claimed") return ev.requester ? [ev.requester] : []
  const members = (await deps.hub.getMembers(ev.pot, { fresh: true }).catch(() => [])).filter((m) => m.status === "active").map((m) => m.account_id)
  if (ev.type === "money_arrived") return members.filter((a) => a !== ev.actor)
  if (ev.type === "goal") return members
  // a returned link: everyone in the Pot (the money is theirs again), except a requester who cancelled it themselves
  if (ev.type === "link_returned") return members.filter((a) => a !== ev.by)
  // approval_needed: members who haven't voted, minus the requester
  const p = await deps.hub.getProposal(ev.pot, ev.proposalId).catch(() => null)
  const voted = new Set(Object.keys(p?.votes ?? {}))
  return members.filter((a) => a !== ev.actor && !voted.has(a))
}

/** `app_badge`: the user's open approvals (approval_needed rows with no resolution logged for anyone). */
async function openApprovals(db: Db, userId: string): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM notification_log a
    WHERE a.user_id = ${userId} AND a.channel = 'push' AND a.event_key LIKE 'approval_needed:%'
      AND a.created_at > now() - interval '8 days'
      AND NOT EXISTS (SELECT 1 FROM notification_log r
                      WHERE r.event_key LIKE 'resolved:' || substr(a.event_key, 17) || ':%')`)
  return r.rows[0]?.n ?? 0
}

interface Rendered {
  title: string
  body?: string
  path: string
  push: PushOptions
  data: Record<string, unknown>
}

function render(
  ev: NotifyEvent,
  names: Map<string, string>,
  potName: string,
  slug: string,
  extra: { approvers?: string[]; expiresInSec?: number; trustCap?: string; goal?: string },
): Rendered {
  const name = (a: string) => names.get(a) ?? t("person.fallback")
  switch (ev.type) {
    case "approval_needed": {
      const ttl = Math.max(60, Math.min(7 * DAY, extra.expiresInSec ?? 7 * DAY))
      const push: PushOptions = { ttl, urgency: "high", topic: topic(ev.pot, ev.proposalId) }
      // data.proposalId + data.subject: the SW deep-links ?pid= to the spend, the close or the rules change
      const data = { pot: ev.pot, proposalId: ev.proposalId, subject: ev.subject }
      if (ev.subject === "rules")
        return { title: t("rules.change.pending", { name: name(ev.actor) }), body: t("notif.close.body_plain"), path: `/p/${slug}?r=${ev.proposalId}`, push, data }
      if (ev.subject === "close")
        return { title: t("notif.close.title", { name: name(ev.actor), potName }), body: t("notif.close.body_plain"), path: `/p/${slug}?r=${ev.proposalId}`, push, data }
      if (ev.tier === "one_ok")
        return {
          title: t("notif.one_ok.title", { name: name(ev.actor) }),
          body: t("notif.one_ok.body", { amount: money(ev.amount), reason: reasonWord(ev.category), potName }),
          path: `/p/${slug}?r=${ev.proposalId}`,
          push,
          data: { ...data, tier: "one_ok" },
        }
      return {
        title: t("notif.approval.title", { name: name(ev.actor) }),
        body: t("notif.approval.body", { amount: money(ev.amount), reason: reasonWord(ev.category), potName }),
        path: `/p/${slug}?r=${ev.proposalId}`,
        push,
        data,
      }
    }
    case "request_resolved": {
      const push: PushOptions = { ttl: DAY, urgency: "normal", topic: topic(ev.pot, ev.proposalId) }
      const data = { pot: ev.pot, proposalId: ev.proposalId, subject: "spend", status: ev.status }
      if (ev.status === "approved" && ev.okBy)
        return {
          title: t("notif.approved.title", { amount: money(ev.amount) }),
          body: t("notif.ok_approved.body", { name: name(ev.okBy), reason: reasonWord(ev.category) }),
          path: `/p/${slug}`,
          push,
          data,
        }
      if (ev.status === "approved") {
        const who = (extra.approvers ?? []).map(name)
        return {
          title: t("notif.approved.title", { amount: money(ev.amount) }),
          body: who.length ? t("notif.approved.body", { names: who.join(", "), reason: reasonWord(ev.category) }) : undefined,
          path: `/p/${slug}`,
          push,
          data,
        }
      }
      if (ev.status === "declined")
        return { title: t("notif.declined.title"), body: t("notif.declined.body", { amount: money(ev.amount), reason: reasonWord(ev.category) }), path: `/p/${slug}`, push, data }
      return { title: t("notif.expired.title"), body: t("notif.expired.body", { amount: money(ev.amount), days: 7 }), path: `/p/${slug}`, push, data }
    }
    case "money_arrived":
      return {
        title: t("notif.contribution.title", { name: name(ev.actor), amount: money(ev.amount) }),
        body: t("notif.contribution.body", { potName }),
        path: `/p/${slug}`,
        push: { ttl: 6 * 3600, urgency: "low", topic: topic(ev.pot, "c") },
        data: { pot: ev.pot },
      }
    case "comment": {
      // lock-screen safe: who and which request, never the comment's text
      const title =
        ev.audience === "requester"
          ? t("notif.comment.title", { name: name(ev.actor) })
          : t("notif.comment.thread.title", { name: name(ev.actor), requester: name(ev.requester) })
      return {
        title,
        body: t("notif.comment.body", { amount: money(ev.amount), reason: reasonWord(ev.category), potName }),
        path: `/p/${slug}?r=${ev.requestId}`,
        push: { ttl: DAY, urgency: "normal", topic: topic(ev.pot, `comment:${ev.requestId}`) },
        data: { pot: ev.pot, requestId: ev.requestId, subject: "comment" },
      }
    }
    case "link_claimed": {
      // lock-screen safe: the claimer's display name only when they use Pot, never an account id
      const who = names.get(ev.claimer)
      return {
        title: t("notif.link.claimed.title", { amount: money(ev.amount) }),
        body: who ? t("notif.link.claimed.body", { name: who, potName }) : t("notif.link.claimed.body_someone", { potName }),
        path: `/p/${slug}?r=${ev.requestId}`,
        push: { ttl: DAY, urgency: "normal", topic: topic(ev.pot, `link:${ev.requestId}`) },
        data: { pot: ev.pot, requestId: ev.requestId, subject: "link" },
      }
    }
    case "link_returned": {
      const cancelled = !!ev.requester && ev.by === ev.requester
      return {
        title: t("notif.link.returned.title", { amount: money(ev.amount), potName }),
        body: cancelled ? t("notif.link.returned.body_cancelled", { name: name(ev.by) }) : t("notif.link.returned.body"),
        path: `/p/${slug}`,
        push: { ttl: DAY, urgency: "low", topic: topic(ev.pot, `link:${ev.requestId}`) },
        data: { pot: ev.pot, requestId: ev.requestId, subject: "link" },
      }
    }
    case "trust_up":
      return {
        title: t("notif.trust.title", { level: t(`trust.level.${Math.max(0, Math.min(2, ev.level))}` as "trust.level.0"), potName }),
        body: extra.trustCap ? t("notif.trust.body", { amount: extra.trustCap }) : undefined,
        path: `/p/${slug}?tab=rules`,
        push: { ttl: DAY, urgency: "low", topic: topic(ev.pot, `trust:${ev.member}`) },
        data: { pot: ev.pot, subject: "trust", level: ev.level },
      }
    case "goal": {
      const push: PushOptions = { ttl: DAY, urgency: "normal", topic: topic(ev.pot, "goal") }
      const data = { pot: ev.pot, subject: "goal", state: ev.state }
      if (ev.state === "reached")
        return { title: t("notif.goal.reached.title", { potName }), body: t("notif.goal.reached.body", { goal: extra.goal ?? money(ev.goal) }), path: `/p/${slug}`, push, data }
      if (ev.state === "missed") return { title: t("notif.goal.missed.title", { potName }), body: t("notif.goal.missed.body"), path: `/p/${slug}`, push, data }
      return { title: t("notif.goal.refunded.title"), body: t("notif.goal.refunded.body", { potName }), path: `/p/${slug}`, push, data }
    }
    case "pot_closed":
      return {
        title: t("notif.closed.title", { potName }),
        body: t("notif.closed.body_plain"),
        path: `/p/${slug}`,
        push: { ttl: DAY, urgency: "normal" },
        data: { pot: ev.pot },
      }
  }
}

/** Fan one event out to every recipient's push subscriptions. Never throws (logs instead). */
export async function notify(deps: NotifyDeps, ev: NotifyEvent): Promise<NotifyReport> {
  const key = eventKey(ev)
  const report: NotifyReport = { eventKey: key, recipients: 0, sent: 0, skipped: 0, failed: 0, deleted: 0 }
  if (!deps.sender) return report
  const { db, hub, cfg } = deps
  const accounts = [...new Set(await recipientAccounts(deps, ev))]
  if (accounts.length === 0) return report
  const users = await db.select({ id: appUser.id, a: appUser.nearAccount }).from(appUser).where(inArray(appUser.nearAccount, accounts))
  if (users.length === 0) return report
  // only users not notified for this event yet (dedupe; the row is claimed before sending)
  const claimed = await db
    .insert(notificationLog)
    .values(users.map((u) => ({ eventKey: key, userId: u.id, channel: "push" as const })))
    .onConflictDoNothing()
    .returning({ userId: notificationLog.userId })
  const fresh = new Set(claimed.map((c) => c.userId))
  const targets = users.filter((u) => fresh.has(u.id))
  report.recipients = targets.length
  if (targets.length === 0) return report

  // context: Pot name/slug, display names, approvers, expiry
  const potRow = (await db.select({ slug: pot.slug, name: pot.name }).from(pot).where(eq(pot.daoId, ev.pot)).limit(1))[0]
  const pv = potRow ? null : await hub.getPot(ev.pot).catch(() => null)
  const slug = potRow?.slug ?? pv?.slug ?? ev.pot.split(".")[0]!
  const potName = potRow?.name ?? pv?.name ?? slug
  const extra: { approvers?: string[]; expiresInSec?: number; trustCap?: string; goal?: string } = {}
  // hub 1.1.0: the new instant limit = the Pot's instant limit × (1 + level)
  if (ev.type === "trust_up") {
    const cap = (pv ?? (await hub.getPot(ev.pot).catch(() => null)))?.rules?.instant_cap
    if (cap && /^[0-9]+$/.test(cap)) extra.trustCap = formatUsdShort(BigInt(cap) * BigInt(1 + ev.level))
  }
  if (ev.type === "goal" && ev.goal) extra.goal = money(ev.goal)
  const nameAccounts = new Set<string>()
  if (ev.type === "approval_needed" || ev.type === "money_arrived") nameAccounts.add(ev.actor)
  if (ev.type === "request_resolved" && ev.okBy) nameAccounts.add(ev.okBy)
  if (ev.type === "comment") {
    nameAccounts.add(ev.actor)
    nameAccounts.add(ev.requester)
  }
  if (ev.type === "link_claimed") nameAccounts.add(ev.claimer)
  if (ev.type === "link_returned") nameAccounts.add(ev.by)
  if ((ev.type === "approval_needed" && ev.subject === "spend") || (ev.type === "request_resolved" && ev.status === "approved")) {
    const p = await hub.getProposal(ev.pot, ev.proposalId).catch(() => null)
    if (p && ev.type === "request_resolved") {
      extra.approvers = Object.entries(p.votes ?? {})
        .filter(([a, v]) => v === "Approve" && a !== ev.requester)
        .map(([a]) => a)
      for (const a of extra.approvers) nameAccounts.add(a)
    }
    if (p && ev.type === "approval_needed") {
      const period = (await hub.getPot(ev.pot).catch(() => null))?.proposal_period_ms ?? 7 * DAY * 1000
      extra.expiresInSec = Math.floor((Number(BigInt(p.submission_time) / 1_000_000n) + period - Date.now()) / 1000)
    }
  }
  const names = new Map(
    nameAccounts.size
      ? (await db.select({ a: appUser.nearAccount, n: appUser.displayName }).from(appUser).where(inArray(appUser.nearAccount, [...nameAccounts]))).map((r) => [r.a, r.n])
      : [],
  )
  const r = render(ev, names, potName, slug, extra)
  const navigate = new URL(r.path, cfg.appUrl).toString()

  const subs = await db
    .select()
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, targets.map((u) => u.id)))
  const subsByUser = new Map<string, (typeof subs)[number][]>()
  for (const s of subs) subsByUser.set(s.userId, [...(subsByUser.get(s.userId) ?? []), s])

  const jobs: (() => Promise<void>)[] = []
  for (const u of targets) {
    const mine = subsByUser.get(u.id) ?? []
    if (mine.length === 0) {
      report.skipped++
      await setLog(db, key, u.id, "skipped", { why: "no_subscription" })
      continue
    }
    const badge = ev.type === "approval_needed" || ev.type === "request_resolved" ? await openApprovals(db, u.id) : undefined
    const { json } = buildPayload({ type: ev.type as NotificationType, title: r.title, body: r.body, navigate, tag: r.push.topic, badge, data: r.data })
    jobs.push(async () => {
      let ok = 0
      let lastStatus = 0
      for (const s of mine) {
        const res = await sendOne(deps, s, json, r.push)
        lastStatus = res.status
        if (res.status >= 200 && res.status < 300) {
          ok++
          await db.update(pushSubscription).set({ lastOkAt: sql`now()`, failCount: 0 }).where(eq(pushSubscription.id, s.id))
        } else if (res.status === 404 || res.status === 410) {
          report.deleted++
          await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id))
        } else {
          await db.update(pushSubscription).set({ failCount: sql`${pushSubscription.failCount} + 1` }).where(eq(pushSubscription.id, s.id))
          if (res.status === 403) await sendAlert(db, "push_vapid", `push service answered 403 (${new URL(s.endpoint).host})`)
        }
      }
      if (ok > 0) report.sent++
      else report.failed++
      await setLog(db, key, u.id, ok > 0 ? "sent" : "failed", ok > 0 ? null : { status: lastStatus })
    })
  }
  // 25 recipients at a time (architecture §3.14)
  for (let i = 0; i < jobs.length; i += 25) await Promise.allSettled(jobs.slice(i, i + 25).map((j) => j()))
  return report
}

/** One endpoint: 429 → honour Retry-After once (≤ 5 s inside after()); 5xx / network → ≤ 2 retries with jitter. */
async function sendOne(deps: NotifyDeps, s: { endpoint: string; p256dh: string; auth: string }, json: string, o: PushOptions) {
  const sleep = deps.sleep ?? sleepDefault
  let res = await deps.sender!.send(s, json, o)
  if (res.status === 429) {
    await sleep(Math.min(5_000, res.retryAfterMs ?? 1_000))
    return deps.sender!.send(s, json, o)
  }
  for (let i = 0; i < 2 && (res.status === 0 || res.status >= 500); i++) {
    await sleep(250 * (i + 1) + Math.floor(Math.random() * 250))
    res = await deps.sender!.send(s, json, o)
  }
  return res
}

async function setLog(db: Db, key: string, userId: string, status: "sent" | "failed" | "skipped", detail: Record<string, unknown> | null) {
  await db
    .update(notificationLog)
    .set({ status, sentAt: status === "sent" ? new Date() : null, detail })
    .where(and(eq(notificationLog.eventKey, key), eq(notificationLog.userId, userId), eq(notificationLog.channel, "push")))
}

/**
 * A new comment → push to the requester ("Maya commented on your request") and to earlier commenters ("Maya also
 * commented on Sam's request"), never to the author, only to active members with push on. Never throws.
 */
export async function notifyComment(
  deps: NotifyDeps,
  c: { pot: string; requestId: number; commentId: string; actor: string; requester: string; amount?: string; category?: string; earlier: string[] },
): Promise<NotifyReport[]> {
  if (!deps.sender) return []
  const base = { type: "comment" as const, pot: c.pot, requestId: c.requestId, commentId: c.commentId, actor: c.actor, requester: c.requester, amount: c.amount, category: c.category }
  const out: NotifyReport[] = []
  const thread = c.earlier.filter((a) => a !== c.requester && a !== c.actor)
  for (const ev of [
    ...(c.requester !== c.actor ? [{ ...base, audience: "requester" as const, recipients: [c.requester] }] : []),
    ...(thread.length ? [{ ...base, audience: "thread" as const, recipients: thread }] : []),
  ]) {
    try {
      out.push(await notify(deps, ev))
    } catch (e) {
      console.error(JSON.stringify({ level: "error", where: "notify", event: "comment", err: errText(e, 200) }))
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// trusted hub events → notification events (relay outcomes, server sync/retry txs)

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {})
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v))

export function eventsToNotifications(events: RawEvent[], txHash: string): NotifyEvent[] {
  const out: NotifyEvent[] = []
  // hub 1.1.0: a goal refund also closes the Pot; its own push ("Everyone got their money back") replaces "Pot closed"
  const refunded = new Set(events.filter((e) => e.standard === "pot" && e.event === "goal_refunded").map((e) => s(obj(e.data).pot)))
  for (const e of events) {
    if (e.standard !== "pot") continue
    const d = obj(e.data)
    const pot = s(d.pot)
    if (!pot) continue
    switch (e.event) {
      case "contribution":
        if (s(d.member) && s(d.amount)) out.push({ type: "money_arrived", pot, actor: s(d.member)!, amount: s(d.amount)!, txHash })
        break
      case "spend_requested":
        if (d.path === "vote" && d.proposal_id !== undefined && d.proposal_id !== null)
          out.push({
            type: "approval_needed",
            subject: "spend",
            pot,
            proposalId: Number(d.proposal_id),
            actor: s(d.requester) ?? "",
            amount: s(d.amount),
            category: s(d.category),
            ...(d.tier === "one_ok" ? { tier: "one_ok" as const } : {}),
          })
        break
      case "spend_ok_approved":
        // hub 1.1.0: one member's OK approved it → "Approved: $180 is on its way · Sam gave the OK…" to the requester
        if (d.proposal_id !== undefined && d.proposal_id !== null)
          out.push({ type: "request_resolved", pot, proposalId: Number(d.proposal_id), requester: s(d.requester) ?? "", status: "approved", amount: s(d.amount), okBy: s(d.by) })
        break
      case "trust_level_changed":
        if (d.cause === "settled" && Number(d.to) > Number(d.from) && s(d.member)) out.push({ type: "trust_up", pot, member: s(d.member)!, level: Number(d.to) })
        break
      case "goal_reached":
        out.push({ type: "goal", pot, state: "reached", goal: s(obj(d.goal).amount) })
        break
      case "goal_refund_proposed":
        out.push({ type: "goal", pot, state: "missed" })
        break
      case "goal_refunded":
        out.push({ type: "goal", pot, state: "refunded" })
        break
      case "close_proposed":
        out.push({ type: "approval_needed", subject: "close", pot, proposalId: Number(d.proposal_id), actor: s(d.by) ?? "" })
        break
      case "rules_change_proposed":
        out.push({ type: "approval_needed", subject: "rules", pot, proposalId: Number(d.proposal_id), actor: s(d.by) ?? "" })
        break
      case "pot_closed": {
        if (refunded.has(pot)) {
          const recipients = Array.isArray(d.payouts) ? (d.payouts as Obj[]).map((p) => s(p.account_id)).filter((x): x is string => !!x) : []
          for (const n of out) if (n.type === "goal" && n.pot === pot && n.state === "refunded") n.recipients = recipients
          break
        }
        const payouts = Array.isArray(d.payouts) ? (d.payouts as Obj[]).map((p) => s(p.account_id)).filter((x): x is string => !!x) : []
        out.push({ type: "pot_closed", pot, recipients: payouts })
        break
      }
      case "link_claimed":
        if (d.request_id !== undefined && s(d.receiver_id))
          out.push({ type: "link_claimed", pot, requestId: Number(d.request_id), requester: "", claimer: s(d.receiver_id)!, amount: s(d.amount) })
        break
      case "link_returned":
        if (d.request_id !== undefined) out.push({ type: "link_returned", pot, requestId: Number(d.request_id), by: s(d.by) ?? "", amount: s(d.amount) })
        break
      case "proposal_synced": {
        const status = s(d.hub_status)
        const map: Record<string, "approved" | "declined" | "expired"> = { approved: "approved", paid: "approved", rejected: "declined", expired: "expired" }
        // the hub's spend sync names the request (request_id), not the requester: notifyFromEvents fills it in
        if (d.subject === "spend" && status && map[status])
          out.push({ type: "request_resolved", pot, proposalId: Number(d.proposal_id), requester: s(d.member) ?? "", status: map[status]! })
        break
      }
    }
  }
  return out
}

/** Map + fan out (amounts for request_resolved come from the hub's request record). Never throws. */
export async function notifyFromEvents(deps: NotifyDeps, events: RawEvent[], txHash: string): Promise<NotifyReport[]> {
  if (!deps.sender) return []
  const out: NotifyReport[] = []
  for (const ev of eventsToNotifications(events, txHash)) {
    try {
      if (ev.type === "request_resolved" && (!ev.requester || ev.amount === undefined)) {
        const pv = await deps.hub.getPot(ev.pot, { fresh: true }).catch(() => null)
        const reqs = pv ? await deps.hub.getRequests(ev.pot, Math.max(0, pv.request_count - 50), 50).catch(() => []) : []
        const r = reqs.find((x) => x.proposal_id === ev.proposalId)
        if (r) Object.assign(ev, { requester: ev.requester || r.requester, amount: r.amount, category: r.category })
        if (!ev.requester) continue
      }
      // pay by link: the event names the request, not the requester; the hub's request record does
      if ((ev.type === "link_claimed" && !ev.requester) || (ev.type === "link_returned" && ev.requester === undefined)) {
        const r = (await deps.hub.getRequests(ev.pot, ev.requestId, 1).catch(() => [])).find((x) => x.request_id === ev.requestId)
        if (ev.type === "link_claimed") {
          if (!r) continue
          ev.requester = r.requester
        } else ev.requester = r?.requester ?? ""
      }
      out.push(await notify(deps, ev))
    } catch (e) {
      console.error(JSON.stringify({ level: "error", where: "notify", event: ev.type, err: errText(e, 200) }))
    }
  }
  return out
}
