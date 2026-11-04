// D-50 on the real testnet (the gated tier): the labelled 1Click simulator delivers REAL "USDC (test)" from the
// treasury through the token, and one tap adds it to the Pot with the member's own relayed `ft_transfer_call`.
//   a NEAR wallet sign-in (the e2e mock wallet, a throwaway 0-NEAR account; Rev 9) creates a Pot → Add money $150 → [Next] → "Another app or exchange" → [Continue] → Base → a simulated address (QR: DO NOT SEND)
//   → [Simulate sending $150] → the stepper → "Your $X arrived" (the member's balance rose on chain)
//   → [Add it to the Pot] → the Pot's balance on chain = the arrived amount, the deposit is ADDED.
// Also: a dry quote through our API comes from the LIVE 1Click API (mainnet, read-only, signed).
// Run (serialised with every other testnet run):
//   scripts/with-testnet-lock.sh env E2E_TESTNET=1 E2E_PORT=3427 NEXT_DIST_DIR=.next-testnet-int \
//     pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts deposit.testnet.ts
import { expect, test } from "@playwright/test"
import { addFlow, createPot } from "../fixtures/pot"
import { createTestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, potBalance, usdcOf, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const POT_NAME = `Deposit Trip ${RUN}`

test("simulate a deposit → it arrives on chain → one tap adds it to the Pot → the Pot's balance updates on chain", async ({ page, baseURL }) => {
  test.setTimeout(480_000)
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[page error] ${m.text().slice(0, 300)}`)
  })
  const accounts = await createTestAccounts(["Dee"])
  try {
    // 1. a person and their Pot
    await useWallet(page, accounts.people[0]!)
    await page.goto("/pots")
    await walletSignIn(page)
    await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 45_000 })
    const account = await accountOf(page.request)
    expect(account).toBe(accounts.people[0]!.accountId)
    // the relayer registers a wallet account on the token once, after the sign-in (D-23); the delivery needs it
    await eventually(() => chain.usdc.storageBalanceOf(account as never), (v) => !!v.value, 45_000)
    await page.getByRole("button", { name: "Start a Pot" }).first().click()
    await createPot(page, { name: POT_NAME }) // the one Create screen, default rules
    await expect(page).toHaveURL(/\/p\/deposit-trip-[a-z0-9-]+\?sheet=share$/, { timeout: 60_000 })
    const slug = new URL(page.url()).pathname.split("/")[2]!
    const share = page.getByRole("dialog", { name: `Invite friends to ${POT_NAME}` })
    await expect(share).toBeVisible({ timeout: 30_000 })
    await share.getByRole("button", { name: "Close" }).click()
    await expect(share).toBeHidden()
    expect(await usdcOf(account)).toBe(0n)

    // 2. a dry quote through our API is a real, signed 1Click quote (mainnet, read-only)
    const dry = await page.request.post("/api/oneclick/quote", {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: { pot: dao(slug), chain: "base", amount: "150000000", dry: true, idempotencyKey: "dry0000000000001" },
    })
    const dq = (await dry.json()) as { mode: string; quote: { amountOut: string; minAmountIn: string }; correlationId?: string }
    console.log(`[dry quote] ${JSON.stringify(dq).slice(0, 300)}`)
    expect(dq.mode).toBe("simulated")
    expect(dq.quote.minAmountIn).toBe("148500000")
    expect(BigInt(dq.quote.amountOut)).toBeLessThan(150_000_000n)

    // 3. Add money → another app → Base → the simulated address
    await page.getByRole("button", { name: "Add money" }).first().click()
    const add = page.getByRole("dialog", { name: `Add money to ${POT_NAME}` })
    await expect(add).toBeVisible()
    // step 1: $150 (any prefill cleared) → [Next]; step 2: another app → [Continue]
    for (let i = 0; i < 6; i++) await add.getByRole("button", { name: "delete", exact: true }).click()
    await addFlow(page, { amount: "150", source: "Another app or exchange", submit: "Continue" })
    const sheet = page.getByRole("dialog", { name: "Add from another app or exchange" })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("radio", { name: /^Base/ }).click()
    // any coin (2026-11-04): network → [Continue] → coin (USDC) → [Get address]
    await sheet.getByRole("button", { name: "Continue", exact: true }).click()
    await sheet.getByRole("radio", { name: /^USDC/ }).click()
    await sheet.getByRole("button", { name: "Get address" }).click()
    await expect(sheet.locator("[data-qr]")).toHaveAttribute("data-qr-text", "POT TESTNET DEMO - DO NOT SEND FUNDS", { timeout: 20_000 })
    await expect(sheet.getByText("Testnet demo: simulated transfer, no real money")).toBeVisible()
    const depositId = new URL(page.url()).searchParams.get("d")!
    expect(depositId).toMatch(/^dp_/)

    // 4. simulate → the stepper → arrived (the treasury's real token transfer)
    await sheet.getByRole("button", { name: "Simulate sending $150" }).click()
    const stepper = sheet.locator("[data-deposit-stepper]")
    await expect(stepper).toBeVisible()
    await expect(stepper).toHaveAttribute("data-status", "PROCESSING", { timeout: 60_000 })
    await expect(stepper).toHaveAttribute("data-status", "SUCCESS", { timeout: 90_000 })
    const arrivedText = (await sheet.locator("[data-arrived] p").first().textContent())!
    console.log(`[arrived] ${arrivedText}`)
    const st = (await (await page.request.get(`/api/oneclick/status/${depositId}`)).json()) as { amountOut: string; destinationTxHash: string; explorerUrl: string }
    console.log(`[delivery tx] ${st.explorerUrl}`)
    const arrived = BigInt(st.amountOut)
    expect(arrived).toBeGreaterThan(149_000_000n)
    await eventually(() => usdcOf(account), (v) => v === arrived, 45_000)

    // 5. one tap: the member's own relayed contribution
    await sheet.getByRole("button", { name: "Add it to the Pot" }).click()
    await expect(stepper).toHaveAttribute("data-status", "ADDED", { timeout: 60_000 })
    await expect(sheet.getByText(`${POT_NAME} has it now.`)).toBeVisible()
    const done = (await (await page.request.get(`/api/oneclick/status/${depositId}`)).json()) as { status: string; addedRelayId: string }
    expect(done.status).toBe("ADDED")
    console.log(`[added] relay ${done.addedRelayId}`)

    // 6. the chain agrees: the Pot holds exactly what arrived, the member holds nothing
    await eventually(() => potBalance(slug), (v) => v === arrived, 45_000)
    await eventually(() => usdcOf(account), (v) => v === 0n, 45_000)
    await sheet.getByRole("button", { name: "Done" }).click()
    await expect(page.locator("[data-hero] [data-money]").first()).toContainText(`$${(Number(arrived / 10_000n) / 100).toFixed(2)}`, { timeout: 30_000 })
  } finally {
    await accounts.release()
  }
})
