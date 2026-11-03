"use client"
// Money paid in from outside, in the Pot's feed (members; "pay in", notes/frontend.md 2026-11-03): the compact row
// (CompactRow). A payment: "Alex · Paid in · by link" with an ArrowDownLeft badge and a "From outside" chip; a gift (its
// link or page said gift): "Ana · Sent a gift ☕" with a Gift badge and a "Gift" chip. Both chips are icon + word, ink.
// A note mark when they wrote one, the time, and "+ $10.00" in `approved`. The row opens the details
// (?sheet=gift&gift=<ref>), where the note is. Its name says it all in words.
import { ArrowDownLeft, Gift, StickyNote } from "lucide-react"
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

/** "From outside" as a chip: money paid in by someone who isn't in the Pot (ArrowDownLeft + the word, ink). */
export function OutsideChip({ ground = "sunken", size = "sm", className }: { ground?: "sunken" | "surface"; size?: "sm" | "md"; className?: string }) {
  return (
    <span data-status="outside" className={cn(chipClass(size, ground), "text-ink", className)}>
      <ArrowDownLeft aria-hidden className={chipIconClass(size)} strokeWidth={2.25} />
      <span>{t("chip.outside")}</span>
    </span>
  )
}

/** The pay-in's own chip: "Gift" for a gift, "From outside" for a payment. */
export function PayInChip({ gift, ...rest }: { gift: Pick<GiftVM, "tone">; ground?: "sunken" | "surface"; size?: "sm" | "md"; className?: string }) {
  return gift.tone === "gift" ? <GiftChip {...rest} /> : <OutsideChip {...rest} />
}

export function GiftRow({ gift, now }: { gift: GiftVM; now: number }) {
  const ground: RowGround = "surface"
  const when = rowWhen(gift.at, now)
  const amount = formatUsd(gift.amount, "whole")
  const isGift = gift.tone === "gift"
  const sentence = isGift
    ? t("feed.gift", { name: gift.from.name, amount })
    : gift.linkId
      ? t("feed.payin", { name: gift.from.name, amount })
      : t("feed.payin.page", { name: gift.from.name, amount })
  return (
    <CompactRow
      ground={ground}
      onOpen={() => openSheet("gift", { gift: gift.ref })}
      label={rowLabel([sentence, gift.note && t("row.gift.note"), when.long])}
      lead={<LeadAvatar person={gift.from} badge={isGift ? Gift : ArrowDownLeft} ground={ground} />}
      title={<RowTitle who={gift.from.name} what={isGift ? t("row.gift") : gift.linkId ? t("row.payin") : t("row.payin.page")} />}
      meta={
        <>
          <PayInChip gift={gift} ground={chipGround(ground)} />
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
      data-row-status={isGift ? "gift" : "outside"}
    />
  )
}
