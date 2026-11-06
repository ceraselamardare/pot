// Any coin (2026-11-04) on the mock data source: more networks and "pay with any coin" in "Add from another app or
// exchange", and the same steps on the pay-in pages (people outside the Pot).
//  1. Add $20 → Another app → Optimism → USDC → the address says "Send 20 USDC on Optimism", the chip "Optimism · USDC",
//     and "Send only USDC on Optimism" sits right under the address.
//  2. Add $20 → Base → ETH → the live quote "Send about 0.008625 ETH · About $20.0x arrives" → the address in ETH →
//     [Simulate sending 0.008625 ETH] → arrived (the quoted dollars) → one tap adds it to the Pot.
//  3. The network list: Tron explains its $101 minimum (and opens at $150); Bitcoin is flagged slow, also on the address.
//  4. A pay-in link paid "from another app": network → coin (+ live quote) → simulated address → simulated transfer →
//     "Thank you!".
// One marigold and axe on every step; the mobile projects save notes/screens/xc-{network,coin,address}-{day,night}.png.
// The page clock is faked (Playwright clock) so the simulator's timings run in seconds.
import { expect, test, type Page } from "@playwright/test"
import { addFlow, asPerson, axe, becomePerson, brandChecks, openedSheet, potAsk } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
const TITLE = "Add from another app or exchange"

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}xc-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

async function openDeposit(page: Page, amount = "20") {
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Add money" }).first().click()
  await openedSheet(page, "Add money to Lisbon Trip")
  await addFlow(page, { amount, source: "Another app or exchange", submit: "Continue" })
  const sheet = await openedSheet(page, TITLE)
  await expect(sheet.getByRole("radio", { name: /^Base/ })).toBeVisible()
  return sheet
}

const stepper = (page: Page) => page.locator("[data-deposit-stepper]")
const statusIs = (page: Page, status: string, timeout = 8_000) => expect(stepper(page)).toHaveAttribute("data-status", status, { timeout })

test.beforeEach(async ({ page }) => {
  await asPerson(page, "maya")
  await page.clock.install()
})

test("Add $20 → Another app → Optimism → USDC: 'Send only USDC on Optimism' right under the address", async ({ page }, info) => {
  const sheet = await openDeposit(page, "20")
  await expect(sheet.getByText("Which network are you sending from?")).toBeVisible()
  await expect(sheet.getByRole("radio", { name: /^Optimism.*USDC, USDT, ETH.*Usually under a minute/ })).toBeVisible()
  await expect(sheet.getByText("Testnet demo: simulated transfer, no real money")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "network", info.project.name)

  await sheet.getByRole("radio", { name: /^Optimism/ }).click()
  await sheet.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(page).toHaveURL(/[?&]net=op/)
  await expect(sheet.locator("[data-step-heading]")).toHaveText("Which coin are you sending?")
  await expect(sheet.getByText("On Optimism")).toBeVisible()
  await expect(sheet.getByRole("radio", { name: /^USDC/ })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByRole("radio", { name: /^USDC/ })).toContainText("send 20 USDC")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await sheet.getByRole("button", { name: "Get address" }).click()

  await expect(sheet.locator("[data-address-step]")).toBeVisible()
  await expect(page).toHaveURL(/[?&]d=dp_/)
  await expect(sheet.getByRole("heading", { name: "Send 20 USDC on Optimism" })).toBeVisible()
  await expect(sheet.getByText("We'll accept 19.80 USDC or more.")).toBeVisible()
  await expect(sheet.locator("[data-network-chip]")).toContainText("Optimism · USDC")
  const only = sheet.locator("[data-send-only]")
  await expect(only).toContainText("Send only USDC on Optimism")
  await expect(only).toContainText("One coin per address")
  // right under the address, above anything else
  const addrBox = await sheet.locator("[data-address]").boundingBox()
  const onlyBox = await only.boundingBox()
  expect(onlyBox!.y).toBeGreaterThan(addrBox!.y)
  expect(onlyBox!.y - (addrBox!.y + addrBox!.height)).toBeLessThan(40)
  await expect(sheet.locator("[data-qr]")).toHaveAttribute("data-qr-text", "POT TESTNET DEMO - DO NOT SEND FUNDS")
  await expect(sheet.getByRole("button", { name: "Simulate sending $20" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
})

test("Add $20 → Base → ETH: 'Send about 0.008625 ETH' → simulated arrival of the quoted dollars → added to the Pot", async ({ page }, info) => {
  const sheet = await openDeposit(page, "20")
  await sheet.getByRole("button", { name: "Continue", exact: true }).click() // Base, the first open network
  await expect(sheet.locator("[data-coin-step]")).toBeVisible()
  await expect(sheet.getByRole("radio", { name: /^ETH.*converted at the live price/ })).toBeVisible()
  await sheet.getByRole("radio", { name: /^ETH/ }).click()
  const quote = sheet.locator("[data-live-quote]")
  await expect(quote.locator("[data-quote-send]")).toHaveText("Send about 0.008625 ETH")
  await expect(quote.locator("[data-quote-arrives]")).toHaveText(/^About \$20\.0\d arrives$/)
  const arrives = (await quote.locator("[data-quote-arrives]").textContent())!.match(/\$20\.0\d/)![0]
  await expect(quote).toContainText("If the price moves more than 3%, nothing is converted and your money is kept safe.")
  await expect(quote.locator("[data-quote-time]")).toContainText("Live price · updated")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "coin", info.project.name)

  await sheet.getByRole("button", { name: "Get address" }).click()
  await expect(sheet.getByRole("heading", { name: "Send 0.008625 ETH on Base" })).toBeVisible()
  await expect(sheet.locator("[data-address-arrives]")).toContainText(`About ${arrives} arrives`)
  await expect(sheet.getByText(/^We'll accept 0\.008\d+ ETH or more\.$/)).toBeVisible()
  await expect(sheet.locator("[data-send-only]")).toContainText("Send only ETH on Base")
  await expect(sheet.locator("[data-network-chip]")).toContainText("Base · ETH")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "address", info.project.name)

  await sheet.getByRole("button", { name: "Simulate sending 0.008625 ETH" }).click()
  await expect(sheet.locator("[data-status-word]")).toHaveText("On its way")
  await expect(sheet.getByText("$20 in ETH from Base to Lisbon Trip")).toBeVisible()
  await page.clock.fastForward(22_000)
  await statusIs(page, "PROCESSING")
  await page.clock.fastForward(16_000)
  await statusIs(page, "SUCCESS")
  // the credit is what the quote promised
  await expect(sheet.getByText(`Your ${arrives} arrived`)).toBeVisible()
  await sheet.getByRole("tab", { name: "Details" }).click()
  await expect(sheet.getByText("0.008625 ETH")).toBeVisible()
  await sheet.getByRole("tab", { name: "Progress" }).click()
  await brandChecks(page, { marigold: "one" })
  await sheet.getByRole("button", { name: "Add it to the Pot" }).click()
  await statusIs(page, "ADDED", 10_000)
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText(`$${(450 + Number(arrives.slice(1))).toFixed(2)}`, { timeout: 10_000 })
})

test("the network list: Tron explains its $101 minimum (and opens at $150); Bitcoin is flagged slow, on the address too", async ({ page }) => {
  let sheet = await openDeposit(page, "20")
  const tron = sheet.getByRole("radio", { name: /^Tron/ })
  await expect(tron).toHaveAttribute("aria-disabled", "true")
  await expect(tron).toContainText("From $101")
  await expect(sheet.getByRole("radio", { name: /^Bitcoin.*Slow: about 20 minutes/ })).toBeVisible()
  await expect(sheet.getByRole("radio", { name: /^Ethereum.*Slower: about 1 to 2 minutes/ })).toBeVisible()

  await sheet.getByRole("radio", { name: /^Bitcoin/ }).click()
  await sheet.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(sheet.locator("[data-live-quote] [data-quote-send]")).toHaveText(/^Send about 0\.000\d+ BTC$/)
  await sheet.getByRole("button", { name: "Get address" }).click()
  await expect(sheet.getByRole("heading", { name: /^Send 0\.000\d+ BTC on Bitcoin$/ })).toBeVisible()
  await expect(sheet.locator("[data-slow-network]")).toHaveText("Bitcoin is slow: it usually takes about 20 minutes after you send.")
  await expect(sheet.getByText("In this demo it arrives in under 30 seconds.")).toBeVisible()
  await axe(page)

  // $150: Tron's USDT can be used
  await sheet.getByRole("button", { name: "Close", exact: true }).first().click()
  sheet = await openDeposit(page, "150")
  await expect(sheet.getByRole("radio", { name: /^Tron/ })).not.toHaveAttribute("aria-disabled", "true")
  await sheet.getByRole("radio", { name: /^Tron/ }).click()
  await sheet.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(sheet.getByRole("radio", { name: /^USDT/ })).toHaveAttribute("aria-checked", "true")
})

test("a pay-in link paid from another app: network → coin (+ live quote) → simulated address → simulated transfer → Thank you", async ({ page }) => {
  await page.goto("/p/lisbon-trip")
  await potAsk(page, "anyone")
  const ask = page.getByRole("dialog", { name: "Ask anyone to pay in" })
  await ask.getByRole("button", { name: "Make pay-in link" }).click()
  await expect(ask.locator("[data-payin='ready']")).toBeVisible()
  const url = (await ask.locator("[data-payin-url]").getAttribute("data-payin-url"))!.replace(/^https?:\/\/[^/]+/, "")
  await page.keyboard.press("Escape")

  await becomePerson(page, "alex")
  await page.goto(url)
  await expect(page.getByRole("heading", { level: 1, name: "Pay Lisbon Trip" })).toBeVisible()
  await page.getByRole("radio", { name: "Another app or exchange" }).click()
  await page.getByRole("button", { name: "Pay $25" }).click()
  const xc = page.locator("[data-give-xc]")
  await expect(xc).toHaveAttribute("data-give-xc", "network")
  await expect(xc.getByRole("heading", { name: "Pay from another app or exchange" })).toBeVisible()
  await expect(xc.getByText("Sending $25 to Lisbon Trip")).toBeVisible()
  await expect(xc.getByText("Testnet demo: simulated transfer, no real money")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await xc.getByRole("radio", { name: /^Solana/ }).click()
  await xc.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(xc).toHaveAttribute("data-give-xc", "coin")
  await xc.getByRole("radio", { name: /^SOL/ }).click()
  await expect(xc.locator("[data-quote-send]")).toHaveText(/^Send about 0\.\d+ SOL$/)
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await xc.getByRole("button", { name: "Get address" }).click()
  await expect(xc).toHaveAttribute("data-give-xc", "address")
  await expect(xc.getByRole("heading", { name: /^Send 0\.\d+ SOL on Solana$/ })).toBeVisible()
  await expect(xc.locator("[data-send-only]")).toContainText("Send only SOL on Solana")
  await expect(xc.locator("[data-qr-band]")).toHaveText("Test only · Do not send")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await xc.getByRole("button", { name: /^Simulate sending 0\.\d+ SOL$/ }).click()
  await expect(xc).toHaveAttribute("data-give-xc", "moving")
  await expect(xc.getByText("Waiting for your SOL on Solana…")).toBeVisible()
  await page.clock.fastForward(31_000)
  const thanks = page.getByRole("heading", { name: "Thank you!" })
  await expect(thanks).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("$25 is on its way to Lisbon Trip.", { exact: true })).toBeVisible()
})
