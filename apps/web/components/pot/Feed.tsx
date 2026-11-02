"use client"
// ActivityFeed + FeedItem (ux-spec §3, §5.5; design-direction 02 §2.5). A <ul> grouped by day headings.
// Money rows are compact (CompactRow, 2026-11-02): avatar + reason badge, "Maya · Groceries", a meta line with the
// status chip (icon + one word), receipt and comment marks and the time, and the amount column ("+ $150.00" in
// `approved`, "− $84.00" in ink). Every spend row opens its details sheet, where the explanations live; its name
// says it all in words. Instant spends sit on the same surface as every other row: the "Instant" chip says it
// (no brand-soft tint; 2026-11-02). System events are quiet centred lines.
// Pending ops render on top with "Sending…"; a failed one fades out (the toast says what happened).
import { DoorClosed, Flag, Hand, PartyPopper, Scale, Undo2, UserPlus } from "lucide-react"
import { Fragment } from "react"
import { LinkRow } from "@/components/paylink/LinkRow"
import { GiftRow } from "@/components/gifts/GiftRow"
import { MoneyText } from "@/components/money/MoneyText"
import {
  chipGround,
  CommentMark,
  CompactRow,
  LeadAvatar,
  PlusIcon,
  ReceiptMark,
  reasonBadge,
  reasonTitle,
  rowLabel,
  rowWhen,
  RowTitle,
  type RowGround,
} from "@/components/pot/CompactRow"
import { StatusChip, type ChipStatus } from "@/components/pot/StatusChip"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import type { Category, FeedItemVM, PersonVM, RequestVM } from "@/lib/client/mock/types"
import type { PendingOp } from "@/lib/client/ops/store"
import { openRequest } from "@/lib/client/sheet"
import { dayLabel, formatDate } from "@/lib/client/time"
import { isTxHash } from "@/lib/client/explorer"

export function reasonWord(r: Pick<RequestVM, "category" | "note">): string {
  return r.note?.trim() || t(`spend.reason.word.${r.category}` as `spend.reason.word.${Category}`)
}

export function names(people: Pick<PersonVM, "name">[]): string {
  const list = people.map((p) => p.name)
  if (list.length <= 1) return list[0] ?? ""
  if (list.length === 2) return t("feed.and", { a: list[0]!, b: list[1]! })
  return t("feed.and", { a: list.slice(0, -1).join(", "), b: list[list.length - 1]! })
}

function SystemLine({ icon, text, txHash }: { icon: React.ReactNode; text: string; txHash?: string }) {
  return (
    <li className="pot-enter flex list-none flex-wrap items-center justify-center gap-x-1.5 px-3 py-2 text-center text-body-sm text-ink-muted">
      <span aria-hidden className="[&_svg]:size-4">
        {icon}
      </span>
      {text}
      {isTxHash(txHash) && (
        <>
          <span aria-hidden>·</span>
          <ReceiptLink txHash={txHash} what={text} />
        </>
      )}
    </li>
  )
}

/** A spend's status in the row: the chip (icon + one word) and what it means, in words, for the row's name. */
export function spendStatus(r: RequestVM, now: number, opts: { sentKey?: boolean; ground?: RowGround } = {}) {
  const g = chipGround(opts.ground ?? "surface")
  const chip = (status: ChipStatus, word?: string) => (
    <StatusChip size="sm" ground={g} status={opts.sentKey ? "sent" : status}>
      {opts.sentKey ? undefined : word}
    </StatusChip>
  )
  const amountWhole = formatUsd(r.amount, "whole")
  const reason = reasonWord(r)
  switch (r.status) {
    case "instant":
      return { chip: chip("instant"), sentence: t("feed.instant", { name: r.requester.name, amount: amountWhole, reason }), said: [t("row.a11y.instant")], money: "out" as const }
    case "needs": {
      const word = r.tier === "one_ok" && r.declines.length === 0 ? t("feed.pending.one_ok") : t("row.status.waiting", { count: r.approvals.length, k: r.k })
      return {
        chip: chip("needs", word),
        sentence: t("feed.pending", { name: r.requester.name, amount: amountWhole, reason }),
        said: [r.tier === "one_ok" && r.declines.length === 0 ? word : t("approve.progress", { count: r.approvals.length, k: r.k }), t("approve.expires", { relativeTime: inWords(r.expiresAt, now) })],
        money: "asked" as const,
      }
    }
    case "approved":
      return {
        chip: chip("approved", r.okBy ? t("row.status.one_ok") : undefined),
        sentence: t("feed.approved", { amount: amountWhole, name: r.receiver.name, reason }),
        said: [r.okBy ? t("feed.approved.ok", { name: r.okBy.name }) : r.approvals.length ? t("feed.approved.sub", { names: names(r.approvals) }) : t("chip.approved")],
        money: "out" as const,
      }
    case "declined":
      return {
        chip: chip("declined", t("row.status.declined")),
        sentence: t("feed.declined", { name: r.requester.name, amount: amountWhole }),
        said: [r.declines.length ? t("feed.declined.sub", { names: names(r.declines) }) : t("row.status.declined"), t("chip.not_sent")],
        money: "struck" as const,
      }
    case "expired":
      return { chip: chip("expired"), sentence: t("feed.expired", { name: r.requester.name, amount: amountWhole }), said: [t("feed.expired.sub", { date: formatDate(r.expiresAt) }), t("chip.not_sent")], money: "struck" as const }
    case "failed":
      return { chip: chip("failed"), sentence: t("feed.failed", { amount: amountWhole }), said: [t("feed.failed.sub")], money: "muted" as const }
  }
}

/** The amount column for a spend: "− $84.00" once paid, "$300.00" while asked, struck (and "Not sent") when it wasn't. */
export function SpendAmount({ micro, money }: { micro: RequestVM["amount"]; money: "out" | "asked" | "struck" | "muted" }) {
  if (money === "out") return <MoneyText micro={micro} sign="out" className="text-ink" />
  if (money === "struck") return <MoneyText micro={micro} strike className="text-ink-muted" />
  return <MoneyText micro={micro} className={money === "muted" ? "text-ink-muted" : "text-ink"} />
}

export function RequestRow({
  r,
  now,
  sentKey,
  at,
  showPot,
}: {
  r: RequestVM
  now: number
  sentKey?: boolean
  /** the feed item's time (else when it was decided, or asked) */
  at?: number
  /** lists across Pots (Requests → Your requests): the Pot's name after the reason */
  showPot?: boolean
}) {
  // pay by link (hub 1.1.0): where the link is now ("Link sent", "Claimed", "Returned")
  if (r.link) return <LinkRow r={r} now={now} at={at} showPot={showPot} />
  const ground: RowGround = "surface"
  const s = spendStatus(r, now, { sentKey, ground })
  // once the group sent it, the row is about the person paid (pay a member); otherwise about who asked
  const person = r.status === "approved" || r.status === "failed" ? r.receiver : r.requester
  const when = rowWhen(at ?? r.decidedAt ?? r.createdAt, now)
  const pot = showPot ? { emoji: r.potEmoji, name: r.potName } : undefined
  return (
    <CompactRow
      ground={ground}
      // every spend opens its details (how it was approved, its receipt, comments)
      onOpen={() => openRequest(r.id, r.slug)}
      label={rowLabel([s.sentence, ...s.said, pot && pot.name, r.hasReceipt && t("details.receipt.indicator"), !!r.comments && t("comments.count", { n: r.comments }), when.long])}
      lead={<LeadAvatar person={person} badge={reasonBadge(r)} ground={ground} />}
      title={<RowTitle who={showPot ? undefined : person.name} what={reasonTitle(r)} pot={pot} />}
      meta={
        <>
          {s.chip}
          {r.hasReceipt && <ReceiptMark />}
          <CommentMark n={r.comments} />
        </>
      }
      aside={s.money === "struck" ? t("chip.not_sent") : when.short}
      amount={<SpendAmount micro={r.amount} money={s.money} />}
      data-request-row={r.id}
      data-row-status={r.status}
    />
  )
}


function inWords(at: number, now: number) {
  const d = at - now
  if (d <= 0) return t("time.soon")
  const days = Math.round(d / 86_400_000)
  return days >= 1 ? t("time.in_days", { n: days }) : t("time.in_hours", { n: Math.max(1, Math.round(d / 3_600_000)) })
}
export { inWords }

function FeedItem({ item, now, sentKeys, potName }: { item: FeedItemVM; now: number; sentKeys: Set<string>; potName: string }) {
  switch (item.kind) {
    case "created":
      return <SystemLine icon={<PartyPopper strokeWidth={2} />} text={t("feed.created", { name: item.actor.name, potName })} txHash={item.txHash} />
    case "joined":
      return <SystemLine icon={<UserPlus strokeWidth={2} />} text={t("feed.joined", { name: item.actor.name })} txHash={item.txHash} />
    case "contribution": {
      const when = rowWhen(item.at, now)
      const sent = sentKeys.has(item.key)
      return (
        <CompactRow
          label={rowLabel([t("feed.contribution", { name: item.actor.name, amount: formatUsd(item.amount, "whole") }), sent && t("chip.sent"), when.long])}
          lead={<LeadAvatar person={item.actor} badge={PlusIcon} />}
          title={<RowTitle who={item.actor.name} what={t("row.added")} />}
          meta={
            <>
              {sent && <StatusChip size="sm" status="sent" />}
              {/* money in has no details sheet: its proof stays on the row */}
              {isTxHash(item.txHash) && <ReceiptLink txHash={item.txHash} what={t("feed.contribution", { name: item.actor.name, amount: formatUsd(item.amount, "whole") })} />}
            </>
          }
          aside={when.short}
          amount={<MoneyText micro={item.amount} sign="in" className="text-approved" />}
          data-row-status="added"
        />
      )
    }
    case "request":
      return <RequestRow r={item.request} now={now} at={item.at} sentKey={sentKeys.has(item.key)} />
    case "close_requested":
      return <SystemLine icon={<Hand strokeWidth={2} />} text={`${t("feed.close_requested", { name: item.actor.name })} · ${t("feed.close_requested.sub", { k: item.k })}`} txHash={item.txHash} />
    case "closed":
      return <SystemLine icon={<DoorClosed strokeWidth={2} />} text={`${t("feed.closed")} ${t("feed.closed.sub")}`} txHash={item.txHash} />
    case "rules_requested":
      return <SystemLine icon={<Scale strokeWidth={2} />} text={`${t("feed.rules_requested", { name: item.actor.name })} · ${t("feed.rules_requested.sub", { k: item.k })}`} txHash={item.txHash} />
    case "rules_changed":
      return <SystemLine icon={<Scale strokeWidth={2} />} text={item.actor ? t("feed.rule_change", { name: item.actor.name }) : t("feed.rules_changed.group")} txHash={item.txHash} />
    case "gift":
      // hub 1.2.0: someone outside (or inside) the Pot sent it a gift
      return <GiftRow gift={item.gift} now={now} />
    case "goal":
      // hub 1.1.0: the goal with a date (reached; the all-or-nothing refund started / done)
      return item.state === "reached" ? (
        <SystemLine icon={<Flag strokeWidth={2} />} text={t("feed.goal.reached", { amount: formatUsd(item.amount, "whole") })} txHash={item.txHash} />
      ) : (
        <SystemLine icon={<Undo2 strokeWidth={2} />} text={t(item.state === "refunding" ? "feed.goal.refunding" : "feed.goal.refunded")} txHash={item.txHash} />
      )
  }
}

export function OpRow({ op, me }: { op: PendingOp; me: PersonVM }) {
  if (op.kind !== "add" || !op.amount) return null
  if (op.status === "confirmed" || op.status === "cancelled") return null
  const main = t("add.sending", { amount: formatUsd(op.amount, "whole") })
  return (
    <CompactRow
      fading={op.status === "failed"}
      label={rowLabel([main, t("chip.sending")])}
      lead={<LeadAvatar person={me} badge={PlusIcon} />}
      title={main}
      meta={<StatusChip size="sm" status="sending" />}
      amount={<MoneyText micro={op.amount} sign="in" className="text-ink-muted" />}
      data-row-status="sending"
    />
  )
}

export function ActivityFeed({
  items,
  ops,
  me,
  now,
  potName,
  headingLevel = 3,
}: {
  items: FeedItemVM[]
  ops: readonly PendingOp[]
  me: PersonVM
  now: number
  potName: string
  headingLevel?: 2 | 3
}) {
  const sentKeys = new Set(ops.filter((o) => o.status === "confirmed" && o.resultKey).map((o) => o.resultKey!))
  const visibleOps = ops.filter((o) => o.kind === "add" && o.status !== "confirmed" && o.status !== "cancelled")
  const H = `h${headingLevel}` as "h2" | "h3"
  const groups: { label: string; items: FeedItemVM[] }[] = []
  for (const it of items) {
    const label = dayLabel(it.at, now)
    const g = groups[groups.length - 1]
    if (g && g.label === label) g.items.push(it)
    else groups.push({ label, items: [it] })
  }
  if (visibleOps.length && (!groups[0] || groups[0].label !== t("feed.day.today"))) groups.unshift({ label: t("feed.day.today"), items: [] })
  return (
    <div className="flex flex-col gap-2" data-feed>
      {groups.map((g, gi) => (
        <Fragment key={g.label}>
          <H className="px-1 pt-3 text-label text-ink-muted first:pt-0">{g.label}</H>
          <ul className="flex flex-col gap-2">
            {gi === 0 && visibleOps.map((o) => <OpRow key={o.id} op={o} me={me} />)}
            {g.items.map((it) => (
              <FeedItem key={it.key} item={it} now={now} sentKeys={sentKeys} potName={potName} />
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  )
}
