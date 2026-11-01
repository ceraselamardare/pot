// F-23 / F-24 on the mock build: the install coach in each context (iOS 26, iOS 27, Android with and without
// Chrome's prompt, an in-app browser), the push pre-prompt after install (granted, denied, not now) against a
// mocked POST /api/push/subscription, the app badge, the service worker file, and the per-invite link preview.
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { asPerson, axe, becomePerson, brandChecks, openedSheet, PORTO_INVITE_URL, typeAmount } from "../fixtures/pot"

const SCREENS = fileURLToPath(new URL("../../../../notes/screens/", import.meta.url))
const UA = {
  ios26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  ios27: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0 (iPhone15,2; iOS 26_0; en_US)",
}

async function shot(page: Page, name: string, project: string) {
  if (project === "desktop") return
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SCREENS}p2-${project === "mobile-night" ? "night" : "day"}-${name}.png` })
}

test.describe("install coach", () => {
  test.use({ reducedMotion: "reduce" })

  test.describe("iOS 26 Safari", () => {
    test.use({ userAgent: UA.ios26 })
    test("appears after the first contribution, with 4 steps and the 'Don't see it?' line", async ({ page }, info) => {
      test.skip(info.project.name === "desktop", "never on desktop")
      await asPerson(page, "maya")
      await page.goto("/p/lisbon-trip?sheet=add")
      const add = await openedSheet(page, "Add money to Lisbon Trip")
      await typeAmount(page, "20")
      await add.getByRole("button", { name: "Add $20" }).click()
      const card = page.locator("[data-coach-card]")
      await expect(card).toBeVisible({ timeout: 10_000 })
      await expect(card.getByRole("heading", { name: "Put Pot on your Home Screen" })).toBeVisible()
      await expect(card.getByText("So you hear when friends need your OK.")).toBeVisible()
      await brandChecks(page, { marigold: "one" }) // [Show me how] is secondary; Add money stays the marigold
      await shot(page, "coach-card", info.project.name)
      await card.getByRole("button", { name: "Show me how" }).click()
      const sheet = await openedSheet(page, "Add Pot to your Home Screen")
      await expect(sheet.locator("[data-coach-sheet]")).toHaveAttribute("data-coach-sheet", "ios26")
      await expect(sheet.locator("ol > li")).toHaveCount(4)
      await expect(sheet.getByText("Tap ••• next to the address bar")).toBeVisible()
      await expect(sheet.getByText("Don't see it? Tap the Share button instead.")).toBeVisible()
      await expect(sheet.getByText('Keep "Open as Web App" on, then tap Add')).toBeVisible()
      await brandChecks(page, { marigold: "none" }) // iOS has no install API: no install button
      await axe(page)
      await shot(page, "coach-ios", info.project.name)
      await sheet.getByRole("button", { name: "Got it" }).click()
      await expect(page.locator("[data-coach-card]")).toHaveCount(0)
      // a second contribution doesn't bring it back (first contribution only)
      await page.goto("/p/lisbon-trip?sheet=add")
      const again = await openedSheet(page, "Add money to Lisbon Trip")
      await typeAmount(page, "5")
      await again.getByRole("button", { name: "Add $5" }).click()
      await expect(page.getByText("Added. Lisbon Trip now has", { exact: false })).toBeVisible({ timeout: 10_000 })
      await expect(page.locator("[data-coach-card]")).toHaveCount(0)
    })

    test("Not now snoozes it", async ({ page }, info) => {
      test.skip(info.project.name === "desktop", "never on desktop")
      await asPerson(page, "leo")
      await page.addInitScript(() => localStorage.setItem("pot.coach", JSON.stringify({ shows: 0, snoozedUntil: 0, pending: "lisbon-trip" })))
      await page.goto("/p/lisbon-trip")
      await page.locator("[data-coach-card]").getByRole("button", { name: "Not now" }).click()
      await expect(page.locator("[data-coach-card]")).toHaveCount(0)
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem("pot.coach")!))
      expect(s.shows).toBe(1)
      expect(s.snoozedUntil).toBeGreaterThan(Date.now() + 6 * 86_400_000)
    })
  })

  test.describe("iOS 27 Safari", () => {
    test.use({ userAgent: UA.ios27 })
    test("You → Add Pot to your Home Screen names the page menu", async ({ page }) => {
      await asPerson(page, "maya")
      await page.goto("/you")
      await page.getByRole("button", { name: /Add Pot to your Home Screen/ }).click()
      const sheet = await openedSheet(page, "Add Pot to your Home Screen")
      await expect(sheet.getByText("Tap the page menu next to the address bar")).toBeVisible()
      await expect(sheet.locator("ol > li")).toHaveCount(4)
    })
  })

  test.describe("Android Chrome", () => {
    test.use({ userAgent: UA.android })
    test("with Chrome's install prompt: [Install Pot] opens it", async ({ page }) => {
      await asPerson(page, "maya")
      await page.goto("/you")
      // Chrome fires beforeinstallprompt once the app is installable; simulate it
      await page.evaluate(() => {
        const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
        ;(window as unknown as { prompted: number }).prompted = 0
        e.prompt = async () => {
          ;(window as unknown as { prompted: number }).prompted++
        }
        e.userChoice = Promise.resolve({ outcome: "accepted" })
        window.dispatchEvent(e)
      })
      await page.getByRole("button", { name: /Add Pot to your Home Screen/ }).click()
      const sheet = await openedSheet(page, "Add Pot to your Home Screen")
      await expect(sheet.locator("[data-coach-sheet]")).toHaveAttribute("data-coach-sheet", "android_prompt")
      await brandChecks(page, { marigold: "one" })
      await sheet.getByRole("button", { name: "Install Pot" }).click()
      await expect(sheet.locator("[data-coach-sheet]")).toHaveAttribute("data-coach-sheet", "installed")
      await expect(page.locator("[data-sonner-toast]").getByText("Pot is on your Home Screen")).toBeVisible()
      expect(await page.evaluate(() => (window as unknown as { prompted: number }).prompted)).toBe(1)
    })

    test("without it: the menu steps", async ({ page }) => {
      await asPerson(page, "maya")
      await page.goto("/you?sheet=coach")
      const sheet = await openedSheet(page, "Add Pot to your Home Screen")
      await expect(sheet.locator("ol > li")).toHaveCount(3)
      await expect(sheet.getByText("Tap ⋮ at the top right")).toBeVisible()
    })
  })

  test.describe("in-app browser (Instagram)", () => {
    test.use({ userAgent: UA.instagram })
    test("the invite landing offers Open in Safari (keeping the #secret) and hides Google", async ({ page }, info) => {
      await page.goto(PORTO_INVITE_URL)
      const banner = page.locator("[data-inapp-banner]")
      await expect(banner.getByRole("heading", { name: "Open in Safari to join" })).toBeVisible()
      await expect(banner.getByText("Google sign-in doesn't work inside Instagram.", { exact: false })).toBeVisible()
      const open = banner.getByRole("link", { name: "Open in Safari" })
      const href = await open.getAttribute("href")
      expect(href).toMatch(/^x-safari-http:\/\/127\.0\.0\.1:\d+\/j\/porto-weekend\?i=[1-9A-HJ-NP-Za-km-z]+#BRAbJjE8R1JdaHN-iZSfqrXAy9bh7PcCDRgjLjlET1o$/)
      await expect(page.getByRole("button", { name: "Join with Google" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible()
      await brandChecks(page, { marigold: "one" })
      await axe(page)
      await shot(page, "inapp-landing", info.project.name)
      await page.getByRole("button", { name: "More ways to join" }).click()
      await expect(page.getByText("Use a passkey")).toHaveCount(0)
    })

    test("the coach explains the escape inside the app", async ({ page }) => {
      await asPerson(page, "maya")
      await page.goto("/you?sheet=coach")
      const sheet = await openedSheet(page, "Open Pot in Safari first")
      await expect(sheet.getByText("Instagram can't add apps to your Home Screen.", { exact: false })).toBeVisible()
      await expect(sheet.getByRole("link", { name: "Open in Safari" })).toHaveAttribute("href", /^x-safari-http:\/\//)
      await expect(sheet.getByRole("button", { name: "Copy link" })).toBeVisible()
    })
  })

  test("desktop and already-installed: no card", async ({ page }) => {
    await asPerson(page, "maya")
    await page.addInitScript(() => localStorage.setItem("pot.coach", JSON.stringify({ shows: 0, snoozedUntil: 0, pending: "lisbon-trip" })))
    await page.goto("/p/lisbon-trip")
    await expect(page.locator("[data-hero]")).toBeVisible()
    await expect(page.locator("[data-coach-card]")).toHaveCount(0) // Desktop Chrome UA → "desktop"
  })
})

/** The installed app: display-mode standalone, a stubbed Notification + push service (headless can't subscribe). */
async function standalone(page: Page, opts: { permission: "granted" | "denied" }) {
  await page.addInitScript((answer) => {
    const mm = window.matchMedia.bind(window)
    window.matchMedia = (q: string) => {
      if (!q.includes("display-mode: standalone")) return mm(q)
      const noop = () => {}
      return { matches: true, media: q, onchange: null, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: () => false } as MediaQueryList
    }
    const w = window as unknown as { pushLog: string[]; badgeLog: (number | null)[] }
    w.pushLog = []
    w.badgeLog = []
    // the browser remembers the answer across reloads, like a real permission
    let perm = (sessionStorage.getItem("e2e.permission") as NotificationPermission | null) ?? "default"
    Object.defineProperty(Notification, "permission", { get: () => perm, configurable: true })
    Notification.requestPermission = (async () => {
      w.pushLog.push("requestPermission")
      perm = answer as NotificationPermission
      sessionStorage.setItem("e2e.permission", perm)
      return perm
    }) as typeof Notification.requestPermission
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/e2e",
      toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/e2e", expirationTime: null, keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) } }),
      unsubscribe: async () => true,
    }
    const pushManager = {
      getSubscription: async () => null,
      subscribe: async () => {
        w.pushLog.push("subscribe")
        return sub
      },
    }
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: async () => ({ pushManager }),
        ready: Promise.resolve({ pushManager }),
        getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }),
        addEventListener() {},
        removeEventListener() {},
      },
    })
    ;(navigator as unknown as { setAppBadge: (n: number) => Promise<void> }).setAppBadge = async (n: number) => {
      w.badgeLog.push(n)
    }
    ;(navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge = async () => {
      w.badgeLog.push(null)
    }
  }, opts.permission)
}

test.describe("push permission (after install, with a reason; D-42)", () => {
  test.use({ reducedMotion: "reduce" })

  test("first Home Screen launch: the pre-prompt, then the system dialog from the tap, then the subscription is saved", async ({ page }, info) => {
    await asPerson(page, "maya")
    await standalone(page, { permission: "granted" })
    const posted: unknown[] = []
    await page.route("**/api/push/subscription", async (route) => {
      posted.push({ method: route.request().method(), body: route.request().postDataJSON() })
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, requestId: "req_e2e", subscriptionId: "sub_1" }) })
    })
    await page.goto("/pots")
    const sheet = await openedSheet(page, "Get told when friends need your OK")
    await expect(sheet.getByText("We'll only notify you about money in your Pots.")).toBeVisible()
    await expect(sheet.getByText("Your phone asks next. Tap Allow.")).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { pushLog: string[] }).pushLog)).toEqual([]) // nothing asked yet
    await brandChecks(page, { marigold: "one" })
    await axe(page)
    await shot(page, "push-prompt", info.project.name)
    await sheet.getByRole("button", { name: "Turn on notifications" }).click()
    await expect(page.getByText("Notifications on").first()).toBeVisible()
    await expect(page.getByRole("dialog")).toBeHidden()
    expect(await page.evaluate(() => (window as unknown as { pushLog: string[] }).pushLog)).toEqual(["requestPermission", "subscribe"])
    expect(posted).toEqual([
      {
        method: "POST",
        body: {
          subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/e2e", expirationTime: null, keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) } },
          standalone: true,
          platform: expect.any(String),
        },
      },
    ])
    // You → Notifications reads "on"; tapping it turns them off (DELETE)
    await page.goto("/you")
    const row = page.locator("[data-you-push]")
    await expect(row).toHaveAttribute("data-you-push", "on")
    await row.getByRole("button").click()
    await expect(page.getByText("Notifications off")).toBeVisible()
    expect(posted.at(-1)).toEqual({ method: "DELETE", body: { endpoint: "https://fcm.googleapis.com/fcm/send/e2e" } })
    // the badge mirrors what waits on Maya (nothing): cleared
    expect(await page.evaluate(() => (window as unknown as { badgeLog: (number | null)[] }).badgeLog)).toContain(null)
  })

  test("denied: says how to fix it; Not now: never by itself again", async ({ page }) => {
    await asPerson(page, "maya")
    await standalone(page, { permission: "denied" })
    await page.goto("/pots")
    const sheet = await openedSheet(page, "Get told when friends need your OK")
    await sheet.getByRole("button", { name: "Turn on notifications" }).click()
    await expect(sheet.getByRole("alert")).toHaveText("Notifications are off. You can turn them on in your phone's Settings.")
    await sheet.getByRole("button", { name: "Done" }).click()
    await page.reload()
    await expect(page.getByRole("heading", { level: 1, name: "Pots" })).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("a browser tab never prompts by itself; an iOS tab is told to install first", async ({ page, browser }) => {
    await asPerson(page, "maya")
    await page.goto("/pots")
    await page.waitForTimeout(500)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    const ios = await browser.newContext({ userAgent: UA.ios26, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const p2 = await ios.newPage()
    await asPerson(p2, "maya")
    await p2.goto("/you")
    const row = p2.locator("[data-you-push]")
    await expect(row).toHaveAttribute("data-you-push", "needs_install")
    await expect(row).toContainText("Put Pot on your Home Screen first, then turn notifications on here.")
    await row.getByRole("button").click()
    await openedSheet(p2, "Add Pot to your Home Screen")
    await ios.close()
  })

  test("the badge counts what waits on you (installed app)", async ({ page }) => {
    await asPerson(page, "maya")
    await standalone(page, { permission: "granted" })
    await page.addInitScript(() => localStorage.setItem("pot.push", JSON.stringify({ prompted: true, snoozedUntil: 0, subscribed: true })))
    await page.goto("/p/lisbon-trip?sheet=spend")
    const sheet = await openedSheet(page, "Spend from Lisbon Trip")
    await typeAmount(page, "300")
    await sheet.getByRole("button", { name: "Ask the group" }).click()
    await expect(sheet.getByText("Sent to the group")).toBeVisible()
    await sheet.getByRole("button", { name: "Done" }).click()
    await becomePerson(page, "sam")
    await expect.poll(() => page.evaluate(() => (window as unknown as { badgeLog: (number | null)[] }).badgeLog.at(-1))).toBe(1)
  })
})

test("the service worker is served with no-cache and handles only push + notificationclick", async ({ request }) => {
  const res = await request.get("/sw.js")
  expect(res.status()).toBe(200)
  expect(res.headers()["cache-control"]).toContain("no-cache")
  expect(res.headers()["content-type"]).toContain("javascript")
  const body = await res.text()
  expect(body).toContain('addEventListener("push"')
  expect(body).toContain('addEventListener("notificationclick"')
  expect(body).not.toContain('addEventListener("fetch"')
  const badge = await request.get("/icons/badge-96.png")
  expect(badge.status()).toBe(200)
  expect(badge.headers()["content-type"]).toBe("image/png")
})

test("the per-invite link preview: a 1200×630 PNG in the brand's look", async ({ page, request }, info) => {
  const res = await request.get("/j/lisbon-trip/opengraph-image")
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toBe("image/png")
  const png = await res.body()
  expect(png.readUInt32BE(16)).toBe(1200)
  expect(png.readUInt32BE(20)).toBe(630)
  // an unknown Pot falls back to the static brand image
  const unknown = await request.get("/j/no-such-pot-zz/opengraph-image")
  expect(unknown.status()).toBe(200)
  expect(unknown.headers()["content-type"]).toBe("image/png")
  // the landing points og:image at it
  await page.goto(PORTO_INVITE_URL)
  await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /\/j\/porto-weekend\/opengraph-image/)
  if (info.project.name === "mobile-day") {
    await page.setViewportSize({ width: 1200, height: 630 })
    await page.goto("/j/lisbon-trip/opengraph-image")
    await page.screenshot({ path: `${SCREENS}p2-day-og-image.png` })
  }
})
