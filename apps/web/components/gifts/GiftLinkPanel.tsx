"use client"
// The share sheet's "Gift link" tab (notes/gifts-plan.md): defaults first. One tap on [Make gift link] makes a
// reusable "giver chooses" link for 14 days; "Fixed amount" and "More options" (a note for givers, one gift only)
// are there for whoever wants them. Then QR first (QrPlate) with [Share gift link] (the one marigold) and [Copy link].
// Below: the Pot's active gift links, each with [Show] (its QR again) and [Turn off].
// Returns the body and the footer separately: the sheet's sticky footer holds the actions (like the invite tab).
import { Check, ChevronDown, Copy, Gift, Share2 } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Segmented } from "@/components/pot/Controls"
import { QrPlate } from "@/components/share/QrPlate"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { createGiftLink, revokeGiftLink } from "@/lib/client/gifts/actions"
import { parseDollars } from "@/lib/client/gifts/amount"
import { useGiftLinks, type GiftLinkVM } from "@/lib/client/gifts/data"
import { giftLinkUrl, useOrigin, useShareLink } from "@/lib/client/gifts/share"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { formatDate, useNow } from "@/lib/client/time"
import { checkGiftAmount, GIFT_LINK_TTL_MS, GIFT_NOTE_MAX, giftTextLength } from "@/lib/gifts"
import { SwitchRow } from "./Switch"

type AmountKind = "open" | "fixed"

const linkWhat = (l: GiftLinkVM) => (l.amount === null ? t("gift.link.row.open") : t("gift.link.row.fixed", { amount: formatUsd(l.amount, "whole") }))

export function useGiftLinkTab(pot: PotVM, open: boolean): { body: ReactNode; footer: ReactNode } {
  const id = useId()
  const origin = useOrigin()
  const links = useGiftLinks(pot.slug)
  const [kind, setKind] = useState<AmountKind>("open")
  const [amount, setAmount] = useState("25")
  const [more, setMore] = useState(false)
  const [note, setNote] = useState("")
  const [once, setOnce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  // the link whose QR is shown (just made, or [Show] on a row); null = the form
  const [shown, setShown] = useState<string | null>(null)

  const now = useNow()
  // a fresh form each time the sheet opens (adjusted while rendering, not in an effect)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setShown(null)
      setKind("open")
      setAmount("25")
      setMore(false)
      setNote("")
      setOnce(false)
      setError(false)
    }
  }

  const fixed = kind === "fixed" ? parseDollars(amount) : null
  const fixedCheck = fixed === null ? null : checkGiftAmount(fixed)
  const fixedBad = kind === "fixed" && (fixed === null || !fixedCheck?.ok)
  const noteLen = giftTextLength(note)
  const taking = pot.gifts?.on !== false
  const shownLink = shown ? links?.find((l) => l.id === shown) : undefined
  const url = shown && origin ? giftLinkUrl(origin, pot.slug, shown) : ""
  const { copy, share, copied } = useShareLink(url, t("gift.link.message", { potName: pot.name, link: url }))

  const make = async () => {
    if (busy || fixedBad) return
    setBusy(true)
    setError(false)
    try {
      const newId = await createGiftLink(pot.slug, { amount: kind === "fixed" ? fixed : null, note: note.trim() || null, reusable: !once })
      setShown(newId)
      announce(t("gift.link.ready"))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  const revoke = async (l: GiftLinkVM) => {
    try {
      await revokeGiftLink(pot.slug, l.id)
      if (shown === l.id) setShown(null)
      toast(t("gift.link.revoked"))
    } catch {
      toast.error(t("gift.link.revoke.error"))
    }
  }

  const list =
    links && links.length > 0 ? (
      <section aria-labelledby={`${id}-active`} className="flex w-full flex-col gap-2 text-left" data-gift-links>
        <h3 id={`${id}-active`} className="text-label text-ink">
          {t("gift.link.active")}
        </h3>
        <ul className="flex flex-col gap-2">
          {links.map((l) => {
            const what = linkWhat(l)
            return (
              <li key={l.id} className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2" data-gift-link-row={l.id}>
                <Gift aria-hidden className="size-5 shrink-0 text-ink-muted" strokeWidth={2} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body text-ink">{what}</span>
                  <span className="text-body-sm text-ink-muted">
                    {[t("gift.link.row.until", { date: formatDate(l.expiresAt) }), !l.reusable && t("gift.link.row.once"), l.uses > 0 && t("gift.link.row.uses", { n: l.uses })].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {shown !== l.id && (
                  <Button size="sm" variant="ghost" onClick={() => setShown(l.id)} aria-label={t("gift.link.row.show.a11y", { what })}>
                    {t("gift.link.row.show")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void revoke(l)} aria-label={t("gift.link.revoke.a11y", { what })} data-gift-link-revoke>
                  {t("gift.link.revoke")}
                </Button>
              </li>
            )
          })}
        </ul>
      </section>
    ) : null

  if (!taking)
    return {
      body: (
        <div className="flex flex-col gap-4 pt-1" data-gift-tab="off">
          <p className="rounded-md bg-surface-sunken p-3 text-body-sm text-ink">{t("gift.link.off", { potName: pot.name })}</p>
          {list}
        </div>
      ),
      footer: null,
    }

  if (shown)
    return {
      body: (
        <div className="flex flex-col items-center gap-4 pt-1 text-center" data-gift-tab="ready">
          <p className="flex items-center gap-2 text-label text-ink" data-gift-link-ready>
            <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
            {shownLink ? linkWhat(shownLink) : t("gift.link.ready")}
          </p>
          {url ? <QrPlate link={url} alt={t("gift.link.qr.alt", { potName: pot.name })} hint={t("gift.link.qr.hint", { potName: pot.name })} dataAttr="data-gift-url" /> : null}
          {shownLink && (
            <p className="text-body-sm text-ink-muted">
              {[t("gift.link.row.until", { date: formatDate(shownLink.expiresAt) }), !shownLink.reusable && t("gift.link.row.once")].filter(Boolean).join(" · ")}
            </p>
          )}
          {list}
        </div>
      ),
      footer: (
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="w-full" onClick={share} disabled={!url} data-gift-share>
            <Share2 aria-hidden strokeWidth={2.25} />
            {t("gift.link.share")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={copy} aria-live="polite" disabled={!url} data-gift-copy>
              {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
              {copied ? t("gift.link.copied") : t("gift.link.copy")}
            </Button>
            <Button variant="ghost" onClick={() => setShown(null)}>
              {t("gift.link.another")}
            </Button>
          </div>
        </div>
      ),
    }

  const goal = pot.goalDetail?.spendsBlocked && pot.status === "open"
  return {
    body: (
      <div className="flex flex-col gap-4 pt-1" data-gift-tab="form">
        <p className="text-body text-ink">{t("gift.link.intro", { potName: pot.name })}</p>
        {goal && <p className="rounded-md bg-surface-sunken p-3 text-body-sm text-ink">{t("gift.link.goal", { potName: pot.name })}</p>}
        <div className="flex flex-col gap-2">
          <p id={`${id}-amount`} className="text-label text-ink">
            {t("gift.link.amount")}
          </p>
          <Segmented<AmountKind>
            label={t("gift.link.amount")}
            value={kind}
            onChange={setKind}
            options={[
              { value: "open", label: t("gift.link.amount.open") },
              { value: "fixed", label: t("gift.link.amount.fixed") },
            ]}
          />
          {kind === "fixed" && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-fixed`} className="text-body-sm text-ink-muted">
                {t("gift.link.amount.label")}
              </label>
              <div className="flex h-12 items-center gap-1 rounded-md border border-line-strong bg-surface px-3 focus-within:border-ink">
                <span aria-hidden className="text-amount text-ink-muted">
                  $
                </span>
                <input
                  id={`${id}-fixed`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 9))}
                  aria-invalid={fixedBad || undefined}
                  aria-describedby={fixedBad ? `${id}-fixed-err` : undefined}
                  className="min-w-0 flex-1 bg-transparent font-sans text-amount text-ink tabular-nums outline-none"
                  data-gift-fixed
                />
              </div>
              {fixedBad && (
                <p id={`${id}-fixed-err`} className="text-body-sm text-declined">
                  {fixedCheck && !fixedCheck.ok && fixedCheck.why === "too_high" ? t("gift.amount.max") : t("gift.amount.min")}
                </p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-expanded={more}
          aria-controls={`${id}-more`}
          onClick={() => setMore((x) => !x)}
          className="flex min-h-11 items-center gap-1 self-start rounded-sm text-label text-ink"
          data-gift-more
        >
          {t("gift.link.more")}
          <ChevronDown aria-hidden className={cn("size-5 transition-transform duration-200", more && "rotate-180")} strokeWidth={2} />
        </button>
        <div id={`${id}-more`} hidden={!more} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-note`} className="text-label text-ink">
              {t("gift.link.note")}
            </label>
            <input
              id={`${id}-note`}
              value={note}
              maxLength={GIFT_NOTE_MAX + 20}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`${id}-note-hint`}
              aria-invalid={noteLen > GIFT_NOTE_MAX || undefined}
              className="h-12 rounded-md border border-line-strong bg-surface px-3 text-body text-ink outline-none focus:border-ink"
              data-gift-link-note
            />
            <p id={`${id}-note-hint`} className="text-body-sm text-ink-muted">
              {noteLen > GIFT_NOTE_MAX - 30 ? t("gift.note.count", { n: GIFT_NOTE_MAX - noteLen }) : t("gift.link.note.hint")}
            </p>
          </div>
          <SwitchRow checked={once} onChange={setOnce} label={t("gift.link.once")} hint={t("gift.link.once.hint")} data-gift-once />
        </div>
        {now > 0 && <p className="text-body-sm text-ink-muted">{t("gift.link.expiry", { date: formatDate(now + GIFT_LINK_TTL_MS) })}</p>}
        {list}
      </div>
    ),
    footer: (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-body-sm text-ink">
            {t("gift.link.error")}
          </p>
        )}
        <Button variant="primary" className="w-full" onClick={make} disabled={busy || fixedBad || noteLen > GIFT_NOTE_MAX} aria-busy={busy || undefined} data-gift-make>
          <Gift aria-hidden strokeWidth={2.25} />
          {t("gift.link.create")}
        </Button>
      </div>
    ),
  }
}
