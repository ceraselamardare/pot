// F-23 unit tests: install-context detection (iOS 26/27, in-app, Android), the in-app escape link, the coach caps,
// push support and the automatic pre-prompt, the badge rule.
import { describe, expect, it, vi } from "vitest"
import { applyBadge, badgeAllowed } from "./badge"
import { canAutoShow, coachReducer, coachVisible, MAX_AUTO_SHOWS, SNOOZE_MS, type CoachState } from "./coach"
import { detectContext, escapeBrowser, escapeHref, inAppName, type PlatformEnv } from "./platform"
import { pushSupport, shouldAutoPrompt, urlB64ToBytes } from "./push"

const UA = {
  ios26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  ios27: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0 (iPhone15,2; iOS 26_0; en_US)",
  messengerAndroid: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0]",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
}

const env = (o: Partial<PlatformEnv>): PlatformEnv => ({ ua: UA.desktop, standalone: false, maxTouchPoints: 0, platform: "MacIntel", hasPrompt: false, telegram: false, ...o })

describe("detectContext", () => {
  it.each([
    ["iOS 26 Safari", env({ ua: UA.ios26, platform: "iPhone", maxTouchPoints: 5 }), "ios26"],
    ["iOS 27 Safari (Version/27; the OS token is frozen at 18_x)", env({ ua: UA.ios27, platform: "iPhone", maxTouchPoints: 5 }), "ios27"],
    ["Chrome on iOS", env({ ua: UA.iosChrome, platform: "iPhone", maxTouchPoints: 5 }), "ios_other"],
    ["iPad in desktop mode (MacIntel + touch)", env({ ua: UA.ipadDesktopMode, platform: "MacIntel", maxTouchPoints: 5 }), "ios27"],
    ["Instagram's in-app browser", env({ ua: UA.instagram, platform: "iPhone", maxTouchPoints: 5 }), "in_app"],
    ["Telegram (globals, plain UA)", env({ ua: UA.ios26, telegram: true }), "in_app"],
    ["Android Chrome with the install prompt", env({ ua: UA.android, platform: "Linux armv8l", hasPrompt: true }), "android_prompt"],
    ["Android Chrome without it", env({ ua: UA.android, platform: "Linux armv8l" }), "android_menu"],
    ["desktop", env({}), "desktop"],
    ["installed (standalone wins)", env({ ua: UA.ios27, standalone: true }), "standalone"],
  ])("%s", (_, e, want) => expect(detectContext(e)).toBe(want))

  it("names the in-app browser", () => {
    expect(inAppName(UA.instagram)).toBe("Instagram")
    expect(inAppName(UA.messengerAndroid)).toBe("Facebook")
    expect(inAppName(UA.android)).toBeNull()
    expect(inAppName(UA.android, true)).toBe("Telegram")
  })
})

describe("escapeHref (the in-app escape keeps the invite #secret)", () => {
  const link = "https://pot.app/j/lisbon-trip?i=BYQrv#BRAbJjE8R1Jd"
  it("iOS: x-safari-https with the fragment", () => {
    expect(escapeHref(link, "safari")).toBe("x-safari-https://pot.app/j/lisbon-trip?i=BYQrv#BRAbJjE8R1Jd")
    expect(escapeBrowser(env({ ua: UA.instagram, platform: "iPhone", maxTouchPoints: 5 }))).toBe("safari")
  })
  it("Android: an intent link only without a fragment (it can't carry one); copy covers the rest", () => {
    expect(escapeHref(link, "chrome")).toBeNull()
    const h = escapeHref("https://pot.app/p/lisbon-trip", "chrome")!
    expect(h.startsWith("intent://pot.app/p/lisbon-trip#Intent;scheme=https;package=com.android.chrome;")).toBe(true)
    expect(escapeBrowser(env({ ua: UA.messengerAndroid }))).toBe("chrome")
  })
  it("refuses non-http links", () => {
    expect(escapeHref("javascript:alert(1)", "safari")).toBeNull()
    expect(escapeHref("not a url", "safari")).toBeNull()
  })
})

describe("coach caps (≤ 2 automatic shows, 7-day snooze, never desktop/installed)", () => {
  const s0: CoachState = { shows: 0, snoozedUntil: 0, pending: null, shownFor: null }
  it("a trigger arms the card for that Pot only", () => {
    const s = coachReducer(s0, { type: "TRIGGER", pot: "lisbon-trip" })
    expect(coachVisible(s, "lisbon-trip", "ios27", 1)).toBe(true)
    expect(coachVisible(s, "porto-weekend", "ios27", 1)).toBe(false)
    expect(coachVisible(s, "lisbon-trip", "desktop", 1)).toBe(false)
    expect(coachVisible(s, "lisbon-trip", "standalone", 1)).toBe(false)
  })
  it("counts a show once per Pot, keeps it on screen until answered", () => {
    let s = coachReducer(s0, { type: "TRIGGER", pot: "a" })
    s = coachReducer(s, { type: "SHOWN", pot: "a" })
    s = coachReducer(s, { type: "SHOWN", pot: "a" })
    expect(s.shows).toBe(1)
    s = { ...s, shows: MAX_AUTO_SHOWS }
    expect(canAutoShow(s, "ios26", 1)).toBe(false)
    expect(coachVisible(s, "a", "ios26", 1)).toBe(true) // already counted for this Pot
  })
  it("Not now snoozes 7 days", () => {
    let s = coachReducer(s0, { type: "TRIGGER", pot: "a" })
    s = coachReducer(s, { type: "NOT_NOW", now: 1000 })
    expect(s.pending).toBeNull()
    s = coachReducer(s, { type: "TRIGGER", pot: "b" })
    expect(canAutoShow(s, "android_menu", 1000 + SNOOZE_MS - 1)).toBe(false)
    expect(canAutoShow(s, "android_menu", 1000 + SNOOZE_MS)).toBe(true)
  })
})

describe("push", () => {
  const base = { hasNotification: true, hasSW: true, hasPushManager: true, ios: false, standalone: false }
  it("support: an iOS Safari tab needs install first; missing APIs → unsupported", () => {
    expect(pushSupport({ ...base, ios: true })).toBe("needs_install")
    expect(pushSupport({ ...base, ios: true, standalone: true })).toBe("ready")
    expect(pushSupport({ ...base, hasPushManager: false })).toBe("unsupported")
    expect(pushSupport(base)).toBe("ready")
  })
  it("the pre-prompt opens by itself only on a Home Screen launch that hasn't answered it (D-42)", () => {
    const l = { prompted: false, snoozedUntil: 0, subscribed: false }
    const o = { standalone: true, permission: "default", support: "ready" as const, now: 10 }
    expect(shouldAutoPrompt(l, o)).toBe(true)
    expect(shouldAutoPrompt(l, { ...o, standalone: false })).toBe(false) // never in a browser tab
    expect(shouldAutoPrompt(l, { ...o, permission: "granted" })).toBe(false)
    expect(shouldAutoPrompt({ ...l, prompted: true }, o)).toBe(false)
    expect(shouldAutoPrompt({ ...l, snoozedUntil: 11 }, o)).toBe(false)
  })
  it("decodes the base64url VAPID key", () => {
    expect([...urlB64ToBytes("AQID_-8")]).toEqual([1, 2, 3, 255, 239])
  })
})

describe("badge", () => {
  it("iOS needs the Home Screen app and notification permission; elsewhere only installed", () => {
    expect(badgeAllowed({ hasApi: true, ios: true, standalone: true, permission: "granted" })).toBe(true)
    expect(badgeAllowed({ hasApi: true, ios: true, standalone: true, permission: "default" })).toBe(false)
    expect(badgeAllowed({ hasApi: true, ios: false, standalone: true, permission: "default" })).toBe(true)
    expect(badgeAllowed({ hasApi: true, ios: false, standalone: false, permission: "granted" })).toBe(false)
    expect(badgeAllowed({ hasApi: false, ios: false, standalone: true, permission: "granted" })).toBe(false)
  })
  it("sets, clears, and never throws", async () => {
    const nav = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) } as unknown as Navigator
    await applyBadge(2, nav)
    await applyBadge(0, nav)
    expect((nav as unknown as { setAppBadge: ReturnType<typeof vi.fn> }).setAppBadge).toHaveBeenCalledWith(2)
    expect((nav as unknown as { clearAppBadge: ReturnType<typeof vi.fn> }).clearAppBadge).toHaveBeenCalled()
    const bad = { setAppBadge: async () => Promise.reject(new Error("denied")) } as unknown as Navigator
    await expect(applyBadge(1, bad)).resolves.toBeUndefined()
  })
})
