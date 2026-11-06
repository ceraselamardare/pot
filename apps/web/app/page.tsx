// "/": the landing page (design-direction 03-landing.md). Static (Cache Components: no request APIs here); the
// one interactive part, "Try the rules", is a client island, and so are the hero/problem typing dots.
// It keeps the two jobs of the old lite landing: <HomeRedirect /> sends a signed-in visitor to /pots, and
// <NearAuthCallback /> finishes a NEAR Auth redirect sign-in (the shared testnet client returns to "/").
// [Start a Pot] in the hero is the page's only marigold button; every other button is secondary. Every start CTA is a
// <SignInLink> (a real link to /pots?sheet=create; with JS and no session it opens the sign-in dialog).
import type { Metadata } from "next"
import { NearAuthCallback } from "@/components/features/auth/NearAuthCallback"
import { JsonLd } from "@/components/seo/JsonLd"
import { HomeRedirect } from "@/components/landing/HomeRedirect"
// the landing's motion + interaction stylesheet; every rule is scoped under [data-landing] (Next keeps a page's CSS
// loaded after a client navigation away, so it must not reach other routes)
import "@/components/landing/home/motion/landing-motion.css"
// the header, hero and problem details (text wrapping, text-link press, nav bar, typing dots), after the toolkit
import "@/components/landing/home/top.css"
import { Features } from "@/components/landing/home/Features"
import { FinalCta } from "@/components/landing/home/FinalCta"
import { Hero } from "@/components/landing/home/Hero"
import { HowItWorks } from "@/components/landing/home/HowItWorks"
import { MadeFor } from "@/components/landing/home/MadeFor"
import { SmoothAnchors } from "@/components/landing/home/motion/ScrollMarkers"
import { Problem } from "@/components/landing/home/Problem"
import { RulesPlayground } from "@/components/landing/home/RulesPlayground"
import { SiteFooter } from "@/components/landing/home/SiteFooter"
import { SiteHeader } from "@/components/landing/home/SiteHeader"
import { Trust } from "@/components/landing/home/Trust"
import { UnderTheHood } from "@/components/landing/home/UnderTheHood"
import { t } from "@/i18n/t"
import { pageMeta } from "@/lib/marketing/meta"
import { graph, organization, webApplication, website } from "@/lib/marketing/schema"

// Metadata from the marketing registry (lib/marketing/pages.ts → pageMeta): the title (absolute: it already starts
// with "Pot"), the description, the canonical "/", og:url and the shared share image, restated because a page's
// openGraph replaces the layout's whole object. The share card's title is the page title, not the layout's bare "Pot".
export const metadata: Metadata = pageMeta("/", { absoluteTitle: true })

// Pot as an entity for search and AI answer engines: Organization + WebSite + WebApplication in one @graph. The
// description is the visible copy (the meta description), so the markup says only what the page says: no ratings,
// and no network (the Testnet badge in the header and footer is the one place that names it).
const STRUCTURED_DATA = graph(
  organization(),
  website(),
  webApplication({ description: t("home.meta.description"), free: true }),
)

export default function Home() {
  return (
    // data-landing scopes landing-motion.css; display:contents, so the layout is exactly as without it
    <div data-landing className="contents">
      <JsonLd data={STRUCTURED_DATA} />
      {/* smooth in-page jumps once loaded, and only while this page is on screen (motion/ScrollMarkers.tsx) */}
      <SmoothAnchors />
      <HomeRedirect />
      <NearAuthCallback />
      <SiteHeader />
      {/* scroll margins: a skip-link jump or a keyboard focus never lands under the sticky header (WCAG 2.4.11) */}
      <main id="main" className="scroll-mt-20 [&_:where(a,button,input,[tabindex])]:scroll-mt-20">
        <Hero />
        <Problem />
        <HowItWorks />
        <RulesPlayground />
        <Features />
        <Trust />
        <UnderTheHood />
        {/* the use-case pages from the marketing registry (only registered pages, so never a dead link) */}
        <MadeFor />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
