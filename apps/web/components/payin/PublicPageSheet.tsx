"use client"
// Settings → Money from outside → Public page (?sheet=publicpage): the Pot's public page (/give/<slug>; our server's
// gift_page), off until a member turns it on. Any member, right away. With it on: "What's it for?" (the page's tone:
// A payment · A gift ☕), the members' optional one-liner (≤ 100, [Save line]), and the page's QR + [Share page] (the
// sheet's one marigold) + [Copy link]. Switches are ink, never marigold.
import { Check, Copy, Share2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"
import { Segmented } from "@/components/pot/Controls"
import { SwitchRow } from "@/components/gifts/Switch"
import { QrPlate } from "@/components/share/QrPlate"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { setGiftPage } from "@/lib/client/gifts/actions"
import { giftPageUrl, useOrigin, useShareLink } from "@/lib/client/gifts/share"
import type { PotVM } from "@/lib/client/mock/types"
import { GIFT_LINE_MAX, giftTextLength, type PayInTone } from "@/lib/gifts"
import { payInMessage } from "./PayInSheet"

export function PublicPageSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const id = useId()
  const origin = useOrigin()
  const page = pot.gifts?.page
  const tone: PayInTone = page?.tone ?? "payment"
  const [busy, setBusy] = useState<"on" | "tone" | "line" | null>(null)
  const saved = page?.line ?? ""
  const [line, setLine] = useState(saved)
  const [lineSaved, setLineSaved] = useState(false)
  const url = origin ? giftPageUrl(origin, pot.slug) : ""
  const { copy, share, copied } = useShareLink(url, payInMessage(tone, pot.name, url))
  // each opening starts from the saved line (adjusted while rendering, not in an effect)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setLine(saved)
      setLineSaved(false)
    }
  }

  const run = async (what: "on" | "tone" | "line", fn: () => Promise<void>, said?: string) => {
    setBusy(what)
    try {
      await fn()
      if (said) announce(said)
    } catch {
      toast.error(t("payin.error.toggle"))
    } finally {
      setBusy(null)
    }
  }
  const closed = pot.status !== "open"
  const on = !!page?.on
  const lineLen = giftTextLength(line)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("publicpage.title")}
      description={pot.name}
      keyboard
      footer={
        on && !closed ? (
          <div className="flex flex-col gap-2">
            <Button variant="primary" className="w-full" onClick={share} disabled={!url} data-page-share>
              <Share2 aria-hidden strokeWidth={2.25} />
              {t("publicpage.share")}
            </Button>
            <Button className="w-full" onClick={copy} aria-live="polite" disabled={!url} data-page-copy>
              {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
              {copied ? t("payin.copied") : t("payin.copy")}
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={onClose}>
            {t("payins.done")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 pt-1" data-public-page>
        <SwitchRow
          checked={on}
          onChange={(next) => void run("on", () => setGiftPage(pot.slug, { on: next }))}
          label={t("publicpage.switch")}
          hint={t("publicpage.switch.hint")}
          busy={busy === "on"}
          disabled={closed}
          data-page-switch
        />
        {on && pot.gifts?.on === false && <p className="rounded-md bg-surface-sunken p-3 text-body-sm text-ink">{t("publicpage.taking_off")}</p>}
        {on && (
          <>
            <div className="flex flex-col gap-2">
              <p aria-hidden className="text-label text-ink">
                {t("payin.tone.label")}
              </p>
              <Segmented<PayInTone>
                label={t("payin.tone.label")}
                value={tone}
                onChange={(v) => void run("tone", () => setGiftPage(pot.slug, { on: true, tone: v }))}
                options={[
                  { value: "payment", label: t("payin.tone.payment") },
                  { value: "gift", label: t("payin.tone.gift") },
                ]}
              />
            </div>
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
                  data-page-line
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
                  data-page-line-save
                >
                  {lineSaved ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : null}
                  {lineSaved ? t("gift.sheet.line.saved") : t("gift.sheet.line.save")}
                </Button>
              </div>
            </div>
            {url ? <QrPlate link={url} alt={t("publicpage.qr.alt", { potName: pot.name })} hint={t("publicpage.qr.hint")} size={168} dataAttr="data-page-url" /> : null}
          </>
        )}
      </div>
    </Sheet>
  )
}
