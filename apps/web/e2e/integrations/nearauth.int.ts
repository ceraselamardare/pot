// F-14 / F-27 / B-07 / B-20 / B-13 end to end on the real app with a FAKE issuer and a FAKE chain (no testnet):
//  1. popup: "Continue with Google" → the window opens in the tap → /authorize (PKCE + the device-bound nonce) →
//     web_message → code exchange → POST /api/session verifies JWKS + challenge + nonce + PoP → the account is
//     created with the MPC key and this browser's device key → signed in.
//  2. redirect fallback: no window (blocked / iOS standalone) → the full-page redirect → the "/" callback island
//     finishes the sign-in → back to where the person was.
//  3. a second device of the same person → a pending device → the first signed action opens "Confirm it's you"
//     → the approval window (signing token with fatxn) → POST /api/devices → MPC sign + relayed AddKey → ready.
import { expect, test, type Page } from "@playwright/test"
import { FAKE_RPC } from "./playwright.config"

const RUN = Math.random().toString(36).slice(2, 8)

async function session(page: Page) {
  const r = await page.request.get("/api/session")
  return ((await r.json()) as { session: { kind: string; accountId: string; device?: { status: string } } | null }).session
}
async function chainState(account: string) {
  const r = await fetch(`${FAKE_RPC}/__state?account=${encodeURIComponent(account)}`)
  return (await r.json()) as { exists: boolean; keys: string[]; registered: boolean; mpc: string }
}
const hint = (page: Page, sub: string) => page.addInitScript((s) => localStorage.setItem("pot.nearauth.loginHint", s), sub)

test("popup: Continue with Google → a new Pot account with the MPC key and this device's key", async ({ page }) => {
  const sub = `google-oauth2|popup-${RUN}`
  await hint(page, sub)
  await page.goto("/pots")
  await expect(page.getByRole("heading", { name: "Sign in to Pot" })).toBeVisible()
  const popupP = page.waitForEvent("popup")
  await page.getByRole("button", { name: "Continue with Google" }).click()
  const popup = await popupP
  // the window opened inside the tap, then went to the issuer's /authorize with our PKCE + nonce
  await popup.waitForURL(/\/authorize\?/)
  const q = new URL(popup.url()).searchParams
  expect(q.get("code_challenge_method")).toBe("S256")
  expect(q.get("response_mode")).toBe("web_message")
  expect(q.get("connection")).toBe("google-oauth2")
  expect(q.get("nonce")).toMatch(/^[A-Za-z0-9_-]{43}$/)
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  const s = await session(page)
  expect(s).toMatchObject({ kind: "near-auth", device: { status: "active" } })
  expect(s!.accountId).toMatch(/^u-[0-9a-z]{8}\.users\./)
  const st = await chainState(s!.accountId)
  expect(st.exists).toBe(true)
  expect(st.keys).toContain(st.mpc)
  expect(st.keys).toHaveLength(2)
  await expect.poll(async () => (await chainState(s!.accountId)).registered).toBe(true)
})

test("redirect fallback: no window → the issuer redirects back to '/', the callback island finishes the sign-in", async ({ page }) => {
  await hint(page, `auth0|redirect-${RUN}`)
  await page.addInitScript(() => {
    window.open = () => null
  })
  await page.goto("/pots")
  await page.getByRole("button", { name: "Continue with Google" }).click()
  // a full-page round trip: issuer → http://localhost:<port>/?code&state → the island → back to /pots
  await page.waitForURL(/\/pots$/, { timeout: 30_000 })
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  expect(page.url()).not.toContain("code=")
  expect(await session(page)).toMatchObject({ kind: "near-auth" })
})

test("a new device: pending until 'Confirm it's you' adds its key through NEAR Auth + MPC, then the action resumes", async ({ browser }) => {
  const sub = `google-oauth2|twodevices-${RUN}`
  // device 1 creates the account
  const ctx1 = await browser.newContext()
  const p1 = await ctx1.newPage()
  await hint(p1, sub)
  await p1.goto("/pots")
  await p1.getByRole("button", { name: "Continue with Google" }).click()
  await expect(p1.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  const account = (await session(p1))!.accountId
  await ctx1.close()

  // device 2: same person, new browser key → signed in, device pending (not on chain yet)
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const p2 = await ctx2.newPage()
  await hint(p2, sub)
  await p2.goto("/pots")
  await p2.getByRole("button", { name: "Continue with Google" }).click()
  await expect(p2.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 30_000 })
  const s2 = await session(p2)
  expect(s2).toMatchObject({ kind: "near-auth", accountId: account, device: { status: "pending" } })
  expect((await chainState(account)).keys).toHaveLength(2)

  // the first action that needs this device's key: Start a Pot → Create
  await p2.getByRole("button", { name: "Start a Pot" }).first().click()
  const step1 = p2.getByRole("dialog", { name: "Name your Pot" })
  await step1.getByRole("textbox", { name: /Pot name/ }).fill(`Confirm ${RUN}`)
  await step1.getByRole("button", { name: "Next" }).click()
  await p2.getByRole("dialog", { name: "Pot rules" }).getByRole("button", { name: "Create Pot" }).click()

  const confirm = p2.getByRole("dialog", { name: "Confirm it's you" })
  await expect(confirm).toBeVisible({ timeout: 30_000 })
  await expect(confirm.getByText("Add this device to your Pot account")).toBeVisible()
  const cta = confirm.getByRole("button", { name: "Continue with Google" })
  await expect(cta).toBeEnabled({ timeout: 15_000 })
  const popupP = p2.waitForEvent("popup")
  // the original action (create_pot) resumes with this device's key once it's on the account
  const resumed = p2.waitForRequest((r) => r.url().endsWith("/api/relay") && r.method() === "POST", { timeout: 45_000 })
  await cta.click()
  const popup = await popupP
  await popup.waitForURL(/\/authorize\?/)
  const q = new URL(popup.url()).searchParams
  // the approval carries the exact AddKey delegate bytes (NEP-461 prefix 6e 01 00 40) and the signing audience
  expect(q.get("audience")).toBe("auth0.jwt.fast-auth.testnet")
  expect(q.get("delegateAction")).toMatch(/^110,1,0,64,/)
  await expect(confirm.locator('[data-phase="done"]')).toBeVisible({ timeout: 30_000 })
  // the new key is on the account, the session is bound to it
  await expect.poll(async () => (await chainState(account)).keys.length).toBe(3)
  await expect.poll(async () => (await session(p2))?.device?.status).toBe("active")
  await expect(confirm).toBeHidden({ timeout: 10_000 })
  const body = (await resumed).postDataJSON() as { intent: string; signedDelegate: string }
  expect(body.intent).toBe("create_pot")
  await ctx2.close()
})
