// "How to do it with Pot" (page-plan "Structure" 3): 3-5 numbered steps, real and specific, with an optional
// page-specific aside (a chat, a card) beside them from lg. An <ol>; each heading reads "Step 2: …" to screen
// readers and anything that reads the HTML (the visible numeral is drawn by CSS from data-n, so it never doubles up).
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

export interface Step {
  title: string
  body: string
}

export function Steps({ steps, aside, className }: { steps: readonly Step[]; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("lg:grid lg:grid-cols-12 lg:items-start lg:gap-8", className)}>
      <ol className={cn("border-b border-line", aside ? "lg:col-span-7" : "lg:col-span-12")} data-steps>
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 border-t border-line py-4 md:py-5">
            <span
              aria-hidden
              data-n={i + 1}
              className="grid size-8 shrink-0 place-items-center rounded-pill bg-surface-sunken text-label text-ink tabular-nums before:content-[attr(data-n)]"
            />
            <div className="min-w-0 pt-1">
              <h3 className="font-display text-heading text-ink">
                <span className="sr-only">{t("home.how.step", { n: i + 1 })} </span>
                {s.title}
              </h3>
              <p className="mt-1 max-w-flow text-body text-ink-muted lg:max-w-none">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {aside ? <div className="mt-8 lg:sticky lg:top-24 lg:col-span-5 lg:mt-0">{aside}</div> : null}
    </div>
  )
}
