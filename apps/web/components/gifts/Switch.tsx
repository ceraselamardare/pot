"use client"
// A labelled on/off switch row (the Rules sheet's "Trust grows" pattern): role=switch, 44 px target, ink when on
// (never marigold), the label and its hint wired with aria-labelledby / aria-describedby.
import { useId, type ReactNode } from "react"
import { cn } from "@/lib/client/cn"

export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
  busy,
  className,
  ...data
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: ReactNode
  disabled?: boolean
  busy?: boolean
  className?: string
} & { [k: `data-${string}`]: string | boolean | undefined }) {
  const id = useId()
  return (
    <div className={cn("flex items-start gap-3", className)} {...data}>
      <div className="min-w-0 flex-1 pt-2">
        <p id={`${id}-l`} className="text-label text-ink">
          {label}
        </p>
        {hint && (
          <p id={`${id}-h`} className="mt-0.5 text-body-sm text-ink-muted">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={hint ? `${id}-h` : undefined}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className="grid h-11 w-14 shrink-0 place-items-center disabled:opacity-60"
      >
        <span className={cn("relative h-7 w-12 rounded-pill transition-colors duration-200", checked ? "bg-ink" : "bg-line-strong")}>
          <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-pill bg-surface shadow transition-transform duration-200 motion-reduce:transition-none", checked && "translate-x-5")} />
        </span>
      </button>
    </div>
  )
}
