// Comments on requests on the mock data source: Maya asks the group for $300, Sam comments from the Requests inbox,
// Maya sees it (and the count on her request), replies, Sam deletes his own ("Comment removed") and Maya sees that.
// Also the seeded Porto thread on a settled request, a failed send + Try again, and 320 px reflow. Day, Night and
// desktop; axe 0 serious and the brand checks on the sheet (Approve stays the one marigold; Send is always secondary).
// The mobile projects save notes/screens/comments-{day,night}.png (the sheet with the thread).
import { expect, test, type Locator, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, spendFlow } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
test.use({ reducedMotion: "reduce" })

/** Maya: $300 for tickets in Lisbon Trip (over the $100 instant limit → the group decides). */
async function mayaAsks(page: Page) {
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await spendFlow(page, { amount: "300", reason: "Tickets", submit: "Ask the group" })
  await expect(sheet.getByText("Sent to the group")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
}

const thread = (sheet: Locator) => sheet.locator("[data-comments]")
const composer = (sheet: Locator) => sheet.getByRole("textbox", { name: "Write a comment" })

async function comment(sheet: Locator, text: string) {
  await composer(sheet).fill(text)
  await sheet.getByRole("button", { name: "Send" }).click()
  await expect(sheet.locator("[data-comments-live]")).toHaveText("Comment sent.")
  await expect(thread(sheet).locator("[data-comment-state='sent']", { hasText: text })).toBeVisible()
}

test("post, see and delete across two people; counts on the cards; one marigold, axe clean", async ({ page }, info) => {
  await asPerson(page, "maya")
  await mayaAsks(page)

  // Sam opens it from the Requests inbox: an empty thread, then his question
  await becomePerson(page, "sam")
  await page.goto("/requests")
  const card = page.locator("[data-request-card]").first()
  await expect(card.locator("[data-comment-count]")).toHaveCount(0)
  await card.getByRole("button", { name: /^Maya asks for \$300 for tickets/ }).click()
  let sheet = await openedSheet(page, "Maya asks for $300")
  await expect(thread(sheet).getByRole("heading", { name: "Comments", exact: true })).toBeVisible()
  await expect(thread(sheet).locator("[data-comments-empty]")).toHaveText("No comments yet. Ask a question or add a detail for the group.")
  await comment(sheet, "Is this the boat trip on Saturday?")
  await expect(thread(sheet).getByRole("heading", { name: "Comments · 1" })).toBeVisible()
  await expect(composer(sheet)).toBeFocused()
  await expect(composer(sheet)).toHaveValue("")
  // Approve stays the one marigold; Send is secondary
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  // the card now shows the count (icon + number, read as "1 comment")
  await expect(card.locator("[data-comment-count='1']")).toBeVisible()
  await expect(card.locator("[data-comment-count='1']")).toContainText("1 comment")

  // Maya: her own request on the Pot shows the count; she reads Sam's question and replies
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const mine = page.getByRole("button", { name: /^Maya asks for \$300 for tickets/ }).locator("visible=true").first()
  await expect(mine.locator("[data-comment-count='1']")).toBeVisible()
  await mine.click()
  sheet = await openedSheet(page, "Maya asks for $300")
  await expect(thread(sheet).locator("[data-comment]", { hasText: "Is this the boat trip on Saturday?" })).toContainText("Sam")
  await expect(thread(sheet).locator("[data-comment-delete]")).toHaveCount(0) // not hers to delete
  await comment(sheet, "Yes! 10am, I'll send the tickets here.")
  await expect(thread(sheet).getByRole("heading", { name: "Comments · 2" })).toBeVisible()
  // newest at the bottom
  await expect(thread(sheet).locator("[data-comment]").last()).toContainText("10am")
  await brandChecks(page, { marigold: "none" }) // her own open request: no decision for her, [Done] is secondary
  await axe(page)
  if (info.project.name !== "desktop") {
    // the end of the thread and the composer in view
    await sheet.locator("[data-comment-form]").evaluate((el) => el.scrollIntoView({ block: "end" }))
    await page.screenshot({ path: `${SCREENS}comments-${info.project.name === "mobile-night" ? "night" : "day"}.png` })
  }
  await page.keyboard.press("Escape")

  // Sam deletes his own: "Comment removed" keeps its place, the count drops
  await becomePerson(page, "sam")
  await page.goto("/requests")
  await page.locator("[data-request-card]").first().getByRole("button", { name: /^Maya asks for \$300 for tickets/ }).click()
  sheet = await openedSheet(page, "Maya asks for $300")
  await expect(thread(sheet).locator("[data-comment]")).toHaveCount(2)
  const del = thread(sheet).getByRole("button", { name: /^Delete your comment from/ })
  await expect(del).toHaveCount(1)
  await del.click()
  await expect(thread(sheet).locator("[data-comments-live]")).toHaveText("Comment deleted.")
  await expect(thread(sheet).locator("[data-comment-state='removed']")).toHaveText(/Comment removed/)
  await expect(thread(sheet).getByText("Is this the boat trip on Saturday?")).toHaveCount(0)
  await expect(thread(sheet).getByRole("heading", { name: "Comments · 1" })).toBeVisible()
  await expect(composer(sheet)).toBeFocused()
  await axe(page)
  await page.keyboard.press("Escape")

  // Maya sees the removal; she can't touch it
  await becomePerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: /^Maya asks for \$300 for tickets/ }).locator("visible=true").first().click()
  sheet = await openedSheet(page, "Maya asks for $300")
  const removed = thread(sheet).locator("[data-comment-state='removed']")
  await expect(removed).toContainText("Comment removed")
  await expect(removed.getByRole("button")).toHaveCount(0)
  await expect(thread(sheet).locator("[data-comment-state='sent']")).toHaveCount(1)
})

test("the seeded Porto ask: a settled request keeps its thread (Decided, with the count)", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/requests")
  const row = page.getByRole("button", { name: /^Sam's request for \$120 wasn't approved/ })
  await expect(row).toBeVisible()
  await expect(row.locator("[data-comment-count='2']")).toBeVisible()
  await row.click()
  const sheet = await openedSheet(page, "Sam asked for $120")
  await expect(sheet.getByText("Already decided")).toBeVisible()
  await expect(thread(sheet).getByRole("heading", { name: "Comments · 2" })).toBeVisible()
  await expect(thread(sheet).locator("[data-comment]").first()).toContainText("cheaper on the day")
  await expect(thread(sheet).locator("[data-comment]").last()).toContainText("Sam")
  // a decided request: nothing to decide (no marigold), the composer is still there
  await brandChecks(page, { marigold: "none" })
  // scroll to the thread, as a reader would
  await composer(sheet).evaluate((el) => el.scrollIntoView({ block: "center" }))
  await axe(page)
  await comment(sheet, "Saturday works for me 🍷")
  await expect(thread(sheet).getByRole("heading", { name: "Comments · 3" })).toBeVisible()
})

test("a failed send says 'Not sent.' and Try again posts it once", async ({ page }) => {
  await asPerson(page, "sam")
  await page.goto("/requests")
  await page.getByRole("button", { name: /^Sam's request for \$120 wasn't approved/ }).click()
  const sheet = await openedSheet(page, "Sam asked for $120")
  await page.evaluate(() => localStorage.setItem("pot.mock.fail", "comment"))
  await composer(sheet).fill("Booked for 3pm")
  await composer(sheet).press("Enter")
  await expect(thread(sheet).locator("[data-comment-state='failed']")).toContainText("Not sent.")
  await expect(thread(sheet).locator("[data-comments-live]")).toHaveText("Your comment wasn't sent. Try again.")
  await axe(page)
  await thread(sheet).getByRole("button", { name: "Try again" }).click()
  await expect(thread(sheet).locator("[data-comments-live]")).toHaveText("Comment sent.")
  await expect(thread(sheet).locator("[data-comment]", { hasText: "Booked for 3pm" })).toHaveCount(1)
  await expect(thread(sheet).locator("[data-comment-state='failed']")).toHaveCount(0)
})

test("320 px wide: the thread and the composer reflow without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one 320 px run is enough")
  await page.setViewportSize({ width: 320, height: 568 })
  await asPerson(page, "maya")
  await page.goto("/requests")
  await page.getByRole("button", { name: /^Sam's request for \$120 wasn't approved/ }).click()
  const sheet = await openedSheet(page, "Sam asked for $120")
  await composer(sheet).fill("A longer comment to see how the composer grows when someone writes more than one line of text here")
  await composer(sheet).scrollIntoViewIfNeeded()
  await expect(sheet.getByRole("button", { name: "Send" })).toBeVisible()
  const send = await sheet.getByRole("button", { name: "Send" }).boundingBox()
  expect(send!.x + send!.width).toBeLessThanOrEqual(320)
  const r = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(r).toBeLessThanOrEqual(320)
  const box = await composer(sheet).boundingBox()
  expect(box!.height).toBeGreaterThan(50) // it grew past one line
  await axe(page)
})
