"use client"
// The Spend sheet's "Someone else" choice ("Send by link", hub 1.1.0): how it works in one line, and an optional "Who's
// it for?" label that only the Pot's members see (kept off-chain with the request, like a note). When the Pot's rules
// don't allow it yet, one calm line says so and [Change the rules] swaps to the rules sheet with the "Send by link"
// switch in view (?sheet=rules&rule=links).
import { Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { LABEL_MAX } from "@/lib/client/paylink/link"
import { swapSheet } from "@/lib/client/sheet"
import { LinkShareBody, type LinkShareState } from "./LinkShare"

/** Links are on for this Pot (hub 1.1.0 extras.links; a Pot made before 1.1.0 has them off until its rules change). */
export const payLinksOn = (pot: Pick<PotVM, "extras">): boolean => pot.extras?.links === true

export function PayLinkFields({ pot, label, onLabel }: { pot: PotVM; label: string; onLabel: (v: string) => void }) {
  if (!payLinksOn(pot))
    return (
      <div className="flex flex-col items-start gap-3 rounded-md bg-surface-sunken p-3" data-paylink-off>
        <p className="flex items-start gap-2 text-body-sm text-ink">
          <Link2 aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {t("paylink.off")}
        </p>
        {pot.status === "open" && (
          <Button size="sm" className="min-h-11" onClick={() => swapSheet("rules", { rule: "links" })} data-paylink-rules>
            {t("paylink.off.cta")}
          </Button>
        )}
      </div>
    )
  return (
    <div className="flex flex-col gap-3" data-paylink-fields>
      <p className="flex items-start gap-2 text-body-sm text-ink-muted">
        <Link2 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={2} />
        {t("paylink.how")}
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="paylink-label" className="text-body-sm text-ink-muted">
          {t("paylink.label.label")}
        </label>
        <input
          id="paylink-label"
          value={label}
          maxLength={LABEL_MAX}
          enterKeyHint="done"
          autoComplete="off"
          onChange={(e) => onLabel(e.target.value)}
          placeholder={t("paylink.label.placeholder")}
          aria-describedby="paylink-label-hint"
          className="h-13 rounded-sm border border-line-strong bg-surface-sunken px-3 text-body text-ink placeholder:text-ink-muted"
          data-paylink-label
        />
        <span id="paylink-label-hint" className="text-body-sm text-ink-muted">
          {t("paylink.label.hint", { potName: pot.name })}
        </span>
      </div>
    </div>
  )
}

/** The Spend sheet's result once the link holds the money: "Your link to send $30 is ready" + the Share card. */
export function LinkReady({ s, statusRef }: { s: LinkShareState; statusRef?: React.Ref<HTMLParagraphElement> }) {
  const who = s.label ?? t("paylink.ready.who")
  return (
    <div className="flex flex-col gap-3" data-paylink-ready>
      <p ref={statusRef} tabIndex={-1} className="font-display text-heading text-ink outline-none">
        {t("paylink.ready.title", { amount: formatUsd(s.amount, "whole") })}
      </p>
      <p className="-mt-2 text-body-sm text-ink-muted">{t("paylink.ready.body", { who, amount: formatUsd(s.amount, "whole") })}</p>
      <LinkShareBody s={s} />
    </div>
  )
}
