// Every screen and open sheet, in Day, Night and desktop: axe 0 serious (M-13), at most one marigold button and
// exactly one where the screen has a primary action, marigold never text (M-20), tabular figures (M-22).
// The mobile projects also save review screenshots for Cerasela to notes/screens/.
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, createPot, openedSheet, potMore, PORTO_INVITE_URL, spendFlow } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
test.use({ reducedMotion: "reduce" })

async function check(page: Page, marigold: "one" | "at-most-one" | "none") {
  await brandChecks(page, { marigold })
  await axe(page)
}

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.screenshot({ path: `${SCREENS}${project === "mobile-night" ? "night" : "day"}-${name}.png` })
}

test("public screens: home, invite landing, demo", async ({ page }, info) => {
  await page.goto("/")
  // [Start a Pot] is in the header, the hero and the final card (07 §1): the hero's is the one marigold
  await expect(page.locator("[data-landing-hero]").getByRole("link", { name: "Start a Pot" })).toBeVisible()
  await expect(page.getByRole("region", { name: "What else a Pot can do" })).toBeAttached()
  await check(page, "one")

  await page.goto(PORTO_INVITE_URL)
  await expect(page.getByRole("button", { name: "Join with Google" })).toBeVisible()
  await check(page, "one")
  await shot(page, "invite-landing", info.project.name)

  await page.goto("/demo")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await check(page, "one")

  // the use-case pages: the hero's [Start a Pot] is the one marigold
  await page.goto("/group-trip")
  await expect(page.locator("[data-marketing-hero]").getByRole("link", { name: "Start a Pot" })).toBeVisible()
  await check(page, "one")
  await shot(page, "group-trip", info.project.name)
  for (const path of ["/bachelorette-party", "/group-gift", "/shared-account-with-friends", "/tools/group-trip-cost-calculator"]) {
    await page.goto(path)
    await expect(page.locator("[data-marketing-hero]").getByRole("link", { name: "Start a Pot" })).toBeVisible()
    await check(page, "one")
    await shot(page, path.slice(1).replaceAll("/", "-"), info.project.name)
  }
})

test("the Pot: activity, members, rules, and its sheets", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$450.00")
  await check(page, "one")
  await shot(page, "pot", info.project.name)

  if (info.project.name !== "desktop") {
    await page.getByRole("tab", { name: "Members" }).click()
    await expect(page.getByRole("heading", { name: "3 people" })).toBeVisible()
    await expect(page).toHaveURL(/tab=members/)
    await check(page, "one")
  }
  await page.getByRole("tab", { name: "Settings" }).locator("visible=true").click()
  await expect(page.getByText("Anyone can spend up to $100 without asking.")).toBeVisible()
  await expect(page.getByText("Bigger spends need 2 of 3 approvals.")).toBeVisible()
  await check(page, "one")

  for (const [button, title] of [
    ["Add money", "Add money to Lisbon Trip"],
    ["Spend", "Spend from Lisbon Trip"],
  ] as const) {
    await page.getByRole("button", { name: button, exact: true }).click()
    await openedSheet(page, title)
    await check(page, "at-most-one")
    // Back closes the sheet (URL state, §2.2)
    await page.goBack()
    await expect(page.getByRole("dialog")).toBeHidden()
  }

  const more = await potMore(page, "Lisbon Trip")
  await check(page, "none") // a list of places to go: no primary action
  await shot(page, "pot-more", info.project.name)
  await more.getByRole("button", { name: "Invite friends" }).click()
  await openedSheet(page, "Invite friends to Lisbon Trip")
  await check(page, "one")
})

test("Approve sheet, Requests and You", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Spend" }).click()
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await spendFlow(page, { amount: "300", submit: "Ask the group" })
  await expect(sheet.getByText("Sent to the group")).toBeVisible()
  await check(page, "one") // [Done]
  await sheet.getByRole("button", { name: "Done" }).click()

  await becomePerson(page, "sam")
  await expect(page.getByRole("heading", { name: "Waiting on you" }).locator("visible=true")).toBeVisible()
  await check(page, "one") // the inline Approve stays secondary: Add money is the one marigold

  await page.locator("[data-request-card]").locator("visible=true").first().getByRole("button", { name: /^Maya asks for \$300/ }).click()
  await openedSheet(page, "Maya asks for $300")
  await check(page, "one")
  await page.goBack()

  await page.goto("/requests")
  await expect(page.getByRole("heading", { level: 2, name: /Waiting on you/ })).toBeVisible()
  await check(page, "none")

  await page.goto("/you")
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toBeVisible()
  await check(page, "none")
})

test("Pots home and Create", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/pots")
  await expect(page.locator("[data-pot-card]")).toHaveCount(2)
  await check(page, "none")
  await page.getByRole("button", { name: "Start a Pot" }).first().click()
  const main = await openedSheet(page, "Start a Pot")
  await check(page, "one")
  // the lean Create screen with a name typed: review images
  await main.getByRole("textbox", { name: /Pot name/ }).fill("Lisbon Trip")
  await page.locator(":focus").blur()
  if (info.project.name !== "desktop") await page.screenshot({ path: `${SCREENS}create-lean-${info.project.name === "mobile-night" ? "night" : "day"}.png` })
  // the emoji + colour picker behind the cover
  await main.getByRole("button", { name: "Change the emoji and colour" }).click()
  await expect(main.getByRole("radiogroup", { name: "Pick a colour" })).toBeVisible()
  await check(page, "one")
})

test("signed out: the app shell offers sign-in first, the demo second", async ({ page }) => {
  await page.goto("/pots")
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to Pot" })).toBeVisible()
  // the sign-in dialog's panel inline (e2e/mock/signin.spec.ts): the marigold is sign-in, not the demo
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveAttribute("data-variant", "primary")
  await expect(page.getByRole("link", { name: "See a demo" })).toBeVisible()
  await check(page, "one")
})

test("Create → [Change]: Pot rules (defaults, $0, people I name, errors)", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/pots?sheet=create")
  await openedSheet(page, "Start a Pot")
  await createPot(page, { name: "Ski Weekend", submit: false, rules: async () => {} })
  const step2 = await openedSheet(page, "Pot rules")
  await check(page, "one")
  if (info.project.name !== "desktop") {
    // the whole form in one review image: grow the viewport to the sheet's content (still 390 wide)
    const h = await step2.evaluate((d) => Math.max(844, ...[...d.querySelectorAll("*")].map((e) => e.scrollHeight)) + 420)
    await page.setViewportSize({ width: 390, height: Math.min(h, 2400) })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SCREENS}create-rules-${info.project.name === "mobile-night" ? "night" : "day"}.png` })
    await page.setViewportSize({ width: 390, height: 844 })
  }
  // $0 at a time: the helper line
  await step2.getByRole("textbox", { name: "Anyone can spend up to this much at a time without asking" }).fill("0")
  await expect(step2.getByText("With $0, every spend needs more than half the group to approve.")).toBeVisible()
  // people I name: fields, an invalid name, the errors after [Create Pot]
  await step2.getByRole("radio", { name: "Members and people I name" }).check()
  await step2.getByRole("textbox", { name: "Person 1" }).fill("Not a name")
  await step2.getByRole("button", { name: "Add a person" }).click()
  await step2.getByRole("textbox", { name: "Person 2" }).fill("sam.near")
  await step2.getByRole("button", { name: "Create Pot" }).click()
  await expect(step2.getByText("This doesn't look like a name. Names look like sam.near.")).toBeVisible()
  await expect(step2.getByRole("textbox", { name: "Person 1" })).toBeFocused()
  await check(page, "one")
})
