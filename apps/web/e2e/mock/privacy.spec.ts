// "Who can see what" and the visitor's view (privacy audit 2026-11-02, notes/backend.md), on the mock data source in
// every project (mobile Day, mobile Night, desktop):
//  - a Pot's ••• menu → "Who can see what" opens the sheet (URL state ?sheet=privacy; Back closes it);
//  - You → "Who can see what" opens the same sheet;
//  - the public record as a visitor: no notes, no chosen pictures, no receipt details; its footer "What's public?"
//    opens the sheet;
//  - the invite landing names only the inviter.
// Every screen: axe 0 serious + the brand checks; mobile projects save notes/screens/privacy-*-{day,night}.png.
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, brandChecks, openedSheet, potMore, PORTO_INVITE_URL } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}privacy-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

/** The hub 1.1.0 showcase Pots (Ski Chalet: notes, a saved receipt) in a fresh mock world. */
async function showcase(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.seed")) localStorage.setItem("pot.mock.seed", "showcase")
  })
}

const PUBLIC = ["Money added and spent, and when", "Which accounts are in the Pot", "The Pot's name and rules", "Who approved or declined each spend"]
const MEMBERS = ["The names and pictures people chose", "Notes on spends and reasons for a no", "Comments", "Receipts and their items", "Who a link to send money is for", "Your activity"]

async function expectSheet(page: Page) {
  const sheet = await openedSheet(page, "Who can see what")
  const pub = sheet.getByRole("region", { name: "Anyone can see" })
  const mem = sheet.getByRole("region", { name: "Only people in this Pot can see" })
  for (const x of PUBLIC) await expect(pub.getByText(x, { exact: true })).toBeVisible()
  for (const x of MEMBERS) await expect(mem.getByText(x, { exact: true })).toBeAttached()
  await expect(sheet.locator("[data-privacy-links]")).toHaveText("Anyone with an invite or a link sees the Pot's name. A link to send money also shows who sent it and the amount.")
  return sheet
}

test.use({ reducedMotion: "reduce" })

test("Pot ••• More → Who can see what; Back closes it", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  const more = await potMore(page, "Lisbon Trip")
  const item = more.getByRole("button", { name: /Who can see what/ })
  await expect(item).toContainText("What's private and what's public")
  await axe(page)
  await item.click()
  await expect(page).toHaveURL(/\/p\/lisbon-trip\?sheet=privacy$/)
  const sheet = await expectSheet(page)
  await brandChecks(page, { marigold: "none" }) // calm: [Got it] is secondary
  await axe(page)
  await shot(page, "sheet", info.project.name)
  await page.goBack()
  await expect(page.getByRole("dialog")).toBeHidden()
  // and [Got it] closes it too
  await potMore(page, "Lisbon Trip", /Who can see what/)
  await (await openedSheet(page, "Who can see what")).getByRole("button", { name: "Got it" }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/\/p\/lisbon-trip$/)
})

test("You → Who can see what", async ({ page }) => {
  await asPerson(page, "sam")
  await page.goto("/you")
  await page.getByRole("button", { name: "Who can see what" }).click()
  await expect(page).toHaveURL(/\/you\?sheet=privacy$/)
  await expectSheet(page)
  await brandChecks(page, { marigold: "none" })
  await axe(page)
})

test("the public record as a visitor: chain facts only; 'What's public?' explains", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "maya")
  // a member sees the notes and the receipt's details link
  await page.goto("/p/ski-chalet/record")
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet: every spend" })).toBeVisible()
  await expect(page.locator("main")).toContainText("Lift passes")
  await expect(page.locator("[data-record-receipt-details]").locator("visible=true")).toHaveCount(1)

  // a visitor (an unknown person reads as signed out)
  await page.evaluate(() => localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "nobody", kind: "mock" })))
  await page.goto("/p/ski-chalet/record")
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet: every spend" })).toBeVisible()
  await expect(page.locator("[data-record-totals]")).toHaveText("5 spends · $315 paid out") // amounts: public
  const main = page.locator("main")
  for (const secret of ["Lift passes", "Chalet deposit", "Supermarket run", "Train to the valley", "Café du Col", "Raclette"]) await expect(main).not.toContainText(secret)
  await expect(main.locator('[data-avatar]:not([data-avatar="initials"])')).toHaveCount(0) // no chosen pictures
  await expect(page.locator("[data-record-receipt-details]")).toHaveCount(0)
  await expect(main.locator("[data-receipt-indicator]").locator("visible=true").first()).toHaveText("Receipt attached") // existence only
  await brandChecks(page, { marigold: "none" })
  await axe(page)

  await page.locator("[data-record-privacy]").click()
  await expectSheet(page)
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "record", info.project.name)
  await page.getByRole("button", { name: "Got it" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
})

test("the invite landing names the inviter only", async ({ page }) => {
  await page.goto(PORTO_INVITE_URL)
  await expect(page.getByRole("heading", { level: 1, name: "Maya invited you to Porto Weekend" })).toBeVisible()
  await expect(page.locator("[data-invite-members]")).toHaveText("Maya and 1 other are in")
  await expect(page.locator("main")).not.toContainText("Sam")
  await expect(page.locator("main [data-avatar]")).toHaveCount(2)
  await expect(page.locator('main [data-avatar]:not([data-avatar="initials"])')).toHaveCount(0)
  await axe(page)
})

test("320 px: the sheet and the record's footer fit without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one width check is enough")
  await showcase(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await asPerson(page, "leo")
  await page.goto("/p/ski-chalet?sheet=privacy")
  await expectSheet(page)
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(await over()).toBeLessThanOrEqual(0)
  const sheet = page.getByRole("dialog", { name: "Who can see what" })
  const box = await sheet.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  await axe(page)
  await page.goto("/p/ski-chalet/record")
  await page.locator("[data-record-privacy]").scrollIntoViewIfNeeded()
  expect(await over()).toBeLessThanOrEqual(0)
})
