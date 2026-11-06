// X-07 testnet tier, the big chunks end to end on the real chain (test-plan §5.2), with two browser contexts:
// A = a new person who creates the Pot, B = a friend who opens the invite on another phone. Both sign in with a NEAR
// wallet (NEAR Connect → the e2e mock wallet) holding a throwaway 0-NEAR testnet account (accounts.ts; Rev 9).
//   E-a  wallet sign-in → create a Pot → the share link
//   E-b  B opens the invite → joins → adds money (A adds too, so the close splits between two people)
//   E-c  B: instant spend → "Approved by Pot rules" → the Pot's balance drops on chain
//   E-d  A: over the instant limit → needs 2 of 2 → B approves → executed on chain
//   E-f  A asks to close → B approves → pro-rata refunds, Pot balance 0 on chain
// Every UI claim is checked against the chain through @pot/sdk views (e2e/testnet/chain.ts).
import { skipOnboarding } from "../fixtures/onboarding"
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { addFlow, createPot, potMore, spendFlow, typeAmount } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, nearBalance, potBalance, usd, usdcOf, useWallet, walletSignIn } from "./chain"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Testnet Trip ${RUN}`

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxB: BrowserContext
let A: Page
let B: Page
let slug = ""
let link = ""
let accA = ""
let accB = ""
let accounts: TestAccounts

const hero = (p: Page) => p.locator("[data-hero] [data-money]").first()

async function addMoney(page: Page, amount: number) {
  await page.getByRole("button", { name: "Add money" }).first().click()
  const sheet = page.getByRole("dialog", { name: /^Add money to/ })
  await expect(sheet).toBeVisible()
  // clear any prefill, then type
  for (let i = 0; i < 6; i++) await sheet.getByRole("button", { name: "delete", exact: true }).click()
  await addFlow(page, { amount: String(amount), submit: `Add $${amount}` })
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByText(`+$${amount} on the way`)).toBeVisible()
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  // Ana and Ben: <name>.e2e-<run>.pot-funds-65k8.testnet, 0 NEAR, one full-access key each (held by the mock wallet)
  accounts = await createTestAccounts(["Ana", "Ben"])
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ctxA = await browser.newContext(opts)
  await skipOnboarding(ctxA) // the first-run intro (e2e/fixtures/onboarding.ts)
  ctxB = await browser.newContext(opts)
  await skipOnboarding(ctxB) // the first-run intro (e2e/fixtures/onboarding.ts)
  A = await ctxA.newPage()
  B = await ctxB.newPage()
  for (const [who, p] of [["A", A], ["B", B]] as const) {
    p.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console.log(`[${who} ${m.type()}] ${m.text().slice(0, 300)}`)
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

test("E-a: a new person (NEAR wallet) creates a Pot and gets the share link", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  accA = await accountOf(A.request)
  expect(accA).toBe(accounts.people[0]!.accountId)
  // the token registration is the relayer's, once, after the sign-in (D-23)
  await eventually(() => chain.usdc.storageBalanceOf(accA as never), (v) => !!v.value, 45_000)
  // 0 NEAR for the person: the account has no balance of its own (NEP-448)
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  await createPot(A, { name: POT_NAME, emoji: "🎿" }) // the one Create screen (emoji from the cover's picker), default rules
  await expect(A.getByText("Free: we cover the setup.")).toBeVisible()

  await expect(A).toHaveURL(/\/p\/testnet-trip-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 45_000 })
  slug = new URL(A.url()).pathname.split("/")[2]!
  const share = A.getByRole("dialog", { name: `Invite friends to ${POT_NAME}` })
  await expect(share).toBeVisible()
  const linkEl = share.locator("[data-invite-link]")
  await expect(linkEl).toHaveText(new RegExp(`/j/${slug}\\?i=[1-9A-HJ-NP-Za-km-z]{43,44}#[A-Za-z0-9_-]{43}$`))
  link = (await linkEl.textContent())!
  await expect(share.getByText(/Link works until .+ · 10 more people can join with it/)).toBeVisible({ timeout: 30_000 })

  // chain: the Pot exists, Ana is its only member, the invite key in the link is live on the hub
  const pot = await eventually(() => chain.hub.getPot(dao(slug)), (v) => !!v.value)
  expect(pot.value!.name).toBe(POT_NAME)
  expect(pot.value!.creator).toBe(accA)
  expect(pot.value!.memberCount).toBe(1)
  const pk = `ed25519:${new URL(link).searchParams.get("i")}`
  const inv = await chain.hub.getInvite(dao(slug), pk as never)
  expect(inv.value?.status).toBe("active")
  // the person's own NEAR balance stays 0: token registration, gas and the Pot were sponsored
  expect(await nearBalance(accA)).toBe(0n)
  await share.getByRole("button", { name: "Close" }).click()
})

test("E-b: a friend opens the invite on another phone, joins and adds money", async () => {
  test.skip(!link, "needs E-a")
  const url = new URL(link)
  await B.goto(`${url.pathname}${url.search}${url.hash}`)
  await expect(B.getByRole("heading", { level: 1, name: `Ana invited you to ${POT_NAME}` })).toBeVisible()
  await expect(B.getByText("Ana is in")).toBeVisible()
  for (const scheme of ["light", "dark"] as const) {
    await B.emulateMedia({ colorScheme: scheme })
    await B.waitForTimeout(300)
    await B.screenshot({ path: `${SCREENS}live-${scheme === "dark" ? "night" : "day"}-join.png` })
  }
  await B.emulateMedia({ colorScheme: "light" })

  // "I have a NEAR wallet" → signed in → straight on to joining (D-08 signature with the #secret, relayed `join`)
  await walletSignIn(B)
  await expect(B.getByText(`Joining ${POT_NAME}…`)).toBeVisible({ timeout: 30_000 })
  const youreIn = B.getByRole("dialog", { name: "You're in!" })
  await expect(youreIn).toBeVisible({ timeout: 60_000 })
  expect(new URL(B.url()).hash).toBe("")
  accB = await accountOf(B.request)
  expect(accB).toBe(accounts.people[1]!.accountId)
  const members = await eventually(() => chain.hub.getMembers(dao(slug)), (v) => v.value.some((m) => m.account === accB && m.status === "active"))
  expect(members.value.map((m) => m.account).sort()).toEqual([accA, accB].sort())

  // "Add my $150 share" → the prefilled Add sheet → demo dollars from the faucet → ft_transfer_call
  await youreIn.getByRole("button", { name: "Add my $150 share" }).click()
  await expect(B).toHaveURL(new RegExp(`/p/${slug}\\?sheet=add&amount=150`))
  const add = B.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  await expect(add).toBeVisible({ timeout: 30_000 })
  await add.getByRole("button", { name: "Add $150" }).click()
  await expect(B.getByRole("dialog")).toBeHidden()
  await expect(B.getByText("+$150 on the way")).toBeVisible()
  await expect(hero(B)).toHaveText("$150.00", { timeout: 60_000 })
  await expect(B.getByText("Ben added $150").first()).toBeVisible()
  expect(await eventually(() => potBalance(slug), (b) => b === usd(150))).toBe(usd(150))

  // A sees it on the 3 s heartbeat, then adds $100 too (so the close splits between two people)
  await A.goto(`/p/${slug}`)
  await expect(hero(A)).toHaveText("$150.00", { timeout: 30_000 })
  await addMoney(A, 100)
  await expect(hero(A)).toHaveText("$250.00", { timeout: 60_000 })
  expect(await eventually(() => potBalance(slug), (b) => b === usd(250))).toBe(usd(250))
  await expect(hero(B)).toHaveText("$250.00", { timeout: 30_000 })
  await expect(A.getByText("+$100 on the way")).toBeHidden()
  await expect(A.getByText("You put in $100")).toBeVisible({ timeout: 30_000 })
})

test("E-c: instant spend → Approved by Pot rules → the balance drops on chain", async () => {
  test.skip(!accB, "needs E-b")
  const before = await usdcOf(accB)
  await B.getByRole("button", { name: "Spend" }).click()
  const sheet = B.getByRole("dialog", { name: `Spend from ${POT_NAME}` })
  await expect(sheet).toBeVisible()
  await typeAmount(B, "20")
  await expect(sheet.getByText("This will be approved instantly")).toBeVisible()
  await spendFlow(B, { reason: "Groceries", submit: "Get $20 back" })
  await expect(sheet.getByText("Checking Pot rules…")).toBeVisible()
  await expect(sheet.locator("[data-capsule]").getByText("Approved by Pot rules")).toBeVisible({ timeout: 30_000 })
  await expect(sheet.getByText("$20 sent to you")).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole("button", { name: "Done" }).click()

  expect(await eventually(() => potBalance(slug), (b) => b === usd(230))).toBe(usd(230))
  expect(await eventually(() => usdcOf(accB), (b) => b === before + usd(20))).toBe(before + usd(20))
  const reqs = (await chain.hub.getRequests(dao(slug), 0, 50)).value
  expect(reqs.at(-1)).toMatchObject({ requester: accB, receiver: accB, amount: usd(20), path: "instant" })
  await expect(hero(B)).toHaveText("$230.00", { timeout: 30_000 })
  const row = B.locator("[data-feed] li", { hasText: "Ben got $20 back for groceries" })
  await expect(row).toBeVisible()
  await expect(row.getByText("Approved by Pot rules")).toBeVisible()
  await expect(hero(A)).toHaveText("$230.00", { timeout: 30_000 })
  // review screenshots of the live Pot (a separate screenshot spec did this before Rev 9)
  for (const scheme of ["light", "dark"] as const) {
    await B.emulateMedia({ colorScheme: scheme })
    await B.waitForTimeout(400)
    await B.screenshot({ path: `${SCREENS}live-${scheme === "dark" ? "night" : "day"}-pot.png` })
  }
  await B.emulateMedia({ colorScheme: "light" })
})

test("E-d: over the instant limit → needs 2 of 2 → the friend approves → executed", async () => {
  test.skip(!accB, "needs E-b")
  const before = await usdcOf(accA)
  await A.getByRole("button", { name: "Spend" }).click()
  const sheet = A.getByRole("dialog", { name: `Spend from ${POT_NAME}` })
  await typeAmount(A, "120")
  await expect(sheet.getByText("This needs 2 of 2 approvals")).toBeVisible()
  await spendFlow(A, { reason: "Tickets", submit: "Ask the group" })
  await expect(sheet.getByText("Sent to the group")).toBeVisible({ timeout: 45_000 })
  await expect(sheet.getByText("Approvals · 1 of 2")).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole("button", { name: "Done" }).click()

  // chain: a vote-path request with Ana's own approval on the DAO proposal
  const req = await eventually(
    () => chain.hub.getRequests(dao(slug), 0, 50).then((r) => r.value.find((x) => x.path === "vote")),
    (r) => !!r && r.proposalId !== null,
  )
  const prop = await eventually(() => chain.dao.getProposal(dao(slug), req!.proposalId!), (p) => p.value?.votes[accA] === "Approve")
  expect(prop.value!.status).toBe("InProgress")

  // B: the Requests badge, then Approve
  await B.goto("/requests")
  await expect(B.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible()
  await B.getByRole("button", { name: /^Ana asks for \$120 for tickets/ }).click({ timeout: 30_000 })
  const approve = B.getByRole("dialog", { name: "Ana asks for $120" })
  await expect(approve.getByText("Needs approval because it's over the $100 instant limit.")).toBeVisible()
  await approve.getByRole("button", { name: "Approve $120" }).click()
  await expect(approve.getByText("Approved! $120 is on its way to Ana.")).toBeVisible({ timeout: 45_000 })
  await approve.getByRole("button", { name: "Done" }).click()

  const done = await eventually(() => chain.dao.getProposal(dao(slug), req!.proposalId!), (p) => p.value?.status === "Approved")
  expect(done.value!.votes[accB]).toBe("Approve")
  expect(await eventually(() => potBalance(slug), (b) => b === usd(110))).toBe(usd(110))
  expect(await eventually(() => usdcOf(accA), (b) => b === before + usd(120))).toBe(before + usd(120))
  // the relayer's `sync` moves the hub's request to approved
  await eventually(() => chain.hub.getRequest(dao(slug), req!.id), (r) => r.value?.status === "approved" || r.value?.status === "paid")
  await A.goto(`/p/${slug}`)
  await expect(hero(A)).toHaveText("$110.00", { timeout: 30_000 })
  await expect(A.locator("[data-feed] li", { hasText: "$120 sent to Ana for tickets" })).toBeVisible()
})

test("E-f: close → pro-rata refunds visible and paid on chain", async () => {
  test.skip(!accB, "needs E-b")
  const [a0, b0] = [await usdcOf(accA), await usdcOf(accB)]
  await A.goto(`/p/${slug}`)
  await expect(hero(A)).toHaveText("$110.00", { timeout: 30_000 })
  await potMore(A, POT_NAME, /Close Pot/)
  // the title stays "Close …?" for the person who asked (the sheet turns into the "waiting for the group" face)
  const sheet = A.getByRole("dialog")
  await expect(sheet.getByRole("heading", { name: `Close ${POT_NAME}?` })).toBeVisible()
  await expect(sheet).toBeVisible()
  // pro-rata: Ana put in $100, Ben $150, $110 left → $44 and $66
  await expect(sheet.locator('[data-refund-row="Ana"]')).toContainText("$44.00")
  await expect(sheet.locator('[data-refund-row="Ben"]')).toContainText("$66.00")
  // money moved in the last minute → "close.busy"; the sheet offers Try again
  for (let i = 0; i < 8; i++) {
    const cta = sheet.locator("[data-close-cta]")
    await cta.click()
    const outcome = await Promise.race([
      sheet.locator('[data-close-status="sent"]').waitFor({ timeout: 60_000 }).then(() => "sent"),
      sheet.locator('[data-close-error="close.busy"]').waitFor({ timeout: 60_000 }).then(() => "busy"),
    ])
    if (outcome === "sent") break
    await A.waitForTimeout(15_000)
  }
  await expect(sheet.locator('[data-close-status="sent"]')).toBeVisible()
  const pot = await eventually(() => chain.hub.getPot(dao(slug)), (v) => v.value?.status === "closing" && v.value.closeProposalId !== undefined)
  const pid = pot.value!.closeProposalId!
  await sheet.getByRole("button", { name: "Done" }).click()

  // B approves the close from the "Waiting on you" card
  await B.goto(`/p/${slug}`)
  const card = B.locator("[data-close-card]").first()
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.getByRole("button", { name: "Review" }).click()
  const vote = B.getByRole("dialog") // its title turns into "Pot closed" once the last approval pays out
  await expect(vote.getByRole("heading", { name: `Ana wants to close ${POT_NAME}` })).toBeVisible()
  await expect(vote.getByText("You'd get back $66.00")).toBeVisible()
  await vote.locator("[data-close-approve]").click()
  await expect(vote.locator('[data-close-status="done"]')).toBeVisible({ timeout: 60_000 })

  const closed = await eventually(() => chain.dao.getProposal(dao(slug), pid), (p) => p.value?.status === "Approved", 60_000)
  expect(closed.value!.votes[accB]).toBe("Approve")
  expect(await eventually(() => potBalance(slug), (b) => b === 0n, 60_000)).toBe(0n)
  expect(await eventually(() => usdcOf(accA), (b) => b === a0 + usd(44))).toBe(a0 + usd(44))
  expect(await eventually(() => usdcOf(accB), (b) => b === b0 + usd(66))).toBe(b0 + usd(66))
  await eventually(() => chain.hub.getPot(dao(slug)), (v) => v.value?.status === "closed", 60_000)

  // the refunds are visible in the app
  await A.goto(`/p/${slug}?tab=members`)
  await expect(hero(A)).toHaveText("$0.00", { timeout: 30_000 })
  await expect(A.getByText("Pot closed").first()).toBeVisible()
  await potMore(A, POT_NAME, "See who got what")
  const done = A.getByRole("dialog", { name: "Pot closed" })
  await expect(done.locator('[data-refund-row="Ana"]')).toContainText("$44.00")
  await expect(done.locator('[data-refund-row="Ben"]')).toContainText("$66.00")
})
