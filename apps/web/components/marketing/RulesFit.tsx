// "Rules that fit this" (page-plan "Structure" 5): recommended settings for the use case and why. Each card: a
// Lucide icon (stroke 2, never a check, padlock, coin or piggy bank), the situation as an H3, the rule as the app
// writes rules (a sentence, with its numbers computed from the app's defaults), and the reason.
// Phones: stacked cards. lg: one row (up to three).
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/client/cn"

export interface RuleFit {
  id: string
  Icon: LucideIcon
  title: string
  /** the rule, as a sentence ("Anyone can spend up to $100 at a time without asking.") */
  rule: string
  body: string
}

export function RulesFit({ items, className }: { items: readonly RuleFit[]; className?: string }) {
  return (
    <ul className={cn("grid gap-3 lg:grid-cols-3 lg:gap-6", className)} data-rules-fit>
      {items.map(({ id, Icon, title, rule, body }) => (
        <li key={id} data-rule-fit={id} className="flex flex-col rounded-lg bg-surface p-4 shadow-card md:p-6">
          <span className="grid size-10 place-items-center rounded-pill bg-surface-sunken">
            <Icon aria-hidden className="size-5 text-ink" strokeWidth={2} />
          </span>
          <h3 className="mt-4 font-display text-heading text-ink">{title}</h3>
          <p className="mt-3 rounded-md bg-surface-sunken px-3 py-2.5 text-body text-ink tabular-nums">{rule}</p>
          <p className="mt-3 text-body-sm text-ink-muted">{body}</p>
        </li>
      ))}
    </ul>
  )
}
