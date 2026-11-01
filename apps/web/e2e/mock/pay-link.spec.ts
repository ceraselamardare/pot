// Pay anyone by link (hub 1.1.0) on the mock data source, in the "Surf Camp" showcase Pot (Maya + Sam, links on; the
// spec opts in with localStorage['pot.mock.seed'] = 'showcase'):
//  1. Maya pays "Someone else" $50 by link → approved by the rules → the Share card (Share / Copy / QR replaces the
//     card) → a guest (Alex) opens /c/surf-camp/<id>#<secret> → [Get $50] → "$50 is yours" with their Pot dollars and a
//     receipt; the fragment is gone; Maya's feed says "Claimed by Alex".
//  2. Signed out on a seeded link: [Get $30] → sign in (the mock signs the guest in as Alex) → claimed.
//  3. The group's path: $350 → "Waiting for the group's OK" on the claim page (it updates by itself) → Sam approves →
//     ready; then Maya cancels → the money is back and the claim page says the payment was cancelled.
//  4. Every other state: expired (sent back by the daily job), already claimed, a missing or wrong #secret, unknown.
//  5. 320 px: the Spend sheet's link option and the claim page reflow without a sideways scroll.
// Day, Night and desktop; axe 0 serious and the brand checks on every screen. The mobile projects save
// notes/screens/paylink-*.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, spendFlow } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const SURF = {
  open: { id: 113, secret: "BRgrPlFkd4qdsMPW6fwPIjVIW26BlKe6zeDzBhksP1I" },
  claimed: { id: 111, secret: "BRIfLDlGU2BteoeUoa67yNXi7_wJFiMwPUpXZHF-i5g" },
  returned: { id: 112, secret: "BRYnOElaa3yNnq_A0eLzBBUmN0hZanuMna6_0OHyAxQ" },
}
const LINK_RE = /\/c\/surf-camp\/(\d+)#([A-Za-z0-9_-]{43})$/

test.use({ reducedMotion: "reduce" })

/** The showcase seed (Surf Camp and friends) for a fresh world; the classic suites keep the two-Pot seed. */
async function showcase(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.seed")) localStorage.setItem("pot.mock.seed", "showcase")
  })
}

const shot = (info: { project: { name: string } }, name: string) =>
  info.project.name === "desktop" ? null : `${SCREENS}paylink-${name}-${info.project.name === "mobile-night" ? "night" : "day"}.png`

async function openSpend(page: Page) {
  await page.goto("/p/surf-camp")
  await expect(page.getByRole("heading", { level: 1, name: "Surf Camp" })).toBeVisible()
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  return openedSheet(page, "Spend from Surf Camp")
}


test("Maya pays someone else $50 by link; a guest claims it; the feed says who", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await spendFlow(page, { amount: "50", reason: "Stay", payee: "Someone else" })
  await expect(sheet.getByRole("radio", { name: "Someone else" })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByText("You'll get a link to send them.", { exact: false })).toBeVisible()
  await sheet.getByRole("textbox", { name: "Who's it for? (optional)" }).fill("Casa Lisboa host")
  await expect(sheet.locator("[data-rule-preview='instant']")).toBeVisible()
  const cta = sheet.getByRole("button", { name: "Send $50 by link" })
  await expect(cta).toBeEnabled()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  const s1 = shot(info, "spend")
  if (s1) {
    await sheet.locator("[data-paylink-fields]").scrollIntoViewIfNeeded()
    await page.screenshot({ path: s1 })
  }
  await cta.click()

  // approved by the rules → the link holds the money → the Share card
  const ready = sheet.locator("[data-paylink-ready]")
  await expect(ready).toBeVisible({ timeout: 10_000 })
  await expect(ready.getByText("Your payment link is ready")).toBeFocused()
  await expect(ready).toContainText("Send it to Casa Lisboa host. Whoever opens it gets $50.")
  await expect(ready).toContainText("Anyone who has this link can take the money")
  await expect(ready).toContainText("saved only on this device")
  const url = (await ready.locator("[data-paylink-url]").getAttribute("data-paylink-url"))!
  expect(url).toMatch(LINK_RE)
  await expect(sheet.getByRole("button", { name: "Share payment link" })).toBeVisible()
  await brandChecks(page, { marigold: "one" }) // Share is the one marigold; Done is quiet
  await axe(page)
  const s2 = shot(info, "share")
  if (s2) await page.screenshot({ path: s2 })
  // the QR replaces the card (dark on a white plate in Night too)
  await sheet.getByRole("button", { name: "Show QR code" }).click()
  await expect(sheet.locator("[data-qr-view]")).toBeVisible()
  await expect(sheet.getByRole("img", { name: "QR code for the $50 payment link" })).toBeVisible()
  await axe(page)
  await sheet.getByRole("button", { name: "Hide QR code" }).click()
  await expect(sheet.locator("[data-paylink-url]")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  // the feed: a link waiting to be claimed (money out of the Pot)
  const row = page.locator("[data-feed] li", { hasText: "Maya sent Casa Lisboa host a $50 payment link" }).first()
  await expect(row).toContainText("Link sent · waiting to be claimed")
  await expect(row.locator("[data-status='link-ready']")).toHaveText("Waiting to be claimed")
  await expect(page.locator("[data-balance-hero], main").first()).toContainText("$460")

  // a guest opens it (the same browser stands in for their phone)
  await becomePerson(page, "alex")
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ""))
  await expect(page.getByRole("heading", { level: 1, name: "Maya sent you $50 from Surf Camp" })).toBeVisible()
  await expect(page.getByText("For a place to stay")).toBeVisible()
  const get = page.getByRole("button", { name: "Get $50" })
  await expect(get).toBeVisible()
  await expect(page.getByText("Getting it as Alex")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  const s3 = shot(info, "claim")
  if (s3) await page.screenshot({ path: s3, fullPage: true })
  await get.click()
  const done = page.locator("[data-claim-state='success']")
  await expect(done).toBeVisible({ timeout: 10_000 })
  await expect(done.getByRole("heading", { name: "$50 is yours" })).toBeFocused()
  await expect(done).toContainText("It's in your Pot dollars.")
  await expect(done.locator("[data-claim-balance]")).toHaveText("$110.00") // $60 from the seeded link + $50
  await expect(done.getByRole("link", { name: /^Receipt for Got \$50 from Surf Camp/ })).toBeVisible()
  await expect(page.locator("[data-live-region]")).toContainText("$50 is yours")
  expect(page.url()).not.toContain("#") // the secret left the address bar
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  const s4 = shot(info, "claimed")
  if (s4) await page.screenshot({ path: s4, fullPage: true })
  // a reload (no fragment any more) still says it's theirs
  await page.reload()
  await expect(page.locator("[data-claim-state='success']")).toBeVisible()

  // Maya's feed: claimed by Alex
  await becomePerson(page, "maya")
  await page.goto("/p/surf-camp")
  const claimed = page.locator("[data-feed] li", { hasText: "Maya sent Casa Lisboa host a $50 payment link" }).first()
  await expect(claimed).toContainText("Claimed by Alex")
  await expect(claimed.locator("[data-status='link-claimed']")).toHaveText("Claimed")
  // the request sheet tells the same story; no share or cancel any more
  await claimed.getByRole("button").first().click()
  const req = await openedSheet(page, /Maya asked for \$50/)
  await expect(req.locator("[data-link-panel='claimed']")).toContainText("Claimed by Alex")
  await expect(req.getByRole("button", { name: "Cancel and return the money" })).toHaveCount(0)
  await axe(page)
  await brandChecks(page, { marigold: "at-most-one" })
  const s5 = shot(info, "feed")
  if (s5) await page.screenshot({ path: s5 })
})

test("signed out: Get → sign in → claimed (a seeded link)", async ({ page }) => {
  await showcase(page)
  await page.goto(`/c/surf-camp/${SURF.open.id}#${SURF.open.secret}`)
  await expect(page.getByRole("heading", { level: 1, name: "Maya sent you $30 from Surf Camp" })).toBeVisible()
  await page.getByRole("button", { name: "Get $30" }).click()
  const signin = page.locator("[data-claim-state='signin']")
  await expect(signin.getByRole("heading", { name: "Sign in to get your $30" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await signin.getByRole("button", { name: "Continue with Google" }).click()
  await expect(page.locator("[data-claim-state='success']").getByRole("heading", { name: "$30 is yours" })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator("[data-claim-balance]")).toHaveText("$90.00")
})

test("the group's path: waiting for the OK (updates by itself) → approved → claimable; Maya cancels → back in the Pot", async ({ page, context }) => {
  await showcase(page)
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await spendFlow(page, { amount: "350", reason: "Tickets", payee: "Someone else" })
  await expect(sheet.locator("[data-rule-preview='vote']")).toBeVisible()
  await sheet.getByRole("button", { name: "Ask the group" }).click()
  await expect(sheet.locator("[data-spend-result='vote']")).toContainText("Once it's approved, you'll get the link to send.")
  await sheet.getByRole("button", { name: "Done" }).click()
  // the secret is on Maya's device only; the claim link is built from it
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pot.paylinks.v1") ?? "{}") as Record<string, { secret: string }>)
  const [key, { secret }] = Object.entries(stored).find(([k]) => k.startsWith("surf-camp:"))!
  const id = Number(key.split(":")[1])
  const row = page.locator("[data-feed] li", { hasText: "Maya wants to pay $350 by link" }).first()
  await expect(row).toContainText("Waiting for the group's OK")

  // the claim page while the group decides
  const guest = await context.newPage()
  await guest.goto(`/c/surf-camp/${id}#${secret}`)
  await expect(guest.locator("[data-claim-state='waiting']")).toContainText("Waiting for the group's OK")
  await expect(guest.getByRole("button", { name: "Get $350" })).toHaveCount(0)
  await axe(guest)

  // Sam approves (the group of two needs both)
  await becomePerson(page, "sam")
  await page.goto(`/p/surf-camp?r=${id}`)
  const approve = await openedSheet(page, /Maya asks for \$350/)
  await expect(approve.locator("[data-link-panel='waiting']")).toBeVisible()
  await approve.getByRole("button", { name: "Approve $350" }).click()
  await expect(approve.locator("[data-link-panel='ready']")).toBeVisible({ timeout: 10_000 })

  // the claim page noticed by itself
  await expect(guest.getByRole("button", { name: "Get $350" })).toBeVisible({ timeout: 10_000 })

  // Maya shares it again from the request, then cancels it: the money goes back
  await becomePerson(page, "maya")
  await page.goto(`/p/surf-camp?r=${id}`)
  const mine = await openedSheet(page, /Maya asked for \$350/)
  await expect(mine.getByRole("button", { name: "See payment link" })).toBeVisible()
  await mine.getByRole("button", { name: "See payment link" }).click()
  const share = await openedSheet(page, "Payment link · $350")
  await expect(share.locator("[data-paylink-url]")).toHaveAttribute("data-paylink-url", new RegExp(`/c/surf-camp/${id}#${secret}$`))
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await share.getByRole("button", { name: "Cancel and return the money" }).click()
  await expect(share.locator("[data-cancel-confirm]")).toContainText("The $350 goes back to Surf Camp")
  await share.getByRole("button", { name: "Yes, cancel it" }).click()
  await expect(page.getByText("Link cancelled. $350 is back in Surf Camp.").first()).toBeVisible()
  await expect(page.getByRole("dialog")).toBeHidden()
  const back = page.locator("[data-feed] li", { hasText: "payment link" }).filter({ hasText: "$350" }).first()
  await expect(back).toContainText("Returned to the Pot")
  // the secret is forgotten on Maya's device
  expect(await page.evaluate((k) => !!JSON.parse(localStorage.getItem("pot.paylinks.v1") ?? "{}")[k], key)).toBe(false)

  await guest.reload()
  await expect(guest.locator("[data-claim-state='returned']")).toContainText("This payment was cancelled")
  await axe(guest)
})

test("every other state: expired, already claimed, missing or wrong secret, unknown", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "leo")
  await page.goto(`/c/surf-camp/${SURF.returned.id}#${SURF.returned.secret}`)
  await expect(page.locator("[data-claim-state='expired']")).toContainText("This link has expired")
  await expect(page.locator("[data-claim-state='expired']")).toContainText("the money went back to Surf Camp")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  const s = shot(info, "expired")
  if (s) await page.screenshot({ path: s })

  await page.goto(`/c/surf-camp/${SURF.claimed.id}#${SURF.claimed.secret}`)
  await expect(page.locator("[data-claim-state='claimed']")).toContainText("This money was already taken")
  await axe(page)

  await page.goto(`/c/surf-camp/${SURF.open.id}`)
  await expect(page.locator("[data-claim-state='incomplete']")).toContainText("This link isn't complete")
  await page.goto(`/c/surf-camp/${SURF.open.id}#${SURF.open.secret.slice(0, 20)}`)
  await expect(page.locator("[data-claim-state='incomplete']")).toBeVisible()
  await page.goto(`/c/surf-camp/${SURF.open.id}#${SURF.claimed.secret}`)
  await expect(page.locator("[data-claim-state='wrong']")).toContainText("This link doesn't match")
  await axe(page)

  await page.goto("/c/surf-camp/9999#" + SURF.open.secret)
  await expect(page.getByRole("heading", { level: 1, name: "We can't find this payment" })).toBeVisible()
  await page.goto("/c/NOPE/abc")
  await expect(page.getByRole("heading", { level: 1, name: "We can't find this payment" })).toBeVisible()

  // the Pot's feed tells the same stories (Maya's view)
  await becomePerson(page, "maya")
  await page.goto("/p/surf-camp")
  await expect(page.locator("[data-feed] li", { hasText: "Taxi driver" }).first()).toContainText("Nobody took it in time")
  await expect(page.locator("[data-feed] li", { hasText: "Beach bar" }).first()).toContainText("Claimed by Alex")
  await brandChecks(page, { marigold: "at-most-one" })
  await axe(page)
})

test("320 px: the link option and the claim page reflow", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one width check is enough")
  await page.setViewportSize({ width: 320, height: 640 })
  await showcase(page)
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await spendFlow(page, { amount: "50", payee: "Someone else" })
  await expect(sheet.getByRole("textbox", { name: "Who's it for? (optional)" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await axe(page)
  await page.goto(`/c/surf-camp/${SURF.open.id}#${SURF.open.secret}`)
  await expect(page.getByRole("button", { name: "Get $30" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await axe(page)
})
