// Gifts (hub 1.2.0; notes/gifts-plan.md) against the real chain + our API. **Written, not run**: it needs hub 1.2.0
// deployed on the preview (human OK), FLAG_GIFTS + NEXT_PUBLIC_FLAG_GIFTS on, and migration 0005 applied to the database
// the server uses (the sdk intents, the relayer's R16/R17 and its hooks into server/features/gifts are wired). It skips
// itself unless get_config.version is 1.2.x.
// Two throwaway people (NEAR wallet, the e2e mock wallet): Ana creates ONE Pot and adds $50; she makes a gift link
// (giver chooses) and a fixed $25 one; Cleo (0 NEAR, never in the Pot) opens the open link, signs in inline, sends $10 ☕
// with a note → "Thank you!"; the hub's gifts view counts it, the Pot's balance grew by $10, Cleo's NEAR didn't move,
// and Ana's feed shows "Cleo · Sent a gift ☕" with the note in its details. Then the $25 link (one button), the public
// page (off → Ana turns it on → Cleo gives with "show my name" → listed), turning the link off (the giver's screen says
// so, the relayer refuses a raw retry) and gifts off (set_gifts false → "isn't taking gifts right now").
// Cost: 2 accounts (≈ 0.017 NEAR) + 1 Pot (≈ 0.07 NEAR hub float) + relayer gas for create, add, 3 gifts, 2 set_gifts,
// the faucet's demo dollars for Cleo. Run it against a private database (never the shared `pot` DB), with the lock:
//   E2E_TESTNET=1 E2E_PORT=2947 NEXT_DIST_DIR=.next-gifts-testnet FLAG_GIFTS=true NEXT_PUBLIC_FLAG_GIFTS=true \
//   DATABASE_URL=postgres://pot:pot@localhost:54329/pot_gifts DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_gifts \
//   scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts gifts
// (apply 0005 to pot_gifts first: DATABASE_URL_UNPOOLED=… pnpm --filter web exec drizzle-kit migrate)
import { skipOnboarding } from "../fixtures/onboarding"
import type { GiftsView } from "@pot/sdk"
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { addFlow, createPot } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, nearBalance, potBalance, usd, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Gift Trip ${RUN}`
const LINK_RE = /\/g\/([a-z0-9-]+)\/([A-Za-z0-9_-]{22})$/

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxC: BrowserContext
let A: Page
let C: Page
let slug = ""
let accC = ""
let accounts: TestAccounts
let openUrl = ""
let fixedUrl = ""

const hubVersion = async (): Promise<string> => (await chain.hub.getConfig().catch(() => null))?.value.version ?? ""
/** The hub's gifts view (hub 1.2.0 `get_gifts` through the sdk's getGifts). */
const giftsView = async (s: string): Promise<GiftsView | null> => (chain.hub.getGifts ? (await chain.hub.getGifts(dao(s))).value : null)
const path = (url: string) => new URL(url).pathname

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  test.skip(!/^1\.2\./.test(await hubVersion()), "needs hub 1.2.x")
  accounts = await createTestAccounts(["Ana", "Cleo"])
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ctxA = await browser.newContext(opts)
  await skipOnboarding(ctxA) // the first-run intro (e2e/fixtures/onboarding.ts)
  ctxC = await browser.newContext(opts)
  await skipOnboarding(ctxC) // the first-run intro (e2e/fixtures/onboarding.ts)
  A = await ctxA.newPage()
  C = await ctxC.newPage()
  await useWallet(A, accounts.people[0]!)
  await useWallet(C, accounts.people[1]!)
  accC = accounts.people[1]!.accountId
})

test.afterAll(async () => {
  await ctxA?.close()
  await ctxC?.close()
  await accounts?.release()
})

/** Ask anyone (?sheet=payin, "pay in" 2026-11-03) with "What's it for? A gift ☕": a gift-tone pay-in link. */
async function makeLink(fixed?: string): Promise<string> {
  await A.goto(`/p/${slug}?sheet=payin`)
  const sheet = A.getByRole("dialog", { name: "Ask anyone to pay in" })
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole("radio", { name: "A gift ☕" }).click()
  if (fixed) {
    await sheet.getByRole("radio", { name: "Fixed" }).click()
    await sheet.getByRole("textbox", { name: "Amount in dollars" }).fill(fixed)
  }
  await sheet.getByRole("button", { name: "Make pay-in link" }).click()
  await expect(sheet.locator("[data-payin='ready']")).toBeVisible({ timeout: 30_000 })
  const url = (await sheet.locator("[data-payin-url]").getAttribute("data-payin-url"))!
  expect(url).toMatch(LINK_RE)
  await A.keyboard.press("Escape")
  return url
}

test("setup: Ana creates one Pot, adds $50, makes an open and a $25 gift link", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  await accountOf(A.request)
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  await createPot(A, { name: POT_NAME })
  await expect(A).toHaveURL(/\/p\/gift-trip-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  slug = new URL(A.url()).pathname.split("/")[2]!
  await A.getByRole("dialog").getByRole("button", { name: "Close" }).click()
  await A.getByRole("button", { name: "Add money" }).first().click()
  const add = A.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  for (let i = 0; i < 6; i++) await add.getByRole("button", { name: "delete", exact: true }).click()
  await addFlow(A, { amount: "50", submit: "Add $50" })
  expect(await eventually(() => potBalance(slug), (b) => b === usd(50), 60_000)).toBe(usd(50))
  expect((await giftsView(slug))?.on, "gifts are on for every Pot").toBe(true)
  openUrl = await makeLink()
  fixedUrl = await makeLink("25")
})

test("Cleo (0 NEAR, not in the Pot) sends $10 ☕ with a note through the open link", async () => {
  test.skip(!openUrl, "needs setup")
  const nearBefore = await nearBalance(accC)
  await C.goto(path(openUrl))
  await expect(C.getByRole("heading", { level: 1, name: `Send ${POT_NAME} a gift` })).toBeVisible({ timeout: 30_000 })
  await C.getByRole("radio", { name: "$10, 2 coffees" }).click()
  await C.getByRole("textbox", { name: "Note (optional)" }).fill("From Cleo, with love")
  await C.getByRole("button", { name: "Send $10 ☕" }).click()
  await expect(C.getByRole("heading", { name: "Sign in to send your $10 gift" })).toBeVisible()
  await walletSignIn(C)
  await expect(C.getByRole("heading", { name: "Thank you!" })).toBeVisible({ timeout: 90_000 })
  expect(await eventually(() => potBalance(slug), (b) => b === usd(60), 60_000)).toBe(usd(60))
  const v = await eventually(() => giftsView(slug), (g) => g?.count === 1, 60_000)
  expect(v).toMatchObject({ on: true, total: usd(10), count: 1, accepting: true })
  expect(await nearBalance(accC)).toBe(nearBefore) // gasless
})

test("Ana's feed: 'Cleo · Sent a gift ☕', the note in its details", async () => {
  test.skip(!slug, "needs setup")
  await A.goto(`/p/${slug}`)
  const row = A.getByRole("button", { name: /sent a gift of \$10\. Has a note/ }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.click()
  await expect(A.getByRole("dialog").locator("[data-gift-note]")).toContainText("From Cleo, with love")
  await A.keyboard.press("Escape")
})

test("the $25 link has one button", async () => {
  test.skip(!fixedUrl, "needs setup")
  await C.goto(path(fixedUrl))
  await expect(C.getByText("This link is for a $25 gift.")).toBeVisible({ timeout: 30_000 })
  await C.getByRole("button", { name: "Send $25 ☕" }).click()
  await expect(C.getByRole("heading", { name: "Thank you!" })).toBeVisible({ timeout: 90_000 })
  expect(await eventually(() => potBalance(slug), (b) => b === usd(85), 60_000)).toBe(usd(85))
})

test("the public page: off → Ana turns it on → Cleo is listed only because she chose to be", async () => {
  test.skip(!slug, "needs setup")
  await C.goto(`/give/${slug}`)
  await expect(C.getByRole("heading", { name: "This page isn't open" })).toBeVisible({ timeout: 30_000 })
  // Settings → Money from outside → Public page: on, as a gift page
  await A.goto(`/p/${slug}?tab=settings&sheet=publicpage`)
  const sheet = A.getByRole("dialog", { name: "Public page" })
  await sheet.getByRole("switch", { name: "Public page" }).click()
  await expect(sheet.getByRole("switch", { name: "Public page" })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 })
  await sheet.getByRole("radio", { name: "A gift ☕" }).click()
  await expect(sheet.getByRole("radio", { name: "A gift ☕" })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 })
  await C.goto(`/give/${slug}`)
  await C.getByRole("radio", { name: "$5, 1 coffee" }).click()
  await C.getByRole("switch", { name: "Show my name on this page" }).click()
  await C.getByRole("textbox", { name: "Note (optional)" }).fill("Public thanks")
  await C.getByRole("button", { name: "Send $5 ☕" }).click()
  await expect(C.getByRole("heading", { name: "Thank you!" })).toBeVisible({ timeout: 90_000 })
  await C.goto(`/give/${slug}`)
  await expect(C.getByRole("region", { name: "Thanks to" })).toContainText("Public thanks", { timeout: 60_000 })
})

test("turning the open link off, then gifts off, stop the giver", async () => {
  test.skip(!openUrl, "needs setup")
  // Settings → Money from outside → Pay-in links
  await A.goto(`/p/${slug}?tab=settings&sheet=payinlinks`)
  const sheet = A.getByRole("dialog", { name: "Pay-in links" })
  await sheet.getByRole("button", { name: "Turn off the Gift ☕ · They choose link" }).click()
  // wait for the server to confirm before leaving (closing the sheet early could race the request)
  await expect(sheet.getByRole("button", { name: "Turn off the Gift ☕ · They choose link" })).toHaveCount(0, { timeout: 30_000 })
  await A.keyboard.press("Escape")
  await C.goto(path(openUrl))
  await expect(C.getByRole("heading", { name: "This link was turned off" })).toBeVisible({ timeout: 30_000 })
  // Settings → "Taking money from outside" off (any member, at once: set_gifts)
  await A.goto(`/p/${slug}?tab=settings`)
  await A.locator("[data-settings]").locator("visible=true").getByRole("switch", { name: "Taking money from outside" }).click()
  expect(await eventually(() => giftsView(slug), (g) => g?.on === false, 60_000)).toMatchObject({ on: false, accepting: false, refusal: "gifts_off" })
  await C.goto(path(fixedUrl))
  await expect(C.getByRole("heading", { name: `${POT_NAME} isn't taking gifts right now` })).toBeVisible({ timeout: 30_000 })
})
