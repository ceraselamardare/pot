"use client"
// The "Share payment link" card (pay by link, hub 1.1.0): the link `/c/<slug>/<id>#<secret>` into the chat in two taps,
// with honest expectations: anyone who has it can take the money, it works until its date, then the money goes back
// to the Pot; the link is saved only on this device. Same patterns as the invite ShareSheet: [Share payment link]
// (Web Share, copy fallback) and [Copy link] → "Link copied" in place (that swap is the announcement). QR first (mobile
// first): the card's body is always the QR (QrPlate); the raw link is never shown.
// Two parts so a sheet can put the actions in its footer: useLinkShare() + <LinkShareBody> + <LinkShareActions>.
import { Check, Clock, Copy, KeyRound, Share2 } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { MoneyText } from "@/components/money/MoneyText"
import { QrPlate } from "@/components/share/QrPlate"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { formatUsd, type Micro } from "@/lib/client/money"
import { claimUrl } from "@/lib/client/paylink/link"
import { formatDate } from "@/lib/client/time"

const subscribeNoop = () => () => {}
function useOrigin() {
  return useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "")
}

export interface LinkShareInput {
  slug: string
  requestId: number
  secret: string
  amount: Micro
  potName: string
  /** the requester's name, for the message */
  from: string
  label: string | null
  expiresAt: number
}

export function useLinkShare(x: LinkShareInput) {
  const origin = useOrigin()
  const [copied, setCopied] = useState(false)
  const link = origin ? claimUrl(origin, x.slug, x.requestId, x.secret) : ""
  const message = t("paylink.share.message", { name: x.from, amount: formatUsd(x.amount, "whole"), potName: x.potName, link })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(t("paylink.share.copy_failed"))
    }
  }
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message })
        return
      } catch (e) {
        if ((e as Error).name === "AbortError") return
      }
    }
    await copy()
  }
  return { ...x, link, copied, copy, share }
}

export type LinkShareState = ReturnType<typeof useLinkShare>

/** [Share payment link] (the screen's marigold, unless `secondary`) + [Copy link]. */
export function LinkShareActions({ s, secondary }: { s: LinkShareState; secondary?: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-paylink-actions>
      <Button variant={secondary ? "secondary" : "primary"} className="w-full" onClick={s.share} disabled={!s.link}>
        <Share2 aria-hidden strokeWidth={2.25} />
        {t("paylink.share.cta")}
      </Button>
      <Button className="w-full" onClick={s.copy} aria-live="polite" data-copy-paylink disabled={!s.link}>
        {s.copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
        {s.copied ? t("paylink.share.copied") : t("paylink.share.copy")}
      </Button>
    </div>
  )
}

/** The card: the QR (always), the amount and who it's for, and the "keep it safe / this device" notes. */
export function LinkShareBody({ s, heading }: { s: LinkShareState; heading?: string }) {
  const amountWhole = formatUsd(s.amount, "whole")
  const date = formatDate(s.expiresAt)
  return (
    <div className="flex flex-col gap-4" data-paylink-share>
      {heading && <p className="font-display text-heading text-ink">{heading}</p>}
      {s.link && <QrPlate link={s.link} alt={t("paylink.share.qr.alt", { amount: amountWhole })} hint={t("paylink.share.qr.hint")} size={200} dataAttr="data-paylink-url" />}
      <div className="flex items-center justify-between gap-3 rounded-md bg-surface-sunken p-3">
        <div className="min-w-0">
          <MoneyText micro={s.amount} variant="title" className="text-ink" />
          {s.label && <p className="truncate text-body-sm text-ink-muted">{t("paylink.share.for", { who: s.label })}</p>}
        </div>
      </div>
      <p className="flex items-start gap-2 text-body-sm text-ink">
        <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        {t("paylink.share.keep")}
      </p>
      <p className="flex items-start gap-2 text-body-sm text-ink-muted">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        {t("paylink.share.device", { potName: s.potName, date })}
      </p>
    </div>
  )
}
