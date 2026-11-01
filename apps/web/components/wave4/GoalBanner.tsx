"use client"
// The goal with a date (hub 1.1.0 extras.goal + get_goal): one banner per state, always icon + words.
//  - collecting: the goal bar with "$300 of $1,200 · 3 days left"; an all-or-nothing goal adds "Spending opens once
//    the goal is reached." and the promise ("…everyone gets their money back automatically");
//  - reached: a calm check, "Goal reached", "$1,200 collected. Spending is open." (no burst: one celebration only);
//  - missed (date passed): an all-or-nothing goal goes "Refunding everyone…" (our server does it within the day) →
//    "Everyone got their money back"; a soft goal just says the date passed.
// The state a view read before the date stays "collecting" until the next read; past the date we show what the
// hub will say (refundable / missed) so the countdown never sits at "0 days left".
import { Check, Clock, Lock, Undo2 } from "lucide-react"
import { GoalBar } from "@/components/pot/GoalBar"
import { TypingDots } from "@/components/feedback/TypingDots"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"
import type { GoalStateVM, GoalVM } from "@/lib/client/mock/types"
import { formatUsd } from "@/lib/client/money"
import { formatDate } from "@/lib/client/time"

/** "3 days left", "5 hours left", "Less than an hour left". */
export function timeLeft(deadline: number, now: number): string {
  const d = deadline - now
  if (d >= 86_400_000) return t("goal.left.days", { n: Math.floor(d / 86_400_000) })
  if (d >= 3_600_000) return t("goal.left.hours", { n: Math.floor(d / 3_600_000) })
  return t("goal.left.soon")
}

/** The state to show now (a "collecting" read past its date is what the hub will call missed / refundable). */
export function shownGoalState(g: Pick<GoalVM, "state" | "deadline" | "allOrNothing">, now: number): GoalStateVM {
  if (g.state === "collecting" && now >= g.deadline) return g.allOrNothing ? "refundable" : "missed"
  return g.state
}

export function GoalBanner({ goal, potName, now, className }: { goal: GoalVM; potName: string; now: number; className?: string }) {
  const state = shownGoalState(goal, now)
  const amount = formatUsd(goal.amount, "whole")
  const collected = formatUsd(goal.totalIn, "whole")
  const date = formatDate(goal.deadline)
  if (state === "collecting")
    return (
      <div className={cn("flex flex-col gap-2", className)} data-goal-banner="collecting">
        <GoalBar collected={goal.totalIn} goal={goal.amount} text={`${t("goal.progress", { collected, goal: amount })} · ${timeLeft(goal.deadline, now)}`} />
        {goal.allOrNothing ? (
          <>
            <p className="flex items-start gap-2 text-body-sm text-ink" data-goal-spends-paused>
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={2} />
              {t("goal.spends_paused")}
            </p>
            <p className="text-body-sm text-ink-muted">{t("goal.aon.note", { goal: amount, date })}</p>
          </>
        ) : (
          <p className="text-body-sm text-ink-muted">{t("goal.soft.note", { date })}</p>
        )}
      </div>
    )
  const line = (icon: React.ReactNode, title: React.ReactNode, body: string | null, tone: "sunken" | "plain" = "sunken") => (
    <div className={cn("flex items-start gap-3 rounded-md p-3", tone === "sunken" ? "bg-surface-sunken" : "bg-surface", className)} data-goal-banner={state} role="status">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-label text-ink">{title}</p>
        {body && <p className="mt-0.5 text-body-sm text-ink-muted tabular-nums">{body}</p>}
      </div>
    </div>
  )
  switch (state) {
    case "reached":
      return line(<Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />, t("goal.reached.title"), goal.allOrNothing ? t("goal.reached.body", { goal: amount }) : t("goal.reached.soft", { goal: amount }))
    case "refundable":
    case "refunding":
      return line(
        <Undo2 aria-hidden className="size-5 text-waiting" strokeWidth={2.25} />,
        <span className="inline-flex items-center gap-2">
          {t("goal.refunding.title")}
          <TypingDots size="sm" className="text-ink-muted" />
        </span>,
        t("goal.refunding.body", { potName, goal: amount, date }),
      )
    case "refunded":
      return line(<Check aria-hidden className="size-5 text-approved" strokeWidth={2.5} />, t("goal.refunded.title"), t("goal.refunded.body", { potName, goal: amount, date }), "plain")
    default:
      return line(<Clock aria-hidden className="size-5 text-ink-muted" strokeWidth={2.25} />, t("goal.missed.title"), t("goal.missed.body", { collected, goal: amount }))
  }
}
