// Gifts (hub 1.2.0; notes/gifts-plan.md) on the mock data source, in every project (mobile Day, mobile Night, desktop):
//  1. A member makes gift links from the share sheet's "Gift link" tab: the default (giver chooses, reusable, 14 days)
//     in one tap, QR first + Share + Copy; then a fixed $25 one-time link with a note; both listed.
//  2. A guest (Alex) opens the open link: presets ☕ $5 / $10 / $20, a note → [Send $10 ☕] → "Thank you!" with
//     [Start your own Pot]; then the $25 link has one button; the one-time link is used after that.
//  3. The members' feed row "Alex · Sent a gift ☕" (Gift chip, note mark, + $10.00) opens the details with the note;
//     the hero's money went up; "push" is server-side (server/features/gifts onGiftReceived, unit-tested).
//  4. The public page is off by default (/give says so) → a member turns it on in ••• → Gifts with a line → a giver
//     who chose "show my name and note" is listed, one who didn't isn't; a signed-out visitor sees the same.
//  5. Turning a link off: the giver sees "This gift link was turned off".
//  6. Gifts off (••• → Gifts): the giver sees "isn't taking gifts right now".
//  7. The giver's own gifts in You → Your activity; a signed-out giver signs in inline (the mock signs in as Alex).
//  8. 320 px: the giver's page and the Gift link tab reflow without a sideways scroll.
//  9. Pay with "Pot dollars" (a signed-in giver with a balance; picked by default when it covers the gift).
// 10. The record: members see every gift's name and note, visitors only opted-in givers; the CSV lists the gifts.
// axe 0 serious + the brand checks on every screen; the mobile projects save notes/screens/gifts-*-{day,night}.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const LINK_RE = /\/g\/lisbon-trip\/[A-Za-z0-9_-]{22}$/

test.use({ reducedMotion: "reduce" })

async function shot(page: Page, name: string, project: string, fullPage = false) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}gifts-${name}-${project === "mobile-night" ? "night" : "day"}.png`, fullPage })
}

const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "")

async function openMenu(page: Page, potName = "Lisbon Trip") {
  await page.getByRole("button", { name: `More options for ${potName}` }).click()
  await page.waitForTimeout(300) // the menu's fade
}

/** Pot ••• → Share invite → the "Gift link" tab. */
async function giftTab(page: Page) {
  await openMenu(page)
  await page.getByRole("menuitem", { name: "Share invite" }).click()
  const sheet = await openedSheet(page, /Invite friends to Lisbon Trip/)
  await sheet.getByRole("tab", { name: "Gift link" }).click()
  return openedSheet(page, "Gift link for Lisbon Trip")
}

/** Make a gift link in the open tab; returns its address. */
async function makeLink(page: Page, opts: { fixed?: string; note?: string; once?: boolean } = {}) {
  const sheet = page.getByRole("dialog", { name: "Gift link for Lisbon Trip" })
  if (opts.fixed) {
    await sheet.getByRole("radio", { name: "Fixed amount" }).click()
    const input = sheet.getByRole("textbox", { name: "Gift amount in dollars" })
    await input.fill(opts.fixed)
  }
  if (opts.note || opts.once) {
    await sheet.getByRole("button", { name: "More options" }).click()
    if (opts.note) await sheet.getByRole("textbox", { name: "Note for givers (optional)" }).fill(opts.note)
    if (opts.once) await sheet.getByRole("switch", { name: "One gift only" }).click()
  }
  await sheet.getByRole("button", { name: "Make gift link" }).click()
  await expect(sheet.locator("[data-gift-tab='ready']")).toBeVisible()
  const url = (await sheet.locator("[data-gift-url]").getAttribute("data-gift-url"))!
  expect(url).toMatch(LINK_RE)
  return url
}

test("members make gift links; a guest gives through them; the feed shows the gift and its note", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()

  // 1. the default link in one tap: QR first, Share (the one marigold), Copy
  const sheet = await giftTab(page)
  await expect(sheet.getByRole("tab", { name: "Gift link" })).toHaveAttribute("aria-selected", "true")
  await expect(sheet.getByRole("radio", { name: "Giver chooses" })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByText(/Works for 14 days, until/)).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "link-form", p)
  const open = await makeLink(page)
  await expect(sheet.getByRole("img", { name: "QR code for Lisbon Trip's gift link" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Share gift link" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Copy link" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "link-ready", p)

  // a fixed $25 one-time link with a note
  await sheet.getByRole("button", { name: "Make another link" }).click()
  const fixed = await makeLink(page, { fixed: "25", note: "For Leo's surprise dinner", once: true })
  const list = sheet.locator("[data-gift-links]")
  await expect(list.locator("[data-gift-link-row]")).toHaveCount(2)
  await expect(list).toContainText("$25 gift")
  await expect(list).toContainText("One gift")
  await expect(list).toContainText("Giver chooses")
  await axe(page)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  // 2. a guest opens the open link (the same browser stands in for their phone)
  await becomePerson(page, "alex")
  await page.goto(path(open))
  await expect(page.getByRole("heading", { level: 1, name: "Send Lisbon Trip a gift" })).toBeVisible()
  await expect(page.getByText("3 people are in this Pot")).toBeVisible()
  await expect(page.getByRole("radio", { name: "$5, 1 coffee" })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("radio", { name: "$10, 2 coffees" }).click()
  await expect(page.getByRole("textbox", { name: "Your name (optional)" })).toHaveValue("Alex")
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Have a great trip! ☕")
  await expect(page.getByText("Giving as Alex")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "landing", p, true)
  await page.getByRole("button", { name: "Send $10 ☕" }).click()
  const thanks = page.getByRole("heading", { name: "Thank you!" })
  await expect(thanks).toBeVisible()
  await expect(thanks).toBeFocused()
  await expect(page.getByText("$10 is on its way to Lisbon Trip.", { exact: true })).toBeVisible()
  await expect(page.getByText("They'll see your note.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Start your own Pot" })).toHaveAttribute("href", "/")
  await expect(page.locator("[data-live-region]")).toContainText("Thank you!")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "thanks", p, true)

  // the fixed-amount link: one button; then it's used (one gift only)
  await page.goto(path(fixed))
  await expect(page.getByText("This link is for a $25 gift.")).toBeVisible()
  await expect(page.getByText("For Leo's surprise dinner")).toBeVisible()
  await expect(page.getByRole("radio", { name: /coffee/ })).toHaveCount(0)
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await page.getByRole("button", { name: "Send $25 ☕" }).click()
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: "This gift link was already used" })).toBeVisible()
  await brandChecks(page, { marigold: "none" })
  await axe(page)

  // 7. the giver's own gifts (You → Your activity)
  await page.goto("/you")
  await expect(page.locator("[data-activity='gift']")).toHaveCount(2)
  await expect(page.getByRole("group", { name: /^You sent Lisbon Trip a gift of \$25/ })).toBeVisible()
  await expect(page.getByRole("group", { name: /^You sent Lisbon Trip a gift of \$10/ })).toBeVisible()

  // 3. the members' feed: the row, then its details with the note
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const row = page.getByRole("button", { name: /^Alex sent a gift of \$10\. Has a note/ })
  await expect(row).toBeVisible()
  await expect(row.locator("[data-row-title]")).toHaveText("Alex · Sent a gift ☕")
  await expect(row.locator("[data-status='gift']")).toHaveText("Gift")
  await expect(page.locator("main").first()).toContainText("$485.00") // $450 + $10 + $25
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "feed", p)
  await row.click()
  const details = await openedSheet(page, "Alex sent a gift")
  await expect(details.locator("[data-gift-note]")).toContainText("Have a great trip! ☕")
  await expect(details).toContainText("A gift link")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "details", p)
})

test("the public gift page: off by default → a member turns it on → visitors see only givers who chose to be shown", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "alex")
  await page.goto("/give/lisbon-trip")
  await expect(page.getByRole("heading", { name: "This gift page isn't open" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Send/ })).toHaveCount(0)
  await axe(page)

  // a member turns it on, with a line
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await openMenu(page)
  await page.getByRole("menuitem", { name: /Gifts/ }).click()
  await expect(page).toHaveURL(/\/p\/lisbon-trip\?sheet=gifts$/)
  const sheet = await openedSheet(page, "Gifts")
  await expect(sheet.getByText("No gifts yet. Share a gift link to get the first one.")).toBeVisible()
  await expect(sheet.getByRole("switch", { name: "Taking gifts" })).toHaveAttribute("aria-checked", "true")
  const pageSwitch = sheet.getByRole("switch", { name: "Public gift page" })
  await expect(pageSwitch).toHaveAttribute("aria-checked", "false")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await pageSwitch.click()
  await expect(pageSwitch).toHaveAttribute("aria-checked", "true")
  await sheet.getByRole("textbox", { name: "A line for the page (optional)" }).fill("Help us get to Lisbon ☕")
  await sheet.getByRole("button", { name: "Save line" }).click()
  await expect(sheet.getByRole("button", { name: "Line saved" })).toBeVisible()
  await expect(sheet.getByRole("img", { name: "QR code for Lisbon Trip's gift page" })).toBeVisible()
  await expect(sheet.locator("[data-gift-page-url]")).toHaveAttribute("data-gift-page-url", /\/give\/lisbon-trip$/)
  await expect(sheet.getByRole("button", { name: "Share gift page" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "sheet", p)

  // a giver who chooses to be shown, then one who doesn't
  await becomePerson(page, "alex")
  await page.goto("/give/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Send Lisbon Trip a gift" })).toBeVisible()
  await expect(page.getByText("Help us get to Lisbon ☕")).toBeVisible()
  await expect(page.getByText("Be the first to send a gift.")).toBeVisible()
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Shown note")
  await page.getByRole("switch", { name: "Show my name and note on this page" }).click()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await page.getByRole("button", { name: "Send $5 ☕" }).click()
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible()
  await expect(page.getByText("Your name is on the gift page.")).toBeVisible()
  await page.getByRole("button", { name: "Send another gift" }).click()
  await page.getByRole("radio", { name: "$20, 4 coffees" }).click()
  await page.getByRole("textbox", { name: "Your name (optional)" }).fill("Secret Santa")
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Hidden note")
  await page.getByRole("button", { name: "Send $20 ☕" }).click()
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible()

  // a signed-out visitor: totals, Alex listed, nothing of the one who didn't choose to be shown
  // signed out ("null" keeps asPerson's init script from signing Alex back in on the next load)
  await page.evaluate(() => localStorage.setItem("pot.mock.session", "null"))
  await page.goto("/give/lisbon-trip")
  await expect(page.getByText("$25 from 2 gifts so far")).toBeVisible()
  const givers = page.getByRole("region", { name: "Thanks to" })
  await expect(givers.locator("[data-give-giver]")).toHaveCount(1)
  await expect(givers).toContainText("Alex")
  await expect(givers).toContainText("Shown note")
  await expect(page.locator("main")).not.toContainText("Secret Santa")
  await expect(page.locator("main")).not.toContainText("Hidden note")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "page", p, true)

  // signed out: Send → sign in inline → sent
  await page.getByRole("button", { name: "Send $5 ☕" }).click()
  await expect(page.getByRole("heading", { name: "Sign in to send your $5 gift" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "signin", p)
  await page.getByRole("button", { name: "Continue with Google" }).click()
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible({ timeout: 10_000 })

  // the members see every gift, notes included (the hidden one too)
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("button", { name: /^Secret Santa sent a gift of \$20\. Has a note/ })).toBeVisible()
})

test("turning a link off, and turning gifts off, each stop the giver with a calm screen", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  await giftTab(page)
  const url = await makeLink(page)
  const sheet = page.getByRole("dialog", { name: "Gift link for Lisbon Trip" })
  await sheet.getByRole("button", { name: "Turn off the Giver chooses gift link" }).click()
  await expect(sheet.locator("[data-gift-tab='form']")).toBeVisible()
  await expect(sheet.locator("[data-gift-links]")).toHaveCount(0)
  await page.keyboard.press("Escape")

  await becomePerson(page, "alex")
  await page.goto(path(url))
  await expect(page.getByRole("heading", { name: "This gift link was turned off" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Send/ })).toHaveCount(0)
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "revoked", p)

  // gifts off: a new link, then ••• → Gifts → Taking gifts off
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await giftTab(page)
  const url2 = await makeLink(page)
  await page.keyboard.press("Escape")
  await openMenu(page)
  await page.getByRole("menuitem", { name: /Gifts/ }).click()
  const gifts = await openedSheet(page, "Gifts")
  const on = gifts.getByRole("switch", { name: "Taking gifts" })
  await on.click()
  await expect(on).toHaveAttribute("aria-checked", "false")
  await expect(gifts.getByText(/won't take gifts until someone in the Pot turns this back on/)).toBeVisible()
  await axe(page)
  await page.keyboard.press("Escape")
  // the share sheet's gift tab says so too
  await giftTab(page)
  await expect(page.getByRole("dialog", { name: "Gift link for Lisbon Trip" }).locator("[data-gift-tab='off']")).toContainText("isn't taking gifts right now")
  await page.keyboard.press("Escape")

  await becomePerson(page, "alex")
  await page.goto(path(url2))
  await expect(page.getByRole("heading", { name: "Lisbon Trip isn't taking gifts right now" })).toBeVisible()
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "off", p)
})

test("320 px: the giver's page and the Gift link tab reflow without a sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one width check is enough")
  await page.setViewportSize({ width: 320, height: 640 })
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await giftTab(page)
  const url = await makeLink(page, { fixed: "25" })
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(await wide()).toBe(false)
  await page.keyboard.press("Escape")
  await becomePerson(page, "alex")
  await page.goto(path(url))
  await expect(page.getByRole("button", { name: "Send $25 ☕" })).toBeVisible()
  expect(await wide()).toBe(false)
  await page.goto(path(url).replace(/\/g\/lisbon-trip\/.+$/, "/give/lisbon-trip"))
  await expect(page.getByRole("heading", { name: "This gift page isn't open" })).toBeVisible()
  expect(await wide()).toBe(false)
  await axe(page)
})

async function showcase(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.seed")) localStorage.setItem("pot.mock.seed", "showcase")
  })
}

const BDAY_OPEN = "/g/leos-birthday/bdayOpenGiftLink000001"

test("Pay with: Pot dollars, the default when they cover the gift; never offered to someone without any", async ({ page }) => {
  await showcase(page)
  // someone with no Pot dollars (Sam, in the showcase world): Demo dollars | Another app or exchange, as before
  await asPerson(page, "sam")
  await page.goto("/you")
  await expect(page.locator("[data-you-balance] [data-money]")).toHaveText("$0.00")
  await page.goto(BDAY_OPEN)
  const payWith = page.getByRole("radiogroup", { name: "Pay with" })
  await expect(payWith.getByRole("radio")).toHaveCount(2)
  await expect(payWith.getByRole("radio", { name: "Demo dollars" })).toHaveAttribute("aria-checked", "true")
  await expect(payWith.getByRole("radio", { name: "Pot dollars" })).toHaveCount(0)

  // Maya has Pot dollars (Pots paid her in the showcase world)
  await becomePerson(page, "maya")
  await page.goto("/you")
  const balance = page.locator("[data-you-balance] [data-money]")
  await expect(balance).toHaveText(/^\$\d/)
  const own = Number((await balance.innerText()).replace(/[$,]/g, ""))
  expect(own).toBeGreaterThanOrEqual(20)
  const ownText = `$${own.toLocaleString("en-US", { minimumFractionDigits: 2 })}`

  await page.goto(BDAY_OPEN)
  await expect(page.getByRole("heading", { level: 1, name: "Send Leo's Birthday a gift" })).toBeVisible()
  // three ways to pay; Pot dollars picked, since they cover $5
  await expect(payWith.getByRole("radio")).toHaveCount(3)
  await expect(payWith.getByRole("radio", { name: "Pot dollars" })).toHaveAttribute("aria-checked", "true")
  await expect(page.locator("[data-give-source-hint='own']")).toHaveText(`You have ${ownText} in Pot dollars. Your gift comes from them.`)
  await brandChecks(page, { marigold: "one" })
  await axe(page)

  // three ways to pay still fit at 320 px (no sideways scroll)
  const size = page.viewportSize()!
  await page.setViewportSize({ width: 320, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.setViewportSize(size)

  // more than they have: not chosen yet → demo dollars; chosen → "not enough", Send waits
  await page.getByRole("radio", { name: "Other amount" }).click()
  await page.getByRole("textbox", { name: "Gift amount in dollars" }).fill(String(Math.floor(own) + 1))
  await expect(payWith.getByRole("radio", { name: "Demo dollars" })).toHaveAttribute("aria-checked", "true")
  await payWith.getByRole("radio", { name: "Pot dollars" }).click()
  await expect(page.locator("[data-give-source-hint='own']")).toContainText(`You have ${ownText} in Pot dollars, not enough for`)
  await expect(page.locator("[data-give-send]")).toBeDisabled()
  await axe(page)

  // $20 from Pot dollars → sent, and their Pot dollars went down by $20
  await page.getByRole("radio", { name: "$20, 4 coffees" }).click()
  await expect(payWith.getByRole("radio", { name: "Pot dollars" })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("button", { name: "Send $20 ☕" }).click()
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible()
  await page.goto("/you")
  await expect(balance).toHaveText(`$${(own - 20).toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
})

test("the record: members see every gift's name and note; visitors only the givers who chose to be shown; the CSV has the gifts", async ({ page }) => {
  await showcase(page)
  // a member (Maya): Ana (shown), Tomás (through the $25 link, not shown) and Alex, each with their note
  await asPerson(page, "maya")
  await page.goto("/p/leos-birthday/record")
  const gifts = page.locator("[data-record-gifts]")
  await expect(gifts.locator("[data-record-gift]")).toHaveCount(3)
  await expect(gifts).toContainText("Gift from Ana")
  await expect(gifts).toContainText("Happy birthday Leo! Coffee's on me ☕")
  await expect(gifts).toContainText("Gift from Tomás")
  await expect(gifts).toContainText("For the cake. Don't tell him!")
  await expect(gifts).toContainText("Gift from Alex")
  await brandChecks(page, { marigold: "at-most-one" })
  await axe(page)

  // the CSV: one row per gift, "Gift" unless the giver chose to be shown (even for a member)
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-record-csv]").click()])
  const csv = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"))
  const giftLines = csv.split("\r\n").filter((l) => l.includes(",Gift,—,Received,"))
  expect(giftLines).toHaveLength(3)
  expect(giftLines.filter((l) => l.includes(",Leo's Birthday,Ana,"))).toHaveLength(1)
  expect(giftLines.filter((l) => l.includes(",Leo's Birthday,Gift,"))).toHaveLength(2)
  expect(csv).not.toContain("Tomás")
  expect(csv).not.toContain("For the cake")

  // a visitor (signed out): Ana's name and note only; the other two are just "Gift"
  await page.evaluate(() => localStorage.setItem("pot.mock.session", "null"))
  await page.goto("/p/leos-birthday/record")
  await expect(gifts.locator("[data-record-gift]")).toHaveCount(3)
  await expect(gifts).toContainText("Gift from Ana")
  await expect(gifts).toContainText("Happy birthday Leo! Coffee's on me ☕")
  await expect(page.locator("main")).not.toContainText("Tomás")
  await expect(page.locator("main")).not.toContainText("For the cake")
  await expect(page.locator("main")).not.toContainText("Gift from Alex")
  await axe(page)
})
