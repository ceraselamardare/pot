"use client"
// Settings → Money from outside → Pay-in links (?sheet=payinlinks): what came in from outside ("$40 paid in, 3 times",
// or "No pay-ins yet. Share a link to get the first one."), the Pot's working pay-in links (each: what it is, until
// when, one payment only, how many so far) with [Show] (its QR, [Share link] as the one marigold, [Copy link]) and
// [Turn off] (any member, right away), and [Make a pay-in link] → Ask anyone (?sheet=payin, swapped in).
import { Check, ChevronLeft, Copy, Link2, Share2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { QrPlate } from "@/components/share/QrPlate"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { revokeGiftLink } from "@/lib/client/gifts/actions"
import { useGiftLinks, type GiftLinkVM } from "@/lib/client/gifts/data"
import { giftLinkUrl, useOrigin, useShareLink } from "@/lib/client/gifts/share"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { swapSheet } from "@/lib/client/sheet"
import { formatDate } from "@/lib/client/time"
import { payInMessage, payInWhat } from "./PayInSheet"

export function PayInLinksSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const id = useId()
  const origin = useOrigin()
  const links = useGiftLinks(pot.slug)
  const [shown, setShown] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setShown(null)
  }
  const shownLink = shown ? links?.find((l) => l.id === shown) : undefined
  const url = shownLink && origin ? giftLinkUrl(origin, pot.slug, shownLink.id) : ""
  const { copy, share, copied } = useShareLink(url, payInMessage(shownLink?.tone ?? "payment", pot.name, url))
  const g = pot.gifts
  const canMake = pot.status === "open" && g?.on !== false

  const revoke = async (l: GiftLinkVM) => {
    try {
      await revokeGiftLink(pot.slug, l.id)
      if (shown === l.id) setShown(null)
      toast(t("payin.revoked"))
    } catch {
      toast.error(t("payin.revoke.error"))
    }
  }

  const footer = shownLink ? (
    <div className="flex flex-col gap-2">
      <Button variant="primary" className="w-full" onClick={share} disabled={!url} data-payins-share>
        <Share2 aria-hidden strokeWidth={2.25} />
        {t("payin.share")}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={copy} aria-live="polite" disabled={!url}>
          {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
          {copied ? t("payin.copied") : t("payin.copy")}
        </Button>
        <Button variant="ghost" onClick={() => setShown(null)}>
          <ChevronLeft aria-hidden strokeWidth={2} />
          {t("payins.active")}
        </Button>
      </div>
    </div>
  ) : canMake ? (
    <Button className="w-full" onClick={() => swapSheet("payin")} data-payins-make>
      <Link2 aria-hidden strokeWidth={2} />
      {t("payins.make")}
    </Button>
  ) : (
    <Button className="w-full" onClick={onClose}>
      {t("payins.done")}
    </Button>
  )

  return (
    <Sheet open={open} onClose={onClose} title={t("payins.title")} description={pot.name} footer={footer}>
      {shownLink ? (
        <div className="flex flex-col items-center gap-3 pt-1 text-center" data-payins-shown={shownLink.id}>
          <p className="text-label text-ink">{payInWhat(shownLink)}</p>
          {url ? <QrPlate link={url} alt={t("payin.qr.alt", { potName: pot.name })} hint={t("payin.qr.hint", { potName: pot.name })} dataAttr="data-payin-url" /> : null}
          <p className="text-body-sm text-ink-muted">{t("payin.row.until", { date: formatDate(shownLink.expiresAt) })}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 pt-1" data-payins>
          <p className="rounded-md bg-surface-sunken p-3 text-body text-ink tabular-nums" data-payins-totals>
            {g && g.count > 0 ? t("payins.totals", { amount: formatUsd(g.total, "whole"), n: g.count }) : t("payins.none")}
          </p>
          <section aria-labelledby={`${id}-active`} className="flex flex-col gap-2">
            <h3 id={`${id}-active`} className="text-label text-ink">
              {t("payins.active")}
            </h3>
            {links && links.length > 0 ? (
              <ul className="flex flex-col gap-2" data-payin-links>
                {links.map((l) => {
                  const what = payInWhat(l)
                  return (
                    <li key={l.id} className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2" data-payin-link-row={l.id}>
                      <Link2 aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body text-ink">{what}</span>
                        <span className="text-body-sm text-ink-muted">
                          {[t("payin.row.until", { date: formatDate(l.expiresAt) }), !l.reusable && t("payin.row.once"), l.uses > 0 && t("payin.row.uses", { n: l.uses })].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setShown(l.id)} aria-label={t("payin.row.show.a11y", { what })}>
                        {t("payin.row.show")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void revoke(l)} aria-label={t("payin.revoke.a11y", { what })} data-payin-link-revoke>
                        {t("payin.revoke")}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : links === undefined ? null : (
              <p className="text-body-sm text-ink-muted">{t("payins.active.none")}</p>
            )}
          </section>
          <p className="text-body-sm text-ink-muted" data-payins-privacy>
            {t("privacy.gifts")}
          </p>
        </div>
      )}
    </Sheet>
  )
}
