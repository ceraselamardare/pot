// "Pay in" (notes/frontend.md 2026-11-03) on the mock data source, in every project (mobile Day, mobile Night, desktop):
//  1. Maya: the row's [Ask] → the chooser (Ask the group · Ask anyone by link) → Ask anyone: "A payment" by default,
//     Fixed $25 → [Make pay-in link] → "Your pay-in link is ready" (QR first, [Share link] the one marigold).
//  2. Alex (outside the Pot) opens it: "Pay Lisbon Trip", "This link is for $25.", [Pay $25] → "Thank you! $25 is on its
//     way to Lisbon Trip." → Maya's feed: "Alex · Paid in · by link" with a "From outside" chip; its details.
//  3. The gift tone: "A gift ☕" → the page says "Send Lisbon Trip a gift" with ☕ presets and [Send $10 ☕].
//  4. Settings (the tab that was Rules): sections that say who decides → "Taking money from outside" off (one
//     member, at once) → the outsider sees "Lisbon Trip isn't taking payments right now".
//  5. Add money step 1: "Someone else paying? Send them a link" → Ask anyone (swapped in: ✕ leaves both).
//  6. The Share sheet is invites only (no gift tab); More has Settings, not Gifts.
// axe 0 serious + the brand checks on every screen; the mobile projects save notes/screens/payin-*-{day,night}.png and
// settings-{day,night}.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, potAsk, potMore, settingsTab } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const LINK_RE = /\/g\/lisbon-trip\/[A-Za-z0-9_-]{22}$/

test.use({ reducedMotion: "reduce" })

async function shot(page: Page, name: string, project: string, fullPage = false) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}${name}-${project === "mobile-night" ? "night" : "day"}.png`, fullPage })
}

const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "")

/** In the open Ask anyone sheet: pick the tone and amount, make the link, return its address. */
async function makeLink(page: Page, o: { tone?: "A payment" | "A gift ☕"; fixed?: string } = {}) {
  const sheet = page.getByRole("dialog", { name: "Ask anyone to pay in" })
  if (o.tone) await sheet.getByRole("radio", { name: o.tone }).click()
  if (o.fixed) {
    await sheet.getByRole("radio", { name: "Fixed" }).click()
    await sheet.getByRole("textbox", { name: "Amount in dollars" }).fill(o.fixed)
  }
  await sheet.getByRole("button", { name: "Make pay-in link" }).click()
  await expect(sheet.locator("[data-payin='ready']")).toBeVisible()
  const url = (await sheet.locator("[data-payin-url]").getAttribute("data-payin-url"))!
  expect(url).toMatch(LINK_RE)
  return url
}

test("Ask → Ask anyone → a $25 payment link → paid from outside → the feed says 'paid in · by link'", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()

  // 1. the chooser: two rows named by who pays; a menu, so no marigold
  const chooser = await potAsk(page)
  await expect(chooser.getByRole("button", { name: /^Ask the group/ })).toContainText("Everyone adds a little more")
  await expect(chooser.getByRole("button", { name: /^Ask anyone by link/ })).toContainText("Anyone can pay into Lisbon Trip. They don't join.")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "payin-ask", p)
  await chooser.getByRole("button", { name: /^Ask anyone by link/ }).click()
  const sheet = await openedSheet(page, "Ask anyone to pay in")
  await expect(page).toHaveURL(/\?sheet=payin$/)
  await expect(sheet.getByRole("radio", { name: "A payment" })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByRole("radio", { name: "They choose" })).toHaveAttribute("aria-checked", "true")
  await sheet.getByRole("radio", { name: "Fixed" }).click()
  await expect(sheet.getByRole("textbox", { name: "Amount in dollars" })).toHaveValue("25")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "payin-form", p)
  const url = await makeLink(page)
  await expect(sheet.getByText("Your pay-in link is ready")).toBeVisible()
  await expect(sheet.getByRole("img", { name: "QR code for Lisbon Trip's pay-in link" })).toBeVisible()
  await expect(sheet.getByText(/Payment · \$25 · Until/)).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Share link" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Copy link" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "payin-ready", p)
  await sheet.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=/)

  // 2. someone outside the Pot pays it
  await becomePerson(page, "alex")
  await page.goto(path(url))
  await expect(page.getByRole("heading", { level: 1, name: "Pay Lisbon Trip" })).toBeVisible()
  await expect(page.getByText("3 people are in this Pot")).toBeVisible()
  await expect(page.getByText("This link is for $25.")).toBeVisible()
  await expect(page.getByText("Goes to the whole group. Can't be taken back.")).toBeVisible()
  await expect(page.locator("main")).not.toContainText("☕")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "payin-page", p, true)
  await page.getByRole("button", { name: "Pay $25" }).click()
  const thanks = page.getByRole("heading", { name: "Thank you!" })
  await expect(thanks).toBeVisible()
  await expect(thanks).toBeFocused()
  await expect(page.getByText("$25 is on its way to Lisbon Trip.", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Start your own Pot" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "payin-thanks", p, true)

  // the members' feed: "Alex · Paid in · by link" with a From outside chip; the details
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const row = page.getByRole("button", { name: /^Alex paid in \$25 · by link\./ })
  await expect(row).toBeVisible()
  await expect(row.locator("[data-row-title]")).toHaveText("Alex · Paid in · by link")
  await expect(row.locator("[data-status='outside']")).toHaveText("From outside")
  await expect(page.locator("main").first()).toContainText("$475.00") // $450 + $25
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await row.scrollIntoViewIfNeeded()
  await shot(page, "payin-feed", p)
  await row.click()
  const details = await openedSheet(page, "Alex paid in $25")
  await expect(details.locator("[data-deposit-source='payin']")).toContainText("Paid in from outside")
  await expect(details.locator("[data-deposit-source='payin']")).toContainText("pay-in link")
  await expect(details).toContainText("Money from outside belongs to the whole group.")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
})

test("the gift tone: ☕ presets and 'Send Lisbon Trip a gift'", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await potAsk(page, "anyone")
  const url = await makeLink(page, { tone: "A gift ☕" })
  await expect(page.getByRole("dialog").getByText(/Gift ☕ · They choose · Until/)).toBeVisible()
  await page.keyboard.press("Escape")
  await becomePerson(page, "alex")
  await page.goto(path(url))
  await expect(page.getByRole("heading", { level: 1, name: "Send Lisbon Trip a gift" })).toBeVisible()
  await expect(page.getByRole("radio", { name: "$10, 2 coffees" })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("button", { name: "Send $10 ☕" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "payin-gift-page", info.project.name, true)
})

test("Settings: who decides each thing; Money from outside off → the outsider is told calmly", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await potAsk(page, "anyone")
  const url = await makeLink(page)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  const settings = await settingsTab(page)
  await expect(page).toHaveURL(/tab=settings/)
  await expect(settings.locator("[data-settings-section] > h2")).toHaveText([
    "Rules · the group decides",
    "Money from outside · anyone, right away",
    "Paying people outside · the group decides",
    "People",
    "Record",
    "Close Pot · the group decides",
  ])
  await expect(settings.getByRole("button", { name: "Public page: Off" })).toBeVisible()
  await expect(settings.getByRole("button", { name: "Pay-in links: 1 active" })).toBeVisible()
  await expect(settings.getByRole("button", { name: /^Send by link: (On|Off)$/ })).toBeVisible()
  await expect(settings.getByText("Anyone in the Pot can turn this off at once.")).toBeVisible()
  await brandChecks(page, { marigold: "one" }) // the hero's Add money
  await axe(page)
  if (p !== "desktop") {
    await settings.scrollIntoViewIfNeeded()
    await shot(page, "settings", p, true)
  }

  // Send by link opens the rules sheet with that switch in view
  await settings.getByRole("button", { name: /^Send by link/ }).click()
  const rules = await openedSheet(page, /change a rule|Change rules/)
  await expect(page).toHaveURL(/[?&]sheet=rules&rule=links/)
  await expect(rules.getByRole("switch", { name: "Send by link" })).toBeInViewport()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  // one member turns money from outside off, at once
  const on = settings.getByRole("switch", { name: "Taking money from outside" })
  await expect(on).toHaveAttribute("aria-checked", "true")
  await on.click()
  await expect(on).toHaveAttribute("aria-checked", "false")
  await expect(settings.getByRole("button", { name: "Make a pay-in link" })).toHaveCount(0)
  await axe(page)

  await becomePerson(page, "alex")
  await page.goto(path(url))
  await expect(page.getByRole("heading", { name: "Lisbon Trip isn't taking payments right now" })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Pay/ })).toHaveCount(0)
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "payin-off", p)
})

test("Add money's 'Someone else paying?' leads to Ask anyone; Share is invites only; More has Settings", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Add money", exact: true }).click()
  const add = await openedSheet(page, "Add money to Lisbon Trip")
  const cross = add.getByRole("button", { name: "Someone else paying? Send them a link" })
  await expect(cross).toBeVisible()
  await brandChecks(page, { marigold: "at-most-one" }) // [Next] waits for an amount; the line is quiet, never marigold
  await axe(page)
  await shot(page, "payin-add", info.project.name)
  await cross.click()
  const sheet = await openedSheet(page, "Ask anyone to pay in")
  await expect(page).toHaveURL(/\?sheet=payin$/)
  await sheet.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=/)

  // More: Invite friends, Settings, Pot record, Who can see what, Close Pot (no Gifts)
  const more = await potMore(page, "Lisbon Trip")
  await expect(more.locator("[data-more]")).toHaveCount(5)
  await expect(more.getByRole("button", { name: /^Gifts/ })).toHaveCount(0)
  await more.getByRole("button", { name: /^Invite friends/ }).click()
  const share = await openedSheet(page, "Invite friends to Lisbon Trip")
  await expect(share.getByRole("tab")).toHaveCount(0)
  await expect(share).not.toContainText(/gift|pay-in/i)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  // More → Settings lands on the tab
  await potMore(page, "Lisbon Trip", /^Settings/)
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).toHaveURL(/\?tab=settings$/)
  await expect(page.locator("[data-settings]").locator("visible=true")).toBeVisible()
})
