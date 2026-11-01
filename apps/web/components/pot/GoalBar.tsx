// GoalBar (ux-spec §3, brand README §3 rule 3): `brand` fill on a `brand-soft` track, rounded-pill. The fill is
// only 1.5:1 against its track in Day, so it gets a 1 px `brand-deep` edge (design-direction fix) and ALWAYS
// ships with its text twin ("$300 of $450 collected"); the bar itself is decorative.
import { t } from "@/i18n/t"
import { formatUsd, type Micro } from "@/lib/client/money"
import { cn } from "@/lib/client/cn"

export function GoalBar({
  collected,
  goal,
  className,
  size = "md",
  text,
}: {
  collected: Micro
  goal: Micro
  className?: string
  size?: "sm" | "md"
  /** the text twin, when it says more than "$300 of $450 collected" (hub 1.1.0: "$300 of $1,200 · 3 days left") */
  text?: string
}) {
  const pct = goal > 0n ? Math.min(100, Number((collected * 10_000n) / goal) / 100) : 0
  return (
    <div className={cn("flex flex-col gap-2", className)} data-goalbar>
      <div aria-hidden className={cn("w-full overflow-hidden rounded-pill bg-brand-soft", size === "sm" ? "h-1.5" : "h-2.5")}>
        <div
          className="h-full rounded-pill bg-brand shadow-[inset_0_0_0_1px_var(--pot-brand-deep)] transition-[width] duration-500 ease-standard motion-reduce:transition-none"
          style={{ width: `${pct}%`, minWidth: pct > 0 ? "0.625rem" : 0 }}
        />
      </div>
      <p className="text-body-sm text-ink-muted tabular-nums" data-goal-text>
        {text ?? t("pot.goal", { collected: formatUsd(collected, "whole"), goal: formatUsd(goal, "whole") })}
      </p>
    </div>
  )
}
