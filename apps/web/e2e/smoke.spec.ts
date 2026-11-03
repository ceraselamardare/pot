// F-01 smoke (F-04, then the landing page of design-direction 03: "Start a Pot" is a link styled as the primary
// button): the home page renders with the brand tokens in Day and Night, with no a11y violations at all. Since the
// site update (07 §1): one main action everywhere, [Start a Pot] (header, hero, final card: real links to the app's
// sign-in that open the sign-in dialog with JS), the demo the secondary choice, and "What else a Pot can do".
// Brand rules covered here in miniature: M-20 (one marigold button, eggplant text, Day border), M-21 (theme
// set before paint from the OS scheme), M-22 (tabular figures), W-08 (static security headers).
import { AxeBuilder } from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

// Expected computed colours, straight from brand/tokens.json
const BRAND = "rgb(255, 179, 32)" // brand #ffb320 (both themes)
const ON_BRAND = "rgb(43, 27, 58)" // on-brand #2b1b3a (both themes)
const BRAND_DEEP_DAY = "rgb(184, 120, 0)" // brand-deep Day #b87800: the 1 px border on marigold buttons
const GROUND = { day: "rgb(250, 249, 246)", night: "rgb(28, 20, 36)" } // ground #faf9f6 / #1c1424

test("home renders the headline, the lockup and one marigold primary button in the brand colours", async ({ page }, info) => {
  const night = info.project.use.colorScheme === "dark"
  const response = await page.goto("/")
  expect(response?.status()).toBe(200)

  // the inline head script picked the theme from the OS scheme before first paint
  await expect(page.locator("html")).toHaveAttribute("data-theme", night ? "night" : "day")
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bodyBg).toBe(night ? GROUND.night : GROUND.day)

  // one h1, the tagline as the headline; the lockup (the mark always with the name) is the header's home link
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Group chat money that follows its own rules.")
  const home = page.getByRole("banner").getByRole("link", { name: "Pot, home" })
  await expect(home).toBeVisible()
  await expect(home).toHaveAttribute("href", "/")
  await expect(home.getByRole("img", { name: "Pot" })).toBeVisible()

  // exactly one marigold button on the whole page (mock UI included), eggplant text, Day-only brand-deep border
  const buttons = page.locator("button, a")
  const fills = await buttons.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(fills.filter((c) => c === BRAND)).toHaveLength(1)

  // three [Start a Pot]s on the page now (header, hero, final card): the marigold is the hero's
  const primary = page.locator("[data-landing-hero]").getByRole("link", { name: "Start a Pot" })
  await expect(primary).toBeVisible()
  await expect(primary).toHaveAttribute("href", "/pots?sheet=create")
  const style = await primary.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      bg: s.backgroundColor,
      color: s.color,
      border: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      height: el.getBoundingClientRect().height,
      font: s.fontFamily,
    }
  })
  expect(style.bg).toBe(BRAND)
  expect(style.color).toBe(ON_BRAND)
  expect(style.borderWidth).toBe("1px")
  expect(style.border).toBe(night ? "rgba(0, 0, 0, 0)" : BRAND_DEEP_DAY)
  expect(style.height).toBe(52)
  expect(style.font).toMatch(/Figtree/)

  // amounts: Gabarito with tabular figures (the "Try the rules" Pot balance; every amount is checked in screens.spec)
  const money = page.locator("[data-try-balance] [data-money]")
  await expect(money).toHaveText("$450.00")
  const numeric = await money.evaluate((el) => {
    const s = getComputedStyle(el)
    return { variant: s.fontVariantNumeric, font: s.fontFamily }
  })
  expect(numeric.variant).toContain("tabular-nums")
  expect(numeric.font).toMatch(/Gabarito/)
})

test("one main action everywhere, the demo second, and What else a Pot can do (07)", async ({ page }) => {
  await page.goto("/")
  // header: a quiet "Sign in" for people who come back, then [Start a Pot] as a secondary button; no demo up here
  const banner = page.getByRole("banner")
  const signIn = banner.getByRole("link", { name: "Sign in" })
  await expect(signIn).toBeVisible()
  await expect(signIn).toHaveAttribute("href", "/pots")
  const headerStart = banner.getByRole("link", { name: "Start a Pot" })
  await expect(headerStart).toBeVisible()
  await expect(headerStart).toHaveAttribute("href", "/pots?sheet=create")
  await expect(banner.getByRole("link", { name: /demo/i })).toHaveCount(0)
  // hero: [Start a Pot] (the marigold, above) beside [See a demo]
  await expect(page.locator("[data-landing-hero]").getByRole("link", { name: "See a demo" })).toHaveAttribute("href", "/demo")
  // final card: [Start a Pot →] then [See a demo], both secondary ("Start your Pot" is retired: one action, one name)
  const final = page.locator("[data-final-cta]")
  const finalStart = final.getByRole("link", { name: "Start a Pot" })
  await expect(finalStart).toHaveAttribute("href", "/pots?sheet=create")
  await expect(final.getByRole("link", { name: "See a demo" })).toHaveAttribute("href", "/demo")
  await expect(page.getByRole("link", { name: "Start your Pot" })).toHaveCount(0)
  for (const secondary of [headerStart, finalStart]) expect(await secondary.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(BRAND)
  // four things a Pot does, named the way the app names them, between "Try the rules" and "Is it safe?"
  const more = page.getByRole("region", { name: "What else a Pot can do" })
  await expect(more.getByRole("heading", { level: 3 })).toHaveText(["Trust grows", "All or nothing", "Ask anyone to pay in", "Send by link"])
  await expect(more.getByRole("button")).toHaveCount(0)
  await expect(more.getByRole("link")).toHaveCount(0)
  const order = await page.evaluate(() => ["#rules", "#more", "section[aria-labelledby='trust-title']"].map((s) => document.querySelector(s)!.getBoundingClientRect().top))
  expect(order).toEqual([...order].sort((a, b) => a - b))
})

test.describe("without JS", () => {
  test.use({ javaScriptEnabled: false })
  test("the start CTAs are plain links into the app, the demo a link to the tour", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("[data-landing-hero]").getByRole("link", { name: "Start a Pot" })).toHaveAttribute("href", "/pots?sheet=create")
    await expect(page.locator("[data-final-cta]").getByRole("link", { name: "Start a Pot" })).toHaveAttribute("href", "/pots?sheet=create")
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/pots")
    await expect(page.locator("[data-landing-hero]").getByRole("link", { name: "See a demo" })).toHaveAttribute("href", "/demo")
  })
})

test("axe: no serious or critical violations (WCAG 2.2 AA)", async ({ page }) => {
  await page.goto("/")
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]), null, 2)).toEqual([])
  expect(results.violations).toEqual([]) // currently none at all; relax to `serious` only if a minor one appears
})

test("static security headers and the manifest (W-08, W-02 subset)", async ({ request }) => {
  const res = await request.get("/")
  const h = res.headers()
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(h["content-security-policy"]).toContain("object-src 'none'")
  expect(h["content-security-policy"]).toContain("base-uri 'none'")
  expect(h["content-security-policy"]).toContain("form-action 'self'")
  expect(h["x-frame-options"]).toBe("DENY")
  expect(h["x-content-type-options"]).toBe("nosniff")
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  expect(h["permissions-policy"]).toContain("camera=()")
  expect(h["strict-transport-security"]).toContain("max-age=")

  const manifest = await request.get("/manifest.webmanifest")
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json")
  const m = await manifest.json()
  expect(m).toMatchObject({ name: "Pot", theme_color: "#faf9f6", background_color: "#faf9f6", display: "standalone" })
  expect(m.icons.map((i: { src: string }) => i.src)).toEqual(["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"])
})

test("head: media-matched theme-color pair and the OG image", async ({ page }) => {
  await page.goto("/")
  const themeColors = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((els) => els.map((el) => [el.getAttribute("media"), el.getAttribute("content")]))
  expect(themeColors).toEqual([
    ["(prefers-color-scheme: light)", "#faf9f6"],
    ["(prefers-color-scheme: dark)", "#1c1424"],
  ])
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og-image\.png$/)
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200")
})
