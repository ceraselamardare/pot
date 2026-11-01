"use client"
// The Spend sheet's "Someone else" choice (pay by link, hub 1.1.0): how it works in one line, and an optional "Who's it
// for?" label that only the Pot's members see (kept off-chain with the request, like a note). When the Pot's rules
// don't allow links yet, one calm line says so (the Rules tab turns them on).
import { Link2 } from "lucide-react"
import { t } from "@/i18n/t"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { LABEL_MAX } from "@/lib/client/paylink/link"
import { LinkShareBody, type LinkShareState } from "./LinkShare"

/** Links are on for this Pot (hub 1.1.0 extras.links; a Pot made before 1.1.0 has them off until its rules change). */
export const payLinksOn = (pot: Pick<PotVM, "extras">): boolean => pot.extras?.links === true

export function PayLinkFields({ pot, label, onLabel }: { pot: PotVM; label: string; onLabel: (v: string) => void }) {
  if (!payLinksOn(pot))
    return (
      <p className="flex items-start gap-2 rounded-md bg-surface-sunken p-3 text-body-sm text-ink" data-paylink-off>
        <Link2 aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        {t("paylink.off")}
      </p>
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

/** The Spend sheet's result once the link holds the money: "Your payment link is ready" + the Share card. */
export function LinkReady({ s, statusRef }: { s: LinkShareState; statusRef?: React.Ref<HTMLParagraphElement> }) {
  const who = s.label ?? t("paylink.ready.who")
  return (
    <div className="flex flex-col gap-3" data-paylink-ready>
      <p ref={statusRef} tabIndex={-1} className="font-display text-heading text-ink outline-none">
        {t("paylink.ready.title")}
      </p>
      {!s.qr && <p className="-mt-2 text-body-sm text-ink-muted">{t("paylink.ready.body", { who, amount: formatUsd(s.amount, "whole") })}</p>}
      <LinkShareBody s={s} />
    </div>
  )
}
