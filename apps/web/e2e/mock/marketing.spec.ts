// The use-case pages (components/marketing, lib/marketing/pages.ts), smoke-style: each one is up and static, has one
// H1, the brand checks (exactly one marigold button: the hero's [Start a Pot]), no axe violations at all, its own
// canonical and share card, one JSON-LD graph (WebPage, BreadcrumbList, FAQPage mirroring the visible FAQ), a place
// in the sitemap, and the Testnet badge in its header and footer (the one place the site names its network). A new
// page adds one entry to PAGES.
import { readFileSync } from "node:fs"
import { AxeBuilder } from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { brandChecks } from "../fixtures/pot"

const m = JSON.parse(readFileSync(new URL("../../i18n/en.json", import.meta.url), "utf8")) as Record<string, string>

const PAGES = [
  {
    path: "/group-trip",
    h1: m["uc.trip.hero.title"]!,
    title: m["uc.trip.meta.title"]!,
    description: m["uc.trip.meta.description"]!,
    faq: m["uc.trip.faq.title"]!,
    // the worked example, as the page shows it (lib/marketing/group-trip.ts computes it; group-trip.test.ts checks it)
    shows: ["$1,800.00", "$266.00", "$44.33", "$44.35", "Needs 4 of 6 approvals"],
  },
  {
    path: "/bachelorette-party",
    h1: m["uc.party.hero.title"]!,
    title: m["uc.party.meta.title"]!,
    description: m["uc.party.meta.description"]!,
    faq: m["uc.party.faq.title"]!,
    // lib/marketing/bachelorette-party.ts computes it; bachelorette-party.test.ts checks it
    shows: ["$2,000.00", "$460.00", "$192.50", "$57.50", "Needs 5 of 8 approvals"],
  },
  {
    path: "/group-gift",
    h1: m["uc.gift.hero.title"]!,
    title: m["uc.gift.meta.title"]!,
    description: m["uc.gift.meta.description"]!,
    faq: m["uc.gift.faq.title"]!,
    // lib/marketing/group-gift.ts computes it (money from outside included); group-gift.test.ts checks it
    shows: ["$300.00", "$15.00", "$2.50", "Needs one OK", "Hi all, we're getting [name]"],
  },
  {
    path: "/shared-account-with-friends",
    h1: m["uc.shared.hero.title"]!,
    title: m["uc.shared.meta.title"]!,
    description: m["uc.shared.meta.description"]!,
    faq: m["uc.shared.faq.title"]!,
    // lib/marketing/shared-account.ts computes it (different amounts in); shared-account.test.ts checks it
    shows: ["$800.00", "$85.00", "$21.25", "$10.62", "$15.95", "Needs 3 of 5 approvals", m["uc.shared.compare.source.link"]!],
  },
  {
    path: "/tools/group-trip-cost-calculator",
    h1: m["uc.calc.hero.title"]!,
    title: m["uc.calc.meta.title"]!,
    description: m["uc.calc.meta.description"]!,
    faq: m["uc.calc.faq.title"]!,
    // the server-rendered result (the weekend preset) and the worked example (lib/marketing/trip-cost.ts; its test)
    shows: ["$385.00", "$2,310.00", "$1,445.00", "$5,780 in the Pot", "Needs 3 of 4 approvals"],
    // a free tool: its own WebApplication node
    ld: ["WebPage", "WebApplication", "BreadcrumbList", "FAQPage"],
  },
] as const

for (const p of PAGES) {
  test.describe(p.path, () => {
    test("200, one H1, one marigold, the CTAs, the Testnet badge", async ({ page }) => {
      const res = await page.goto(p.path)
      expect(res?.status()).toBe(200)
      expect(res?.headers()["x-robots-tag"]).toBeUndefined()
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.h1)
      await brandChecks(page, { marigold: "one" })
      // the marigold is the hero's [Start a Pot], a real link into the app; the demo is a plain link
      const hero = page.locator("[data-marketing-hero]")
      await expect(hero.getByRole("link", { name: "Start a Pot" })).toHaveAttribute("href", "/pots?sheet=create")
      await expect(hero.getByRole("link", { name: m["uc.common.cta.demo"]! })).toHaveAttribute("href", "/demo")
      const final = page.locator("[data-final-cta]")
      await expect(final.getByRole("link", { name: "Start a Pot" })).toHaveAttribute("href", "/pots?sheet=create")
      // no preview notes or "Is this real money?" any more: the Testnet badge in the header and the footer says it
      await expect(final.locator("[data-preview-note]")).toHaveCount(0)
      await expect(page.locator('[data-faq-item="real"]')).toHaveCount(0)
      // in the header row from 448 px; on narrower phones in the strip right under the header
      await expect(page.locator("button[data-network-badge^='header']:visible")).toHaveCount(1)
      await expect(page.locator("footer").getByRole("button", { name: m["network.badge"]! })).toBeVisible()
      // the header has no in-page anchors here (they're the home page's sections)
      await expect(page.getByRole("banner").getByRole("navigation")).toHaveCount(0)
      for (const text of p.shows) await expect(page.getByText(text, { exact: false }).first()).toBeAttached()
      await expect(page.locator("[data-last-updated] time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}$/)
    })

    test("axe: no violations at all (WCAG 2.2 AA)", async ({ page }) => {
      await page.goto(p.path)
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
      expect(results.violations, JSON.stringify(results.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]), null, 2)).toEqual([])
    })

    test("canonical, share card, JSON-LD with the visible FAQ, and the sitemap", async ({ page, request }, info) => {
      test.skip(info.project.name === "mobile-night", "the same documents in Night")
      await page.goto(p.path)
      await expect(page).toHaveTitle(`${p.title} · Pot`)
      const meta = (sel: string) => page.locator(sel).first().getAttribute("content")
      expect(await meta('meta[name="description"]')).toBe(p.description)
      expect(new URL((await page.locator('link[rel="canonical"]').getAttribute("href"))!).pathname).toBe(p.path)
      expect(new URL((await meta('meta[property="og:url"]'))!).pathname).toBe(p.path)
      expect(await meta('meta[property="og:title"]')).toBe(p.title)
      expect(await meta('meta[property="og:image"]')).toMatch(/\/og-image\.png$/)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/)

      const scripts = page.locator('script[type="application/ld+json"]')
      await expect(scripts).toHaveCount(1)
      type Node = { "@type": string; [k: string]: unknown }
      const ld = JSON.parse((await scripts.textContent())!) as { "@graph": Node[] }
      expect(ld["@graph"].map((n) => n["@type"])).toEqual("ld" in p ? p.ld : ["WebPage", "BreadcrumbList", "FAQPage"])
      expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|"review"/)
      // the FAQPage is exactly the visible FAQ, question by question
      const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage") as unknown as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
      const region = page.getByRole("region", { name: p.faq })
      const questions = await region.getByRole("heading", { level: 3 }).allTextContents()
      expect(faq.mainEntity.map((q) => q.name)).toEqual(questions)
      expect(questions.length).toBeGreaterThanOrEqual(5)
      for (const q of faq.mainEntity) await expect(region.getByText(q.acceptedAnswer.text, { exact: true })).toBeVisible()

      const xml = await (await request.get("/sitemap.xml")).text()
      expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => new URL(x[1]!).pathname)).toContain(p.path)
      expect(await (await request.get("/llms.txt")).text()).toMatch(new RegExp(`\\]\\(https?://[^)\\s]+${p.path}\\)`))
    })
  })
}

test("the home page's Made for section links every use-case page, and only registered ones", async ({ page }) => {
  await page.goto("/")
  const section = page.getByRole("region", { name: m["home.madefor.title"]! })
  const hrefs = await section.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href")))
  expect(hrefs).toEqual(PAGES.map((p) => p.path))
  await expect(section.getByRole("link", { name: new RegExp(m["uc.trip.card.label"]!) })).toHaveAttribute("href", "/group-trip")
  for (const href of hrefs) expect((await page.request.get(href!)).status(), href!).toBe(200)
})
