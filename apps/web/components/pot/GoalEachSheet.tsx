"use client"
// Settings → People → "Suggested amount": the group's "about $X each" (Create's optional aim). Saved with the Pot on
// our server, so every member sees the same rings in the hero (components/pot/EachStrip); any member can change or
// remove it. Off chain and members only; no vote (it's an aim, not a rule: nobody is charged).
import { useId, useState } from "react"
import { toast } from "sonner"
import { Sheet } from "@/components/sheets/Sheet"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { setGoalEach } from "@/lib/client/actions"
import { announce } from "@/lib/client/browser"
import { formatUsd, parseKeypad, toKeypad, type Micro } from "@/lib/client/money"

const MIN: Micro = 1_000_000n
const MAX: Micro = 100_000_000_000n
const parseAmount = (s: string): Micro => parseKeypad(s.replace(/[,\s$]/g, ""))

export function GoalEachSheet({ open, onClose, slug, each }: { open: boolean; onClose: () => void; slug: string; each: Micro | null }) {
  const id = useId()
  const [text, setText] = useState(each ? toKeypad(each) : "")
  const [busy, setBusy] = useState(false)
  const amount = parseAmount(text)
  const invalid = text !== "" && (amount < MIN || amount > MAX)

  async function save(next: Micro | null) {
    setBusy(true)
    try {
      await setGoalEach(slug, next)
      const msg = next === null ? t("goal_each.removed") : t("goal_each.saved", { each: formatUsd(next, "whole") })
      announce(msg)
      toast(msg)
      onClose()
    } catch {
      toast(t("goal_each.failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("goal_each.title")}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            variant="secondary"
            disabled={busy || amount === 0n || invalid}
            onClick={() => void save(amount)}
            data-goal-each-save
          >
            {t("goal_each.save")}
          </Button>
          {each !== null && (
            <Button className="w-full" variant="ghost" disabled={busy} onClick={() => void save(null)} data-goal-each-remove>
              {t("goal_each.remove")}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-body text-ink">{t("goal_each.body")}</p>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-amount`} className="text-label text-ink">
            {t("create.goal.amount.label")}
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
              onChange={(e) => setText(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 10))}
              aria-invalid={invalid || undefined}
              aria-describedby={`${id}-hint`}
              className="min-w-0 flex-1 bg-transparent font-sans text-amount text-ink tabular-nums outline-none"
              data-goal-each-input
            />
            <span aria-hidden className="text-body text-ink-muted">
              {t("create.goal.each.after")}
            </span>
          </div>
          <p id={`${id}-hint`} className="text-body-sm text-ink-muted" aria-live="polite">
            {invalid ? t("goal_each.invalid") : t("goal_each.who")}
          </p>
        </div>
      </div>
    </Sheet>
  )
}
