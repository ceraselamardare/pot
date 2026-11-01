// public/sw.js (D-42): push + notificationclick only. Evaluated with a fake service-worker `self`.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

const SRC = readFileSync(fileURLToPath(new URL("../../../public/sw.js", import.meta.url)), "utf8")
const ORIGIN = "https://pot.app"

function load(windows: { url: string; focus: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }[] = []) {
  const handlers: Record<string, (e: unknown) => void> = {}
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    navigator: { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) },
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null) },
    __potSw: undefined as unknown as { parsePush: (j: unknown) => unknown; targetUrl: (u: string, d: unknown, o: string) => string },
  }
  new Function("self", SRC)(self)
  return { self, handlers }
}

const approval = {
  web_push: 8030,
  notification: {
    title: "Maya needs your OK",
    body: "$300 for Boat trip · Lisbon Trip",
    navigate: `${ORIGIN}/p/lisbon-trip?r=12`,
    tag: "rG7kQ2xV9pL0aZt4bWm1c",
    app_badge: 2,
    data: { type: "approval_needed", url: `${ORIGIN}/p/lisbon-trip?r=12`, pot: "lisbon-trip.pots.x", proposalId: 12 },
  },
  app_badge: 2,
  mutable: false,
}

describe("sw.js", () => {
  it("registers only install/activate/push/notificationclick (no fetch handler, no precache)", () => {
    const { handlers } = load()
    expect(Object.keys(handlers).sort()).toEqual(["activate", "install", "notificationclick", "push"])
    const code = SRC.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    expect(code).not.toMatch(/importScripts|caches\.|addEventListener\("fetch"/)
  })

  it("shows a Declarative Web Push with the badge icon and sets the app badge; ?r=<proposal> becomes ?pid=", async () => {
    const { self, handlers } = load()
    let waited: Promise<unknown> | null = null
    handlers.push!({ data: { json: () => approval, text: () => "" }, waitUntil: (p: Promise<unknown>) => (waited = p) })
    await waited
    expect(self.registration.showNotification).toHaveBeenCalledWith("Maya needs your OK", expect.objectContaining({
      body: "$300 for Boat trip · Lisbon Trip",
      tag: "rG7kQ2xV9pL0aZt4bWm1c",
      icon: "/icon-192.png",
      badge: "/icons/badge-96.png",
      data: expect.objectContaining({ url: `${ORIGIN}/p/lisbon-trip?pid=12`, type: "approval_needed" }),
    }))
    expect(self.navigator.setAppBadge).toHaveBeenCalledWith(2)
  })

  it("accepts the flat fallback and ignores an empty title", () => {
    const { self } = load()
    const sw = self.__potSw
    expect(sw.parsePush({ title: "Your $150 arrived", body: "It's in Lisbon Trip now.", url: "/p/lisbon-trip" })).toMatchObject({ title: "Your $150 arrived", url: "/p/lisbon-trip" })
    expect(sw.parsePush({ notification: { title: "  " } })).toBeNull()
    expect(sw.parsePush(null)).toBeNull()
  })

  it("never opens another origin", () => {
    const { self } = load()
    expect(self.__potSw.targetUrl("https://evil.example/p/x", null, ORIGIN)).toBe(`${ORIGIN}/pots`)
    expect(self.__potSw.targetUrl("/p/lisbon-trip?sheet=add", null, ORIGIN)).toBe(`${ORIGIN}/p/lisbon-trip?sheet=add`)
    expect(self.__potSw.targetUrl("/p/lisbon-trip?tab=members", { proposalId: 3 }, ORIGIN)).toBe(`${ORIGIN}/p/lisbon-trip?tab=members`)
  })

  it("a tap focuses an open window and navigates it softly; otherwise opens one", async () => {
    const win = { url: `${ORIGIN}/pots`, focus: vi.fn(async () => {}), postMessage: vi.fn() }
    const a = load([win])
    let waited: Promise<unknown> | null = null
    const close = vi.fn()
    a.handlers.notificationclick!({ notification: { close, data: { url: `${ORIGIN}/p/lisbon-trip?pid=12` } }, waitUntil: (p: Promise<unknown>) => (waited = p) })
    await waited
    expect(close).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(win.postMessage).toHaveBeenCalledWith({ type: "pot:navigate", url: `${ORIGIN}/p/lisbon-trip?pid=12` })

    const b = load([])
    b.handlers.notificationclick!({ notification: { close: vi.fn(), data: { url: `${ORIGIN}/p/lisbon-trip?sheet=add` } }, waitUntil: (p: Promise<unknown>) => (waited = p) })
    await waited
    expect(b.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/p/lisbon-trip?sheet=add`)
  })
})
