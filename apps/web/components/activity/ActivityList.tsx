"use client"
// A person's activity rows grouped by day (You → "Your activity"; a member's sheet on a Pot), as compact rows
// (CompactRow): a 40 px lead (on You the Pot's cover, on a member's sheet the kind's icon; a spend's reason as a
// badge), line 1 what they did in short ("Groceries", "Approved Maya's $300", "Added money"; " · Ski Chalet" on
// You), line 2 the status chip (icon + one word), the receipt mark and the time, and the amount. The row's name is
// the full sentence ("You got $35 back for food. Instant…"). On You a row is a link to the Pot at that item (a spend
// opens its details); on a member's sheet a row about a spend is a button that opens the spend's details. Rows
// with no details sheet (money in, a refund, a join) keep their quiet "Receipt ↗" when a real transaction is
// behind them: inline when the row isn't a control, else beside the row's link over space the row keeps for it.
import { DoorClosed, Hand, PartyPopper, Scale, Undo2, UserPlus, X, Check, type LucideIcon } from "lucide-react"
import { Fragment } from "react"
import { MoneyText } from "@/components/money/MoneyText"
import { CompactRow, LeadTile, PlusIcon, REASON_ICON, ReceiptMark, rowLabel, rowWhen, RowTitle, chipGround, type RowGround } from "@/components/pot/CompactRow"
import { LinkStatusChip } from "@/components/paylink/LinkStatus"
import { CoverTile } from "@/components/pot/CoverTile"
import { StatusChip } from "@/components/pot/StatusChip"
import { ReceiptLink, ReceiptSpace } from "@/components/receipt/ReceiptLink"
import { t } from "@/i18n/t"
import { activityHref, activityText, activityTitle, chipWord, groupByDay, isSpendItem, rowChip, type ActivityItemVM } from "@/lib/client/activity"
import { isTxHash } from "@/lib/client/explorer"

/** The kind's icon (the lead on a member's sheet, the badge on You). */
function kindIcon(i: ActivityItemVM): LucideIcon {
  switch (i.kind) {
    case "asked":
      return REASON_ICON[i.category ?? "other"]
    case "added":
      return PlusIcon
    case "refund":
      return Undo2
    case "joined":
      return UserPlus
    case "created":
      return PartyPopper
    case "rules_asked":
    case "rules_changed":
      return Scale
    case "close_asked":
      return i.status === "approved" ? DoorClosed : Hand
    case "voted":
      return i.vote === "Reject" ? X : Check
  }
}

export function ActivityRow({
  item,
  meId,
  linked,
  showPot = true,
  sunken,
  onOpen,
  now = 0,
}: {
  item: ActivityItemVM
  meId: string | null
  linked: boolean
  showPot?: boolean
  sunken?: boolean
  /** not linked (a member's sheet): rows about a spend open its details here */
  onOpen?: (item: ActivityItemVM) => void
  now?: number
}) {
  const text = activityText(item, meId)
  const ground: RowGround = sunken ? "sunken" : "surface"
  const chip = rowChip(item)
  const when = rowWhen(item.at, now)
  const spend = isSpendItem(item)
  const opens = !linked && !!onOpen && spend
  // a transaction's receipt stays on rows that open no details sheet (a spend's is in its sheet)
  const receipt = isTxHash(item.txHash) && !spend
  const receiptBeside = receipt && linked
  const struck = item.kind === "asked" && (item.status === "declined" || item.status === "expired") && !item.link
  const money =
    item.amount === undefined ? undefined : item.kind === "added" || item.kind === "refund" ? (
      <MoneyText micro={item.amount} sign="in" className="text-approved" />
    ) : struck ? (
      <MoneyText micro={item.amount} strike className="text-ink-muted" />
    ) : item.kind === "asked" && (item.status === "approved" || item.status === "sent") ? (
      <MoneyText micro={item.amount} sign="out" className="text-ink" />
    ) : (
      <MoneyText micro={item.amount} className="text-ink" />
    )
  const chipWordText = chip ? (chip.word ?? chipWord(item) ?? t(chip.status === "instant" ? "chip.instant" : `chip.${chip.status}`)) : undefined
  return (
    <CompactRow
      ground={ground}
      href={linked ? activityHref(item) : undefined}
      onOpen={opens ? () => onOpen(item) : undefined}
      label={rowLabel([
        text,
        chip?.status === "instant" ? t("row.a11y.instant") : chip && chipWordText,
        struck && t("chip.not_sent"),
        showPot && item.potName,
        item.hasReceipt && t("details.receipt.indicator"),
        when.long,
      ])}
      lead={
        showPot ? (
          <LeadTile badge={kindIcon(item)} ground={ground}>
            <CoverTile emoji={item.potEmoji} cover={item.potCover} className="size-10 rounded-md text-xl" />
          </LeadTile>
        ) : (
          <LeadTile icon={kindIcon(item)} ground={ground} />
        )
      }
      title={<RowTitle what={activityTitle(item)} pot={showPot ? { emoji: "", name: item.potName } : undefined} />}
      meta={
        <>
          {item.kind === "asked" && item.link && item.link !== "waiting" ? (
            <LinkStatusChip size="sm" ground={chipGround(ground)} status={item.link} short />
          ) : (
            chip && (
              <StatusChip size="sm" ground={chipGround(ground)} status={chip.status}>
                {chipWordText}
              </StatusChip>
            )
          )}
          {item.hasReceipt && <ReceiptMark />}
          {receipt && !receiptBeside && <ReceiptLink txHash={item.txHash} what={text} />}
          {receiptBeside && <span className="tabular-nums">{when.short}</span>}
        </>
      }
      aside={receiptBeside ? <ReceiptSpace /> : struck ? t("chip.not_sent") : when.short}
      amount={money}
      extra={receiptBeside ? <ReceiptLink txHash={item.txHash} what={text} className="absolute right-3 bottom-2.5" /> : undefined}
      data-activity={item.kind}
      data-activity-key={item.key}
      data-activity-open={opens || undefined}
    />
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
              <ActivityRow key={it.key} item={it} meId={meId} linked={linked} showPot={showPot} sunken={sunken} onOpen={onOpen} now={now} />
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
  )
}
