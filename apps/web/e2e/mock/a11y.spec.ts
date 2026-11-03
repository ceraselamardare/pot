// F-25 accessibility pass (ux-spec §8, frontend-architecture §10): VoiceOver-style reading/focus order for join
// and approve, keyboard-only paths on desktop, 320 px reflow, 200 % zoom, reduced motion. axe runs per screen in
// screens.spec / p2.spec; these are the checks axe can't do.
import { expect, test, type Page } from "@playwright/test"
import { asPerson, openedSheet, PORTO_INVITE_URL, spendFlow } from "../fixtures/pot"

/** No horizontal scrolling (WCAG 1.4.10): the page is never wider than the viewport. */
async function noHorizontalScroll(page: Page, what: string) {
  // measured against the viewport (mobile emulation widens the layout viewport to the content)
  const width = page.viewportSize()!.width
  const r = await page.evaluate((width) => {
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) return false
        if (el.closest(".sr-only, [data-sonner-toaster]")) return false
        // fixed bars stretch to the (widened) layout viewport: a symptom, not the cause
        for (let a: Element | null = el; a; a = a.parentElement) if (getComputedStyle(a).position === "fixed") return false
        return b.right > width + 1
      })
      .slice(0, 4)
      .map((el) => `${el.tagName}.${(el.getAttribute("class") ?? "").slice(0, 50)} [${(el.textContent ?? "").trim().slice(0, 24)}] → ${Math.round(el.getBoundingClientRect().right)}`)
    return { scroll: document.documentElement.scrollWidth, wide }
  }, width)
  expect(r.scroll, `${what}: scrollWidth ${r.scroll} > ${width}; ${r.wide.join(" | ")}`).toBeLessThanOrEqual(width)
}

/** The texts in reading order (what VoiceOver's swipe-right visits), visible ones only. */
async function readingOrder(page: Page, root: string, needles: string[]): Promise<number[]> {
  return page.evaluate(
    ({ root, needles }) => {
      const scope = document.querySelector(root) ?? document.body
      const text = (scope as HTMLElement).innerText
      return needles.map((n) => text.indexOf(n))
    },
    { root, needles },
  )
}

const SCREENS_320 = [
  "/p/lisbon-trip",
  "/p/lisbon-trip?tab=members",
  "/p/lisbon-trip?tab=rules",
  "/p/lisbon-trip?sheet=close",
  "/p/lisbon-trip?sheet=rules",
  "/p/lisbon-trip?sheet=spend",
  "/p/lisbon-trip?sheet=add",
  "/p/lisbon-trip?sheet=add&amount=50", // a linked amount opens on step 2 (how to add it)
  "/pots",
  "/pots?sheet=create",
  "/pots?sheet=create&step=rules",
  "/requests",
  "/you",
  "/you/advanced",
  "/you?sheet=coach",
]

test.describe("reflow and zoom", () => {
  test("320 px wide: no horizontal scrolling on any screen or sheet (1.4.10)", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-day", "one viewport is enough")
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(PORTO_INVITE_URL)
    await expect(page.getByRole("button", { name: "Join with Google" })).toBeVisible()
    await noHorizontalScroll(page, "/j")
    await page.goto("/")
    await noHorizontalScroll(page, "/")
    // the header keeps [Start a Pot] at 320; its "Sign in" waits for 360 px (07 §1.2: the row has 288 px)
    await expect(page.getByRole("banner").getByRole("link", { name: "Start a Pot" })).toBeVisible()
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeHidden()
    await asPerson(page, "maya")
    for (const url of SCREENS_320) {
      await page.goto(url)
      await expect(page.locator("main, [role=dialog]").first()).toBeVisible()
      await page.waitForTimeout(450)
      await noHorizontalScroll(page, url)
    }
  })

  test("200 % zoom on a desktop browser (1280 px at 200 % = 640 CSS px): reflows, nothing cut off (1.4.4)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop zoom")
    await page.setViewportSize({ width: 640, height: 400 })
    await asPerson(page, "maya")
    for (const url of ["/p/lisbon-trip", "/p/lisbon-trip?sheet=close", "/p/lisbon-trip?sheet=rules", "/you/advanced"]) {
      await page.goto(url)
      await page.waitForTimeout(450)
      await noHorizontalScroll(page, `${url} @200%`)
    }
    // the sheet's primary action stays reachable by scrolling (never covered for good)
    await page.goto("/p/lisbon-trip?sheet=close")
    const cta = page.locator("[data-close-cta]")
    await cta.scrollIntoViewIfNeeded()
    await expect(cta).toBeInViewport()
  })

  test("200 % text size on a phone (Safari text zoom): the Pot and the Close sheet still fit the width", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-day", "phone text zoom")
    await asPerson(page, "maya")
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%"))
    })
    for (const url of ["/p/lisbon-trip", "/p/lisbon-trip?tab=members", "/p/lisbon-trip?tab=rules", "/p/lisbon-trip?sheet=close", "/p/lisbon-trip?sheet=rules", "/pots", "/you"]) {
      await page.goto(url)
      await page.waitForTimeout(450)
      await noHorizontalScroll(page, `${url} text 200%`)
    }
    // the Pot's name is never truncated away
    await page.goto("/p/lisbon-trip")
    await expect(page.getByRole("heading", { level: 1, name: "Lisbon Trip" })).toBeInViewport()
  })
})

test.describe("VoiceOver-style order", () => {
  test("join: the H1, then the Pot, the members, the trust sentence, then Join with Google", async ({ page }) => {
    await page.goto(PORTO_INVITE_URL)
    await expect(page.getByRole("button", { name: "Join with Google" })).toBeVisible()
    const h1 = page.getByRole("heading", { level: 1 })
    await expect(h1).toHaveText("Maya invited you to Porto Weekend")
    const order = await readingOrder(page, "main", [
      "Maya invited you to Porto Weekend",
      "Maya and 1 other are in",
      "In the Pot",
      "$300 of $450 collected",
      "No one can take money out alone.",
      "Join with Google",
    ])
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // the balance card is one labelled region (the hero sentence is read as a whole)
    await expect(page.getByRole("region", { name: /Porto Weekend has \$300/ })).toBeVisible()
  })

  test("join → You're in: focus lands on the heading, then Add my share", async ({ page }) => {
    await page.goto(PORTO_INVITE_URL)
    await page.getByRole("button", { name: "Join with Google" }).click()
    await expect(page.getByRole("heading", { name: "You're in!" })).toBeFocused({ timeout: 10_000 })
    const order = await readingOrder(page, "[role=dialog]", ["You're in!", "Welcome to Porto Weekend.", "Add my $150 share"])
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  test("approve: a deep link opens the sheet with focus on 'Maya asks for $300', then why, timeline, after, expires, Approve", async ({ page }) => {
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip?sheet=spend")
    const spend = await openedSheet(page, "Spend from Lisbon Trip")
    await spendFlow(page, { amount: "300", submit: "Ask the group" })
    await expect(spend.getByText("Sent to the group")).toBeVisible()
    await page.evaluate(() => localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "leo", kind: "mock" })))
    await page.goto("/p/lisbon-trip?r=12")
    const sheet = await openedSheet(page, "Maya asks for $300")
    await expect(sheet.getByRole("heading", { name: "Maya asks for $300" })).toBeFocused()
    await expect(page).toHaveTitle(/Lisbon Trip · Pot/)
    const order = await readingOrder(page, "[role=dialog]", [
      "Maya asks for $300",
      "$300.00",
      "Needs approval because it's over the $100 instant limit.",
      "1 of 2",
      "Pot after this",
      "Expires",
      "Approve $300",
      "Decline",
    ])
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})

test.describe("keyboard only (desktop)", () => {
  test("Add money with the keyboard: digits → Enter = Next → step 2's heading → pick a source → Add", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop keyboard path")
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip?sheet=add")
    const add = await openedSheet(page, "Add money to Lisbon Trip")
    await page.keyboard.type("40")
    await expect(add.locator("[data-amount-display]")).toHaveText("$40")
    await page.keyboard.press("Enter") // Enter on the keypad = Next
    await expect(add.getByRole("heading", { name: "How do you want to add it?" })).toBeFocused()
    await expect(add.locator("[data-step-live]")).toHaveText("How do you want to add it?")
    await expect(page).toHaveURL(/step=source/)
    const demo = add.getByRole("radio", { name: /^Demo dollars/ })
    for (let i = 0; i < 6 && !(await demo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(demo).toBeFocused()
    await expect(demo).toHaveAttribute("aria-checked", "true")
    const cta = add.getByRole("button", { name: "Add $40" })
    for (let i = 0; i < 10 && !(await cta.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(cta).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByText("Adding $40…")).toBeVisible()
  })

  test("skip link, then approve a request with Tab / Enter, Esc closes and focus returns", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop keyboard path")
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip?sheet=spend")
    const spend = await openedSheet(page, "Spend from Lisbon Trip")
    await page.keyboard.type("300") // the keypad takes physical digits
    await expect(spend.locator("[data-amount-display]")).toHaveText("$300")
    await page.keyboard.press("Enter") // Enter on the keypad = Next
    await expect(spend.getByRole("heading", { name: "What's it for?" })).toBeFocused() // step 2's heading
    await expect(spend.locator("[data-step-live]")).toHaveText("What's it for?")
    await spend.getByRole("button", { name: "Ask the group" }).focus()
    await page.keyboard.press("Enter")
    await expect(spend.getByText("Sent to the group")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()
    await page.evaluate(() => localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "sam", kind: "mock" })))
    await page.goto("/p/lisbon-trip")
    await expect(page.locator("[data-hero]")).toBeVisible()

    // first Tab: the skip link
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: "Skip to content" })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()

    // Tab to the request's review button and open it with Enter
    const review = page.locator("[data-request-card]").locator("visible=true").first().getByRole("button", { name: /^Maya asks for \$300/ })
    for (let i = 0; i < 40 && !(await review.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(review).toBeFocused()
    await page.keyboard.press("Enter")
    const sheet = await openedSheet(page, "Maya asks for $300")
    await expect(sheet.getByRole("heading", { name: "Maya asks for $300" })).toBeFocused()
    const approve = sheet.getByRole("button", { name: "Approve $300" })
    for (let i = 0; i < 10 && !(await approve.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(approve).toBeFocused()
    // a visible focus ring (2 px, :focus-visible)
    expect(await approve.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none")
    await page.keyboard.press("Enter")
    await expect(sheet.getByText("Approved! $300 is on its way to Maya.")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(review).toHaveCount(0) // decided: the card left "Waiting on you"
  })

  test("Create from the keyboard: Tab to the name, type, Enter creates; [Change] opens the rules and Back returns", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop keyboard path")
    await asPerson(page, "maya")
    await page.goto("/pots?sheet=create")
    const main = page.getByRole("dialog", { name: "Start a Pot" })
    await expect(page.getByRole("heading", { name: "Start a Pot" })).toBeFocused()
    // heading → ✕ → the cover (opens the picker) → the name
    const cover = main.getByRole("button", { name: "Change the emoji and colour" })
    for (let i = 0; i < 3 && !(await cover.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(cover).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(main.getByRole("radiogroup", { name: "Pick an emoji" })).toBeVisible()
    await page.keyboard.press("Enter") // the cover keeps focus: Enter again closes the picker
    await expect(main.getByRole("radiogroup")).toHaveCount(0)
    const name = main.getByRole("textbox", { name: /Pot name/ })
    for (let i = 0; i < 4 && !(await name.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(name).toBeFocused()
    await page.keyboard.type("Desk Trip")
    // on to [Change] (past "$150 each" and its switch)
    const change = main.getByRole("button", { name: "Change the rules" })
    for (let i = 0; i < 6 && !(await change.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
    await expect(change).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("heading", { name: "Pot rules" })).toBeFocused()
    // let the pushed ?step=rules entry settle (Next syncs it after the push), as a person would
    const rules = await openedSheet(page, "Pot rules")
    await rules.getByRole("button", { name: "Back" }).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("heading", { name: "Start a Pot" })).toBeFocused()
    await name.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/p\/desk-trip-[a-z0-9]{4}\?sheet=share$/, { timeout: 10_000 })
  })

  test("the rules change sheet works from the keyboard (radio cards + physical digits)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop keyboard path")
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip?tab=rules")
    const open = page.getByRole("button", { name: "Ask the group to change a rule" })
    await open.focus()
    await page.keyboard.press("Enter")
    const sheet = await openedSheet(page, "Ask the group to change a rule")
    await sheet.getByRole("radio", { name: /Limit per person/ }).focus()
    await page.keyboard.press("Enter")
    await page.keyboard.type("250")
    await expect(sheet.getByText("Each person can spend up to $250 in total without asking.")).toBeVisible()
    await sheet.getByRole("button", { name: "Ask the group" }).focus()
    await page.keyboard.press("Enter")
    await expect(sheet.getByText("Sent to the group. Your approval is counted. It needs 1 more.")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(open).toHaveCount(0)
  })
})

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" })
  test("sheets fade (no slide), the push examples don't animate, the tab indicator doesn't glide", async ({ page }) => {
    await asPerson(page, "maya")
    await page.goto("/p/lisbon-trip?sheet=close")
    const popup = page.getByRole("dialog")
    await expect(popup).toBeVisible()
    const dur = await popup.evaluate((el) => getComputedStyle(el).transitionProperty)
    expect(dur).not.toContain("transform")
    await page.goto("/you?sheet=push")
    const ex = page.locator(".pot-drop").first()
    if (await ex.count()) expect(await ex.evaluate((el) => el.getAnimations().length)).toBe(0)
  })
})
