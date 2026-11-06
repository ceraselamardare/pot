// The SEO plumbing (lib/marketing/*, app/robots.ts, app/sitemap.ts, /llms.txt): the registry, the canonical origin,
// robots rules (one `*` group; previews closed), the sitemap, per-page metadata, the JSON-LD builders and their
// escaping, and llms.txt staying inside the product's claims.
import { afterEach, describe, expect, it, vi } from "vitest"
import robots from "@/app/robots"
import sitemap from "@/app/sitemap"
import { hasKey, t } from "@/i18n/t"
import { llmsTxt } from "./llms"
import { pageMeta } from "./meta"
import { MARKETING_PAGES, PRIVATE_PATHS, useCasePages } from "./pages"
import { breadcrumbs, faqPage, graph, organization, serializeJsonLd, webApplication, website } from "./schema"
import { absoluteUrl, appUrl, isIndexableDeployment } from "./site"

const PROD = { NEXT_PUBLIC_APP_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "usepot.xyz", VERCEL_URL: "pot-a1b2.vercel.app", VERCEL_ENV: "production" }
function env(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v)
}
afterEach(() => vi.unstubAllEnvs())

describe("the canonical origin", () => {
  it("production on Vercel: the project's production domain, not the deployment URL", () => {
    env(PROD)
    expect(appUrl().origin).toBe("https://usepot.xyz")
    expect(absoluteUrl("/demo/all")).toBe("https://usepot.xyz/demo/all")
  })
  it("NEXT_PUBLIC_APP_URL wins; locally it's localhost:3000", () => {
    env({ ...PROD, NEXT_PUBLIC_APP_URL: "https://example.test" })
    expect(appUrl().origin).toBe("https://example.test")
    env({ NEXT_PUBLIC_APP_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_URL: "" })
    expect(appUrl().origin).toBe("http://localhost:3000")
  })
})

describe("the registry", () => {
  it("lists the marketing pages once each, with fixed ISO dates and real en.json keys", () => {
    const paths = MARKETING_PAGES.map((p) => p.path)
    expect(paths).toEqual(expect.arrayContaining(["/", "/demo", "/demo/all", "/group-trip"]))
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of MARKETING_PAGES) {
      expect(p.lastModified, p.path).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(p.lastModified)), p.path).toBe(false)
      expect(hasKey(p.titleKey) && hasKey(p.descriptionKey), p.path).toBe(true)
    }
  })
  it("titles fit 60 characters (with the ' · Pot' suffix) and descriptions 155, and each is unique", () => {
    for (const p of MARKETING_PAGES) {
      const title = t(p.titleKey)
      const shown = p.path === "/" ? title : `${title} · Pot`
      expect(shown.length, `${p.path}: ${shown}`).toBeLessThanOrEqual(60)
      expect(t(p.descriptionKey).length, p.path).toBeLessThanOrEqual(155)
    }
    // /demo/all shares the demo's description on purpose; every use-case page has its own
    const ucs = useCasePages()
    expect(new Set(ucs.map((p) => t(p.titleKey))).size).toBe(ucs.length)
    expect(new Set(ucs.map((p) => t(p.descriptionKey))).size).toBe(ucs.length)
  })
  it("use-case pages carry a descriptive link label and a line for the home page's Made for cards", () => {
    expect(useCasePages().map((p) => p.path)).toContain("/group-trip")
    for (const p of useCasePages()) expect(hasKey(p.useCase.labelKey) && hasKey(p.useCase.bodyKey), p.path).toBe(true)
  })
  it("no marketing page sits under a private prefix", () => {
    for (const p of MARKETING_PAGES) for (const x of PRIVATE_PATHS) expect(p.path.startsWith(x), `${p.path} vs ${x}`).toBe(false)
  })
})

describe("robots.txt", () => {
  it("production: one `*` group that allows the site and keeps out the app, the API and the bearer links", () => {
    env(PROD)
    const r = robots()
    const rules = [r.rules].flat()
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ userAgent: "*", allow: "/" })
    expect(rules[0]!.disallow).toEqual(expect.arrayContaining(["/api/", "/pots", "/p/", "/requests", "/you", "/j/", "/c/", "/g/", "/give/"]))
    expect(r.sitemap).toBe("https://usepot.xyz/sitemap.xml")
  })
  it("a preview deployment is closed to every crawler", () => {
    env({ ...PROD, VERCEL_ENV: "preview" })
    expect(isIndexableDeployment()).toBe(false)
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }])
    expect(robots().sitemap).toBeUndefined()
  })
  it("a local build (no VERCEL_ENV) is indexable, so e2e checks the production rules", () => {
    env({ VERCEL_ENV: "" })
    expect(isIndexableDeployment()).toBe(true)
  })
})

describe("sitemap.xml", () => {
  it("every registered page as an absolute URL with its fixed date, nothing else", () => {
    env(PROD)
    expect(sitemap()).toEqual(MARKETING_PAGES.map((p) => ({ url: `https://usepot.xyz${p.path === "/" ? "/" : p.path}`, lastModified: p.lastModified })))
  })
})

describe("pageMeta", () => {
  it("canonical, og:url, the shared image and an explicit index for the page itself", () => {
    const m = pageMeta("/demo/all")
    expect(m.alternates?.canonical).toBe("/demo/all")
    expect(m.openGraph).toMatchObject({ url: "/demo/all", title: m.title, images: [{ url: "/og-image.png", width: 1200, height: 630 }] })
    expect(m.robots).toMatchObject({ index: true, follow: true })
    expect(pageMeta("/", { absoluteTitle: true }).title).toEqual({ absolute: "Pot: pool money with friends, with rules you agree on" })
  })
})

describe("JSON-LD", () => {
  it("escapes <, > and & so nothing can close the script element, and still parses to the same value", () => {
    const data = graph(faqPage({ path: "/x", items: [{ question: "</script><script>alert(1)</script>", answer: "a & b <!-- c -->" }] }))
    const s = serializeJsonLd(data)
    expect(s).not.toMatch(/[<>&]/)
    expect(JSON.parse(s)).toEqual(data)
  })
  it("the home graph: Organization, WebSite and WebApplication, linked by @id, with no ratings", () => {
    env(PROD)
    const g = graph(organization(), website(), webApplication({ description: "d", free: true }))
    expect(g["@graph"].map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebApplication"])
    const [org, site, app] = g["@graph"]
    expect(org).toMatchObject({ "@id": "https://usepot.xyz/#org", name: "Pot", alternateName: ["usepot", "Pot money app"], sameAs: ["https://github.com/ceraselamardare/pot"], founder: { name: "Cerasela Mardare" } })
    expect(site).toMatchObject({ publisher: { "@id": "https://usepot.xyz/#org" } })
    expect(site).not.toHaveProperty("potentialAction")
    expect(app).toMatchObject({ applicationCategory: "FinanceApplication", operatingSystem: "Web", offers: { price: "0", priceCurrency: "USD" } })
    expect(JSON.stringify(g)).not.toMatch(/aggregateRating|"review"/)
    expect(webApplication({ description: "d", free: false })).not.toHaveProperty("offers")
  })
  it("breadcrumbs: positions from 1 and absolute URLs", () => {
    env(PROD)
    expect(breadcrumbs([{ name: "Pot", path: "/" }, { name: "Demo", path: "/demo" }])).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Pot", item: "https://usepot.xyz/" },
        { "@type": "ListItem", position: 2, name: "Demo", item: "https://usepot.xyz/demo" },
      ],
    })
  })
})

describe("llms.txt", () => {
  it("an H1, a summary, every main page on the canonical origin and the repo", () => {
    env(PROD)
    const md = llmsTxt()
    expect(md.startsWith("# Pot\n\n> ")).toBe(true)
    for (const p of MARKETING_PAGES.filter((x) => x.llms === "main")) expect(md).toContain(`](https://usepot.xyz${p.path === "/" ? "/" : p.path})`)
    expect(md).toContain("(https://github.com/ceraselamardare/pot)")
  })
  it("stays inside the product's claims: testnet and test dollars, no real money", () => {
    const md = llmsTxt()
    expect(md).toMatch(/testnet/i)
    expect(md).toMatch(/test dollars/)
    expect(md).toMatch(/no real money/i)
    for (const claim of [/trustless/i, /audited/i, /insured/i, /card top-ups? (is|are) (live|available)/i, /\bmainnet\b(?! and no real)/i]) expect(md).not.toMatch(claim)
  })
})
