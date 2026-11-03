// The owner's case on the real testnet (2026-11-02, usepot.xyz): a simulated any-chain deposit that sends LESS than
// quoted, [Simulate sending $0.95 more] (tapped twice, as the owner did: the second tap used to fail with
// "Something went wrong"), the rest arrives as real "USDC (test)", then it goes into the Pot through the Add sheet:
// $3 of "Pot dollars you have", then "Use all" (a non-cent amount, $1.949505).
//   a NEAR wallet sign-in (the e2e mock wallet, a throwaway 0-NEAR account) creates a Pot → $150 of demo dollars
//   → Add money $5 → "Another app or exchange" → Solana → "Send less than needed" → INCOMPLETE → top-up ×2
//   → "The rest is on its way" → arrived ($4.949505 on chain) → Add $3 (own) → Add all (own) → Pot = $154.949505.
// Run (serialised with every other testnet run; a private DB):
//   scripts/with-testnet-lock.sh env E2E_TESTNET=1 E2E_PORT=2741 NEXT_DIST_DIR=.next-xcbug \
//     DATABASE_URL=postgres://pot:pot@localhost:54329/pot_xcbug DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_xcbug \
//     pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts deposit-partial
import { expect, test, type Page } from "@playwright/test"
import { addFlow, createPot } from "../fixtures/pot"
import { createTestAccounts } from "./accounts"
import { accountOf, chain, eventually, potBalance, usd, usdcOf, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Partial Trip ${RUN}`

/** Every /api/ answer that isn't a routine read, so a refusal's exact reason is in the log. */
function logApi(page: Page, failures: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().startsWith("[add money]")) console.log(`[page ${m.type()}] ${m.text().slice(0, 300)}`)
  })
  page.on("response", async (r) => {
    const u = new URL(r.url())
    if (!u.pathname.startsWith("/api/")) return
    const routine = r.request().method() === "GET" && r.status() < 400
    if (routine) return
    let body = ""
    try {
      body = (await r.text()).slice(0, 400)
    } catch {}
    const line = `${r.request().method()} ${u.pathname} → ${r.status()} ${body}`
    console.log(`[api] ${line}`)
    if (r.status() >= 400) failures.push(line)
  })
}

async function openAdd(page: Page, amount: string) {
  await page.getByRole("button", { name: "Add money" }).first().click()
  const sheet = page.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
  await expect(sheet).toBeVisible()
  for (let i = 0; i < 6; i++) await sheet.getByRole("button", { name: "delete", exact: true }).click()
  if (amount) await addFlow(page, { amount })
  return sheet
}

test("an underpaid simulated deposit → 'send more' twice → it arrives → $3 and the rest go into the Pot", async ({ page }) => {
  test.setTimeout(600_000)
  const failures: string[] = []
  logApi(page, failures)
  const accounts = await createTestAccounts(["Hu"])
  try {
    await useWallet(page, accounts.people[0]!)
    await page.goto("/pots")
    await walletSignIn(page)
    await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 45_000 })
    const account = await accountOf(page.request)
    await eventually(() => chain.usdc.storageBalanceOf(account as never), (v) => !!v.value, 45_000)
    await page.getByRole("button", { name: "Start a Pot" }).first().click()
    await createPot(page, { name: POT_NAME })
    await expect(page).toHaveURL(/\/p\/partial-trip-[a-z0-9-]+\?sheet=share$/, { timeout: 60_000 })
    const slug = new URL(page.url()).pathname.split("/")[2]!
    const share = page.getByRole("dialog", { name: `Invite friends to ${POT_NAME}` })
    await expect(share).toBeVisible({ timeout: 30_000 })
    await share.getByRole("button", { name: "Close" }).click()

    // like the owner: $150 of demo dollars first
    const first = await openAdd(page, "150")
    await first.getByRole("radio", { name: /Demo dollars/ }).click()
    await first.getByRole("button", { name: "Add $150" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await eventually(() => potBalance(slug), (v) => v === usd(150), 60_000)

    // Add money $5 → another app → Solana → "Send less than needed"
    const add = await openAdd(page, "5")
    await add.getByRole("radio", { name: /Another app or exchange/ }).click()
    await add.getByRole("button", { name: "Continue", exact: true }).click()
    const sheet = page.getByRole("dialog", { name: "Add from another wallet or exchange" })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("radio", { name: /Solana/ }).click()
    await sheet.getByRole("button", { name: "Get address" }).click()
    await expect(sheet.locator("[data-qr]")).toBeVisible({ timeout: 20_000 })
    await sheet.getByRole("button", { name: "Try a problem instead" }).click()
    await sheet.getByRole("button", { name: "Send less than needed" }).click()
    const stepper = sheet.locator("[data-deposit-stepper]")
    await expect(stepper).toHaveAttribute("data-status", "INCOMPLETE_DEPOSIT", { timeout: 90_000 })
    const topUp = sheet.getByRole("button", { name: "Simulate sending $0.95 more" })
    const depositId = new URL(page.url()).searchParams.get("d")!
    // the owner's double tap: the first click, then the identical request again (as a second tap sent it)
    await topUp.click()
    await expect(sheet.getByText("The rest is on its way")).toBeVisible({ timeout: 15_000 })
    await expect(sheet.getByRole("button", { name: /^Simulate sending/ })).toHaveCount(0)
    const again = await page.request.post("/api/oneclick/simulate", {
      headers: { origin: new URL(page.url()).origin, "content-type": "application/json" },
      data: { depositIntentId: depositId, amount: "950000", idempotencyKey: "tap2tap2tap2tap2" },
    })
    console.log(`[second tap] ${again.status()} ${(await again.text()).slice(0, 200)}`)
    expect(again.status()).toBe(200)
    expect(await again.json()).toMatchObject({ replayed: true, topUp: "already_sent" })
    await expect(sheet.getByRole("alert")).toHaveCount(0)

    await expect(stepper).toHaveAttribute("data-status", "SUCCESS", { timeout: 180_000 })
    const st = (await (await page.request.get(`/api/oneclick/status/${depositId}`)).json()) as { amountOut: string; depositedAmount: string }
    expect(st).toMatchObject({ depositedAmount: "4950000", amountOut: "4949505" })
    const arrived = BigInt(st.amountOut)
    await eventually(() => usdcOf(account), (v) => v === arrived, 60_000)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()

    // $3 of the arrived dollars through the Add sheet ("Pot dollars you have")
    const three = await openAdd(page, "3")
    await three.getByRole("radio", { name: /Pot dollars you have/ }).click()
    await three.getByRole("button", { name: "Add $3" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await eventually(() => potBalance(slug), (v) => v === usd(153), 60_000)
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /didn't go through|couldn't add/ })).toHaveCount(0)

    // the rest, a non-cent amount ($1.949505): "Use all"
    const rest = await openAdd(page, "")
    await rest.getByRole("radio", { name: /Pot dollars you have/ }).click()
    await rest.getByRole("button", { name: /^Use all/ }).click()
    await rest.getByRole("button", { name: /^Add \$1\.9/ }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await eventually(() => potBalance(slug), (v) => v === usd(150) + arrived, 60_000)
    await eventually(() => usdcOf(account), (v) => v === 0n, 45_000)
    expect(failures).toEqual([])
  } finally {
    await accounts.release()
  }
})
