// A use-case page's hero (page-plan "Structure" 1): eyebrow, the page's one H1 (the primary query, said naturally),
// an answer-first subhead (the one or two sentences an answer engine quotes), the page's ONLY marigold button
// [Start a Pot] (a <SignInLink>: /pots?sheet=create without JS, the sign-in dialog with it), a secondary
// [See how it works] to the /demo tour (no prefetch: its payload is heavy), the honest one-line note, and a slot
// for the page's own visual (built from the landing mock kit; one role="img", everything inside inert).
// Phones: copy, buttons, then the visual. lg: copy in 6 of 12 columns, the visual in the other 6.
// The H1 is the LCP element: nothing in the copy column moves.
import Link from "next/link"
import { SignInLink } from "@/components/features/auth/SignInLink"
import { buttonVariants } from "@/components/ui/button"
import { t } from "@/i18n/t"
import { cn } from "@/lib/client/cn"

/** stacked on the narrowest phones, side by side from 360 px, auto width from sm */
const CTA = "w-full xs:w-auto xs:flex-1 sm:min-w-44 sm:flex-none"

export function UseCaseHero({
  eyebrow,
  title,
  subhead,
  note = t("uc.common.hero.note"),
  visual,
}: {
  eyebrow: string
  /** the H1 */
  title: string
  /** the answer-first paragraph */
  subhead: string
  /** the short honest line under the buttons (default: no app · free in preview · test money) */
  note?: string | null
  /** the page's own picture (a role="img" with its own label) */
  visual: React.ReactNode
}) {
  // "a · b · c" → items, so a line wraps only between them
  const notes = note ? note.split(" · ") : []
  return (
    <section aria-labelledby="uc-hero-title" className="overflow-x-clip" data-marketing-hero>
      <div className="mx-auto w-full max-w-app px-4 pt-6 md:px-6 md:pt-12 lg:grid lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-12">
        <div className="lg:col-span-6">
          <p className="text-label text-ink-muted">{eyebrow}</p>
          <h1
            id="uc-hero-title"
            className="mt-2 max-w-[14em] font-display text-[2.25rem] leading-10 font-extrabold tracking-[-0.02em] text-balance text-ink md:text-balance-hero"
          >
            {title}
          </h1>
          <p className="mt-4 max-w-flow text-body text-pretty text-ink-muted lg:max-w-[30rem]">{subhead}</p>

          <div className="mt-6 flex flex-col gap-3 xs:flex-row">
            <SignInLink source="hero" className={cn(buttonVariants({ variant: "primary" }), CTA)}>
              {t("home.cta.start")}
            </SignInLink>
            <Link href="/demo" prefetch={false} className={cn(buttonVariants({ size: "lg" }), CTA)}>
              {t("uc.common.cta.demo")}
            </Link>
          </div>

          {notes.length ? (
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
              {notes.map((n) => (
                <li key={n} className="whitespace-nowrap">
                  {n}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-8 lg:col-span-6 lg:mt-0">{visual}</div>
      </div>
    </section>
  )
}
