// Related pages (page-plan "Structure" 8): the other registered use-case pages (lib/marketing/pages.ts `useCase`,
// so a page that isn't built yet is never linked), then the home page and the /demo tour, with descriptive anchor
// text. Plain links without prefetch (no RSC payloads on first load). Ends with the page's "Last updated" date.
// The trip cost calculator is registered with a `useCase` (and a "Free tool" tag), so every page lists it, last.
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { t } from "@/i18n/t"
import { useCasePages, type MarketingPath } from "@/lib/marketing/pages"
import { LastUpdated } from "./LastUpdated"

export interface RelatedLink {
  href: string
  label: string
  body: string
  /** a small label above the link ("Free tool") */
  tag?: string
}

export function RelatedLinks({ current, extra = [] }: { current: MarketingPath; extra?: readonly RelatedLink[] }) {
  const links: RelatedLink[] = [
    ...useCasePages()
      .filter((p) => p.path !== current)
      .map((p) => ({
        href: p.path,
        label: t(p.useCase.labelKey),
        body: t(p.useCase.bodyKey),
        ...(p.useCase.tagKey ? { tag: t(p.useCase.tagKey) } : {}),
      })),
    ...extra,
    { href: "/", label: t("uc.common.related.home.label"), body: t("uc.common.related.home.body") },
    { href: "/demo", label: t("uc.common.related.demo.label"), body: t("uc.common.related.demo.body") },
  ]
  return (
    <Section id="related" labelledBy="related-title">
      <SectionHead id="related-title" eyebrow={t("uc.common.related.eyebrow")} title={t("uc.common.related.title")} />
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-6" data-related>
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              prefetch={false}
              className="l-nudge group flex h-full min-h-11 items-start gap-3 rounded-lg bg-surface p-4 shadow-card transition-[background-color] duration-120 hover:bg-surface-sunken md:p-6"
            >
              <span className="min-w-0 flex-1">
                {l.tag ? <span className="mb-1 block text-body-sm text-ink-muted">{l.tag}</span> : null}
                <span className="block text-label text-ink underline-offset-4 group-hover:underline">{l.label}</span>
                <span className="mt-1 block text-body-sm text-ink-muted">{l.body}</span>
              </span>
              <ArrowRight aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" strokeWidth={2} />
            </Link>
          </li>
        ))}
      </ul>
      <LastUpdated path={current} className="mt-8" />
    </Section>
  )
}
