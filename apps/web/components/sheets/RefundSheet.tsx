"use client"
// What you'd get back, explained (?sheet=refund; risk-register R-33 M-6). Opened from the hero's "You'd get back" line: what you'd
// get back if the Pot closed now, as put in − your part of the spending = gets back, and the split in one plain
// sentence. The numbers are the Members tab's own (hub preview_close / get_members on testnet, the sdk twin in the
// mock), so the hero, this sheet, Members and the Close sheet always agree. Calm: no marigold here (the hero's
// Add money stays the screen's one), [Got it] is secondary.
import { MoneyText } from "@/components/money/MoneyText"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { formatUsd } from "@/lib/client/money"
import type { PotVM } from "@/lib/client/mock/types"
import { refundBreakdown } from "@/lib/client/refund"

export function RefundSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const b = refundBreakdown(pot)
  if (!b) return null
  const closed = pot.status === "closed"
  const lead = closed ? t("refund.lead.closed") : pot.status === "closing" ? t("refund.lead.closing") : t("refund.lead")
  const how = closed
    ? t("refund.how.closed")
    : b.putIn === 0n
      ? t("refund.how.none")
      : t("refund.how", { mine: formatUsd(b.putIn, "whole"), total: formatUsd(b.totalIn, "whole"), left: formatUsd(b.left, "whole") })
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("refund.title", { potName: pot.name })}
      footer={
        <Button className="w-full" onClick={onClose}>
          {t("members.how.done")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1" data-refund-sheet>
        <p className="flex flex-col gap-1">
          <span className="text-body-sm text-ink-muted">{lead}</span>
          <MoneyText micro={b.getsBack} variant="title" className="text-ink" />
        </p>
        <dl className="flex flex-col rounded-md bg-surface-sunken px-3 text-body">
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-ink-muted">{t("refund.put_in")}</dt>
            <dd>
              <MoneyText micro={b.putIn} className="text-ink" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
            <dt className="text-ink-muted">{t("refund.part_of_spending")}</dt>
            <dd>
              <MoneyText micro={b.partOfSpending} className="text-ink" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t-2 border-line-strong py-2.5" data-refund-total>
            <dt className="text-label text-ink">{closed ? t("refund.got_back") : t("refund.gets_back")}</dt>
            <dd>
              <MoneyText micro={b.getsBack} className="text-ink" />
            </dd>
          </div>
        </dl>
        <p className="text-body text-ink" data-refund-how>
          {how}
        </p>
        <p className="text-body-sm text-ink-muted">{t("members.how.body3")}</p>
      </div>
    </Sheet>
  )
}
