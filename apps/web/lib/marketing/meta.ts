// Per-page metadata for the marketing pages, from the registry (lib/marketing/pages.ts). Next merges metadata
// shallowly: a page's `openGraph`, `twitter` or `robots` replaces the parent's whole object, so this restates the
// shared share image every time (a page can't silently lose it, or its canonical). The canonical lives here, never
// in the root layout: there it would be inherited by every page and point them all at "/".
import type { Metadata } from "next"
import { t } from "@/i18n/t"
import { marketingPage, type MarketingPath } from "./pages"

/** The site's share card (public/og-image.png): marigold, the mark, the "pot" wordmark and the tagline. */
export const OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Pot: group chat money that follows its own rules",
} as const

/**
 * Metadata for a registered marketing page: title, description, canonical, Open Graph (with og:url and the shared
 * image), the X card and an explicit index. `absoluteTitle` skips the layout's "%s · Pot" template (the home page,
 * whose title already starts with "Pot").
 */
export function pageMeta(path: MarketingPath, o: { absoluteTitle?: boolean } = {}): Metadata {
  const page = marketingPage(path)
  const title = t(page.titleKey)
  const description = t(page.descriptionKey)
  return {
    title: o.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: page.path },
    openGraph: {
      type: "website",
      siteName: t("app.name"),
      locale: "en_US",
      url: page.path,
      title,
      description,
      images: [OG_IMAGE],
    },
    // no twitter.images: X falls back to og:image
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true, "max-image-preview": "large" },
  }
}
