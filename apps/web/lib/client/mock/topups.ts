// "Ask for a top-up" in the mock world (the API's twin: server/features/topups.ts; rules in lib/topups.ts). Pure
// functions over the JSON World; the store adds latency, the signed-in person and persistence.
//  - An ask names everyone in the Pot when it's made (the asker too) with what each had put in (the baseline);
//    progress = contributed now − baseline. Its status is derived: done once everyone added their part, ended at its
//    date, or cancelled by the asker. One open ask per Pot.
//  - Nudges: once per person per Pot per 24 h, whoever sends it.
//  - The push stub: what the server would push is appended to `world.pushes` (the mock has no push; e2e reads it).
import { t } from "@/i18n/t"
import { addHref, checkTopupAmount, cleanReason, dueOk, NUDGE_WINDOW_MS, progressOf, statusOf, type MemberProgress, type TopupMode, type TopupStatus } from "@/lib/topups"
import { cents, formatUsd, toCents } from "../money"
import type { FeedItemVM, MockPushRec, PersonVM, PotRec, TopupMemberVM, TopupRec, TopupVM, World } from "./types"

export type TopupError = "not_member" | "not_found" | "closed" | "alone" | "open" | "too_low" | "too_high" | "invalid" | "not_asker" | "ended" | "too_soon" | "nothing"

export class TopupWorldError extends Error {
  constructor(readonly code: TopupError) {
    super(code)
  }
}

const fail = (code: TopupError): never => {
  throw new TopupWorldError(code)
}

const PUSH_KEEP = 50

export const topupsOf = (w: World, slug: string): TopupRec[] => (w.topups ?? []).filter((x) => x.pot === slug)

/** Who was asked and how far each one is (cents → Micro; the people still in the Pot). */
export function recProgress(pot: PotRec, rec: TopupRec): MemberProgress[] {
  if (rec.cancelledAt && rec.progress) {
    const part = cents(rec.perPerson)
    return rec.baselines.filter((b) => b.id in rec.progress!).map((b) => ({ account: b.id, part, added: cents(rec.progress![b.id]!), done: cents(rec.progress![b.id]!) >= part }))
  }
  const now = new Map(pot.members.map((m) => [m.id, m.contributed]))
  return progressOf(
    rec.baselines.map((b) => ({ account: b.id, baseline: cents(b.c), contributed: now.has(b.id) ? cents(now.get(b.id)!) : null })),
    cents(rec.perPerson),
  )
}

export const recStatus = (pot: PotRec, rec: TopupRec, now: number): TopupStatus => statusOf({ cancelledAt: rec.cancelledAt ?? null }, recProgress(pot, rec), rec.dueAt, now)

export function openTopupOf(w: World, slug: string, now: number): TopupRec | null {
  const pot = w.pots[slug]
  if (!pot) return null
  return topupsOf(w, slug).find((r) => recStatus(pot, r, now) === "open") ?? null
}

function lastNudged(w: World, slug: string, now: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of w.nudges ?? []) if (n.pot === slug && now - n.at < NUDGE_WINDOW_MS) out[n.to] = Math.max(out[n.to] ?? 0, n.at)
  return out
}

/** The push stub (what the server would have pushed, to whom). */
function pushed(w: World, list: MockPushRec[]): World {
  if (list.length === 0) return w
  return { ...w, pushes: [...(w.pushes ?? []), ...list].slice(-PUSH_KEEP) }
}

export interface AskInput {
  mode: TopupMode
  /** cents: per person (each) or the total (total) */
  amount: number
  reason?: string | null
  dueAt: number
}

/** A member asks everyone in the Pot for more money. */
export function askTopup(w: World, slug: string, who: string, input: AskInput, now: number, id: string, personName: (id: string) => string): { world: World; rec: TopupRec } {
  const pot = w.pots[slug]
  if (!pot) fail("not_found")
  if (!pot!.members.some((m) => m.id === who)) fail("not_member")
  if (pot!.status !== "open") fail("closed")
  if (pot!.members.length < 2) fail("alone")
  const reason = cleanReason(input.reason)
  if (!reason.ok || !dueOk(input.dueAt, now)) fail("invalid")
  const check = checkTopupAmount(input.mode, cents(input.amount), pot!.members.length)
  if (!check.ok) fail(check.why)
  if (openTopupOf(w, slug, now)) fail("open")
  const ok = check as Extract<typeof check, { ok: true }>
  const rec: TopupRec = {
    id,
    pot: slug,
    by: who,
    mode: input.mode,
    perPerson: toCents(ok.part),
    total: toCents(ok.total),
    reason: (reason as { value: string | null }).value,
    dueAt: input.dueAt,
    createdAt: now,
    baselines: [...pot!.members].sort((a, b) => a.joinIndex - b.joinIndex).map((m) => ({ id: m.id, c: m.contributed })),
  }
  const amount = formatUsd(ok.part, "whole")
  const title = t("notif.topup.title", { name: personName(who), amount })
  const body = rec.reason ? t("notif.topup.body", { reason: rec.reason, potName: pot!.name }) : t("notif.topup.body_plain", { potName: pot!.name })
  const next = pushed({ ...w, topups: [...(w.topups ?? []), rec] }, rec.baselines.filter((b) => b.id !== who).map((b) => ({ to: b.id, title, body, url: `/p/${slug}`, at: now })))
  return { world: next, rec }
}

/** The asker cancels their open ask (a second cancel is a no-op). */
export function cancelTopup(w: World, slug: string, who: string, id: string, now: number): World {
  const pot = w.pots[slug]
  const rec = topupsOf(w, slug).find((r) => r.id === id)
  if (!pot || !rec) fail("not_found")
  if (!pot!.members.some((m) => m.id === who)) fail("not_member")
  if (rec!.by !== who) fail("not_asker")
  if (rec!.cancelledAt) return w
  if (recStatus(pot!, rec!, now) !== "open") fail("ended")
  const progress = Object.fromEntries(recProgress(pot!, rec!).map((p) => [p.account, toCents(p.added)]))
  return { ...w, topups: (w.topups ?? []).map((r) => (r.id === id ? { ...r, cancelledAt: now, progress } : r)) }
}

/** Nudge the people who haven't added (skips yourself, people done, people nudged in the last 24 h). */
export function nudgeTopup(
  w: World,
  slug: string,
  who: string,
  id: string,
  targets: readonly string[],
  now: number,
  personName: (id: string) => string,
): { world: World; nudged: string[] } {
  const pot = w.pots[slug]
  const rec = topupsOf(w, slug).find((r) => r.id === id)
  if (!pot || !rec) fail("not_found")
  if (!pot!.members.some((m) => m.id === who)) fail("not_member")
  if (recStatus(pot!, rec!, now) !== "open") fail("ended")
  const progress = recProgress(pot!, rec!)
  const last = lastNudged(w, slug, now)
  const eligible = targets.filter((a) => a !== who && progress.some((p) => p.account === a && !p.done))
  const ok = eligible.filter((a) => last[a] === undefined)
  if (ok.length === 0) fail(eligible.length ? "too_soon" : "nothing")
  const title = t("notif.nudge.title", { name: personName(who) })
  const left = (a: string) => {
    const p = progress.find((x) => x.account === a)!
    return p.part - p.added
  }
  const next = pushed(
    { ...w, nudges: [...(w.nudges ?? []), ...ok.map((to) => ({ pot: slug, from: who, to, topupId: id, at: now }))] },
    ok.map((to) => ({
      to,
      title,
      body: t("notif.nudge.body", { suggested: formatUsd(left(to), "whole"), potName: pot!.name }),
      url: addHref(slug, id, left(to)),
      at: now,
    })),
  )
  return { world: next, nudged: ok }
}

/** One ask as its members see it. */
export function topupVM(w: World, pot: PotRec, rec: TopupRec, me: string | null, now: number, person: (id: string) => PersonVM): TopupVM {
  const progress = recProgress(pot, rec)
  const status = statusOf({ cancelledAt: rec.cancelledAt ?? null }, progress, rec.dueAt, now)
  const last = status === "open" ? lastNudged(w, pot.slug, now) : {}
  const members: TopupMemberVM[] = progress.map((p) => ({ person: person(p.account), part: p.part, added: p.added, done: p.done, nudgedAt: last[p.account] ?? null }))
  return {
    id: rec.id,
    slug: pot.slug,
    potName: pot.name,
    potEmoji: pot.emoji,
    potCover: pot.cover,
    asker: person(rec.by),
    mode: rec.mode,
    perPerson: cents(rec.perPerson),
    total: cents(rec.total),
    reason: rec.reason,
    dueAt: rec.dueAt,
    createdAt: rec.createdAt,
    status,
    endedAt: rec.cancelledAt ?? (status === "ended" ? rec.dueAt : null),
    members,
    doneCount: members.filter((m) => m.done).length,
    mine: me !== null && rec.by === me,
    me: members.find((m) => m.person.id === me) ?? null,
  }
}

/** A Pot's asks for its screen: the open one (the card) and every ask as a feed row. Members only. */
export function topupsView(w: World, pot: PotRec, me: string | null, now: number, person: (id: string) => PersonVM): { open: TopupVM | null; feed: FeedItemVM[] } {
  if (me === null || !pot.members.some((m) => m.id === me)) return { open: null, feed: [] }
  const vms = topupsOf(w, pot.slug).map((r) => topupVM(w, pot, r, me, now, person))
  return { open: vms.find((v) => v.status === "open") ?? null, feed: vms.map((v) => ({ key: `topup:${v.id}`, kind: "topup" as const, at: v.createdAt, topup: v })) }
}
