// The SEO plumbing as a crawler sees it (lib/marketing/*): robots.txt, sitemap.xml and llms.txt; the home page's
// canonical and JSON-LD; the demo's own titles and share cards; noindex on the app; and "/" still sends a signed-in
// visitor to their Pots now that the session check loads only behind the session hint (components/landing/HomeRedirect).
// The origin is this build's metadataBase (NEXT_PUBLIC_APP_URL, else localhost:3000), so URLs are matched by path.
import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { asPerson } from "../fixtures/pot"

const m = JSON.parse(readFileSync(new URL("../../i18n/en.json", import.meta.url), "utf8")) as Record<string, string>

// the HTTP checks don't depend on the colour scheme
test.beforeEach(({}, info) => test.skip(info.project.name === "mobile-night", "the same documents in Night"))

const meta = (page: Page, sel: string) => page.locator(sel).first().getAttribute("content")

test("robots.txt: everyone may read the site; the app, the API and the bearer links stay out; the sitemap is linked", async ({ request }) => {
  const res = await request.get("/robots.txt")
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toContain("text/plain")
  const body = await res.text()
  // one group for every crawler (a named bot group would ignore `*` and its Disallows)
  expect(body.match(/^User-Agent:/gim)).toHaveLength(1)
  expect(body).toMatch(/^User-Agent: \*$/im)
  expect(body).toMatch(/^Allow: \/$/m)
  for (const p of ["/api/", "/pots", "/p/", "/requests", "/you", "/j/", "/c/", "/g/", "/give/"]) expect(body).toContain(`Disallow: ${p}\n`)
  expect(body).not.toMatch(/^Disallow: \/$/m)
  expect(body).toMatch(/^Sitemap: https?:\/\/[^/\s]+\/sitemap\.xml$/m)
})

test("sitemap.xml: the marketing pages as absolute URLs with their dates, and no app route", async ({ request }) => {
  const res = await request.get("/sitemap.xml")
  expect(res.status()).toBe(200)
  const xml = await res.text()
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => new URL(x[1]!).pathname)
  expect(locs).toEqual(expect.arrayContaining(["/", "/demo", "/demo/all", "/group-trip"]))
  expect(locs.filter((p) => /^\/(pots|p\/|requests|you|j\/|c\/|g\/|give\/|api\/|demo\/\d)/.test(p))).toEqual([])
  expect(xml.match(/<lastmod>/g)?.length).toBe(locs.length)
})

test("llms.txt: a Markdown summary with the key pages, the limits and the source", async ({ request }) => {
  const res = await request.get("/llms.txt")
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toContain("text/plain")
  const md = await res.text()
  expect(md.startsWith("# Pot\n\n> ")).toBe(true)
  for (const p of ["/demo", "/demo/all"]) expect(md).toMatch(new RegExp(`\\]\\(https?://[^)\\s]+${p}\\)`))
  expect(md).toContain("test dollars")
  expect(md).toContain("https://github.com/ceraselamardare/pot")
})

test("home: canonical, og:url and one parseable JSON-LD graph (Organization, WebSite, WebApplication)", async ({ page }) => {
  await page.goto("/")
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!).pathname).toBe("/")
  expect(new URL((await meta(page, 'meta[property="og:url"]'))!).pathname).toBe("/")
  expect(await meta(page, 'meta[property="og:title"]')).toBe(m["home.meta.title"])
  const scripts = page.locator('script[type="application/ld+json"]')
  await expect(scripts).toHaveCount(1)
  const data = JSON.parse((await scripts.textContent())!) as { "@context": string; "@graph": { "@type": string; [k: string]: unknown }[] }
  expect(data["@context"]).toBe("https://schema.org")
  expect(data["@graph"].map((n) => n["@type"])).toEqual(["Organization", "WebSite", "WebApplication"])
  expect(data["@graph"][0]!.alternateName).toEqual(["usepot", "Pot money app"])
  const app = data["@graph"][2]!
  expect(app).toMatchObject({ name: "Pot", applicationCategory: "FinanceApplication", operatingSystem: "Web" })
  expect(String(app.description)).toContain(m["home.footer.preview"])
  expect(JSON.stringify(data)).not.toMatch(/aggregateRating|"review"/)
  // the marketing page is indexable
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/)
})

test("the demo: its own titles, descriptions and share cards; /demo/4 points at /demo", async ({ page }) => {
  const cases = [
    { path: "/demo", title: m["tour.meta.title"]!, description: m["tour.meta.description"]!, canonical: "/demo" },
    { path: "/demo/4", title: m["tour.meta.title"]!, description: m["tour.meta.description"]!, canonical: "/demo" },
    { path: "/demo/all", title: m["demo.all.meta.title"]!, description: m["demo.meta.description"]!, canonical: "/demo/all" },
  ]
  for (const c of cases) {
    await page.goto(c.path)
    await expect(page, c.path).toHaveTitle(`${c.title} · Pot`)
    expect(await meta(page, 'meta[name="description"]'), c.path).toBe(c.description)
    expect(await meta(page, 'meta[property="og:title"]'), c.path).toBe(c.title)
    expect(await meta(page, 'meta[property="og:description"]'), c.path).toBe(c.description)
    expect(await meta(page, 'meta[property="og:image"]'), c.path).toMatch(/\/og-image\.png$/)
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!).pathname, c.path).toBe(c.canonical)
    // the page's own JSON-LD; a chapter (canonical /demo) has none
    const scripts = page.locator('script[type="application/ld+json"]')
    if (c.path === c.canonical) {
      const ld = JSON.parse((await scripts.textContent())!) as { "@graph": { "@type": string }[] }
      expect(ld["@graph"].map((n) => n["@type"]), c.path).toEqual(["WebPage", "BreadcrumbList"])
    } else await expect(scripts, c.path).toHaveCount(0)
  }
})

test("the app is never indexed: noindex in the HTML and the header, also for a Pot that doesn't exist", async ({ page, request }) => {
  for (const path of ["/pots", "/requests", "/you", "/p/lisbon-trip", "/p/no-such-pot"]) {
    const res = await request.get(path)
    expect(res.headers()["x-robots-tag"], path).toBe("noindex, nofollow")
    await page.goto(path)
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", "noindex, nofollow")
    await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(0)
  }
  // the marketing pages don't get the header
  expect((await request.get("/")).headers()["x-robots-tag"]).toBeUndefined()
})

test("'/' stays put for a signed-out visitor", async ({ page }) => {
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/$/)
})

test("'/' still sends a signed-in visitor to their Pots", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/")
  await expect(page).toHaveURL(/\/pots$/)
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible()
})
