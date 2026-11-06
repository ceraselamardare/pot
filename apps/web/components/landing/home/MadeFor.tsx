// "Made for" (#made-for; page-plan "/"): the home page as the hub of the use-case pages, just before the final call
// to action. Built from the marketing registry (lib/marketing/pages.ts `useCase`), so a page appears here the moment
// it's registered and there is never a link to a page that doesn't exist; with none registered the section is gone.
// Each card is one link whose text is descriptive ("Collect money for a group trip"), then one line; the calculator
// carries a "Free tool" tag above its link. Calm like
// Features: hairline-ruled cells on `ground`, no stickers, no marigold, no motion, no prefetch.
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { t } from "@/i18n/t"
import { useCasePages } from "@/lib/marketing/pages"
import { Section, SectionHead } from "./Section"

export function MadeFor() {
  const pages = useCasePages()
  if (pages.length === 0) return null
  return (
    <Section id="made-for" labelledBy="made-for-title">
      <SectionHead id="made-for-title" eyebrow={t("home.madefor.eyebrow")} title={t("home.madefor.title")} />
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-6" data-made-for>
        {pages.map((p) => (
          <li key={p.path}>
            <Link
              href={p.path}
              prefetch={false}
              className="group flex h-full min-h-11 items-start gap-3 rounded-lg bg-surface p-4 shadow-card transition-[background-color] duration-120 hover:bg-surface-sunken md:p-6"
            >
              <span className="min-w-0 flex-1">
                {p.useCase.tagKey ? <span className="mb-1 block text-body-sm text-ink-muted">{t(p.useCase.tagKey)}</span> : null}
                <span className="block font-display text-heading text-ink underline-offset-4 group-hover:underline">{t(p.useCase.labelKey)}</span>
                <span className="mt-1 block text-body-sm text-ink-muted">{t(p.useCase.bodyKey)}</span>
              </span>
              <ArrowRight aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}
