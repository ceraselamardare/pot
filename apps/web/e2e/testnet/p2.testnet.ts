// Phase-2 testnet tier (F-20, F-22): one fresh Pot per run (the hub sponsors exactly one create_pot), two phones.
//   P2-a  a rules change: A asks for a $50 instant limit (propose_rules + A's own 300 Tgas approval), B approves
//         from the Pot → the DAO applies set_rules → get_rules and preview_spend reflect the new limit.
//   P2-b  a full close of the same Pot: the RefundTable equals preview_close, propose_close (ERR_POT_BUSY → Try
//         again), B approves closing → payouts verified on chain (each account's dollars, the Pot at 0, closed).
// Both people sign in with a NEAR wallet (the e2e mock wallet) holding a throwaway 0-NEAR account (accounts.ts; Rev 9).
//   E2E_TESTNET=1 scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts p2.testnet.ts
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { typeAmount } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, potBalance, usd, usdcOf, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Rules Trip ${RUN}`

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxB: BrowserContext
let A: Page
let B: Page
let slug = ""
let accA = ""
let accB = ""
let accounts: TestAccounts

const hero = (p: Page) => p.locator("[data-hero] [data-money]").first()

async function addMoney(page: Page, amount: number) {
  await page.getByRole("button", { name: "Add money" }).first().click()
  const sheet = page.getByRole("dialog", { name: /^Add money to/ })
  await expect(sheet).toBeVisible()
  for (let i = 0; i < 6; i++) await sheet.getByRole("button", { name: "delete", exact: true }).click()
  await typeAmount(page, String(amount))
  await sheet.getByRole("button", { name: `Add $${amount}` }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  accounts = await createTestAccounts(["Ana", "Ben"])
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ctxA = await browser.newContext(opts)
  ctxB = await browser.newContext(opts)
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

test("setup: A creates one Pot, B joins, both add money", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  accA = await accountOf(A.request)
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  const step1 = A.getByRole("dialog", { name: "Name your Pot" })
  await step1.getByRole("textbox", { name: /Pot name/ }).fill(POT_NAME)
  await step1.getByRole("button", { name: "Next" }).click()
  await A.getByRole("dialog", { name: "Pot rules" }).getByRole("button", { name: "Create Pot" }).click()
  await expect(A).toHaveURL(/\/p\/rules-trip-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  slug = new URL(A.url()).pathname.split("/")[2]!
  const share = A.getByRole("dialog", { name: `Invite friends to ${POT_NAME}` })
  const link = (await share.locator("[data-invite-link]").textContent())!
  await share.getByRole("button", { name: "Close" }).click()

  const u = new URL(link)
  await B.goto(`${u.pathname}${u.search}${u.hash}`)
  await walletSignIn(B)
  const youreIn = B.getByRole("dialog", { name: "You're in!" })
  await expect(youreIn).toBeVisible({ timeout: 60_000 })
  accB = await accountOf(B.request)
  await youreIn.getByRole("button", { name: "Add my $150 share" }).click()
  const add = B.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  await expect(add).toBeVisible({ timeout: 30_000 })
  await add.getByRole("button", { name: "Add $150" }).click()
  await expect(hero(B)).toHaveText("$150.00", { timeout: 60_000 })

  await A.goto(`/p/${slug}`)
  await expect(hero(A)).toHaveText("$150.00", { timeout: 30_000 })
  await addMoney(A, 100)
  await expect(hero(A)).toHaveText("$250.00", { timeout: 60_000 })
  expect(await eventually(() => potBalance(slug), (b) => b === usd(250))).toBe(usd(250))
})

test("P2-a: A asks for a $50 instant limit, B approves, preview_spend follows the new limit", async () => {
  test.skip(!accB, "needs setup")
  // before: $60 is instant for B (≤ $100, B has put money in)
  const before = await chain.hub.previewSpend(dao(slug), accB as never, usd(60), accB as never)
  expect(before.value.path).toBe("instant")

  await A.goto(`/p/${slug}?tab=rules`)
  await expect(A.getByText("Anyone can spend up to $100 without asking.")).toBeVisible({ timeout: 30_000 })
  await A.getByRole("button", { name: "Ask the group to change a rule" }).click()
  const sheet = A.getByRole("dialog", { name: "Ask the group to change a rule" })
  await expect(sheet).toBeVisible()
  await typeAmount(A, "50")
  await expect(sheet.getByText("Anyone can spend up to $50 without asking.")).toBeVisible()
  await expect(sheet.getByText("This needs 2 of 2 approvals.")).toBeVisible()
  await sheet.getByRole("button", { name: "Ask the group" }).click()
  await expect(sheet.getByText("Sent to the group. Your approval is counted. It needs 1 more.")).toBeVisible({ timeout: 60_000 })
  await sheet.getByRole("button", { name: "Done" }).click()

  // chain: one open rules proposal, decoded to the new limit, with A's approval; the rules haven't changed yet
  const pot = await eventually(() => chain.hub.getPot(dao(slug)), (v) => v.value?.openRulesProposal != null)
  const pid = pot.value!.openRulesProposal!
  const prop = await eventually(() => chain.dao.getProposal(dao(slug), pid), (p) => p.value?.votes[accA] === "Approve")
  expect(prop.value!.status).toBe("InProgress")
  expect((await chain.hub.getRules(dao(slug))).value!.rules.instantCap).toBe(usd(100))
  await expect(A.locator("[data-rules-pending]")).toContainText("You asked to change a rule", { timeout: 30_000 })

  // B approves from the Pot's "Waiting on you"
  await B.goto(`/p/${slug}`)
  const card = B.locator("[data-rules-card]").first()
  await expect(card).toContainText("Ana wants to change a rule", { timeout: 30_000 })
  await card.getByRole("button", { name: "Review" }).click()
  const review = B.getByRole("dialog", { name: "Ana wants to change a rule" })
  await expect(review.locator("[data-rules-diff] .line-through")).toHaveText("Anyone can spend up to $100 without asking.")
  await expect(review.getByText("Anyone can spend up to $50 without asking.")).toBeVisible()
  await review.getByRole("button", { name: "Approve the change" }).click()
  await expect(review.getByText("Approved. The new rules apply from now on.")).toBeVisible({ timeout: 60_000 })
  await review.getByRole("button", { name: "Done" }).click()

  // chain: the DAO executed set_rules on the hub → get_rules, preview_spend
  const done = await eventually(() => chain.dao.getProposal(dao(slug), pid), (p) => p.value?.status === "Approved", 60_000)
  expect(done.value!.votes[accB]).toBe("Approve")
  const rules = await eventually(() => chain.hub.getRules(dao(slug)), (r) => r.value?.rules.instantCap === usd(50), 60_000)
  expect(rules.value!.rulesVersion).toBeGreaterThanOrEqual(2)
  const after = await chain.hub.previewSpend(dao(slug), accB as never, usd(60), accB as never)
  expect(after.value.path).toBe("vote")
  expect(after.value.reason).toBe("over_cap")
  expect(after.value.instantCap).toBe(usd(50))
  const small = await chain.hub.previewSpend(dao(slug), accB as never, usd(40), accB as never)
  expect(small.value.path).toBe("instant")
  await eventually(() => chain.hub.getPot(dao(slug)), (v) => v.value?.openRulesProposal == null, 60_000) // sync freed the slot

  // the app shows it: the Rules tab and the Spend preview
  await B.goto(`/p/${slug}?tab=rules`)
  await expect(B.getByText("Anyone can spend up to $50 without asking.")).toBeVisible({ timeout: 30_000 })
  await B.getByRole("button", { name: "Spend", exact: true }).click()
  const spend = B.getByRole("dialog", { name: `Spend from ${POT_NAME}` })
  await typeAmount(B, "60")
  await expect(spend.getByText("This needs 2 of 2 approvals")).toBeVisible({ timeout: 15_000 })
  await spend.getByRole("button", { name: "Close" }).click()
})

test("P2-b: a full close of the fresh Pot, payouts verified on chain", async () => {
  test.skip(!accB, "needs setup")
  const [a0, b0] = [await usdcOf(accA), await usdcOf(accB)]
  const preview = (await chain.hub.previewClose(dao(slug), await potBalance(slug))).value
  const expected = Object.fromEntries(preview.payouts.map((p) => [p.account as string, p.amount]))
  expect(expected[accA]).toBe(usd(100))
  expect(expected[accB]).toBe(usd(150))

  await A.goto(`/p/${slug}`)
  await expect(hero(A)).toHaveText("$250.00", { timeout: 30_000 })
  await A.getByRole("button", { name: `More options for ${POT_NAME}` }).click()
  await A.getByRole("menuitem", { name: /Close Pot/ }).click()
  const sheet = A.getByRole("dialog", { name: `Close ${POT_NAME}?` })
  await expect(sheet).toBeVisible()
  // the RefundTable is preview_close
  await expect(sheet.locator('[data-refund-row="Ana"]')).toContainText("$100.00", { timeout: 30_000 })
  await expect(sheet.locator('[data-refund-row="Ben"]')).toContainText("$150.00")
  await expect(sheet.locator("[data-refund-total]")).toHaveText("$250.00")
  for (let i = 0; i < 8; i++) {
    await sheet.locator("[data-close-cta]").click()
    const outcome = await Promise.race([
      sheet.locator('[data-close-status="sent"]').waitFor({ timeout: 90_000 }).then(() => "sent"),
      sheet.locator('[data-close-error="close.busy"]').waitFor({ timeout: 90_000 }).then(() => "busy"),
    ])
    if (outcome === "sent") break
    await A.waitForTimeout(15_000) // ERR_POT_BUSY: money moved in the last minute; "Try again"
  }
  await expect(sheet.getByText("Sent to the group. Your approval is counted. It needs 1 more.")).toBeVisible()
  const pot = await eventually(() => chain.hub.getPot(dao(slug)), (v) => v.value?.status === "closing" && v.value.closeProposalId != null)
  const pid = pot.value!.closeProposalId!
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(A.locator("[data-pot-closing]")).toBeVisible({ timeout: 30_000 })

  await B.goto(`/p/${slug}`)
  const card = B.locator("[data-close-card]").first()
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.getByRole("button", { name: "Review" }).click()
  const vote = B.getByRole("dialog", { name: `Ana wants to close ${POT_NAME}` })
  await expect(vote.getByText("You'd get back $150.00")).toBeVisible()
  await vote.getByRole("button", { name: "Approve closing" }).click()
  const closed = B.getByRole("dialog", { name: "Pot closed" })
  await expect(closed.locator("[data-close-refund]")).toHaveText("$150.00 is in your Pot account.", { timeout: 90_000 })

  // chain: the close proposal executed; every payout landed; the Pot is empty and closed
  const p = await eventually(() => chain.dao.getProposal(dao(slug), pid), (x) => x.value?.status === "Approved", 90_000)
  expect(p.value!.votes[accB]).toBe("Approve")
  expect(await eventually(() => potBalance(slug), (b) => b === 0n, 90_000)).toBe(0n)
  expect(await eventually(() => usdcOf(accA), (b) => b === a0 + usd(100))).toBe(a0 + usd(100))
  expect(await eventually(() => usdcOf(accB), (b) => b === b0 + usd(150))).toBe(b0 + usd(150))
  await eventually(() => chain.hub.getPot(dao(slug)), (v) => v.value?.status === "closed", 90_000)
  const members = (await chain.hub.getMembers(dao(slug))).value
  expect(Object.fromEntries(members.map((m) => [m.account as string, m.wouldGetBack]))).toEqual({ [accA]: usd(100), [accB]: usd(150) })

  // the app: read-only Pot with the closed card
  await closed.getByRole("button", { name: "Done" }).click()
  await A.goto(`/p/${slug}`)
  await expect(A.locator("[data-pot-closed]")).toContainText("$100.00 is in your Pot account.", { timeout: 60_000 })
  await expect(A.getByRole("button", { name: "Add money" })).toHaveCount(0)
})
