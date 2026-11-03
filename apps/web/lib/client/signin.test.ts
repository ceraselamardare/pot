// @vitest-environment jsdom
// The sign-in dialog's plumbing (lib/client/signin.ts): safe destinations, the session hint, the ways in per build,
// the ?signin=1 history entry, the opener's request and the hand-off flag.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  beginHandoff,
  closeSignIn,
  currentSignInRequest,
  DEFAULT_NEXT,
  endHandoff,
  forgetSignInRequest,
  handoffActive,
  hasSessionHint,
  isAppRoute,
  modeOf,
  openSignIn,
  resetSignInMemory,
  safeNext,
  settleHandoff,
  signInMethods,
  subscribeHandoff,
} from "./signin"

const clearCookies = () => {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim()
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
  }
}

beforeEach(() => {
  resetSignInMemory()
  localStorage.clear()
  sessionStorage.clear()
  clearCookies()
  window.history.replaceState(null, "", "/")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("safeNext", () => {
  it.each([
    ["/pots?sheet=create", "/pots?sheet=create"],
    ["/pots", "/pots"],
    ["/p/lisbon-trip?r=3#comments", "/p/lisbon-trip?r=3#comments"],
    ["/demo?signin=1#end", "/demo#end"],
    ["/?signin=1", "/"],
  ])("keeps the same-origin path %j", (raw, out) => expect(safeNext(raw)).toBe(out))

  it.each([
    undefined,
    null,
    "",
    "pots",
    "//evil.example",
    "//evil.example/pots",
    "/\\evil.example",
    "\\\\evil.example",
    "/pots\\..\\x",
    "https://evil.example/pots",
    "javascript:alert(1)",
    "data:text/html,hi",
    "/\t/evil.example",
    "/\n/evil.example",
    " /pots",
    "/pots ",
    "/po ts",
  ])("refuses %j (→ the default)", (raw) => expect(safeNext(raw as string | undefined)).toBe(DEFAULT_NEXT))

  it("takes a caller's fallback", () => {
    expect(safeNext("//evil.example", "/pots")).toBe("/pots")
    expect(safeNext("/you", "/pots")).toBe("/you")
  })

  it("start mode for the start CTAs' destination only", () => {
    expect(modeOf(DEFAULT_NEXT)).toBe("start")
    expect(modeOf("/pots?sheet=create&signin=1")).toBe("start")
    expect(modeOf("/pots")).toBe("back")
    expect(modeOf("//evil.example")).toBe("start") // refused → the default
  })

  it("knows the app shell's routes", () => {
    for (const p of ["/pots", "/pots/", "/requests", "/you", "/p/lisbon-trip"]) expect(isAppRoute(p), p).toBe(true)
    for (const p of ["/", "/demo", "/demo/4", "/j/porto-weekend", "/c/x/1", "/give/x", "/potsx", "/pp"]) expect(isAppRoute(p), p).toBe(false)
  })
})

describe("hasSessionHint", () => {
  it("testnet: the pot_hint cookie (non-empty), nothing else", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "testnet")
    expect(hasSessionHint()).toBe(false)
    document.cookie = "other=1; Path=/"
    document.cookie = "xpot_hint=1; Path=/"
    expect(hasSessionHint()).toBe(false)
    document.cookie = "pot_hint=eyJhIjoxfQ; Path=/"
    expect(hasSessionHint()).toBe(true)
    // the mock session means nothing on a live build
    clearCookies()
    localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "maya", kind: "mock" }))
    expect(hasSessionHint()).toBe(false)
  })

  it("testnet: a cookie that can't be read is no", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "testnet")
    vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(hasSessionHint()).toBe(false)
  })

  it("mock: a known persona in pot.mock.session", () => {
    expect(hasSessionHint()).toBe(false)
    localStorage.setItem("pot.mock.session", "null")
    expect(hasSessionHint()).toBe(false)
    localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "zed", kind: "mock" }))
    expect(hasSessionHint()).toBe(false)
    localStorage.setItem("pot.mock.session", "{not json")
    expect(hasSessionHint()).toBe(false)
    localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "alex", kind: "mock" }))
    expect(hasSessionHint()).toBe(true)
  })

  it("mock: storage that throws is no", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    expect(hasSessionHint()).toBe(false)
  })
})

describe("signInMethods", () => {
  it("mock: the full set, simulated; no Google in an in-app browser", () => {
    expect(signInMethods(null)).toEqual({ google: true, email: true, wallet: true, mock: true })
    expect(signInMethods("Instagram")).toEqual({ google: false, email: true, wallet: true, mock: true })
  })

  it("testnet with NEAR Auth (flag + client id): Google, email and the wallet", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "testnet")
    vi.stubEnv("NEXT_PUBLIC_FLAG_NEAR_AUTH", "true")
    vi.stubEnv("NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID", "np8p")
    expect(signInMethods(null)).toEqual({ google: true, email: true, wallet: true, mock: false })
    expect(signInMethods("Messenger")).toEqual({ google: false, email: true, wallet: true, mock: false })
  })

  it("testnet without NEAR Auth (today's hosted build), or a flag without a client id: the wallet alone", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "testnet")
    vi.stubEnv("NEXT_PUBLIC_FLAG_NEAR_AUTH", "false")
    vi.stubEnv("NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID", "np8p")
    expect(signInMethods(null)).toEqual({ google: false, email: false, wallet: true, mock: false })
    vi.stubEnv("NEXT_PUBLIC_FLAG_NEAR_AUTH", "true")
    vi.stubEnv("NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID", "")
    expect(signInMethods(null)).toEqual({ google: false, email: false, wallet: true, mock: false })
  })

  it("agrees with the NEAR Auth client's own switch", async () => {
    const { nearAuthEnabled } = await import("@/lib/signing/near-auth/oidc")
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "testnet")
    for (const [flag, id] of [["true", "x"], ["true", ""], ["false", "x"], ["", ""]] as const) {
      vi.stubEnv("NEXT_PUBLIC_FLAG_NEAR_AUTH", flag)
      vi.stubEnv("NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID", id)
      expect(signInMethods(null).email, `${flag}/${id}`).toBe(nearAuthEnabled())
    }
  })
})

describe("openSignIn / closeSignIn", () => {
  it("pushes ?signin=1 (keeping the path, query and hash) and remembers a safe request", () => {
    window.history.replaceState(null, "", "/demo?step=3#end")
    const push = vi.spyOn(window.history, "pushState")
    openSignIn({ next: "/pots", source: "header" })
    expect(push).toHaveBeenCalledTimes(1)
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/demo?step=3&signin=1#end")
    expect(window.history.state).toMatchObject({ potSignIn: 1 })
    expect(currentSignInRequest()).toEqual({ next: "/pots", source: "header" })
    // a reload: the module forgets, sessionStorage remembers
    resetSignInMemory()
    expect(currentSignInRequest()).toEqual({ next: "/pots", source: "header" })
  })

  it("never stores an unsafe next; a second open while open doesn't push again", () => {
    const push = vi.spyOn(window.history, "pushState")
    openSignIn({ next: "//evil.example", source: "hero" })
    openSignIn({ next: "/pots?sheet=create", source: "final" })
    expect(push).toHaveBeenCalledTimes(1)
    expect(currentSignInRequest()).toEqual({ next: DEFAULT_NEXT, source: "final" })
    sessionStorage.setItem("pot.signin", JSON.stringify({ next: "https://evil.example", source: "nope" }))
    resetSignInMemory()
    expect(currentSignInRequest()).toEqual({ next: DEFAULT_NEXT, source: "deeplink" })
  })

  it("a deep link with no request starts fresh; storage that throws is fine", () => {
    expect(currentSignInRequest()).toEqual({ next: DEFAULT_NEXT, source: "deeplink" })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded")
    })
    openSignIn({ next: "/pots", source: "header" })
    expect(currentSignInRequest()).toEqual({ next: "/pots", source: "header" })
  })

  it("close: back over the entry we pushed, else strip the param in place", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    openSignIn({ source: "hero" })
    closeSignIn()
    expect(back).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem("pot.signin")).toBeNull()

    // a cold deep link (no entry of ours under it)
    window.history.replaceState(null, "", "/?signin=1&x=2#top")
    closeSignIn()
    expect(back).toHaveBeenCalledTimes(1)
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/?x=2#top")
  })

  it("forgetSignInRequest drops both copies", () => {
    openSignIn({ next: "/pots", source: "header" })
    forgetSignInRequest()
    expect(currentSignInRequest()).toEqual({ next: DEFAULT_NEXT, source: "deeplink" })
  })
})

describe("the hand-off", () => {
  it("begins on this path, notifies, and ends when the route changes or on request", () => {
    window.history.replaceState(null, "", "/")
    const seen = vi.fn()
    const off = subscribeHandoff(seen)
    expect(handoffActive()).toBe(false)
    beginHandoff()
    expect(handoffActive()).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)
    settleHandoff("/") // still on the page it started on
    expect(handoffActive()).toBe(true)
    settleHandoff("/pots") // its navigation happened
    expect(handoffActive()).toBe(false)
    expect(seen).toHaveBeenCalledTimes(2)
    beginHandoff()
    endHandoff()
    endHandoff() // idempotent
    expect(handoffActive()).toBe(false)
    expect(seen).toHaveBeenCalledTimes(4)
    off()
    beginHandoff()
    expect(seen).toHaveBeenCalledTimes(4)
  })
})
