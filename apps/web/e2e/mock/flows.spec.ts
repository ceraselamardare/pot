// The big flows end to end on the mock data source (test-plan M-01, M-02, M-03, M-04/05, M-06), in every
// Playwright project: mobile Day, mobile Night (390×844) and desktop (1280×800, the bp-lg two-column Pot).
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"
import { asPerson, becomePerson, brandChecks, openedSheet, PORTO_INVITE_URL, typeAmount } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))

test("(a) invite landing → join → You're in → add $150 → the balance updates", async ({ page }) => {
  await page.goto(PORTO_INVITE_URL)
  // the Pot before login (SSR)
  await expect(page.getByRole("heading", { level: 1, name: "Maya invited you to Porto Weekend" })).toBeVisible()
  await expect(page.getByText("Maya and Sam are in")).toBeVisible()
  await expect(page.locator("[data-money]").first()).toHaveText("$300.00")
  await expect(page.getByText("$300 of $450 collected")).toBeVisible()
  await brandChecks(page, { marigold: "one" })

  // tap 2: Join with Google (the mock signs in without a popup)
  await page.getByRole("button", { name: "Join with Google" }).click()
  await expect(page.getByText("Setting up your Pot account…")).toBeVisible()
  await expect(page.getByText("Joining Porto Weekend…")).toBeVisible()
  const youreIn = page.getByRole("dialog", { name: "You're in!" })
  await expect(youreIn).toBeVisible({ timeout: 10_000 })
  await expect(youreIn.getByText("Welcome to Porto Weekend. Everyone's chipping in $150.")).toBeVisible()
  await expect(page.getByRole("heading", { name: "You're in!" })).toBeFocused()
  // the #secret is stripped from the URL after the join
  expect(new URL(page.url()).hash).toBe("")

  // tap 3: Add my $150 share → the Add sheet, prefilled
  await youreIn.getByRole("button", { name: "Add my $150 share" }).click()
  await expect(page).toHaveURL(/\/p\/porto-weekend\?sheet=add&amount=150/)
  const add = await openedSheet(page, "Add money to Porto Weekend")
  await expect(add.locator("[data-amount-display]")).toHaveText("$150")
  await expect(add.getByText("Porto Weekend will have $450.00. Goal reached.")).toBeVisible()
  await expect(add.getByRole("radio", { name: /Demo dollars \(test money\)/ })).toHaveAttribute("aria-checked", "true")
  await brandChecks(page, { marigold: "one" })

  // tap 4: Add $150 → the sheet closes at once, "+$150 on the way", then the hero updates
  await add.getByRole("button", { name: "Add $150" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByText("+$150 on the way")).toBeVisible()
  await expect(page.getByText("Adding $150…")).toBeVisible()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$450.00", { timeout: 10_000 })
  await expect(page.getByText("Added. Porto Weekend now has $450.00.")).toBeVisible()
  await expect(page.getByText("$450 of $450 collected")).toBeVisible()
  await expect(page.getByText("Leo added $150").first()).toBeVisible()
})

test("(b) instant spend $84 → Checking Pot rules ≥ 1.2 s → the burst → feed shows Approved by Pot rules", async ({ page }, info) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeVisible()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$450.00")

  await page.getByRole("button", { name: "Spend" }).click()
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await typeAmount(page, "84")
  await expect(sheet.getByText("This will be approved instantly")).toBeVisible()
  await sheet.getByRole("button", { name: /Groceries/ }).click()
  await brandChecks(page, { marigold: "one" })

  // record the beats in the page, so a busy CI machine can't miss the 400-600 ms states between polls
  await page.evaluate(() => {
    const w = window as unknown as { beats: string[]; burst: number }
    w.beats = []
    w.burst = 0
    new MutationObserver(() => {
      const tag = document.querySelector("[data-spend-result]")?.getAttribute("data-spend-result")
      if (tag && w.beats[w.beats.length - 1] !== tag) w.beats.push(tag)
      w.burst = Math.max(w.burst, document.querySelectorAll("[data-celebration] .pot-particle").length)
    }).observe(document.body, { subtree: true, childList: true, attributes: true })
  })
  await sheet.getByRole("button", { name: "Get $84 back" }).click()
  const checking = sheet.getByText("Checking Pot rules…")
  await expect(checking).toBeVisible()
  const t0 = Date.now()
  const approved = sheet.locator("[data-capsule]").getByText("Approved by Pot rules")
  await expect(approved).toBeVisible()
  expect(Date.now() - t0, "the rules beat lasts at least 1.2 s").toBeGreaterThanOrEqual(1050)
  await expect(sheet.getByText("$84 sent to you")).toBeVisible()
  const { beats, burst } = await page.evaluate(() => { const w = window as unknown as { beats: string[]; burst: number }; return { beats: w.beats, burst: w.burst } })
  expect(beats).toEqual(["checking", "approved", "sending", "sent"])
  // the one 600 ms marigold burst, for the requester only (none under reduced motion: see states.spec)
  expect(burst).toBe(12)
  await expect(sheet.locator("[data-celebration]")).toHaveCount(0)
  await expect(page.locator("[data-live-region]")).toHaveText(/Approved by Pot rules\. \$84 sent to you\./)
  if (info.project.name !== "desktop") await page.screenshot({ path: `${SCREENS}${info.project.name === "mobile-night" ? "night" : "day"}-instant-approval.png` })

  await sheet.getByRole("button", { name: "Done" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  const row = page.locator("[data-feed] li", { hasText: "Maya got $84 back for groceries" })
  await expect(row).toBeVisible()
  await expect(row.getByText("Approved by Pot rules")).toBeVisible()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$366.00")
})

test("(c) $300 → needs 2 of 3 → switch to Leo → approve → executed", async ({ page }) => {
  await asPerson(page, "maya")
  await page.goto("/p/lisbon-trip")
  await page.getByRole("button", { name: "Spend" }).click()
  const sheet = await openedSheet(page, "Spend from Lisbon Trip")
  await typeAmount(page, "300")
  await expect(sheet.getByText("This needs 2 of 3 approvals")).toBeVisible()
  await expect(sheet.getByText("It's over the $100 instant limit.")).toBeVisible()
  await sheet.getByRole("button", { name: /Tickets/ }).click()
  await sheet.getByRole("button", { name: "Ask the group" }).click()
  await expect(sheet.getByText("Sent to the group")).toBeVisible()
  await expect(sheet.getByText("Approvals · 1 of 2")).toBeVisible()
  await sheet.getByRole("button", { name: "Done" }).click()

  // Leo, on the same phone
  await becomePerson(page, "leo")
  // the Requests badge counts what waits on Leo (ink, not red)
  const requestsLink = page.getByRole("link", { name: "Requests, 1 request waiting on you" }).locator("visible=true")
  await expect(requestsLink).toBeVisible()
  const badge = requestsLink.locator("[data-badge]")
  await expect(badge).toHaveText("1")
  expect(await badge.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgb(192, 55, 60)")
  await requestsLink.click()
  await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible()
  await brandChecks(page, { marigold: "none" })

  await page.getByRole("button", { name: /^Maya asks for \$300 for tickets/ }).click()
  const approve = await openedSheet(page, "Maya asks for $300")
  await expect(approve.getByText("Needs approval because it's over the $100 instant limit.")).toBeVisible()
  await expect(approve.getByText("Maya · asked, approval counted")).toBeVisible()
  await expect(approve.getByText("$150.00")).toBeVisible() // Pot after this
  await brandChecks(page, { marigold: "one" })
  await approve.getByRole("button", { name: "Approve $300" }).click()
  await expect(approve.getByText("Approved! $300 is on its way to Maya.")).toBeVisible()
  await expect(approve.locator("[data-celebration]")).toHaveCount(0) // group approvals get no burst
  await approve.getByRole("button", { name: "Done" }).click()

  await page.goto("/p/lisbon-trip")
  const row = page.locator("[data-feed] li", { hasText: "$300 sent to Maya for tickets" })
  await expect(row).toBeVisible()
  await expect(row.getByText("Approved by Maya and Leo")).toBeVisible()
  await expect(page.locator("[data-hero] [data-money]")).toHaveText("$150.00")
})

test("(d) Create Pot → the share link", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await asPerson(page, "maya")
  await page.goto("/pots")
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible()
  await page.getByRole("button", { name: "Start a Pot" }).first().click()
  const step1 = await openedSheet(page, "Name your Pot")
  await brandChecks(page, { marigold: "one" })
  await step1.getByRole("button", { name: "Next" }).click()
  await expect(step1.getByText("Use 2–40 letters, numbers or spaces.")).toBeVisible()
  await step1.getByRole("textbox", { name: /Pot name/ }).fill("Ski Weekend")
  await step1.getByRole("radio", { name: "🎿" }).click()
  await expect(step1.getByText("Ski Weekend").first()).toBeVisible() // the live preview
  await step1.getByRole("button", { name: "Next" }).click()
  const step2 = await openedSheet(page, "How should it work?")
  await expect(step2.getByRole("switch", { name: "Everyone chips in (optional)" })).toHaveAttribute("aria-checked", "true")
  await step2.getByRole("button", { name: "Create Pot" }).click()
  await expect(page.getByText("Free: we cover the setup.")).toBeVisible()

  await expect(page).toHaveURL(/\/p\/ski-weekend-[a-z0-9]{4}\?sheet=share$/, { timeout: 10_000 })
  const share = await openedSheet(page, "Invite friends to Ski Weekend")
  const link = share.locator("[data-invite-link]")
  await expect(link).toHaveText(/\/j\/ski-weekend-[a-z0-9]{4}\?i=[1-9A-HJ-NP-Za-km-z]{43,44}#[A-Za-z0-9_-]{43}$/)
  await expect(share.getByText(/Link works until .+ · 10 more people can join with it/)).toBeVisible()
  await expect(share.getByText("Share it only in your group chat.", { exact: false })).toBeVisible()
  await brandChecks(page, { marigold: "one" })
  await share.getByRole("button", { name: "Copy link" }).click()
  await expect(share.getByRole("button", { name: "Link copied" })).toBeVisible()
  if (browserName === "chromium") expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await link.textContent())
  await share.getByRole("button", { name: "Show QR code" }).click()
  await expect(share.getByRole("img", { name: "QR code for the invite link to Ski Weekend" })).toBeVisible()

  // close: Back to the new Pot, where the creator's empty feed invites friends
  await share.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByRole("heading", { level: 1, name: "Ski Weekend" })).toBeVisible()
  await expect(page.getByText("Nothing here yet")).toBeVisible()
})
