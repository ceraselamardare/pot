// (e) The live persona demo works without JavaScript (M-11, M-21 d): the HTML carries the explanation, the three
// persona forms (real POST forms), "What to try" and the reference Pot snapshot; Night applies from the CSS media
// fallback. It moved from /demo to /demo/live (plan/design-direction/05 §3.6) and exists only when the build sets
// FLAG_DEMO_LIVE=true; the default mock build leaves it off, so these tests skip there (and /demo/live is a 404:
// demo-explainer.spec.ts checks that).
import { expect, test } from "@playwright/test"
import { brandChecks, PORTO_INVITE_PK } from "../fixtures/pot"

const LIVE = process.env.FLAG_DEMO_LIVE === "true"

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("(e) /demo/live renders the product in plain HTML", async ({ page }, info) => {
    test.skip(!LIVE, "FLAG_DEMO_LIVE is off in this build")
    const res = await page.goto("/demo/live")
    expect(res?.status()).toBe(200)
    const html = await res!.text()
    for (const s of ["Lisbon Trip", "$450.00", "Maya, who organized the trip", "Sam, a friend", "Leo, a friend", "Demo · test money on NEAR testnet"])
      expect(html, s).toContain(s)

    await expect(page.getByRole("heading", { level: 1, name: "Try Pot as…" })).toBeVisible()
    for (const persona of ["maya", "sam", "leo"]) {
      const form = page.locator("form", { has: page.locator(`input[name="persona"][value="${persona}"]`) })
      await expect(form).toHaveAttribute("method", "post")
      await expect(form).toHaveAttribute("action", "/api/demo/session")
      await expect(form.getByRole("button")).toBeVisible()
    }
    await expect(page.getByRole("heading", { name: "What to try" })).toBeVisible()
    await expect(page.locator("[data-demo-snapshot]")).toContainText("Lisbon Trip has $450.00")
    await expect(page.locator("[data-demo-snapshot]")).toContainText("Members: Maya, Sam, Leo")
    await expect(page.getByRole("link", { name: "The same activity as JSON" })).toHaveAttribute("href", /\/api\/pots\/lisbon-trip\..+\/feed$/)

    // no head script ran (JS off), so the theme comes from the tokens' prefers-color-scheme fallback
    const night = info.project.use.colorScheme === "dark"
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(night ? "rgb(28, 20, 36)" : "rgb(250, 249, 246)")
    await brandChecks(page, { marigold: "one" })
    // (axe needs page JS, so the /demo axe run lives in screens.spec with JS on)
  })

  test("the invite landing's server HTML carries the Pot (link previews, bots)", async ({ request }) => {
    // the body streams behind <Suspense> (Cache Components), so it is in the HTML even though showing it needs JS
    const html = await (await request.get(`/j/porto-weekend?i=${PORTO_INVITE_PK}`)).text()
    for (const s of ["Maya invited you to Porto Weekend", "$300.00", "No one can take money out alone.", "Maya and Sam are in"]) expect(html, s).toContain(s)
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"')
  })
})

test("with JavaScript, Try as Leo opens the reference Pot as Leo", async ({ page }) => {
  test.skip(!LIVE, "FLAG_DEMO_LIVE is off in this build")
  await page.goto("/demo/live")
  await page.getByRole("button", { name: "Leo, a friend" }).click()
  await expect(page).toHaveURL(/\/p\/lisbon-trip$/)
  await expect(page.getByRole("button", { name: "You're Leo" })).toBeVisible()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$450.00")
})

test("?as=sam signs in as Sam (Playwright convenience)", async ({ page }) => {
  test.skip(!LIVE, "FLAG_DEMO_LIVE is off in this build")
  await page.goto("/demo/live?as=sam")
  await expect(page).toHaveURL(/\/p\/lisbon-trip$/)
  await expect(page.getByRole("button", { name: "You're Sam" })).toBeVisible()
})
