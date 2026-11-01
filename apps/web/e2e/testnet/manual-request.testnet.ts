// Manual helper, not part of the suites: a saved friend (from manual-join) asks the group for money over the
// Pot's instant limit, so it waits for approvals.
//   MANUAL_POT=<slug> MANUAL_NAME=Alex MANUAL_AMOUNT=45 MANUAL_REASON=Food E2E_TESTNET=1 E2E_PORT=3417 NEXT_DIST_DIR=.next-friend \
//     scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts manual-request
import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { typeAmount } from "../fixtures/pot"
import { accountOf, chain, dao, eventually, useWallet, walletSignIn } from "./chain"

const SLUG = process.env.MANUAL_POT
const NAME = process.env.MANUAL_NAME ?? "Alex"
const AMOUNT = process.env.MANUAL_AMOUNT ?? "45"
const REASON = process.env.MANUAL_REASON ?? "Food"

test("a saved friend asks the group for a spend that needs approval", async ({ browser }) => {
  test.skip(!SLUG, "set MANUAL_POT")
  test.setTimeout(300_000)
  const friend = JSON.parse(readFileSync(`.keys/friend-${NAME.toLowerCase()}.json`, "utf8")) as { accountId: string; seedHex: string }
  const page = await (await browser.newContext()).newPage()
  await useWallet(page, friend)
  await page.goto("/pots")
  await walletSignIn(page)
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  expect(await accountOf(page.request)).toBe(friend.accountId)

  await page.goto(`/p/${SLUG}`)
  await page.getByRole("button", { name: "Spend" }).click()
  const sheet = page.getByRole("dialog", { name: /^Spend from / })
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await typeAmount(page, AMOUNT)
  await expect(sheet.getByText(/This needs \d+ of \d+ approvals/)).toBeVisible()
  await sheet.getByRole("button", { name: new RegExp(`^${REASON}`) }).click()
  await sheet.getByRole("button", { name: "Ask the group" }).click()
  await expect(sheet.getByText("Sent to the group")).toBeVisible({ timeout: 45_000 })
  await sheet.getByRole("button", { name: "Done" }).click()

  const req = await eventually(
    () => chain.hub.getRequests(dao(SLUG!), 0, 100).then((r) => r.value.filter((x) => x.path === "vote").at(-1)),
    (r) => !!r && r.proposalId !== null,
    60_000,
  )
  console.log(`REQUESTED $${AMOUNT} for ${REASON} in ${SLUG} as ${NAME}: request #${req!.id}, proposal #${req!.proposalId}, status ${req!.status}`)
})
