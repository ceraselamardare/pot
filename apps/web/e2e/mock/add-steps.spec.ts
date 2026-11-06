// The Add money sheet in two steps (2026-11-03, like Spend): 1 "How much?" (amount, keypad, suggestions, [Next]) →
// 2 "How do you want to add it?" (&step=source: the source, "will have" + "you'd get back", [Add $X] / [Continue],
// [Back]). Neither step scrolls on a 390 × 844 phone, Day and Night; one marigold per step; Back (in the sheet and the
// browser's) keeps the amount; a linked amount opens straight on step 2. Screens: notes/screens/add-step{1,2}-*.png.
import { expect, test, type Locator, type Page } from "@playwright/test"
import { addFlow, addNext, asPerson, axe, brandChecks, openedSheet, typeAmount } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
const shotName = (name: string, project: string) => `${SCREENS}${name}-${project === "mobile-night" ? "night" : "day"}.png`
test.use({ reducedMotion: "reduce" })

/** The sheet's body (content vs window), footer and popup heights, in CSS px. */
async function heights(sheet: Locator) {
  return sheet.evaluate((popup) => {
    const body = popup.querySelector<HTMLElement>("[data-base-ui-swipe-ignore]")!
    const footer = body.nextElementSibling as HTMLElement | null
    return {
      content: body.scrollHeight,
      window: body.clientHeight,
      footer: Math.round(footer?.getBoundingClientRect().height ?? 0),
      popup: Math.round(popup.getBoundingClientRect().height),
      viewport: window.innerHeight,
    }
  })
}
async function noScroll(sheet: Locator, what: string) {
  const h = await heights(sheet)
  console.log(`ADD-HEIGHTS ${what}: ${JSON.stringify(h)}`)
  expect(h.content - h.window, `${what} scrolls: ${JSON.stringify(h)}`).toBeLessThanOrEqual(1)
}
async function openAdd(page: Page) {
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  await page.getByRole("button", { name: "Add money", exact: true }).first().click()
  return openedSheet(page, "Add money to Lisbon Trip")
}

test("two steps: $50 → [Next] → how to add it → [Add $50]; nothing scrolls; Back keeps the amount", async ({ page }, info) => {
  await asPerson(page, "maya")
  // the first-time "digital dollar" note shows on step 2 (the tallest step 2)
  await page.addInitScript(() => localStorage.removeItem("pot.usdcNote.seen"))
  const sheet = await openAdd(page)
  const mobile = info.project.name !== "desktop"

  // step 1: How much?
  await expect(sheet.locator("[data-add-body='1']")).toBeVisible()
  await expect(sheet.getByText("How much?")).toBeVisible()
  await expect(sheet.getByRole("radiogroup")).toHaveCount(0)
  await expect(sheet.getByRole("button", { name: "Next", exact: true })).toBeDisabled()
  await expect(sheet.getByRole("button", { name: "Back" })).toHaveCount(0)
  await typeAmount(page, "50")
  await expect(sheet.locator("[data-amount-display]")).toHaveText("$50")
  await expect(sheet.getByRole("button", { name: "$50", exact: true })).toHaveAttribute("aria-pressed", "true")
  await brandChecks(page, { marigold: "one" }) // [Next]
  await axe(page)
  if (mobile) {
    await noScroll(sheet, `step 1 ${info.project.name}`)
    await page.screenshot({ path: shotName("add-step1", info.project.name) })
  }

  // step 2: How do you want to add it?
  await addNext(page)
  await expect(page).toHaveURL(/sheet=add&step=source/)
  await expect(sheet.getByRole("heading", { name: "How do you want to add it?" })).toBeFocused()
  await expect(sheet.locator("[data-step-live]")).toHaveText("How do you want to add it?")
  await expect(sheet.locator("[data-add-amount]")).toHaveText("How much? $50")
  await expect(sheet.getByRole("radio", { name: /^Free test dollars/ })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.locator("[data-add-after]")).toHaveText("Lisbon Trip will have $500.00.")
  await expect(sheet.locator("[data-add-refund]")).toHaveText(/^After this, you'd get back \$[\d,.]+ if the Pot closed\.$/)
  await expect(sheet.getByText("Pot keeps money in USDC, a digital dollar.", { exact: false })).toBeVisible()
  await brandChecks(page, { marigold: "one" }) // [Add $50]
  await axe(page)
  if (mobile) {
    await noScroll(sheet, `step 2 ${info.project.name}`)
    await page.screenshot({ path: shotName("add-step2", info.project.name) })
  }
  // another app: [Continue] is then the one marigold
  await sheet.getByRole("radio", { name: /^Another app or exchange/ }).click()
  await expect(sheet.getByRole("button", { name: "Continue", exact: true })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  if (mobile) await noScroll(sheet, `step 2 another app ${info.project.name}`)
  await sheet.getByRole("radio", { name: /^Free test dollars/ }).click()

  // the browser's Back → step 1 with $50; Forward → step 2 again
  await page.goBack()
  await expect(sheet.locator("[data-add-body='1']")).toBeVisible()
  await expect(sheet.locator("[data-amount-display]")).toHaveText("$50")
  await page.goForward()
  await expect(sheet.locator("[data-add-body='2']")).toBeVisible()
  await expect(sheet.locator("[data-add-amount]")).toHaveText("How much? $50")
  // the in-sheet [Back] the same; then on again and add
  await sheet.getByRole("button", { name: "Back" }).click()
  await expect(sheet.locator("[data-add-body='1']")).toBeVisible()
  await expect(page).not.toHaveURL(/step=source/)
  await addFlow(page, { next: true, submit: "Add $50" })
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByText("Adding $50…")).toBeVisible()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$500.00", { timeout: 10_000 })
  // adding closes the sheet and unwinds both of its entries
  await expect(page).not.toHaveURL(/sheet=/)
})

test("a linked amount opens on step 2 (one entry); [Change] reaches the keypad; the browser's Back leaves", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  // like a top-up card's [Add $50]: openSheet("add", { amount }) pushes one entry
  // (Next follows a native pushState, as with lib/client/sheet.ts openSheet)
  await page.evaluate(() => window.history.pushState({ potSheet: 1 }, "", "/p/lisbon-trip?sheet=add&amount=50"))
  const sheet = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(sheet.locator("[data-add-body='2']")).toBeVisible()
  await expect(page).toHaveURL(/sheet=add&amount=50&step=source/)
  await expect(sheet.locator("[data-add-amount]")).toHaveText("How much? $50")
  await brandChecks(page, { marigold: "one" })
  await sheet.getByRole("button", { name: "Change the amount" }).click()
  await expect(sheet.locator("[data-add-body='1']")).toBeVisible()
  await expect(sheet.locator("[data-amount-display]")).toHaveText("$50")
  await expect(page).not.toHaveURL(/step=source/)
  await page.goBack()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=/)
})

test("a cold &step=source with nothing to add opens on step 1", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip?sheet=add&step=source")
  const sheet = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(sheet.locator("[data-add-body='1']")).toBeVisible()
  await expect(page).not.toHaveURL(/step=source/)
})

test("320 × 568: both steps reflow (no sideways scroll), the ask and the keypad stay pinned", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one small phone is enough")
  await page.setViewportSize({ width: 320, height: 568 })
  await asPerson(page, "maya")
  const sheet = await openAdd(page)
  await typeAmount(page, "50")
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth)
  expect(await wide()).toBeLessThanOrEqual(320)
  console.log(`ADD-HEIGHTS step 1 320x568: ${JSON.stringify(await heights(sheet))}`)
  await expect(sheet.getByRole("button", { name: "Next", exact: true })).toBeInViewport()
  await addNext(page)
  expect(await wide()).toBeLessThanOrEqual(320)
  console.log(`ADD-HEIGHTS step 2 320x568: ${JSON.stringify(await heights(sheet))}`)
  await expect(sheet.getByRole("button", { name: "Add $50" })).toBeInViewport()
})
