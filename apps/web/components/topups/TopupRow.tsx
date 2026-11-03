"use client"
// A top-up ask as a compact feed row (members only): the asker with a HandCoins badge, "Maya · Asked for $50 each",
// the chip (Asking / Done / Ended / Cancelled: icon + word) and "2 of 4 added", the time. No amount column: an ask
// moves no money (the adds that answer it are their own rows). Its name says it all: "Maya asked everyone for $50
// more. Hotel went up. 2 of 4 added. Asking. 10 min ago".
import { HandCoins } from "lucide-react"
import { CompactRow, LeadAvatar, rowLabel, rowWhen, RowTitle } from "@/components/pot/CompactRow"
import { StatusChip, type ChipStatus } from "@/components/pot/StatusChip"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import type { TopupVM } from "@/lib/client/mock/types"

/** The ask's status as a chip: a status (icon + colour) and its word. */
export function topupChip(v: Pick<TopupVM, "status">): { status: ChipStatus; word: string } {
  switch (v.status) {
    case "open":
      return { status: "needs", word: t("topup.chip.asking") }
    case "done":
      return { status: "approved", word: t("topup.chip.done") }
    case "ended":
      return { status: "expired", word: t("topup.chip.ended") }
    case "cancelled":
      return { status: "cancelled", word: t("topup.chip.cancelled") }
  }
}

export function TopupRow({ v, now }: { v: TopupVM; now: number }) {
  const amount = formatUsd(v.perPerson, "whole")
  const chip = topupChip(v)
  const when = rowWhen(v.createdAt, now)
  const progress = t("topup.row.progress", { done: v.doneCount, n: v.members.length })
  return (
    <CompactRow
      label={rowLabel([t("feed.topup", { name: v.asker.name, amount }), v.reason, progress, chip.word, when.long])}
      lead={<LeadAvatar person={v.asker} badge={HandCoins} />}
      title={<RowTitle who={v.asker.name} what={t("topup.row.title", { amount })} />}
      meta={
        <>
          <StatusChip size="sm" status={chip.status}>
            {chip.word}
          </StatusChip>
          <span className="tabular-nums">{progress}</span>
        </>
      }
      aside={when.short}
      data-topup-row={v.id}
      data-row-status={`topup-${v.status}`}
    />
  )
}
