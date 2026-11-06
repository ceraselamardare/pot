// Gifts (hub 1.2.0; notes/gifts-plan.md), since "pay in" (2026-11-03) the gift TONE of a pay-in link or page, on the
// mock data source, in every project (mobile Day, mobile Night, desktop). The payment tone is e2e/mock/payin.spec.ts.
//  1. A member makes pay-in links in Ask → Ask anyone with "What's it for? A gift ☕": the default (they choose,
//     reusable, 14 days) in one tap, QR first + Share + Copy; then a fixed $25 one-time link with a note; Settings →
//     Pay-in links lists both.
//  2. A guest (Alex) opens the open link: presets ☕ $5 / $10 / $20 ($10 picked), a note → [Send $10 ☕] → "Thank you!"
//     with [Start your own Pot]; then the $25 link has one button; the one-time link is used after that.
//  3. The members' feed row "Alex · Sent a gift ☕" (Gift chip, note mark, + $10.00) opens the details with the note.
//  4. The public page is off by default (/give says so) → a member turns it on in Settings → Public page as a gift
//     page with a line → a giver who chose "Show my name on this page" is listed, one who didn't isn't; a signed-out
//     visitor sees the same.
//  5. Turning a link off (Settings → Pay-in links): the giver sees "This link was turned off".
//  6. Taking money from outside off (Settings): the giver sees "isn't taking gifts right now".
//  7. The giver's own gifts in You → Your activity; a signed-out giver signs in inline (the mock signs in as Alex).
//  8. 320 px: the giver's page and Ask anyone reflow without a sideways scroll.
//  9. Pay with "Pot dollars" (a signed-in giver with a balance; picked by default when it covers the gift).
// 10. The record: members see every gift's name and note, visitors only opted-in givers; the CSV lists the gifts.
// axe 0 serious + the brand checks on every screen; the mobile projects save notes/screens/gifts-*-{day,night}.png.
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, potAsk, settingsTab } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
const LINK_RE = /\/g\/lisbon-trip\/[A-Za-z0-9_-]{22}$/

test.use({ reducedMotion: "reduce" })

async function shot(page: Page, name: string, project: string, fullPage = false) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}gifts-${name}-${project === "mobile-night" ? "night" : "day"}.png`, fullPage })
}

const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "")

/** Ask → Ask anyone by link → "What's it for? A gift ☕". */
async function giftForm(page: Page) {
  const sheet = await potAsk(page, "anyone")
  await sheet.getByRole("radio", { name: "A gift ☕" }).click()
  return sheet
}

/** Make a pay-in link in the open Ask anyone sheet; returns its address. */
async function makeLink(page: Page, opts: { fixed?: string; note?: string; once?: boolean } = {}) {
  const sheet = page.getByRole("dialog", { name: "Ask anyone to pay in" })
  if (opts.fixed) {
    await sheet.getByRole("radio", { name: "Fixed" }).click()
    await sheet.getByRole("textbox", { name: "Amount in dollars" }).fill(opts.fixed)
  }
  if (opts.note || opts.once) {
    await sheet.getByRole("button", { name: "More options" }).click()
    if (opts.note) await sheet.getByRole("textbox", { name: "A note for them (optional)" }).fill(opts.note)
    if (opts.once) await sheet.getByRole("switch", { name: "One payment only" }).click()
  }
  await sheet.getByRole("button", { name: "Make pay-in link" }).click()
  await expect(sheet.locator("[data-payin='ready']")).toBeVisible()
  const url = (await sheet.locator("[data-payin-url]").getAttribute("data-payin-url"))!
  expect(url).toMatch(LINK_RE)
  return url
}

/** Settings → Money from outside → one of its rows' sheets ("Public page" | "Pay-in links"). */
async function outside(page: Page, row: "Public page" | "Pay-in links") {
  const settings = await settingsTab(page)
  await settings.getByRole("button", { name: new RegExp(`^${row}`) }).click()
  return openedSheet(page, row)
}

test("members make gift-tone pay-in links; a guest gives through them; the feed shows the gift and its note", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()

  // 1. the default link in one tap: QR first, Share (the one marigold), Copy
  const sheet = await giftForm(page)
  await expect(sheet.getByRole("radio", { name: "A gift ☕" })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByRole("radio", { name: "They choose" })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByText(/Works for 14 days, until/)).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "link-form", p)
  const open = await makeLink(page)
  await expect(sheet.getByRole("img", { name: "QR code for Lisbon Trip's pay-in link" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Share link" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Copy link" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "link-ready", p)

  // a fixed $25 one-time link with a note, as a plain payment this time (the tone is per link)
  await sheet.getByRole("button", { name: "Make another link" }).click()
  await sheet.getByRole("radio", { name: "A payment" }).click()
  const fixed = await makeLink(page, { fixed: "25", note: "For Leo's surprise dinner", once: true })
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  // Settings → Pay-in links lists both
  const links = await outside(page, "Pay-in links")
  await expect(links.locator("[data-payin-link-row]")).toHaveCount(2)
  await expect(links.locator("[data-payin-links]")).toContainText("Payment · $25")
  await expect(links.locator("[data-payin-links]")).toContainText("One payment")
  await expect(links.locator("[data-payin-links]")).toContainText("Gift ☕ · They choose")
  await axe(page)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()

  // 2. a guest opens the open link (the same browser stands in for their phone)
  await becomePerson(page, "alex")
  await page.goto(path(open))
  await expect(page.getByRole("heading", { level: 1, name: "Send Lisbon Trip a gift" })).toBeVisible()
  await expect(page.getByText("3 people are in this Pot")).toBeVisible()
  await expect(page.getByRole("radio", { name: "$10, 2 coffees" })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("textbox", { name: "Your name (optional)" })).toHaveValue("Alex")
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Have a great trip! ☕")
  await expect(page.getByText("Signed in as Alex")).toBeVisible()
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

  // the fixed-amount link (made as a payment): one button; then it's used (one payment only)
  await page.goto(path(fixed))
  await expect(page.getByText("This link is for $25.")).toBeVisible()
  await expect(page.getByText("For Leo's surprise dinner")).toBeVisible()
  await expect(page.getByRole("radiogroup", { name: "How much?" })).toHaveCount(0)
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await page.getByRole("button", { name: "Pay $25" }).click()
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: "This link was already used" })).toBeVisible()
  await brandChecks(page, { marigold: "none" })
  await axe(page)

  // 7. the giver's own (You → Your activity): the gift and the payment, each in its own words
  await page.goto("/you")
  await expect(page.locator("[data-activity='gift']")).toHaveCount(2)
  await expect(page.getByRole("group", { name: /^You paid \$25 into Lisbon Trip/ })).toBeVisible()
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
  // the money-in details (2026-11-04): who, how much, through whose pay-in link, the note
  await expect(page).toHaveURL(/[?&]sheet=deposit&d=g[0-9a-z]{23}(&|$)/)
  const details = await openedSheet(page, "Alex sent a $10 gift")
  await expect(details.locator("[data-gift-note]")).toContainText("Have a great trip! ☕")
  await expect(details.locator("[data-deposit-source='payin']")).toContainText("A gift from outside")
  await expect(details.locator("[data-deposit-source='payin']")).toContainText("pay-in link")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "details", p)
})

test("the public page: off by default → a member turns it on as a gift page → visitors see only givers who chose to be shown", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "alex")
  await page.goto("/give/lisbon-trip")
  await expect(page.getByRole("heading", { name: "This page isn't open" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Send|Pay/ })).toHaveCount(0)
  await axe(page)

  // a member turns it on (Settings → Public page), as a gift page, with a line
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const sheet = await outside(page, "Public page")
  await expect(page).toHaveURL(/\/p\/lisbon-trip\?(tab=settings&)?sheet=publicpage$/)
  const pageSwitch = sheet.getByRole("switch", { name: "Public page" })
  await expect(pageSwitch).toHaveAttribute("aria-checked", "false")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await pageSwitch.click()
  await expect(pageSwitch).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByRole("radio", { name: "A payment" })).toHaveAttribute("aria-checked", "true")
  await sheet.getByRole("radio", { name: "A gift ☕" }).click()
  await expect(sheet.getByRole("radio", { name: "A gift ☕" })).toHaveAttribute("aria-checked", "true")
  await sheet.getByRole("textbox", { name: "A line for the page (optional)" }).fill("Help us get to Lisbon ☕")
  await sheet.getByRole("button", { name: "Save line" }).click()
  await expect(sheet.getByRole("button", { name: "Line saved" })).toBeVisible()
  await expect(sheet.getByRole("img", { name: "QR code for Lisbon Trip's public page" })).toBeVisible()
  await expect(sheet.locator("[data-page-url]")).toHaveAttribute("data-page-url", /\/give\/lisbon-trip$/)
  await expect(sheet.getByRole("button", { name: "Share page" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "sheet", p)

  // a giver who chooses to be shown, then one who doesn't
  await becomePerson(page, "alex")
  await page.goto("/give/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Send Lisbon Trip a gift" })).toBeVisible()
  await expect(page.getByText("Help us get to Lisbon ☕")).toBeVisible()
  await expect(page.getByText("— from the group")).toBeVisible()
  await expect(page.getByText("Be the first to send a gift.")).toBeVisible()
  await page.getByRole("radio", { name: "$5, 1 coffee" }).click()
  await page.getByRole("textbox", { name: "Note (optional)" }).fill("Shown note")
  await page.getByRole("switch", { name: "Show my name on this page" }).click()
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
  await page.getByRole("button", { name: "Send $10 ☕" }).click()
  await expect(page.getByRole("heading", { name: "Sign in to send your $10 gift" })).toBeVisible()
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

test("turning a link off, and turning money from outside off, each stop the giver with a calm screen", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  await giftForm(page)
  const url = await makeLink(page)
  await page.keyboard.press("Escape")
  const links = await outside(page, "Pay-in links")
  await links.getByRole("button", { name: "Turn off the Gift ☕ · They choose link" }).click()
  await expect(links.locator("[data-payin-link-row]")).toHaveCount(0)
  await expect(links.getByText("No active links right now.")).toBeVisible()
  await page.keyboard.press("Escape")

  await becomePerson(page, "alex")
  await page.goto(path(url))
  await expect(page.getByRole("heading", { name: "This link was turned off" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Send/ })).toHaveCount(0)
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "revoked", p)

  // money from outside off: a new link, then Settings → Taking money from outside off
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await giftForm(page)
  const url2 = await makeLink(page)
  await page.keyboard.press("Escape")
  const settings = await settingsTab(page)
  const on = settings.getByRole("switch", { name: "Taking money from outside" })
  await on.click()
  await expect(on).toHaveAttribute("aria-checked", "false")
  await expect(settings.getByText(/won't take money until someone in the Pot turns this back on/)).toBeVisible()
  await axe(page)
  // Ask anyone says so too
  await potAsk(page, "anyone")
  await expect(page.getByRole("dialog", { name: "Ask anyone to pay in" }).locator("[data-payin='off']")).toContainText("isn't taking money from outside right now")
  await page.keyboard.press("Escape")

  await becomePerson(page, "alex")
  await page.goto(path(url2))
  await expect(page.getByRole("heading", { name: "Lisbon Trip isn't taking gifts right now" })).toBeVisible()
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "off", p)
})

test("320 px: the giver's page and Ask anyone reflow without a sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one width check is enough")
  await page.setViewportSize({ width: 320, height: 640 })
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await giftForm(page)
  const url = await makeLink(page, { fixed: "25" })
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(await wide()).toBe(false)
  await page.keyboard.press("Escape")
  await becomePerson(page, "alex")
  await page.goto(path(url))
  await expect(page.getByRole("button", { name: "Send $25 ☕" })).toBeVisible()
  expect(await wide()).toBe(false)
  await page.goto(path(url).replace(/\/g\/lisbon-trip\/.+$/, "/give/lisbon-trip"))
  await expect(page.getByRole("heading", { name: "This page isn't open" })).toBeVisible()
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
  // three ways to pay; Pot dollars picked, since they cover $10
  await expect(payWith.getByRole("radio")).toHaveCount(3)
  await expect(payWith.getByRole("radio", { name: "Pot dollars" })).toHaveAttribute("aria-checked", "true")
  await expect(page.locator("[data-give-source-hint='own']")).toHaveText(`You have ${ownText} in Pot dollars. It comes from them.`)
  await brandChecks(page, { marigold: "one" })
  await axe(page)

  // three ways to pay still fit at 320 px (no sideways scroll)
  const size = page.viewportSize()!
  await page.setViewportSize({ width: 320, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.setViewportSize(size)

  // more than they have: not chosen yet → demo dollars; chosen → "not enough", Send waits
  await page.getByRole("radio", { name: "Other amount" }).click()
  await page.getByRole("textbox", { name: "Amount in dollars" }).fill(String(Math.floor(own) + 1))
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
