// Spend details with saved receipts on the mock data source (2026-11-02): every spend opens its details sheet, and a
// spend sent after "Scan receipt" keeps the receipt's details (never the photo) with a fingerprint the spend itself
// carries. Covered:
//  - an instant spend with a scanned euro receipt: the feed row says "Receipt attached" and opens the details (how it
//    was approved, status, the receipt: merchant · day, total, "Converted from €42.50 at 1.0852 (…)", the items, read
//    privately, "Receipt fingerprint matches" + how it works) and the comments, which work on an instant spend too;
//  - a vote-path spend with a receipt: Sam sees the details and the check before he approves (Approve stays the one
//    marigold); after the group approves it says "By the group";
//  - the showcase's saved receipt (Ski Chalet) with its "Check it yourself ↗" link, and edited details → the warning;
//  - a person's activity and You open the spend's details; the public record shows only "Receipt attached" to a
//    visitor (no merchant, no items), and members get "See details";
//  - 320 px reflow.
// Day, Night and desktop; axe 0 serious and the brand checks. The mobile projects save
// notes/screens/spend-details-{day,night}.png (+ -check-, -mismatch-, -record-).
import { fileURLToPath } from "node:url"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, spendFlow, typeAmount } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const FIXTURE = (name: string) => fileURLToPath(new URL(`../fixtures/receipts/${name}`, import.meta.url))
test.use({ reducedMotion: "reduce" })

const shot = (page: Page, name: string, project: string) =>
  project === "desktop" ? Promise.resolve() : page.screenshot({ path: `${SCREENS}spend-details-${name}${project === "mobile-night" ? "night" : "day"}.png` }).then(() => undefined)

/** The hub 1.1.0 showcase Pots (Ski Chalet has the seeded receipt); automated browsers get the classic seed otherwise. */
async function showcase(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.seed")) localStorage.setItem("pot.mock.seed", "showcase")
  })
}

async function openSpend(page: Page) {
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  return openedSheet(page, "Spend from Lisbon Trip")
}

async function scan(sheet: Locator, name: string) {
  await sheet.locator("[data-receipt-input='camera']").setInputFiles(FIXTURE(name))
  await expect(sheet.locator("[data-receipt-summary]")).toBeVisible()
}

const receiptCard = (sheet: Locator) => sheet.getByRole("region", { name: "Receipt", exact: true })
const fingerprint = (sheet: Locator) => sheet.locator("[data-fingerprint]")
const RATE_DAY = /\((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\)$/

test("instant spend with a scanned receipt: the row says Receipt attached and opens the details, the check and the comments", async ({ page }, info) => {
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await scan(sheet, "receipt-cafe-eur.jpg")
  // the euro receipt converts at the mock's rate and fills $46.12; asking sends it with the spend
  await expect(sheet.locator("[data-spend-body='2']")).toBeVisible()
  await sheet.getByRole("button", { name: "Get $46.12 back" }).click()
  await expect(sheet.getByText("$46.12 sent to you")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  // the row: an instant spend is a button, with the receipt mark (an icon; "Receipt attached" in its name and for
  // screen readers) once the details are saved
  const row = page.locator("[data-feed] li").filter({ has: page.getByRole("button", { name: /^Maya got \$46\.12 back/ }) })
  await expect(row.locator("[data-receipt-indicator]")).toHaveText("Receipt attached")
  await expect(row.locator("[data-receipt-indicator] svg")).toHaveCount(1)
  await row.getByRole("button").first().click()
  const details = await openedSheet(page, "Maya asked for $46.12")

  // how it was approved and where it is
  await expect(details.locator("[data-approve-status]")).toContainText("Approved by Pot rules")
  await expect(details.locator("[data-approve-status]")).toContainText("$46.12 was sent to you.")
  await expect(details.locator("[data-details-approved]")).toHaveText("By the Pot's rules")
  await expect(details.locator("[data-details-facts]")).toContainText("Paid")
  await expect(details.locator("[data-receipt]").first()).toBeVisible() // the explorer receipt ↗

  // the saved receipt
  const card = receiptCard(details)
  await expect(card.locator("[data-saved-receipt-title]")).toHaveText("Taberna da Rua · Oct 27")
  await expect(card.locator("[data-saved-receipt-total]")).toHaveText("€42.50")
  await expect(card.locator("[data-saved-receipt-fx]")).toHaveText(/^Converted from €42\.50 at 1\.0852 /)
  await expect(card.locator("[data-saved-receipt-fx]")).toHaveText(RATE_DAY)
  await expect(card.locator("[data-saved-receipt-items]")).toBeHidden()
  if (info.project.name !== "desktop") {
    // the receipt and its check in view (items still folded)
    await card.evaluate((el) => el.scrollIntoView({ block: "start" }))
    await shot(page, "", info.project.name)
  }
  await card.getByRole("button", { name: "Show 3 items" }).click()
  await expect(card.locator("[data-saved-receipt-items] li")).toHaveCount(5) // 3 items + tax + tip
  await expect(card.locator("[data-saved-receipt-items]")).toContainText("Bacalhau à Brás")
  await expect(card.locator("[data-saved-receipt-items]")).toContainText("Tip")
  await expect(card.locator("[data-saved-receipt-private]")).toContainText("Read privately")
  await expect(card.locator("[data-saved-receipt-private]")).toContainText("Sample reading: this test version didn't read a real photo.")
  await expect(card.locator("img")).toHaveCount(0)

  // the fingerprint check: icon + word, and how it works
  await expect(fingerprint(details)).toHaveAttribute("data-fingerprint", "match")
  await expect(fingerprint(details)).toContainText("Receipt fingerprint matches")
  await fingerprint(details).getByRole("button", { name: "How does this work?" }).click()
  await expect(fingerprint(details).getByText(/saved it with the spend itself, where nobody can change it/)).toBeVisible()
  await brandChecks(page, { marigold: "none" }) // nothing to decide: [Done] is secondary
  await axe(page)

  // comments now work on an instant spend too
  const thread = details.locator("[data-comments]")
  await thread.getByRole("textbox", { name: "Write a comment" }).fill("Dinner on Tuesday, receipt attached.")
  await details.getByRole("button", { name: "Send" }).click()
  await expect(details.locator("[data-comments-live]")).toHaveText("Comment sent.")
  await details.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(row.locator("[data-comment-count='1']")).toBeVisible()
})

test("vote-path spend with a receipt: Sam sees the details and the check before approving; then 'By the group'", async ({ page }) => {
  await asPerson(page, "maya")
  const sheet = await openSpend(page)
  await scan(sheet, "receipt-pingo-doce.jpg")
  // the bank charged more (a second receipt on the same trip): Back, $120, and the group decides
  await sheet.getByRole("button", { name: "Back", exact: true }).click()
  for (let i = 0; i < 5; i++) await sheet.getByRole("button", { name: "delete", exact: true }).click()
  await typeAmount(page, "120")
  await spendFlow(page, { submit: "Ask the group" })
  await expect(sheet.getByText("Sent to the group")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  const mine = page.getByRole("button", { name: /^Maya asks for \$120/ }).locator("visible=true").first()
  await expect(mine.locator("[data-receipt-indicator]")).toBeVisible()

  await becomePerson(page, "sam")
  await page.goto("/requests")
  const card = page.locator("[data-request-card]").first()
  await expect(card.locator("[data-receipt-indicator]")).toHaveText("Receipt attached")
  await card.getByRole("button", { name: /^Maya asks for \$120/ }).click()
  const details = await openedSheet(page, "Maya asks for $120")
  await expect(receiptCard(details).locator("[data-saved-receipt-title]")).toHaveText("Pingo Doce · Oct 28")
  await expect(receiptCard(details).locator("[data-saved-receipt-total]")).toHaveText("$84.20")
  await expect(receiptCard(details).locator("[data-saved-receipt-fx]")).toHaveCount(0) // dollars: nothing converted
  await expect(fingerprint(details)).toHaveAttribute("data-fingerprint", "match")
  await expect(details.locator("[data-details-approved]")).toHaveText("Not yet")
  await brandChecks(page, { marigold: "one" }) // Approve
  await axe(page)
  await details.getByRole("button", { name: "Approve $120" }).click()
  await expect(details.locator("[data-approve-status]")).toContainText("Approved")
  await details.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  // decided: the details say who approved it, and the receipt is still checked
  await page.goto("/p/lisbon-trip")
  await page.locator("[data-feed] li", { hasText: "$120" }).getByRole("button").first().click()
  const decided = await openedSheet(page, "Maya asked for $120")
  await expect(decided.locator("[data-details-approved]")).toHaveText("By the group")
  await expect(decided.getByRole("region", { name: /approvals/ })).toBeVisible()
  await expect(fingerprint(decided)).toHaveAttribute("data-fingerprint", "match")
})

test("the showcase's saved receipt links to its check; edited details show the warning", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "sam")
  await page.goto("/p/ski-chalet")
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet" })).toBeVisible()
  const row = page.locator("[data-feed] li").filter({ has: page.getByRole("button", { name: /^Maya got \$35 back/ }) })
  await expect(row.locator("[data-receipt-indicator]")).toBeVisible()
  await row.getByRole("button").first().click()
  let details = await openedSheet(page, "Maya asked for $35")
  const card = receiptCard(details)
  await expect(card.locator("[data-saved-receipt-title]")).toHaveText(/^Café du Col · /)
  await expect(card.locator("[data-saved-receipt-fx]")).toHaveText(/^Converted from €32\.25 at 1\.0852 /)
  const check = card.getByRole("link", { name: "Check where your receipt was read. Opens a new page." })
  await expect(check).toHaveAttribute("href", "https://cloud.near.ai/verify?model=z-ai%2Fglm-5.3-flash")
  await expect(check).toHaveAttribute("target", "_blank")
  await expect(fingerprint(details)).toHaveAttribute("data-fingerprint", "match")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "check-", info.project.name)
  await page.keyboard.press("Escape")

  // someone edits the saved details afterwards: they no longer match the fingerprint the spend carries
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem("pot.mock.world.v1")!)
    w.receipts["ski-chalet:103"].tipCents = 1250
    localStorage.setItem("pot.mock.world.v1", JSON.stringify(w))
  })
  await page.goto("/p/ski-chalet?r=103")
  details = await openedSheet(page, "Maya asked for $35")
  await expect(fingerprint(details)).toHaveAttribute("data-fingerprint", "mismatch")
  await expect(fingerprint(details)).toContainText("Receipt details changed")
  await expect(fingerprint(details)).toContainText("may have been edited")
  await expect(fingerprint(details).locator("svg").first()).toBeVisible()
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "mismatch-", info.project.name)
})

test("a person's activity and You open the spend's details", async ({ page }) => {
  await showcase(page)
  await asPerson(page, "maya")
  await page.goto("/p/ski-chalet?sheet=person&who=maya")
  const person = await openedSheet(page, /Ski Chalet/)
  const asked = person.locator("[data-activity='asked']", { hasText: "$35" })
  await expect(asked.locator("[data-receipt-indicator]")).toBeVisible()
  await asked.getByRole("button").first().click()
  await openedSheet(page, "Maya asked for $35")
  await expect(page).toHaveURL(/[?&]r=103/)
  await axe(page)

  await page.goto("/you")
  const mine = page.locator("[data-activity-list] [data-activity='asked']", { hasText: "$35" })
  await expect(mine.locator("[data-receipt-indicator]")).toBeVisible()
  await mine.getByRole("link").first().click()
  await expect(page).toHaveURL(/\/p\/ski-chalet\?r=103$/)
  await openedSheet(page, "Maya asked for $35")
})

test("the public record: a visitor sees only 'Receipt attached'; members get 'See details'", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "maya")
  await page.goto("/p/ski-chalet/record")
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet: every spend" })).toBeVisible()
  const rows = info.project.name === "desktop" ? page.locator("[data-record-table] tbody tr") : page.locator("[data-record-list] > li")
  const withReceipt = rows.filter({ has: page.locator("[data-record-receipt]") })
  await expect(withReceipt).toHaveCount(1)
  await expect(withReceipt.locator("[data-receipt-indicator]")).toHaveText("Receipt attached")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await withReceipt.getByRole("link", { name: /^See the receipt and details of/ }).click()
  await expect(page).toHaveURL(/\/p\/ski-chalet\?r=103$/)
  await openedSheet(page, "Maya asked for $35")

  // a visitor: the indicator only; no details link, no merchant, no items anywhere
  await page.evaluate(() => localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "nobody", kind: "mock" })))
  await page.goto("/p/ski-chalet/record")
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet: every spend" })).toBeVisible()
  await expect(withReceipt.locator("[data-receipt-indicator]")).toHaveText("Receipt attached")
  await expect(page.locator("[data-record-receipt-details]")).toHaveCount(0)
  await expect(page.locator("main")).not.toContainText("Café du Col")
  await expect(page.locator("main")).not.toContainText("Raclette")
  await axe(page)
  await shot(page, "record-", info.project.name)
})

test("320 px: the details sheet with its receipt reflows without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one width check is enough")
  await showcase(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await asPerson(page, "sam")
  await page.goto("/p/ski-chalet?r=103")
  const details = await openedSheet(page, "Maya asked for $35")
  await receiptCard(details).getByRole("button", { name: "Show 3 items" }).click()
  await fingerprint(details).getByRole("button", { name: "How does this work?" }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const inner = await details.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(inner).toBeLessThanOrEqual(0)
  await axe(page)
})
