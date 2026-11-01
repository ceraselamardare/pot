"use client"
// ActivityFeed + FeedItem (ux-spec §3, §5.5; design-direction 02 §2.5). A <ul> grouped by day headings.
// Money rows: avatar, a sentence that carries the words, a muted sub-line and the amount column ("+ $150.00" in
// `approved`, "− $84.00" in ink). The instant spend row is tinted brand-soft with ink text and only the check in
// `approved` (approved-on-brand-soft fails 4.5:1 in Day). System events are quiet centred lines.
// Pending ops render on top with "Sending…"; a failed one fades out (the toast says what happened).
import { Check, DoorClosed, Hand, PartyPopper, Scale, UserPlus } from "lucide-react"
import { Fragment } from "react"
import { Avatar } from "@/components/pot/Avatar"
import { MoneyText } from "@/components/money/MoneyText"
import { StatusChip } from "@/components/pot/StatusChip"
import { ReceiptLink, ReceiptSpace } from "@/components/receipt/ReceiptLink"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import type { Category, FeedItemVM, PersonVM, RequestVM } from "@/lib/client/mock/types"
import type { PendingOp } from "@/lib/client/ops/store"
import { openRequest } from "@/lib/client/sheet"
import { ago, dayLabel, formatDate } from "@/lib/client/time"
import { cn } from "@/lib/client/cn"
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

function Row({
  avatar,
  main,
  sub,
  amount,
  tint,
  onOpen,
  chip,
  fading,
  label,
  txHash,
}: {
  avatar: PersonVM
  main: string
  sub?: React.ReactNode
  amount?: React.ReactNode
  tint?: boolean
  onOpen?: () => void
  chip?: React.ReactNode
  fading?: boolean
  label?: string
  /** the settled transaction: a quiet "Receipt ↗" in the row's corner, beside (never inside) the row's button */
  txHash?: string
}) {
  const receipt = isTxHash(txHash)
  const body = (
    <>
      <Avatar person={avatar} size="sm" ring={tint ? "brand-soft" : "surface"} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-body text-pretty text-ink">{main}</p>
        {sub && <div className={cn("mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm", tint ? "text-ink" : "text-ink-muted")}>{sub}</div>}
        {chip && <div className="mt-2 flex flex-wrap items-center gap-2">{chip}</div>}
      </div>
      {(amount || receipt) && (
        <div className={cn("shrink-0 pt-0.5 text-right", receipt && "flex flex-col items-end justify-between gap-1 self-stretch")}>
          {amount ?? <span />}
          {receipt && <ReceiptSpace />}
        </div>
      )}
    </>
  )
  const cls = cn(
    "flex w-full items-start gap-3 rounded-md p-3 text-left transition-[opacity,background-color] duration-200",
    tint ? "bg-brand-soft" : "bg-surface",
    fading && "opacity-0",
  )
  return (
    <li className={cn("pot-enter list-none", receipt && "relative")}>
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={label} className={cn(cls, "hover:bg-surface-sunken", tint && "hover:bg-brand-soft")}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {receipt && <ReceiptLink txHash={txHash} what={main} className="absolute right-3 bottom-2.5" />}
    </li>
  )
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

export function RequestRow({ r, now, sentKey }: { r: RequestVM; now: number; sentKey?: boolean }) {
  const amountWhole = formatUsd(r.amount, "whole")
  const reason = reasonWord(r)
  const open = () => openRequest(r.id, r.slug)
  switch (r.status) {
    case "instant":
      return (
        <Row
          txHash={r.txHash}
          tint
          avatar={r.requester}
          main={t("feed.instant", { name: r.requester.name, amount: amountWhole, reason })}
          sub={
            <>
              <span className="inline-flex items-center gap-1">
                <Check aria-hidden className="size-4 text-approved" strokeWidth={2.5} />
                {t("spend.approved")}
              </span>
              <span>{t("feed.instant.rule", { instantLimit: formatUsd(r.instantCap, "whole") })}</span>
            </>
          }
          amount={<MoneyText micro={r.amount} sign="out" className="text-ink" />}
          chip={sentKey ? <StatusChip status="sent" /> : undefined}
        />
      )
    case "needs":
      return (
        <Row
          txHash={r.txHash}
          avatar={r.requester}
          onOpen={open}
          main={t("feed.pending", { name: r.requester.name, amount: amountWhole, reason })}
          sub={<span>{t("approve.expires", { relativeTime: inWords(r.expiresAt, now) })}</span>}
          chip={<StatusChip status="needs">{t("approve.progress", { count: r.approvals.length, k: r.k })}</StatusChip>}
          amount={<MoneyText micro={r.amount} className="text-ink" />}
        />
      )
    case "approved":
      return (
        <Row
          txHash={r.txHash}
          avatar={r.receiver}
          onOpen={open}
          main={t("feed.approved", { amount: amountWhole, name: r.receiver.name, reason })}
          sub={<span>{t("feed.approved.sub", { names: names(r.approvals) })}</span>}
          chip={<StatusChip status={sentKey ? "sent" : "approved"} />}
          amount={<MoneyText micro={r.amount} sign="out" className="text-ink" />}
        />
      )
    case "declined":
      return (
        <Row
          txHash={r.txHash}
          avatar={r.requester}
          onOpen={open}
          main={t("feed.declined", { name: r.requester.name, amount: amountWhole })}
          sub={<span>{t("feed.declined.sub", { names: names(r.declines) })}</span>}
          chip={<StatusChip status="declined" />}
          amount={<NotSent r={r} />}
        />
      )
    case "expired":
      return (
        <Row
          txHash={r.txHash}
          avatar={r.requester}
          onOpen={open}
          main={t("feed.expired", { name: r.requester.name, amount: amountWhole })}
          sub={<span>{t("feed.expired.sub", { date: formatDate(r.expiresAt) })}</span>}
          chip={<StatusChip status="expired" />}
          amount={<NotSent r={r} />}
        />
      )
    case "failed":
      return (
        <Row
          txHash={r.txHash}
          avatar={r.receiver}
          onOpen={open}
          main={t("feed.failed", { amount: amountWhole })}
          sub={<span>{t("feed.failed.sub")}</span>}
          chip={<StatusChip status="failed" />}
          amount={<MoneyText micro={r.amount} className="text-ink-muted" />}
        />
      )
  }
}

function NotSent({ r }: { r: RequestVM }) {
  return (
    <span className="flex flex-col items-end">
      <MoneyText micro={r.amount} strike className="text-ink-muted" />
      <span className="text-body-sm text-ink-muted">{t("chip.not_sent")}</span>
    </span>
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
    case "contribution":
      return (
        <Row
          avatar={item.actor}
          main={t("feed.contribution", { name: item.actor.name, amount: formatUsd(item.amount, "whole") })}
          sub={<span>{ago(item.at, now)}</span>}
          chip={sentKeys.has(item.key) ? <StatusChip status="sent" /> : undefined}
          amount={<MoneyText micro={item.amount} sign="in" className="text-approved" />}
          txHash={item.txHash}
        />
      )
    case "request":
      return <RequestRow r={item.request} now={now} sentKey={sentKeys.has(item.key)} />
    case "close_requested":
      return <SystemLine icon={<Hand strokeWidth={2} />} text={`${t("feed.close_requested", { name: item.actor.name })} · ${t("feed.close_requested.sub", { k: item.k })}`} txHash={item.txHash} />
    case "closed":
      return <SystemLine icon={<DoorClosed strokeWidth={2} />} text={`${t("feed.closed")} ${t("feed.closed.sub")}`} txHash={item.txHash} />
    case "rules_requested":
      return <SystemLine icon={<Scale strokeWidth={2} />} text={`${t("feed.rules_requested", { name: item.actor.name })} · ${t("feed.rules_requested.sub", { k: item.k })}`} txHash={item.txHash} />
    case "rules_changed":
      return <SystemLine icon={<Scale strokeWidth={2} />} text={item.actor ? t("feed.rule_change", { name: item.actor.name }) : t("feed.rules_changed.group")} txHash={item.txHash} />
  }
}

export function OpRow({ op, me }: { op: PendingOp; me: PersonVM }) {
  if (op.kind !== "add" || !op.amount) return null
  if (op.status === "confirmed" || op.status === "cancelled") return null
  return (
    <Row
      avatar={me}
      fading={op.status === "failed"}
      main={t("add.sending", { amount: formatUsd(op.amount, "whole") })}
      chip={<StatusChip status="sending" />}
      amount={<MoneyText micro={op.amount} sign="in" className="text-ink-muted" />}
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
