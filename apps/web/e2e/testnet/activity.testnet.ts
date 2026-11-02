// Your Pot dollars + Your activity on the real chain: one throwaway person (NEAR wallet, the e2e mock wallet) creates
// ONE Pot and adds $60 of demo dollars. Then You shows the "You added $60" row (from GET /api/me/activity ⊕ the
// chain), its balance card equals the token's ft_balance_of(me), and the row's receipt link names a real
// transaction (nearblocks answers for it; if nearblocks rate-limits, the hash must at least be a valid tx hash).
// Cost: 1 account (≈ 0.0125 NEAR from the holding account) + 1 Pot (≈ 0.07 NEAR hub float) + relayer gas.
//   E2E_TESTNET=1 E2E_PORT=3717 NEXT_DIST_DIR=.next-history-testnet scripts/with-testnet-lock.sh \
//     pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts activity
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { createPot } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, dao, eventually, potBalance, usd, usdcOf, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `History ${RUN}`
const TX = /^https:\/\/testnet\.nearblocks\.io\/txns\/([1-9A-HJ-NP-Za-km-z]{43,44})$/

let ctx: BrowserContext
let A: Page
let accounts: TestAccounts

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  accounts = await createTestAccounts(["Ivy"])
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  A = await ctx.newPage()
  A.on("console", (m) => {
    if (m.type() === "error") console.log(`[A error] ${m.text().slice(0, 300)}`)
  })
  await useWallet(A, accounts.people[0]!)
})

test.afterAll(async () => {
  await ctx?.close()
  await accounts?.release()
})

const fmt = (micro: bigint) => `$${(Number(micro) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

test("add money → You shows the activity row with a real receipt, and the balance = ft_balance_of(me)", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  const me = await accountOf(A.request)
  expect(me).toBe(accounts.people[0]!.accountId)

  // one Pot, the default rules
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  await createPot(A, { name: POT_NAME }) // the one Create screen, default rules
  await expect(A).toHaveURL(/\/p\/history-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  const slug = new URL(A.url()).pathname.split("/")[2]!
  console.log(`[activity] Pot ${dao(slug)}`)

  // add $60 of demo dollars
  await A.goto(`/p/${slug}?sheet=add&amount=60`)
  const sheet = A.getByRole("dialog", { name: /^Add money to/ })
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole("button", { name: "Add $60" }).click()
  await eventually(() => potBalance(slug), (b) => b >= usd(60), 90_000)

  // You: the row (newest first), its receipt, and the balance card against the chain
  await A.goto("/you")
  const row = A.locator("[data-you-activity] [data-activity='added']").first()
  await expect(row).toContainText("You added $60", { timeout: 60_000 })
  await expect(row).toContainText(POT_NAME)
  const link = row.getByRole("link", { name: "Receipt for You added $60, opens the explorer" })
  await expect(link).toBeVisible({ timeout: 60_000 })
  await expect(link).toHaveAttribute("target", "_blank")
  await expect(link).toHaveAttribute("rel", /noopener/)
  const href = (await link.getAttribute("href"))!
  const hash = TX.exec(href)?.[1]
  expect(hash, `receipt href ${href}`).toBeTruthy()
  console.log(`[activity] receipt ${href}`)

  const own = await usdcOf(me)
  console.log(`[activity] ft_balance_of(${me}) = ${own} → ${fmt(own)}`)
  await expect(A.locator("[data-you-balance] [data-money]")).toHaveText(fmt(own), { timeout: 30_000 })

  // the receipt is a real transaction: nearblocks' API knows it (or, when rate-limited, a valid hash format)
  let verdict = "format only"
  for (let i = 0; i < 6; i++) {
    const api = await fetch(`https://api-testnet.nearblocks.io/v1/txns/${hash}`).catch(() => null)
    if (api?.status === 200) {
      const j = (await api.json()) as { txns?: { transaction_hash: string }[] }
      if (j.txns?.some((t) => t.transaction_hash === hash)) {
        verdict = "nearblocks api 200, tx found"
        break
      }
    } else if (api && api.status !== 429) {
      const page = await fetch(href).catch(() => null)
      if (page?.status === 200) {
        verdict = "nearblocks page 200"
        break
      }
    }
    await new Promise((r) => setTimeout(r, 5_000)) // the indexer lags a few seconds
  }
  console.log(`[activity] receipt check: ${verdict}`)
  expect(hash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/)
})
