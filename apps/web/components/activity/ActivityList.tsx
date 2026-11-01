"use client"
// A person's activity rows grouped by day (You → "Your activity"; a member's sheet on a Pot). Each row: what they
// did (a sentence), the Pot and the time, the amount, a status chip (icon + word) and, when a real transaction is
// behind it, a quiet "Receipt ↗" in its corner. On You a row is a link to the Pot at that item; the receipt link
// sits beside it (never inside another interactive element), over space the row keeps free for it. On a member's
// sheet (not linked) a row about a spend is a button that opens the spend's details; "Receipt attached" marks one
// with saved receipt details.
import Link from "next/link"
import { Fragment } from "react"
import { MoneyText } from "@/components/money/MoneyText"
import { CoverTile } from "@/components/pot/CoverTile"
import { StatusChip } from "@/components/pot/StatusChip"
import { ReceiptLink, ReceiptSpace } from "@/components/receipt/ReceiptLink"
import { t } from "@/i18n/t"
import { activityHref, activityText, chipWord, groupByDay, isSpendItem, type ActivityItemVM } from "@/lib/client/activity"
import { ReceiptIndicator } from "@/components/receipt/ReceiptIndicator"
import { cn } from "@/lib/client/cn"
import { isTxHash } from "@/lib/client/explorer"
import { formatTime } from "@/lib/client/time"

export function ActivityRow({
  item,
  meId,
  linked,
  showPot = true,
  sunken,
  onOpen,
}: {
  item: ActivityItemVM
  meId: string | null
  linked: boolean
  showPot?: boolean
  sunken?: boolean
  /** not linked (a member's sheet): rows about a spend open its details here */
  onOpen?: (item: ActivityItemVM) => void
}) {
  const text = activityText(item, meId)
  const receipt = isTxHash(item.txHash)
  const sub = [
    ...(showPot ? [item.potName] : []),
    ...(item.kind === "asked" && item.path ? [t(item.path === "instant" ? "activity.path.instant" : "activity.path.vote")] : []),
    formatTime(item.at),
  ].join(" · ")
  const body = (
    <>
      {showPot && <CoverTile emoji={item.potEmoji} cover={item.potCover} size="sm" className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-body text-pretty text-ink">{text}</p>
        <p className="mt-0.5 text-body-sm text-ink-muted">{sub}</p>
        {(item.status || item.hasReceipt) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {item.status && <StatusChip status={item.status}>{chipWord(item)}</StatusChip>}
            {item.hasReceipt && <ReceiptIndicator className="text-body-sm text-ink-muted" />}
          </div>
        )}
      </div>
      {(item.amount !== undefined || receipt) && (
        <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch pt-0.5 text-right">
          {item.amount !== undefined ? <MoneyText micro={item.amount} className="text-ink" /> : <span />}
          {receipt && <ReceiptSpace />}
        </div>
      )}
    </>
  )
  const cls = cn("flex w-full items-start gap-3 rounded-md p-3 text-left", sunken ? "bg-surface-sunken" : "bg-surface")
  const opens = !!onOpen && isSpendItem(item)
  return (
    <li className="relative list-none" data-activity={item.kind} data-activity-key={item.key}>
      {linked ? (
        <Link href={activityHref(item)} className={cn(cls, "hover:bg-surface-sunken")}>
          {body}
        </Link>
      ) : opens ? (
        <button type="button" onClick={() => onOpen(item)} className={cn(cls, sunken ? "hover:bg-line" : "hover:bg-surface-sunken")} data-activity-open>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {receipt && <ReceiptLink txHash={item.txHash} what={text} className="absolute right-3 bottom-2.5" />}
    </li>
  )
}

export function ActivityList({
  items,
  meId,
  now,
  linked,
  showPot,
  sunken,
  headingLevel = 3,
  onOpen,
}: {
  items: readonly ActivityItemVM[]
  meId: string | null
  now: number
  linked: boolean
  showPot?: boolean
  /** rows on surface-sunken (inside a sheet, which is surface) */
  sunken?: boolean
  headingLevel?: 2 | 3 | 4
  onOpen?: (item: ActivityItemVM) => void
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4"
  return (
    <div className="flex flex-col gap-2" data-activity-list>
      {groupByDay(items, now).map((g) => (
        <Fragment key={g.label}>
          <H className="px-1 pt-3 text-label text-ink-muted first:pt-0">{g.label}</H>
          <ul className="flex flex-col gap-2">
            {g.items.map((it) => (
              <ActivityRow key={it.key} item={it} meId={meId} linked={linked} showPot={showPot} sunken={sunken} onOpen={onOpen} />
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  )
}
