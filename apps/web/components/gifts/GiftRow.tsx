"use client"
// A gift in the Pot's feed (members): the compact row (CompactRow) "Ana · Sent a gift ☕" with the giver's avatar and a
// Gift badge, a "Gift" chip (icon + word), a note mark when they wrote one, the time, and "+ $10.00" in `approved`.
// The row opens the gift's details (?sheet=gift&gift=<ref>), where the note is. Its name says it all in words.
import { Gift, StickyNote } from "lucide-react"
import { MoneyText } from "@/components/money/MoneyText"
import { chipGround, CompactRow, LeadAvatar, rowLabel, rowWhen, RowTitle, type RowGround } from "@/components/pot/CompactRow"
import { chipClass, chipIconClass } from "@/components/pot/StatusChip"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { GiftVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { openSheet } from "@/lib/client/sheet"

/** "Gift" as a chip: the Gift icon + the word, ink (a gift isn't a status colour). */
export function GiftChip({ ground = "sunken", size = "sm", className }: { ground?: "sunken" | "surface"; size?: "sm" | "md"; className?: string }) {
  return (
    <span data-status="gift" className={cn(chipClass(size, ground), "text-ink", className)}>
      <Gift aria-hidden className={chipIconClass(size)} strokeWidth={2.25} />
      <span>{t("chip.gift")}</span>
    </span>
  )
}

export function GiftRow({ gift, now }: { gift: GiftVM; now: number }) {
  const ground: RowGround = "surface"
  const when = rowWhen(gift.at, now)
  const amount = formatUsd(gift.amount, "whole")
  return (
    <CompactRow
      ground={ground}
      onOpen={() => openSheet("gift", { gift: gift.ref })}
      label={rowLabel([t("feed.gift", { name: gift.from.name, amount }), gift.note && t("row.gift.note"), when.long])}
      lead={<LeadAvatar person={gift.from} badge={Gift} ground={ground} />}
      title={<RowTitle who={gift.from.name} what={t("row.gift")} />}
      meta={
        <>
          <GiftChip ground={chipGround(ground)} />
          {gift.note && (
            <span className="inline-flex items-center" title={t("row.gift.note")} data-gift-note-mark>
              <StickyNote aria-hidden className="size-4 shrink-0" strokeWidth={2} />
              <span className="sr-only">{t("row.gift.note")}</span>
            </span>
          )}
        </>
      }
      aside={when.short}
      amount={<MoneyText micro={gift.amount} sign="in" className="text-approved" />}
      data-gift-row={gift.ref}
      data-row-status="gift"
    />
  )
}
