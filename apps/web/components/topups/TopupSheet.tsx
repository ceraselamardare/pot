"use client"
// "Ask for more money" (?sheet=topup; ••• → Ask for more money). Defaults first: "Each person" $50 (or the Pot's own
// "$X each"), no reason, due in a week, so one tap on [Ask for $50 each] sends it. "In total" splits the amount
// equally among everyone in the Pot (rounded up to the cent; the line under the amount says each person's part).
// The optional reason (≤ 80) is for the Pot's members only. One marigold: the ask itself. Off-chain only.
import { HandCoins } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"
import { Chip, Segmented } from "@/components/pot/Controls"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t, type MessageKey } from "@/i18n/t"
import { newOpKey } from "@pot/sdk"
import { useOnline } from "@/lib/client/browser"
import { formatUsd, parseKeypad, toKeypad, type Micro } from "@/lib/client/money"
import type { PotVM } from "@/lib/client/mock/types"
import { formatDate, useNow } from "@/lib/client/time"
import { askTopup, topupErrorKey } from "@/lib/client/topups/actions"
import {
  checkTopupAmount,
  cleanReason,
  dueIn,
  partOf,
  reasonLength,
  TOPUP_DEFAULT_EACH,
  TOPUP_DUE_DAYS,
  TOPUP_DUE_DEFAULT_DAYS,
  TOPUP_MAX,
  TOPUP_MIN,
  TOPUP_REASON_MAX,
  type TopupMode,
} from "@/lib/topups"

/** "50", "1,200.5" → Micro (0 when it isn't an amount). */
const parseAmount = (s: string): Micro => parseKeypad(s.replace(/[,\s$]/g, ""))

export function TopupSheet({ pot, open, onClose }: { pot: PotVM; open: boolean; onClose: () => void }) {
  const id = useId()
  const now = useNow()
  const online = useOnline()
  const n = pot.members.length
  const each = pot.goalEach && pot.goalEach > 0n ? pot.goalEach : TOPUP_DEFAULT_EACH
  const [mode, setMode] = useState<TopupMode>("each")
  // what's typed per mode (null = the default for it)
  const [typed, setTyped] = useState<Record<TopupMode, string | null>>({ each: null, total: null })
  const [reason, setReason] = useState("")
  const [days, setDays] = useState<number>(TOPUP_DUE_DEFAULT_DAYS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  // a retried ask reuses its key (the server answers with the same ask); a new opening gets a new one
  const key = useRef(newOpKey())
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMode("each")
      setTyped({ each: null, total: null })
      setReason("")
      setDays(TOPUP_DUE_DEFAULT_DAYS)
      setBusy(false)
      setError(null)
    }
  }

  const text = typed[mode] ?? toKeypad(mode === "each" ? each : each * BigInt(Math.max(1, n)))
  const amount = parseAmount(text)
  const check = checkTopupAmount(mode, amount, n)
  const part = partOf(mode, amount, n)
  const len = reasonLength(reason.trim())
  const reasonBad = len > TOPUP_REASON_MAX || !cleanReason(reason).ok
  const valid = amount > 0n && check.ok && !reasonBad && n >= 2
  const amountErr = amount > 0n && !check.ok ? (check.why === "too_low" ? t("topup.error.min", { min: formatUsd(TOPUP_MIN, "whole") }) : t("topup.error.max", { max: formatUsd(TOPUP_MAX, "whole") })) : null

  const submit = async () => {
    if (!valid || busy || !online) return
    const r = cleanReason(reason)
    setBusy(true)
    setError(null)
    try {
      await askTopup(pot.slug, { mode, amount, reason: r.ok ? r.value : null, dueInDays: days }, key.current)
      key.current = newOpKey()
      toast.success(t("topup.sent", { amount: formatUsd(part, "whole") }))
      onClose()
    } catch (e) {
      setError(topupErrorKey(e))
    } finally {
      setBusy(false)
    }
  }

  const cta = !valid ? t("topup.cta.empty") : mode === "each" ? t("topup.cta.each", { amount: formatUsd(amount, "whole") }) : t("topup.cta.total", { amount: formatUsd(amount, "whole") })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("topup.title")}
      keyboard
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-body-sm text-ink" data-topup-error>
              {t(error as "topup.error.failed")}
            </p>
          )}
          <Button
            variant="primary"
            className="w-full disabled:border-transparent disabled:bg-surface-sunken disabled:text-ink-muted disabled:opacity-100"
            disabled={!valid || busy || !online}
            aria-busy={busy || undefined}
            onClick={() => void submit()}
            data-topup-ask
          >
            <HandCoins aria-hidden strokeWidth={2.25} />
            {cta}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col gap-3">
          <Segmented<TopupMode>
            label={t("topup.mode.label")}
            value={mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
            }}
            options={[
              { value: "each", label: t("topup.mode.each") },
              { value: "total", label: t("topup.mode.total") },
            ]}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-amount`} className="text-label text-ink">
              {mode === "each" ? t("topup.amount.each") : t("topup.amount.total")}
            </label>
            <div className="flex h-12 items-center gap-1 rounded-md border border-line-strong bg-surface px-3 focus-within:border-ink">
              <span aria-hidden className="text-amount text-ink-muted">
                $
              </span>
              <input
                id={`${id}-amount`}
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                value={text}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.,]/g, "").slice(0, 10)
                  setTyped((x) => ({ ...x, [mode]: v }))
                  setError(null)
                }}
                aria-invalid={!!amountErr || undefined}
                aria-describedby={`${id}-split`}
                className="min-w-0 flex-1 bg-transparent font-sans text-amount text-ink tabular-nums outline-none"
                data-topup-amount
              />
            </div>
            <p id={`${id}-split`} className="text-body-sm text-ink-muted tabular-nums" data-topup-split aria-live="polite">
              {amountErr ??
                (amount > 0n
                  ? mode === "each"
                    ? t("topup.split.each", { total: formatUsd(amount * BigInt(n), "whole"), n })
                    : t("topup.split.total", { part: formatUsd(part, "whole"), n })
                  : null)}
            </p>
          </div>
          <p className="text-body-sm text-ink-muted">{t("topup.everyone")}</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-reason`} className="text-label text-ink">
            {t("topup.reason.label")}
          </label>
          <input
            id={`${id}-reason`}
            value={reason}
            maxLength={TOPUP_REASON_MAX + 20}
            enterKeyHint="send"
            autoComplete="off"
            placeholder={t("topup.reason.placeholder")}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={`${id}-reason-count`}
            aria-invalid={reasonBad || undefined}
            className="h-12 rounded-md border border-line-strong bg-surface px-3 text-body text-ink outline-none placeholder:text-ink-muted focus:border-ink"
            data-topup-reason
          />
          <p id={`${id}-reason-count`} className="text-right text-body-sm text-ink-muted tabular-nums">
            {t("topup.reason.count", { n: len, max: TOPUP_REASON_MAX })}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label text-ink">{t("topup.due.label")}</legend>
          <div role="radiogroup" aria-label={t("topup.due.label")} className="flex flex-wrap gap-2">
            {TOPUP_DUE_DAYS.map((d) => (
              <Chip key={d} role="radio" selected={days === d} onClick={() => setDays(d)} className="rounded-pill">
                {t(`topup.due.${d}` as "topup.due.7")}
              </Chip>
            ))}
          </div>
          {now > 0 && (
            <p className="text-body-sm text-ink-muted" data-topup-due>
              {t("topup.due.date", { date: formatDate(dueIn(days, now)) })}
            </p>
          )}
        </fieldset>

        <p className="rounded-md bg-surface-sunken p-3 text-body-sm text-ink-muted">{t("topup.notify")}</p>
      </form>
    </Sheet>
  )
}
