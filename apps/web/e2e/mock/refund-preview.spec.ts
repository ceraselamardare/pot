// Refund preview (risk-register R-33 M-6): the hero's "You'd get back" opens what you'd get back if the Pot closed now
// (?sheet=refund: put in − your part of the spending = gets back, and how it's worked out), and the Add and Spend
// sheets say what you'd get back after that action. The numbers agree with the Members tab ("Gets back") and with
// the world after the action lands. Day, Night and desktop; axe 0 serious and the brand checks on each screen; 320 px.
// The mobile projects save notes/screens/refund-preview-{day,night}.png (the explainer sheet).
import { expect, test, type Page } from "@playwright/test"
import { addNext, asPerson, axe, brandChecks, openedSheet, spendFlow, spendNext, spendWhy, typeAmount } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)

/** Maya's instant $84 (Pot rules): Lisbon Trip goes from $450 to $366, so everyone's part is $122. */
async function instantSpend(page: Page) {
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Spend" }).click()
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await spendFlow(page, { amount: "84", reason: "Groceries", submit: "Get $84 back" })
  await expect(sheet.getByText("$84 sent to you")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.locator("[data-hero] [data-money]").first()).toHaveText("$366.00")
}

const shareButton = (page: Page) => page.getByRole("button", { name: /^You'd get back .* If the Pot closed now\. Details$/ })

test.use({ reducedMotion: "reduce" })

test("You'd get back → what you'd get back if the Pot closed now, and how it's worked out", async ({ page }, info) => {
  await asPerson(page, "maya")
  await instantSpend(page)
  const share = shareButton(page)
  await expect(share).toHaveAccessibleName("You'd get back $122 · You put in $150 · If the Pot closed now. Details")
  await share.click()
  const sheet = await openedSheet(page, "What you'd get back from Lisbon Trip")
  await expect(page).toHaveURL(/[?&]sheet=refund(&|$)/)
  await expect(sheet.getByText("If the Pot closed now, you'd get back")).toBeVisible()
  const rows = sheet.locator("[data-refund-sheet] dl > div")
  await expect(rows.nth(0)).toHaveText("You put in$150.00")
  await expect(rows.nth(1)).toHaveText("Your part of the spending$28.00")
  await expect(rows.nth(2)).toHaveText("You'd get back$122.00")
  await expect(sheet.locator("[data-refund-how]")).toHaveText(
    "Everything left is split by how much each person put in. You put in $150 of the $450 everyone put in, so you get that part of the $366 left.",
  )
  await expect(sheet).toContainText("Any tiny remainder goes to whoever added money last.")
  await brandChecks(page, { marigold: "none" }) // calm: Got it is secondary
  await axe(page)
  if (info.project.name !== "desktop") {
    await page.screenshot({ path: `${SCREENS}refund-preview-${info.project.name === "mobile-night" ? "night" : "day"}.png` })
  }
  await sheet.getByRole("button", { name: "Got it" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=refund/)
  await expect(share).toBeFocused() // focus returns to the line that opened it

  // the same number as the Members tab's "Gets back" (desktop: the right column)
  if (info.project.name !== "desktop") await page.getByRole("tab", { name: "Members" }).click()
  await expect(page.locator("[data-member='maya']").locator("visible=true").first()).toContainText("Gets back$122.00")

  // a deep link opens it; Back closes it
  await page.goto("/p/lisbon-trip?sheet=refund")
  await openedSheet(page, "What you'd get back from Lisbon Trip")
})

test("Add money: what you'd get back after this, and the hero agrees once it lands", async ({ page }) => {
  await asPerson(page, "maya")
  await instantSpend(page)
  await page.getByRole("button", { name: "Add money" }).click()
  const sheet = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(sheet.locator("[data-add-refund]")).toHaveCount(0) // nothing typed yet
  await typeAmount(page, "50")
  await expect(sheet.locator("[data-add-refund]")).toHaveCount(0) // step 1 is just the amount
  await addNext(page)
  // $416 in the Pot, Maya $200 of $500 put in: 416 × 200 / 500 = $166.40
  await expect(sheet.locator("[data-add-refund]")).toHaveText("After this, you'd get back $166.40 if the Pot closed.")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await sheet.getByRole("button", { name: "Add $50" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.locator("[data-hero] [data-money]").first()).toHaveText("$416.00", { timeout: 10_000 })
  await expect(shareButton(page)).toHaveAccessibleName("You'd get back $166.40 · You put in $200 · If the Pot closed now. Details")
})

test("Spend: once it's paid, what you'd get back (only for a spend the rules would take)", async ({ page }) => {
  await asPerson(page, "sam")
  await page.goto("/p/lisbon-trip?sheet=spend")
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await expect(sheet.locator("[data-spend-refund]")).toHaveCount(0)
  await typeAmount(page, "30")
  // $420 left, a third each: behind the decision line's ⓘ
  const why = await spendWhy(page)
  await expect(why.locator("[data-spend-refund]")).toBeVisible()
  await expect(sheet.locator("[data-spend-refund]")).toHaveText(
    "Once it's paid, you'd get back $140 if the Pot closed. It comes out of everyone's part, by what each person put in.",
  )
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  // more than the Pot has: blocked, so no promise about refunds
  await typeAmount(page, "0000")
  await expect(sheet.locator("[data-spend-refund]")).toHaveCount(0)
  // step 2 keeps it behind the same ⓘ, next to the ask
  for (let i = 0; i < 4; i++) await sheet.getByRole("button", { name: "delete", exact: true }).click() // back to $30
  await spendNext(page)
  await expect((await spendWhy(page)).locator("[data-spend-refund]")).toContainText("you'd get back $140")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
})

test("320 px: the hero line and the explainer fit without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await asPerson(page, "leo")
  await page.goto("/p/lisbon-trip")
  const share = shareButton(page)
  await expect(share).toHaveAccessibleName("You'd get back $150 · You put in $150 · If the Pot closed now. Details")
  const box = (await share.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  await share.click()
  const sheet = await openedSheet(page, "What you'd get back from Lisbon Trip")
  await expect(sheet.locator("[data-refund-total]")).toContainText("$150.00")
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await axe(page)
})
