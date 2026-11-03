// A person's own history ("Your activity" on You, a member's sheet on a Pot): pure mapping, no I/O.
//  - activityOfPerson(pot, id): one Pot's view model (mock world or live chain views ⊕ the feed route) → what
//    that person did there. On testnet this is also the chain fallback for the You tab.
//  - activityFromApi(items): GET /api/me/activity rows (feed_event + relay_log) → the same items.
//  - mergeActivity(server, chain): one list by key; the chain wins on status (truth), the server on time and
//    receipt (it saw the transaction).
// Keys come from lib/activity-api.ts, so both sources name the same action the same way.
import { activityKey, type ActivityApiItem, type ActivityApiKind } from "@/lib/activity-api"
import { t } from "@/i18n/t"
import { formatUsd, type Micro } from "./money"
import type { Category, CloseVM, LinkStatusVM, PotVM, RequestVM, RulesChangeVM, TopupVM, Vote } from "./mock/types"

/** A payment link's status as an activity chip (icon + colour; the word comes from chipWord). */
const linkChip = (s: LinkStatusVM): ActivityStatus =>
  s === "claimed" ? "sent" : s === "ready" || s === "waiting" || s === "busy" ? "needs" : s === "void" ? "declined" : "expired"
import { coverOf, nameFromAccount } from "./live/vm"
import { dayLabel } from "./time"

/** + "gift" (hub 1.2.0): a gift I sent a Pot (I'm usually not in it; You → Your activity only)
 *  + "topup": I asked everyone in a Pot for more money (off-chain; "Ask for a top-up") */
export type ActivityKind = ActivityApiKind | "gift" | "topup"
/** The chip on a row (StatusChip statuses); absent = no chip. */
export type ActivityStatus = "sent" | "approved" | "needs" | "declined" | "expired" | "failed" | "cancelled"

export interface ActivityItemVM {
  key: string
  kind: ActivityKind
  at: number
  slug: string
  potName: string
  potEmoji: string
  potCover: number
  /** whose action it is (the signed-in person on You; the member on a member's sheet) */
  actorId: string
  actorName: string
  amount?: Micro
  /** asked: instant (Pot rules) or sent to the group */
  path?: "instant" | "vote"
  status?: ActivityStatus
  /** asked: the note, else the category word */
  reason?: string
  /** asked: the reason's category (the row's badge and "Groceries" title) */
  category?: Category
  vote?: Vote
  about?: { type: "spend" | "close" | "rules" | "other"; name?: string; amount?: Micro }
  requestId?: number
  proposalId?: number
  /** the settled transaction (its receipt); absent for anything optimistic or unknown */
  txHash?: string
  /** pay by link (hub 1.1.0): where the asked-for link is now */
  link?: LinkStatusVM
  /** asked: receipt details were saved with the spend */
  hasReceipt?: boolean
  /** topup: the ask's state and each person's part */
  topup?: { id: string; status: TopupVM["status"]; perPerson: Micro }
}

const CATEGORIES: readonly string[] = ["groceries", "food", "transport", "stay", "tickets", "other"]
const categoryOf = (category: string | undefined): Category => (CATEGORIES.includes(category ?? "") ? category : "other") as Category
const word = (category: string | undefined, note?: string) => note?.trim() || t(`spend.reason.word.${categoryOf(category)}`)

/** A request's status as a chip. */
export function requestChip(status: RequestVM["status"]): ActivityStatus {
  return status === "instant" ? "approved" : status
}

/** The hub's request status (api rows) as a chip; instant spends that went through read "Approved". */
export function hubStatusChip(status: string | undefined, path: "instant" | "vote" | undefined): ActivityStatus | undefined {
  switch (status) {
    case "paid":
    case "approved":
      return "approved"
    case "payout_failed":
      return "failed"
    case "rejected":
    case "withdrawn":
      return "declined"
    case "expired":
      return "expired"
    case "proposed":
      return "needs"
    default:
      return path === "vote" ? "needs" : undefined
  }
}

const proposalChip = (s: CloseVM["status"] | RulesChangeVM["status"]): ActivityStatus => s

function voteTime(voteAt: Record<string, number> | undefined, id: string, fallback: number): number {
  return voteAt?.[id] ?? fallback
}

/** What one person did in one Pot, newest first (from its view model: mock world or live chain + feed route). */
export function activityOfPerson(pot: PotVM, personId: string): ActivityItemVM[] {
  const name = pot.members.find((m) => m.person.id === personId)?.person.name ?? nameFromAccount(personId) ?? t("person.fallback")
  const base = { slug: pot.slug, potName: pot.name, potEmoji: pot.emoji, potCover: pot.cover, actorId: personId, actorName: name }
  const out: ActivityItemVM[] = []
  for (const f of pot.feed) {
    switch (f.kind) {
      case "created":
        if (f.actor.id === personId) out.push({ ...base, key: activityKey.created(pot.slug), kind: "created", at: f.at, txHash: f.txHash })
        break
      case "joined":
        if (f.actor.id === personId) out.push({ ...base, key: activityKey.joined(pot.slug, personId), kind: "joined", at: f.at, txHash: f.txHash })
        break
      case "contribution":
        if (f.actor.id === personId)
          out.push({ ...base, key: f.txHash ? activityKey.added(f.txHash) : `added:${pot.slug}:${f.key}`, kind: "added", at: f.at, amount: f.amount, status: "sent", txHash: f.txHash })
        break
      case "rules_changed":
        if (f.actor?.id === personId) out.push({ ...base, key: activityKey.rulesChanged(pot.slug, f.txHash ?? f.key), kind: "rules_changed", at: f.at, txHash: f.txHash })
        break
      case "request": {
        const r = f.request
        if (r.requester.id === personId)
          out.push({
            ...base,
            key: activityKey.asked(pot.slug, r.id),
            kind: "asked",
            at: r.createdAt,
            amount: r.amount,
            path: r.path,
            status: requestChip(r.status),
            reason: word(r.category, r.note),
            category: r.category,
            requestId: r.id,
            ...(r.proposalId != null ? { proposalId: r.proposalId } : {}),
            txHash: r.txHash,
            ...(r.link ? { link: r.status === "needs" ? ("waiting" as const) : r.link.status, status: linkChip(r.status === "needs" ? "waiting" : r.link.status) } : {}),
            ...(r.hasReceipt ? { hasReceipt: true } : {}),
          })
        else {
          const v: Vote | null = r.approvals.some((p) => p.id === personId) ? "Approve" : r.declines.some((p) => p.id === personId) ? "Reject" : null
          if (v)
            out.push({
              ...base,
              key: activityKey.voted(pot.slug, r.proposalId ?? r.id, personId),
              kind: "voted",
              at: voteTime(r.voteAt, personId, r.decidedAt ?? r.createdAt),
              vote: v,
              about: { type: "spend", name: r.requester.name, amount: r.amount },
              requestId: r.id,
              ...(r.proposalId != null ? { proposalId: r.proposalId } : {}),
              status: v === "Approve" ? "approved" : "declined",
            })
        }
        break
      }
      case "topup":
        if (f.topup.asker.id === personId) out.push(topupActivity(f.topup, { id: personId, name }))
        break
      default:
        break
    }
  }
  const c = pot.close
  if (c) {
    if (c.proposer.id === personId)
      out.push({ ...base, key: activityKey.closeAsked(pot.slug, c.proposalId), kind: "close_asked", at: c.createdAt ?? pot.closedAt ?? 0, proposalId: c.proposalId, status: proposalChip(c.status), txHash: closeTx(pot) })
    else {
      const v: Vote | null = c.approvals.some((p) => p.id === personId) ? "Approve" : (c.declines ?? []).some((p) => p.id === personId) ? "Reject" : null
      if (v)
        out.push({ ...base, key: activityKey.voted(pot.slug, c.proposalId, personId), kind: "voted", at: voteTime(c.voteAt, personId, c.createdAt ?? 0), vote: v, about: { type: "close" }, proposalId: c.proposalId, status: v === "Approve" ? "approved" : "declined" })
    }
  }
  const rc = pot.rulesChange
  if (rc) {
    if (rc.proposer.id === personId)
      out.push({ ...base, key: activityKey.rulesAsked(pot.slug, rc.proposalId), kind: "rules_asked", at: rc.createdAt, proposalId: rc.proposalId, status: proposalChip(rc.status), txHash: rulesTx(pot, rc.proposalId) })
    else {
      const v: Vote | null = rc.approvals.some((p) => p.id === personId) ? "Approve" : rc.declines.some((p) => p.id === personId) ? "Reject" : null
      if (v)
        out.push({ ...base, key: activityKey.voted(pot.slug, rc.proposalId, personId), kind: "voted", at: voteTime(rc.voteAt, personId, rc.createdAt), vote: v, about: { type: "rules" }, proposalId: rc.proposalId, status: v === "Approve" ? "approved" : "declined" })
    }
  }
  if (pot.status === "closed") {
    const m = pot.members.find((x) => x.person.id === personId)
    const closed = pot.feed.find((f) => f.kind === "closed")
    if (m && m.getsBack > 0n)
      out.push({ ...base, key: activityKey.refund(pot.slug, personId), kind: "refund", at: pot.closedAt ?? closed?.at ?? 0, amount: m.getsBack, status: "sent", txHash: closed?.txHash })
  }
  return out.sort((a, b) => b.at - a.at)
}

const closeTx = (pot: PotVM) => pot.feed.find((f) => f.kind === "close_requested")?.txHash
const rulesTx = (pot: PotVM, id: number) => pot.feed.find((f) => f.kind === "rules_requested" && f.key === `rules:${id}`)?.txHash

/** GET /api/me/activity rows → items (amounts to Micro, names from the response's profiles). */
export function activityFromApi(items: readonly ActivityApiItem[], me: { id: string; name: string }, profiles: Record<string, { name: string }> = {}): ActivityItemVM[] {
  return items.map((i): ActivityItemVM => {
    const aboutName = i.about?.actor ? (profiles[i.about.actor]?.name ?? nameFromAccount(i.about.actor) ?? t("person.fallback")) : undefined
    const status: ActivityStatus | undefined =
      i.kind === "added" || i.kind === "refund" ? "sent" : i.kind === "asked" ? hubStatusChip(i.status, i.path) : i.kind === "voted" ? (i.vote === "Reject" ? "declined" : "approved") : undefined
    return {
      key: i.key,
      kind: i.kind,
      at: Date.parse(i.at),
      slug: i.pot.slug,
      potName: i.pot.name,
      potEmoji: i.pot.emoji ?? "",
      potCover: coverOf(i.pot.slug, i.pot.gradient),
      actorId: me.id,
      actorName: me.name,
      ...(i.amount ? { amount: BigInt(i.amount) } : {}),
      ...(i.path ? { path: i.path } : {}),
      ...(status ? { status } : {}),
      ...(i.kind === "asked" ? { reason: word(i.category), category: categoryOf(i.category) } : {}),
      ...(i.vote ? { vote: i.vote } : {}),
      ...(i.about ? { about: { type: i.about.type, ...(aboutName ? { name: aboutName } : {}), ...(i.about.amount ? { amount: BigInt(i.about.amount) } : {}) } } : {}),
      ...(i.requestId !== undefined ? { requestId: i.requestId } : i.about?.requestId !== undefined ? { requestId: i.about.requestId } : {}),
      ...(i.proposalId !== undefined ? { proposalId: i.proposalId } : {}),
      ...(i.txHash ? { txHash: i.txHash } : {}),
    }
  })
}

/**
 * One list from both sources, newest first. Same key: the chain's status and reason (truth, and the memo the
 * member wrote), the server's time and receipt. `until`: while the server has older pages, chain-only items older
 * than its last row wait for them (so "Show more" doesn't reorder what's on screen).
 */
export function mergeActivity(server: readonly ActivityItemVM[], chain: readonly ActivityItemVM[], opts: { until?: number } = {}): ActivityItemVM[] {
  const byKey = new Map<string, ActivityItemVM>()
  for (const s of server) byKey.set(s.key, s)
  for (const c of chain) {
    const s = byKey.get(c.key)
    if (s) {
      byKey.set(c.key, {
        ...c,
        at: s.at,
        txHash: s.txHash ?? c.txHash,
        status: c.status ?? s.status,
        about: s.about && c.about ? { ...s.about, ...c.about } : (c.about ?? s.about),
      })
    } else if (opts.until === undefined || c.at >= opts.until) byKey.set(c.key, c)
  }
  return [...byKey.values()].sort((a, b) => b.at - a.at || (a.key < b.key ? -1 : 1))
}

/** Rows grouped under day headings ("Today", "Yesterday", "Nov 12"). */
export function groupByDay<T extends { at: number }>(items: readonly T[], now: number): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = []
  for (const it of items) {
    const label = dayLabel(it.at, now)
    const g = groups[groups.length - 1]
    if (g && g.label === label) g.items.push(it)
    else groups.push({ label, items: [it] })
  }
  return groups
}

/** The row's sentence: "You added $150", "Maya approved Sam's $300", … */
export function activityText(i: ActivityItemVM, meId: string | null): string {
  const who = meId !== null && i.actorId === meId ? t("feed.you") : i.actorName
  const amount = i.amount !== undefined ? formatUsd(i.amount, "whole") : ""
  switch (i.kind) {
    case "created":
      return t("activity.created", { who })
    case "joined":
      return t("activity.joined", { who })
    case "added":
      return t("activity.added", { who, amount })
    case "asked":
      if (i.link) return t("activity.asked.link", { who, amount, reason: i.reason ?? "" })
      return i.path === "instant" ? t("activity.asked.instant", { who, amount, reason: i.reason ?? "" }) : t("activity.asked.vote", { who, amount, reason: i.reason ?? "" })
    case "refund":
      return t("activity.refund", { who, amount })
    case "gift":
      return t("activity.gift", { who, amount, potName: i.potName })
    case "topup":
      return t("activity.topup", { who, amount: formatUsd(i.topup?.perPerson ?? 0n, "whole") })
    case "rules_asked":
      return t("activity.rules_asked", { who })
    case "rules_changed":
      return t("activity.rules_changed", { who })
    case "close_asked":
      return t("activity.close_asked", { who })
    case "voted": {
      const yes = i.vote !== "Reject"
      const a = i.about
      if (a?.type === "close") return yes ? t("activity.voted.close.approve", { who }) : t("activity.voted.close.reject", { who })
      if (a?.type === "rules") return yes ? t("activity.voted.rules.approve", { who }) : t("activity.voted.rules.reject", { who })
      if (a?.type === "spend" && a.name && a.amount !== undefined) {
        const vars = { who, name: a.name, amount: formatUsd(a.amount, "whole") }
        return yes ? t("activity.voted.approve", vars) : t("activity.voted.reject", vars)
      }
      return yes ? t("activity.voted.approve.other", { who }) : t("activity.voted.reject.other", { who })
    }
  }
}

/** A list row's line 1 when the list is one person's (who is the heading): "Approved Maya's $300", "Added money". */
export function activityTitle(i: ActivityItemVM): string {
  switch (i.kind) {
    case "created":
      return t("row.activity.created")
    case "joined":
      return t("row.activity.joined")
    case "added":
      return t("row.added")
    case "asked":
      // the reason's category ("Groceries"); "Other" gives way to the note
      if (i.category && i.category !== "other") return t(`row.reason.${i.category}`)
      return i.reason && i.reason !== t("spend.reason.word.other") ? i.reason : t("row.reason.other")
    case "refund":
      return t("row.activity.refund")
    case "gift":
      return t("row.activity.gift")
    case "topup":
      return t("topup.row.title", { amount: formatUsd(i.topup?.perPerson ?? 0n, "whole") })
    case "rules_asked":
      return t("row.activity.rules_asked")
    case "rules_changed":
      return t("row.activity.rules_changed")
    case "close_asked":
      return t("row.activity.close_asked")
    case "voted": {
      const yes = i.vote !== "Reject"
      const a = i.about
      if (a?.type === "close") return t(yes ? "row.activity.voted.close.approve" : "row.activity.voted.close.reject")
      if (a?.type === "rules") return t(yes ? "row.activity.voted.rules.approve" : "row.activity.voted.rules.reject")
      if (a?.type === "spend" && a.name && a.amount !== undefined) {
        const vars = { name: a.name, amount: formatUsd(a.amount, "whole") }
        return yes ? t("row.activity.voted.approve", vars) : t("row.activity.voted.reject", vars)
      }
      return t(yes ? "row.activity.voted.approve.other" : "row.activity.voted.reject.other")
    }
  }
}

/** The chip a list row shows (the title already says what a vote, an add or a refund was). */
export function rowChip(i: ActivityItemVM): { status: ActivityStatus | "instant"; word?: string } | null {
  if (!i.status) return null
  if (i.kind === "topup" && i.topup) return { status: i.status, word: t(TOPUP_WORD[i.topup.status]) }
  if (i.kind === "added" || i.kind === "refund" || i.kind === "voted" || i.kind === "joined" || i.kind === "created" || i.kind === "gift") return null
  if (i.kind === "asked" && i.link) return { status: i.status, word: t(i.link === "waiting" ? "row.status.waiting_plain" : i.link === "ready" ? "paylink.chip.sent" : (`paylink.chip.${i.link}` as "paylink.chip.ready")) }
  if (i.kind === "asked" && i.status === "approved" && i.path === "instant") return { status: "instant" }
  if (i.status === "declined") return { status: "declined", word: t("row.status.declined") }
  if (i.status === "needs") return { status: "needs", word: t("row.status.waiting_plain") }
  return { status: i.status }
}

/** The chip's word, when it isn't the status's default. */
export function chipWord(i: ActivityItemVM): string | undefined {
  if (i.kind === "asked" && i.link) return t(i.link === "waiting" ? "paylink.chip.waiting" : (`paylink.chip.${i.link}` as "paylink.chip.ready"))
  if (i.kind === "refund") return t("activity.chip.received")
  if (i.kind === "added") return t("activity.chip.added")
  if (i.kind === "voted") return i.vote === "Reject" ? t("activity.chip.declined") : t("chip.approved")
  return undefined
}

/** Where tapping a row goes: the Pot, at the item (a request opens its sheet; rules and close their place). */
/** A row about one spend (asked for it, or approved/declined it): it opens that spend's details. */
export const isSpendItem = (i: ActivityItemVM): i is ActivityItemVM & { requestId: number } =>
  i.requestId !== undefined && (i.kind === "asked" || (i.kind === "voted" && i.about?.type === "spend"))

export function activityHref(i: ActivityItemVM): string {
  const pot = `/p/${encodeURIComponent(i.slug)}`
  // a gift: the giver isn't in the Pot, so the row isn't a link (ActivityRow); this is only a fallback
  if (i.kind === "gift") return `/give/${encodeURIComponent(i.slug)}`
  // every spend opens its details (instant ones too: how it was approved, its receipt, the comments)
  if (i.kind === "asked" || (i.kind === "voted" && i.about?.type === "spend")) return i.requestId !== undefined ? `${pot}?r=${i.requestId}` : pot
  if (i.kind === "rules_asked" || i.kind === "rules_changed" || (i.kind === "voted" && i.about?.type === "rules")) return `${pot}?tab=rules`
  // the refund: the closed Pot's summary (who got what); a close request (maybe declined) is on the Pot itself
  if (i.kind === "refund") return `${pot}?sheet=close`
  if (i.kind === "joined" || i.kind === "created") return `${pot}?tab=members`
  return pot
}

const TOPUP_WORD = { open: "topup.chip.asking", done: "topup.chip.done", ended: "topup.chip.ended", cancelled: "topup.chip.cancelled" } as const
const TOPUP_STATUS: Record<TopupVM["status"], ActivityStatus> = { open: "needs", done: "approved", ended: "expired", cancelled: "cancelled" }

/** An ask I made ("Ask for a top-up") as a row of my activity: it opens the Pot, where its card or row is. */
export function topupActivity(v: TopupVM, me: { id: string; name: string }): ActivityItemVM {
  return {
    key: `topup:${v.slug}:${v.id}`,
    kind: "topup",
    at: v.createdAt,
    slug: v.slug,
    potName: v.potName,
    potEmoji: v.potEmoji,
    potCover: v.potCover,
    actorId: me.id,
    actorName: me.name,
    status: TOPUP_STATUS[v.status],
    topup: { id: v.id, status: v.status, perPerson: v.perPerson },
  }
}

/** A gift I sent (hub 1.2.0) as a row of my activity. */
export function giftActivity(g: { ref: string; slug: string; potName: string; potEmoji: string; potCover: number; amount: Micro; at: number; txHash?: string }, me: { id: string; name: string }): ActivityItemVM {
  return { key: `gift:${g.ref}`, kind: "gift", at: g.at, slug: g.slug, potName: g.potName, potEmoji: g.potEmoji, potCover: g.potCover, actorId: me.id, actorName: me.name, amount: g.amount, status: "sent", ...(g.txHash ? { txHash: g.txHash } : {}) }
}
