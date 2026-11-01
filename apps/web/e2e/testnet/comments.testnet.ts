// Comments on requests against the real chain + our API: two throwaway people (NEAR wallet, the e2e mock wallet).
// Ana creates ONE Pot, Ben joins and adds $150, Ana asks for $120 for tickets (over the $100 instant limit → the
// group decides), Ben opens it from Requests and comments, Ana sees Ben's comment in her request sheet (the 10 s
// poll, no reload), replies, Ben deletes his own ("Comment removed" on Ana's side), and after a reload Ana's request
// row carries the comment count from the feed route. Comments are off-chain: they sign nothing; the chain checks
// below only confirm the request the thread hangs on.
// Cost: 2 accounts (≈ 0.017 NEAR from the holding account) + 1 Pot (≈ 0.07 NEAR hub float) + relayer gas for
// create, join, one add, one request and Ana's own approval.
// Run it only against a private database with migration 0003 applied (never the shared `pot` DB):
//   E2E_TESTNET=1 E2E_PORT=3817 NEXT_DIST_DIR=.next-comments \
//   DATABASE_URL=postgres://pot:pot@localhost:54329/pot_comments DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_comments \
//   scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts comments
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { spendFlow } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, potBalance, usd, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Talk Trip ${RUN}`

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxB: BrowserContext
let A: Page
let B: Page
let slug = ""
let accA = ""
let accB = ""
let requestId = -1
let accounts: TestAccounts

const hero = (p: Page) => p.locator("[data-hero] [data-money]").first()
const thread = (p: Page) => p.getByRole("dialog").locator("[data-comments]")
const composer = (p: Page) => p.getByRole("dialog").getByRole("textbox", { name: "Write a comment" })

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

test("setup: Ana creates one Pot, Ben joins and adds $150, Ana asks the group for $120", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  accA = await accountOf(A.request)
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  const step1 = A.getByRole("dialog", { name: "Name your Pot" })
  await step1.getByRole("textbox", { name: /Pot name/ }).fill(POT_NAME)
  await step1.getByRole("button", { name: "Next" }).click()
  await A.getByRole("dialog", { name: "Pot rules" }).getByRole("button", { name: "Create Pot" }).click()
  await expect(A).toHaveURL(/\/p\/talk-trip-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  slug = new URL(A.url()).pathname.split("/")[2]!
  console.log(`[comments] Pot ${dao(slug)}`)
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
  expect(await eventually(() => potBalance(slug), (b) => b === usd(150), 60_000)).toBe(usd(150))

  // Ana: $120 for tickets is over the $100 instant limit → sent to the group (her own approval counted)
  await A.goto(`/p/${slug}`)
  await expect(hero(A)).toHaveText("$150.00", { timeout: 30_000 })
  await A.getByRole("button", { name: "Spend", exact: true }).click()
  const sheet = A.getByRole("dialog", { name: `Spend from ${POT_NAME}` })
  await spendFlow(A, { amount: "120", reason: "Tickets", submit: "Ask the group" })
  await expect(sheet.getByText("Sent to the group")).toBeVisible({ timeout: 45_000 })
  await sheet.getByRole("button", { name: "Done" }).click()
  const req = await eventually(
    () => chain.hub.getRequests(dao(slug), 0, 50).then((r) => r.value.find((x) => x.path === "vote")),
    (r) => !!r && r.proposalId !== null,
    60_000,
  )
  requestId = req!.id
  console.log(`[comments] request ${requestId} (proposal ${req!.proposalId}) by ${accA}`)
})

test("Ben comments from Requests; Ana sees it in her open sheet (no reload), replies; Ben deletes his", async () => {
  test.skip(requestId < 0, "needs setup")
  // Ana keeps her own request open: the thread polls every 10 s
  await A.goto(`/p/${slug}?r=${requestId}`)
  await expect(A.getByRole("dialog", { name: "Ana asks for $120" })).toBeVisible({ timeout: 30_000 })
  await expect(thread(A).locator("[data-comments-empty]")).toBeVisible({ timeout: 30_000 })

  // Ben: Requests → the card → the sheet → a comment
  await B.goto("/requests")
  await B.getByRole("button", { name: /^Ana asks for \$120 for tickets/ }).click({ timeout: 60_000 })
  await expect(B.getByRole("dialog", { name: "Ana asks for $120" })).toBeVisible()
  await expect(thread(B).locator("[data-comments-empty]")).toBeVisible({ timeout: 30_000 })
  await composer(B).fill("Are these the Friday tickets?")
  await B.getByRole("dialog").getByRole("button", { name: "Send" }).click()
  await expect(thread(B).locator("[data-comments-live]")).toHaveText("Comment sent.", { timeout: 30_000 })
  await expect(thread(B).locator("[data-comment-state='sent']", { hasText: "Are these the Friday tickets?" })).toBeVisible()

  // Ana: it arrives by itself (10 s poll), named
  const bens = thread(A).locator("[data-comment]", { hasText: "Are these the Friday tickets?" })
  await expect(bens).toBeVisible({ timeout: 30_000 })
  await expect(bens).toContainText("Ben")
  await expect(bens.locator("[data-comment-delete]")).toHaveCount(0)
  await composer(A).fill("Yes, the 8pm show.")
  await A.getByRole("dialog").getByRole("button", { name: "Send" }).click()
  await expect(thread(A).locator("[data-comments-live]")).toHaveText("Comment sent.", { timeout: 30_000 })
  await expect(thread(A).getByRole("heading", { name: "Comments · 2" })).toBeVisible()

  // the API agrees, for both of them (members only: the server checked get_members)
  const api = async (p: Page) =>
    (await (await p.request.get(`/api/pots/${encodeURIComponent(dao(slug))}/requests/${requestId}/comments`)).json()) as {
      comments: { id: string; author: string; body: string | null; deleted: boolean }[]
    }
  const seen = await api(B)
  expect(seen.comments.map((c) => [c.author, c.body])).toEqual([
    [accB, "Are these the Friday tickets?"],
    [accA, "Yes, the 8pm show."],
  ])

  // Ben deletes his own; Ana's sheet shows "Comment removed" after its next poll
  await expect(thread(B).locator("[data-comment]", { hasText: "Yes, the 8pm show." })).toBeVisible({ timeout: 30_000 })
  await thread(B).getByRole("button", { name: /^Delete your comment from/ }).click()
  await expect(thread(B).locator("[data-comments-live]")).toHaveText("Comment deleted.", { timeout: 30_000 })
  await expect(thread(A).locator("[data-comment-state='removed']")).toContainText("Comment removed", { timeout: 30_000 })
  await expect(thread(A).getByText("Are these the Friday tickets?")).toHaveCount(0)
  expect((await api(A)).comments[0]).toMatchObject({ author: accB, deleted: true, body: null })

  // someone else's comment can't be deleted (404), and the request row carries the count from the feed route
  const anasId = (await api(A)).comments.find((c) => c.author === accA)!.id
  const del = await B.request.delete(`/api/pots/${encodeURIComponent(dao(slug))}/requests/${requestId}/comments/${anasId}`, {
    data: {},
    headers: { origin: new URL(B.url()).origin },
  })
  expect(del.status()).toBe(404)
  await A.goto(`/p/${slug}`)
  await expect(A.getByRole("button", { name: /^Ana asks for \$120 for tickets/ }).first().locator("[data-comment-count='1']")).toBeVisible({ timeout: 30_000 })
})
