"use client"
// One pay-in's details for the Pot's members (?sheet=gift&gift=<ref>, opened from its feed row and from the push):
// who sent it (the name they chose), how much, when, how (a pay-in link or the public page), their note (members only;
// "Shown on the public page" when they chose that), the receipt, and the one rule that matters: money from outside
// belongs to the whole group. Titled "Alex paid in" (a payment) or "Ana sent a gift" (a gift). No marigold.
import { ShieldCheck, Quote } from "lucide-react"
import { Avatar } from "@/components/pot/Avatar"
import { MoneyText } from "@/components/money/MoneyText"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { formatDate, formatTime } from "@/lib/client/time"
import { PayInChip } from "./GiftRow"

export function GiftDetailsSheet({ pot, giftRef, open, onClose }: { pot: PotVM; giftRef: string | null; open: boolean; onClose: () => void }) {
  const gift = giftRef ? pot.gifts?.items.find((g) => g.ref === giftRef) : undefined
  const title = !gift ? t("chip.outside") : gift.tone === "gift" ? t("gift.details.title", { name: gift.from.name }) : t("payin.details.title", { name: gift.from.name })
  const when = gift ? [formatDate(gift.at), formatTime(gift.at)].join(", ") : ""
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button className="w-full" onClick={onClose}>
          {t("gift.sheet.done")}
        </Button>
      }
    >
      {!gift ? (
        <p className="pt-1 text-body text-ink-muted" data-gift-details="missing">
          {t("gift.details.missing")}
        </p>
      ) : (
        <div className="flex flex-col gap-4 pt-1" data-gift-details={gift.ref}>
          <div className="flex items-center gap-3">
            <Avatar person={gift.from} size="md" />
            <MoneyText micro={gift.amount} sign="in" variant="title" className="text-approved" />
            <PayInChip gift={gift} size="md" className="ml-auto" />
          </div>
          <dl className="flex flex-col divide-y divide-line rounded-md border border-line">
            <div className="flex min-h-12 items-center justify-between gap-3 px-3">
              <dt className="text-body-sm text-ink-muted">{t("gift.details.from")}</dt>
              <dd className="text-body text-ink">{gift.from.name}</dd>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-3 px-3">
              <dt className="text-body-sm text-ink-muted">{t("gift.details.when")}</dt>
              <dd className="text-body text-ink tabular-nums">{when}</dd>
            </div>
            <div className="flex min-h-12 items-center justify-between gap-3 px-3">
              <dt className="text-body-sm text-ink-muted">{t("gift.details.via")}</dt>
              <dd className="text-body text-ink">{gift.linkId ? t("gift.details.via.link") : t("gift.details.via.page")}</dd>
            </div>
          </dl>
          {gift.note && (
            <section aria-labelledby="gift-note-h" className="flex flex-col gap-1 rounded-md bg-surface-sunken p-3" data-gift-note>
              <h3 id="gift-note-h" className="flex items-center gap-2 text-label text-ink">
                <Quote aria-hidden className="size-4" strokeWidth={2} />
                {t("gift.details.note")}
              </h3>
              <p className="text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{gift.note}</p>
              {gift.showPublic && <p className="text-body-sm text-ink-muted">{t("gift.details.public")}</p>}
            </section>
          )}
          <p className="flex items-start gap-3 text-body-sm text-ink-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
            {t("gift.details.shared")}
          </p>
          <ReceiptLink
            txHash={gift.txHash}
            what={gift.tone === "gift" ? t("gift.receipt", { amount: formatUsd(gift.amount, "whole"), potName: pot.name }) : t("give.receipt.payment", { amount: formatUsd(gift.amount, "whole"), potName: pot.name })}
            className="self-start"
          />
        </div>
      )}
    </Sheet>
  )
}
