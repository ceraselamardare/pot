"use client"
// Ask anyone (?sheet=payin; "pay in", notes/frontend.md 2026-11-03): the only place a pay-in link is made. Opened from
// the row's Ask → "Ask anyone by link", Add money's "Someone else paying? Send them a link" and Settings → Money from
// outside → [Make a pay-in link]. Defaults first, so one tap on [Make pay-in link] makes a reusable "they choose" link
// for 14 days:
//   - What's it for? A payment (default) · A gift ☕ (the tone: the words and presets on the page they open);
//   - Amount: They choose · Fixed (prefilled $25 for a payment, $10 for a gift, until typed over);
//   - More options: a note for them (≤ 140), one payment only.
// Then "Your pay-in link is ready": QR first (QrPlate), [Share link] (the sheet's one marigold), [Copy link],
// [Make another link]. The Pot's links and their switches live in Settings → Pay-in links (?sheet=payinlinks).
// Taking money from outside off → one calm line + [Turn it back on] (any member, right away: set_gifts).
// The record underneath is a gift link (gift_link, /g/<slug>/<id>): only the words changed.
import { Check, ChevronDown, Copy, Link2, Share2 } from "lucide-react"
import { useId, useState } from "react"
import { Segmented } from "@/components/pot/Controls"
import { SwitchRow } from "@/components/gifts/Switch"
import { QrPlate } from "@/components/share/QrPlate"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { announce } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { createGiftLink, setGiftsOn } from "@/lib/client/gifts/actions"
import { isReservedNameError } from "@/lib/reserved-names"
import { dollarsInput, parseDollars } from "@/lib/client/gifts/amount"
import { giftLinkUrl, useOrigin, useShareLink } from "@/lib/client/gifts/share"
import type { PotVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { formatDate, useNow } from "@/lib/client/time"
import { checkGiftAmount, GIFT_LINK_TTL_MS, GIFT_NOTE_MAX, giftTextLength, type PayInTone } from "@/lib/gifts"

type AmountKind = "open" | "fixed"

/** A fixed amount's prefill: $25 for a payment, $10 for a gift. */
const FIXED_DEFAULT: Record<PayInTone, string> = { payment: dollarsInput(25_000_000n), gift: dollarsInput(10_000_000n) }

/** "Pay into Lisbon Trip: <link>" / "Chip in to Lisbon Trip ☕: <link>" (the share text). */
export const payInMessage = (tone: PayInTone, potName: string, link: string) =>
  tone === "gift" ? t("payin.message.gift", { potName, link }) : t("payin.message.payment", { potName, link })

/** "Payment · They choose" / "Gift ☕ · $10": how a link is named in lists and on its ready card. */
export const payInWhat = (l: { tone: PayInTone; amount: bigint | null }) =>
  `${t(l.tone === "gift" ? "payin.kind.gift" : "payin.kind.payment")} · ${l.amount === null ? t("payin.what.open") : t("payin.what.fixed", { amount: formatUsd(l.amount, "whole") })}`

export function PayInSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const id = useId()
  const origin = useOrigin()
  const now = useNow()
  const [tone, setTone] = useState<PayInTone>("payment")
  const [kind, setKind] = useState<AmountKind>("open")
  const [amount, setAmount] = useState(FIXED_DEFAULT.payment)
  const [typed, setTyped] = useState(false)
  const [more, setMore] = useState(false)
  const [note, setNote] = useState("")
  const [once, setOnce] = useState(false)
  const [busy, setBusy] = useState(false)
  // true = something failed; "reserved" = CLI-4: the Pot's name (or the note) reads like an official / brand page
  const [error, setError] = useState<boolean | "reserved">(false)
  const [turningOn, setTurningOn] = useState(false)
  // the link just made (its QR and share buttons); null = the form
  const [made, setMade] = useState<{ id: string; tone: PayInTone; amount: bigint | null; once: boolean; expiresAt: number } | null>(null)

  // a fresh form each time the sheet opens (adjusted while rendering, not in an effect)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMade(null)
      setTone("payment")
      setKind("open")
      setAmount(FIXED_DEFAULT.payment)
      setTyped(false)
      setMore(false)
      setNote("")
      setOnce(false)
      setError(false)
    }
  }

  const pickTone = (v: PayInTone) => {
    setTone(v)
    if (!typed) setAmount(FIXED_DEFAULT[v])
  }
  const fixed = kind === "fixed" ? parseDollars(amount) : null
  const fixedCheck = fixed === null ? null : checkGiftAmount(fixed)
  const fixedBad = kind === "fixed" && (fixed === null || !fixedCheck?.ok)
  const noteLen = giftTextLength(note)
  const taking = pot.gifts?.on !== false
  const closed = pot.status !== "open"
  const url = made && origin ? giftLinkUrl(origin, pot.slug, made.id) : ""
  const { copy, share, copied } = useShareLink(url, payInMessage(made?.tone ?? tone, pot.name, url))

  const make = async () => {
    if (busy || fixedBad || noteLen > GIFT_NOTE_MAX) return
    setBusy(true)
    setError(false)
    try {
      const amt = kind === "fixed" ? fixed : null
      const newId = await createGiftLink(pot.slug, { amount: amt, note: note.trim() || null, reusable: !once, tone })
      setMade({ id: newId, tone, amount: amt, once, expiresAt: Date.now() + GIFT_LINK_TTL_MS })
      announce(t("payin.ready"))
    } catch (e) {
      setError(isReservedNameError(e) ? "reserved" : true)
    } finally {
      setBusy(false)
    }
  }
  const turnOn = async () => {
    setTurningOn(true)
    try {
      await setGiftsOn(pot.slug, true)
      announce(t("settings.taking"))
    } catch {
      setError(true)
    } finally {
      setTurningOn(false)
    }
  }

  let body: React.ReactNode
  let footer: React.ReactNode = null
  if (!taking || closed) {
    body = (
      <div className="flex flex-col items-start gap-3 pt-1" data-payin="off">
        <p className="rounded-md bg-surface-sunken p-3 text-body-sm text-ink">{closed ? t("pot.closing") : t("payin.off", { potName: pot.name })}</p>
        {!closed && (
          <Button onClick={() => void turnOn()} disabled={turningOn} aria-busy={turningOn || undefined} data-payin-turn-on>
            {t("payin.off.cta")}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-ink">
            {t("payin.error.toggle")}
          </p>
        )}
      </div>
    )
    footer = (
      <Button variant="ghost" className="w-full" onClick={onClose}>
        {t("payins.done")}
      </Button>
    )
  } else if (made) {
    body = (
      <div className="flex flex-col items-center gap-4 pt-1 text-center" data-payin="ready">
        <p className="flex items-center gap-2 text-label text-ink" data-payin-ready>
          <Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />
          {t("payin.ready")}
        </p>
        {url ? <QrPlate link={url} alt={t("payin.qr.alt", { potName: pot.name })} hint={t("payin.qr.hint", { potName: pot.name })} dataAttr="data-payin-url" /> : null}
        <p className="text-body-sm text-ink-muted">
          {[payInWhat(made), t("payin.row.until", { date: formatDate(made.expiresAt) }), made.once && t("payin.row.once")].filter(Boolean).join(" · ")}
        </p>
      </div>
    )
    footer = (
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="w-full" onClick={share} disabled={!url} data-payin-share>
          <Share2 aria-hidden strokeWidth={2.25} />
          {t("payin.share")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={copy} aria-live="polite" disabled={!url} data-payin-copy>
            {copied ? <Check aria-hidden className="text-approved" strokeWidth={2.5} /> : <Copy aria-hidden strokeWidth={2} />}
            {copied ? t("payin.copied") : t("payin.copy")}
          </Button>
          <Button variant="ghost" onClick={() => setMade(null)} data-payin-another>
            {t("payin.another")}
          </Button>
        </div>
      </div>
    )
  } else {
    const goal = pot.goalDetail?.spendsBlocked
    body = (
      <div className="flex flex-col gap-4 pt-1" data-payin="form">
        <p className="text-body text-ink">{t("payin.intro", { potName: pot.name })}</p>
        {goal && <p className="rounded-md bg-surface-sunken p-3 text-body-sm text-ink">{t("payin.goal", { potName: pot.name })}</p>}
        <div className="flex flex-col gap-2">
          <p aria-hidden className="text-label text-ink">
            {t("payin.tone.label")}
          </p>
          <Segmented<PayInTone>
            label={t("payin.tone.label")}
            value={tone}
            onChange={pickTone}
            options={[
              { value: "payment", label: t("payin.tone.payment") },
              { value: "gift", label: t("payin.tone.gift") },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p aria-hidden className="text-label text-ink">
            {t("payin.amount")}
          </p>
          <Segmented<AmountKind>
            label={t("payin.amount")}
            value={kind}
            onChange={setKind}
            options={[
              { value: "open", label: t("payin.amount.open") },
              { value: "fixed", label: t("payin.amount.fixed") },
            ]}
          />
          {kind === "fixed" && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-fixed`} className="text-body-sm text-ink-muted">
                {t("payin.amount.label")}
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
                  onChange={(e) => {
                    setTyped(true)
                    setAmount(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 9))
                  }}
                  aria-invalid={fixedBad || undefined}
                  aria-describedby={fixedBad ? `${id}-fixed-err` : undefined}
                  className="min-w-0 flex-1 bg-transparent font-sans text-amount text-ink tabular-nums outline-none"
                  data-payin-fixed
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
          data-payin-more
        >
          {t("payin.more")}
          <ChevronDown aria-hidden className={cn("size-5 transition-transform duration-200", more && "rotate-180")} strokeWidth={2} />
        </button>
        <div id={`${id}-more`} hidden={!more} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-note`} className="text-label text-ink">
              {t("payin.note")}
            </label>
            <input
              id={`${id}-note`}
              value={note}
              maxLength={GIFT_NOTE_MAX + 20}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`${id}-note-hint`}
              aria-invalid={noteLen > GIFT_NOTE_MAX || undefined}
              className="h-12 rounded-md border border-line-strong bg-surface px-3 text-body text-ink outline-none focus:border-ink"
              data-payin-note
            />
            <p id={`${id}-note-hint`} className="text-body-sm text-ink-muted">
              {noteLen > GIFT_NOTE_MAX - 30 ? t("gift.note.count", { n: GIFT_NOTE_MAX - noteLen }) : t("payin.note.hint")}
            </p>
          </div>
          <SwitchRow checked={once} onChange={setOnce} label={t("payin.once")} hint={t("payin.once.hint")} data-payin-once />
        </div>
        {now > 0 && <p className="text-body-sm text-ink-muted">{t("payin.expiry", { date: formatDate(now + GIFT_LINK_TTL_MS) })}</p>}
      </div>
    )
    footer = (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-body-sm text-ink" data-payin-error={error === "reserved" ? "reserved" : undefined}>
            {error === "reserved" ? t("publicpage.reserved.body") : t("payin.error")}
          </p>
        )}
        <Button variant="primary" className="w-full" onClick={() => void make()} disabled={busy || fixedBad || noteLen > GIFT_NOTE_MAX} aria-busy={busy || undefined} data-payin-make>
          <Link2 aria-hidden strokeWidth={2.25} />
          {t("payin.create")}
        </Button>
      </div>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("payin.title")} description={pot.name} keyboard footer={footer}>
      {body}
    </Sheet>
  )
}
