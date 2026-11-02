// Manual helper, not part of the suites: a throwaway friend joins a real invite link that a person shared.
// It runs only when MANUAL_INVITE is set:
//   MANUAL_INVITE='<invite url>' MANUAL_NAME=Alex E2E_TESTNET=1 E2E_PORT=3417 NEXT_DIST_DIR=.next-friend \
//     scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts manual-join
// The friend's key is saved to apps/web/.keys/friend-<name>.json (gitignored, mode 600), so the same friend can sign in again later.
import { skipOnboarding } from "../fixtures/onboarding"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { createTestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, useWallet, walletSignIn } from "./chain"

const INVITE = process.env.MANUAL_INVITE
const NAME = process.env.MANUAL_NAME ?? "Alex"

test("a friend joins a shared invite link", async ({ browser }) => {
  test.skip(!INVITE, "set MANUAL_INVITE")
  test.setTimeout(300_000)
  const accounts = await createTestAccounts([NAME])
  const friend = accounts.people[0]!
  mkdirSync(".keys", { recursive: true })
  const file = `.keys/friend-${NAME.toLowerCase()}.json`
  writeFileSync(file, JSON.stringify({ name: NAME, accountId: friend.accountId, seedHex: friend.seedHex }), { mode: 0o600 })
  chmodSync(file, 0o600)
  await accounts.release()

  const page = await (await browser.newContext()).newPage()
  await skipOnboarding(page) // the first-run intro (e2e/fixtures/onboarding.ts)
  await useWallet(page, friend)
  const url = new URL(INVITE!)
  await page.goto(`${url.pathname}${url.search}${url.hash}`)
  await walletSignIn(page)
  await expect(page.getByRole("dialog", { name: "You're in!" })).toBeVisible({ timeout: 90_000 })
  const account = await accountOf(page.request)
  const slug = url.pathname.split("/").pop()!
  const members = await eventually(() => chain.hub.getMembers(dao(slug)), (v) => v.value.some((m) => m.account === account && m.status === "active"), 60_000)
  console.log(`JOINED ${slug} as ${NAME} (${account}); members now: ${members.value.map((m) => m.account).join(", ")}`)
})
