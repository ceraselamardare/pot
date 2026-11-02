"use client"
// Share the Pot record, QR first (mobile first): the record's link as a QR (QrPlate), then [Share link] (Web Share,
// copy fallback) and [Copy link] → "Link copied" in place. The link never carries a #fragment: the record is public.
import { Check, Copy, Share2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { QrPlate } from "@/components/share/QrPlate"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"

export function RecordShareSheet({ open, onClose, potName }: { open: boolean; onClose: () => void; potName: string }) {
  const [copied, setCopied] = useState(false)
  const link = typeof window === "undefined" ? "" : window.location.href.split("#")[0]!
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      toast(link)
    }
  }
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: t("record.share.message", { potName, link }) })
        return
      } catch (e) {
        if ((e as Error).name === "AbortError") return
      }
    }
    await copy()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("record.share.title", { potName })}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" onClick={share} disabled={!link}>
            <Share2 aria-hidden strokeWidth={2.25} />
            {t("record.share.cta")}
          </Button>
          <Button className="w-full" onClick={copy} aria-live="polite" data-record-copy disabled={!link}>
            {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
            {copied ? t("record.copied") : t("record.copy")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        {link && <QrPlate link={link} alt={t("record.share.qr.alt", { potName })} hint={t("record.share.qr.hint")} dataAttr="data-record-url" />}
        <p className="text-body-sm text-ink-muted">{t("record.share.body")}</p>
      </div>
    </Sheet>
  )
}
