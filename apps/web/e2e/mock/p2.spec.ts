// Phase-2 flows on the mock data source (F-20, F-22): a rules change asked by Maya and approved by Sam, a
// sole member's direct change, and a close end to end (busy → try again → the group approves → read-only).
// Every new sheet: axe 0 serious + the one-marigold rule + marigold never text + tabular figures.
// The mobile projects save review screenshots to notes/screens/p2-*.png (Day and Night).
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, typeAmount, type MockPerson } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}p2-${project === "mobile-night" ? "night" : "day"}-${name}.png` })
}

async function switchTo(page: Page, _from: string, to: string) {
  await becomePerson(page, to.toLowerCase() as MockPerson)
}


test.describe("rules change (P-8)", () => {
  test.use({ reducedMotion: "reduce" })

  test("Maya asks for a $50 instant limit → Sam approves → the new limit applies to new spends", async ({ page }, info) => {
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip?tab=rules")
    await expect(page.getByText("Anyone can spend up to $100 without asking.")).toBeVisible()
    await expect(page.getByText("Changes need the group's approval. They apply once 2 of 3 approve.")).toBeVisible()
    await shot(page, "rules", info.project.name)
    await page.getByRole("button", { name: "Ask the group to change a rule" }).click()

    const sheet = await openedSheet(page, "Ask the group to change a rule")
    await expect(sheet.getByRole("radio", { name: "Change the Instant limit, now $100" })).toHaveAttribute("aria-checked", "true")
    // unchanged → nothing to ask yet
    await expect(sheet.getByRole("button", { name: "Ask the group" })).toBeDisabled()
    await expect(sheet.getByText("Change an amount to ask the group.")).toBeVisible()
    await typeAmount(page, "50")
    await expect(sheet.getByText("Anyone can spend up to $50 without asking.")).toBeVisible()
    await expect(sheet.getByText("This needs 2 of 3 approvals.")).toBeVisible()
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "rules-change", info.project.name)

    await sheet.getByRole("button", { name: "Ask the group" }).click()
    await expect(sheet.getByText("Sent to the group. Your approval is counted. It needs 1 more.")).toBeVisible()
    await expect(sheet.getByText("Maya · asked, approval counted")).toBeVisible()
    await sheet.getByRole("button", { name: "Done" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()

    // only one rules change at a time: the button gives way to the waiting card
    await expect(page.getByRole("button", { name: "Ask the group to change a rule" })).toHaveCount(0)
    const pending = page.locator("[data-rules-pending]")
    await expect(pending.getByText("You asked to change a rule")).toBeVisible()
    await expect(pending.getByText("1 of 2 approvals")).toBeVisible()
    await expect(page.getByText("Anyone can spend up to $100 without asking.")).toBeVisible() // not applied yet

    await switchTo(page, "Maya", "Sam")
    await page.goto("/p/lisbon-trip")
    const card = page.locator("[data-rules-card]").locator("visible=true")
    await expect(card.getByText("Maya wants to change a rule")).toBeVisible()
    await card.getByRole("button", { name: "Review" }).click()
    const review = await openedSheet(page, "Maya wants to change a rule")
    await expect(review.locator("[data-rules-diff] .line-through")).toHaveText("Anyone can spend up to $100 without asking.")
    await expect(review.getByText("Anyone can spend up to $50 without asking.")).toBeVisible()
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "rules-review", info.project.name)
    await review.getByRole("button", { name: "Approve the change" }).click()
    await expect(review.getByText("Approved. The new rules apply from now on.")).toBeVisible()
    await review.getByRole("button", { name: "Done" }).click()

    await page.goto("/p/lisbon-trip?tab=rules")
    await expect(page.getByText("Anyone can spend up to $50 without asking.")).toBeVisible()
    await expect(page.getByText("The group changed a rule")).toHaveCount(0) // (feed line is on Activity)
    // the new limit is what the spend preview uses: $60 now needs the group
    await page.getByRole("button", { name: "Spend", exact: true }).click()
    const spend = await openedSheet(page, "Spend from Lisbon Trip")
    await typeAmount(page, "60")
    await expect(spend.getByText("This needs 2 of 3 approvals")).toBeVisible()
    await expect(spend.getByText("It's over the $50 instant limit.")).toBeVisible()
  })

  test("a sole member changes the rules directly", async ({ page }) => {
    await asPerson(page, "maya")
    await page.goto("/pots")
    // make Porto Weekend Maya's alone (mock world edit), then reload
    await page.evaluate(() => {
      const w = JSON.parse(localStorage.getItem("pot.mock.world.v1")!)
      w.pots["porto-weekend"].members = w.pots["porto-weekend"].members.slice(0, 1)
      localStorage.setItem("pot.mock.world.v1", JSON.stringify(w))
    })
    await page.goto("/p/porto-weekend?tab=rules")
    await expect(page.getByText("You're the only one here, so changes apply right away.")).toBeVisible()
    await page.getByRole("button", { name: "Change rules" }).click()
    const sheet = await openedSheet(page, "Change Porto Weekend's rules")
    await sheet.getByRole("radio", { name: /Limit per person/ }).click()
    await typeAmount(page, "300")
    await expect(sheet.getByText("Each person can spend up to $300 in total without asking.")).toBeVisible()
    await sheet.getByRole("button", { name: "Change rules" }).click()
    await expect(sheet.getByText("Rules changed. They apply to new spends from now on.")).toBeVisible()
    await sheet.getByRole("button", { name: "Done" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText("Each person can spend up to $300 in total without asking.")).toBeVisible()
  })

  test("a refused change says nothing changed (ERR_RULES_PENDING from another phone)", async ({ page }) => {
    await asPerson(page, "maya")
    await page.addInitScript(() => localStorage.setItem("pot.mock.fail", "rules_pending"))
    await page.goto("/p/lisbon-trip?tab=rules&sheet=rules")
    const sheet = await openedSheet(page, "Ask the group to change a rule")
    await typeAmount(page, "80")
    await sheet.getByRole("button", { name: "Ask the group" }).click()
    await expect(sheet.getByRole("alert")).toHaveText("A rule change is already waiting for the group.")
  })
})

test.describe("close (P-9)", () => {
  test.use({ reducedMotion: "reduce" })

  test("Maya asks → money just moved → try again → Sam approves → closed, read-only, refunds shown", async ({ page }, info) => {
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip")
    await page.getByRole("button", { name: "More options for Lisbon Trip" }).click()
    const item = page.getByRole("menuitem", { name: /Close Pot/ })
    await expect(item).toContainText("Ask the group to end it and share out what's left")
    await item.click()

    const sheet = await openedSheet(page, "Close Lisbon Trip?")
    await expect(sheet.getByText("$450.00 left · split by how much each person put in")).toBeVisible()
    const table = sheet.getByRole("table", { name: "Who gets what back" })
    await expect(table.locator('[data-refund-row="Maya"]')).toContainText("$150.00")
    await expect(table.locator("tbody tr").first()).toContainText("Maya (you)")
    await expect(table.locator("[data-refund-total]")).toHaveText("$450.00")
    await expect(sheet.getByText("Adding money and spending pause while the group decides.")).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Keep the Pot open" })).toBeVisible()
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "close", info.project.name)

    // ERR_POT_BUSY: money moved in the last minute → say so, nothing changed, offer Try again
    await page.evaluate(() => localStorage.setItem("pot.mock.fail", "close_busy"))
    await sheet.locator("[data-close-cta]").click()
    await expect(sheet.getByRole("alert")).toHaveText("Money just moved in Lisbon Trip. You can ask to close it in a minute.")
    await expect(sheet.getByRole("button", { name: "Try again" })).toBeVisible()
    await sheet.getByRole("button", { name: "Try again" }).click()
    await expect(sheet.getByText("Sent to the group. Your approval is counted. It needs 1 more.")).toBeVisible()
    await expect(sheet.getByText("Maya · asked, approval counted")).toBeVisible()
    await brandChecks(page, { marigold: "one" })
    await sheet.getByRole("button", { name: "Done" }).click()

    // closing: the lock shows before it bites
    await expect(page.locator("[data-pot-closing]")).toContainText("This Pot is closing. Adding money and spending are paused.")
    const add = page.getByRole("button", { name: "Add money" })
    await expect(add).toHaveAttribute("aria-disabled", "true")
    await add.click({ force: true })
    await expect(page.getByText("This Pot is closing. Adding money and spending are paused.").last()).toBeVisible()

    await switchTo(page, "Maya", "Sam")
    const card = page.locator("[data-close-card]").locator("visible=true")
    await expect(card).toContainText("Maya wants to close Lisbon Trip")
    await card.getByRole("button", { name: "Review" }).click()
    const vote = await openedSheet(page, "Maya wants to close Lisbon Trip")
    await expect(vote.getByText("You'd get back $150.00")).toBeVisible()
    await expect(vote.locator('[data-refund-row="Sam"]')).toContainText("Sam (you)")
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "close-approve", info.project.name)
    await vote.getByRole("button", { name: "Approve closing" }).click()

    // the calm closed moment (no burst) and the honest copy: the money is in your Pot account
    const done = page.getByRole("dialog", { name: "Pot closed" })
    await expect(done.locator("[data-close-refund]")).toHaveText("$150.00 is in your Pot account.")
    await expect(done.getByText("Taking money out of Pot isn't available yet.", { exact: false })).toBeVisible()
    await expect(done.getByRole("table", { name: "Who got what back" })).toBeVisible()
    await expect(page.locator("[data-celebration]")).toHaveCount(0)
    await expect(page.locator("[data-live-region]")).toHaveText(/Pot closed\. \$150\.00 is in your Pot account\./)
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "closed-moment", info.project.name)
    await done.getByRole("button", { name: "Done" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()

    // read-only Pot: "Closed <date>", no money buttons, the closed card, Members show what came back
    await expect(page.locator("[data-hero]")).toContainText("Closed")
    await expect(page.getByRole("button", { name: "Add money" })).toHaveCount(0)
    await expect(page.locator("[data-pot-closed]")).toContainText("$150.00 is in your Pot account.")
    await expect(page.locator("[data-feed]")).toContainText("Pot closed")
    await brandChecks(page, { marigold: "none" })
    await axe(page)
    await shot(page, "pot-closed", info.project.name)

    await switchTo(page, "Sam", "Leo")
    await expect(page.locator("[data-pot-closed]")).toContainText("$150.00 is in your Pot account.")
    await page.getByRole("button", { name: "More options for Lisbon Trip" }).click()
    await page.getByRole("menuitem", { name: "See who got what" }).click()
    const summary = await openedSheet(page, "Pot closed")
    await expect(summary.locator('[data-refund-row="Leo"]')).toContainText("$150.00")
  })

  test("deep link from a push: ?pid=<proposal> opens the close request", async ({ page }) => {
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip?sheet=close")
    const sheet = await openedSheet(page, "Close Lisbon Trip?")
    await sheet.locator("[data-close-cta]").click()
    await expect(sheet.getByText("Sent to the group. Your approval is counted. It needs 1 more.")).toBeVisible()
    await page.evaluate(() => {
      localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "leo", kind: "mock" }))
    })
    const pid = await page.evaluate(() => JSON.parse(localStorage.getItem("pot.mock.world.v1")!).pots["lisbon-trip"].close.id as number)
    await page.goto(`/p/lisbon-trip?pid=${pid}`)
    await openedSheet(page, "Maya wants to close Lisbon Trip")
    await expect(page).toHaveURL(/\?sheet=close$/)
  })
})

test("Members: Gets back is what a close would pay now, and how it's worked out", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "Members live in the right column on desktop")
  await asPerson(page, "leo")
  await page.goto("/p/lisbon-trip?tab=members")
  const row = page.getByRole("listitem", { name: /^Leo \(you\)\. Put in \$150\.00 · Share of spending \$0\.00 · Gets back \$150\.00$/ })
  await expect(row).toBeVisible()
  await page.getByRole("button", { name: "How it's worked out" }).click()
  const how = await openedSheet(page, 'How "Gets back" is worked out')
  await expect(how.getByText("Everything left in the Pot is split by how much each person put in.")).toBeVisible()
  await brandChecks(page, { marigold: "none" })
  await axe(page)
})

test("Advanced: account and Pot ids, explorer links, the On-chain rules panel (D-52)", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/you/advanced")
  await expect(page.getByRole("link", { name: "View your account on the explorer" })).toHaveAttribute("href", /\/address\/maya-4f2a\.users\.pots\.testnet$/)
  const pot = page.locator('[data-advanced-pot="lisbon-trip"]')
  await expect(pot.getByRole("link", { name: "View Lisbon Trip on the explorer" })).toBeVisible()
  await pot.getByRole("button", { name: "Show on-chain rules" }).click()
  const panel = pot.locator("[data-onchain-panel]")
  await expect(panel.getByRole("heading", { name: "On-chain rules" })).toBeVisible()
  await expect(panel).toContainText("instant_cap")
  await expect(panel).toContainText("$100.00 (100000000)")
  await expect(panel).toContainText("1/2 of members (majority) → 2/3")
  await expect(page.getByText("Trezu")).toHaveCount(0) // testnet: explorer + panel, never Trezu (D-52)
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await shot(page, "advanced", info.project.name)
})
