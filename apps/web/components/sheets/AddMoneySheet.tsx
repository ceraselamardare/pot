"use client"
// Add money (ux-spec §4.7, design-direction 01 §4): reads like a sentence — amount, source, outcome, button,
// keypad. Demo dollars are preselected on testnet. The sheet closes at once on submit; the feed shows
// "Adding $150…" with "Sending…" and the hero "+$150 on the way" until it lands.
// The first step of the Add money flow (components/sheets/AddFlow.tsx): what is typed and the source are kept by
// the flow, so Back from the network step finds them as they were.
import { Info } from "lucide-react"
import { useEffect, useState } from "react"
import { Callout } from "@/components/feedback/States"
import { AmountDisplay, Keypad } from "@/components/money/Keypad"
import { Chip } from "@/components/pot/Controls"
import { Button } from "@/components/ui/button"
import { Sheet } from "@/components/sheets/Sheet"
import { t } from "@/i18n/t"
import { addMoney } from "@/lib/client/actions"
import { useOnline } from "@/lib/client/browser"
import { useOwnDollars } from "@/lib/client/data"
import { formatUsd, parseKeypad, toKeypad, type Micro } from "@/lib/client/money"
import type { PotVM } from "@/lib/client/mock/types"
import { cn } from "@/lib/client/cn"
import type { AddSource } from "@/lib/client/machines/add-flow"
import { refundAfterAdd } from "@/lib/client/refund"
import { pushSheetStep } from "@/lib/client/sheet"

const NOTE_KEY = "pot.usdcNote.seen"

function noteSeen(): boolean {
  try {
    return localStorage.getItem(NOTE_KEY) === "1"
  } catch {
    return true
  }
}

export function AddMoneySheet({
  pot,
  open,
  onClose,
  prefill,
  typed,
  onTyped: setTyped,
  source,
  onSource: setSource,
}: {
  pot: PotVM
  open: boolean
  onClose: () => void
  /** ?amount= from "Add my $150 share" */
  prefill: string | null
  /** the keypad as typed (null = untouched: the prefill shows), kept by the flow across Back */
  typed: string | null
  onTyped: (value: string) => void
  source: AddSource
  onSource: (value: AddSource) => void
}) {
  const online = useOnline()
  const [hideNote, setHideNote] = useState(false)
  const suggested = pot.goalEach
  const fallback =
    prefill && /^\d+(\.\d{1,2})?$/.test(prefill)
      ? prefill
      : suggested && pot.me && pot.me.contributed < suggested
        ? toKeypad(suggested - pot.me.contributed)
        : ""
  const value = typed ?? fallback
  const amount = parseKeypad(value)
  // the person's own Pot dollars (usdc.ft_balance_of(me), 10 s while open); 0 in the mock
  const ownRead = useOwnDollars(pot.me?.person.id ?? null, open)
  const ownDollars: Micro = ownRead ?? 0n
  // none at all (read, and zero): the source can't be picked; with some, "Use all $X" fills the amount
  const noOwn = ownRead !== undefined && ownRead === 0n
  useEffect(() => {
    if (open && noOwn && source === "pot_dollars") setSource("demo")
  }, [open, noOwn, source, setSource])
  const short = source === "pot_dollars" && amount > ownDollars
  const valid = amount > 0n && !short
  const after = pot.balance + amount
  // R-33 M-6: what you'd get back if the Pot closed right after this (the hub's close math over the new numbers)
  const refundAfter = amount > 0n ? refundAfterAdd(pot, amount) : null
  const reachesGoal = pot.goal !== null && pot.totalIn < pot.goal && pot.totalIn + amount >= pot.goal
  const showNote = open && !hideNote && !noteSeen()

  // closing resets the flow (AddFlow: no ?sheet=add → RESET)
  const close = onClose
  const submit = () => {
    if (!valid || !pot.me) return
    if (!online) return
    const h = addMoney(pot, amount, pot.me.person.id, { source })
    if (h) close()
  }
  const chips: { label: string; amount: Micro }[] = [
    ...(suggested ? [{ label: t("add.chip.share", { suggested: formatUsd(suggested, "whole") }), amount: suggested }] : []),
    { label: formatUsd(50_000_000n, "whole"), amount: 50_000_000n },
    { label: formatUsd(100_000_000n, "whole"), amount: 100_000_000n },
    ...(source === "pot_dollars" && ownDollars > 0n ? [{ label: t("add.source.max", { available: formatUsd(ownDollars) }), amount: ownDollars }] : []),
  ]

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("add.title", { potName: pot.name })}
      footer={
        <div className="flex flex-col gap-3">
          {!online && <p className="text-body-sm text-ink-muted">{t("add.offline")}</p>}
          <Button
            variant="primary"
            disabled={!valid || !online}
            onClick={submit}
            className="w-full disabled:border-transparent disabled:bg-surface-sunken disabled:text-ink-muted disabled:opacity-100"
          >
            {amount > 0n ? t("add.cta", { amount: formatUsd(amount, "whole") }) : t("add.cta.empty")}
          </Button>
          <Keypad value={value} onChange={setTyped} onSubmit={submit} />
        </div>
      }
    >
      <AmountDisplay value={value} label={t("add.amount.label")} className="pt-2" />
      {short && (
        <p role="alert" className="mt-2 text-center text-body-sm text-ink">
          {t("add.error.insufficient_own", { available: formatUsd(ownDollars) })}
        </p>
      )}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label={t("add.amount.label")}>
        {chips.map((c) => (
          <Chip key={c.label} selected={amount === c.amount} onClick={() => setTyped(toKeypad(c.amount))} className="rounded-pill">
            <span className="tabular-nums">{c.label}</span>
          </Chip>
        ))}
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-body-sm text-ink-muted">{t("add.source.label")}</legend>
        <div role="radiogroup" aria-label={t("add.source.label")} className="flex flex-col overflow-hidden rounded-md border border-line">
          <SourceRow
            checked={source === "demo"}
            onSelect={() => setSource("demo")}
            label={t("add.source.demo")}
            pill={t("add.source.test_pill")}
          />
          <SourceRow
            checked={source === "pot_dollars"}
            onSelect={() => setSource("pot_dollars")}
            label={t("add.source.pot_dollars", { available: formatUsd(ownDollars) })}
            sub={noOwn ? t("add.source.pot_dollars.none") : short ? t("add.source.short", { amount: formatUsd(amount, "whole") }) : undefined}
            disabled={noOwn}
          />
          {/* integrations (D-50): the any-chain deposit (?src=xc), with the amount typed here */}
          <SourceRow
            checked={false}
            onSelect={() =>
              pushSheetStep((p) => {
                p.set("src", "xc")
                if (amount > 0n) p.set("amount", value)
                else p.delete("amount")
              })
            }
            label={t("add.source.other_wallet")}
            sub={t("add.source.other_hint")}
          />
        </div>
      </fieldset>

      {showNote && (
        <Callout icon={<Info strokeWidth={2} />} className="mt-4">
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

      {amount > 0n && (
        <p className="mt-4 text-center text-body-sm text-ink-muted" data-add-after>
          {reachesGoal
            ? t("add.after.goal", { potName: pot.name, balance: formatUsd(after) })
            : t("add.after", { potName: pot.name, balance: formatUsd(after) })}
        </p>
      )}
      {refundAfter !== null && (
        <p className="mt-1 text-center text-body-sm text-ink-muted tabular-nums" data-add-refund>
          {t("add.refund_after", { refund: formatUsd(refundAfter, "whole") })}
        </p>
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
        "flex min-h-14 items-center gap-3 border-b border-line px-3 text-left last:border-b-0",
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
        <span className={cn("block text-label", disabled ? "text-ink-muted" : "text-ink")}>{label}</span>
        {sub && <span className="block text-body-sm text-ink-muted">{sub}</span>}
      </span>
      {pill && <span className="rounded-pill bg-surface px-2 py-0.5 text-body-sm font-semibold text-ink-muted ring-1 ring-line">{pill}</span>}
    </button>
  )
}
