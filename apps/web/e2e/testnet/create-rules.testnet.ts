// Create with custom "Pot rules" on the real chain (no templates): one throwaway person signs in with a NEAR wallet
// (the e2e mock wallet, accounts.ts), creates exactly ONE Pot with $25 at a time / $60 per person / members only,
// and the hub's own views confirm it: get_rules returns those rules (preset "custom", 6 decimals) and
// preview_spend sends a $30 spend to the group (over the instant limit). Then the Rules tab reads them back.
//   E2E_TESTNET=1 E2E_PORT=3217 NEXT_DIST_DIR=.next-rules scripts/with-testnet-lock.sh \
//     pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts create-rules
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { createPot } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, nearBalance, usd, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Custom Rules ${RUN}`

let ctx: BrowserContext
let A: Page
let accounts: TestAccounts

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  accounts = await createTestAccounts(["Cora"])
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

test("custom rules: $25 at a time, $60 per person, members only → on chain; $30 goes to the group", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  const me = await accountOf(A.request)
  expect(me).toBe(accounts.people[0]!.accountId)

  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  // the one Create screen → [Change] → the full rules
  await createPot(A, {
    name: POT_NAME,
    rules: async (step2) => {
      await step2.getByRole("textbox", { name: "Anyone can spend up to this much at a time without asking" }).fill("25")
      await step2.getByRole("textbox", { name: "Each person can spend up to this much in total without asking" }).fill("60")
      await expect(step2.getByRole("radio", { name: "Members only" })).toBeChecked()
    },
  })
  await expect(A.getByText("Free: we cover the setup.")).toBeVisible()
  await expect(A).toHaveURL(/\/p\/custom-rules-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  const slug = new URL(A.url()).pathname.split("/")[2]!
  console.log(`[create-rules] Pot ${dao(slug)}`)

  // chain: the hub stored exactly the form's rules (U128 strings in 6 decimals → Micro)
  const rules = await eventually(() => chain.hub.getRules(dao(slug)), (v) => !!v.value)
  console.log(`[create-rules] get_rules ${JSON.stringify(rules.value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`)
  expect(rules.value!.preset).toBe("custom")
  expect(rules.value!.rules).toEqual({ instantCap: usd(25), memberBudget: usd(60), instantPayees: "members", payeeAllowlist: [] })
  expect(rules.value!.rules.instantCap).toBe(25_000_000n)
  expect(rules.value!.rules.memberBudget).toBe(60_000_000n)
  expect(rules.value!.proposalPeriodMs).toBe(7 * 86_400_000)

  // a $30 spend is over the $25 instant limit: the group decides
  const p30 = await chain.hub.previewSpend(dao(slug), me as never, usd(30), me as never, usd(100))
  console.log(`[create-rules] preview_spend $30 → ${p30.value.path} (${p30.value.hubReason})`)
  expect(p30.value.path).toBe("vote")
  expect(p30.value.hubReason).toBe("over_cap")
  expect(p30.value.instantCap).toBe(usd(25))
  expect(p30.value.memberBudget).toBe(usd(60))

  // the person paid nothing: creation was sponsored
  expect(await nearBalance(me)).toBe(0n)

  // the Rules tab reads the Pot's own rules back as sentences
  await A.getByRole("dialog").getByRole("button", { name: "Close" }).click()
  await A.getByRole("tab", { name: "Rules" }).locator("visible=true").click()
  const list = A.locator("[data-rules-list]")
  await expect(list).toContainText("Anyone can spend up to $25 without asking.", { timeout: 30_000 })
  await expect(list).toContainText("Each person can spend up to $60 in total without asking.")
})
