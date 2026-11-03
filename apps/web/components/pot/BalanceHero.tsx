"use client"
// BalanceHero (ux-spec §3, §4.4; design-direction 02 §2): "how much is in the Pot". The number is Gabarito
// balance-hero with tabular figures, two decimals, on its own left-aligned line, counting up/down over 500 ms
// when it changes (instant under reduced motion; never animated on first paint: it's the LCP element).
// Pending money shows on its own line ("+$150 on the way") and is never added to the big number.
// Under it, the Pot's actions (components/pot/PotActions, passed in as `actions`): round buttons with a label under
// each, Add money the screen's one marigold. A closed Pot is read-only: no actions.
// "You'd get back $122 · You put in $150" is a quiet button (R-33 M-6): it opens ?sheet=refund, what you'd get back if the
// Pot closed now and how it's worked out (components/sheets/RefundSheet.tsx).
import { Clock, Info } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { MoneyText } from "@/components/money/MoneyText"
import { GoalBar } from "@/components/pot/GoalBar"
import { t } from "@/i18n/t"
import { useReducedMotion } from "@/lib/client/browser"
import { formatUsd, type Micro } from "@/lib/client/money"
import { formatDate } from "@/lib/client/time"
import { cn } from "@/lib/client/cn"

export function useCountUp(value: Micro, ms = 500): Micro {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)
  useEffect(() => {
    const from = shownRef.current
    if (from === value) return
    let raf = 0
    const start = performance.now()
    const step = (ts: number) => {
      const p = Math.min(1, (ts - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      const cur = p >= 1 ? value : from + BigInt(Math.round(Number(value - from) * eased))
      shownRef.current = cur
      setShown(cur)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return reduced ? value : shown
}

export function BalanceHero({
  balance,
  share,
  contributed,
  pendingIn,
  goal,
  collected,
  actions,
  className,
  closedAt,
  onShare,
  goalSlot,
}: {
  balance: Micro
  share: Micro
  contributed: Micro
  pendingIn: Micro
  goal: Micro | null
  collected: Micro
  /** the Pot's action row (components/pot/PotActions); not shown once the Pot is closed */
  actions?: ReactNode
  className?: string
  /** a closed Pot is read-only: "Closed Nov 12" and no money buttons (ux-spec §4.4 Closed) */
  closedAt?: number | null
  /** R-33 M-6: "You'd get back" opens the refund explainer (?sheet=refund); without it the line is plain text */
  onShare?: () => void
  /** hub 1.1.0: the goal with a date (components/wave4/GoalBanner) in place of the plain goal bar */
  goalSlot?: ReactNode
}) {
  const shown = useCountUp(balance)
  return (
    <section
      aria-label={t("pot.hero.a11y", { balance: formatUsd(balance), share: formatUsd(share, "whole") })}
      className={cn("rounded-lg bg-surface p-4 shadow-card md:p-6", className)}
      data-hero
    >
      <p className="text-body-sm text-ink-muted">{closedAt ? t("pot.closed.hero", { date: formatDate(closedAt) }) : t("pot.hero.label")}</p>
      <p className="mt-1">
        <MoneyText micro={shown} variant="hero" className="text-ink" />
      </p>
      {onShare ? (
        // the whole line is the tap target (≥ 44 px), quiet ink-muted with an info icon; the hidden words say where it goes
        <button
          type="button"
          onClick={onShare}
          aria-haspopup="dialog"
          data-hero-share
          className="-mx-1 mt-0.5 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-sm px-1 text-left text-body-sm text-ink-muted tabular-nums underline-offset-4 hover:text-ink hover:underline"
        >
          <span>{t("pot.hero.share", { share: formatUsd(share, "whole"), contributed: formatUsd(contributed, "whole") })}</span>
          <span className="sr-only"> · {t("pot.hero.share.more")}</span>
          <Info aria-hidden className="size-4 shrink-0" strokeWidth={2} />
        </button>
      ) : (
        <p className="mt-1 text-body-sm text-ink-muted">
          {t("pot.hero.share", { share: formatUsd(share, "whole"), contributed: formatUsd(contributed, "whole") })}
        </p>
      )}
      {pendingIn > 0n && (
        <p className="pot-enter mt-2 inline-flex items-center gap-1.5 text-body-sm text-ink-muted" data-pending-in>
          <Clock aria-hidden className="size-4" strokeWidth={2} />
          {t("pot.hero.pending", { amount: formatUsd(pendingIn, "whole") })}
        </p>
      )}
      {goalSlot && !closedAt ? (
        <div className="mt-4">{goalSlot}</div>
      ) : (
        goal !== null && goal > 0n && !closedAt && <GoalBar collected={collected} goal={goal} className="mt-4" />
      )}
      {closedAt ? null : actions}
    </section>
  )
}
