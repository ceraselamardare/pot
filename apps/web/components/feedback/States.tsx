// Empty states, skeletons, callouts and step lists (design-direction 01/02 "shared parts").
// One empty-state pattern everywhere: the glyph (or typing dots), one heading, one sentence, at most one action.
// Skeletons are surface-sunken blocks with no shimmer, shown only after 150 ms (useDelayedFlag).
"use client"
import { Check } from "lucide-react"
import type { ReactNode } from "react"
import { Glyph } from "@/components/brand/Glyph"
import { TypingDots } from "@/components/feedback/TypingDots"
import { useDelayedFlag } from "@/lib/client/browser"
import { cn } from "@/lib/client/cn"

export function EmptyState({
  title,
  body,
  visual = "glyph",
  action,
  className,
  headingLevel = 2,
}: {
  title: string
  body?: string
  visual?: "glyph" | "dots" | "check" | "none"
  action?: ReactNode
  className?: string
  headingLevel?: 1 | 2 | 3
}) {
  const H = `h${headingLevel}` as "h1" | "h2" | "h3"
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center", className)}>
      {visual === "glyph" && <Glyph className="mb-6 h-14 w-auto" />}
      {visual === "dots" && <TypingDots still size="lg" className="mb-5 text-ink-muted" />}
      {visual === "check" && (
        <span aria-hidden className="mb-5 grid size-14 place-items-center rounded-pill bg-surface-sunken text-approved">
          <Check className="size-7" strokeWidth={2.25} />
        </span>
      )}
      <H className="font-display text-heading text-balance text-ink">{title}</H>
      {body && <p className="mt-2 max-w-80 text-body text-pretty text-ink-muted">{body}</p>}
      {action && <div className="mt-6 flex w-full max-w-80 flex-col gap-3">{action}</div>}
    </div>
  )
}

export function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-sm bg-surface-sunken", className)} />
}

/** Renders its children only after 150 ms, so fast loads never flash a skeleton. */
export function Delayed({ children, ms = 150 }: { children: ReactNode; ms?: number }) {
  const on = useDelayedFlag(ms)
  return on ? <>{children}</> : null
}

export function PotSkeleton() {
  return (
    <Delayed>
      <div className="flex flex-col gap-4 px-4 pt-4 md:px-6" aria-hidden>
        <div className="flex items-center gap-3">
          <Bone className="size-8 rounded-sm" />
          <Bone className="h-7 w-40" />
        </div>
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card">
          <Bone className="h-4 w-20" />
          <Bone className="h-11 w-44" />
          <Bone className="h-4 w-56" />
          <Bone className="mt-2 h-2.5 w-full rounded-pill" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Bone className="h-13 rounded-md" />
            <Bone className="h-13 rounded-md" />
          </div>
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Bone className="size-8 rounded-pill" />
            <div className="flex flex-1 flex-col gap-2">
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </Delayed>
  )
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Delayed>
      <div className="flex flex-col gap-3" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Bone className="size-11 rounded-md" />
              <Bone className="h-5 w-32" />
            </div>
            <Bone className="h-7 w-24" />
            <Bone className="h-4 w-40" />
          </div>
        ))}
      </div>
    </Delayed>
  )
}

/** A neutral callout: surface-sunken, an ink icon, body-sm ink text. The brand has no warning colour. */
export function Callout({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-md bg-surface-sunken p-3 text-body-sm text-ink", className)}>
      <span aria-hidden className="mt-0.5 shrink-0 text-ink [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export type StepState = "done" | "current" | "next" | "error"

/** One vertical stepper for every wait (design-direction principle 3). */
export function ProgressSteps({
  steps,
  label,
}: {
  steps: { label: string; state: StepState; helper?: string }[]
  label?: string
}) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {steps.map((s, i) => (
        <li key={i} aria-current={s.state === "current" ? "step" : undefined} className="flex gap-3">
          <div className="flex w-6 flex-col items-center">
            <span className="grid size-6 shrink-0 place-items-center">
              {s.state === "done" && (
                <span className="pot-pop grid size-5 place-items-center rounded-pill bg-approved text-surface">
                  <Check aria-hidden className="size-3.5" strokeWidth={3} />
                </span>
              )}
              {s.state === "current" && <TypingDots size="sm" className="text-ink" />}
              {s.state === "next" && <span className="size-3 rounded-pill border-2 border-line-strong" />}
              {s.state === "error" && <span className="size-3 rounded-pill bg-declined" />}
            </span>
            {i < steps.length - 1 && (
              <span className={cn("my-1 w-0.5 flex-1 rounded-pill", s.state === "done" ? "bg-approved" : "bg-line")} />
            )}
          </div>
          <div className={cn("pb-5", i === steps.length - 1 && "pb-0")}>
            <p className={cn(s.state === "current" ? "text-label text-ink" : s.state === "next" ? "text-body-sm text-ink-muted" : "text-body-sm text-ink-muted")}>
              {s.label}
            </p>
            {s.helper && <p className="mt-0.5 text-body-sm text-ink-muted">{s.helper}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
