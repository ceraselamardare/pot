// "/": the landing page (design-direction 03-landing.md). Static (Cache Components: no request APIs here); the
// one interactive part, "Try the rules", is a client island, and so are the hero/problem typing dots.
// It keeps the two jobs of the old lite landing: <HomeRedirect /> sends a signed-in visitor to /pots, and
// <NearAuthCallback /> finishes a NEAR Auth redirect sign-in (the shared testnet client returns to "/").
// [Start a Pot] in the hero is the page's only marigold button; every other button is secondary. Every start CTA is a
// <SignInLink> (a real link to /pots?sheet=create; with JS and no session it opens the sign-in dialog).
import type { Metadata, ResolvingMetadata } from "next"
import { NearAuthCallback } from "@/components/features/auth/NearAuthCallback"
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
import { SmoothAnchors } from "@/components/landing/home/motion/ScrollMarkers"
import { Problem } from "@/components/landing/home/Problem"
import { RulesPlayground } from "@/components/landing/home/RulesPlayground"
import { SiteFooter } from "@/components/landing/home/SiteFooter"
import { SiteHeader } from "@/components/landing/home/SiteHeader"
import { Trust } from "@/components/landing/home/Trust"
import { UnderTheHood } from "@/components/landing/home/UnderTheHood"
import { t } from "@/i18n/t"

// The root layout owns the Open Graph image; this page only swaps the title and the description, so it extends
// the layout's openGraph (a page's openGraph would otherwise replace it whole, image included). The share card's
// title is the page title (home.meta.title), not the layout's bare "Pot". twitter is a whole object too, so it
// restates the card type; X's image still falls back to og:image (Next fills twitter:image from openGraph).
export async function generateMetadata(_props: PageProps<"/">, parent: ResolvingMetadata): Promise<Metadata> {
  const og = (await parent).openGraph
  const title = t("home.meta.title")
  const description = t("home.meta.description")
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: og?.siteName ?? t("app.name"),
      title,
      description,
      images: og?.images,
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default function Home() {
  return (
    // data-landing scopes landing-motion.css; display:contents, so the layout is exactly as without it
    <div data-landing className="contents">
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
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
