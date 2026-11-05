// The group's "about $X each" (2026-11-05): saved with the Pot, so every member sees the same per-person rings; any
// member changes or removes it in Settings → People → Suggested amount.
import { expect, test } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet } from "../fixtures/pot"

test.use({ reducedMotion: "reduce" })

test("a member changes the amount each in Settings; another member sees it; removing it hides the rings", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  const strip = page.locator("[data-hero] [data-goal-each]")
  await expect(strip).toContainText("Suggested amount: $150 each")

  await page.goto("/p/lisbon-trip?tab=settings")
  const row = page.locator("[data-settings-row='goal-each']")
  await expect(row).toContainText("$150 each")
  await row.click()
  const sheet = await openedSheet(page, "Suggested amount each")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  const input = sheet.locator("[data-goal-each-input]")
  await input.fill("5")
  await expect(sheet.getByText("Anyone in the Pot can change it.")).toBeVisible()
  await input.fill("0.5")
  await expect(sheet.getByText("Enter between $1 and $100,000.")).toBeVisible()
  await expect(sheet.locator("[data-goal-each-save]")).toBeDisabled()
  await input.fill("80")
  await sheet.locator("[data-goal-each-save]").click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(row).toContainText("$80 each")

  // another member sees the same aim
  await becomePerson(page, "sam")
  await page.goto("/p/lisbon-trip")
  await expect(strip).toContainText("Suggested amount: $80 each")

  // removing it: no rings for anyone
  await page.goto("/p/lisbon-trip?tab=settings")
  await row.click()
  const again = await openedSheet(page, "Suggested amount each")
  await again.locator("[data-goal-each-remove]").click()
  await expect(row).toContainText("Off")
  await page.goto("/p/lisbon-trip")
  await expect(page.locator("[data-hero]").first()).toBeVisible()
  await expect(strip).toHaveCount(0)
})
