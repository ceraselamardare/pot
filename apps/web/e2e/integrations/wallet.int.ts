// F-19 / B-10 end to end on the real app with a MOCK wallet (build flag NEXT_PUBLIC_E2E_MOCK_WALLET=1) and a fake
// chain: "I have a NEAR wallet" → sign in + NEP-413 "Sign in to Pot" (one prompt) → POST /api/session/wallet
// rebuilds the exact payload, verifies the signature, checks the key is a full-access key on chain → a wallet
// session, and the USDC registration is paid once after the response. Refusals: our own accounts, a key that
// isn't full access, a cancelled wallet.
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"
import { expect, test, type Page } from "@playwright/test"
import { FAKE_RPC } from "./playwright.config"

const RUN = Math.random().toString(36).slice(2, 8)

function newWallet(accountId: string) {
  const seed = ed25519.utils.randomSecretKey()
  return { accountId, seedHex: Buffer.from(seed).toString("hex"), pk: `ed25519:${base58.encode(ed25519.getPublicKey(seed))}` }
}
async function onChain(id: string, keys: string[]) {
  await fetch(`${FAKE_RPC}/__control`, { method: "POST", body: JSON.stringify({ op: "account", id, keys }) })
}
async function useWallet(page: Page, w: { accountId: string; seedHex: string }) {
  await page.addInitScript((v) => localStorage.setItem("pot.e2e.wallet", JSON.stringify(v)), { accountId: w.accountId, seedHex: w.seedHex })
}
async function session(page: Page) {
  const r = await page.request.get("/api/session")
  return ((await r.json()) as { session: { kind: string; accountId: string; displayName: string } | null }).session
}

test("I have a NEAR wallet → one prompt → a wallet session; USDC registration paid once", async ({ page }) => {
  const w = newWallet(`alice-${RUN}.testnet`)
  await onChain(w.accountId, [w.pk])
  await useWallet(page, w)
  await page.goto("/pots")
  await page.getByRole("button", { name: "I have a NEAR wallet" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  const s = await session(page)
  expect(s).toMatchObject({ kind: "wallet", accountId: w.accountId })
  expect(s!.displayName).toMatch(/^Alice /)
  await expect
    .poll(async () => ((await (await fetch(`${FAKE_RPC}/__state?account=${w.accountId}`)).json()) as { registered: boolean }).registered)
    .toBe(true)
})

test("refused: one of Pot's own accounts, a key that isn't full access; a cancelled wallet is silent", async ({ page }) => {
  // an account under the project root (NEAR Auth users, the relayer, the hub…) can't open a wallet session
  const own = newWallet(`u-${RUN}0000.users.potprev.testnet`)
  await onChain(own.accountId, [own.pk])
  await useWallet(page, own)
  await page.goto("/pots")
  await page.getByRole("button", { name: "I have a NEAR wallet" }).click()
  await expect(page.getByText("We couldn't sign you in with that app. Try again, or pick another way.")).toBeVisible()
  expect(await session(page)).toBeNull()

  // the signing key isn't one of the account's keys (e.g. a function-call key of another app)
  const bob = newWallet(`bob-${RUN}.testnet`)
  await onChain(bob.accountId, [newWallet("x").pk])
  await page.evaluate((v) => localStorage.setItem("pot.e2e.wallet", JSON.stringify(v)), { accountId: bob.accountId, seedHex: bob.seedHex })
  await page.getByRole("button", { name: "I have a NEAR wallet" }).click()
  await expect(page.getByText("That sign-in can't add money in Pot. Use the account's main sign-in instead.")).toBeVisible()
  expect(await session(page)).toBeNull()

  // cancelled in the wallet: no error, still signed out
  await page.evaluate(() => localStorage.setItem("pot.e2e.walletCancel", "1"))
  await page.getByRole("button", { name: "I have a NEAR wallet" }).click()
  await page.waitForTimeout(500)
  await expect(page.locator("[data-signin-options] [role=alert]")).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Sign in to Pot" })).toBeVisible()
})
