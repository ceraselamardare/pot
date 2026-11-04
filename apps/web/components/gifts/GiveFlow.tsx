"use client"
// The page people outside the Pot pay in on (notes/gifts-plan.md "Giver flow (≤ 3 taps)"; "pay in", notes/frontend.md
// 2026-11-03): /g/<slug>/<id> (a pay-in link) and /give/<slug> (the public page) share this island. Its words follow
// the link's (or the page's) tone: a payment ("Pay Lisbon Trip", presets $10 / $25 / $50, [Pay $25]) or a gift ("Send
// Lisbon Trip a gift", ☕ $5 / $10 / $20, [Send $10 ☕]). Open the link → amount (a preset, the middle one picked, or
// another amount from $1, or a fixed-amount link's one button) → optional name + 140-character note (+ "Show my name
// on this page" on the public page) → [Pay $25] (the one marigold; signs in inline first when needed: the mock signs
// the guest in as Alex) → demo dollars are claimed and sent behind that one button → "Thank you!" with [Start your own Pot].
// "Another app or exchange" is the simulated 1Click path (no real money moves in the test version): after [Pay $25] (and
// signing in) the same network → coin (+ live quote) → address steps as a member's Add flow (components/features/deposit/
// GiverDeposit.tsx), a simulated transfer timed like that network, then the payment is sent. A signed-in giver
// with Pot dollars also gets "Pot dollars" (their own balance, no demo top-up), picked by default when it covers the gift.
// Everything that can stop a gift has its own calm screen (link turned off / ended / used, gifts off, an all-or-nothing
// goal still collecting, the Pot closed, the public page off).
import { Check, Gift, Quote, ShieldCheck, X } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Glyph } from "@/components/brand/Glyph"
import { SignInOptions } from "@/components/features/auth/SignInOptions"
import { GiverDeposit } from "@/components/features/deposit/GiverDeposit"
import { TypingDots } from "@/components/feedback/TypingDots"
import { MoneyText } from "@/components/money/MoneyText"
import { Segmented } from "@/components/pot/Controls"
import { CoverTile } from "@/components/pot/CoverTile"
import { ReceiptLink } from "@/components/receipt/ReceiptLink"
import { Button } from "@/components/ui/button"
import { t, type MessageKey } from "@/i18n/t"
import { mockJoinSession } from "@/lib/client/actions"
import { announce } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"
import { IS_LIVE } from "@/lib/client/config"
import { useMeInfo, useOwnDollars } from "@/lib/client/data"
import { giftErrorKey, sendGift } from "@/lib/client/gifts/actions"
import { GIFT_PRESET_AMOUNTS, dollarsInput, parseDollars } from "@/lib/client/gifts/amount"
import { useGiftLanding, useGiftPage, type GiftLandingVM, type GiftPageVM } from "@/lib/client/gifts/data"
import type { GiftPotVM } from "@/lib/client/mock/gifts"
import { formatUsd, type Micro } from "@/lib/client/money"
import { formatDate } from "@/lib/client/time"
import { checkGiftAmount, GIFT_NAME_MAX, GIFT_NOTE_MAX, giftTextLength, PAYMENT_PRESETS, type GiftTaking, type PayInTone } from "@/lib/gifts"
import { newOpKey } from "@pot/sdk"
import { SwitchRow } from "./Switch"

/** "own" = the signed-in giver's own Pot dollars (offered only when they have some) */
type Source = "own" | "demo" | "other"
type Phase =
  | { tag: "form" }
  | { tag: "signin" }
  /** "Another app or exchange": network → coin → address → the simulated transfer (GiverDeposit) */
  | { tag: "xc" }
  | { tag: "sending"; step: "xc_arrived" | "send" }
  | { tag: "done"; amount: Micro; txHash?: string; noted: boolean; shown: boolean }

type Blocked = "not_found" | "revoked" | "expired" | "used" | "off" | "goal" | "closed" | "page_off"

/** What stops a gift, if anything (the link first, then whether the Pot takes gifts now). */
export function blockedOf(link: GiftLandingVM["link"] | null, taking: GiftTaking | undefined, pageOn?: boolean): Blocked | null {
  if (link && link.status !== "active") return link.status
  if (pageOn === false) return "page_off"
  if (taking && taking !== "yes") return taking
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The presets for a tone: a gift's are coffees (☕ × 1 / × 2 / × 4), a payment's plain amounts ($10 / $25 / $50). */
function presetsOf(tone: PayInTone): { amount: Micro; cups: number | null }[] {
  return tone === "gift" ? GIFT_PRESET_AMOUNTS.map((p) => ({ amount: p.amount, cups: p.cups })) : PAYMENT_PRESETS.map((amount) => ({ amount, cups: null }))
}
/** The middle preset is picked to start with ($25 / ☕ × 2 $10). */
const START_PRESET = 1

/** The words that change with the tone (payment / gift). */
const words = (tone: PayInTone, potName: string, amount: string) =>
  tone === "gift"
    ? {
        title: t("gift.title", { potName }),
        cta: t("gift.cta", { amount }),
        fixed: t("gift.fixed", { amount }),
        signin: t("gift.signin.title", { amount }),
        sending: t("gift.sending"),
        again: t("gift.thanks.again"),
        receipt: t("gift.receipt", { amount, potName }),
      }
    : {
        title: t("give.title.payment", { potName }),
        cta: t("give.cta.payment", { amount }),
        fixed: t("give.fixed.payment", { amount }),
        signin: t("give.signin.payment", { amount }),
        sending: t("give.sending.payment"),
        again: t("give.again.payment"),
        receipt: t("give.receipt.payment", { amount, potName }),
      }

// ------------------------------------------------------------------------------------------------- pages

export function GiftLinkFlow({ slug, id, initial }: { slug: string; id: string; initial: GiftLandingVM | null }) {
  const v = useGiftLanding(slug, id, initial)
  if (v === undefined) return <HeroSkeleton />
  if (v === null) return <Blank kind="not_found" />
  const blocked = blockedOf(v.link, v.taking)
  return <GiveScreen pot={v.pot} tone={v.link.tone} linkId={v.link.id} fixed={v.link.amount} note={v.link.note} blocked={blocked} page={null} />
}

export function GiftPageFlow({ slug, initial }: { slug: string; initial: GiftPageVM | null }) {
  const v = useGiftPage(slug, initial)
  if (v === undefined) return <HeroSkeleton />
  if (v === null) return <Blank kind="not_found" />
  const blocked = blockedOf(null, v.taking, v.on)
  return <GiveScreen pot={v.pot} tone={v.tone} linkId={null} fixed={null} note={v.on ? v.line : null} blocked={blocked} page={v} />
}

// ------------------------------------------------------------------------------------------------- the screen

function GiveScreen({
  pot,
  tone,
  linkId,
  fixed,
  note: groupNote,
  blocked,
  page,
}: {
  pot: GiftPotVM
  tone: PayInTone
  linkId: string | null
  fixed: Micro | null
  note: string | null
  blocked: Blocked | null
  page: GiftPageVM | null
}) {
  const formId = useId()
  const me = useMeInfo()
  const signedIn = !!me
  const [phase, setPhase] = useState<Phase>({ tag: "form" })
  const presets = presetsOf(tone)
  const [preset, setPreset] = useState<number | "custom">(START_PRESET)
  const [custom, setCustom] = useState(dollarsInput(presets[START_PRESET]!.amount))
  // the name field starts as the signed-in person's name until they edit it (they can clear it)
  const [typedName, setName] = useState<string | null>(null)
  const name = typedName ?? me?.name.slice(0, GIFT_NAME_MAX) ?? ""
  const [note, setNote] = useState("")
  const [shown, setShown] = useState(false)
  // null = not chosen yet: their own Pot dollars when those cover the gift, else demo dollars
  const [picked, setSource] = useState<Source | null>(null)
  const ownRead = useOwnDollars(me?.id ?? null, signedIn)
  const own: Micro = ownRead ?? 0n
  const hasOwn = signedIn && own > 0n
  const [error, setError] = useState<MessageKey | null>(null)
  const key = useRef(newOpKey())
  const doneRef = useRef<HTMLHeadingElement>(null)

  const amount: Micro | null = fixed ?? (preset === "custom" ? parseDollars(custom) : presets[preset]!.amount)
  const check = amount === null ? null : checkGiftAmount(amount)
  const amountOk = amount !== null && !!check?.ok
  const noteLen = giftTextLength(note)
  const nameLen = giftTextLength(name)
  const textOk = noteLen <= GIFT_NOTE_MAX && nameLen <= GIFT_NAME_MAX
  const whole = amount !== null ? formatUsd(amount, amount % 1_000_000n === 0n ? "whole" : "fixed") : ""
  const isPage = linkId === null
  const source: Source = picked === "own" && !hasOwn ? "demo" : (picked ?? (hasOwn && amount !== null && own >= amount ? "own" : "demo"))
  const ownShort = source === "own" && amount !== null && own < amount
  const w = words(tone, pot.name, whole)

  const send = async (arrived = false) => {
    if (!amountOk || !textOk || amount === null || ownShort) return
    setError(null)
    if (source === "other" && !arrived) {
      // the money comes from another app: pick where from, then the (simulated) transfer; it calls back here
      setPhase({ tag: "xc" })
      return
    }
    if (arrived) {
      setPhase({ tag: "sending", step: "xc_arrived" })
      await sleep(700)
    }
    setPhase({ tag: "sending", step: "send" })
    try {
      const r = await sendGift({
        slug: pot.slug,
        linkId,
        amount,
        name: name.trim() || null,
        note: note.trim() || null,
        showPublic: isPage && shown,
        idempotencyKey: key.current,
        source: source === "own" ? "pot_dollars" : "demo",
      })
      key.current = newOpKey()
      setPhase({ tag: "done", amount, txHash: r.txHash, noted: !!note.trim(), shown: isPage && shown && !!name.trim() })
    } catch (e) {
      setError(giftErrorKey(e))
      setPhase({ tag: "form" })
    }
  }

  const tapSend = () => {
    if (!signedIn) {
      setPhase({ tag: "signin" })
      return
    }
    void send()
  }

  // signed in from the inline step: straight on to sending (one tap fewer)
  const signedInNow = () => void send()
  // the other app's (simulated) transfer arrived: send it on
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })
  const xcArrived = useCallback(() => void sendRef.current(true), [])
  const xcCancel = useCallback(() => setPhase({ tag: "form" }), [])

  useEffect(() => {
    if (phase.tag !== "done") return
    doneRef.current?.focus()
    announce(`${t("gift.thanks.title")} ${t("gift.thanks.body", { amount: formatUsd(phase.amount, "whole"), potName: pot.name })}`)
  }, [phase, pot.name])

  if (blocked && phase.tag !== "done") return (
    <div className="flex flex-col gap-5" data-give={blocked}>
      <Hero pot={pot} title={w.title} line={null} page={null} tone={tone} />
      <StateCard kind={blocked} potName={pot.name} tone={tone} />
      <StartOwn />
    </div>
  )

  if (phase.tag === "done")
    return (
      <div className="flex flex-col gap-5" data-give="done">
        <Hero pot={pot} title={w.title} line={null} page={null} tone={tone} compact />
        <section aria-labelledby="give-done-h" className="flex flex-col gap-4 rounded-lg bg-surface p-4 shadow-card" data-give-state="done">
          <div className="flex items-center gap-3">
            <span className="pot-pop grid size-10 shrink-0 place-items-center rounded-pill bg-brand-soft">
              <Check aria-hidden className="size-6 text-approved" strokeWidth={2.75} />
            </span>
            <div>
              <h2 id="give-done-h" ref={doneRef} tabIndex={-1} className="font-display text-heading text-ink outline-none">
                {t("gift.thanks.title")}
              </h2>
              <p className="text-body text-ink">{t("gift.thanks.body", { amount: formatUsd(phase.amount, "whole"), potName: pot.name })}</p>
            </div>
          </div>
          {(phase.noted || phase.shown) && (
            <p className="text-body-sm text-ink-muted">{[phase.noted && t("gift.thanks.note"), phase.shown && t("gift.thanks.public")].filter(Boolean).join(" ")}</p>
          )}
          <ReceiptLink txHash={phase.txHash} what={words(tone, pot.name, formatUsd(phase.amount, "whole")).receipt} className="self-start" />
          <Button variant="primary" className="w-full" render={<Link href="/" />} data-give-start>
            {t("gift.thanks.cta")}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setNote("")
              setShown(false)
              setPhase({ tag: "form" })
            }}
          >
            {w.again}
          </Button>
        </section>
      </div>
    )

  const busy = phase.tag === "sending"
  return (
    <div className="flex flex-col gap-5" data-give="form">
      <Hero pot={pot} title={w.title} line={groupNote} page={page} tone={tone} />

      {phase.tag === "xc" && amount !== null ? (
        <GiverDeposit potName={pot.name} amount={amount} onArrived={xcArrived} onCancel={xcCancel} />
      ) : phase.tag === "signin" ? (
        <section aria-labelledby="give-signin-h" className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card" data-give-state="signin">
          <h2 id="give-signin-h" className="font-display text-heading text-ink">
            {w.signin}
          </h2>
          <p className="text-body-sm text-ink-muted">{t("gift.signin.body")}</p>
          {IS_LIVE ? (
            <SignInOptions primary onSignedIn={signedInNow} />
          ) : (
            <>
              <Button variant="primary" className="w-full" onClick={() => void mockJoinSession("alex").then(signedInNow)} data-give-mock-signin>
                {t("claim.signin.google")}
              </Button>
              <p className="text-center text-body-sm text-ink-muted">{t("claim.signin.mock")}</p>
            </>
          )}
          <Button variant="ghost" className="w-full" onClick={() => setPhase({ tag: "form" })}>
            {t("gift.signin.back")}
          </Button>
        </section>
      ) : (
        <form
          id={formId}
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            tapSend()
          }}
          aria-busy={busy || undefined}
        >
          {fixed !== null ? (
            <p className="flex flex-col items-center gap-1 text-center" data-give-fixed>
              <MoneyText micro={fixed} variant="hero" style={fixed % 1_000_000n === 0n ? "whole" : "fixed"} className="text-ink" />
              <span className="text-body text-ink-muted">{w.fixed}</span>
            </p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-label text-ink">{t("gift.amount")}</legend>
              <div role="radiogroup" aria-label={t("gift.amount")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {presets.map((p, i) => (
                  <AmountOption
                    key={i}
                    selected={preset === i}
                    onSelect={() => setPreset(i)}
                    label={p.cups === null ? formatUsd(p.amount, "whole") : t("gift.preset.a11y", { amount: formatUsd(p.amount, "whole"), n: p.cups })}
                    data-give-preset={p.cups ?? formatUsd(p.amount, "whole")}
                  >
                    {p.cups !== null && (
                      <span aria-hidden className="text-body-sm leading-none">
                        {p.cups === 1 ? "☕" : `☕×${p.cups}`}
                      </span>
                    )}
                    <MoneyText micro={p.amount} style="whole" className="text-ink" />
                  </AmountOption>
                ))}
                <AmountOption selected={preset === "custom"} onSelect={() => setPreset("custom")} label={t("gift.custom")} data-give-preset="custom">
                  <span className="text-label">{t("gift.custom")}</span>
                </AmountOption>
              </div>
              {preset === "custom" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${formId}-amount`} className="text-body-sm text-ink-muted">
                    {t("gift.custom.label")}
                  </label>
                  <div className="flex h-12 items-center gap-1 rounded-md border border-line-strong bg-surface px-3 focus-within:border-ink">
                    <span aria-hidden className="text-amount text-ink-muted">
                      $
                    </span>
                    <input
                      id={`${formId}-amount`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 9))}
                      aria-invalid={!amountOk || undefined}
                      aria-describedby={`${formId}-amount-hint`}
                      className="min-w-0 flex-1 bg-transparent font-sans text-amount text-ink tabular-nums outline-none"
                      data-give-custom
                    />
                  </div>
                  <p id={`${formId}-amount-hint`} className={cn("text-body-sm", amountOk ? "text-ink-muted" : "text-declined")}>
                    {check && !check.ok && check.why === "too_high" ? t("gift.amount.max") : t("gift.amount.min")}
                  </p>
                </div>
              )}
            </fieldset>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor={`${formId}-name`} className="text-label text-ink">
              {t("gift.name")}
            </label>
            <input
              id={`${formId}-name`}
              value={name}
              maxLength={GIFT_NAME_MAX + 10}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              aria-describedby={`${formId}-name-hint`}
              aria-invalid={nameLen > GIFT_NAME_MAX || undefined}
              className="h-12 rounded-md border border-line-strong bg-surface px-3 text-body text-ink outline-none focus:border-ink"
              data-give-name
            />
            <p id={`${formId}-name-hint`} className="text-body-sm text-ink-muted">
              {t("gift.name.hint")}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${formId}-note`} className="text-label text-ink">
              {t("gift.note")}
            </label>
            <textarea
              id={`${formId}-note`}
              value={note}
              rows={2}
              maxLength={GIFT_NOTE_MAX + 20}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`${formId}-note-hint`}
              aria-invalid={noteLen > GIFT_NOTE_MAX || undefined}
              className="min-h-20 resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-ink outline-none focus:border-ink"
              data-give-note
            />
            <p id={`${formId}-note-hint`} className={cn("text-body-sm", noteLen > GIFT_NOTE_MAX ? "text-declined" : "text-ink-muted")}>
              {noteLen > GIFT_NOTE_MAX - 30 ? t("gift.note.count", { n: GIFT_NOTE_MAX - noteLen }) : isPage ? t("gift.note.hint.page", { potName: pot.name }) : t("gift.note.hint", { potName: pot.name })}
            </p>
          </div>
          {isPage && <SwitchRow checked={shown} onChange={setShown} label={t("gift.public")} hint={t("gift.public.hint")} data-give-public />}

          <div className="flex flex-col gap-1">
            <p id={`${formId}-src`} className="text-label text-ink">
              {t("gift.source.legend")}
            </p>
            <Segmented<Source>
              label={t("gift.source.legend")}
              value={source}
              onChange={setSource}
              options={[
                ...(hasOwn ? [{ value: "own" as const, label: t("gift.source.own") }] : []),
                { value: "demo", label: t("gift.source.demo") },
                { value: "other", label: t("gift.source.other") },
              ]}
            />
            <p className={cn("text-body-sm", ownShort ? "text-ink" : "text-ink-muted")} {...(ownShort ? { role: "alert" } : {})} data-give-source-hint={source}>
              {source === "own"
                ? ownShort
                  ? t("gift.source.own.short", { available: formatUsd(own), amount: whole })
                  : t("gift.source.own.hint", { available: formatUsd(own) })
                : source === "demo"
                  ? t("gift.source.demo.hint")
                  : t("gift.source.other.hint")}
            </p>
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 text-body text-ink" data-give-error>
              <X aria-hidden className="mt-0.5 size-5 shrink-0 text-declined" strokeWidth={2.5} />
              {t(error as "gift.error.failed")}
            </p>
          )}

          {busy ? (
            <div role="status" className="flex min-h-13 items-center justify-center gap-3 rounded-md bg-surface-sunken px-4" data-give-state="sending">
              <TypingDots className="text-ink" />
              <span className="text-label text-ink">
                {phase.step === "xc_arrived" ? t("gift.xc.arrived") : w.sending}
              </span>
            </div>
          ) : (
            <Button type="submit" variant="primary" className="w-full" disabled={!amountOk || !textOk || ownShort} data-give-send>
              {tone === "gift" && <Gift aria-hidden strokeWidth={2.25} />}
              {w.cta}
            </Button>
          )}
          {me && <p className="-mt-2 text-center text-body-sm text-ink-muted">{t("gift.signed_in_as", { name: me.name })}</p>}
        </form>
      )}

      <div className="flex items-start gap-3 rounded-md bg-surface-sunken p-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
        <p className="text-body-sm text-ink">{t("gift.trust")}</p>
      </div>
    </div>
  )
}

function AmountOption({ selected, onSelect, label, children, ...data }: { selected: boolean; onSelect: () => void; label: string; children: React.ReactNode } & { [k: `data-${string}`]: string | number }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        "pot-touch flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 transition-[background-color,border-color,scale] duration-120 ease-standard active:scale-[.97] motion-reduce:active:scale-100",
        selected ? "border-brand-deep bg-brand-soft text-ink" : "border-line-strong bg-surface text-ink hover:bg-surface-sunken",
      )}
      {...data}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------------------------------------- parts

function Hero({ pot, title, line, page, tone, compact }: { pot: GiftPotVM; title: string; line: string | null; page: GiftPageVM | null; tone: PayInTone; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <CoverTile emoji={pot.emoji} cover={pot.cover} size={compact ? "lg" : "xl"} />
      <h1 className="font-display text-title text-balance text-ink">{title}</h1>
      <p className="text-body-sm text-ink-muted" data-give-members>
        {t("gift.members", { n: pot.members })}
      </p>
      {line && (
        <figure className="flex w-full flex-col gap-1 rounded-md bg-surface p-3 text-left shadow-card" data-give-line>
          <blockquote className="flex items-start gap-2 text-body text-ink [overflow-wrap:anywhere]">
            <Quote aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" strokeWidth={2} />
            <span>{line}</span>
          </blockquote>
          <figcaption className="text-body-sm text-ink-muted">{t("give.line.by")}</figcaption>
        </figure>
      )}
      {page?.on && <PageGivers page={page} tone={tone} />}
    </div>
  )
}

function PageGivers({ page, tone }: { page: GiftPageVM; tone: PayInTone }) {
  const total = page.total ?? 0n
  const count = page.count ?? 0
  return (
    <section aria-labelledby="give-givers-h" className="flex w-full flex-col gap-2 text-left" data-give-givers>
      <p className="text-center text-body text-ink tabular-nums" data-give-totals>
        {tone === "gift"
          ? count > 0
            ? t("gift.page.totals", { amount: formatUsd(total, "whole"), n: count })
            : t("gift.page.none")
          : count > 0
            ? t("give.page.totals.payment", { amount: formatUsd(total, "whole"), n: count })
            : t("give.page.none.payment")}
      </p>
      {page.givers && page.givers.length > 0 && (
        <>
          <h2 id="give-givers-h" className="text-label text-ink">
            {t("gift.page.givers")}
          </h2>
          <ul className="flex flex-col gap-2">
            {page.givers.map((g) => (
              <li key={g.key} className="flex flex-col gap-0.5 rounded-md bg-surface px-3 py-2 shadow-card" data-give-giver={g.name}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-body font-semibold text-ink">{g.name}</span>
                  <MoneyText micro={g.amount} className="text-ink" />
                </span>
                {g.note && <span className="text-body-sm text-ink-muted [overflow-wrap:anywhere]">{g.note}</span>}
                <span className="text-body-sm text-ink-muted">{formatDate(g.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const STATE: Record<Blocked, [MessageKey, MessageKey]> = {
  not_found: ["gift.state.not_found.title", "gift.state.not_found.body"],
  revoked: ["gift.state.revoked.title", "gift.state.revoked.body"],
  expired: ["gift.state.expired.title", "gift.state.expired.body"],
  used: ["gift.state.used.title", "gift.state.used.body"],
  off: ["gift.state.off.title", "gift.state.off.body"],
  goal: ["gift.state.goal.title", "gift.state.goal.body"],
  closed: ["gift.state.closed.title", "gift.state.closed.body"],
  page_off: ["gift.state.page_off.title", "gift.state.page_off.body"],
}

function StateCard({ kind, potName, tone }: { kind: Blocked; potName: string; tone: PayInTone }) {
  const [giftTitle, body] = STATE[kind]
  // a payment page says "payments" where a gift page says "gifts"
  const title: MessageKey = tone === "payment" && kind === "off" ? "give.state.off.payment" : tone === "payment" && kind === "goal" ? "give.state.goal.payment" : giftTitle
  return (
    <section aria-labelledby="give-state-h" className="flex items-start gap-3 rounded-lg bg-surface p-4 shadow-card" data-give-state={kind}>
      <X aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={2.5} />
      <div className="min-w-0">
        <h2 id="give-state-h" className="font-display text-heading text-ink">
          {t(title as "gift.state.off.title", { potName })}
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">{t(body as "gift.state.off.body")}</p>
      </div>
    </section>
  )
}

function StartOwn() {
  return (
    <Button className="w-full" render={<Link href="/" />} data-give-start>
      {t("gift.thanks.cta")}
    </Button>
  )
}

function HeroSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-3">
      <div className="size-20 rounded-lg bg-surface-sunken" />
      <div className="h-8 w-64 rounded-sm bg-surface-sunken" />
      <div className="h-40 w-full rounded-lg bg-surface-sunken" />
    </div>
  )
}

/** An address that can't be a gift link / page at all. */
export function Blank({ kind }: { kind: "not_found" | "page_off" }) {
  const [title, body] = STATE[kind]
  return (
    <div className="flex flex-col items-center pt-6 text-center" data-give-state={kind}>
      <Glyph className="mb-6 h-16 w-auto" />
      <h1 className="font-display text-title text-balance text-ink">{t(title as "gift.state.not_found.title")}</h1>
      <p className="mt-2 max-w-80 text-body text-ink-muted">{t(body as "gift.state.not_found.body")}</p>
    </div>
  )
}
