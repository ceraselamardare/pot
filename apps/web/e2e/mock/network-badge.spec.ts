// The Testnet badge (components/brand/NetworkBadge.tsx): the one place the site says it runs on NEAR testnet, on every
// surface of a testnet build (this mock build is one: NEXT_PUBLIC_NETWORK=testnet). It shows on a marketing page, an
// app screen and a standalone page; it is a real button that opens its explanation (a native popover: Enter or a tap
// opens it, Esc closes it and gives focus back); axe passes with it open; it adds no marigold; and at 320 px the site
// header row stays as it was ("Sign in" from 360 px, [Start a Pot] always) while the badge moves into the strip
// under it on phones narrower than 448 px. Its hidden-on-mainnet half is a unit
// test (components/__tests__/network-badge.test.tsx): a build is one network or the other.
import { readFileSync } from "node:fs"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { asPerson, axe, brandChecks, PORTO_INVITE_URL } from "../fixtures/pot"

const m = JSON.parse(readFileSync(new URL("../../i18n/en.json", import.meta.url), "utf8")) as Record<string, string>

/** The one badge on screen at this size (each surface has one per breakpoint; the others are display:none). */
const visibleBadge = (page: Page): Locator => page.locator("button[data-network-badge]:visible").first()

async function opensItsExplanation(page: Page, badge: Locator) {
  await expect(badge).toHaveAccessibleName(m["network.badge"]!)
  const pop = page.locator(`#${await badge.getAttribute("popovertarget")}`)
  await expect(pop).toBeHidden()
  await badge.click()
  await expect(pop).toBeVisible()
  await expect(pop).toContainText(m["network.badge.title"]!)
  await expect(pop).toContainText(m["network.badge.body"]!)
  // inside the screen, under or over its badge
  const box = (await pop.boundingBox())!
  const width = page.viewportSize()!.width
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  return pop
}

test("a marketing page: at the top (header row, or the strip under it on phones) and in the footer; Esc closes it", async ({ page }) => {
  await page.goto("/")
  const header = page.locator("button[data-network-badge^='header']:visible")
  await expect(header).toHaveCount(1)
  // phones keep the header row as it was: "Sign in" (from 360 px) and [Start a Pot]
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible()
  await expect(page.getByRole("banner").getByRole("link", { name: "Start a Pot" })).toBeVisible()
  const pop = await opensItsExplanation(page, header)
  await axe(page)
  await brandChecks(page, { marigold: "one" })
  await page.keyboard.press("Escape")
  await expect(pop).toBeHidden()
  // the footer's own badge, near the bottom of the page: its explanation still fits the screen
  const footer = page.locator("footer").getByRole("button", { name: m["network.badge"]! })
  await footer.scrollIntoViewIfNeeded()
  await opensItsExplanation(page, footer)
})

test("keyboard: Enter opens the explanation, Esc closes it and focus stays on the badge", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a keyboard path")
  await page.goto("/group-trip")
  const badge = page.getByRole("banner").getByRole("button", { name: m["network.badge"]! })
  await badge.focus()
  await page.keyboard.press("Enter")
  const pop = page.locator("#network-badge-header")
  await expect(pop).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(pop).toBeHidden()
  await expect(badge).toBeFocused()
})

test("an app screen: Pots, a Pot and You carry it (phones above the screen, the top bar from lg)", async ({ page }) => {
  await asPerson(page, "maya")
  for (const url of ["/pots", "/p/lisbon-trip", "/you"]) {
    await page.goto(url)
    await expect(page.locator("main")).toBeVisible()
    await expect(visibleBadge(page)).toBeVisible()
  }
  await opensItsExplanation(page, visibleBadge(page))
  await axe(page)
})

test("a standalone page: the invite carries it in its top corner", async ({ page }) => {
  await page.goto(PORTO_INVITE_URL)
  await expect(page.getByRole("button", { name: "Join with Google" })).toBeVisible()
  const badge = page.locator("button[data-network-badge='page']")
  await expect(badge).toBeVisible()
  await opensItsExplanation(page, badge)
  await axe(page)
  await brandChecks(page, { marigold: "one" })
})

test("320 px: the header keeps [Start a Pot]; the badge moves to the strip under it", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one viewport is enough")
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto("/")
  const banner = page.getByRole("banner")
  await expect(banner.getByRole("link", { name: "Start a Pot" })).toBeVisible()
  await expect(banner.locator("[data-network-badge]")).toBeHidden()
  const strip = page.locator("button[data-network-badge='header-narrow']")
  await expect(strip).toBeVisible()
  // the lockup, the button and the strip's badge all sit inside the 320 px screen
  for (const el of [banner.locator("[data-lockup-link]"), banner.getByRole("link", { name: "Start a Pot" }), strip]) {
    const b = (await el.boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(320)
  }
  await opensItsExplanation(page, strip)
})
