// hub 1.1.0 (wave 4) against the real chain: earned trust, the one-OK tier, the public Pot record and the
// all-or-nothing goal. Green against the 1.1.0 hub on the preview (2026-11-02, notes/frontend.md "Hub 1.1.0
// testnet run"); needs a web build with the 1.1.0 relayer rules (R13). Against the 1.0.0 hub it skips itself.
// Two throwaway people (NEAR wallet, the e2e mock wallet) and TWO Pots:
//  1. "Trust": Ana creates it with trust on and one OK up to $300 (instant $100); Ben joins and adds $500, Ana adds
//     $500. Ben asks $180 → the hub's tier is one_ok; Ana gives the OK (ok_request, relayed, R13) → paid, the record
//     says "One OK by Ana". Ben makes 3 instant $20 spends (with the $180, 4 counted) → get_trust level 1, $200 instant; the Members tab shows
//     "Trusted"; the CSV of the record has every row.
//  2. "Goal": Ana creates it with an all-or-nothing goal of $1,000, date tomorrow → policy v2 on chain, Spend waits.
//     The refund itself needs the date to pass and the cron (refund_unfunded, relayer-signed): covered by the cron's
//     unit tests (server/ops/goals.test.ts) and contracts/tests W4; here only the collecting state is checked.
// Cost: 2 accounts (≈ 0.017 NEAR from the holding account) + 2 Pots (≈ 0.14 NEAR hub float) + relayer gas for create ×2,
// join, 2 adds, 4 spends, 1 OK. Run (only after the upgrade, with the human's OK, under the testnet lock):
//   E2E_TESTNET=1 E2E_PORT=3727 NEXT_DIST_DIR=.next-trust \
//   DATABASE_URL=postgres://pot:pot@localhost:54329/pot_trust DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_trust \
//   scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts wave4-trust-goal
import { expect, test, type BrowserContext, type Page } from "@playwright/test"
import { spendFlow } from "../fixtures/pot"
import { createTestAccounts, type TestAccounts } from "./accounts"
import { accountOf, chain, dao, eventually, usd, useWallet, walletSignIn } from "./chain"

const RUN = Math.random().toString(36).slice(2, 6)
const TRUST_POT = `Trust Trip ${RUN}`
const GOAL_POT = `Goal Trip ${RUN}`

test.describe.configure({ mode: "serial" })

let ctxA: BrowserContext
let ctxB: BrowserContext
let A: Page
let B: Page
let slug = ""
let accA = ""
let accB = ""
let accounts: TestAccounts | null = null
let hub11 = false

const hero = (p: Page) => p.locator("[data-hero] [data-money]").first()

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  // the 1.1.0 hub answers get_config.version "1.1.0" (and has get_goal / get_trusts)
  hub11 = (await chain.hub.getConfig()).value.version.startsWith("1.1")
  if (!hub11) return
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

async function createPot(p: Page, name: string, fill?: (step2: ReturnType<Page["getByRole"]>) => Promise<void>): Promise<string> {
  await p.goto("/pots")
  await p.getByRole("button", { name: "Start a Pot" }).first().click()
  const step1 = p.getByRole("dialog", { name: "Name your Pot" })
  await step1.getByRole("textbox", { name: /Pot name/ }).fill(name)
  await step1.getByRole("button", { name: "Next" }).click()
  const step2 = p.getByRole("dialog", { name: "Pot rules" })
  await fill?.(step2)
  await step2.getByRole("button", { name: "Create Pot" }).click()
  await expect(p).toHaveURL(/\?sheet=share$/, { timeout: 60_000 })
  return new URL(p.url()).pathname.split("/")[2]!
}

async function spend(p: Page, potName: string, dollars: string, chip: RegExp, cta: string, done: string | RegExp) {
  await p.getByRole("button", { name: "Spend", exact: true }).click()
  const sheet = p.getByRole("dialog", { name: `Spend from ${potName}` })
  await spendFlow(p, { amount: dollars, reason: chip.source, submit: cta })
  await expect(sheet.getByText(done).first()).toBeVisible({ timeout: 60_000 })
  await sheet.getByRole("button", { name: "Done" }).click()
}

test("trust + one OK: Ben's $180 needs one OK; Ana's OK pays it; 3 paid spends make Ben Trusted ($200)", async () => {
  test.skip(!hub11, "needs hub 1.1.0 on the preview deploy (notes/contracts-wave4.md §6)")
  test.setTimeout(600_000)
  await A.goto("/pots")
  await walletSignIn(A)
  accA = await accountOf(A.request)
  slug = await createPot(A, TRUST_POT, async (s) => {
    await expect(s.getByRole("switch", { name: "Trust grows" })).toHaveAttribute("aria-checked", "true")
    await expect(s.getByRole("textbox", { name: "Spends up to this much need just one OK from anyone else" })).toHaveValue("300")
  })
  console.log(`[wave4] trust Pot ${dao(slug)}`)
  const pv = await eventually(() => chain.hub.getPot(dao(slug)), (v) => !!v.value)
  expect(pv.value!.extras).toEqual({ trust: true, oneOkCap: usd(300), links: true, goal: null })
  expect(pv.value!.policyVersion).toBe(1)

  const share = A.getByRole("dialog", { name: `Invite friends to ${TRUST_POT}` })
  const link = (await share.locator("[data-invite-link]").textContent())!
  await share.getByRole("button", { name: "Close" }).click()
  const u = new URL(link)
  await B.goto(`${u.pathname}${u.search}${u.hash}`)
  await walletSignIn(B)
  const youreIn = B.getByRole("dialog", { name: "You're in!" })
  await expect(youreIn).toBeVisible({ timeout: 60_000 })
  accB = await accountOf(B.request)
  await youreIn.getByRole("button", { name: "Add my $150 share" }).click()
  const add = B.getByRole("dialog", { name: `Add money to ${TRUST_POT}` })
  await add.getByRole("button", { name: "Add $150", exact: true }).click()
  await expect(hero(B)).toHaveText("$150.00", { timeout: 60_000 })
  await A.goto(`/p/${slug}?sheet=add&amount=150`)
  await A.getByRole("dialog").getByRole("button", { name: "Add $150", exact: true }).click()
  await expect(hero(A)).toHaveText("$300.00", { timeout: 60_000 })

  // Ben: $180 → the hub's tier is one_ok; the Spend sheet says so
  const prev = await chain.hub.previewSpend(dao(slug), accB as never, usd(180), accB as never, usd(300))
  expect(prev.value).toMatchObject({ path: "vote", tier: "one_ok", effectiveCap: usd(100), trustLevel: 0, oneOkCap: usd(300) })
  await B.goto(`/p/${slug}`)
  await spend(B, TRUST_POT, "180", /A place to stay|Stay/, "Ask for one OK", "One OK from anyone else in the group and it's paid.")
  const req = await eventually(
    () => chain.hub.getRequests(dao(slug), 0, 50).then((r) => r.value.find((x) => x.requester === accB && x.path === "vote")),
    (r) => !!r && r.proposalId !== null,
    60_000,
  )
  expect(req!.tier).toBe("one_ok")

  // Ana gives the OK (ok_request through the relayer, R13): the hub approves it as the rules → paid
  await A.goto(`/p/${slug}?r=${req!.id}`)
  const sheet = A.getByRole("dialog", { name: /asks for \$180/ })
  await expect(sheet.getByText("One OK needed")).toBeVisible({ timeout: 30_000 })
  await A.locator("[data-ok-cta]").click()
  await expect(sheet.locator("[data-approve-status]")).toContainText("Your OK sent $180", { timeout: 90_000 })
  const paid = await eventually(
    () => chain.hub.getRequests(dao(slug), req!.id, 1).then((r) => r.value[0]),
    (r) => r?.hubStatus === "approved",
    90_000,
  )
  expect(paid!.okBy).toBe(accA)

  // the public record (signed out works too): "One OK by Ana"
  const record = await eventually(() => chain.hub.getRecord!(dao(slug), 0, 50), (r) => r.value.some((e) => e.approvedBy === "one_ok"))
  expect(record.value.find((e) => e.requestId === req!.id)).toMatchObject({ approvedBy: "one_ok", okBy: accA, money: "paid" })
  await A.goto(`/p/${slug}/record`)
  await expect(A.getByText("One OK by Ana").first()).toBeVisible({ timeout: 30_000 })

  // Ben: 3 instant $20 spends (≥ a tenth of $100 each) → level 1, $200 at a time. The paid $180 one-OK spend counted
  // too (D4-2: every request that reaches `approved` with amount × 10 ≥ the base cap): $180, $20, $20 → level 1 (streak
  // back to 0), the third $20 → streak 1, so 2 more to level 2 ($300)
  await B.goto(`/p/${slug}`)
  for (let i = 0; i < 3; i++) await spend(B, TRUST_POT, "20", /Food/, "Get $20 back", "$20 sent to you")
  const t = await eventually(() => chain.hub.getTrust!(dao(slug), accB as never), (v) => v.value?.level === 1 && v.value.streak === 1, 60_000)
  // the per-person budget still bounds it (notes/contracts-wave4.md §1): $200 − $60 of instant spends = $140
  expect(t.value).toMatchObject({ level: 1, effectiveCap: usd(200), nextLevelIn: 2, budgetLeft: usd(140), instantUpTo: usd(140) })
  await B.goto(`/p/${slug}?tab=rules`)
  await expect(B.locator("[data-my-trust] [data-trust-level='1']")).toHaveText("Trusted", { timeout: 30_000 })
  await expect(B.locator("[data-trust-next]")).toHaveText("2 more paid spends to $300")
  // and $120 (over the base $100) is instant for Ben now. The 5th argument is the Pot's balance (only $60 is left after
  // $180 + 3 × $20), so ask as if it held $300; $150 would be over his budget left ($140) → one OK
  const p120 = await chain.hub.previewSpend(dao(slug), accB as never, usd(120), accB as never, usd(300))
  expect(p120.value).toMatchObject({ path: "instant", tier: "instant", trustLevel: 1 })
  const p150 = await chain.hub.previewSpend(dao(slug), accB as never, usd(150), accB as never, usd(300))
  expect(p150.value).toMatchObject({ path: "vote", hubReason: "over_budget", tier: "one_ok" })
})

test("goal: an all-or-nothing $1,000 goal by tomorrow → policy v2, collecting, Spend waits", async () => {
  test.skip(!hub11, "needs hub 1.1.0 on the preview deploy")
  test.setTimeout(300_000)
  const goalSlug = await createPot(A, GOAL_POT, async (s) => {
    await s.getByRole("switch", { name: "Set a goal (optional)" }).click()
    await s.getByRole("textbox", { name: "Goal amount" }).fill("1000")
    const tomorrow = new Date(Date.now() + 86_400_000)
    const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`
    await s.getByLabel("Goal date").fill(day)
    await expect(s.getByRole("switch", { name: "All or nothing" })).toHaveAttribute("aria-checked", "true")
  })
  console.log(`[wave4] goal Pot ${dao(goalSlug)}`)
  const pv = await eventually(() => chain.hub.getPot(dao(goalSlug)), (v) => !!v.value)
  expect(pv.value!.policyVersion).toBe(2)
  expect(pv.value!.extras?.goal).toMatchObject({ amount: usd(1000), allOrNothing: true })
  const g = await chain.hub.getGoal!(dao(goalSlug))
  expect(g.value).toMatchObject({ state: "collecting", spendsBlocked: true, canRefund: false })
  await A.getByRole("dialog").getByRole("button", { name: "Close" }).click()
  await expect(A.locator("[data-goal-banner='collecting'] [data-goal-text]")).toHaveText(/^\$0 of \$1,000 · /, { timeout: 30_000 })
  await expect(A.getByRole("button", { name: "Spend", exact: true })).toHaveAttribute("aria-disabled", "true")
})
