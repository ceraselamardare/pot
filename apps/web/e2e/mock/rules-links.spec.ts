// "Send by link" in an old Pot, end to end on the mock data source (classic seed: Lisbon Trip was made before hub
// 1.1.0, so its extras are all off, like a real pre-1.1.0 Pot on testnet):
//  1. Settings → Rules says "Sending money by link to people outside: off."; the section ends calmly (a footnote, one
//     "Changing the rules" card with one secondary button); Settings → Record has quiet ink rows (no gold text).
//  2. Spend → "Someone else" says it's off and names the rule → [Change the rules] → the rules sheet with the
//     "Send by link" switch → on → [Ask the group] (extras via propose_rules) → Sam reviews the change in words
//     ("…: off." struck through above "…: on.") and approves → Settings says on → Maya's Spend "Someone else" now
//     offers the link fields and an enabled "Send $30 by link".
//  3. 320 px: Settings and the change sheet reflow without a sideways scroll.
// Day, Night and desktop; axe 0 serious and the brand checks on every screen. The mobile projects save
// notes/screens/rules-tab-{day,night}.png and rules-change-links-{day,night}.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, spendFlow } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const shot = (info: { project: { name: string } }, name: string) =>
  info.project.name === "desktop" ? null : `${SCREENS}${name}-${info.project.name === "mobile-night" ? "night" : "day"}.png`

test.use({ reducedMotion: "reduce" })

async function rulesTab(page: Page) {
  await page.goto("/p/lisbon-trip?tab=rules")
  await expect(page.locator("[data-rules-list]").locator("visible=true")).toBeVisible()
  return page.locator("section[aria-labelledby='rules-h']").locator("visible=true")
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
}

test("an old Pot turns on Send by link; then Spend → Someone else works", async ({ page }, info) => {
  await asPerson(page, "maya")
  const tab = await rulesTab(page)
  await expect(tab.locator("[data-rules-list]")).toContainText("Sending money by link to people outside: off.")
  // the footer: footnote, one card, quiet rows
  await expect(tab.locator("[data-rules-footnote]")).toHaveText("The Pot enforces these rules itself. No one, including Maya, can skip them.")
  const card = tab.getByRole("region", { name: "Changing the rules" })
  await expect(card.getByText("Changes apply once 2 of 3 approve.")).toBeVisible()
  await expect(card.getByRole("button")).toHaveCount(1)
  const more = page.locator("[data-settings]").locator("visible=true").getByRole("region", { name: "Record" })
  await expect(more.getByRole("link")).toHaveText(["See every spend", "On the explorer"])
  // the rows are ink (not the link gold): same colour as the page's body text
  const colors = await more.getByRole("link").evaluateAll((as) => as.map((a) => getComputedStyle(a).color))
  const ink = await tab.locator("[data-rules-list] p").first().evaluate((p) => getComputedStyle(p).color)
  expect(colors).toEqual([ink, ink])
  await brandChecks(page, { marigold: "one" }) // the hero's Add money
  await axe(page)
  const s1 = shot(info, "rules-tab")
  if (s1) {
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: s1 })
  }

  // Spend → Someone else: off, with the rule's name and a way there
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  const spend = await openedSheet(page, "Spend from Lisbon Trip")
  await spendFlow(page, { amount: "30", reason: "Food", payee: "Someone else" })
  const off = spend.locator("[data-paylink-off]")
  await expect(off).toContainText("Turn on “Send by link” in the rules.")
  await expect(spend.getByRole("button", { name: /by link/ })).toBeDisabled()
  await off.getByRole("button", { name: "Change the rules" }).click()

  // the rules sheet, swapped in, with the switch in view; prefilled from reality (all off)
  const sheet = await openedSheet(page, "Ask the group to change a rule")
  await expect(page).toHaveURL(/[?&]sheet=rules&rule=links/)
  const links = sheet.getByRole("switch", { name: "Send by link" })
  await expect(links).toBeInViewport()
  await expect(links).toHaveAttribute("aria-checked", "false")
  await expect(sheet.getByRole("switch", { name: "Trust grows" })).toHaveAttribute("aria-checked", "false")
  await expect(sheet.getByRole("radio", { name: "Change the One OK up to, now Off" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Ask the group" })).toBeDisabled()
  await links.click()
  await expect(links).toHaveAttribute("aria-checked", "true")
  await expect(sheet.locator("[data-rules-preview='links']")).toHaveText("Sending money by link to people outside: on.")
  await expect(sheet.getByText("This needs 2 of 3 approvals.")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  const s2 = shot(info, "rules-change-links")
  if (s2) {
    await links.scrollIntoViewIfNeeded()
    await page.screenshot({ path: s2 })
  }
  await sheet.getByRole("button", { name: "Ask the group" }).click()
  await expect(sheet.getByText("Sent to the group. Your approval is counted. It needs 1 more.")).toBeVisible()
  await expect(sheet.locator("[data-rules-diff-extra='links']")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  // ✕ / Done left both sheets: the Pot, no sheet params
  await expect(page).not.toHaveURL(/sheet=|rule=/)

  // Sam approves, from the review: the change in plain words
  await becomePerson(page, "sam")
  await page.goto("/p/lisbon-trip?tab=rules")
  await page.locator("[data-rules-pending]").locator("visible=true").getByRole("button", { name: "Review" }).click()
  const review = await openedSheet(page, "Maya wants to change a rule")
  const diff = review.locator("[data-rules-diff-extra='links']")
  await expect(diff.locator(".line-through")).toHaveText("Sending money by link to people outside: off.")
  await expect(diff).toContainText("Sending money by link to people outside: on.")
  await expect(review.locator("[data-rules-diff] > div")).toHaveCount(1)
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await review.getByRole("button", { name: "Approve the change" }).click()
  await expect(review.getByText("Approved. The new rules apply from now on.")).toBeVisible()
  await review.getByRole("button", { name: "Done" }).click()
  await expect(page.locator("[data-rules-list]").locator("visible=true")).toContainText("Sending money by link to people outside: on.")

  // Maya: Spend → Someone else now works
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  const spend2 = await openedSheet(page, "Spend from Lisbon Trip")
  await spendFlow(page, { amount: "30", reason: "Food", payee: "Someone else" })
  await expect(spend2.locator("[data-paylink-off]")).toHaveCount(0)
  await expect(spend2.locator("[data-paylink-fields]")).toBeVisible()
  await expect(spend2.getByRole("button", { name: "Send $30 by link" })).toBeEnabled()
  await brandChecks(page, { marigold: "one" })
})

test("320 px: Settings and the change sheet reflow", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one width check is enough")
  await page.setViewportSize({ width: 320, height: 720 })
  await asPerson(page, "maya")
  const tab = await rulesTab(page)
  await page.locator("[data-settings]").locator("visible=true").getByRole("region", { name: "Record" }).scrollIntoViewIfNeeded()
  await noSideScroll(page)
  await page.screenshot({ path: `${SCREENS}rules-tab-day-320.png` })
  await tab.getByRole("button", { name: "Ask the group to change a rule" }).click()
  const sheet = await openedSheet(page, "Ask the group to change a rule")
  await sheet.getByRole("switch", { name: "Send by link" }).scrollIntoViewIfNeeded()
  await noSideScroll(page)
  const box = await sheet.getByRole("switch", { name: "Send by link" }).boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  expect(box!.height).toBeGreaterThanOrEqual(44)
})
