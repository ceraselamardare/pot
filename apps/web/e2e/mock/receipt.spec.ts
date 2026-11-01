// "Scan receipt" on the mock data source (never the network: the mock reader downscales the real fixture photo in
// the browser, then picks a sample reading by file name, lib/receipt.ts MOCK_RECEIPTS). Maya scans a $84.20 Pingo
// Doce receipt on step 1 of the Spend sheet: amount, reason and note are filled and the sheet moves on to step 2,
// where the receipt is one row (details, items and "Read privately" behind its ⌄); the reading is announced and the
// instant spend goes through with the note. Also: a euro receipt converted at the mock's fixed rate ("€42.50 ≈ $46.12
// · rate 1.0852 from today", the dollars still editable), a euro receipt with no rate (stays on step 1, "Use 42.50 as
// dollars"), a blurry photo and a slow reading (friendly copy; typing still works), and 320 px reflow. Day, Night and
// desktop; axe 0 serious and the brand checks (Next / the ask stays the one marigold). The mobile projects save
// notes/screens/receipt-{day,night}.png and receipt-fx-{day,night}.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { asPerson, axe, brandChecks, openedSheet, spendNext, typeAmount } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const FIXTURE = (name: string) => fileURLToPath(new URL(`../fixtures/receipts/${name}`, import.meta.url))
test.use({ reducedMotion: "reduce" })

async function openSpend(page: Page) {
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  return openedSheet(page, "Spend from Lisbon Trip")
}

/** The camera input (capture="environment" on phones; desktop browsers open the file picker for the same input). */
async function snap(sheet: Locator, name: string) {
  const input = sheet.locator("[data-receipt-input='camera']")
  await expect(input).toHaveAttribute("capture", "environment")
  await expect(input).toHaveAttribute("accept", "image/*")
  await input.setInputFiles(FIXTURE(name))
}

const amount = (sheet: Locator) => sheet.locator("[data-amount-display]")
/** step 2's amount line ("How much? $84.2": the words are for screen readers) */
const amount2 = (sheet: Locator) => sheet.locator("[data-spend-amount]")
const live = (sheet: Locator) => sheet.locator("[data-receipt-live]")
const details = (summary: Locator) => summary.getByRole("button", { name: "Receipt details" }).click()
const shotName = (name: string, project: string) => `${SCREENS}${name}-${project === "mobile-night" ? "night" : "day"}.png`

test("scan a dollar receipt on step 1: filled in, announced, on to step 2 with a one-row summary; then Get $84.20 back with the note", async ({ page }, info) => {
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  const button = sheet.getByRole("button", { name: "Scan receipt" })
  await expect(button).toBeVisible()
  await brandChecks(page, { marigold: "at-most-one" }) // Next is off until there's an amount
  // on desktop the same button opens the file picker
  if (info.project.name === "desktop") {
    const chooser = page.waitForEvent("filechooser")
    await button.click()
    await (await chooser).setFiles(FIXTURE("receipt-pingo-doce.jpg"))
  } else {
    await snap(sheet, "receipt-pingo-doce.jpg")
  }
  await expect(sheet.locator("[data-receipt='reading']")).toContainText("Reading your receipt…")
  const summary = sheet.locator("[data-receipt-summary]")
  await expect(summary).toBeVisible()
  // step 2, everything filled, its heading focused
  await expect(sheet.locator("[data-spend-body='2']")).toBeVisible()
  await expect(sheet.getByRole("heading", { name: "What's it for?" })).toBeFocused()
  await expect(live(sheet)).toHaveText("Receipt read: $84.20 at Pingo Doce")
  await expect(amount2(sheet)).toContainText("$84.2")
  await expect(sheet.getByRole("button", { name: /Groceries/ })).toHaveAttribute("aria-pressed", "true")
  await expect(sheet.getByRole("button", { name: "Pingo Doce · Oct 28" })).toBeVisible()
  await expect(summary.getByRole("heading", { name: "Pingo Doce" })).toBeVisible()
  await expect(summary.locator("[data-receipt-total]")).toHaveText("$84.20")
  await expect(summary.locator("[data-receipt-more]")).toBeHidden()
  await expect(sheet.getByText("This will be approved instantly")).toBeVisible()
  // the main path fits: nothing to scroll on a 390 × 844 phone
  if (info.project.name !== "desktop") {
    const body = sheet.locator("[data-base-ui-swipe-ignore]")
    expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: shotName("receipt", info.project.name) })
  }
  // details: the notice, the items; "Read privately" explains (sample build: no check link, the photo stayed)
  await details(summary)
  await expect(summary.getByText("We filled in the amount, reason and note. Check them before you ask.")).toBeVisible()
  await expect(summary.locator("[data-receipt-items] li")).toHaveCount(8)
  await summary.getByRole("button", { name: "Read privately: what this means" }).click()
  await expect(summary.getByText(/goes to a sealed computer that reads it/)).toBeVisible()
  await expect(summary.getByText("This test version shows a sample reading. Your photo stays on your device.")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)

  // Ask as today: the reading only filled the form
  await sheet.getByRole("button", { name: "Get $84.20 back" }).click()
  await expect(sheet.getByText("$84.20 sent to you")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  // the feed names the spend by its note (the merchant and day from the receipt)
  const row = page.locator("[data-feed] li", { hasText: "Maya got $84.20 back for Pingo Doce · Oct 28" })
  await expect(row).toBeVisible()
  await expect(row).toContainText("Approved by Pot rules")
})

test("a euro receipt converts at the day's rate: '€42.50 ≈ $46.12 · rate 1.0852 from today'; the dollars stay editable", async ({ page }, info) => {
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await snap(sheet, "receipt-cafe-eur.jpg")
  const summary = sheet.locator("[data-receipt-summary]")
  await expect(summary).toBeVisible()
  await expect(sheet.locator("[data-spend-body='2']")).toBeVisible()
  await expect(live(sheet)).toHaveText("Receipt read: €42.50 at Taberna da Rua. That's about $46.12.")
  await expect(amount2(sheet)).toContainText("$46.12")
  await expect(summary.locator("[data-receipt-total]")).toHaveText("€42.50")
  await expect(summary.locator("[data-receipt-fx]")).toHaveText("€42.50 ≈ $46.12 · rate 1.0852 from today")
  await expect(sheet.getByRole("button", { name: /Food/ })).toHaveAttribute("aria-pressed", "true")
  await expect(sheet.getByRole("button", { name: "Get $46.12 back" })).toBeEnabled()
  if (info.project.name !== "desktop") await page.screenshot({ path: shotName("receipt-fx", info.project.name) })
  await details(summary)
  await expect(summary.getByText("Sample rate: this test version doesn't look up today's rate.")).toBeVisible()
  await expect(summary.getByText(/Your bank's rate may differ a little/)).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  // what the bank charged was a little different: Back to the keypad, change it, Next
  await sheet.getByRole("button", { name: "Back", exact: true }).click()
  await expect(amount(sheet)).toHaveText("$46.12")
  await sheet.getByRole("button", { name: "delete", exact: true }).click()
  await typeAmount(page, "9")
  await spendNext(page)
  await expect(sheet.getByRole("button", { name: "Get $46.19 back" })).toBeEnabled()
  await expect(summary.locator("[data-receipt-fx]")).toHaveText("€42.50 ≈ $46.12 · rate 1.0852 from today")
})

test("no rate today: the euro receipt stays on step 1, says so, and 'Use 42.50 as dollars' fills it on request", async ({ page }) => {
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await page.evaluate(() => localStorage.setItem("pot.mock.fail", "receipt_rate"))
  await snap(sheet, "receipt-cafe-eur.jpg")
  const summary = sheet.locator("[data-receipt-summary]")
  await expect(summary).toBeVisible()
  await expect(live(sheet)).toHaveText("Receipt read: €42.50 at Taberna da Rua")
  await expect(sheet.locator("[data-spend-body='1']")).toBeVisible()
  await expect(amount(sheet)).toHaveText("$0")
  await expect(summary.getByText("This receipt is in EUR (€42.50). We couldn't get today's rate, so type the amount in dollars.")).toBeVisible()
  await expect(summary.getByRole("heading", { name: "Taberna da Rua" })).toBeFocused()
  await brandChecks(page, { marigold: "at-most-one" })
  await axe(page)
  await summary.getByRole("button", { name: "Use 42.50 as dollars" }).click()
  await expect(amount(sheet)).toHaveText("$42.5")
  await brandChecks(page, { marigold: "one" })
  // Remove takes back what the reading filled
  await details(summary)
  await summary.getByRole("button", { name: "Remove" }).click()
  await expect(live(sheet)).toHaveText("Receipt removed.")
  await expect(amount(sheet)).toHaveText("$0")
  await expect(sheet.getByRole("button", { name: "Scan receipt" })).toBeFocused()
})

test("blurry photo and a slow reading: friendly copy, Try again, and typing still works", async ({ page }) => {
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await snap(sheet, "receipt-blurry.jpg")
  const failed = sheet.locator("[data-receipt-failure='unreadable']")
  await expect(failed).toBeVisible()
  await expect(failed.getByText("We couldn't read that one", { exact: true })).toBeFocused()
  await expect(live(sheet)).toHaveText("We couldn't read that one. Try again in good light, with the whole receipt in the photo. Or type it in.")
  await axe(page)

  // the reader takes too long → fall back to typing (fault hook: the mock's stand-in for the 25 s timeout)
  await page.evaluate(() => localStorage.setItem("pot.mock.fail", "receipt_timeout"))
  await snap(sheet, "receipt-pingo-doce.jpg")
  await expect(sheet.locator("[data-receipt-failure='timeout']")).toContainText("Reading took too long")
  await typeAmount(page, "30")
  await expect(amount(sheet)).toHaveText("$30")
  await spendNext(page)
  await expect(sheet.getByRole("button", { name: "Get $30 back" })).toBeEnabled()
  await brandChecks(page, { marigold: "one" })
})

test("320 px wide: the receipt row and its details reflow without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one 320 px run is enough")
  await page.setViewportSize({ width: 320, height: 568 })
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await snap(sheet, "receipt-cafe-eur.jpg")
  const summary = sheet.locator("[data-receipt-summary]")
  await expect(summary).toBeVisible()
  await details(summary)
  await summary.getByRole("button", { name: "Read privately: what this means" }).click()
  await summary.evaluate((el) => el.scrollIntoView({ block: "end" }))
  const box = await summary.boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await axe(page)
})
