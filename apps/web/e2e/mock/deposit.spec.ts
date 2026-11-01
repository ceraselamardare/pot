// F-21 / D-50 on the mock data source: Add money → "Another app or exchange" → network → simulated address (the QR
// reads "DO NOT SEND", the testnet pill) → [Simulate sending] → the 5-step DepositStepper → "Your $X arrived" →
// one tap adds it to the Pot. Scenarios: ok, partial (+ top-up), slow ("Taking longer" at 5 min), failed, a paused
// network; and the Pot-screen deposit card that takes the marigold while an arrived deposit waits.
// The page clock is faked (Playwright clock), so the simulator's measured timings run in a few seconds.
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, brandChecks, openedSheet } from "../fixtures/pot"

async function openDeposit(page: Page) {
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Add money" }).first().click()
  const add = await openedSheet(page, "Add money to Lisbon Trip")
  await add.getByRole("radio", { name: /Another app or exchange/ }).click()
  await expect(page).toHaveURL(/sheet=add&src=xc/)
  return openedSheet(page, "Add from another wallet or exchange")
}

async function getAddress(page: Page, network = "Base") {
  const sheet = page.getByRole("dialog", { name: "Add from another wallet or exchange" })
  await sheet.getByRole("radio", { name: new RegExp(network) }).click()
  await sheet.getByRole("button", { name: "Get address" }).click()
  await expect(sheet.locator("[data-address-step]")).toBeVisible()
  await expect(page).toHaveURL(/[?&]d=dp_/)
  return sheet
}

const stepper = (page: Page) => page.locator("[data-deposit-stepper]")
/** after a simulated send: wait until the send is recorded (the stepper shows), then jump the clock */
async function sent(page: Page) {
  await expect(stepper(page)).toBeVisible()
}
const statusIs = (page: Page, status: string, timeout = 5_000) => expect(stepper(page)).toHaveAttribute("data-status", status, { timeout })

test.beforeEach(async ({ page }) => {
  await asPerson(page, "maya")
  await page.clock.install()
})

test("ok: network → simulated address (DO NOT SEND) → 5 steps → arrived → one tap adds it to the Pot", async ({ page }) => {
  const sheet = await openDeposit(page)
  await expect(sheet.getByText("Which network are you sending from?")).toBeVisible()
  await expect(sheet.getByRole("radio", { name: /Ethereum.*Slower: about 1 to 2 minutes/ })).toBeVisible()
  await expect(sheet.getByRole("radio", { name: /Base.*Usually under a minute/ })).toBeVisible()
  await brandChecks(page, { marigold: "one" })

  await getAddress(page, "Base")
  await expect(sheet.getByText("Testnet demo: simulated transfer, no real money")).toBeVisible()
  await expect(sheet.getByText("Send 150 USDC on Base")).toBeVisible()
  await expect(sheet.getByText("We'll accept 148.50 USDC or more.")).toBeVisible()
  // the QR encodes a warning, never an address; a band says so on top of it
  await expect(sheet.locator("[data-qr]")).toHaveAttribute("data-qr-text", "POT TESTNET DEMO - DO NOT SEND FUNDS")
  await expect(sheet.locator("[data-qr-band]")).toHaveText("Test only · Do not send")
  await expect(sheet.getByText("Only send USDC on Base. Other coins or networks may be lost.")).toBeVisible()
  await expect(sheet.getByRole("button", { name: /Copy/ })).toHaveCount(0)
  await brandChecks(page, { marigold: "one" })
  await axe(page)

  await sheet.getByRole("button", { name: "Simulate sending $150" }).click()
  await expect(sheet.locator("[data-status-word]")).toHaveText("On its way")
  await expect(sheet.locator('[aria-current="step"]')).toContainText(/Waiting for your transfer|Transfer spotted/)
  await page.clock.fastForward(22_000)
  await statusIs(page, "PROCESSING", 8_000)
  await expect(sheet.locator('[aria-current="step"]')).toContainText("Converting to Pot dollars")
  await page.clock.fastForward(16_000)
  await statusIs(page, "SUCCESS", 8_000)
  await expect(sheet.locator("[data-status-word]")).toHaveText("Arrived")
  await expect(sheet.getByText("Your $149.98 arrived")).toBeVisible()
  await brandChecks(page, { marigold: "one" })

  await sheet.getByRole("button", { name: "Add it to the Pot" }).click()
  await statusIs(page, "ADDED", 10_000)
  await expect(sheet.getByText("Lisbon Trip has it now.")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$599.98", { timeout: 10_000 })
})

test("partial: less than needed → top up the rest → converting → arrived", async ({ page }) => {
  const sheet = await openDeposit(page)
  await getAddress(page, "Arbitrum")
  await sheet.getByRole("button", { name: "Try a problem instead" }).click()
  await sheet.getByRole("button", { name: "Send less than needed" }).click()
  await sent(page)
  await page.clock.fastForward(10_000)
  await statusIs(page, "INCOMPLETE_DEPOSIT", 8_000)
  await expect(sheet.getByText("You sent less than needed")).toBeVisible()
  await expect(sheet.getByText(/Send 28.50 USDC more to the same address by/)).toBeVisible()
  await sheet.getByRole("button", { name: "Simulate sending $28.50 more" }).click()
  await expect(sheet.getByRole("button", { name: "Simulate sending $28.50 more" })).toHaveAttribute("aria-busy", "true").catch(() => undefined)
  await page.waitForTimeout(400)
  await page.clock.fastForward(10_000)
  await statusIs(page, "PROCESSING", 8_000)
  await page.clock.fastForward(16_000)
  await statusIs(page, "SUCCESS", 8_000)
  await expect(sheet.getByText(/Your \$148\.4\d arrived/)).toBeVisible()
})

test('slow: "Taking longer than usual" at 5 min of converting, then it arrives', async ({ page }) => {
  const sheet = await openDeposit(page)
  await getAddress(page, "Arbitrum")
  await sheet.getByRole("button", { name: "Try a problem instead" }).click()
  await sheet.getByRole("button", { name: "A slow transfer" }).click()
  await sent(page)
  await page.clock.fastForward(10_000)
  await statusIs(page, "PROCESSING", 8_000)
  await expect(sheet.getByText("Taking longer than usual")).toHaveCount(0)
  await page.clock.fastForward(5 * 60_000 + 2_000)
  await expect(sheet.getByText("Taking longer than usual")).toBeVisible({ timeout: 8_000 })
  await expect(sheet.locator('[aria-current="step"]')).toContainText("Converting to Pot dollars")
  await page.clock.fastForward(70_000)
  await statusIs(page, "SUCCESS", 8_000)
})

test("failed: says money is safe, offers support and keeps the details", async ({ page }) => {
  const sheet = await openDeposit(page)
  await getAddress(page, "Arbitrum")
  await sheet.getByRole("button", { name: "Try a problem instead" }).click()
  await sheet.getByRole("button", { name: "A failed transfer" }).click()
  await sent(page)
  await page.clock.fastForward(45_000)
  await statusIs(page, "FAILED", 8_000)
  await expect(sheet.locator("[data-status-word]")).toHaveText("Stopped")
  await expect(sheet.getByText("This transfer failed")).toBeVisible()
  await expect(sheet.getByRole("link", { name: "Contact support" })).toBeVisible()
  // Details: network, address, reference for support
  await expect(sheet.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true")
  await expect(sheet.getByText(/^SIMULATED-arb-/)).toBeVisible()
})

test("a paused network can't be picked", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pot.mock.xcPaused", "base"))
  const sheet = await openDeposit(page)
  const base = sheet.getByRole("radio", { name: /Base/ })
  await expect(base).toHaveAttribute("aria-disabled", "true")
  await expect(base).toContainText("Paused right now")
  // the first open network is preselected instead
  await expect(sheet.getByRole("radio", { name: /Arbitrum/ })).toHaveAttribute("aria-checked", "true")
})

test("closing keeps it going: the Pot card shows progress, then 'Your $X arrived' takes the marigold for the one tap", async ({ page }) => {
  const sheet = await openDeposit(page)
  await getAddress(page, "Arbitrum")
  await sheet.getByRole("button", { name: "Simulate sending $150" }).click()
  await expect(sheet.locator("[data-status-word]")).toHaveText("On its way")
  await sheet.getByRole("button", { name: "Close", exact: true }).first().click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/src=xc/)
  const card = page.locator("[data-deposit-cards]")
  await expect(card.getByText("Adding $150 from Arbitrum")).toBeVisible({ timeout: 8_000 })
  await page.clock.fastForward(30_000)
  await expect(card.getByText("Your $149.98 arrived")).toBeVisible({ timeout: 10_000 })
  // one marigold on the screen: the card's button; the hero's Add money turned secondary
  await brandChecks(page, { marigold: "one" })
  await card.getByRole("button", { name: "Add it to the Pot" }).click()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$599.98", { timeout: 10_000 })
  await expect(card).toBeHidden({ timeout: 10_000 })
})

test("Back: address → network (kept) → Add sheet (amount kept); the browser's Back steps the same; no Back once on its way", async ({ page }) => {
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Add money" }).first().click()
  let add = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(add.getByRole("button", { name: "Back" })).toHaveCount(0) // the first step has none
  await add.getByRole("button", { name: "$100", exact: true }).click()
  await add.getByRole("radio", { name: /Another app or exchange/ }).click()
  await expect(page).toHaveURL(/sheet=add&src=xc&amount=100/)
  let sheet = await openedSheet(page, "Add from another wallet or exchange")
  await expect(sheet.getByText("Adding $100 to Lisbon Trip")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Back" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)

  // address → [Back] → the network picker, Solana still picked, focus on its heading, the step announced
  await getAddress(page, "Solana")
  await expect(sheet.getByRole("button", { name: "Back" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await sheet.getByRole("button", { name: "Back" }).click()
  await expect(sheet.locator("[data-network-step]")).toBeVisible()
  await expect(page).not.toHaveURL(/[?&]d=/)
  await expect(sheet.getByRole("radio", { name: /Solana/ })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.locator("[data-step-heading]")).toBeFocused()
  await expect(sheet.locator("[data-step-live]")).toHaveText("Which network are you sending from?")

  // network → [Back] → the Add sheet with $100 still there
  await sheet.getByRole("button", { name: "Back" }).click()
  add = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(page).not.toHaveURL(/src=xc/)
  await expect(add.locator("[data-amount-display]")).toHaveText("$100")
  await expect(add.getByRole("button", { name: "$100", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(add.getByRole("heading", { name: "Add money to Lisbon Trip" })).toBeFocused()
  await brandChecks(page, { marigold: "one" })

  // forward again, then the browser's Back does the same steps
  await add.getByRole("radio", { name: /Another app or exchange/ }).click()
  sheet = await openedSheet(page, "Add from another wallet or exchange")
  await expect(sheet.getByRole("radio", { name: /Solana/ })).toHaveAttribute("aria-checked", "true")
  await getAddress(page, "Base")
  await page.goBack()
  await expect(sheet.locator("[data-network-step]")).toBeVisible()
  await expect(sheet.getByRole("radio", { name: /Base/ })).toHaveAttribute("aria-checked", "true")
  await page.goBack()
  add = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(add.locator("[data-amount-display]")).toHaveText("$100")
  await page.goBack()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=/)

  // once "Simulate sending" is pressed there is no Back, and the browser's Back closes the whole flow
  await openDeposit(page)
  await getAddress(page, "Arbitrum")
  sheet = page.getByRole("dialog", { name: "Add from another wallet or exchange" })
  await sheet.getByRole("button", { name: "Simulate sending $150" }).click()
  await expect(sheet.locator("[data-status-word]")).toHaveText("On its way")
  await expect(sheet.getByRole("button", { name: "Back" })).toHaveCount(0)
  await expect(sheet.getByRole("button", { name: /Change/ })).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=/)
  await expect(page.locator("[data-deposit-cards]").getByText("Adding $150 from Arbitrum")).toBeVisible({ timeout: 8_000 })
})

test("✕ on the address step closes the whole flow (not back to the Add sheet)", async ({ page }) => {
  const sheet = await openDeposit(page)
  await getAddress(page, "Base")
  await sheet.getByRole("button", { name: "Close", exact: true }).first().click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=/)
})
