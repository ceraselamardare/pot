// Pay anyone by link (hub 1.1.0) against the real chain + our API: two throwaway people (NEAR wallet, the e2e mock
// wallet). Ana creates ONE Pot (hub 1.1.0 defaults: links on) and adds $150; she pays "Someone else" $40 by link
// (instant: under the $100 limit) → the hub's escrow holds it (get_link funded) → Cleo, a fresh 0-NEAR account that
// never joined the Pot, opens /c/<slug>/<id>#<secret>, signs in with her wallet and taps [Get $40] → claim_link through
// our relayer (R14; the hub registers her on the token) → "$40 is yours", her token balance is $40, her NEAR balance
// didn't move, get_link says claimed to her, and Ana's feed says the link was claimed. Then Ana makes a $25 link and
// cancels it (reclaim_link, R15): the money is back in the Pot and the claim page says the payment was cancelled.
// The daily job's reclaim of expired links is covered by server/ops/links.test.ts (a link lives ≥ 60 s on chain).
//
// Green against hub 1.1.0 on the preview (2026-11-02, notes/frontend.md "Hub 1.1.0 testnet run"); needs the web app
// with this wave's SDK/relayer. Cost: 2 accounts (≈ 0.017 NEAR from the holding account) + 1 Pot (≈ 0.07 NEAR hub
// float) + relayer gas for create, add, two link requests, one claim (+ the hub's 0.00125 NEAR registration for Cleo)
// and one cancel. Run it against a private database (never the shared `pot` DB):
//   E2E_TESTNET=1 E2E_PORT=3527 NEXT_DIST_DIR=.next-paylink \
//   DATABASE_URL=postgres://pot:pot@localhost:54329/pot_paylink DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_paylink \
//   scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts paylink
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { spendFlow, typeAmount } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, nearBalance, potBalance, usd, usdcOf, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Link Trip ${RUN}`
const LINK_RE = /\/c\/([a-z0-9-]+)\/(\d+)#([A-Za-z0-9_-]{43})$/

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxC: BrowserContext
let A: Page
let C: Page
let slug = ""
let accA = ""
let accC = ""
let accounts: TestAccounts
let claimUrl = ""
let linkId = -1

const hero = (p: Page) => p.locator("[data-hero] [data-money]").first()

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  accounts = await createTestAccounts(["Ana", "Cleo"])
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ctxA = await browser.newContext(opts)
  ctxC = await browser.newContext(opts)
  A = await ctxA.newPage()
  C = await ctxC.newPage()
  for (const [who, p] of [["A", A], ["C", C]] as const) {
    p.on("console", (m) => {
      if (m.type() === "error") console.log(`[${who} error] ${m.text().slice(0, 300)}`)
    })
  }
  await useWallet(A, accounts.people[0]!)
  await useWallet(C, accounts.people[1]!)
  accC = accounts.people[1]!.accountId
})

test.afterAll(async () => {
  await ctxA?.close()
  await ctxC?.close()
  await accounts?.release()
})

async function linkSpend(amount: string, label: string | null): Promise<string> {
  await A.goto(`/p/${slug}`)
  await A.getByRole("button", { name: "Spend", exact: true }).click()
  const sheet = A.getByRole("dialog", { name: `Spend from ${POT_NAME}` })
  await spendFlow(A, { amount, reason: "Stay", payee: "Someone else" })
  if (label) await sheet.getByRole("textbox", { name: "Who's it for? (optional)" }).fill(label)
  await sheet.getByRole("button", { name: `Send $${amount} by link` }).click()
  const ready = sheet.locator("[data-paylink-ready]")
  await expect(ready).toBeVisible({ timeout: 60_000 })
  const url = (await ready.locator("[data-paylink-url]").getAttribute("data-paylink-url"))!
  expect(url).toMatch(LINK_RE)
  await sheet.getByRole("button", { name: "Done" }).click()
  return url
}

test("setup: Ana creates one Pot (links on) and adds $150", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  accA = await accountOf(A.request)
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  const step1 = A.getByRole("dialog", { name: "Name your Pot" })
  await step1.getByRole("textbox", { name: /Pot name/ }).fill(POT_NAME)
  await step1.getByRole("button", { name: "Next" }).click()
  await A.getByRole("dialog", { name: "Pot rules" }).getByRole("button", { name: "Create Pot" }).click()
  await expect(A).toHaveURL(/\/p\/link-trip-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  slug = new URL(A.url()).pathname.split("/")[2]!
  console.log(`[paylink] Pot ${dao(slug)} by ${accA}`)
  const pot = (await chain.hub.getPot(dao(slug))).value!
  expect(pot.extras?.links, "a hub 1.1.0 Pot has links on").toBe(true)
  await A.getByRole("dialog").getByRole("button", { name: "Close" }).click()
  await A.getByRole("button", { name: "Add money" }).first().click()
  const add = A.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  // the sheet prefills "your share" ($150, D-61): clear it first, or the keypad appends ("150150" = $150,150, which the
  // relayer's R1 refuses: one add is at most $10,000)
  for (let i = 0; i < 6; i++) await add.getByRole("button", { name: "delete", exact: true }).click()
  await typeAmount(A, "150")
  await add.getByRole("button", { name: "Add $150", exact: true }).click()
  await expect(hero(A)).toHaveText("$150.00", { timeout: 60_000 })
  expect(await eventually(() => potBalance(slug), (b) => b === usd(150), 60_000)).toBe(usd(150))
})

test("Ana pays someone else $40 by link: the hub's escrow holds it", async () => {
  test.skip(!slug, "needs setup")
  claimUrl = await linkSpend("40", "Casa Lisboa host")
  linkId = Number(LINK_RE.exec(claimUrl)![2])
  const link = await eventually(
    () => chain.hub.getLink!(dao(slug), linkId).then((v) => v.value),
    (l) => l?.status === "funded",
    60_000,
  )
  expect(link).toMatchObject({ requester: accA, amount: usd(40), status: "funded", claimable: true })
  expect(await potBalance(slug)).toBe(usd(110))
  // the secret never reached a server: the claim page's server render can't know it
  await expect(A.locator("[data-feed] li", { hasText: "payment link" }).first()).toContainText("Link sent · waiting to be claimed", { timeout: 30_000 })
})

test("Cleo (0 NEAR, not in the Pot) claims it with her wallet: '$40 is yours'", async () => {
  test.skip(linkId < 0, "needs the link")
  const nearBefore = await nearBalance(accC)
  expect(await usdcOf(accC)).toBe(0n)
  const u = new URL(claimUrl)
  await C.goto(`${u.pathname}${u.hash}`)
  await expect(C.getByRole("heading", { level: 1, name: new RegExp(`sent you \\$40 from ${POT_NAME}$`) })).toBeVisible({ timeout: 30_000 })
  await C.getByRole("button", { name: "Get $40" }).click()
  await expect(C.getByRole("heading", { name: "Sign in to get your $40" })).toBeVisible()
  await walletSignIn(C)
  const done = C.locator("[data-claim-state='success']")
  await expect(done).toBeVisible({ timeout: 90_000 })
  await expect(done.getByRole("heading", { name: "$40 is yours" })).toBeVisible()
  expect(await accountOf(C.request)).toBe(accC)
  const link = await eventually(
    () => chain.hub.getLink!(dao(slug), linkId).then((v) => v.value),
    (l) => l?.status === "claimed",
    60_000,
  )
  expect(link!.receiver).toBe(accC)
  expect(await eventually(() => usdcOf(accC), (b) => b === usd(40), 60_000)).toBe(usd(40))
  await expect(done.locator("[data-claim-balance]")).toHaveText("$40.00", { timeout: 30_000 })
  expect(await nearBalance(accC)).toBe(nearBefore) // the relayer and the hub paid for everything
  expect(await potBalance(slug)).toBe(usd(110))
  // a second claim with the same link is refused (already taken)
  await C.reload()
  await expect(C.locator("[data-claim-state='success']")).toBeVisible({ timeout: 30_000 })

  // Ana's feed: claimed
  await A.goto(`/p/${slug}`)
  await expect(A.locator("[data-feed] li", { hasText: "payment link" }).first()).toContainText(/Claimed by /, { timeout: 60_000 })
})

test("Ana cancels a $25 link: the money is back in the Pot; the claim page says so", async () => {
  test.skip(linkId < 0, "needs the first link")
  const url = await linkSpend("25", null)
  const id = Number(LINK_RE.exec(url)![2])
  await eventually(
    () => chain.hub.getLink!(dao(slug), id).then((v) => v.value),
    (l) => l?.status === "funded",
    60_000,
  )
  expect(await eventually(() => potBalance(slug), (b) => b === usd(85), 60_000)).toBe(usd(85))
  await A.goto(`/p/${slug}?r=${id}`)
  const req = A.getByRole("dialog", { name: /asked for \$25/ }) // a funded link is decided: the details sheet says "asked"
  await req.getByRole("button", { name: "Cancel and return the money" }).click({ timeout: 30_000 })
  await req.getByRole("button", { name: "Yes, cancel it" }).click()
  await expect(A.getByText(`Link cancelled. $25 is back in ${POT_NAME}.`).first()).toBeVisible({ timeout: 60_000 })
  await eventually(
    () => chain.hub.getLink!(dao(slug), id).then((v) => v.value),
    (l) => l?.status === "returned",
    60_000,
  )
  expect(await eventually(() => potBalance(slug), (b) => b === usd(110), 60_000)).toBe(usd(110))
  const u = new URL(url)
  await C.goto(`${u.pathname}${u.hash}`)
  await expect(C.locator("[data-claim-state='returned']")).toContainText("This payment was cancelled", { timeout: 30_000 })
})
