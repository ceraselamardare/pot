// The marketing template: the parts every use-case page (/group-trip, /bachelorette-party, /group-gift,
// /shared-account-with-friends) and the calculator are built from. All server components, all copy through t().
//
// How to add a page (page-plan.md "Global rules"; /group-trip is the worked reference):
//  1. Register it in lib/marketing/pages.ts (path, lastModified, title/description keys, llms, and `useCase` for the
//     home page's "Made for" card and the related links). The sitemap, /llms.txt and the home page pick it up.
//  2. app/(marketing)/<path>/page.tsx: `export const metadata = pageMeta("/<path>")`; the (marketing) layout wraps it
//     in this shell (header without the home's anchors, <main id="main">, footer) and loads the landing CSS.
//  3. Compose it from these blocks, and give it its own scenario, visual, numbers and sections (never a noun swap):
//       <UseCaseHero eyebrow title subhead visual={<YourVisual />} />        one H1, the page's ONE marigold button
//       <Section id labelledBy><SectionHead …/> … </Section>                 (components/landing/home/Section) any block
//       <CompareTable caption wayLabel criteria ways />                       an honest comparison, no brand names
//       <Steps title steps aside={<YourAside />} />                          numbered "how to"
//       <ExampleTable caption columns rows foot />                           numbers computed in lib/marketing/<page>.ts
//       <RulesFit items />                                                   recommended settings and why
//       <Faq title items />  + faqPage({ path, items }) in the JSON-LD      the same items, so they can't drift
//       <RelatedLinks current="/<path>" />                                   registered pages only, then home and /demo
//       <UseCaseFinal title body />                                          secondary CTAs + the preview note
//     and render `<JsonLd data={graph(webPage(…), breadcrumbs(…), faqPage(…))} />` once.
//  4. Tests: e2e/mock/marketing.spec.ts (one entry per page), a11y 320 px reflow, screens public screens, csp lists.
//
// Brand: the hero's [Start a Pot] is the page's only marigold; every other button is secondary. Mock UI is inert and
// aria-hidden inside one role="img". Stickers at most 2 per viewport, never in problem or comparison blocks. CSS:
// Tailwind with tokens; anything a utility can't do goes in a stylesheet scoped under [data-marketing] (Next keeps a
// page's CSS after navigating away).
import { SiteFooter } from "@/components/landing/home/SiteFooter"
import { SiteHeader } from "@/components/landing/home/SiteHeader"

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    // data-landing: the landing's scoped CSS (line breaks, text-link press, motion toolkit) applies here too;
    // data-marketing: this template's own scope. display:contents, so the layout is exactly as without them.
    <div data-landing data-marketing className="contents">
      <SiteHeader nav={false} />
      {/* scroll margins: a skip-link jump or a keyboard focus never lands under the sticky header (WCAG 2.4.11) */}
      <main id="main" className="scroll-mt-20 [&_:where(a,button,input,[tabindex])]:scroll-mt-20">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
