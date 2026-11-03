// "Ask for a top-up" against the real chain + our API: two throwaway people (NEAR wallet, the e2e mock wallet).
// Ana creates ONE Pot, Ben joins (adds nothing). Ana asks everyone for $10 each ("Ferry went up"); Ben finds the card
// in Requests, taps [Add $10] → the Add sheet prefilled and marked "For Ana's ask" → the $10 lands on chain → his card
// says "1 of 2 added" and "You added $10" (progress = hub get_members.contributed − the baseline saved with
// the ask); he nudges Ana; Ana adds her $10 through her card → the ask is done (the card goes, the row says Done).
// The ask itself is off-chain (signs nothing); the adds are ordinary relayed contributions.
// Cost: 2 accounts (≈ 0.017 NEAR from the holding account, mostly returned) + 1 Pot (≈ 0.07 NEAR hub float) + relayer
// gas for create, join and two adds.
// Run it only against a private database with migration 0007 applied (never the shared `pot` DB):
//   E2E_TESTNET=1 E2E_PORT=2537 NEXT_DIST_DIR=.next-topup-testnet \
//   DATABASE_URL=postgres://pot:pot@localhost:54329/pot_topup DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_topup \
//   scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts topup
import { skipOnboarding } from "../fixtures/onboarding"
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { createPot } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, dao, eventually, potBalance, usd, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Topup Trip ${RUN}`

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxB: BrowserContext
let A: Page
let B: Page
let slug = ""
let accA = ""
let accB = ""
let topupId = ""
let accounts: TestAccounts

const card = (p: Page) => p.locator("[data-topup-card]").locator("visible=true").first()
interface TopupApi {
  topups: { id: string; status: string; reason: string | null; perPerson: string; members: { account: string; added: string; done: boolean }[] }[]
}
const topupsOf = async (p: Page) => (await (await p.request.get(`/api/pots/${encodeURIComponent(dao(slug))}/topups`)).json()) as TopupApi

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  accounts = await createTestAccounts(["Ana", "Ben"])
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ctxA = await browser.newContext(opts)
  await skipOnboarding(ctxA)
  ctxB = await browser.newContext(opts)
  await skipOnboarding(ctxB)
  A = await ctxA.newPage()
  B = await ctxB.newPage()
  for (const [who, p] of [["A", A], ["B", B]] as const) {
    p.on("console", (m) => {
      if (m.type() === "error") console.log(`[${who} error] ${m.text().slice(0, 300)}`)
    })
  }
  await useWallet(A, accounts.people[0]!)
  await useWallet(B, accounts.people[1]!)
})

test.afterAll(async () => {
  await ctxA?.close()
  await ctxB?.close()
  await accounts?.release()
})

test("setup: Ana creates one Pot, Ben joins", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  accA = await accountOf(A.request)
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  await createPot(A, { name: POT_NAME })
  await expect(A).toHaveURL(/\/p\/topup-trip-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  slug = new URL(A.url()).pathname.split("/")[2]!
  console.log(`[topup] Pot ${dao(slug)}`)
  const share = A.getByRole("dialog", { name: `Invite friends to ${POT_NAME}` })
  const link = (await share.locator("[data-invite-link]").textContent())!
  await share.getByRole("button", { name: "Close" }).click()

  const u = new URL(link)
  await B.goto(`${u.pathname}${u.search}${u.hash}`)
  await walletSignIn(B)
  await expect(B.getByRole("dialog", { name: "You're in!" })).toBeVisible({ timeout: 60_000 })
  accB = await accountOf(B.request)
})

test("Ana asks $10 each; Ben adds $10 through the card; his part is done; he nudges Ana", async () => {
  test.skip(!accB, "needs setup")
  await A.goto(`/p/${slug}`)
  await expect(A.getByRole("heading", { level: 1, name: POT_NAME })).toBeVisible({ timeout: 30_000 })
  // both members show before asking: the row's [Ask] needs 2 people (in a Pot of one, that slot is Invite)
  const ask = A.locator("[data-pot-actions]").getByRole("button", { name: "Ask for more money" })
  await expect
    .poll(async () => {
      const ready = (await ask.count()) === 1 && (await ask.getAttribute("aria-disabled")) !== "true"
      if (!ready) await A.reload()
      return ready
    }, { timeout: 60_000, intervals: [3_000] })
    .toBe(true)
  await ask.click()
  const sheet = A.getByRole("dialog", { name: "Ask for more money" })
  await expect(sheet).toBeVisible()
  await sheet.getByRole("textbox", { name: "How much from each person?" }).fill("10")
  await expect(sheet.locator("[data-topup-split]")).toHaveText("$20 in total from 2 people")
  await sheet.getByRole("textbox", { name: "Why? (optional)" }).fill("Ferry went up")
  await sheet.getByRole("button", { name: "Ask for $10 each" }).click()
  await expect(sheet).toBeHidden({ timeout: 30_000 })
  await expect(card(A).getByRole("heading", { name: "You asked for $10 each" })).toBeVisible({ timeout: 30_000 })
  await expect(card(A).locator("[data-topup-progress]")).toHaveText("0 of 2 added")
  const first = (await topupsOf(A)).topups[0]!
  expect(first).toMatchObject({ status: "open", reason: "Ferry went up", perPerson: usd(10).toString() })
  expect(first.members.map((m) => m.account).sort()).toEqual([accA, accB].sort())
  topupId = first.id
  console.log(`[topup] ask ${topupId}`)

  // Ben: Requests → the card → Add $10 (prefilled, marked) → on chain
  await B.goto("/requests")
  const inbox = B.locator("[data-topup-card]").first()
  await expect(inbox.getByRole("heading", { name: "Ana asks for $10 each" })).toBeVisible({ timeout: 45_000 })
  await expect(inbox).toContainText("“Ferry went up”")
  await inbox.getByRole("link", { name: "Add $10" }).click()
  await expect(B).toHaveURL(new RegExp(`/p/${slug}\\?sheet=add&amount=10&topup=${topupId}`))
  const add = B.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  await expect(add).toBeVisible({ timeout: 30_000 })
  await expect(add.locator("[data-add-topup]")).toHaveText("For Ana's ask: $10 each.", { timeout: 30_000 })
  await add.getByRole("button", { name: "Add $10", exact: true }).click()
  await expect(B.getByRole("dialog")).toBeHidden()
  expect(await eventually(() => potBalance(slug), (b) => b === usd(10), 90_000)).toBe(usd(10))
  // progress from the hub: Ben's part is done (the card polls every 10 s; the server reads get_members, ≤ 10 s cache)
  await expect(card(B).locator("[data-topup-you-done]")).toHaveText("You added $10", { timeout: 60_000 })
  await expect(card(B).locator("[data-topup-progress]")).toHaveText("1 of 2 added")
  const mid = (await topupsOf(B)).topups[0]!
  expect(mid.members.find((m) => m.account === accB)).toMatchObject({ added: usd(10).toString(), done: true })
  // he nudges Ana (once per 24 h)
  await card(B).getByRole("button", { name: "Nudge Ana" }).click()
  await expect(B.getByText("Nudge sent to Ana")).toBeVisible({ timeout: 30_000 })
  await expect(card(B).locator("[data-topup-nudged]")).toBeVisible({ timeout: 30_000 })
  const again = await B.request.post("/api/nudges", {
    data: { pot: dao(slug), to: [accA], topup: topupId, idempotencyKey: "nxdgeagan0000000" },
    headers: { origin: new URL(B.url()).origin },
  })
  expect(again.status()).toBe(429)
})

test("Ana adds her $10 through her card: the ask is done", async () => {
  test.skip(!topupId, "needs the ask")
  await A.goto(`/p/${slug}`)
  await expect(card(A).locator("[data-topup-progress]")).toHaveText("1 of 2 added", { timeout: 60_000 })
  await card(A).getByRole("button", { name: "Add $10" }).click()
  const add = A.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  await expect(add).toBeVisible()
  await expect(add.locator("[data-add-topup]")).toHaveText("For your ask: $10 each.")
  await add.getByRole("button", { name: "Add $10", exact: true }).click()
  await expect(A.getByRole("dialog")).toBeHidden()
  expect(await eventually(() => potBalance(slug), (b) => b === usd(20), 90_000)).toBe(usd(20))
  await expect(A.locator("[data-topup-card]")).toHaveCount(0, { timeout: 60_000 })
  const row = A.locator(`[data-topup-row='${topupId}']`).locator("visible=true").first()
  await expect(row.locator("[data-status]")).toHaveText("Done")
  await expect(row).toContainText("2 of 2 added")
  expect((await topupsOf(A)).topups[0]).toMatchObject({ id: topupId, status: "done" })
})
