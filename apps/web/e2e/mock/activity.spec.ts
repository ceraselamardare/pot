// You → "Your Pot dollars" + "Your activity", a member's activity sheet (Members tab), the Add sheet's own Pot
// dollars (Max / none), and the quiet "Receipt ↗" links (feed, history rows, result screens) and the Pot's
// "View on explorer ↗". Day, Night and desktop; axe 0 serious and the brand checks on each screen.
// The mobile projects save notes/screens/you-{day,night}.png (balance + activity).
import { fileURLToPath } from "node:url"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { asPerson, axe, brandChecks, openedSheet, typeAmount } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const TX_URL = /^https:\/\/testnet\.nearblocks\.io\/txns\/[1-9A-HJ-NP-Za-km-z]{43,44}$/

async function expectReceipt(link: Locator) {
  await expect(link).toHaveAttribute("href", TX_URL)
  await expect(link).toHaveAttribute("target", "_blank")
  await expect(link).toHaveAttribute("rel", /noopener/)
  await expect(link).toHaveText("Receipt")
}

/** Maya's instant $84 (Pot rules) → paid into her own Pot dollars. */
async function instantSpend(page: Page) {
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Spend" }).click()
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await typeAmount(page, "84")
  await sheet.getByRole("button", { name: /Groceries/ }).click()
  await sheet.getByRole("button", { name: "Get $84 back" }).click()
  await expect(sheet.getByText("$84 sent to you")).toBeVisible()
  // the result screen's receipt
  await expectReceipt(sheet.getByRole("link", { name: "Receipt for $84 sent to you, opens the explorer" }))
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
}

test.use({ reducedMotion: "reduce" })

test("You: your Pot dollars and your activity across Pots, newest first, with receipts", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/you")
  const balance = page.locator("[data-you-balance]")
  await expect(balance.getByRole("heading", { name: "Your Pot dollars" })).toBeVisible()
  await expect(balance.locator("[data-money]")).toHaveText("$0.00")
  await expect(balance).toContainText("Money paid to you or refunded lands here.")
  await expect(balance).toContainText("Taking money out isn't available yet.")
  await expect(balance.getByRole("button")).toHaveCount(0) // no cash-out in the MVP
  // the nav carries the same number: the You tab's label on phones, a pill in the top bar on desktop
  const navBalance = page.getByRole("link", { name: /Your Pot dollars \$0\.00$/ })
  await expect(navBalance).toBeVisible()
  await expect(navBalance.locator("visible=true").first()).toContainText("$0.00")

  const activity = page.locator("[data-you-activity]")
  await expect(activity.getByRole("heading", { name: "Your activity" })).toBeVisible()
  await expect(activity.locator("[data-activity='added']")).toHaveCount(2) // $150 into Lisbon Trip and Porto Weekend
  await expect(activity.locator("[data-activity='created']")).toHaveCount(2)

  await instantSpend(page)
  await page.goto("/you")
  await expect(page.getByRole("heading", { level: 1, name: "You" })).toBeVisible()
  await expect(balance.locator("[data-money]")).toHaveText("$84.00")
  await expect(page.getByRole("link", { name: /Your Pot dollars \$84\.00$/ })).toBeVisible()
  const first = activity.locator("[data-activity-list] li").first()
  await expect(first).toContainText("You got $84 back for groceries")
  await expect(first).toContainText("Lisbon Trip · Instant ·")
  await expect(first.locator("[data-status='approved']")).toHaveText("Approved")
  await expect(activity.getByRole("heading", { name: "Today" })).toBeVisible()
  await expectReceipt(first.getByRole("link", { name: "Receipt for You got $84 back for groceries, opens the explorer" }))
  await brandChecks(page, { marigold: "at-most-one" })
  await axe(page)
  if (info.project.name !== "desktop") {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${SCREENS}you-${info.project.name === "mobile-night" ? "night" : "day"}.png`, fullPage: true })
  }

  // a row opens that Pot at the item
  await first.getByRole("link").first().click()
  await expect(page).toHaveURL(/\/p\/lisbon-trip$/)
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
})

test("You: the empty state", async ({ page }) => {
  await asPerson(page, "leo")
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.world.v1")) localStorage.setItem("pot.mock.world.v1", JSON.stringify({ v: 1, pots: {}, nextRequestId: 1 }))
  })
  await page.goto("/you")
  const activity = page.locator("[data-you-activity]")
  await expect(activity.getByRole("heading", { name: "Nothing here yet" })).toBeVisible()
  await expect(activity).toContainText("When you add money, ask for money or approve a request, it shows up here.")
  await axe(page)
})

test("Members: tap a person → their activity in this Pot (a sheet in the URL), with receipts", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip?tab=members")
  await page.getByRole("button", { name: "Sam. Opens their activity." }).locator("visible=true").click()
  const sheet = await openedSheet(page, "Sam's activity")
  await expect(page).toHaveURL(/[?&]sheet=person&who=sam(&|$)/)
  const rows = sheet.locator("[data-activity-list] li")
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText("Sam added $150")
  await expect(rows.nth(1)).toContainText("Sam joined")
  await expectReceipt(rows.nth(0).getByRole("link", { name: "Receipt for Sam added $150, opens the explorer" }))
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  // Back closes it (URL state)
  await page.goBack()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=person/)
  // a deep link opens it straight away
  await page.goto("/p/lisbon-trip?sheet=person&who=maya")
  await openedSheet(page, "Your activity in Lisbon Trip")
})

test("Feed and Rules: quiet receipt links and the Pot on the explorer", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const row = page.locator("[data-feed] li", { hasText: "Sam added $150" })
  await expectReceipt(row.getByRole("link", { name: "Receipt for Sam added $150, opens the explorer" }))
  // quiet: ink-muted text, no marigold, no fill
  const look = await row.getByRole("link").evaluate((a) => ({ bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color }))
  expect(look.bg).toBe("rgba(0, 0, 0, 0)")
  expect(look.color).not.toBe("rgb(255, 179, 32)")
  // never the raw hash in the UI
  expect(await page.locator("main").innerText()).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{43,44}/)
  await page.getByRole("tab", { name: "Rules" }).locator("visible=true").click()
  const ex = page.getByRole("link", { name: "View Lisbon Trip on the explorer, opens in a new tab" })
  await expect(ex).toHaveAttribute("href", /^https:\/\/testnet\.nearblocks\.io\/address\/lisbon-trip\./)
  await expect(ex).toHaveAttribute("target", "_blank")
  await expect(ex).toHaveText("View on explorer")
  await axe(page)
})

test("Add money: Pot dollars you already have (none → can't pick; some → Use all)", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/porto-weekend?sheet=add")
  let sheet = await openedSheet(page, "Add money to Porto Weekend")
  const own = sheet.getByRole("radio", { name: /^Pot dollars you have · \$0\.00/ })
  await expect(own).toHaveAttribute("aria-disabled", "true")
  await expect(own).toContainText("You don't have any yet")
  await own.click({ force: true })
  await expect(own).toHaveAttribute("aria-checked", "false")
  await sheet.getByRole("button", { name: "Close" }).click()

  await instantSpend(page)
  await page.goto("/p/porto-weekend?sheet=add")
  sheet = await openedSheet(page, "Add money to Porto Weekend")
  await sheet.getByRole("radio", { name: /^Pot dollars you have · \$84\.00/ }).click()
  await sheet.getByRole("button", { name: "Use all $84.00" }).click()
  await expect(sheet.getByRole("button", { name: "Add $84" })).toBeEnabled()
  await brandChecks(page, { marigold: "one" })
  await sheet.getByRole("button", { name: "Add $84" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$384.00") // landed (the op settles before we leave)
  await page.goto("/you")
  await expect(page.locator("[data-you-balance] [data-money]")).toHaveText("$0.00")
  await expect(page.locator("[data-you-activity] [data-activity-list] li").first()).toContainText("You added $84")
})
