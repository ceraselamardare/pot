// First-run onboarding (components/onboarding; notes/frontend.md "Onboarding"), on the mock data source in every
// project (mobile Day, mobile Night, desktop). This spec starts WITHOUT the "intro done" flag every other spec gets
// (e2e/fixtures/onboarding.ts):
//  - first sign-in → the intro (3 screens) → "Help us make Pot better" → sent; the flag and the answers are stored;
//    a reload doesn't show it again;
//  - Skip on screen 1, and the browser's Back, both end it for good;
//  - a joiner: invite → "You're in!" → their Pot → the intro about THEIR Pot (2 questions) → back on the Pot; and when
//    they take "Add my $150 share" first, the intro waits until that sheet closes;
//  - the landing's "Start a Pot" right after signing in: the intro first, then the Create sheet;
//  - You → "See the intro again" replays it with the earlier answers filled in, and never touches the flag;
//  - 320 px (mobile-day).
// Every screen: axe 0 serious + the brand checks (one marigold); mobile projects save
// notes/screens/onboarding-*-{day,night}.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { NO_STATE, ONBOARDING_KEY } from "../fixtures/onboarding"
import { asPerson, axe, brandChecks, openedSheet, PORTO_INVITE_URL } from "../fixtures/pot"

test.use({ storageState: NO_STATE })

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const INTRO = "Welcome to Pot"

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SCREENS}onboarding-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

async function checks(page: Page) {
  await page.waitForTimeout(400) // each screen fades in (pot-enter, 280 ms): measure colours once it has landed
  await axe(page)
  await brandChecks(page, { marigold: "one" })
}

const flag = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as { done: boolean; survey: string; via: string } | null, ONBOARDING_KEY)
const heading = (page: Page) => page.getByRole("dialog", { name: INTRO }).locator("[data-step-heading]")

test("first sign-in: the intro, then 'Help us make Pot better' → sent; not shown twice", async ({ page }, info) => {
  await asPerson(page, "alex")
  await page.goto("/pots")
  const intro = await openedSheet(page, INTRO)
  await expect(page).toHaveURL(/\?sheet=intro$/)

  await expect(heading(page)).toHaveText("Group money with its own rules")
  // a new Pot's rules (what Create starts with): the $300 boat trip in the example needs one OK
  await expect(intro.locator("[data-onboarding-rules] li")).toHaveText(["Anyone can spend up to $100 without asking.", "Spends up to $300 need just one OK from someone else who has added money."])
  await expect(intro.locator("[data-onboarding-example] [data-status='needs']")).toHaveText("Needs one OK")
  await expect(intro.getByRole("button", { name: "Screen 1 of 3" })).toHaveAttribute("aria-current", "step")
  await checks(page)
  await shot(page, "rules", info.project.name)

  await intro.getByRole("button", { name: "Next", exact: true }).click()
  await expect(heading(page)).toHaveText("Everyone sees where it goes")
  await expect(heading(page)).toBeFocused()
  await checks(page)
  await shot(page, "see", info.project.name)

  await intro.getByRole("button", { name: "Next", exact: true }).click()
  await expect(heading(page)).toHaveText("Free, and nothing to set up")
  await checks(page)
  await shot(page, "free", info.project.name)

  await intro.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(heading(page)).toHaveText("Help us make Pot better")
  await expect(intro.getByText("Only the Pot team sees your answers. They're never shown to your groups.")).toBeVisible()
  const send = intro.getByRole("button", { name: "Send answers" })
  await expect(send).toBeDisabled()
  await intro.getByRole("button", { name: "A trip" }).click()
  await intro.getByRole("button", { name: "A club or team" }).click()
  await intro.getByRole("radio", { name: "One person pays, then chases everyone" }).click()
  await intro.getByRole("radio", { name: "A hackathon or its community" }).click()
  await checks(page)
  await shot(page, "survey", info.project.name)
  await send.click()

  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByText("Thanks! That helps a lot.")).toBeVisible()
  await expect(page).toHaveURL(/\/pots$/)
  expect(await flag(page)).toMatchObject({ done: true, survey: "sent", via: "finished" })
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pot.mock.survey") ?? "{}") as Record<string, { answers: unknown; context: string | null }>)
  expect(saved.alex).toMatchObject({ answers: { use: ["trip", "club"], today: "fronts", heard: "hackathon" }, context: "other" })

  // once per browser
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible()
  await page.waitForTimeout(900)
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("Skip on the first screen ends it for good; so does the browser's Back", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/pots")
  const intro = await openedSheet(page, INTRO)
  await intro.getByRole("button", { name: "Skip the intro" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await flag(page)).toMatchObject({ done: true, survey: "skipped", via: "skipped" })
  await page.reload()
  await page.waitForTimeout(900)
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // a fresh browser: Back closes it, and it counts as seen
  await page.evaluate((k) => localStorage.removeItem(k), ONBOARDING_KEY)
  await page.goto("/requests")
  await openedSheet(page, INTRO)
  await page.goBack()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page).toHaveURL(/\/requests$/)
  expect(await flag(page)).toMatchObject({ done: true, via: "closed" })
})

test("a joiner: You're in! → their Pot → the intro about it → back on the Pot", async ({ page }, info) => {
  await page.goto(PORTO_INVITE_URL)
  await page.getByRole("button", { name: "Join with Google" }).click()
  const youreIn = page.getByRole("dialog", { name: "You're in!" })
  await expect(youreIn).toBeVisible({ timeout: 10_000 })
  // never before or during joining
  await expect(page.getByRole("dialog", { name: INTRO })).toHaveCount(0)
  await youreIn.getByRole("button", { name: "Not now" }).click()
  await expect(page).toHaveURL(/\/p\/porto-weekend/)

  const intro = await openedSheet(page, INTRO)
  await expect(intro.locator("[data-onboarding-variant='joined']")).toBeAttached()
  await expect(heading(page)).toHaveText("Welcome to Porto Weekend")
  await expect(intro.getByText("Its money follows the group's rules: small spends go through on their own, bigger ones wait for the group's OK.")).toBeVisible()
  await checks(page)
  await shot(page, "joined", info.project.name)

  for (let i = 0; i < 3; i++) await intro.locator("[data-onboarding-next]").click()
  await expect(heading(page)).toHaveText("Help us make Pot better")
  await expect(intro.getByText("2 quick questions. Your answers help us decide what to build next.")).toBeVisible()
  await expect(intro.getByRole("radiogroup", { name: /How did you first hear about Pot/ })).toHaveCount(0)
  await intro.getByRole("button", { name: "Friends' plans and gifts" }).click()
  await intro.getByRole("button", { name: "Send answers" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page).toHaveURL(/\/p\/porto-weekend$/)
  await expect(page.getByRole("heading", { level: 1, name: "Porto Weekend" })).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pot.mock.survey") ?? "{}") as Record<string, { context: string | null }>)
  expect(saved.leo).toMatchObject({ answers: { use: ["plans"] }, context: "joined" })
})

test("a joiner who adds their share first: the intro waits for the Add money sheet to close", async ({ page }) => {
  await page.goto(PORTO_INVITE_URL)
  await page.getByRole("button", { name: "Join with Google" }).click()
  const youreIn = page.getByRole("dialog", { name: "You're in!" })
  await expect(youreIn).toBeVisible({ timeout: 10_000 })
  await youreIn.getByRole("button", { name: "Add my $150 share" }).click()
  const add = await openedSheet(page, "Add money to Porto Weekend")
  await page.waitForTimeout(900)
  await expect(page.getByRole("dialog", { name: INTRO })).toHaveCount(0)
  await add.getByRole("button", { name: "Add $150" }).click()
  await expect(page.getByRole("dialog", { name: "Add money to Porto Weekend" })).toHaveCount(0)
  const intro = await openedSheet(page, INTRO)
  await expect(heading(page)).toHaveText("Welcome to Porto Weekend")
  await intro.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page).toHaveURL(/\/p\/porto-weekend$/)
  expect(await flag(page)).toMatchObject({ done: true, via: "closed" })
})

test("the landing's Start a Pot right after signing in: the intro first, then Create", async ({ page }) => {
  await asPerson(page, "alex")
  // record every dialog that ever opens, so a Create sheet flashing under the intro is caught
  await page.addInitScript(() => {
    const w = window as unknown as { dialogs: string[] }
    w.dialogs = []
    new MutationObserver(() => {
      for (const d of document.querySelectorAll('[role="dialog"]')) {
        const name = d.getAttribute("aria-label") ?? document.getElementById(d.getAttribute("aria-labelledby") ?? "")?.textContent ?? ""
        if (name && !w.dialogs.includes(name)) w.dialogs.push(name)
      }
    }).observe(document, { subtree: true, childList: true })
  })
  await page.goto("/pots?sheet=create")
  const intro = await openedSheet(page, INTRO)
  await expect(page).toHaveURL(/sheet=intro&then=create/)
  // one after another: Create never opened together with the intro
  expect(await page.evaluate(() => (window as unknown as { dialogs: string[] }).dialogs)).not.toContain("Start a Pot")
  await expect(page.getByRole("dialog", { name: "Start a Pot" })).toHaveCount(0)
  await intro.getByRole("button", { name: "Skip the intro" }).click()
  await openedSheet(page, "Start a Pot")
  await expect(page).toHaveURL(/\/pots\?sheet=create$/)
  await brandChecks(page, { marigold: "one" })
})

test("You → See the intro again: a replay with earlier answers filled in; the flag stays", async ({ page }) => {
  await asPerson(page, "maya")
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.onboarding.v1")) localStorage.setItem("pot.onboarding.v1", JSON.stringify({ done: true, at: 1, survey: "sent", via: "finished" }))
    if (!localStorage.getItem("pot.mock.survey"))
      localStorage.setItem("pot.mock.survey", JSON.stringify({ maya: { version: 1, answers: { use: ["home"], today: "split_app" }, context: "other", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" } }))
  })
  await page.goto("/you")
  await page.waitForTimeout(900)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: /See the intro again/ }).click()
  const intro = await openedSheet(page, INTRO)
  await expect(heading(page)).toHaveText("Group money with its own rules")
  await intro.getByRole("button", { name: "Screen 3 of 3" }).click()
  await intro.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(intro.getByText("Your earlier answers are filled in. Change any of them and send again.")).toBeVisible()
  await expect(intro.getByRole("button", { name: "Housemates and bills" })).toHaveAttribute("aria-pressed", "true")
  await expect(intro.getByRole("radio", { name: "An app like Splitwise or Tricount" })).toHaveAttribute("aria-checked", "true")
  await intro.getByRole("radio", { name: "Cash" }).click()
  await intro.getByRole("button", { name: "Send answers" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page).toHaveURL(/\/you$/)
  expect(await flag(page)).toMatchObject({ at: 1, via: "finished" })
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pot.mock.survey") ?? "{}") as Record<string, { answers: unknown }>)
  expect(saved.maya!.answers).toEqual({ use: ["home"], today: "cash" })
})

test("320 px: every screen fits, no sideways scroll, axe clean", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "320 px runs once")
  await page.setViewportSize({ width: 320, height: 640 })
  await asPerson(page, "alex")
  await page.goto("/pots")
  const intro = await openedSheet(page, INTRO)
  for (let i = 0; i < 4; i++) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    const box = await intro.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(320)
    await checks(page)
    if (i < 3) await intro.locator("[data-onboarding-next]").click()
  }
  await expect(heading(page)).toHaveText("Help us make Pot better")
})

test("keyboard: the dots and Next work from the keyboard; Esc closes it (desktop)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard path on desktop")
  await asPerson(page, "maya")
  await page.goto("/pots")
  const intro = await openedSheet(page, INTRO)
  // focus opens on the dialog's title; the dots sit just before it
  await page.keyboard.press("Shift+Tab")
  await expect(intro.getByRole("button", { name: "Screen 3 of 3" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(heading(page)).toHaveText("Free, and nothing to set up")
  await expect(heading(page)).toBeFocused()
  const cont = intro.getByRole("button", { name: "Continue", exact: true })
  for (let i = 0; i < 4 && !(await cont.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
  await expect(cont).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(heading(page)).toHaveText("Help us make Pot better")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await flag(page)).toMatchObject({ done: true, via: "closed" })
})
