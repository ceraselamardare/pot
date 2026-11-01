"use client"
// "Scan receipt" in the Spend sheet (2026-11-01 declutter: two steps). The reading's state lives in the sheet
// (`useReceiptSnap`), so it survives the step change; three views show it:
//  - `ReceiptStart` (step 1, by the amount): a compact secondary [📷 Scan receipt] chip (camera on phones,
//    capture="environment"; the file picker on desktop) plus "Choose a photo" on touch screens; then "Reading your
//    receipt…" with [Type it in instead]; a failure with [Try again]. A reading that fills the amount moves the
//    sheet to step 2 with everything filled.
//  - `ReceiptCard` (step 2, and step 1 when the amount still needs typing): one row, merchant · total. A receipt in
//    another currency shows the sum underneath ("€42.50 ≈ $46.12 · rate 1.0852 from today"): the server converts it
//    with a live reference rate (server/features/fx.ts) and the dollars are pre-filled, still editable. With no rate,
//    it says so and offers [Use 42.50 as dollars], as before. The ⌄ opens the details: the day, the source of the
//    rate, the items, [Scan again], [Remove] and "Read privately" (where the photo is read, that it isn't kept).
//  - `ReceiptInputs`: the hidden file inputs and the reading's own role=status region (always mounted).
// Never marigold: the sheet's Next / Ask stays its one marigold button.
import { ArrowUpRight, Camera, ChevronDown, CircleAlert, ReceiptText, ShieldCheck } from "lucide-react"
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react"
import { TypingDots } from "@/components/feedback/TypingDots"
import { Button } from "@/components/ui/button"
import { t, tLines } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import { cents, toKeypad } from "@/lib/client/money"
import { readReceiptPhoto, ReceiptReadError, type ReceiptFailure } from "@/lib/client/receipts/read"
import type { Category } from "@/lib/client/mock/types"
import {
  formatRate,
  formatReceiptMoney,
  isoDayUtc,
  isUsd,
  receiptDay,
  receiptNote,
  type ReceiptFx,
  type ReceiptProof,
  type ReceiptRead,
  type ReceiptReadRes,
} from "@/lib/receipt"
import { newReceiptNonce, savedReceiptOf, type SavedReceipt } from "@/lib/receipt-saved"

/** What a reading fills in. `amount` is a keypad string; absent = leave the field alone. */
export interface ReceiptFill {
  amount?: string
  category?: Category
  note?: string
}

/** A reading as kept by the sheet: `readAt` and `nonce` are fixed when it arrives, so the details saved with the spend
 *  (lib/receipt-saved.ts savedReceiptOf) and their fingerprint are the same however often the ask is retried. */
export type Reading = { result: ReceiptRead; proof: ReceiptProof | null; source: ReceiptReadRes["source"]; fx: ReceiptFx | null; readAt: number; nonce: string }
export type SnapState = { tag: "idle" } | { tag: "reading" } | { tag: "read"; reading: Reading } | { tag: "failed"; kind: ReceiptFailure }

/** A reading → the fields it fills: dollars (printed, or converted at a live rate) fill the amount; the reason and note always. */
export function fillOf(r: ReceiptRead, fx: ReceiptFx | null = null): ReceiptFill {
  const fill: ReceiptFill = { category: r.category }
  if (isUsd(r) && r.totalCents !== null) fill.amount = toKeypad(cents(r.totalCents))
  else if (fx?.ok && fx.from === r.currency) fill.amount = toKeypad(cents(fx.usdCents))
  const note = receiptNote(r)
  if (note) fill.note = note
  return fill
}

/** The live-region sentence: "Receipt read: $84.20 at Pingo Doce" (+ "That's about $46.12." for another currency). */
export function announcement(r: ReceiptRead, fx: ReceiptFx | null = null): string {
  const amount = formatReceiptMoney(r.totalCents ?? 0, r.currency)
  const said = r.merchant ? t("spend.receipt.announce", { amount, merchant: r.merchant }) : t("spend.receipt.announce.plain", { amount })
  return fx?.ok ? `${said}. ${t("spend.receipt.announce.usd", { usd: formatReceiptMoney(fx.usdCents, "USD") })}` : said
}

/** "€42.50 ≈ $46.12 · rate 1.0852 from today" (or "from Oct 30": ECB rates are published on working days). */
export function fxLine(fx: Extract<ReceiptFx, { ok: true }>, now = Date.now()): string {
  const vars = { original: formatReceiptMoney(fx.amountCents, fx.from), usd: formatReceiptMoney(fx.usdCents, "USD"), rate: formatRate(fx.rate) }
  const d = new Date(now)
  const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  // rate dates are calendar days stamped in UTC (sample, open.er-api) or CET (ECB): "today" in either frame counts
  const today = fx.rateDate === localToday || fx.rateDate === isoDayUtc(now)
  return today ? t("spend.receipt.fx.line_today", vars) : t("spend.receipt.fx.line", { ...vars, day: receiptDay(fx.rateDate) })
}

const COARSE = "(pointer: coarse)"
const mql = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(COARSE) : null)
const subscribeCoarse = (cb: () => void) => {
  const m = mql()
  m?.addEventListener("change", cb)
  return () => m?.removeEventListener("change", cb)
}
/** Touch screens get "Choose a photo" next to the camera (false on the server and in the first render). */
const useCoarsePointer = () => useSyncExternalStore(subscribeCoarse, () => mql()?.matches ?? false, () => false)

/** Focus the first match once the next frame is painted (the view it's in may only mount now). */
const focusSoon = (...selectors: string[]) =>
  requestAnimationFrame(() => {
    for (const s of selectors) {
      const el = document.querySelector<HTMLElement>(s)
      if (el) return el.focus()
    }
  })

export interface Snap {
  state: SnapState
  live: string
  id: string
  coarse: boolean
  onPicked: (e: ChangeEvent<HTMLInputElement>) => void
  openCamera: () => void
  openPicker: () => void
  cancel: () => void
  remove: () => void
  /** "Use 42.50 as dollars" (no rate): fill the printed number as the amount */
  useAmount: (amount: string) => void
}

/**
 * The reading's state, owned by the Spend sheet. `onRead` gets what a reading fills and returns true when the sheet
 * moves to another step because of it (that step's heading then takes focus); otherwise the card's heading does.
 */
export function useReceiptSnap({
  slug,
  resetKey,
  onRead,
  onFill,
  onClear,
}: {
  slug: string
  /** a change (the sheet's next opening) drops the reading and cancels one in flight */
  resetKey: number
  onRead: (fill: ReceiptFill) => boolean
  onFill: (fill: ReceiptFill) => void
  /** the person removed the reading: undo what it filled (the sheet keeps anything they changed since) */
  onClear?: () => void
}): Snap {
  const [state, setState] = useState<SnapState>({ tag: "idle" })
  const [live, setLive] = useState("")
  const coarse = useCoarsePointer()
  const abort = useRef<AbortController | null>(null)
  const id = useId()
  // the sheet's latest callbacks (a reading resolves renders later, maybe on another step)
  const cbs = useRef({ onRead, onFill, onClear })
  useEffect(() => {
    cbs.current = { onRead, onFill, onClear }
  })
  useEffect(
    () => () => {
      abort.current?.abort()
      abort.current = null
    },
    [resetKey],
  )
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setState({ tag: "idle" })
    setLive("")
  }

  const read = async (file: File) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setState({ tag: "reading" })
    setLive(t("spend.receipt.reading"))
    try {
      const res = await readReceiptPhoto(slug, file, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (!res.result.readable) {
        setState({ tag: "failed", kind: "unreadable" })
        setLive(tLines("spend.receipt.error.unreadable").join(". "))
        focusSoon("[data-receipt-heading]")
        return
      }
      const fx = res.fx ?? null
      setState({ tag: "read", reading: { result: res.result, proof: res.proof, source: res.source, fx, readAt: Date.now(), nonce: newReceiptNonce() } })
      setLive(announcement(res.result, fx))
      if (!cbs.current.onRead(fillOf(res.result, fx))) focusSoon("[data-receipt-heading]")
    } catch (e) {
      if (ctrl.signal.aborted) return
      const kind: ReceiptFailure = e instanceof ReceiptReadError ? e.kind : "unavailable"
      setState({ tag: "failed", kind })
      setLive(tLines(`spend.receipt.error.${kind}`).join(". "))
      focusSoon("[data-receipt-heading]")
    } finally {
      if (abort.current === ctrl) abort.current = null
    }
  }

  return {
    state,
    live,
    id,
    coarse,
    onPicked: (e) => {
      const file = e.target.files?.[0]
      e.target.value = "" // the same photo can be picked again
      if (file) void read(file)
    },
    openCamera: () => document.getElementById(`${id}-camera`)?.click(),
    openPicker: () => document.getElementById(`${id}-picker`)?.click(),
    cancel: () => {
      abort.current?.abort()
      abort.current = null
      setState({ tag: "idle" })
      setLive("")
      focusSoon("[data-receipt-snap]", "[data-step-heading]")
    },
    remove: () => {
      cbs.current.onClear?.()
      setState({ tag: "idle" })
      setLive(t("spend.receipt.removed"))
      focusSoon("[data-receipt-snap]", "[data-step-heading]")
    },
    useAmount: (amount) => cbs.current.onFill({ amount }),
  }
}

/** The receipt details to save with the spend: the reading the person kept (null without one, or after Remove). */
export function keptReceipt(snap: Pick<Snap, "state">): SavedReceipt | null {
  if (snap.state.tag !== "read") return null
  const r = snap.state.reading
  return savedReceiptOf(r, { nonce: r.nonce, readAt: r.readAt })
}

/** The hidden inputs and the reading's own live region: mounted on every step (the sheet's region is outside the modal). */
export function ReceiptInputs({ snap }: { snap: Snap }) {
  return (
    <>
      <input
        id={`${snap.id}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={snap.onPicked}
        data-receipt-input="camera"
      />
      <input id={`${snap.id}-picker`} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden onChange={snap.onPicked} data-receipt-input="picker" />
      <p role="status" aria-live="polite" className="sr-only" data-receipt-live>
        {snap.live}
      </p>
    </>
  )
}

function LinkButton({ onClick, children, className, ...rest }: { onClick: () => void; children: ReactNode; className?: string } & Record<`data-${string}`, unknown>) {
  return (
    <button type="button" onClick={onClick} {...rest} className={cn("min-h-11 rounded-sm px-1 text-body-sm text-link underline-offset-4 hover:underline", className)}>
      {children}
    </button>
  )
}

/** Step 1, under the amount: the Scan chip, or what the reading is doing. */
export function ReceiptStart({ snap }: { snap: Snap }) {
  const s = snap.state
  if (s.tag === "idle")
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1" data-receipt="idle">
        <Button size="sm" onClick={snap.openCamera} aria-describedby={`${snap.id}-hint`} data-receipt-snap className="rounded-pill">
          <Camera aria-hidden strokeWidth={2} />
          {t("spend.receipt.snap")}
        </Button>
        {snap.coarse && <LinkButton onClick={snap.openPicker}>{t("spend.receipt.pick")}</LinkButton>}
        <span id={`${snap.id}-hint`} className="sr-only">
          {t("spend.receipt.hint")}
        </span>
      </div>
    )
  return <ReceiptCard snap={snap} />
}

/** Reading / failed / read, one compact block (step 2, or step 1 while the amount still needs typing). */
export function ReceiptCard({ snap }: { snap: Snap }) {
  const s = snap.state
  if (s.tag === "idle") return null
  if (s.tag === "reading")
    return (
      <div className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md bg-surface-sunken py-1 pr-2 pl-3" data-receipt="reading">
        <span className="flex items-center gap-3">
          <TypingDots size="sm" className="text-ink-muted" />
          <span className="text-label text-ink">{t("spend.receipt.reading")}</span>
        </span>
        <LinkButton onClick={snap.cancel} className="shrink-0">
          {t("spend.receipt.cancel")}
        </LinkButton>
      </div>
    )
  if (s.tag === "failed") {
    const [title, body] = tLines(`spend.receipt.error.${s.kind}`)
    return (
      <div className="flex w-full items-start gap-3 rounded-md bg-surface-sunken p-3" data-receipt="failed" data-receipt-failure={s.kind}>
        <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={2} />
        <div className="flex min-w-0 flex-col gap-1">
          <p data-receipt-heading tabIndex={-1} className="text-label text-ink outline-none">
            {title}
          </p>
          {body && <p className="text-body-sm text-ink-muted">{body}</p>}
          <div className="flex flex-wrap items-center gap-x-3">
            <LinkButton onClick={snap.openCamera} className="-ml-1">
              {t("spend.receipt.try_again")}
            </LinkButton>
            {snap.coarse && <LinkButton onClick={snap.openPicker}>{t("spend.receipt.pick")}</LinkButton>}
          </div>
        </div>
      </div>
    )
  }
  return <Summary reading={s.reading} snap={snap} />
}

/** "Read privately" + what it means. The check link appears once a reading carries its proof (live only). */
function PrivateNote({ id, proof, source }: { id: string; proof: ReceiptProof | null; source: ReceiptReadRes["source"] | null }) {
  const [open, setOpen] = useState(false)
  const panel = `${id}-private`
  return (
    <div data-receipt-private>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        aria-label={t("spend.receipt.private.toggle")}
        onClick={() => setOpen((o) => !o)}
        className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-body-sm text-ink"
      >
        <ShieldCheck aria-hidden className="size-4 shrink-0" strokeWidth={2} />
        {t("spend.receipt.private")}
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-120", open && "rotate-180")} strokeWidth={2} />
      </button>
      <div id={panel} hidden={!open} className="mt-1 flex flex-col gap-2 rounded-md border border-line p-3 text-body-sm text-ink-muted">
        <p>{t("spend.receipt.private.body")}</p>
        {source === "mock" ? (
          <p>{t("spend.receipt.private.sample")}</p>
        ) : (
          <>
            <p>{t("spend.receipt.private.how")}</p>
            {proof && (
              <>
                {proof.reply && <p>{t("spend.receipt.private.reply")}</p>}
                <a
                  href={proof.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("spend.receipt.private.check.label")}
                  data-receipt-verify
                  className="inline-flex min-h-11 items-center gap-0.5 self-start rounded-sm text-body-sm text-link underline-offset-4 hover:underline"
                >
                  {t("spend.receipt.private.check")}
                  <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2} />
                </a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Summary({ reading, snap }: { reading: Reading; snap: Snap }) {
  const r = reading.result
  const fx = reading.fx?.from === r.currency ? reading.fx : null
  const [open, setOpen] = useState(false)
  const [usedAmount, setUsedAmount] = useState(false)
  const panel = `${snap.id}-details`
  const total = r.totalCents !== null ? formatReceiptMoney(r.totalCents, r.currency) : null
  const usd = isUsd(r)
  const converted = !usd && fx?.ok ? fx : null
  const plainAmount = r.totalCents !== null ? (r.totalCents / 100).toFixed(2) : null
  // what needs the person's eye stays visible; what's fine waits in the details
  const attention = usd
    ? r.confidence === "low"
      ? { kind: "low", text: t("spend.receipt.read.low") }
      : null
    : converted
      ? null
      : r.currency
        ? {
            kind: "currency",
            text:
              fx && !fx.ok && fx.why === "unsupported"
                ? t("spend.receipt.read.no_rate_currency", { currency: r.currency, amount: total ?? "" })
                : fx && !fx.ok
                  ? t("spend.receipt.read.no_rate", { currency: r.currency, amount: total ?? "" })
                  : t("spend.receipt.read.currency", { currency: r.currency, amount: total ?? "" }),
          }
        : { kind: "currency", text: t("spend.receipt.read.currency_unknown", { amount: total ?? "" }) }
  const filledNote = converted ? t("spend.receipt.read.converted") : usd && !attention ? t("spend.receipt.read.filled") : null
  const extras = [
    r.taxCents !== null ? { label: t("spend.receipt.tax"), cents: r.taxCents } : null,
    r.tipCents !== null ? { label: t("spend.receipt.tip"), cents: r.tipCents } : null,
  ].filter((x): x is { label: string; cents: number } => x !== null)

  return (
    <section
      aria-labelledby={`${snap.id}-title`}
      className="w-full rounded-md border border-line bg-surface-sunken"
      data-receipt="read"
      data-receipt-summary
    >
      <div className="flex min-h-12 items-center gap-2.5 py-1 pr-0.5 pl-3">
        <ReceiptText aria-hidden className="size-5 shrink-0 text-ink" strokeWidth={2} />
        <h3 id={`${snap.id}-title`} data-receipt-heading tabIndex={-1} className="min-w-0 flex-1 truncate text-label text-ink outline-none">
          {r.merchant ?? t("spend.receipt.read.title")}
        </h3>
        {total && (
          <p className="shrink-0">
            <span className="sr-only">{t("spend.receipt.total")}</span>
            <span data-money data-receipt-total className="text-label text-ink tabular-nums">
              {total}
            </span>
          </p>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          aria-label={t("spend.receipt.details")}
          onClick={() => setOpen((o) => !o)}
          className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-muted hover:bg-line aria-expanded:text-ink"
          data-receipt-details
        >
          <ChevronDown aria-hidden className={cn("size-5 transition-transform duration-120", open && "rotate-180")} strokeWidth={2} />
        </button>
      </div>
      {converted && (
        <p className="-mt-1 pr-3 pb-2.5 pl-10.5 text-body-sm text-ink-muted tabular-nums" data-money data-receipt-fx>
          {fxLine(converted)}
        </p>
      )}
      {attention && (
        <div className="-mt-1 flex flex-col items-start gap-1 pr-3 pb-2.5 pl-10.5">
          <p className="text-body-sm text-ink" data-receipt-notice={attention.kind}>
            {attention.text}
          </p>
          {attention.kind === "currency" && plainAmount && !usedAmount && (
            <LinkButton
              className="-ml-1"
              data-receipt-use-amount
              onClick={() => {
                snap.useAmount(toKeypad(cents(r.totalCents ?? 0)))
                setUsedAmount(true)
              }}
            >
              {t("spend.receipt.use_amount", { amount: plainAmount })}
            </LinkButton>
          )}
        </div>
      )}
      <div id={panel} hidden={!open} className="flex flex-col gap-2 border-t border-line px-3 pt-2 pb-1" data-receipt-more>
        {r.date && <p className="text-body-sm text-ink-muted">{receiptDay(r.date)}</p>}
        {filledNote && (
          <p className="text-body-sm text-ink-muted" data-receipt-notice={converted ? "converted" : "filled"}>
            {filledNote}
          </p>
        )}
        {converted && (
          <p className="text-body-sm text-ink-muted" data-receipt-fx-source={converted.source}>
            {t(`spend.receipt.fx.source.${converted.source}`)}
          </p>
        )}
        {(r.items.length > 0 || extras.length > 0) && (
          <ul aria-label={t("spend.receipt.items.label")} className="flex flex-col gap-1" data-receipt-items>
            {r.items.map((it, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-body-sm text-ink">
                <span className="min-w-0 wrap-break-word">
                  {it.name}
                  {it.qty !== null && it.qty !== 1 && <span className="ml-1 text-ink-muted tabular-nums">{t("spend.receipt.qty", { qty: it.qty })}</span>}
                </span>
                {it.amountCents !== null && (
                  <span data-money className="shrink-0 tabular-nums">
                    {formatReceiptMoney(it.amountCents, r.currency)}
                  </span>
                )}
              </li>
            ))}
            {extras.map((x) => (
              <li key={x.label} className="flex items-baseline justify-between gap-3 border-t border-line pt-1 text-body-sm text-ink-muted">
                <span>{x.label}</span>
                <span data-money className="tabular-nums">
                  {formatReceiptMoney(x.cents, r.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3">
          <LinkButton onClick={snap.openCamera} className="-ml-1">
            {t("spend.receipt.again")}
          </LinkButton>
          <LinkButton onClick={snap.remove}>{t("spend.receipt.remove")}</LinkButton>
        </div>
        <PrivateNote id={snap.id} proof={reading.proof} source={reading.source} />
      </div>
    </section>
  )
}
