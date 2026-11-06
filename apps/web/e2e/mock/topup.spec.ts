// "Ask for a top-up" on the mock data source, in every project (mobile Day, mobile Night, desktop):
//  1. Maya: [Ask] → Ask the group → "$50 each" (defaults first: the Pot's $150, a week) + "Hotel went up", 3 days →
//     the card on the Pot ("You asked for $50 each · 0 of 3 added") and the push stub (Sam and Leo get
//     "Maya asks everyone for $50 more · Hotel went up · Lisbon Trip"); the chooser says her ask is open.
//  2. Sam: Requests → the card (with the Pot's name) → [Add $50] → the Add sheet, prefilled and marked "For Maya's
//     ask" → Add → the card says "1 of 3 added" and "You added $50"; [Nudge] → Maya and Leo get a nudge
//     push, then "Nudged today"; the feed row "Maya · Asked for $50 each" (Asking, 1 of 3 added).
//  3. Maya cancels (confirm) → the card goes, the row says Cancelled.
//  4. "$90 in total" → $30 each → everyone adds through the card → Done (card gone, the row says Done, 3 of 3) →
//     You → Your activity lists the ask.
//  5. 320 px: the sheet and the card reflow without a sideways scroll.
// axe 0 serious + the brand checks on every screen; the mobile projects save notes/screens/topup-*-{day,night}.png.
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, potAsk } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)

test.use({ reducedMotion: "reduce" })

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}topup-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

/** The mock's push stub: what the server would have pushed (newest last). */
async function pushes(page: Page): Promise<{ to: string; title: string; body: string; url: string }[]> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem("pot.mock.world.v1") ?? "{}") as { pushes?: { to: string; title: string; body: string; url: string }[] }).pushes ?? [])
}

const card = (page: Page) => page.locator("[data-topup-card]").locator("visible=true").first()
const row = (page: Page) => page.locator("[data-topup-row]").locator("visible=true").first().getByRole("group")

/** The hero's [Ask] → Ask the group → the sheet. */
const askSheet = (page: Page) => potAsk(page, "group")

/** On the Pot: the card's [Add $X] → the Add sheet → Add. */
async function addViaCard(page: Page, amount: string, asker: string | null) {
  await card(page).getByRole("button", { name: `Add ${amount}` }).click()
  const add = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(add.locator("[data-add-topup]")).toHaveText(asker ? `For ${asker}'s ask: ${amount} each.` : `For your ask: ${amount} each.`)
  await add.getByRole("button", { name: `Add ${amount}`, exact: true }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  // the add lands (the mock's latency) before anyone else looks
  await expect(page.getByText(/^Added\. Lisbon Trip now has/).first()).toBeVisible()
}

test("ask $50 each → the card and the push → Sam adds through the card → nudge → Maya cancels", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()

  // 1. the sheet: defaults first ($150 each = the Pot's chip-in amount, a week), one marigold
  const sheet = await askSheet(page)
  const amount = sheet.getByRole("textbox", { name: "How much from each person?" })
  await expect(amount).toHaveValue("150")
  await expect(sheet.locator("[data-topup-split]")).toHaveText("$450 in total from 3 people")
  await expect(sheet.getByRole("radio", { name: "In a week" })).toHaveAttribute("aria-checked", "true")
  await expect(sheet.getByRole("button", { name: "Ask for $150 each" })).toBeEnabled()
  // "In total" splits it equally
  await sheet.getByRole("radio", { name: "In total" }).click()
  await expect(sheet.getByRole("textbox", { name: "How much in total?" })).toHaveValue("450")
  await expect(sheet.locator("[data-topup-split]")).toHaveText("$150 each from 3 people")
  await sheet.getByRole("radio", { name: "Each person" }).click()
  await amount.fill("50")
  await expect(sheet.locator("[data-topup-split]")).toHaveText("$150 in total from 3 people")
  await sheet.getByRole("textbox", { name: "Why? (optional)" }).fill("Hotel went up")
  await expect(sheet.getByText("13 of 80")).toBeVisible()
  await sheet.getByRole("radio", { name: "In 3 days" }).click()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "sheet", p)
  // too little each: the button waits and says why
  await amount.fill("0.5")
  await expect(sheet.locator("[data-topup-split]")).toHaveText("Ask for at least $1 from each person.")
  await expect(sheet.getByRole("button", { name: "Ask everyone" })).toBeDisabled()
  await amount.fill("50")
  await sheet.getByRole("button", { name: "Ask for $50 each" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByText("Asked everyone for $50 more.")).toBeVisible()

  // the card on the Pot (the asker is asked too)
  const c = card(page)
  await expect(c.getByRole("heading", { name: "You asked for $50 each" })).toBeVisible()
  await expect(c.locator("[data-topup-reason]")).toHaveText("“Hotel went up”")
  await expect(c.locator("[data-topup-progress]")).toHaveText("0 of 3 added")
  await expect(c.locator("[data-status='needs']")).toHaveText("Asking")
  await expect(c.locator("[data-topup-waiting]")).toHaveText("Waiting for Sam and Leo")
  await expect(c.getByRole("button", { name: "Add $50" })).toBeVisible()
  await expect(c.getByRole("button", { name: "Cancel ask" })).toBeVisible()
  await brandChecks(page, { marigold: "one" }) // Add money in the hero stays the one marigold
  await axe(page)
  await c.scrollIntoViewIfNeeded()
  await shot(page, "card-asker", p)
  // the push stub: Sam and Leo, with the reason (members only)
  const asked = (await pushes(page)).filter((x) => x.title.startsWith("Maya asks"))
  expect(asked.map((x) => [x.to, x.title, x.body, x.url])).toEqual(["sam", "leo"].map((to) => [to, "Maya asks everyone for $50 more", "Hotel went up · Lisbon Trip", "/p/lisbon-trip"]))
  // one open ask at a time: Ask → "Ask the group" is off and says why; "Ask anyone by link" still works
  const chooser = await potAsk(page)
  const item = chooser.getByRole("button", { name: /^Ask the group/ })
  await expect(item).toHaveAttribute("aria-disabled", "true")
  await expect(item).toContainText("Your ask is still open")
  await item.click({ force: true })
  await expect(page.getByRole("dialog", { name: "Ask the group" })).toHaveCount(0)
  await expect(chooser.getByRole("button", { name: /^Ask anyone by link/ })).not.toHaveAttribute("aria-disabled", "true")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // 2. Sam: Requests → the card → Add $50 (prefilled, marked) → progress
  await becomePerson(page, "sam")
  await page.goto("/requests")
  const inbox = page.locator("[data-topup-card]").first()
  await expect(inbox).toContainText("Lisbon Trip")
  await expect(inbox.getByRole("heading", { name: "Maya asks for $50 each" })).toBeVisible()
  await expect(page.getByRole("heading", { name: /Waiting on you · 1/ })).toBeVisible()
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "requests", p)
  await inbox.getByRole("link", { name: "Add $50" }).click()
  await expect(page).toHaveURL(/\/p\/lisbon-trip\?sheet=add&amount=50&topup=/)
  const add = await openedSheet(page, "Add money to Lisbon Trip")
  await expect(add.locator("[data-add-topup]")).toHaveText("For Maya's ask: $50 each.")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "add", p)
  await add.getByRole("button", { name: "Add $50", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByText(/^Added\. Lisbon Trip now has/).first()).toBeVisible()
  await expect(card(page).locator("[data-topup-progress]")).toHaveText("1 of 3 added")
  await expect(card(page).locator("[data-topup-you-done]")).toHaveText("You added $50")
  await expect(card(page).getByRole("button", { name: /^Add \$/ })).toHaveCount(0)
  await expect(card(page).locator("[data-topup-waiting]")).toHaveText("Waiting for Maya and Leo")
  // Requests no longer waits on Sam
  // nudge the two still to add
  await card(page).getByRole("button", { name: "Nudge Maya and Leo" }).click()
  await expect(page.getByText("Nudge sent to Maya and Leo")).toBeVisible()
  await expect(card(page).locator("[data-topup-nudged]")).toContainText("Nudged today")
  const nudged = (await pushes(page)).filter((x) => x.title === "Sam nudged you")
  expect(nudged.map((x) => [x.to, x.body, x.url])).toEqual(
    ["maya", "leo"].map((to) => [to, "Add your $50 share to Lisbon Trip.", expect.stringMatching(/^\/p\/lisbon-trip\?sheet=add&amount=50&topup=/)]),
  )
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await card(page).scrollIntoViewIfNeeded()
  await shot(page, "card-member", p)
  // the feed row
  await expect(row(page)).toHaveAccessibleName(/^Maya asked everyone for \$50 more\. Hotel went up\. 1 of 3 added\. Asking\./)
  await expect(row(page).locator("[data-row-title]")).toHaveText("Maya · Asked for $50 each")
  await row(page).scrollIntoViewIfNeeded()
  await shot(page, "row", p)
  await page.goto("/requests")
  await expect(page.locator("[data-topup-card]")).toHaveCount(0)

  // 3. Maya cancels (with a confirm); the card goes, the row says Cancelled
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  // the corner icon opens a small confirm sheet
  await card(page).getByRole("button", { name: "Cancel ask" }).click()
  const ask = await openedSheet(page, "Cancel this ask?")
  await expect(ask.locator("[data-topup-confirm]")).toContainText("Money already added stays in the Pot")
  await axe(page)
  await brandChecks(page, { marigold: "none" })
  await ask.getByRole("button", { name: "Yes, cancel" }).click()
  await expect(page.getByText("Ask cancelled.")).toBeVisible()
  await expect(page.locator("[data-topup-card]")).toHaveCount(0)
  await expect(row(page).locator("[data-status]")).toHaveText("Cancelled")
  await expect(row(page)).toContainText("1 of 3 added")
  // and a new ask can be made
  const again = await potAsk(page)
  await expect(again.getByRole("button", { name: /^Ask the group/ })).not.toHaveAttribute("aria-disabled", "true")
})

test("$90 in total → $30 each → everyone adds through the card → Done; it's in Your activity", async ({ page }, info) => {
  const p = info.project.name
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const sheet = await askSheet(page)
  await sheet.getByRole("radio", { name: "In total" }).click()
  await sheet.getByRole("textbox", { name: "How much in total?" }).fill("90")
  await expect(sheet.locator("[data-topup-split]")).toHaveText("$30 each from 3 people")
  await sheet.getByRole("button", { name: "Ask for $90 in total" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(card(page).getByRole("heading", { name: "You asked for $30 each" })).toBeVisible()
  await expect(card(page)).toContainText("$90 total")
  await addViaCard(page, "$30", null)
  await expect(card(page).locator("[data-topup-progress]")).toHaveText("1 of 3 added")
  for (const who of ["sam", "leo"] as const) {
    await becomePerson(page, who)
    await page.goto("/p/lisbon-trip")
    await addViaCard(page, "$30", "Maya")
  }
  // everyone added: the card is gone, the row says Done
  await expect(page.locator("[data-topup-card]")).toHaveCount(0)
  await expect(row(page).locator("[data-status='approved']")).toHaveText("Done")
  await expect(row(page)).toContainText("3 of 3 added")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await row(page).scrollIntoViewIfNeeded()
  await shot(page, "done", p)
  // the asker's own activity
  await becomePerson(page, "maya")
  await page.goto("/you")
  const mine = page.locator("[data-activity='topup']").first()
  await expect(mine).toContainText("Asked for $30 each")
  await expect(mine.locator("[data-status]")).toHaveText("Done")
  await axe(page)
})

test("320 px: the sheet and the card reflow", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "320 px once")
  await page.setViewportSize({ width: 320, height: 700 })
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const sheet = await askSheet(page)
  await sheet.getByRole("textbox", { name: "Why? (optional)" }).fill("Hotel went up, and the ferry too")
  const wide = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(await wide()).toBe(false)
  await axe(page)
  await sheet.getByRole("button", { name: /^Ask for \$150 each$/ }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await card(page).scrollIntoViewIfNeeded()
  expect(await wide()).toBe(false)
  const box = await card(page).boundingBox()
  expect(box!.width).toBeLessThanOrEqual(320)
  await axe(page)
})
