"use client"
// ••• → Gifts (?sheet=gifts; notes/gifts-plan.md): what came in ("$40 from 3 gifts"), "Taking gifts" (the hub's
// set_gifts, any member; on for every Pot until someone turns it off), "Public gift page" (off until a member turns it
// on) with the members' optional one-liner and the page's QR + Share + Copy, a way to make a gift link, and the privacy
// rule in one line. Switches are ink, never marigold; the page's [Share gift page] is the sheet's one marigold.
import { Check, Copy, Gift, Share2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { QrPlate } from "@/components/share/QrPlate"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { setGiftPage, setGiftsOn } from "@/lib/client/gifts/actions"
import { giftPageUrl, useOrigin, useShareLink } from "@/lib/client/gifts/share"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { openSheet } from "@/lib/client/sheet"
import { GIFT_LINE_MAX, giftTextLength } from "@/lib/gifts"
import { SwitchRow } from "./Switch"

export function GiftsSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const id = useId()
  const origin = useOrigin()
  const g = pot.gifts
  const [busy, setBusy] = useState<"on" | "page" | "line" | null>(null)
  const [line, setLine] = useState(g?.page.line ?? "")
  const [lineSaved, setLineSaved] = useState(false)
  const url = origin ? giftPageUrl(origin, pot.slug) : ""
  const { copy, share, copied } = useShareLink(url, t("gift.page.message", { potName: pot.name, link: url }))
  const saved = g?.page.line ?? ""
  // each opening starts from the saved line (adjusted while rendering, not in an effect)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setLine(saved)
      setLineSaved(false)
    }
  }

  const run = async (what: "on" | "page" | "line", fn: () => Promise<void>, said?: string) => {
    setBusy(what)
    try {
      await fn()
      if (said) announce(said)
    } catch {
      toast.error(t("gift.sheet.error"))
    } finally {
      setBusy(null)
    }
  }
  const lineLen = giftTextLength(line)
  const closed = pot.status !== "open"

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("gift.sheet.title")}
      keyboard
      footer={
        g?.page.on && !closed ? (
          <div className="flex flex-col gap-2">
            <Button variant="primary" className="w-full" onClick={share} disabled={!url} data-gift-page-share>
              <Share2 aria-hidden strokeWidth={2.25} />
              {t("gift.page.share")}
            </Button>
            <Button className="w-full" onClick={copy} aria-live="polite" disabled={!url} data-gift-page-copy>
              {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
              {copied ? t("gift.link.copied") : t("gift.link.copy")}
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={onClose}>
            {t("gift.sheet.done")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5 pt-1" data-gifts-sheet>
        <p className="flex items-center gap-3 rounded-md bg-surface-sunken p-3" data-gifts-totals>
          <Gift aria-hidden className="size-5 shrink-0 text-ink" strokeWidth={2} />
          {g && g.count > 0 ? (
            <span className="text-body text-ink tabular-nums">{t("gift.sheet.totals", { amount: formatUsd(g.total, "whole"), n: g.count })}</span>
          ) : (
            <span className="text-body text-ink-muted">{t("gift.sheet.none")}</span>
          )}
        </p>

        <SwitchRow
          checked={g?.on ?? true}
          onChange={(on) => void run("on", () => setGiftsOn(pot.slug, on), on ? t("gift.sheet.on") : t("gift.sheet.off.hint"))}
          label={t("gift.sheet.on")}
          hint={g?.on === false ? t("gift.sheet.off.hint") : t("gift.sheet.on.hint")}
          busy={busy === "on"}
          disabled={closed}
          data-gifts-on
        />

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <SwitchRow
            checked={!!g?.page.on}
            onChange={(on) => void run("page", () => setGiftPage(pot.slug, { on }))}
            label={t("gift.sheet.page")}
            hint={t("gift.sheet.page.hint")}
            busy={busy === "page"}
            disabled={closed}
            data-gifts-page
          />
          {g?.page.on && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${id}-line`} className="text-label text-ink">
                  {t("gift.sheet.line")}
                </label>
                <div className="flex gap-2">
                  <input
                    id={`${id}-line`}
                    value={line}
                    maxLength={GIFT_LINE_MAX + 20}
                    onChange={(e) => {
                      setLine(e.target.value)
                      setLineSaved(false)
                    }}
                    aria-invalid={lineLen > GIFT_LINE_MAX || undefined}
                    className="h-12 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-body text-ink outline-none focus:border-ink"
                    data-gifts-line
                  />
                  <Button
                    onClick={() =>
                      void run(
                        "line",
                        async () => {
                          await setGiftPage(pot.slug, { on: true, line: line.trim() || null })
                          setLineSaved(true)
                        },
                        t("gift.sheet.line.saved"),
                      )
                    }
                    disabled={busy === "line" || line.trim() === saved.trim() || lineLen > GIFT_LINE_MAX}
                    data-gifts-line-save
                  >
                    {lineSaved ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : null}
                    {lineSaved ? t("gift.sheet.line.saved") : t("gift.sheet.line.save")}
                  </Button>
                </div>
              </div>
              {url ? <QrPlate link={url} alt={t("gift.page.qr.alt", { potName: pot.name })} hint={t("gift.page.qr.hint")} size={168} dataAttr="data-gift-page-url" /> : null}
            </>
          )}
        </div>

        {g?.on !== false && !closed && (
          <Button variant="ghost" className="self-start" onClick={() => openSheet("share", { kind: "gift" })} data-gifts-make-link>
            <Gift aria-hidden strokeWidth={2} />
            {t("gift.sheet.links")}
          </Button>
        )}

        <p className="text-body-sm text-ink-muted" data-gifts-privacy>
          {t("privacy.gifts")}
        </p>
      </div>
    </Sheet>
  )
}
