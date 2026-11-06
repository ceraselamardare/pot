// /sitemap.xml: every public marketing page from the registry (lib/marketing/pages.ts), on the canonical origin, with
// its fixed last-modified date (never new Date(): Cache Components prerenders this). No changefreq or priority: Google
// ignores both. The /demo/1-6 chapters aren't listed: their canonical is /demo.
import type { MetadataRoute } from "next"
import { MARKETING_PAGES } from "@/lib/marketing/pages"
import { absoluteUrl } from "@/lib/marketing/site"

export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_PAGES.map((p) => ({ url: absoluteUrl(p.path), lastModified: p.lastModified }))
}
