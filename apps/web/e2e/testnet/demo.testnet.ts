// X-07 testnet tier, E-e: the live persona demo, now /demo/live behind FLAG_DEMO_LIVE (it was README J-1…J-5 before
// /demo became the simulated explainer; the L-n steps keep that script). Formerly on /demo (test-plan §5.2-5.3, E-10 with E-01…E-03 observed
// from a second context). Context M is Maya: /demo → "Try as Maya" leases a seeded pool Pot ($450, 3 people).
// Context L gets a copy of Maya's demo visitor cookie (same lease, own session) and opens /demo?as=leo.
//   J-1  /demo without JavaScript names the reference Pot and $450
//   J-2  Try as Maya → the leased Pot, $450, 3 members; Leo sees the same Pot
//   J-3  Spend $20 groceries → "Approved by Pot rules" → "$20 sent to you" → $430 on chain and in Leo's app
//   J-4  $300 tickets → "This needs 2 of 3 approvals" → Ask the group → Maya's approval counted (1 of 2)
//   J-5  /demo?as=leo → Requests → Approve → executed: $130 on chain, both apps
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { typeAmount } from "../fixtures/pot"
import { accountOf, chain, dao, eventually, potBalance, shareVisitor, usd } from "./chain"

test.describe.configure({ mode: "serial" })

let ctxM: BrowserContext
let ctxL: BrowserContext
let M: Page
let L: Page
let slug = ""
let maya = ""
let start = 0n

// Demo leases are scarce (a seeded pool Pot each): a run keeps Maya's visitor cookie and the next run reuses the
// same lease while it lasts (2 h). E2E_DEMO_FRESH=1 takes a new one. Amounts are asserted relative to the start.
const VISITOR = fileURLToPath(new URL("../../test-results/testnet-demo-visitor.json", import.meta.url))
const fmt = (m: bigint) => `$${(Number(m) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hero = (p: Page) => p.locator("[data-hero] [data-money]").first()

test.beforeAll(async ({ browser }) => {
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ctxM = await browser.newContext(opts)
  ctxL = await browser.newContext(opts)
  if (existsSync(VISITOR) && process.env.E2E_DEMO_FRESH !== "1") await ctxM.addCookies(JSON.parse(readFileSync(VISITOR, "utf8")))
  M = await ctxM.newPage()
  L = await ctxL.newPage()
})

test.afterAll(async () => {
  await ctxM?.close()
  await ctxL?.close()
})

test("L-1: /demo/live works without JavaScript (the reference Pot snapshot)", async ({ request }) => {
  const html = await (await request.get("/demo/live")).text()
  expect(html).toContain("Lisbon Trip")
  expect(html).toContain("$450")
  expect(html).toContain('action="/api/demo/session"')
})

test("L-2: Try as Maya leases a seeded Pot; Leo joins the same lease from another phone", async () => {
  await M.goto("/demo/live")
  await M.getByRole("button", { name: "Maya, who organized the trip" }).click()
  await expect(M).toHaveURL(/\/p\/[a-z0-9-]+$/, { timeout: 30_000 })
  slug = new URL(M.url()).pathname.split("/")[2]!
  const v = (await ctxM.cookies()).filter((c) => c.name.includes("pot_demo_visitor"))
  mkdirSync(dirname(VISITOR), { recursive: true })
  writeFileSync(VISITOR, JSON.stringify(v))
  await expect(M.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible({ timeout: 30_000 })
  start = await potBalance(slug)
  expect(start).toBeGreaterThanOrEqual(usd(320)) // a fresh lease holds $450 (D-61); a reused one at least what J-3…J-5 need
  await expect(hero(M)).toHaveText(fmt(start))
  await expect(M.locator("[data-demo-banner]")).toContainText("Demo · test money on NEAR testnet")
  maya = await accountOf(M.request)
  const pot = (await chain.hub.getPot(dao(slug))).value!
  expect(pot.memberCount).toBe(3)
  expect(pot.creator).toBe(maya)

  await shareVisitor(ctxM, ctxL)
  await L.goto("/demo/live?as=leo")
  await expect(L).toHaveURL(new RegExp(`/p/${slug}$`), { timeout: 30_000 })
  await expect(L.getByRole("button", { name: "You're Leo" })).toBeVisible()
  await expect(hero(L)).toHaveText(fmt(start))
})

test("L-3: Spend $20 for groceries → Approved by Pot rules → $430 on chain and on Leo's phone", async () => {
  test.skip(!slug, "needs J-2")
  await M.getByRole("button", { name: "Spend" }).click()
  const sheet = M.getByRole("dialog", { name: "Spend from Lisbon Trip" })
  await typeAmount(M, "20")
  await expect(sheet.getByText("This will be approved instantly")).toBeVisible()
  await sheet.getByRole("button", { name: /Groceries/ }).click()
  await sheet.getByRole("button", { name: "Get $20 back" }).click()
  const t0 = Date.now()
  await expect(sheet.getByText("Checking Pot rules…")).toBeVisible()
  await expect(sheet.locator("[data-capsule]").getByText("Approved by Pot rules")).toBeVisible({ timeout: 30_000 })
  const approvedMs = Date.now() - t0
  await expect(sheet.getByText("$20 sent to you")).toBeVisible({ timeout: 30_000 })
  const sentMs = Date.now() - t0
  test.info().annotations.push({ type: "timing", description: `approved ${approvedMs} ms, sent ${sentMs} ms` })
  await sheet.getByRole("button", { name: "Done" }).click()
  const after = start - usd(20)
  expect(await eventually(() => potBalance(slug), (b) => b === after)).toBe(after)
  await expect(hero(M)).toHaveText(fmt(after), { timeout: 30_000 })
  await expect(hero(L)).toHaveText(fmt(after), { timeout: 30_000 })
  await expect(M.locator("[data-feed] li", { hasText: "Maya got $20 back for groceries" }).first().getByText("Approved by Pot rules")).toBeVisible()
})

test("L-4 + L-5: $300 needs 2 of 3 → /demo/live?as=leo approves → executed", async () => {
  test.skip(!slug, "needs J-2")
  await M.getByRole("button", { name: "Spend" }).click()
  const sheet = M.getByRole("dialog", { name: "Spend from Lisbon Trip" })
  await typeAmount(M, "300")
  await expect(sheet.getByText("This needs 2 of 3 approvals")).toBeVisible()
  await sheet.getByRole("button", { name: /Tickets/ }).click()
  await sheet.getByRole("button", { name: "Ask the group" }).click()
  await expect(sheet.getByText("Sent to the group")).toBeVisible({ timeout: 45_000 })
  await expect(sheet.getByText("Approvals · 1 of 2")).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole("button", { name: "Done" }).click()
  const req = await eventually(
    () => chain.hub.getRequests(dao(slug), 0, 50).then((r) => r.value.filter((x) => x.path === "vote" && x.amount === usd(300)).at(-1)),
    (r) => !!r && r.proposalId !== null,
  )
  await eventually(() => chain.dao.getProposal(dao(slug), req!.proposalId!), (p) => p.value?.votes[maya] === "Approve")

  // Leo (J-5 in the README): /demo?as=leo → Requests (badge 1) → Approve
  await L.goto("/demo/live?as=leo")
  await expect(L).toHaveURL(new RegExp(`/p/${slug}$`), { timeout: 30_000 })
  const requestsLink = L.getByRole("link", { name: "Requests, 1 request waiting on you" }).locator("visible=true")
  await expect(requestsLink).toBeVisible({ timeout: 30_000 })
  await requestsLink.click()
  await L.getByRole("button", { name: /^Maya asks for \$300 for tickets/ }).first().click()
  const approve = L.getByRole("dialog", { name: "Maya asks for $300" })
  await expect(approve.getByText("Maya · asked, approval counted")).toBeVisible()
  await approve.getByRole("button", { name: "Approve $300" }).click()
  await expect(approve.getByText("Approved! $300 is on its way to Maya.")).toBeVisible({ timeout: 45_000 })

  const p = await eventually(() => chain.dao.getProposal(dao(slug), req!.proposalId!), (x) => x.value?.status === "Approved")
  expect(Object.values(p.value!.votes).filter((v) => v === "Approve").length).toBe(2)
  const end = start - usd(320)
  expect(await eventually(() => potBalance(slug), (b) => b === end)).toBe(end)
  await eventually(() => chain.hub.getRequest(dao(slug), req!.id), (r) => r.value?.status === "approved" || r.value?.status === "paid")
  await M.goto(`/p/${slug}`)
  await expect(hero(M)).toHaveText(fmt(end), { timeout: 30_000 })
  await expect(M.locator("[data-feed] li", { hasText: "$300 sent to Maya for tickets" }).first()).toBeVisible()
})
