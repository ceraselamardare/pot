// The group trip cost calculator (/tools/group-trip-cost-calculator; components/marketing/calculator): the server
// renders a full result (no JS needed), presets fill the form, typing updates the result and its live sentence, and
// a bad value is flagged on its field while the result keeps the last good numbers. The math itself is unit-tested
// in lib/marketing/trip-cost.test.ts.
import { expect, test } from "@playwright/test"

const PATH = "/tools/group-trip-cost-calculator"

test("changing the inputs updates the result", async ({ page }) => {
  await page.goto(PATH)
  const each = page.locator("[data-calc-each]")
  const live = page.locator("[data-calc-live]")
  // the server's example: a weekend away for 6 → $385 each, $2,310 in the Pot
  await expect(each).toHaveText("$385.00")
  await expect(page.locator("[data-calc-pot]")).toHaveText("$2,310.00")
  await expect(page.getByRole("button", { name: "Weekend away" })).toHaveAttribute("aria-pressed", "true")

  // a preset fills every field
  await page.getByRole("button", { name: "A week abroad" }).click()
  await expect(page.getByRole("button", { name: "A week abroad" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByLabel("People", { exact: true })).toHaveValue("4")
  await expect(each).toHaveText("$1,445.00")
  await expect(page.locator("[data-calc-cta-text]")).toContainText("$1,445 each")
  await expect(page.locator('[data-row="stay"] [data-status="group"]')).toHaveText("Needs 3 of 4 approvals")

  // typing: 5 people → ($2,100 + $1,900 + $1,400 + $500) × 1.1 = $6,490, ÷ 5 = $1,298 → $1,300 each
  await page.getByLabel("People", { exact: true }).fill("5")
  await expect(each).toHaveText("$1,300.00")
  await expect(live).toHaveText("Each person puts in $1,300. The trip costs $5,900, and $6,500 goes in the Pot.")
  await expect(page.getByRole("button", { name: "A week abroad" })).toHaveAttribute("aria-pressed", "false")
  await expect(page.locator('[data-row="stay"] [data-status="group"]')).toHaveText("Needs 3 of 5 approvals")

  // no cushion → $5,900 ÷ 5 = $1,180 each (already a multiple of $5)
  await page.getByLabel("Cushion", { exact: true }).fill("0")
  await expect(each).toHaveText("$1,180.00")

  // a bad value: flagged on its field, and the result keeps the last good numbers
  const stay = page.getByLabel("Stay, in total", { exact: true })
  await stay.fill("abc")
  await expect(stay).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByText("Enter an amount like 1200 or 85.50.")).toBeVisible()
  await expect(each).toHaveText("$1,180.00")
  await stay.fill("$2,600")
  await expect(stay).not.toHaveAttribute("aria-invalid", "true")
  // $6,400 ÷ 5 = $1,280
  await expect(each).toHaveText("$1,280.00")
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })
  test("the page still shows a full example result and a working Start a Pot link", async ({ page }) => {
    await page.goto(PATH)
    await expect(page.locator("[data-calc-each]")).toHaveText("$385.00")
    await expect(page.locator("[data-calc-breakdown]")).toContainText("Needs 4 of 6 approvals")
    await expect(page.locator("[data-marketing-hero]").getByRole("link", { name: "Start a Pot" })).toHaveAttribute("href", "/pots?sheet=create")
  })
})
