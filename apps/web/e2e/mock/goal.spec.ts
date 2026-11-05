// hub 1.1.0 all-or-nothing goal on the mock data source, in every project. The showcase's Festival Fund collects
// $300 of a $1,200 goal with 3 days left: spending waits (Spend says why), reaching the goal opens it, a missed date
// refunds everyone in two steps (the mock's stand-in for the server cron), and Create sets a goal with a date.
// Every screen: axe 0 serious + the brand checks; mobile projects save notes/screens/goal-*-{day,night}.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, createPot, openedSheet } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}goal-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

async function showcase(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.seed")) localStorage.setItem("pot.mock.seed", "showcase")
  })
}

test.use({ reducedMotion: "reduce" })

test("collecting: '$300 of $1,200 · 3 days left'; spending waits and says why", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "maya")
  await page.goto("/p/festival-fund")
  await expect(page.getByRole("heading", { level: 1, name: "Festival Fund" })).toBeVisible()
  const banner = page.locator("[data-goal-banner='collecting']")
  await expect(banner.locator("[data-goal-text]")).toHaveText("$300 of $1,200 · 3 days left")
  await expect(banner.getByText("Spending opens once the goal is reached.")).toBeVisible()
  await expect(banner.getByText(/^All or nothing: if we don't reach \$1,200 by .+, everyone gets their money back automatically\.$/)).toBeVisible()
  const spend = page.getByRole("button", { name: "Spend", exact: true })
  await expect(spend).toHaveAttribute("aria-disabled", "true")
  await expect(spend).toHaveAccessibleDescription("Spending opens once the goal is reached.")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "collecting", info.project.name)
  await spend.click({ force: true }) // aria-disabled still takes the tap, to say why
  await expect(page.locator("[data-sonner-toast]").getByText("Spending opens once the goal is reached.")).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // a deep link to the Spend sheet still can't ask: the preview explains, the button is off
  await page.goto("/p/festival-fund?sheet=spend")
  const sheet = await openedSheet(page, "Spend from Festival Fund")
  await expect(sheet.locator("[data-rule-preview='blocked']")).toContainText("Spending opens once the goal is reached")
  await expect(sheet.locator("[data-rule-preview='blocked']")).toContainText("$300 of $1,200 collected so far.")
  await expect(sheet.getByRole("button", { name: "Spending opens once the goal is reached." })).toBeDisabled()
  await axe(page)

  // the Rules tab says the goal in words
  await page.goto("/p/festival-fund?tab=rules")
  await expect(page.locator("[data-rules-list]")).toContainText(/All or nothing: if the Pot doesn't reach \$1,200 by .+, everyone gets their money back automatically\./)
})

test("reached: Sam adds the rest → 'Goal reached', spending opens", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "sam")
  await page.goto("/p/festival-fund?sheet=add&amount=900")
  const add = await openedSheet(page, "Add money to Festival Fund")
  await add.getByRole("button", { name: "Add $900" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  const reached = page.locator("[data-goal-banner='reached']")
  await expect(reached).toContainText("Goal reached", { timeout: 10_000 })
  await expect(reached).toContainText("$1,200 collected. Spending is open.")
  await expect(page.locator("[data-feed]").getByText("Goal reached: $1,200 collected")).toBeVisible()
  const spend = page.getByRole("button", { name: "Spend", exact: true })
  await expect(spend).not.toHaveAttribute("aria-disabled", "true")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "reached", info.project.name)
})

test("missed: 'Refunding everyone…' → 'Everyone got their money back'; the Pot is closed and money in is refused", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "leo")
  await page.goto("/pots")
  // the goal date passes (a mock world edit), then the mock cron refunds in its two steps
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem("pot.mock.world.v1")!)
    w.pots["festival-fund"].extras.goal.deadline = Date.now() - 60_000
    localStorage.setItem("pot.mock.world.v1", JSON.stringify(w))
  })
  await page.goto("/p/festival-fund")
  const refunding = page.locator("[data-goal-banner='refunding'], [data-goal-banner='refundable']")
  await expect(refunding).toContainText("Refunding everyone…")
  await expect(refunding).toContainText(/Festival Fund didn't reach \$1,200 by .+\. Everyone gets back exactly what they put in\./)
  await axe(page)
  await shot(page, "refunding", info.project.name)
  const refunded = page.locator("[data-goal-banner='refunded']")
  await expect(refunded).toContainText("Everyone got their money back", { timeout: 10_000 })
  await expect(page.locator("[data-pot-closed]")).toBeVisible()
  await expect(page.locator("[data-pot-closed]")).toContainText("$150.00") // Leo put in $150, gets $150 back
  await expect(page.locator("[data-feed]").getByText("The goal wasn't reached. Everyone got their money back.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Add money" })).toHaveCount(0)
  await brandChecks(page, { marigold: "at-most-one" })
  await axe(page)
  await shot(page, "refunded", info.project.name)

  // Maya sees the same, with her own $150 back
  await becomePerson(page, "maya")
  await page.goto("/p/festival-fund?tab=members")
  if (info.project.name !== "desktop") await expect(page.locator('[data-member="maya"]').locator("visible=true")).toContainText("$150.00")
})

test("Create → [Change]: trust and one OK on by default; a goal with a date, all or nothing → the Pot collects", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/pots")
  await page.getByRole("button", { name: "Start a Pot" }).first().click()
  await openedSheet(page, "Start a Pot")
  // the goal is set up in the full rules ([Change]), never on the one Create screen
  await expect(page.getByRole("dialog").getByRole("switch", { name: "Set a goal (optional)" })).toHaveCount(0)
  await createPot(page, { name: "Cabin Fund", submit: false, rules: async () => {} })
  const step2 = await openedSheet(page, "Pot rules")
  await expect(step2.getByRole("switch", { name: "Trust grows" })).toHaveAttribute("aria-checked", "true")
  await expect(step2.getByText("People who spend well get a bigger instant limit.")).toBeVisible()
  const oneOk = step2.getByRole("textbox", { name: "Spends up to this much need just one OK from someone else who has added money" })
  await expect(oneOk).toHaveValue("300")
  // the one-OK ceiling follows the instant limit until it's typed
  await step2.getByRole("textbox", { name: "Anyone can spend up to this much at a time without asking" }).fill("50")
  await expect(oneOk).toHaveValue("150")
  await oneOk.fill("40")
  await expect(step2.getByText("Make this at least $50, the instant limit, or $0 to turn it off.")).toBeVisible()
  await oneOk.fill("200")
  // the goal
  const goal = step2.getByRole("switch", { name: "Set a goal (optional)" })
  await expect(goal).toHaveAttribute("aria-checked", "false")
  await goal.click()
  await step2.getByRole("textbox", { name: "Goal amount" }).fill("1200")
  await expect(step2.getByLabel("Goal date")).not.toHaveValue("")
  await expect(step2.getByRole("switch", { name: "All or nothing" })).toHaveAttribute("aria-checked", "true")
  await expect(step2.getByText("If we don't reach it, everyone gets their money back automatically.")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await step2.locator("[data-rule='target']").scrollIntoViewIfNeeded()
  await shot(page, "create", info.project.name)
  await step2.getByRole("button", { name: "Create Pot" }).click()
  await expect(page).toHaveURL(/\/p\/cabin-fund-[a-z0-9]{4}\?sheet=share$/, { timeout: 10_000 })
  await openedSheet(page, "Invite friends to Cabin Fund")
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
  await expect(page.locator("[data-goal-banner='collecting'] [data-goal-text]")).toHaveText(/^\$0 of \$1,200 · 1[34] days left$/)
  await page.goto(`${new URL(page.url()).pathname}?tab=rules`)
  const rules = page.locator("[data-rules-list]")
  await expect(rules).toContainText("Anyone can spend up to $50 without asking.")
  await expect(rules).toContainText("Trust grows: every 3 paid spends raise someone's instant limit by $50, up to $150.")
  await expect(rules).toContainText("Spends up to $200 need just one OK from someone else who has added money.")
  await expect(rules).toContainText(/All or nothing: if the Pot doesn't reach \$1,200 by/)
  await axe(page)
})
