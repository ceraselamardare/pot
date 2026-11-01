// Manual helper, not part of the suites: a saved friend (from manual-join) adds demo dollars to a Pot.
//   MANUAL_POT=<slug> MANUAL_NAME=Alex MANUAL_AMOUNT=150 E2E_TESTNET=1 E2E_PORT=3417 NEXT_DIST_DIR=.next-friend \
//     scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts manual-add
import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { accountOf, eventually, potBalance, usd, useWallet, walletSignIn } from "./chain"

const SLUG = process.env.MANUAL_POT
const NAME = process.env.MANUAL_NAME ?? "Alex"
const AMOUNT = Number(process.env.MANUAL_AMOUNT ?? 150)

test("a saved friend adds money to a Pot", async ({ browser }) => {
  test.skip(!SLUG, "set MANUAL_POT")
  test.setTimeout(300_000)
  const friend = JSON.parse(readFileSync(`.keys/friend-${NAME.toLowerCase()}.json`, "utf8")) as { accountId: string; seedHex: string }
  const page = await (await browser.newContext()).newPage()
  await useWallet(page, friend)
  await page.goto("/pots")
  await walletSignIn(page)
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  expect(await accountOf(page.request)).toBe(friend.accountId)

  const before = await potBalance(SLUG!)
  await page.goto(`/p/${SLUG}?sheet=add&amount=${AMOUNT}`)
  const sheet = page.getByRole("dialog", { name: /^Add money to/ })
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole("button", { name: `Add $${AMOUNT}` }).click()
  await expect(page.getByText(`+$${AMOUNT} on the way`)).toBeVisible({ timeout: 30_000 })
  const after = await eventually(() => potBalance(SLUG!), (b) => b >= before + usd(AMOUNT), 90_000)
  console.log(`ADDED $${AMOUNT} to ${SLUG} as ${NAME}: pot balance ${Number(before) / 1e6} → ${Number(after) / 1e6} test dollars`)
})
