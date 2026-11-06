// The public, indexable marketing routes: the one list that sitemap.ts, /llms.txt and each page's metadata
// (lib/marketing/meta.ts `pageMeta`) read, so they can't drift apart. A new marketing page adds one entry here, then
// `export const metadata = pageMeta("/its-path")` in its page.tsx (and its JSON-LD from lib/marketing/schema.ts).
// App, API and bearer-link routes never go here: robots.ts disallows them and they send noindex.
import type { MessageKey, MessageVars } from "@/i18n/t"

/** en.json keys without placeholders (a page title or description is one fixed string). */
export type PlainKey = { [K in MessageKey]: MessageVars<K> extends undefined ? K : never }[MessageKey]

export interface MarketingPage {
  /** the canonical path, also the sitemap entry and `alternates.canonical` */
  path: `/${string}`
  /**
   * The last real change to the page's content, as a fixed ISO date (YYYY-MM-DD). Bump it by hand when the content
   * changes: never `new Date()` (Cache Components prerendering), and Google only trusts a lastmod that's accurate.
   */
  lastModified: string
  /** the page's <title> without the " · Pot" suffix; also og:title and its name in llms.txt and breadcrumbs */
  titleKey: PlainKey
  /** the meta and og:description; also its one-line note in llms.txt */
  descriptionKey: PlainKey
  /** where it goes in /llms.txt: the main list or "Optional" (skippable) */
  llms: "main" | "optional"
  /**
   * A use-case page: its card in the home page's "Made for" section (components/landing/home/MadeFor.tsx) and in
   * other pages' related links (components/marketing/RelatedLinks.tsx). `labelKey` is the link's descriptive anchor
   * text ("Collect money for a group trip"), `bodyKey` one line under it. Only registered pages are ever linked.
   * `tagKey`: a small label above the link for what isn't a use case (the calculator: "Free tool"); register those
   * last, so the use cases come first.
   * `navKey`: its short name in the site footer's columns ("Group trips"; components/landing/home/SiteFooter.tsx):
   * a page without a tag goes under "Use cases", one with a tag under "Free tools".
   */
  useCase?: { labelKey: PlainKey; bodyKey: PlainKey; navKey: PlainKey; tagKey?: PlainKey }
}

export const MARKETING_PAGES = [
  { path: "/", lastModified: "2026-11-06", titleKey: "home.meta.title", descriptionKey: "home.meta.description", llms: "main" },
  { path: "/demo", lastModified: "2026-11-06", titleKey: "tour.meta.title", descriptionKey: "tour.meta.description", llms: "main" },
  { path: "/demo/all", lastModified: "2026-11-06", titleKey: "demo.all.meta.title", descriptionKey: "demo.meta.description", llms: "main" },
  {
    path: "/group-trip",
    lastModified: "2026-11-06",
    titleKey: "uc.trip.meta.title",
    descriptionKey: "uc.trip.meta.description",
    llms: "main",
    useCase: { labelKey: "uc.trip.card.label", bodyKey: "uc.trip.card.body", navKey: "uc.trip.nav" },
  },
  {
    path: "/bachelorette-party",
    lastModified: "2026-11-06",
    titleKey: "uc.party.meta.title",
    descriptionKey: "uc.party.meta.description",
    llms: "main",
    useCase: { labelKey: "uc.party.card.label", bodyKey: "uc.party.card.body", navKey: "uc.party.nav" },
  },
  {
    path: "/group-gift",
    lastModified: "2026-11-06",
    titleKey: "uc.gift.meta.title",
    descriptionKey: "uc.gift.meta.description",
    llms: "main",
    useCase: { labelKey: "uc.gift.card.label", bodyKey: "uc.gift.card.body", navKey: "uc.gift.nav" },
  },
  {
    path: "/shared-account-with-friends",
    lastModified: "2026-11-06",
    titleKey: "uc.shared.meta.title",
    descriptionKey: "uc.shared.meta.description",
    llms: "main",
    useCase: { labelKey: "uc.shared.card.label", bodyKey: "uc.shared.card.body", navKey: "uc.shared.nav" },
  },
  {
    path: "/tools/group-trip-cost-calculator",
    lastModified: "2026-11-06",
    titleKey: "uc.calc.meta.title",
    descriptionKey: "uc.calc.meta.description",
    llms: "main",
    useCase: { labelKey: "uc.calc.card.label", bodyKey: "uc.calc.card.body", navKey: "uc.calc.nav", tagKey: "uc.calc.card.tag" },
  },
] as const satisfies readonly MarketingPage[]

export type MarketingPath = (typeof MARKETING_PAGES)[number]["path"]

/** The registered use-case pages, in registry order (the home page's "Made for" cards; related links). */
export function useCasePages(): (MarketingPage & { useCase: NonNullable<MarketingPage["useCase"]> })[] {
  return (MARKETING_PAGES as readonly MarketingPage[]).filter((p): p is MarketingPage & { useCase: NonNullable<MarketingPage["useCase"]> } => !!p.useCase)
}

/** The site footer's two registry columns: the use cases, then the free tools (the pages with a `tagKey`). */
export function footerPages() {
  // (not via useCasePages(): its `use` prefix reads as a hook to the linter outside a component)
  const pages = (MARKETING_PAGES as readonly MarketingPage[]).filter((p): p is MarketingPage & { useCase: NonNullable<MarketingPage["useCase"]> } => !!p.useCase)
  return { useCases: pages.filter((p) => !p.useCase.tagKey), tools: pages.filter((p) => !!p.useCase.tagKey) }
}

export function marketingPage(path: MarketingPath): MarketingPage {
  const page = MARKETING_PAGES.find((p) => p.path === path)
  if (!page) throw new Error(`not a marketing page: ${path}`)
  return page
}

/**
 * Never crawled (robots.ts Disallow; prefix matches, so "/p/" covers /p/<slug>/record): the API, the signed-in app and
 * the bearer links (invite /j, claim /c, gift /g, public gift page /give), whose secret sits in the #fragment.
 */
export const PRIVATE_PATHS = ["/api/", "/pots", "/p/", "/requests", "/you", "/j/", "/c/", "/g/", "/give/"] as const
