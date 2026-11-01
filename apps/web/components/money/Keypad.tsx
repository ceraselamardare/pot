"use client"
// AmountKeypad (ux-spec §3, design-direction 01 §4): amounts never open the OS keyboard. 3 × 4 keys, 56 px tall,
// on surface-sunken; digits in Gabarito; keys labelled "1"…"9", "decimal point", "delete". Physical keys work
// on desktop (digits, ".", Backspace, Enter) while no text field has focus. The display is role="status"
// and shrinks past 7 characters.
import { Delete } from "lucide-react"
import { useEffect, useRef } from "react"
import { t } from "@/i18n/t"
import { keypadDisplay, keypadPress } from "@/lib/client/money"
import { cn } from "@/lib/client/cn"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const

export function Keypad({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  disabled?: boolean
}) {
  const latest = useRef({ value, onChange, onSubmit, disabled })
  useEffect(() => {
    latest.current = { value, onChange, onSubmit, disabled }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const l = latest.current
      if (l.disabled) return
      let key: string | null = null
      if (/^\d$/.test(e.key)) key = e.key
      else if (e.key === "." || e.key === ",") key = "."
      else if (e.key === "Backspace") key = "del"
      else if (e.key === "Enter" && l.onSubmit && (el?.tagName !== "BUTTON")) {
        e.preventDefault()
        l.onSubmit()
        return
      }
      if (key) {
        e.preventDefault()
        l.onChange(keypadPress(l.value, key))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="pot-touch grid grid-cols-3 gap-2" data-keypad>
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          aria-label={k === "del" ? t("a11y.key.delete") : k === "." ? t("a11y.key.decimal") : k}
          onClick={() => onChange(keypadPress(value, k))}
          className="grid h-14 place-items-center rounded-md bg-surface-sunken font-display text-title text-ink transition-[background-color,transform] duration-120 ease-standard hover:bg-line active:scale-[.97] active:bg-line disabled:opacity-50 motion-reduce:active:scale-100"
        >
          {k === "del" ? <Delete aria-hidden className="size-6" strokeWidth={2} /> : k}
        </button>
      ))}
    </div>
  )
}

export function AmountDisplay({ value, label, className }: { value: string; label: string; className?: string }) {
  const shown = keypadDisplay(value)
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <p className="text-body-sm text-ink-muted" id="amount-label">
        {label}
      </p>
      <p
        role="status"
        aria-live="polite"
        aria-labelledby="amount-label"
        data-money
        data-amount-display
        className={cn(
          "font-display tabular-nums",
          shown.length > 7 ? "text-title" : "text-balance-hero max-xs:text-[2.25rem]",
          value ? "text-ink" : "text-ink-muted",
        )}
      >
        {shown}
      </p>
    </div>
  )
}
