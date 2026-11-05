// The client fixes from the security audit of 2026-11-04 (notes/security-audit-2026-11-04.md) in the browser, on the
// mock data source, in every project (mobile Day, mobile Night, desktop):
//  - CLI-3: before anyone approves, the Approve sheet says who gets the money: a stranger's Pot-account hint with
//    "Not in this Pot" (icon + word) and the warning; a member by name with "In this Pot". axe 0 serious, one marigold.
//  - CLI-4: the public pay-in page, a pay-in link and a payment link say "Made by people who use Pot, not by Pot." and
//    can be reported; a Pot with an official-looking name can't turn its public page on, and its /give page stays off.
//  - CLI-7: the invite's #secret leaves the address bar as soon as the page has kept it, and joining still works.
import { expect, test, type Page } from "@playwright/test"
import { NO_STATE } from "../fixtures/onboarding"
import type { World } from "../../lib/client/mock/types"
import { asPerson, axe, brandChecks, openedSheet, PORTO_INVITE_URL, settingsTab } from "../fixtures/pot"

test.use({ reducedMotion: "reduce" })

const WORLD_KEY = "pot.mock.world.v1"

/** Change the mock world (edited here in Node, as another tab would write it) and reload so every screen reads it. */
async function editWorld(page: Page, edit: (w: World) => void) {
  const w = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!) as World, WORLD_KEY)
  edit(w)
  await page.evaluate(([key, json]) => localStorage.setItem(key!, json!), [WORLD_KEY, JSON.stringify(w)])
  await page.reload()
}

/** A waiting request in Porto Weekend, asked by Sam, paying `receiver`. */
const addRequest = (id: number, receiver: string) => (w: World) =>
  void w.pots["porto-weekend"]!.requests.push({
    id,
    requester: "sam",
    receiver,
    amount: 20_000,
    category: "other",
    note: "Deposit",
    path: "vote",
    reason: "recipient",
    status: "proposed",
    votes: { sam: "Approve" },
    voteAt: { sam: Date.now() },
    createdAt: Date.now(),
  })

test("CLI-3: the Approve sheet shows a stranger as 'Not in this Pot' before the decision, a member by name", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/porto-weekend")
  await editWorld(page, addRequest(99, "maya-4f2a.evil.testnet"))
  await editWorld(page, addRequest(98, "sam"))

  await page.goto("/p/porto-weekend?r=99")
  const sheet = await openedSheet(page, "Sam asks for $200")
  const who = sheet.getByRole("region", { name: "Goes to" })
  await expect(who).toHaveAttribute("data-receiver", "outsider")
  await expect(who.locator("[data-receiver-name]")).toHaveText("maya-4f2a.evil.testnet")
  await expect(who.locator("[data-receiver-badge]")).toHaveText("Not in this Pot")
  await expect(who.locator("[data-receiver-badge] svg")).toHaveCount(1)
  await expect(who).toContainText("This money would leave the group.")
  // it's on screen above the decision, not below the fold under it
  const whoBox = (await who.boundingBox())!
  const approve = sheet.getByRole("button", { name: /^Approve \$200/ })
  await expect(approve).toBeVisible()
  expect(whoBox.y).toBeLessThan((await approve.boundingBox())!.y)
  await brandChecks(page, { marigold: "one" })
  await axe(page)

  await page.goto("/p/porto-weekend?r=98")
  const member = (await openedSheet(page, "Sam asks for $200")).getByRole("region", { name: "Goes to" })
  await expect(member).toHaveAttribute("data-receiver", "member")
  await expect(member.locator("[data-receiver-name]")).toHaveText("Sam")
  await expect(member.locator("[data-receiver-badge]")).toHaveText("In this Pot")
  await expect(member.locator("[data-receiver-hint]")).toHaveCount(0)
})

test("CLI-4: public pages say who made them and can be reported", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, storageState: NO_STATE })
  const page = await ctx.newPage()
  for (const [path, kind] of [
    ["/give/lisbon-trip", "give"],
    ["/g/lisbon-trip/AAAAAAAAAAAAAAAAAAAAAA", "gift_link"],
    ["/c/lisbon-trip/1", "pay_link"],
  ] as const) {
    await page.goto(path)
    const notice = page.getByRole("complementary", { name: "About this page" })
    await expect(notice).toHaveAttribute("data-public-notice", kind)
    await expect(notice).toContainText("Made by people who use Pot, not by Pot.")
  }
  const notice = page.getByRole("complementary", { name: "About this page" })
  await notice.getByRole("button", { name: "Report this page" }).click()
  await notice.getByRole("button", { name: "It looks like a scam" }).click()
  await expect(notice.getByRole("status")).toHaveText("Thanks. We'll take a look.")
  await axe(page)
  await ctx.close()
})

test("CLI-4: a Pot with an official-looking name can't turn its public page on; /give stays off", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await editWorld(page, (w) => void (w.pots["lisbon-trip"]!.name = "NEAR Foundation"))
  const settings = await settingsTab(page)
  await settings.getByRole("button", { name: /^Public page/ }).click()
  const sheet = await openedSheet(page, "Public page")
  await expect(sheet.getByRole("switch")).toBeDisabled()
  const why = sheet.locator("[data-page-reserved='name']")
  await expect(why).toContainText("Not for this name")
  await expect(why).toContainText("can't have a public page or pay-in links")
  await brandChecks(page, { marigold: "at-most-one" })
  await axe(page)
  // a page that was on before (or turned on behind the UI's back) reads as off
  await editWorld(page, (w) => void (w.pots["lisbon-trip"]!.giftPage = { on: true, line: null, tone: "payment" }))
  await page.goto("/give/lisbon-trip")
  await expect(page.getByRole("heading", { name: /NEAR Foundation/ })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Pay \$/ })).toHaveCount(0)
})

test("CLI-7: the invite's #secret leaves the address bar at once, and joining still works", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, storageState: NO_STATE })
  const page = await ctx.newPage()
  await page.goto(PORTO_INVITE_URL)
  await expect(page.locator("[data-join-cta]")).toBeVisible()
  await expect.poll(() => new URL(page.url()).hash).toBe("")
  expect(page.url()).toContain("/j/porto-weekend?i=")
  // the page kept it for this tab: a reload still offers the join
  await page.reload()
  await expect(page.locator("[data-join-cta]")).toBeVisible()
  await ctx.close()
})
