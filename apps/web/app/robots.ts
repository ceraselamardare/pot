// /robots.txt: every crawler, search and AI answer engines included (Googlebot, Bingbot, OAI-SearchBot, GPTBot,
// Claude-SearchBot, ClaudeBot, PerplexityBot…), may read the marketing pages; nobody crawls the app, the API or the
// bearer links. One `*` group on purpose: a bot named in its own group ignores `*` entirely, so a named group would
// have to repeat every Disallow. A Vercel preview disallows everything, so previews never get indexed.
// The app routes also send noindex (app/(app)/layout.tsx metadata + next.config.ts X-Robots-Tag), and so do the
// bearer links (/j, /c, /g, /give) and the public record (/p/[slug]/record).
import type { MetadataRoute } from "next"
import { PRIVATE_PATHS } from "@/lib/marketing/pages"
import { absoluteUrl, isIndexableDeployment } from "@/lib/marketing/site"

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment()) return { rules: [{ userAgent: "*", disallow: "/" }] }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  }
}
