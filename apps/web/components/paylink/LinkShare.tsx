"use client"
// The "Share payment link" card (pay by link, hub 1.1.0): the link `/c/<slug>/<id>#<secret>` into the chat in two taps,
// with honest expectations: anyone who has it can take the money, it works until its date, then the money goes back
// to the Pot; the link is saved only on this device. Same patterns as the invite ShareSheet: [Share payment link]
// (Web Share, copy fallback), [Copy link] → "Link copied" in place (that swap is the announcement), and a QR (lazy)
// that replaces the card's body, dark on a white plate in Night too (scanners fail on inverted codes).
// Two parts so a sheet can put the actions in its footer: useLinkShare() + <LinkShareBody> + <LinkShareActions>.
import { Check, Clock, Copy, KeyRound, QrCode, Share2 } from "lucide-react"
import dynamic from "next/dynamic"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { MoneyText } from "@/components/money/MoneyText"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { formatUsd, type Micro } from "@/lib/client/money"
import { claimUrl } from "@/lib/client/paylink/link"
import { formatDate } from "@/lib/client/time"

const QR = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), { ssr: false })

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
  const [qr, setQr] = useState(false)
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
  return { ...x, link, copied, qr, setQr, copy, share }
}

export type LinkShareState = ReturnType<typeof useLinkShare>

/** [Share payment link] (the screen's marigold, unless `secondary`) + [Copy link] [Show QR code]. */
export function LinkShareActions({ s, secondary }: { s: LinkShareState; secondary?: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-paylink-actions>
      <Button variant={secondary ? "secondary" : "primary"} className="w-full" onClick={s.share} disabled={!s.link}>
        <Share2 aria-hidden strokeWidth={2.25} />
        {t("paylink.share.cta")}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={s.copy} aria-live="polite" data-copy-paylink disabled={!s.link}>
          {s.copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
          {s.copied ? t("paylink.share.copied") : t("paylink.share.copy")}
        </Button>
        <Button onClick={() => s.setQr((v) => !v)} aria-pressed={s.qr} disabled={!s.link}>
          <QrCode aria-hidden strokeWidth={2} />
          {s.qr ? t("paylink.share.qr_hide") : t("paylink.share.qr")}
        </Button>
      </div>
    </div>
  )
}

/** The card: amount, who it's for, the link itself, its date, and the "keep it safe / this device" notes. The QR replaces it. */
export function LinkShareBody({ s, heading }: { s: LinkShareState; heading?: string }) {
  const amountWhole = formatUsd(s.amount, "whole")
  const date = formatDate(s.expiresAt)
  if (s.qr && s.link)
    return (
      <div className="flex flex-col items-center gap-3 pt-1" data-qr-view>
        <div role="img" aria-label={t("paylink.share.qr.alt", { amount: amountWhole })} className="rounded-lg bg-white p-4 shadow-card">
          <QR value={s.link} size={232} level="M" bgColor="#ffffff" fgColor="#2b1b3a" aria-hidden />
        </div>
        <p className="text-body text-ink">{t("paylink.share.qr.hint")}</p>
        <p className="flex items-start gap-2 text-body-sm text-ink-muted">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {t("paylink.share.expiry", { date, potName: s.potName })}
        </p>
      </div>
    )
  return (
    <div className="flex flex-col gap-4" data-paylink-share>
      {heading && <p className="font-display text-heading text-ink">{heading}</p>}
      <div className="flex items-center justify-between gap-3 rounded-md bg-surface-sunken p-3">
        <div className="min-w-0">
          <MoneyText micro={s.amount} variant="title" className="text-ink" />
          {s.label && <p className="truncate text-body-sm text-ink-muted">{t("paylink.share.for", { who: s.label })}</p>}
        </div>
      </div>
      {s.link && (
        <div>
          <p className="mb-1 text-body-sm text-ink-muted" id={`paylink-${s.requestId}-label`}>
            {t("paylink.share.link.label")}
          </p>
          <p
            aria-labelledby={`paylink-${s.requestId}-label`}
            data-paylink-url={s.link}
            className="rounded-sm border border-line-strong bg-surface-sunken p-3 font-sans text-body-sm break-all text-ink select-all"
          >
            {s.link}
          </p>
        </div>
      )}
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
