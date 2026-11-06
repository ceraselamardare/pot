// Brand avatars (brand/avatars/README.md) on the mock data source: pick one in You → Profile, see it everywhere the
// person appears (You, Pot seats, feed, Members, Requests, the Approve sheet), for everyone on the phone, then go back
// to initials. axe 0 serious, no marigold on You (the picker saves itself), and every text on an avatar (initials on
// the member colours) passes 4.5:1. The mobile projects save review screenshots to notes/screens/avatars-*.png.
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, spendFlow } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
test.use({ reducedMotion: "reduce" })

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForFunction(() => [...document.images].every((i) => i.complete))
  await page.screenshot({ path: `${SCREENS}avatars-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

/** Pick an avatar in You → Profile and wait for "Saved". */
async function pick(page: Page, name: string) {
  const picker = page.getByRole("group", { name: "Avatar" })
  await picker.getByRole("radio", { name, exact: true }).locator("xpath=ancestor::label[1]").click() // the 48 px tile
  await expect(picker.getByRole("radio", { name, exact: true })).toBeChecked()
  await expect(picker.getByRole("status")).toHaveText("Saved")
}

/** WCAG contrast of every initials seat's text on its own fill. */
async function initialsContrast(page: Page): Promise<{ text: string; ratio: number }[]> {
  return page.locator('[data-avatar="initials"]').evaluateAll((els) => {
    const lum = (rgb: string) => {
      const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    return els
      .filter((e) => (e as HTMLElement).offsetParent !== null && e.textContent!.trim())
      .map((e) => {
        const s = getComputedStyle(e)
        const [a, b] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x)
        return { text: e.textContent!.trim(), ratio: (a! + 0.05) / (b! + 0.05) }
      })
  })
}

test("choose an avatar → it shows in seats, feed, Members, Requests and Approve; reset to initials", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/you")
  const picker = page.getByRole("group", { name: "Avatar" })
  await expect(picker).toBeVisible()
  // the default is initials, and the profile card shows them
  await expect(picker.getByRole("radio", { name: "Use my initials" })).toBeChecked()
  await expect(picker.getByRole("radio")).toHaveCount(11)
  // the profile card (name + the mock's "Sample profile" line), wherever it sits on You
  const profile = page.locator("main section:not([data-you-avatar])").filter({ has: page.getByText("Sample profile") })
  await expect(profile.locator('[data-avatar="initials"]')).toHaveText("M")
  // every option is at least 44 px (tap-min)
  for (const box of await picker.locator("label").evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect()))) {
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await brandChecks(page, { marigold: "none" })
  await axe(page)

  await pick(page, "Cat")
  await expect(profile.locator('[data-avatar="pot-03"] img')).toHaveAttribute("src", "/avatars/pot-03.svg")
  await axe(page)
  await shot(page, "picker", info.project.name)

  // keyboard: arrows move the choice inside the group (desktop has a real keyboard)
  if (info.project.name === "desktop") {
    await picker.getByRole("radio", { name: "Cat" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(picker.getByRole("radio", { name: "Rocket" })).toBeChecked()
    await expect(picker.getByRole("status")).toHaveText("Saved")
    await page.keyboard.press("ArrowLeft")
    await expect(picker.getByRole("radio", { name: "Cat" })).toBeChecked()
    await expect(picker.getByRole("status")).toHaveText("Saved")
  }

  // the Pot: seats, feed, Members
  await page.goto("/p/lisbon-trip")
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$450.00")
  const seats = page.locator("h1").locator("xpath=following-sibling::*[1]")
  await expect(seats.locator('[data-avatar="pot-03"]')).toHaveCount(1)
  await expect(seats.locator('[data-avatar="initials"]')).toHaveCount(2) // Sam and Leo keep their initials
  await expect(page.locator('[data-feed] [data-avatar="pot-03"]').first()).toBeVisible()
  expect((await initialsContrast(page)).filter((c) => c.ratio < 4.5)).toEqual([])
  // Members: a tab on phones, the right column on desktop
  if (info.project.name !== "desktop") await page.getByRole("tab", { name: "Members" }).click()
  await expect(page.locator('[data-member="maya"]').locator("visible=true").locator('[data-avatar="pot-03"]')).toBeVisible()
  await expect(page.locator('[data-member="sam"]').locator("visible=true").locator('[data-avatar="initials"]')).toHaveText("S")
  await brandChecks(page, { marigold: "one" })
  await axe(page)

  // a spend that needs the group, so Leo sees Maya in Requests and on the Approve sheet
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await spendFlow(page, { amount: "300", reason: "Tickets", submit: "Ask the group" })
  await expect(sheet.getByText("Sent to the group")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()

  // Sam picks one too, so the review screenshot shows a mix of pictures and initials
  await becomePerson(page, "sam")
  await page.goto("/you")
  await pick(page, "Wave")

  await becomePerson(page, "leo")
  await page.goto("/requests")
  const card = page.getByRole("button", { name: /^Maya asks for \$300 for tickets/ })
  await expect(card.locator('[data-avatar="pot-03"]')).toBeVisible()
  await card.click()
  const approve = await openedSheet(page, "Maya asks for $300")
  await expect(approve.locator('[data-avatar="pot-03"]').first()).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await page.keyboard.press("Escape")

  await page.goto("/p/lisbon-trip")
  await expect(seats.locator('[data-avatar="pot-03"]')).toHaveCount(1)
  await expect(seats.locator('[data-avatar="pot-06"]')).toHaveCount(1)
  await expect(page.locator('[data-feed] [data-avatar="pot-03"]').first()).toBeVisible()
  expect((await initialsContrast(page)).filter((c) => c.ratio < 4.5)).toEqual([])
  await axe(page)
  await shot(page, "pot", info.project.name)

  // back to initials: exactly today's seat again (member-1 for Maya, the creator)
  await becomePerson(page, "maya")
  await page.goto("/you")
  await pick(page, "Use my initials")
  await page.goto("/p/lisbon-trip")
  await expect(seats.locator('[data-avatar="pot-03"]')).toHaveCount(0)
  const maya = seats.locator('[data-avatar="initials"]').first()
  await expect(maya).toHaveText("M")
  expect(await maya.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 209, 102)") // member-1
  await expect(page.locator('[data-feed] [data-avatar="pot-03"]')).toHaveCount(0)
})

test("a failed save reverts and says nothing changed", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/you")
  await page.evaluate(() => localStorage.setItem("pot.mock.fail", "avatar"))
  const picker = page.getByRole("group", { name: "Avatar" })
  await picker.getByRole("radio", { name: "Sun" }).locator("xpath=ancestor::label[1]").click()
  await expect(page.getByText("Couldn't save your avatar. Nothing changed. Try again.")).toBeVisible()
  await expect(picker.getByRole("radio", { name: "Use my initials" })).toBeChecked()
  await page.goto("/p/lisbon-trip")
  await expect(page.locator('[data-avatar="pot-02"]')).toHaveCount(0)
})
