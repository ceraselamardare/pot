"use client"
// Add money (ux-spec §4.7, design-direction 01 §4). Two steps, like Spend (2026-11-03: "when we send money we have a
// multi-step modal; adding should behave the same"), so a 390 × 844 phone never scrolls:
//  1 "How much?": the big amount, the Pot's suggestion chips (Your share · $50 · $100), the $10,000 limit, a quiet
//    "Someone else paying? Send them a link" (→ Ask anyone, ?sheet=payin; "pay in" 2026-11-03), [Next] (the one
//    marigold) over the keypad; Enter on the keypad = Next.
//  2 "How do you want to add it?" (?sheet=add&step=source, its own history entry): the amount (with [Change]), the
//    top-up line, the source (Demo dollars · Your Pot dollars (Use all) · Another app or exchange), the first-time
//    note, and pinned over the ask: "Pot will have $X" + "After this, you'd get back $Y", [Add $X] (or [Continue]
//    into the deposit's network step for another app), [‹ Back].
// A deep link with an amount ("Add my $150 share", a top-up card's [Add $50]) opens straight on step 2; Back or
// [Change] reaches step 1. A cold &step=source with nothing to add is corrected to step 1.
// The sheet closes at once on submit; the feed shows "Adding $150…" with "Sending…" and the hero "+$150 on the way".
// What is typed and the source are kept by the flow (components/sheets/AddFlow.tsx), so Back from the network step
// (or from step 2) finds them as they were.
import { Info } from "lucide-react"
import { useEffect, useState } from "react"
import { Callout } from "@/components/feedback/States"
import { AmountDisplay, Keypad } from "@/components/money/Keypad"
import { Chip } from "@/components/pot/Controls"
import { Button } from "@/components/ui/button"
import { Sheet, SheetBack } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { addMoney } from "@/lib/client/actions"
import { useOnline } from "@/lib/client/browser"
import { useOwnDollars } from "@/lib/client/data"
import { formatUsd, keypadDisplay, MAX_ADD, parseKeypad, toKeypad, type Micro } from "@/lib/client/money"
import type { PotVM } from "@/lib/client/mock/types"
import { cn } from "@/lib/client/cn"
import { ADD_SOURCE_STEP, type AddSource } from "@/lib/client/machines/add-flow"
import { refundAfterAdd } from "@/lib/client/refund"
import { pushSheetStep, replaceSheetParams, sheetStepBack, swapSheet, useSheetParams } from "@/lib/client/sheet"
import { GIFTS_ON } from "@/lib/client/gifts/flag"

const NOTE_KEY = "pot.usdcNote.seen"

function noteSeen(): boolean {
  try {
    return localStorage.getItem(NOTE_KEY) === "1"
  } catch {
    return true
  }
}

/** A link's ?amount= the sheet can use: dollars with up to 2 decimals. */
const amountParam = (raw: string | null): string | null => (raw && /^\d+(\.\d{1,2})?$/.test(raw) ? raw : null)

export function AddMoneySheet({
  pot,
  open,
  onClose,
  prefill,
  topupId,
  typed,
  onTyped: setTyped,
  source,
  onSource: setSource,
}: {
  pot: PotVM
  open: boolean
  onClose: () => void
  /** ?amount= from "Add my $150 share" (or a top-up ask's [Add $50]) */
  prefill: string | null
  /** ?topup=<id>: this add answers that ask (the line under the amount says so; progress counts every add anyway) */
  topupId?: string | null
  /** the keypad as typed (null = untouched: the prefill shows), kept by the flow across Back */
  typed: string | null
  onTyped: (value: string) => void
  source: AddSource
  onSource: (value: AddSource) => void
}) {
  const online = useOnline()
  const [hideNote, setHideNote] = useState(false)
  const suggested = pot.goalEach
  const linked = amountParam(prefill)
  const fallback = linked ?? (suggested && pot.me && pot.me.contributed < suggested ? toKeypad(suggested - pot.me.contributed) : "")
  const value = typed ?? fallback
  // the person's own Pot dollars (usdc.ft_balance_of(me), 10 s while open); 0 in the mock
  const ownRead = useOwnDollars(pot.me?.person.id ?? null, open)
  const ownDollars: Micro = ownRead ?? 0n
  // "Use all $X" adds every last micro-dollar (an arrived transfer is e.g. $4.949505; the keypad holds cents, so it
  // used to add $4.94 and leave the rest behind) while the keypad still shows what the chip put there
  const [allOf, setAllOf] = useState<Micro | null>(null)
  const useAll = allOf !== null && source === "pot_dollars" && allOf === ownDollars && value === toKeypad(allOf)
  const amount = useAll ? allOf : parseKeypad(value)
  // none at all (read, and zero): the source can't be picked; with some, "Use all $X" fills the amount
  const noOwn = ownRead !== undefined && ownRead === 0n
  useEffect(() => {
    if (open && noOwn && source === "pot_dollars") setSource("demo")
  }, [open, noOwn, source, setSource])
  const short = source === "pot_dollars" && amount > ownDollars
  const tooMuch = amount > MAX_ADD
  const amountOk = amount > 0n && !tooMuch
  const isXc = source === "xc"
  const valid = amountOk && !short && !isXc
  const after = pot.balance + amount
  // R-33 M-6: what you'd get back if the Pot closed right after this (the hub's close math over the new numbers)
  const refundAfter = amount > 0n ? refundAfterAdd(pot, amount) : null
  const reachesGoal = pot.goal !== null && pot.totalIn < pot.goal && pot.totalIn + amount >= pot.goal
  const showNote = open && !hideNote && !noteSeen()
  // "Ask for a top-up": the add answers the open ask it came from
  const ask = topupId && pot.topup?.id === topupId ? pot.topup : null

  // ---- the two steps (the URL is the truth while open; the opening may jump to step 2 for a linked amount)
  const { params } = useSheetParams()
  const urlStep = params.get("step") === ADD_SOURCE_STEP ? 2 : 1
  // step 2 needs an amount that came from somewhere: typed (or Next on a suggestion), or a link's ?amount=
  const canStep2 = amountOk && (typed !== null || (linked !== null && parseKeypad(linked) > 0n))
  const [step, setStep] = useState<1 | 2>(1)
  const [seen, setSeen] = useState({ open: false, urlStep })
  if (seen.open !== open || seen.urlStep !== urlStep) {
    setSeen({ open, urlStep })
    // an opening (also coming back from the network step): a linked amount goes straight to step 2
    if (open && !seen.open) setStep(canStep2 && (urlStep === 2 || typed === null) ? 2 : 1)
    // the browser's Back / Forward, the in-sheet Back
    else if (open) setStep(urlStep === 2 && canStep2 ? 2 : 1)
  }
  // keep the URL in line with the step shown: a linked amount opened on step 2 says so (the same entry, so the
  // browser's Back still leaves the sheet), and a cold &step=source with nothing to add says step 1
  useEffect(() => {
    if (!open) return
    if (step === 2 && urlStep === 1) replaceSheetParams((p) => p.set("step", ADD_SOURCE_STEP))
    else if (step === 1 && urlStep === 2) replaceSheetParams((p) => p.delete("step"))
  }, [open, step, urlStep])

  const next = () => {
    if (!amountOk) return
    // a suggestion taken as is becomes the typed amount (so step 2 has it after any Back / Forward)
    if (typed === null) setTyped(value)
    setStep(2)
    if (urlStep !== 2) pushSheetStep((p) => p.set("step", ADD_SOURCE_STEP))
  }
  const back = () => {
    if (urlStep === 2) sheetStepBack((p) => p.delete("step"))
    else setStep(1)
  }

  // closing resets the flow (AddFlow: no ?sheet=add → RESET)
  const close = onClose
  const submit = () => {
    if (!valid || !pot.me || !online) return // (never "xc": valid is false there)
    const h = addMoney(pot, amount, pot.me.person.id, { source })
    if (h) close()
  }
  // integrations (D-50): the any-chain deposit (?src=xc), with the amount from step 1
  const toDeposit = () => {
    if (!amountOk) return
    pushSheetStep((p) => {
      p.set("src", "xc")
      p.set("amount", value)
    })
  }
  const chips: { label: string; amount: Micro }[] = [
    ...(suggested ? [{ label: t("add.chip.share", { suggested: formatUsd(suggested, "whole") }), amount: suggested }] : []),
    { label: formatUsd(50_000_000n, "whole"), amount: 50_000_000n },
    { label: formatUsd(100_000_000n, "whole"), amount: 100_000_000n },
  ]
  const askLine = ask && (
    <p className="text-body-sm text-ink-muted tabular-nums" data-add-topup={ask.id}>
      {ask.mine ? t("add.for_topup.mine", { amount: formatUsd(ask.perPerson, "whole") }) : t("add.for_topup", { name: ask.asker.name, amount: formatUsd(ask.perPerson, "whole") })}
    </p>
  )
  const primaryClass = "w-full disabled:border-transparent disabled:bg-surface-sunken disabled:text-ink-muted disabled:opacity-100"

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("add.title", { potName: pot.name })}
      stepKey={step}
      footer={
        step === 1 ? (
          <div className="flex flex-col gap-3" data-add-step="1">
            <Button variant="primary" disabled={!amountOk} onClick={next} className={primaryClass} data-add-next>
              {t("add.next")}
            </Button>
            <Keypad value={value} onChange={setTyped} onSubmit={next} />
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-add-step="2">
            {amount > 0n && (
              <div className="flex flex-col gap-0.5 text-center text-body-sm text-ink-muted tabular-nums" aria-live="polite">
                <p data-add-after>
                  {reachesGoal
                    ? t("add.after.goal", { potName: pot.name, balance: formatUsd(after) })
                    : t("add.after", { potName: pot.name, balance: formatUsd(after) })}
                </p>
                {refundAfter !== null && <p data-add-refund>{t("add.refund_after", { refund: formatUsd(refundAfter, "whole") })}</p>}
              </div>
            )}
            {!online && <p className="text-body-sm text-ink-muted">{t("add.offline")}</p>}
            {isXc ? (
              <Button variant="primary" disabled={!amountOk} onClick={toDeposit} className={cn("mt-1", primaryClass)} data-add-continue>
                {t("add.cta.other")}
              </Button>
            ) : (
              <Button variant="primary" disabled={!valid || !online} onClick={submit} className={cn("mt-1", primaryClass)}>
                {amount > 0n ? t("add.cta", { amount: formatUsd(amount, "whole") }) : t("add.cta.empty")}
              </Button>
            )}
            <SheetBack onClick={back} />
          </div>
        )
      }
    >
      {step === 1 ? (
        <div className="flex flex-col items-center gap-1 pt-1" data-add-body="1">
          <AmountDisplay value={value} label={t("add.step.amount")} />
          {askLine && <div className="text-center">{askLine}</div>}
          {tooMuch && (
            <p role="alert" className="mt-1 text-center text-body-sm text-ink" data-add-max>
              {t("add.error.max", { max: formatUsd(MAX_ADD, "whole") })}
            </p>
          )}
          <div className="-mx-4 mt-3 flex gap-2 self-stretch overflow-x-auto px-4 pb-1 md:mx-0 md:justify-center md:px-0" role="group" aria-label={t("add.amount.label")}>
            {chips.map((c) => (
              <Chip
                key={c.label}
                selected={amount === c.amount}
                onClick={() => {
                  setTyped(toKeypad(c.amount))
                  setAllOf(null)
                }}
                className="rounded-pill"
              >
                <span className="tabular-nums">{c.label}</span>
              </Chip>
            ))}
          </div>
          {/* "pay in": someone outside the Pot paying → Ask anyone (swapped in: ✕ / Back leave both) */}
          {GIFTS_ON && pot.status === "open" && (
            <button
              type="button"
              onClick={() => swapSheet("payin")}
              className="min-h-11 rounded-sm px-1 text-body-sm text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
              data-add-someone-else
            >
              {t("add.someone_else")}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 pt-1" data-add-body="2">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <p data-money data-add-amount className="font-display text-title text-ink tabular-nums">
                <span className="sr-only">{t("add.step.amount")} </span>
                {useAll ? formatUsd(amount) : keypadDisplay(value)}
              </p>
              <button
                type="button"
                onClick={back}
                aria-label={t("add.amount.change.a11y")}
                className="-mr-1 min-h-11 shrink-0 rounded-sm px-1 text-label text-link underline-offset-4 hover:underline"
                data-add-change
              >
                {t("add.amount.change")}
              </button>
            </div>
            {askLine}
          </div>

          <div className="flex flex-col gap-2">
            <h3 id="add-source-label" data-step-heading tabIndex={-1} className="text-body-sm text-ink-muted outline-none">
              {t("add.source.title")}
            </h3>
            <div role="radiogroup" aria-labelledby="add-source-label" className="flex flex-col overflow-hidden rounded-md border border-line">
              <SourceRow checked={source === "demo"} onSelect={() => setSource("demo")} label={t("add.source.demo")} pill={t("add.source.test_pill")} />
              <SourceRow
                checked={source === "pot_dollars"}
                onSelect={() => setSource("pot_dollars")}
                label={t("add.source.pot_dollars", { available: formatUsd(ownDollars) })}
                sub={noOwn ? t("add.source.pot_dollars.none") : undefined}
                disabled={noOwn}
              />
              <SourceRow checked={isXc} onSelect={() => setSource("xc")} label={t("add.source.other_wallet")} sub={t("add.source.other_hint")} />
            </div>
            {source === "pot_dollars" && ownDollars > 0n && !useAll && (
              <Chip
                selected={false}
                onClick={() => {
                  setTyped(toKeypad(ownDollars))
                  setAllOf(ownDollars)
                }}
                className="self-start rounded-pill"
              >
                <span className="tabular-nums">{t("add.source.max", { available: formatUsd(ownDollars) })}</span>
              </Chip>
            )}
            {short && (
              <p role="alert" className="text-body-sm text-ink">
                {t("add.error.insufficient_own", { available: formatUsd(ownDollars) })}
              </p>
            )}
          </div>

          {showNote && !isXc && (
            <Callout icon={<Info strokeWidth={2} />}>
              <p>{t("add.usdc_note")}</p>
              <button
                type="button"
                className="mt-1 -ml-1 min-h-11 rounded-sm px-1 text-label text-link underline-offset-4 hover:underline"
                onClick={() => {
                  try {
                    localStorage.setItem(NOTE_KEY, "1")
                  } catch {}
                  setHideNote(true)
                }}
              >
                {t("add.usdc_note.ok")}
              </button>
            </Callout>
          )}
        </div>
      )}
    </Sheet>
  )
}

function SourceRow({
  checked,
  onSelect,
  label,
  sub,
  pill,
  disabled,
}: {
  checked: boolean
  onSelect?: () => void
  label: string
  sub?: string
  pill?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={cn(
        "flex min-h-14 items-center gap-3 border-b border-line px-3 py-1.5 text-left last:border-b-0",
        checked ? "bg-surface-sunken" : "bg-surface hover:bg-surface-sunken",
        disabled && "cursor-not-allowed",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-pill border-2",
          checked ? "border-ink" : "border-line-strong",
        )}
      >
        {checked && <span className="size-2.5 rounded-pill bg-ink" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-label tabular-nums", disabled ? "text-ink-muted" : "text-ink")}>{label}</span>
        {sub && <span className="block text-body-sm text-ink-muted">{sub}</span>}
      </span>
      {pill && <span className="rounded-pill bg-surface px-2 py-0.5 text-body-sm font-semibold text-ink-muted ring-1 ring-line">{pill}</span>}
    </button>
  )
}
