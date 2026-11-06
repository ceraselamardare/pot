// The public site's identity, shared by the root layout's metadataBase, the per-page metadata (lib/marketing/meta),
// sitemap.ts, robots.ts, /llms.txt and the JSON-LD builders (lib/marketing/schema). Server-safe and pure: build-time
// env only, no request APIs, so every route that uses it stays prerendered (Cache Components).

/**
 * The canonical origin. NEXT_PUBLIC_APP_URL when set; on Vercel otherwise the project's production domain (Vercel picks
 * the shortest custom domain, so usepot.xyz in production and on previews alike), else this deployment's URL; locally
 * http://localhost:3000.
 */
export function appUrl(): URL {
  if (process.env.NEXT_PUBLIC_APP_URL) return new URL(process.env.NEXT_PUBLIC_APP_URL)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`)
  return new URL("http://localhost:3000")
}

/** An absolute URL on the canonical origin: absoluteUrl("/demo") → "https://usepot.xyz/demo". */
export function absoluteUrl(path: string): string {
  return new URL(path, appUrl()).toString()
}

/**
 * May search engines index this build? Not on a Vercel preview or development deployment (robots.txt then disallows
 * everything); yes in production and on local builds (e2e, Lighthouse), which nobody crawls.
 */
export function isIndexableDeployment(): boolean {
  const env = process.env.VERCEL_ENV
  return !env || env === "production"
}

/** Facts about Pot for machines (JSON-LD, llms.txt). Product facts: README.md and docs/limitations.md. */
export const SITE = {
  name: "Pot",
  /** the site's other names (WebSite: "Pot" alone is an ambiguous word) */
  alternateNames: ["usepot", "usepot.xyz"],
  /** what people may search the organization as (page-plan: "pot app" is pottery and potluck, so name the product) */
  orgAlternateNames: ["usepot", "Pot money app"],
  founder: "Cerasela Mardare",
  repo: "https://github.com/ceraselamardare/pot",
  /** a 512 px square PNG of the mark (public/, copied from brand/web) */
  logo: "/icon-512.png",
  language: "en",
} as const
