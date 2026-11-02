// Spend details with saved receipts against the real chain + our API (2026-11-02). NOT RUN by the agent that wrote it:
// it signs testnet transactions, so a human must OK the run. Two throwaway people (NEAR wallet, the e2e mock wallet).
// Ana creates ONE Pot, Ben joins and adds $150, Ana scans a receipt and asks for $84.20 (instant, or one OK: she put no money in). Checked:
//  - on chain: the request's request_ref is 32 chars = OpKey + the first 16 hex of the SHA-256 of the saved details'
//    canonical JSON (no contract change: the hub's own valid_request_ref allows 8-32 [a-z0-9]); the DAO proposal's
//    description carries it too ("Pot request #N: groceries (ref …)");
//  - our API: Ben (a member) reads the details and their fingerprint equals the one on chain, recomputed here; Ana
//    can't save other details (once, and a mismatch is refused); Ben can't attach details to Ana's spend; signed out
//    gets nothing;
//  - the UI: Ana's row says "Receipt attached" and opens its details; Ben sees "Receipt fingerprint matches";
//    the public record shows a visitor only "Receipt attached".
// Cost: 2 accounts (≈ 0.017 NEAR from the holding account) + 1 Pot (≈ 0.07 NEAR hub float) + relayer gas for create,
// join, one add and one spend (+ an OK when it needs one: not done here). Receipts are read in mock mode (NEAR_AI_RECEIPTS_MODE=mock: the sample
// $84.20 Pingo Doce reading, no NEAR AI credit), unless the server has a NEAR_AI_API_KEY and you drop that variable.
// Run it only against a private database with migration 0004 applied (never the shared `pot` DB):
//   E2E_TESTNET=1 E2E_PORT=3818 NEXT_DIST_DIR=.next-details-testnet NEAR_AI_RECEIPTS_MODE=mock \
//   DATABASE_URL=postgres://pot:pot@localhost:54329/pot_details DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_details \
//   scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts spend-details
import { fileURLToPath } from "node:url"
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { isValidRequestRef, receiptFingerprintOfRef } from "@pot/sdk"
import { receiptFingerprint, shortFingerprint, type SavedReceipt } from "@/lib/receipt-saved"
import { createPot } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, potBalance, usd, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Receipt Trip ${RUN}`
const FIXTURE = fileURLToPath(new URL("../fixtures/receipts/receipt-pingo-doce.jpg", import.meta.url))

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxB: BrowserContext
let A: Page
let B: Page
let slug = ""
let accA = ""
let requestId = -1
let ref = ""
let accounts: TestAccounts

const hero = (p: Page) => p.locator("[data-hero] [data-money]").first()
const receiptApi = () => `/api/pots/${encodeURIComponent(dao(slug))}/requests/${requestId}/receipt`

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

test("setup: Ana creates one Pot, Ben joins and adds $150", async () => {
  await A.goto("/pots")
  await walletSignIn(A)
  await expect(A.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  accA = await accountOf(A.request)
  await A.getByRole("button", { name: "Start a Pot" }).first().click()
  await createPot(A, { name: POT_NAME }) // the one Create screen, default rules
  await expect(A).toHaveURL(/\/p\/receipt-trip-[a-z0-9]+-[a-z0-9]{4}\?sheet=share$/, { timeout: 60_000 })
  slug = new URL(A.url()).pathname.split("/")[2]!
  console.log(`[spend-details] Pot ${dao(slug)}`)
  const share = A.getByRole("dialog", { name: `Invite friends to ${POT_NAME}` })
  const link = (await share.locator("[data-invite-link]").textContent())!
  await share.getByRole("button", { name: "Close" }).click()

  const u = new URL(link)
  await B.goto(`${u.pathname}${u.search}${u.hash}`)
  await walletSignIn(B)
  const youreIn = B.getByRole("dialog", { name: "You're in!" })
  await expect(youreIn).toBeVisible({ timeout: 60_000 })
  await youreIn.getByRole("button", { name: "Add my $150 share" }).click()
  const add = B.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  await expect(add).toBeVisible({ timeout: 30_000 })
  await add.getByRole("button", { name: "Add $150", exact: true }).click()
  await expect(hero(B)).toHaveText("$150.00", { timeout: 60_000 })
  expect(await eventually(() => potBalance(slug), (b) => b === usd(150), 60_000)).toBe(usd(150))
})

test("Ana scans a receipt and asks for $84.20: the fingerprint rides in the request, the details are saved", async () => {
  test.skip(!slug, "needs setup")
  // Ana put no money in (D-08: instant needs a contribution), so this may go to one OK / the group: the details go
  // with the request either way
  await A.goto(`/p/${slug}`)
  await expect(hero(A)).toHaveText("$150.00", { timeout: 30_000 })
  await A.getByRole("button", { name: "Spend", exact: true }).click()
  const sheet = A.getByRole("dialog", { name: `Spend from ${POT_NAME}` })
  await expect(sheet.getByRole("button", { name: "Scan receipt" })).toBeVisible({ timeout: 30_000 })
  await sheet.locator("[data-receipt-input='camera']").setInputFiles(FIXTURE)
  await expect(sheet.locator("[data-receipt-summary]")).toBeVisible({ timeout: 45_000 })
  await expect(sheet.locator("[data-spend-body='2']")).toBeVisible()
  const ask = sheet.getByRole("button", { name: /^(Get \$84\.20 back|Ask the group|Ask for one OK)$/ })
  await ask.click()
  await expect(sheet.getByText(/\$84\.20 sent to you|Sent to the group|One OK from anyone else/).first()).toBeVisible({ timeout: 60_000 })
  await sheet.getByRole("button", { name: "Done" }).click()

  // on chain: the request carries OpKey + 16 hex (32 chars, the hub's own limit)
  const req = await eventually(
    () => chain.hub.getRequests(dao(slug), 0, 50).then((r) => r.value.find((x) => x.requester === accA)),
    (r) => !!r,
    60_000,
  )
  requestId = req!.id
  ref = req!.requestRef
  console.log(`[spend-details] request ${requestId} ref ${ref}`)
  expect(ref).toHaveLength(32)
  expect(isValidRequestRef(ref)).toBe(true)
  const onChain = receiptFingerprintOfRef(ref)
  expect(onChain).toMatch(/^[0-9a-f]{16}$/)
  if (req!.proposalId !== null) {
    const p = (await chain.dao.getProposal(dao(slug), req!.proposalId)).value
    expect(p?.description).toContain(`(ref ${ref})`)
  }

  // our API: the details are saved (the client posts them once the request id is known), and they match the chain
  const res = await eventually(
    () => A.request.get(receiptApi()).then(async (r) => (r.ok() ? ((await r.json()) as { receipt: SavedReceipt; fingerprint: string }) : null)),
    (r) => !!r,
    60_000,
  )
  expect(res!.receipt).toMatchObject({ merchant: "Pingo Doce", currency: "USD", totalCents: 8420 })
  expect(res!.fingerprint).toBe(receiptFingerprint(res!.receipt))
  expect(shortFingerprint(receiptFingerprint(res!.receipt))).toBe(onChain)
  expect(JSON.stringify(res)).not.toMatch(/base64|image\/jpeg/)
})

test("only the requester saves, once; members read; visitors don't", async ({ browser }) => {
  test.skip(requestId < 0, "needs the spend")
  const origin = { origin: new URL(A.url()).origin }
  const saved = (await (await A.request.get(receiptApi())).json()) as { receipt: SavedReceipt }
  // Ana again with other details: refused (already saved); Ben attaching to Ana's spend: refused
  const again = await A.request.post(receiptApi(), { data: { receipt: { ...saved.receipt, merchant: "Somewhere else" } }, headers: origin })
  expect(again.status()).toBe(409)
  const ben = await B.request.post(receiptApi(), { data: { receipt: saved.receipt }, headers: origin })
  expect([403, 409]).toContain(ben.status())
  // the same details again replay
  expect((await A.request.post(receiptApi(), { data: { receipt: saved.receipt }, headers: origin })).status()).toBe(200)
  // Ben (a member) reads them
  const read = (await (await B.request.get(receiptApi())).json()) as { receipt: SavedReceipt }
  expect(read.receipt).toEqual(saved.receipt)
  // signed out: nothing
  const anon = await browser.newContext()
  expect((await anon.request.get(`${new URL(A.url()).origin}${receiptApi()}`)).status()).toBe(401)
  await anon.close()
})

test("the UI: the row says Receipt attached and opens the details; Ben sees the check; the record shows a visitor only the mark", async ({ browser }) => {
  test.skip(requestId < 0, "needs the spend")
  await A.goto(`/p/${slug}`)
  const row = A.locator("[data-feed] li", { hasText: "$84.20" }).first()
  await expect(row.locator("[data-receipt-indicator]")).toHaveText("Receipt attached", { timeout: 30_000 })

  await B.goto(`/p/${slug}?r=${requestId}`)
  const details = B.getByRole("dialog", { name: /^Ana ask(s|ed) for \$84\.20$/ })
  await expect(details).toBeVisible({ timeout: 30_000 })
  await expect(details.locator("[data-saved-receipt-title]")).toHaveText(/^Pingo Doce/, { timeout: 30_000 })
  await expect(details.locator("[data-fingerprint]")).toHaveAttribute("data-fingerprint", "match")
  await expect(details.locator("[data-fingerprint]")).toContainText("Receipt fingerprint matches")

  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const v = await anon.newPage()
  await v.goto(`${new URL(A.url()).origin}/p/${slug}/record`)
  await expect(v.locator("[data-record-receipt] [data-receipt-indicator]").first()).toHaveText("Receipt attached", { timeout: 30_000 })
  await expect(v.locator("[data-record-receipt-details]")).toHaveCount(0)
  await expect(v.locator("main")).not.toContainText("Pingo Doce")
  await anon.close()
})
