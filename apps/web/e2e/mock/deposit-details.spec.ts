// Money-in details (2026-11-04, ?sheet=deposit&d=<key>) on the mock data source, in every project.
//  1. The showcase seed: Ski Chalet's Leo added $300 from another app (ETH on Base: the simulated transfer's pill,
//     sent / arrived / rate / took, five moments, only the NEAR receipt), Sam's demo dollars; Leo's Birthday's Sam
//     from his Pot dollars and Tomás's pay-in through Sam's $25 link with a note. Each row is a button named with its
//     source and "Details"; each sheet: one status chip (icon + word), no marigold, axe 0 serious; Back closes it.
//  2. The real flow: Add $20 → Base → ETH → simulated transfer → "Add it to the Pot" → the new row says "ETH on Base"
//     and its details show the coin, what arrived and the timeline.
//  3. Who can open it: a person outside the Pot gets no details (the Pot's join screen); the record's money from
//     outside has "See details" for members only (a visitor keeps the public receipt); a person's activity and
//     You → Your activity open it too. 320 px: no sideways scroll.
// The mobile projects save notes/screens/deposit-details-{xc,demo,pot-dollars,payin}-{day,night}.png.
import { expect, test, type Locator, type Page } from "@playwright/test"
import { addFlow, asPerson, axe, becomePerson, brandChecks, openedSheet } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
const TX = /[?&]sheet=deposit&d=[1-9A-HJ-NP-Za-km-z]{43,44}(&|$)/

test.use({ reducedMotion: "reduce" })

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}deposit-details-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

async function showcase(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.seed")) localStorage.setItem("pot.mock.seed", "showcase")
  })
}

/** A details sheet's common anatomy: one status chip (icon + word), no marigold, axe clean. */
async function checkSheet(page: Page, sheet: Locator) {
  await expect(sheet.locator("[data-deposit-status='added'] [data-status='approved']")).toHaveText("Added")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
}

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(0)
}

test("each source kind opens with its details (showcase): another app, demo dollars, Pot dollars, a pay-in", async ({ page }, info) => {
  const p = info.project.name
  await showcase(page)
  await asPerson(page, "maya")
  await page.goto("/p/ski-chalet")
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet" })).toBeVisible()

  // another app: the row says where it came from, the sheet the rest
  const leo = page.getByRole("button", { name: /^Leo added \$300\. From another app, ETH on Base\..*Details$/ })
  await expect(leo.locator("[data-row-source='xc']")).toHaveText("ETH on Base")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await leo.click()
  await expect(page).toHaveURL(TX)
  let sheet = await openedSheet(page, "Leo added $300")
  const card = sheet.locator("[data-deposit-source='xc']")
  await expect(card.locator("[data-deposit-pair]")).toHaveText("ETH on Base")
  for (const line of ["From another app", "0.1293 ETH → $300.00", "About $2,320.18 per ETH · 58 s"]) await expect(card).toContainText(line)
  await expect(card.locator("[data-deposit-sim]")).toContainText("Testnet demo: simulated transfer")
  await expect(sheet.locator("[data-deposit-timeline] li")).toHaveCount(5)
  await expect(sheet.locator("[data-deposit-timeline]")).toContainText("Sent from Base")
  // a simulated transfer: only the receipt on NEAR (no fake origin-network link, no NEAR Intents page)
  await expect(sheet.locator("[data-deposit-receipt]")).toHaveCount(1)
  await expect(sheet.locator("[data-deposit-receipt='near']")).toHaveAttribute("href", /^https:\/\/testnet\.nearblocks\.io\/txns\//)
  await checkSheet(page, sheet)
  await shot(page, "xc", p)
  if (p === "mobile-day") {
    await page.setViewportSize({ width: 320, height: 640 })
    await noSidewaysScroll(page)
    await axe(page)
    await page.setViewportSize({ width: 390, height: 844 })
  }
  // Back closes it
  await page.goBack()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=deposit/)

  // demo dollars
  await page.getByRole("button", { name: /^Sam added \$300\. Demo dollars\..*Details$/ }).click()
  sheet = await openedSheet(page, "Sam added $300")
  await expect(sheet.locator("[data-deposit-source='demo']")).toContainText("Test money for trying Pot. No real money moved.")
  await expect(sheet.locator("[data-deposit-timeline]")).toHaveCount(0)
  await expect(sheet.locator("[data-receipt]")).toHaveCount(1)
  await checkSheet(page, sheet)
  await shot(page, "demo", p)
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  // Pot dollars (Leo's Birthday)
  await page.goto("/p/leos-birthday")
  await page.getByRole("button", { name: /^Sam added \$50\. Pot dollars\..*Details$/ }).click()
  sheet = await openedSheet(page, "Sam added $50")
  await expect(sheet.locator("[data-deposit-source='pot_dollars']")).toContainText("Money a Pot already paid Sam.")
  await checkSheet(page, sheet)
  await shot(page, "pot-dollars", p)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  // a pay-in with a note, through Sam's $25 link
  await page.getByRole("button", { name: /^Tomás sent a gift of \$25\..*Details$/ }).click()
  await expect(page).toHaveURL(/[?&]sheet=deposit&d=g0000000000000000000tms1(&|$)/)
  sheet = await openedSheet(page, "Tomás sent a $25 gift")
  await expect(sheet.locator("[data-deposit-source='payin']")).toContainText("Through Sam's pay-in link")
  await expect(sheet.locator("[data-deposit-source='payin']")).toContainText("Set to $25")
  await expect(sheet.locator("[data-gift-note]")).toContainText("For the cake. Don't tell him!")
  await checkSheet(page, sheet)
  await shot(page, "payin", p)

  // the pay-in push's older link opens the same sheet
  await page.goto("/p/leos-birthday?sheet=gift&gift=g0000000000000000000tms1")
  await openedSheet(page, "Tomás sent a $25 gift")
})

test("an add from another app (Base → ETH, simulated) becomes a row whose details show the coin and the timeline", async ({ page }) => {
  await asPerson(page, "maya")
  await page.clock.install()
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Add money" }).first().click()
  await openedSheet(page, "Add money to Lisbon Trip")
  await addFlow(page, { amount: "20", source: "Another app or exchange", submit: "Continue" })
  const add = await openedSheet(page, "Add from another app or exchange")
  await add.getByRole("button", { name: "Continue", exact: true }).click() // Base
  await add.getByRole("radio", { name: /^ETH/ }).click()
  await add.getByRole("button", { name: "Get address" }).click()
  await add.getByRole("button", { name: /^Simulate sending 0\.00\d+ ETH$/ }).click()
  const status = add.locator("[data-deposit-stepper]")
  await expect(add.locator("[data-status-word]")).toHaveText("On its way")
  await page.clock.fastForward(22_000)
  await expect(status).toHaveAttribute("data-status", "PROCESSING", { timeout: 8_000 })
  await page.clock.fastForward(16_000)
  await expect(status).toHaveAttribute("data-status", "SUCCESS", { timeout: 8_000 })
  await add.getByRole("button", { name: "Add it to the Pot" }).click()
  await expect(add.locator("[data-deposit-stepper]")).toHaveAttribute("data-status", "ADDED", { timeout: 10_000 })
  await add.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  const row = page.getByRole("button", { name: /^Maya added \$20\. From another app, ETH on Base\..*Details$/ })
  await expect(row).toBeVisible({ timeout: 10_000 })
  await row.click()
  const sheet = await openedSheet(page, "You added $20")
  const card = sheet.locator("[data-deposit-source='xc']")
  await expect(card.locator("[data-deposit-pair]")).toHaveText("ETH on Base")
  await expect(card).toContainText(/0\.00\d+ ETH → \$20\.0\d/)
  await expect(card.locator("[data-deposit-sim]")).toBeVisible()
  // every moment known, in order
  await expect(sheet.locator("[data-deposit-timeline] li")).toHaveCount(5)
  await expect(sheet.locator("[data-deposit-timeline]")).not.toContainText("Time not known")
  await expect(sheet.locator("[data-deposit-receipt]")).toHaveCount(1)
  await checkSheet(page, sheet)
})

test("members only: an outsider can't open it; the record's 'See details' is for members; a person's activity and You open it", async ({ page }) => {
  await showcase(page)
  await asPerson(page, "maya")
  // You → Your activity: my add opens its details on the Pot
  await page.goto("/you")
  const mine = page.locator("[data-you-activity] [data-activity='added']").first()
  await expect(mine.getByRole("link")).toHaveAccessibleName(/^You added \$\d+\..*Details$/)
  await mine.getByRole("link").click()
  await expect(page).toHaveURL(TX)
  await openedSheet(page, /^You added \$\d+$/)

  // a person's activity (Members → Leo) → his add from another app
  await page.goto("/p/ski-chalet?sheet=person&who=leo")
  const person = await openedSheet(page, "Leo's activity")
  await person.getByRole("button", { name: /^Leo added \$300\. From another app, ETH on Base\..*Details$/ }).click()
  await openedSheet(page, "Leo added $300")
  await page.goBack()
  await openedSheet(page, "Leo's activity")

  // the record: members get "See details" on money from outside
  await page.goto("/p/leos-birthday/record")
  const see = page.locator("[data-record-gift-details]").first()
  await expect(see).toBeVisible()
  await see.click()
  await expect(page).toHaveURL(/\/p\/leos-birthday\?sheet=deposit&d=g[0-9a-z]{23}/)
  await expect(page.getByRole("dialog")).toBeVisible()

  // someone outside the Pot: the record keeps only the public receipt, a deep link opens no details
  const key = new URL(page.url()).searchParams.get("d")!
  await becomePerson(page, "alex")
  await page.goto("/p/leos-birthday/record")
  await expect(page.locator("[data-record-gifts]")).toBeVisible()
  await expect(page.locator("[data-record-gift-details]")).toHaveCount(0)
  await page.goto(`/p/leos-birthday?sheet=deposit&d=${key}`)
  await expect(page.locator("[data-deposit-details]")).toHaveCount(0)
  await expect(page.getByRole("dialog", { name: /paid in|gift/ })).toHaveCount(0)
  await axe(page)
})
