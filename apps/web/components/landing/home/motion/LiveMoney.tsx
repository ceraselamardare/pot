"use client"
// Landing motion toolkit: an amount driven by state that rolls to each new value (ux-spec §7.6 duration-count:
// 500 ms, ease-standard), e.g. the playground's balance. React always renders the final value (MoneyText, so SSR and
// tests see it); a layout effect rewrites only the text node frame by frame, before paint, so nothing re-renders
// during the roll. `roll={false}` (e.g. "Start over") and reduced motion swap the number instantly. A new value
// mid-roll continues from what is on screen.
import { useLayoutEffect, useRef, type RefObject } from "react"
import { MoneyText, type MoneyVariant } from "@/components/money/MoneyText"
import { prefersReducedMotion } from "@/lib/client/browser"
import type { Micro, MoneyStyle } from "@/lib/client/money"
import { amountWriter, moneyString, rollMoney, ROLL_MS, type MoneyFormat } from "./roll"

/** Rolls the amount rendered inside `ref` whenever `micro` changes (and `roll` is on). */
export function useMoneyRoll(
  ref: RefObject<Element | null>,
  micro: Micro,
  {
    roll = true,
    format = "fixed",
    ms = ROLL_MS,
    ghost = null,
  }: { roll?: boolean; format?: MoneyFormat; ms?: number; ghost?: "start" | "end" | null } = {},
) {
  const shown = useRef(micro)
  useLayoutEffect(() => {
    const el = ref.current
    const from = shown.current
    if (!el || from === micro) return
    shown.current = micro
    if (!roll || prefersReducedMotion()) return // React already rendered the new amount
    // a ghost only when the digit count changes (it keeps the final width; nothing else needs it)
    const w = amountWriter(el, { ghost: moneyString(from, format).length !== moneyString(micro, format).length ? ghost : null })
    if (!w) return
    shown.current = from
    const r = rollMoney(w, from, micro, { ms, format, onFrame: (m) => (shown.current = m), onEnd: () => w.release() })
    // a newer value takes over from what is on screen (shown.current); React has already written the new text
    return () => {
      r.stop(false)
      w.release()
    }
  }, [ref, micro, roll, format, ms, ghost])
}

export function LiveMoney({
  micro,
  roll = true,
  ghost = null,
  variant,
  style,
  sign,
  className,
}: {
  micro: Micro
  /** false: swap instantly (a reset); reduced motion always swaps instantly */
  roll?: boolean
  /** keep the final width while rolling across a digit-count change, aligned to its start or end; only needed when
   *  something after the amount would move (a left-aligned amount at the end of its row doesn't need it) */
  ghost?: "start" | "end" | null
  variant?: MoneyVariant
  style?: MoneyStyle
  sign?: "in" | "out"
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useMoneyRoll(ref, micro, { roll, ghost, format: sign ?? style ?? "fixed" })
  return (
    <span ref={ref} data-live-money className="relative inline-block">
      <MoneyText micro={micro} variant={variant} style={style} sign={sign} className={className} />
    </span>
  )
}
