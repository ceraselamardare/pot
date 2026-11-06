// The visible FAQ (page-plan "Structure" 7). The same `items` feed the page's FAQPage JSON-LD
// (lib/marketing/schema.ts faqPage), so the markup always mirrors what's on the page. Every answer is open: no
// accordions (answer engines may skip hidden text). Each question is an H3; each answer a standalone 1-3 sentence
// paragraph that still makes sense when quoted alone. Build items with faqItem() so a composed answer (an extra
// shared sentence) is the same string in both places. An item may carry a `link` (a
// related page, such as the trip cost calculator): it shows under the answer and stays out of the JSON-LD.
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { Section, SectionHead } from "@/components/landing/home/Section"
import { t } from "@/i18n/t"

export interface FaqItem {
  id: string
  question: string
  answer: string
  /** a page that answers it in more depth, shown under the answer (not part of the FAQPage JSON-LD) */
  link?: { href: string; label: string }
}

/** One FAQ entry; `more` sentences are appended to the answer with a space. */
export function faqItem(id: string, question: string, answer: string, ...more: string[]): FaqItem {
  return { id, question, answer: [answer, ...more].join(" ") }
}

export function Faq({ title, items, eyebrow = t("uc.common.faq.eyebrow") }: { title: string; items: readonly FaqItem[]; eyebrow?: string }) {
  return (
    <Section id="faq" labelledBy="faq-title">
      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
        <SectionHead id="faq-title" eyebrow={eyebrow} title={title} className="lg:col-span-4" />
        <div className="border-b border-line lg:col-span-8" data-faq>
          {items.map((q) => (
            <div key={q.id} data-faq-item={q.id} className="border-t border-line py-4 md:py-5">
              <h3 className="font-display text-heading text-ink">{q.question}</h3>
              <p className="mt-2 max-w-[40rem] text-body text-ink-muted">{q.answer}</p>
              {q.link ? (
                <Link
                  href={q.link.href}
                  prefetch={false}
                  className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-label text-link underline-offset-4 hover:underline"
                >
                  {q.link.label}
                  <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
