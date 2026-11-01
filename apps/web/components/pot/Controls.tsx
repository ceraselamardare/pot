"use client"
// Small brand controls: selectable chips (aria-pressed; selected = brand-soft + brand-deep edge + check, never
// marigold), a segmented radio group (rounded-pill track on surface-sunken, selected segment = surface), and
// the tablist used by the Pot's Activity / Members / Rules.
import { Check } from "lucide-react"
import { useRef, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "@/lib/client/cn"

export function Chip({
  selected,
  onClick,
  children,
  className,
  role,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  role?: "radio"
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role ? undefined : selected}
      aria-checked={role ? selected : undefined}
      onClick={onClick}
      className={cn(
        "pot-touch inline-flex h-12 shrink-0 items-center gap-1.5 rounded-sm border px-3.5 font-sans text-label whitespace-nowrap transition-[background-color,border-color,scale] duration-120 ease-standard active:scale-[.97] motion-reduce:active:scale-100",
        selected ? "border-brand-deep bg-brand-soft text-ink" : "border-line-strong bg-surface text-ink hover:bg-surface-sunken",
        className,
      )}
    >
      {selected && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!d) return
    e.preventDefault()
    const j = (i + d + options.length) % options.length
    onChange(options[j]!.value)
    refs.current[j]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-pill bg-surface-sunken p-1", className)}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-pill px-2 font-sans text-label [font-size:min(var(--text-label),4.1vw)] transition-[background-color,color,box-shadow] duration-200 ease-standard",
              on ? "bg-surface text-ink shadow-[0_1px_2px_rgb(43_27_58/0.12)]" : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function TabList<T extends string>({
  value,
  tabs,
  onChange,
  label,
  idBase,
  panelBase = idBase,
  className,
}: {
  value: T
  /** `badge`: an optional mark after the label (the /demo explainer's "new" dot) */
  tabs: { value: T; label: string; badge?: ReactNode }[]
  onChange: (v: T) => void
  label: string
  idBase: string
  /** id prefix of the tab panels (aria-controls), when two tablists share the same panels */
  panelBase?: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, tabs.findIndex((x) => x.value === value))
  const onKey = (e: KeyboardEvent, i: number) => {
    let j = i
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length
    else if (e.key === "Home") j = 0
    else if (e.key === "End") j = tabs.length - 1
    else return
    e.preventDefault()
    onChange(tabs[j]!.value)
    refs.current[j]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className={cn("relative flex rounded-pill bg-surface-sunken p-1", className)}>
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-pill bg-surface shadow-[0_1px_2px_rgb(43_27_58/0.12)] transition-transform duration-[280ms] ease-standard motion-reduce:transition-none"
        style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {tabs.map((tab, i) => {
        const on = i === index
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            id={`${idBase}-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${panelBase}-panel-${tab.value}`}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(tab.value)}
            className={cn(
              // the label caps at the viewport so three tabs fit one line at 200 % text (F-25)
              "relative z-10 h-11 min-w-0 flex-1 truncate rounded-pill px-2 font-sans text-label [font-size:min(var(--text-label),4.1vw)] transition-[color,background-color] duration-200",
              on ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
            {tab.badge}
          </button>
        )
      })}
    </div>
  )
}
