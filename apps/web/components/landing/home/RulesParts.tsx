"use client"
// The playground's own parts ("Try the rules", design-direction 04 §4 + the micro-interaction catalogue). They are
// landing-only twins of app pieces, so the app's Controls.tsx stays as it is:
//  - RulesChip: a reason chip whose check SLOT opens (grid-template-columns 0fr → 1fr, 200 ms), so the chip grows
//    and its neighbours glide instead of jumping 22 px; the check itself pops on the spring. Below a 23rem row the
//    emoji hide and the sides tighten, so the three chips fit one row from 360 px (the emoji stay in the result).
//  - RulesSegmented: the amount radios with ONE sliding `surface` thumb (translate, 280 ms ease-standard, like the
//    app's TabList); labels cross to ink over 200 ms; arrow keys move it the same way.
//  - Layers: states stacked in ONE grid cell, so the cell always has the tallest state's height and a swap never
//    changes the layout (the inactive ones are invisible, aria-hidden and inert); the active one fades in.
//  - useGlide: when a box's natural height changes after a commit, it animates from the old height to the new one
//    (280 ms ease-standard, interruptible). Only the visitor's own taps change these heights (CLS ignores shifts
//    within 500 ms of an input); timer-driven states never do, because Layers reserve them up front.
// Reduced motion: no slide, no pop, no glide; colours and text change instantly (play.css guards).
import { Check } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { prefersReducedMotion } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"

/** "Groceries 🛒" → ["Groceries ", "🛒"]: the trailing emoji (with its variation selector / joiners), if any. */
export function splitEmoji(label: string): [string, string] {
  const m = /^(.*?\s)(\p{Extended_Pictographic}[\p{Extended_Pictographic}\uFE0F\u200D]*)$/u.exec(label)
  return m ? [m[1]!, m[2]!] : [label, ""]
}

export function RulesChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  const [word, emoji] = splitEmoji(children)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-on={selected}
      className={cn(
        // a narrow row (< 23rem: the emoji are hidden there too) takes 12 px sides, so three chips fit 296 px (360)
        "play-chip pot-touch inline-flex h-12 shrink-0 items-center rounded-sm border px-3.5 font-sans text-label whitespace-nowrap text-ink @max-[23rem]/play-chips:px-3",
        // press .97: in 120 ms, out 200 ms; colours in 120 ms (as buttonVariants)
        "transition-[background-color,border-color,scale] [--tw-duration:120ms,120ms,200ms] ease-standard active:scale-[.97] active:duration-120 motion-reduce:active:scale-100",
        "disabled:cursor-not-allowed disabled:active:scale-100",
        selected ? "border-brand-deep bg-brand-soft" : "border-line-strong bg-surface hover:bg-surface-sunken disabled:hover:bg-surface",
      )}
    >
      {/* the check's slot: 0 wide when off, 22 px (16 + the 6 px gap) when on */}
      <span aria-hidden className="play-chip-slot grid">
        <span className="min-w-0 overflow-hidden">
          <Check className="play-chip-check mr-1.5 size-4" strokeWidth={2.5} />
        </span>
      </span>
      <span>
        {word}
        {emoji && <span className="play-chip-emoji">{emoji}</span>}
      </span>
    </button>
  )
}

export function RulesSegmented<T extends string>({
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
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!d) return
    e.preventDefault()
    const j = (i + d + options.length) % options.length
    onChange(options[j]!.value)
    refs.current[j]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={cn("play-seg relative flex rounded-pill bg-surface-sunken p-1", className)}>
      {/* the one thumb: slides under the selected label (transform only) */}
      <span
        aria-hidden
        data-seg-thumb
        className="play-seg-thumb absolute top-1 bottom-1 left-1 rounded-pill bg-surface"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, translate: `${index * 100}% 0` }}
      />
      {options.map((o, i) => {
        const on = i === index
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
              "pot-touch relative z-10 min-h-11 min-w-0 flex-1 rounded-pill px-2 font-sans text-label [font-size:min(var(--text-label),4.1vw)]",
              "transition-[color,scale] duration-200 ease-standard active:scale-[.97] active:duration-120 motion-reduce:active:scale-100",
              "disabled:cursor-not-allowed disabled:active:scale-100",
              on ? "text-ink" : "text-ink-muted hover:text-ink disabled:hover:text-ink-muted",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** One state of a Layers stack. */
export interface Layer {
  id: string
  node: ReactNode
  className?: string
  /** it mounts with a tap (not in the server HTML): fade it in when it mounts active */
  enter?: boolean
}

/** States stacked in one grid cell: the cell keeps the tallest one's size, so swapping never moves the layout. */
export function Layers({ on, layers, className }: { on: string | null; layers: Layer[]; className?: string }) {
  return (
    <div className={cn("play-layers", className)}>
      {layers.map((l) => {
        const active = l.id === on
        return (
          <div
            key={l.id}
            data-layer={l.id}
            data-on={active}
            aria-hidden={active ? undefined : true}
            inert={!active}
            className={cn("min-w-0", l.enter && "play-in", l.className)}
          >
            {l.node}
          </div>
        )
      })}
    </div>
  )
}

const EASE_STANDARD = "cubic-bezier(0.2, 0, 0, 1)"

/**
 * Animates `ref`'s height whenever a commit (any change of `dep`) changes its natural height: from the height it had
 * (mid-glide: the height on screen) to the new one, over `ms`, clipping its content meanwhile. Never under reduced
 * motion. The resting height is tracked with a ResizeObserver, so a resize or a font swap never starts a glide.
 */
export function useGlide(ref: RefObject<HTMLElement | null>, dep: unknown, ms = 280) {
  const rest = useRef<number | null>(null)
  const anim = useRef<Animation | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (!anim.current) rest.current = el.getBoundingClientRect().height
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const running = anim.current
    const from = running ? el.getBoundingClientRect().height : rest.current
    anim.current = null
    running?.cancel()
    const to = el.getBoundingClientRect().height
    rest.current = to
    if (from === null || Math.abs(from - to) < 1 || typeof el.animate !== "function" || prefersReducedMotion()) {
      el.style.removeProperty("overflow")
      return
    }
    el.style.overflow = "clip"
    const a = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: ms, easing: EASE_STANDARD })
    anim.current = a
    const end = () => {
      if (anim.current !== a) return
      anim.current = null
      el.style.removeProperty("overflow")
      rest.current = el.getBoundingClientRect().height
    }
    a.addEventListener("finish", end)
    a.addEventListener("cancel", end)
  }, [ref, dep, ms])
}
