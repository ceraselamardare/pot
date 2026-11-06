// The sign-in dialog (site update 2026-11-03; components/features/auth/{SignInLink,SignInHost,SignInDialog,SignInPanel}
// + lib/client/signin.ts; design-direction 07 §1.3, §2), on the mock data source in every project (mobile Day,
// mobile Night, desktop). The mock simulates the options (each signs in as the mock newcomer Alex):
//  - the landing's [Start a Pot] opens the dialog in place (?signin=1): its title, one marigold, axe 0; simulated
//    Google → the stepper → the hand-off → the first-run intro → Create, with no stop at a bare /pots on the way
//    (HomeRedirect stands down) and never two dialogs at once;
//  - Escape, ✕ and the browser's Back close it (focus back on the CTA, the URL back to /); a reload keeps it open;
//  - the header's "Sign in" → "Sign in to Pot" → the person's Pots; the final card's [Start a Pot] → the same dialog;
//  - "Not ready? See a quick demo" → /demo, and Back doesn't reopen the dialog;
//  - the tour's end: the dialog without the demo row; signed in, straight to Create;
//  - Cancel and Escape while the window is up go back to the options; a failed setup says so;
//  - a ⌘/Ctrl-click is left to the browser (a new tab to /pots?sheet=create);
//  - an in-app browser leads with "Open in Safari"; the mock-only previews of the wallet-only (hosted) and the
//    nothing-available builds;
//  - the app's signed-out screen: the same panel inline; no JS: the CTA's link and the <noscript> line;
//  - 320 px and reduced motion.
// Mobile projects save notes/screens/signin-*-{day,night}.png.
import { expect, test, type Page } from "@playwright/test"
import { NO_STATE } from "../fixtures/onboarding"
import { asPerson, axe, brandChecks, openedSheet } from "../fixtures/pot"
import { screensDir } from "../fixtures/screens"

const SCREENS = screensDir() // notes/screens/ only with SAVE_SCREENS=1 (e2e/fixtures/screens.ts)
const START = "Sign in to start your Pot"
const BACK = "Sign in to Pot"

const hero = (page: Page) => page.locator("[data-signin-source='hero']")
const dialogOf = (page: Page, name = START) => page.getByRole("dialog", { name })

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SCREENS}signin-${name}-${project === "mobile-night" ? "night" : "day"}.png` })
}

/** Every URL the page's history is set to (Next's router uses the History API), from the first load on. */
async function recordUrls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { urls: string[]; dialogs: string[] }
    w.urls = []
    w.dialogs = []
    for (const k of ["pushState", "replaceState"] as const) {
      const orig = history[k].bind(history)
      history[k] = (data: unknown, unused: string, url?: string | URL | null) => {
        if (url != null) w.urls.push(new URL(String(url), location.href).pathname + new URL(String(url), location.href).search)
        return orig(data, unused, url)
      }
    }
    new MutationObserver(() => {
      const open = [...document.querySelectorAll('[role="dialog"]')]
      if (open.length > 1) w.dialogs.push(`together: ${open.length}`)
    }).observe(document, { subtree: true, childList: true })
  })
}
const urls = (page: Page) => page.evaluate(() => (window as unknown as { urls: string[] }).urls)

async function openFromHero(page: Page) {
  await page.goto("/")
  await expect(hero(page)).toHaveAttribute("data-opens-dialog", "true") // hydrated, no session: it intercepts
  await expect(hero(page)).toHaveAttribute("href", "/pots?sheet=create")
  await hero(page).click()
  const d = await openedSheet(page, START)
  await expect(page).toHaveURL(/\/\?signin=1$/)
  return d
}

test.describe("a first-time visitor (no intro flag)", () => {
  test.use({ storageState: NO_STATE })

  test("Start a Pot → the dialog → Continue with Google → the intro → Create; HomeRedirect stands down", async ({ page }, info) => {
    await recordUrls(page)
    const d = await openFromHero(page)
    // named by its title, described by the promise; focus on the title (the app's sheet convention)
    await expect(d).toHaveAccessibleDescription("It's free. Next you name it, pick its rules and share one link.")
    await expect(d.getByRole("heading", { name: START })).toBeFocused()
    // the options this (mock) build has, in order, with one marigold: Google
    const panel = d.locator("[data-signin-panel]")
    await expect(panel.getByRole("button")).toHaveText(["Continue with Google", "Continue with email", "I have a NEAR wallet"])
    await expect(panel.getByText("This signs you in as Alex, a sample person.")).toBeVisible()
    await expect(panel.getByRole("link", { name: "See a quick demo" })).toHaveAttribute("href", "/demo")
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "dialog", info.project.name)

    await panel.getByRole("button", { name: "Continue with Google" }).click()
    // the stepper: ① the window, ② setting up, ③ Create; the demo row and fine print give way
    await expect(panel.locator("[data-signin-wait='window']")).toBeVisible()
    await expect(panel.getByRole("list", { name: "Signing in" }).getByRole("listitem")).toHaveText([
      "Finish with Google in the new window",
      /Setting up your Pot account…/,
      "Name your Pot and pick its rules",
    ])
    await expect(panel.getByRole("button", { name: "Cancel" })).toBeFocused()
    await expect(panel.getByText("See a quick demo")).toHaveCount(0)
    await shot(page, "waiting", info.project.name)
    await expect(panel.locator("[data-signin-wait='setup']")).toBeVisible()
    await expect(panel.getByRole("list", { name: "Signing in" }).getByRole("listitem").first()).toHaveText("Signed in")
    await axe(page)

    // the hand-off: straight to /pots?sheet=create, where the first-run intro comes first
    const intro = await openedSheet(page, "Welcome to Pot")
    await expect(page).toHaveURL(/\/pots\?sheet=intro&then=create$/)
    await expect(dialogOf(page)).toHaveCount(0)
    expect(await urls(page)).not.toContain("/pots") // "/"'s signed-in redirect never ran
    expect(await page.evaluate(() => (window as unknown as { dialogs: string[] }).dialogs)).toEqual([])
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pot.mock.session") ?? "null"))).toMatchObject({ persona: "alex" })

    await intro.getByRole("button", { name: "Skip the intro" }).click()
    await openedSheet(page, "Start a Pot")
    await expect(page).toHaveURL(/\/pots\?sheet=create$/)
    await brandChecks(page, { marigold: "one" })
  })
})

test("an onboarded browser: Start a Pot → sign in → Create directly", async ({ page }) => {
  await openFromHero(page)
  await dialogOf(page).getByRole("button", { name: "Continue with email" }).click()
  await openedSheet(page, "Start a Pot")
  await expect(page).toHaveURL(/\/pots\?sheet=create$/)
  await expect(page.getByRole("dialog")).toHaveCount(1)
})

test("Escape, ✕ and the browser's Back close it; focus goes back to the CTA; a reload keeps it open", async ({ page }) => {
  await openFromHero(page)
  await page.keyboard.press("Escape")
  await expect(dialogOf(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
  await expect(hero(page)).toBeFocused()

  await hero(page).click()
  await openedSheet(page, START)
  await dialogOf(page).getByRole("button", { name: "Close" }).click()
  await expect(dialogOf(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)

  await hero(page).click()
  await openedSheet(page, START)
  await page.goBack()
  await expect(dialogOf(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)

  // a reload of /?signin=1 reopens it (its opener's request survives in sessionStorage); closing still lands on /
  await page.goForward()
  await openedSheet(page, START)
  await page.reload()
  await openedSheet(page, START)
  await page.keyboard.press("Escape")
  await expect(dialogOf(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})

test("the header's Sign in → 'Sign in to Pot' (no demo row) → the person's Pots; the final card opens the start dialog", async ({ page }) => {
  await page.goto("/")
  await page.locator("[data-signin-source='final']").click()
  await openedSheet(page, START)
  await page.keyboard.press("Escape")
  await expect(dialogOf(page)).toHaveCount(0)

  await page.locator("[data-header-signin]").click()
  const d = await openedSheet(page, BACK)
  await expect(d).toHaveAccessibleDescription("Use the same way as last time. New to Pot? This sets you up too.")
  await expect(d.getByText("See a quick demo")).toHaveCount(0)
  await brandChecks(page, { marigold: "one" })
  await d.getByRole("button", { name: "Continue with Google" }).click()
  await expect(d.getByRole("list", { name: "Signing in" }).getByRole("listitem").last()).toHaveText("Open your Pots")
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/pots$/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("Not ready? See a quick demo → /demo; Back doesn't reopen the dialog", async ({ page }) => {
  await openFromHero(page)
  await dialogOf(page).getByRole("link", { name: "See a quick demo" }).click()
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await page.waitForTimeout(500)
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("the tour's end: the dialog without the demo row; signed in, straight to Create", async ({ page, browser }) => {
  await page.goto("/demo#end")
  const cta = page.locator("[data-tour-cta]")
  await cta.click()
  const d = await openedSheet(page, START)
  await expect(d.locator("[data-signin-panel]")).toBeVisible()
  await expect(d.getByText("See a quick demo")).toHaveCount(0)
  await brandChecks(page, { marigold: "one" })
  await page.keyboard.press("Escape")
  await expect(page).toHaveURL(/\/demo#end$/)

  const ctx = await browser.newContext({ storageState: await page.context().storageState() })
  const p2 = await ctx.newPage()
  await asPerson(p2, "maya")
  await p2.goto("/demo#end")
  await expect(p2.locator("[data-tour-cta]")).not.toHaveAttribute("data-opens-dialog", /.*/)
  await p2.locator("[data-tour-cta]").click()
  await openedSheet(p2, "Start a Pot")
  await expect(p2).toHaveURL(/\/pots\?sheet=create$/)
  await ctx.close()
})

test("Cancel and Escape while the window is up go back to the options; a failed setup says so", async ({ page }) => {
  const d = await openFromHero(page)
  const panel = d.locator("[data-signin-panel]")
  await panel.getByRole("button", { name: "Continue with Google" }).click()
  await panel.getByRole("button", { name: "Cancel" }).click()
  await expect(panel.getByRole("button", { name: "Continue with Google" })).toBeFocused()
  await page.waitForTimeout(1_000) // the abandoned attempt never signs in
  expect(await page.evaluate(() => localStorage.getItem("pot.mock.session"))).toBeNull()

  // Escape means Cancel while the window is up: the dialog stays
  await panel.getByRole("button", { name: "Continue with email" }).click()
  await page.keyboard.press("Escape")
  await expect(dialogOf(page)).toBeVisible()
  await expect(panel.getByRole("button", { name: "Continue with email" })).toBeFocused()

  await page.evaluate(() => localStorage.setItem("pot.mock.fail", "setup"))
  await panel.getByRole("button", { name: "I have a NEAR wallet" }).click()
  await expect(panel.getByRole("listitem").first()).toHaveText("Confirm it's you in the window that opened")
  await expect(panel.getByRole("alert")).toHaveText("Sign-in didn't work, and nothing changed. Try again, or pick another way.", { timeout: 10_000 })
  await expect(panel.getByRole("button", { name: "I have a NEAR wallet" })).toBeFocused()
  await axe(page)
})

test("NEAR Connect's picker on top (a stand-in; the real one is never opened): pointer and keyboard work, the dialog stays; the trap comes back", async ({ page }) => {
  const d = await openFromHero(page)
  await expect(d.getByRole("heading", { name: START })).toBeFocused()
  // the page under it (Base UI marks body's children; one that holds a live region stays, its children are marked)
  const behind = page.locator("body > a[href='#main']")
  await expect(behind).toHaveAttribute("aria-hidden", "true") // modal: the page is hidden from screen readers

  // what NEAR Connect does (build/popups/Popup.js): a root appended to body after the dialog opened, a fixed
  // full-screen container at z-index 1e8 whose own backdrop click is "User rejected" + destroy, its buttons inside
  await page.evaluate(() => {
    const w = window as unknown as { standIn: number }
    w.standIn = 0
    const root = document.createElement("div")
    root.className = "hot-connector-popup"
    root.innerHTML =
      '<div class="modal-container" style="position:fixed;inset:0;z-index:100000000;display:grid;place-items:center;background:rgb(0 0 0 / .5)">' +
      '<div class="modal-content" style="background:#fff;color:#000;padding:24px"><button type="button" id="stand-in">Stand-in wallet</button></div></div>'
    root.querySelector("#stand-in")!.addEventListener("click", () => w.standIn++)
    const backdrop = root.querySelector<HTMLElement>(".modal-container")!
    backdrop.addEventListener("click", (e) => e.target === backdrop && root.remove())
    document.body.append(root)
  })
  const standIn = page.getByRole("button", { name: "Stand-in wallet" }) // a role query: never inside aria-hidden
  await expect(behind).not.toHaveAttribute("aria-hidden", /.*/) // non-modal now
  expect(await standIn.evaluate((el) => el.closest("[aria-hidden='true'], [inert]") === null)).toBe(true)
  const pressed = () => page.evaluate(() => (window as unknown as { standIn: number }).standIn)

  // pointer: a real hit-tested click lands on it
  await standIn.click()
  expect(await pressed()).toBe(1)
  // keyboard: Tab from inside the dialog reaches it, and Enter presses it
  await d.getByRole("heading", { name: START }).focus()
  // (non-modal now, so Tab walks the page too, the site footer's links included, before the root at the end of body)
  for (let i = 0; i < 80 && !(await standIn.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
  await expect(standIn).toBeFocused()
  await page.keyboard.press("Enter")
  expect(await pressed()).toBe(2)
  // pressing or focusing it never closed the dialog under it
  await expect(d).toBeVisible()
  await expect(page).toHaveURL(/\/\?signin=1$/)

  // Escape closes the topmost layer: the picker, not the dialog
  await page.keyboard.press("Escape")
  await expect(standIn).toHaveCount(0)
  await expect(d).toBeVisible()
  // modal again: the page hidden, focus back inside the dialog, and Tab can't leave it
  await expect(behind).toHaveAttribute("aria-hidden", "true")
  await expect.poll(() => d.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab")
    expect(await d.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} stays in the dialog`).toBe(true)
  }
  await axe(page)
})

test("a ⌘/Ctrl-click is left to the browser: a new tab to /pots?sheet=create", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop", "a desktop gesture")
  await page.goto("/")
  const tab = context.waitForEvent("page")
  await hero(page).click({ modifiers: ["ControlOrMeta"] })
  const p = await tab
  await p.waitForLoadState()
  expect(new URL(p.url()).pathname + new URL(p.url()).search).toBe("/pots?sheet=create")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})

test.describe("an in-app browser (Instagram on an iPhone)", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.27.89 (iPhone15,3; iOS 18_5; en_US)",
  })
  test("Open in Safari leads (the marigold); no Google; email and the wallet below", async ({ page }, info) => {
    const d = await openFromHero(page)
    const banner = d.locator("[data-inapp-banner='safari']")
    await expect(banner.getByRole("heading", { name: "Open Pot in Safari to sign in" })).toBeVisible()
    await expect(banner.getByText("Google sign-in doesn't work inside Instagram.")).toBeVisible()
    const open = banner.getByRole("link", { name: "Open in Safari" })
    await expect(open).toHaveAttribute("href", /^x-safari-http:\/\/[^/]+\/pots\?sheet=create$/)
    await expect(d.getByText("Or continue here")).toBeVisible()
    await expect(d.getByRole("button", { name: "Continue with Google" })).toHaveCount(0)
    await expect(d.locator("[data-signin-options]").getByRole("button")).toHaveText(["Continue with email", "I have a NEAR wallet"])
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "inapp", info.project.name)
  })
})

test("mock previews: the hosted wallet-only build, and a build with no way in", async ({ page }, info) => {
  await page.goto("/?signin=1&signin_preview=wallet")
  const d = await openedSheet(page, START)
  await expect(d.locator("[data-signin-options]").getByRole("button")).toHaveText(["Continue with a NEAR wallet"])
  await expect(d.getByText(/test version|isn't on/)).toHaveCount(0)
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "wallet-only", info.project.name)

  await page.goto("/?signin=1&signin_preview=none")
  const n = await openedSheet(page, START)
  await expect(n.getByRole("heading", { name: "Sign-in is off here" })).toBeVisible()
  await expect(n.getByRole("link", { name: "See a demo" })).toHaveAttribute("href", "/demo")
  await expect(n.getByText("See a quick demo")).toHaveCount(0)
  await brandChecks(page, { marigold: "one" })
  await axe(page)
})

test("the app's signed-out screen: the same panel inline; signing in swaps the screen in place", async ({ page }, info) => {
  await page.goto("/pots")
  await expect(page.getByRole("heading", { level: 1, name: BACK })).toBeVisible()
  const panel = page.locator("main [data-signin-panel]")
  await expect(panel.locator("[data-signin-options]").getByRole("button")).toHaveText(["Continue with Google", "Continue with email", "I have a NEAR wallet"])
  await expect(panel.getByRole("link", { name: "See a demo" })).toHaveAttribute("href", "/demo")
  await expect(panel.getByRole("link", { name: "What is Pot?" })).toHaveAttribute("href", "/")
  await expect(page.getByRole("dialog")).toHaveCount(0) // never the dialog on an app route
  await brandChecks(page, { marigold: "one" })
  await axe(page)
  await shot(page, "signed-out", info.project.name)
  await panel.getByRole("button", { name: "Continue with Google" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/pots$/)
})

test("no JS: the start CTA is a link to /pots?sheet=create, which says sign-in needs JavaScript", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto("/")
  await expect(page.locator("[data-signin-source='hero']")).toHaveAttribute("href", "/pots?sheet=create")
  await expect(page.locator("[data-signin-source='hero']")).not.toHaveAttribute("data-opens-dialog", /.*/)
  await page.goto("/pots?sheet=create")
  await expect(page.getByRole("heading", { level: 1, name: BACK })).toBeVisible()
  // (Playwright's text engine skips <noscript> subtrees even with JS off, so this one goes by CSS)
  await expect(page.locator("[data-nojs] p").first()).toHaveText("Pot needs JavaScript to sign in. Turn it on, or see a demo first.")
  await expect(page.locator("[data-nojs] p").first()).toBeVisible()
  await expect(page.getByRole("link", { name: "See a demo" })).toHaveAttribute("href", "/demo")
  await expect(page.getByRole("link", { name: "What is Pot?" })).toHaveAttribute("href", "/")
  await ctx.close()
})

test("320 px: the dialog fits with no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-day", "320 px runs once")
  await page.setViewportSize({ width: 320, height: 640 })
  const d = await openFromHero(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  expect((await d.boundingBox())!.width).toBeLessThanOrEqual(320)
  for (const b of await d.getByRole("button").all()) expect((await b.boundingBox())!.x + (await b.boundingBox())!.width).toBeLessThanOrEqual(320)
  await axe(page)
})

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" })
  test("it opens and closes with a fade (no slide), and stays axe-clean", async ({ page }) => {
    const d = await openFromHero(page)
    // the Sheet's reduced-motion branch: opacity only, no transform
    expect(await d.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("opacity")
    await axe(page)
    await page.keyboard.press("Escape")
    await expect(dialogOf(page)).toHaveCount(0)
    await expect(hero(page)).toBeFocused()
  })
})
