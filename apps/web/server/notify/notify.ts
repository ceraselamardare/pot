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

export interface NotifyDeps {
  db: Db
  hub: HubReader
  cfg: Config
  sender: PushSender | null
  sleep?: (ms: number) => Promise<void>
}

type Category = "groceries" | "food" | "transport" | "stay" | "tickets" | "other"

export type NotifyEvent =
  | { type: "approval_needed"; subject: "spend" | "close" | "rules"; pot: string; proposalId: number; actor: string; amount?: string; category?: string }
  | { type: "request_resolved"; pot: string; proposalId: number; requester: string; status: "approved" | "declined" | "expired"; amount?: string; category?: string }
  | { type: "money_arrived"; pot: string; actor: string; amount: string; txHash: string }
  | { type: "pot_closed"; pot: string; recipients: string[] }

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
  }
}

const money = (micro: string | undefined) => (micro && /^[0-9]+$/.test(micro) ? formatUsdShort(BigInt(micro)) : "")
const reasonWord = (c: string | undefined) =>
  t(`spend.reason.word.${(["groceries", "food", "transport", "stay", "tickets", "other"].includes(c ?? "") ? c : "other") as Category}`)

/** Recipients' accounts per event (api-spec §6.1). */
async function recipientAccounts(deps: NotifyDeps, ev: NotifyEvent): Promise<string[]> {
  if (ev.type === "pot_closed") return ev.recipients
  if (ev.type === "request_resolved") return [ev.requester]
  const members = (await deps.hub.getMembers(ev.pot, { fresh: true }).catch(() => [])).filter((m) => m.status === "active").map((m) => m.account_id)
  if (ev.type === "money_arrived") return members.filter((a) => a !== ev.actor)
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

function render(ev: NotifyEvent, names: Map<string, string>, potName: string, slug: string, extra: { approvers?: string[]; expiresInSec?: number }): Rendered {
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
  const extra: { approvers?: string[]; expiresInSec?: number } = {}
  const nameAccounts = new Set<string>()
  if (ev.type === "approval_needed" || ev.type === "money_arrived") nameAccounts.add(ev.actor)
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

// ---------------------------------------------------------------------------------------------
// trusted hub events → notification events (relay outcomes, server sync/retry txs)

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {})
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v))

export function eventsToNotifications(events: RawEvent[], txHash: string): NotifyEvent[] {
  const out: NotifyEvent[] = []
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
          out.push({ type: "approval_needed", subject: "spend", pot, proposalId: Number(d.proposal_id), actor: s(d.requester) ?? "", amount: s(d.amount), category: s(d.category) })
        break
      case "close_proposed":
        out.push({ type: "approval_needed", subject: "close", pot, proposalId: Number(d.proposal_id), actor: s(d.by) ?? "" })
        break
      case "rules_change_proposed":
        out.push({ type: "approval_needed", subject: "rules", pot, proposalId: Number(d.proposal_id), actor: s(d.by) ?? "" })
        break
      case "pot_closed": {
        const payouts = Array.isArray(d.payouts) ? (d.payouts as Obj[]).map((p) => s(p.account_id)).filter((x): x is string => !!x) : []
        out.push({ type: "pot_closed", pot, recipients: payouts })
        break
      }
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
      out.push(await notify(deps, ev))
    } catch (e) {
      console.error(JSON.stringify({ level: "error", where: "notify", event: ev.type, err: String(e).slice(0, 200) }))
    }
  }
  return out
}
