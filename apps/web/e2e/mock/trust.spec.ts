// hub 1.1.0 earned trust + the one-OK tier + the public Pot record on the mock data source, in every project
// (mobile Day, mobile Night, desktop). The showcase seed (lib/client/mock/wave4.ts): Ski Chalet, where Maya is
// Trusted ($200 without asking), Leo's $180 was approved by Sam's OK, and Sam's $250 lift passes wait for one OK.
// Every screen: axe 0 serious + the brand checks; mobile projects save notes/screens/trust-*-{day,night}.png.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, spendFlow, spendWhy, typeAmount } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}trust-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

/** The hub 1.1.0 showcase Pots in a fresh mock world (automated browsers get the classic seed otherwise). */
async function showcase(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pot.mock.seed")) localStorage.setItem("pot.mock.seed", "showcase")
  })
}

test.use({ reducedMotion: "reduce" })

test("Members: trust badges (icon + word) and each person's instant limit; my limit and the next level on Rules", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "maya")
  await page.goto("/p/ski-chalet?tab=members")
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet" })).toBeVisible()
  const maya = page.locator('[data-member="maya"]').locator("visible=true")
  await expect(maya.locator("[data-trust-level='1']")).toHaveText("Trusted")
  await expect(maya.locator("[data-member-up-to]")).toHaveText("Can spend up to $165 without asking") // $200, but $165 left of her $300
  await expect(page.locator('[data-member="sam"]').locator("visible=true").locator("[data-trust-level='0']")).toHaveText("New")
  await expect(page.getByRole("button", { name: "Maya (you), Trusted. Opens their activity." }).locator("visible=true")).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "members", info.project.name)

  // the person sheet says it in words
  await page.locator('[data-member="leo"]').locator("visible=true").click()
  const person = await openedSheet(page, "Leo's activity")
  await expect(person.locator("[data-person-trust]")).toContainText("Leo is New")
  await expect(person.locator("[data-person-trust]")).toContainText("Leo can spend up to $100 at a time without asking. 1 paid spend so far.")
  await axe(page)
  await page.keyboard.press("Escape")

  // Rules: what I can spend and how it grows, plus the new rule sentences
  await page.goto("/p/ski-chalet?tab=rules")
  const card = page.locator("[data-my-trust]")
  await expect(card.locator("[data-trust-up-to]")).toHaveText("You can spend up to $165 without asking")
  await expect(card.locator("[data-trust-next]")).toHaveText("3 more paid spends to $300")
  const rules = page.locator("[data-rules-list]")
  await expect(rules).toContainText("Trust grows: every 3 paid spends raise someone's instant limit by $100, up to $300.")
  await expect(rules).toContainText("Spends up to $300 need just one OK from anyone else.")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "rules", info.project.name)
})

test("Spend: the preview names the tier (instant with my raised limit, one OK, the group); a one-OK ask", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "leo")
  await page.goto("/p/ski-chalet")
  await page.getByRole("button", { name: "Spend", exact: true }).click()
  const sheet = await openedSheet(page, "Spend from Ski Chalet")
  const preview = sheet.locator("[data-rule-preview]")
  await typeAmount(page, "80")
  await expect(preview).toHaveAttribute("data-tier", "instant")
  await expect(preview).toContainText("This will be approved instantly")
  const del = sheet.getByRole("button", { name: "delete", exact: true })
  for (let i = 0; i < 2; i++) await del.click()
  await typeAmount(page, "400") // over the $300 one-OK ceiling → the group
  await expect(preview).toHaveAttribute("data-tier", "group")
  await expect(preview).toContainText("This needs 2 of 3 approvals")
  for (let i = 0; i < 3; i++) await del.click()
  await typeAmount(page, "250") // over Leo's $100, under the $300 one-OK ceiling
  await expect(preview).toHaveAttribute("data-tier", "one_ok")
  await expect(preview).toContainText("This needs one OK from anyone else")
  await expect(await spendWhy(page)).toContainText("It's over your $100 instant limit.")
  await spendFlow(page, { reason: "Tickets" })
  await expect(sheet.locator("[data-rule-preview]")).toHaveAttribute("data-tier", "one_ok")
  await expect(sheet.getByRole("button", { name: "Ask for one OK" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "spend", info.project.name)
  await sheet.getByRole("button", { name: "Ask for one OK" }).click()
  await expect(sheet.getByText("Sent", { exact: true })).toBeVisible()
  await expect(sheet.getByText("One OK from anyone else in the group and it's paid.")).toBeVisible()
  await expect(sheet.getByRole("region", { name: /Approvals/ })).toHaveCount(0) // no k-of-n timeline for one OK
  await brandChecks(page, { marigold: "one" })
  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.locator("[data-feed]").getByText("Needs one OK").first()).toBeVisible()
})

test("One OK: the requester waits; Leo gives the OK; it's paid and the feed says whose OK it was", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "sam")
  // Sam (the requester) can't OK his own lift passes
  await page.goto("/p/ski-chalet?r=105")
  const own = await openedSheet(page, "Sam asks for $250")
  await expect(own.locator("[data-approve-status]")).toContainText("Waiting for one OK")
  await expect(own.locator("[data-approve-status]")).toContainText("Anyone else in the group can OK it.")
  await expect(page.locator("[data-ok-cta]")).toHaveCount(0)
  await axe(page)
  await page.keyboard.press("Escape")

  await becomePerson(page, "leo")
  await page.goto("/p/ski-chalet")
  const card = page.locator('[data-request-card="105"]').locator("visible=true")
  await expect(card.getByText("Needs one OK")).toBeVisible()
  await expect(card.getByRole("button", { name: "OK $250" })).toBeVisible()
  await card.getByRole("button", { name: /Sam asks for \$250/ }).click()
  const sheet = await openedSheet(page, "Sam asks for $250")
  await expect(sheet.getByText("Needs one OK from anyone in the group. It's over Sam's instant limit.")).toBeVisible()
  await expect(sheet.locator("[data-one-ok]")).toContainText("One OK needed")
  await expect(sheet.locator("[data-one-ok]")).toContainText("Anyone in Ski Chalet except Sam can give it.")
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "approve", info.project.name)
  await page.locator("[data-ok-cta]").click()
  await expect(sheet.locator("[data-approve-status]")).toContainText("Done. Your OK sent $250 to Sam.")
  await page.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.locator("[data-feed]").getByRole("button", { name: /Approved by Leo's OK/ }).first()).toBeVisible()
  await expect(page.locator("[data-feed] [data-status='approved']", { hasText: "One OK" }).first()).toBeVisible()

  // Sam sees how it was approved
  await becomePerson(page, "sam")
  await page.goto("/p/ski-chalet?r=105")
  const done = await openedSheet(page, "Sam asked for $250") // decided: the details sheet says "asked"
  await expect(done.locator("[data-approve-status]")).toContainText("Approved by Leo's OK")
  await axe(page)
})

test("After a no, one OK can't approve it: the group decides", async ({ page }) => {
  await showcase(page)
  await asPerson(page, "maya")
  await page.goto("/p/ski-chalet?r=105")
  const sheet = await openedSheet(page, "Sam asks for $250")
  await sheet.page().getByRole("button", { name: "Decline" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Decline" }).first().click()
  await expect(sheet.locator("[data-approve-status]")).toContainText("Declined.")
  await page.keyboard.press("Escape")
  await becomePerson(page, "leo")
  await page.goto("/p/ski-chalet?r=105")
  const leo = await openedSheet(page, "Sam asks for $250")
  await expect(leo.locator("[data-approve-status]")).toContainText("Someone said no first")
  await expect(page.locator("[data-ok-cta]")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Approve $250" })).toBeVisible()
  await axe(page)
})

test("The public Pot record: every spend, how it was approved, a CSV of the same rows; readable signed out", async ({ page }, info) => {
  await showcase(page)
  await asPerson(page, "maya")
  await page.goto("/p/ski-chalet?tab=rules")
  await page.locator("[data-record-link]").click()
  await expect(page).toHaveURL(/\/p\/ski-chalet\/record$/)
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet: every spend" })).toBeVisible()
  await expect(page.locator("[data-record-totals]")).toHaveText("5 spends · $315 paid out")
  const rows = info.project.name === "desktop" ? page.locator("[data-record-table] tbody tr") : page.locator("[data-record-list] > li")
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(0)).toContainText("Lift passes")
  await expect(rows.nth(0)).toContainText("Waiting")
  await expect(rows.nth(1)).toContainText("One OK by Sam")
  await expect(rows.nth(1)).toContainText("Paid")
  await expect(rows.nth(4)).toContainText("By the Pot's rules")
  await brandChecks(page, { marigold: "none" })
  await axe(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, "record", info.project.name)

  // the CSV: the same rows, accountant-readable
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-record-csv]").click()])
  expect(download.suggestedFilename()).toMatch(/^ski-chalet-record-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = await (await download.createReadStream()).toArray().then((b) => Buffer.concat(b).toString("utf8"))
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n")
  expect(lines[0]).toBe("Date,Pot,Person,Amount (USD),Reason,Approved how,Status,Receipt URL")
  expect(lines).toHaveLength(6)
  expect(lines[4]).toMatch(/^\d{4}-\d{2}-\d{2},Ski Chalet,Leo,180\.00,Chalet deposit,One OK by Sam,Paid,https:\/\/testnet\.nearblocks\.io\/txns\/[1-9A-HJ-NP-Za-km-z]{43,44}$/)

  // Share, QR first: the record's link as a QR, [Share link] (the sheet's one marigold) and [Copy link]
  await page.locator("[data-record-share]").click()
  const shareRec = await openedSheet(page, "Share Ski Chalet's record")
  await expect(shareRec.getByRole("img", { name: "QR code for the record of Ski Chalet" })).toBeVisible()
  await expect(shareRec.locator("[data-record-url]")).toHaveAttribute("data-record-url", /\/p\/ski-chalet\/record$/)
  await expect(shareRec.getByRole("button", { name: "Copy link" })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shareRec.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()

  // signed out: the same page, read-only (no way back into the Pot)
  // (an unknown person reads as signed out; removing the key would let asPerson's init script sign Maya back in)
  await page.evaluate(() => localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "nobody", kind: "mock" })))
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "Ski Chalet: every spend" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Open Ski Chalet" })).toHaveCount(0)
  await expect(page.getByText("Only members see names from the group and notes.")).toBeVisible()
  await axe(page)
})

test("320 px: members, the record and the one-OK sheet fit without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "one width check is enough")
  await showcase(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await asPerson(page, "leo")
  for (const url of ["/p/ski-chalet?tab=members", "/p/ski-chalet?tab=rules", "/p/ski-chalet/record", "/p/ski-chalet?r=105"]) {
    await page.goto(url)
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, url).toBeLessThanOrEqual(0)
  }
  await axe(page)
})
