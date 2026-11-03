// @vitest-environment jsdom
// The sign-in dialog and panel (components/features/auth; site update 2026-11-03, design-direction 07 §2), with the
// build's flags stubbed: the live variants (NEAR Auth on: Google marigold · email · or · wallet row; NEAR Auth off:
// the wallet alone as the marigold + "Google sign-in isn't on…"; an in-app browser; a browser that can't hold a key),
// the mock's simulated set, the stepper with Cancel / Escape / "Open it again", errors in the app's words, the
// hand-off (SignInDialog), SignInLink's interception, and HomeRedirect standing down in both orderings of the race
// (auth-map §5 risk 1: live builds see the session a task after the sign-in's callback; the mock sees it first).
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import en from "@/i18n/en.json"
import { NearAuthError } from "@/lib/signing/near-auth/oidc"

const tx = (k: keyof typeof en) => en[k] as string

const start = vi.fn()
const complete = vi.fn()
vi.mock("@/lib/signing/near-auth/client", () => ({
  startNearAuthLogin: (o: unknown) => start(o),
  prepareNearAuthLogin: () => Promise.resolve({}),
  completeNearAuthRedirect: () => complete(),
}))
const walletRun = vi.fn()
vi.mock("@/components/features/wallet/WalletSignIn", async (orig) => ({
  ...(await orig<typeof import("@/components/features/wallet/WalletSignIn")>()),
  walletSignIn: () => walletRun(),
}))
const keys = { ok: true }
vi.mock("@/lib/client/keys/device-key-store", () => ({ deviceKeys: () => (keys.ok ? {} : null) }))
const mockJoin = vi.fn()
vi.mock("@/lib/client/actions", () => ({ mockJoinSession: (p: string) => mockJoin(p) }))
const me = { current: null as string | null | undefined }
vi.mock("@/lib/client/data", () => ({ useMe: () => me.current }))
const install = { app: null as string | null }
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0"
vi.mock("@/lib/client/pwa/platform", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/pwa/platform")>()),
  useInstallContext: () => ({ ctx: install.app ? "in_app" : "desktop", installed: false, app: install.app }),
  currentEnv: () => ({ ua: IPHONE, standalone: false, maxTouchPoints: 5, platform: "iPhone", hasPrompt: false, telegram: false }),
}))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))
const nav = { replace: vi.fn(), push: vi.fn() }
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}))

import SignInDialog from "@/components/features/auth/SignInDialog"
import { SignInLink } from "@/components/features/auth/SignInLink"
import { MOCK_WINDOW_MS, SignInPanel } from "@/components/features/auth/SignInPanel"
import { NearAuthCallback } from "@/components/features/auth/NearAuthCallback"
import { HomeRedirect } from "@/components/landing/HomeRedirect"
import { beginHandoff, DEFAULT_NEXT, endHandoff, handoffActive, openSignIn, resetSignInMemory } from "@/lib/client/signin"

const ISSUER = "https://login.auth.example"

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const tick = (ms = 5) => act(() => new Promise((r) => setTimeout(r, ms)))

function live({ nearAuth }: { nearAuth: boolean }) {
  vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "testnet")
  vi.stubEnv("NEXT_PUBLIC_FLAG_NEAR_AUTH", nearAuth ? "true" : "false")
  vi.stubEnv("NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID", nearAuth ? "e2e-client" : "")
  vi.stubEnv("NEXT_PUBLIC_NEAR_AUTH_BASE_URL", ISSUER)
}
const options = () => within(document.querySelector<HTMLElement>("[data-signin-options]")!).getAllByRole("button")
const names = (bs: HTMLElement[]) => bs.map((b) => b.textContent?.trim())
const primaries = () => [...document.querySelectorAll("[data-variant='primary'], a.bg-brand")]

/** A NEAR Auth window as the client opens it inside the tap (cross-origin once it's on NEAR Auth's page). */
function fakeWindow() {
  const w = { closed: false, close: vi.fn(() => (w.closed = true)), focus: vi.fn() }
  Object.defineProperty(w, "location", {
    get() {
      throw new DOMException("Blocked a frame with origin", "SecurityError")
    },
  })
  return w
}

beforeEach(() => {
  resetSignInMemory()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, "", "/")
  ;[start, complete, walletRun, mockJoin, nav.replace, nav.push].forEach((f) => f.mockReset())
  keys.ok = true
  me.current = null
  install.app = null
})
afterEach(() => {
  cleanup()
  document.querySelectorAll(".hot-connector-popup, body > main").forEach((e) => e.remove())
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
  endHandoff()
})

describe("live build, NEAR Auth on (localhost:3000 today, mainnet later)", () => {
  beforeEach(() => live({ nearAuth: true }))

  it("dialog: Google (the marigold, the app's G) · email · or · the wallet as a quiet row; fine print and the demo row", () => {
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} source="hero" />)
    const bs = options()
    expect(names(bs)).toEqual(["Continue with Google", "Continue with email", "I have a NEAR wallet"])
    expect(bs.map((b) => b.getAttribute("data-variant"))).toEqual(["primary", "secondary", "ghost"])
    expect(bs[0]!.querySelector("svg path[fill='#4285F4']")).not.toBeNull() // GoogleMark on its white disc
    expect(primaries()).toHaveLength(1)
    expect(screen.getByText(tx("signin.or"))).toBeTruthy()
    expect(screen.getByText(tx("signin.fine"))).toBeTruthy()
    expect(screen.getByRole("link", { name: tx("signin.demo.quick") }).getAttribute("href")).toBe("/demo")
    expect(screen.queryByText(tx("signin.google_later"))).toBeNull()
    expect(document.querySelector("[data-signin-panel]")).not.toBeNull()
  })

  it("the tour's end and back mode have no demo row", () => {
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} source="tour" />)
    expect(screen.queryByRole("link", { name: tx("signin.demo.quick") })).toBeNull()
    cleanup()
    render(<SignInPanel layout="dialog" next="/pots" source="header" goal="back" />)
    expect(screen.queryByRole("link", { name: tx("signin.demo.quick") })).toBeNull()
  })

  it("Google: the window opens inside the click with returnTo = next; the stepper; the window answers; the hand-off", async () => {
    const w = fakeWindow()
    const flow = deferred<unknown>()
    const open = vi.spyOn(window, "open").mockReturnValue(w as unknown as Window)
    start.mockImplementation(() => {
      window.open("about:blank", "pot-auth", "popup") // client.ts openWindow(), synchronously
      return flow.promise
    })
    const done = vi.fn()
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} source="hero" onDone={done} />)
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    // synchronous: by the time the click returns, NEAR Auth has been started and its window opened
    expect(start).toHaveBeenCalledWith({ connection: "google-oauth2", returnTo: DEFAULT_NEXT })
    expect(open).toHaveBeenCalledTimes(1)
    const steps = within(screen.getByRole("list", { name: tx("signin.steps.a11y") })).getAllByRole("listitem")
    expect(steps.map((s) => s.textContent)).toEqual([tx("signin.step.google"), `${tx("setup.progress.1")}${tx("setup.time")}`, tx("signin.step.start")])
    expect(document.activeElement).toBe(screen.getByRole("button", { name: tx("signin.cancel") }))
    // only the stepper now: no fine print, no demo row
    expect(screen.queryByText(tx("signin.fine"))).toBeNull()
    expect(screen.queryByRole("link", { name: tx("signin.demo.quick") })).toBeNull()

    // a message from another origin changes nothing; NEAR Auth's web_message moves on to setting up
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { type: "authorization_response" } })))
    expect(screen.queryByText(tx("signin.step.done"))).toBeNull()
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: ISSUER, data: { type: "authorization_response", response: { state: "s" } } })))
    expect(screen.getByText(tx("signin.step.done"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: tx("signin.cancel") })).toBeNull()

    await act(async () => flow.resolve({}))
    expect(done).toHaveBeenCalledTimes(1)
  })

  it("email: NEAR Auth's own page (no connection), '① Finish in the sign-in window'", () => {
    start.mockReturnValue(new Promise(() => {}))
    render(<SignInPanel layout="dialog" next="/pots" goal="back" />)
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }))
    expect(start).toHaveBeenCalledWith({ connection: undefined, returnTo: "/pots" })
    const steps = within(screen.getByRole("list", { name: tx("signin.steps.a11y") })).getAllByRole("listitem")
    expect(steps[0]!.textContent).toBe(tx("signin.step.window"))
    expect(steps[2]!.textContent).toBe(tx("signin.step.back"))
  })

  it("Cancel closes the sign-in window and goes back to the options (focus on the one used); a late success still signs in", async () => {
    const w = fakeWindow()
    vi.spyOn(window, "open").mockReturnValue(w as unknown as Window)
    const flow = deferred<unknown>()
    start.mockImplementation(() => (window.open("about:blank", "pot-auth"), flow.promise))
    const done = vi.fn()
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} onDone={done} />)
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    fireEvent.click(screen.getByRole("button", { name: tx("signin.cancel") }))
    expect(w.close).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue with Google" }))
    // the walked-away attempt's late "cancelled" stays silent; had it finished, the session would stand
    await act(async () => flow.resolve({}))
    expect(done).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("Cancel never closes a window still on our blank page (that would push NEAR Auth to its full-page redirect)", async () => {
    vi.useFakeTimers()
    const w = { closed: false, close: vi.fn(), focus: vi.fn(), location: { href: "about:blank" } }
    vi.spyOn(window, "open").mockReturnValue(w as unknown as Window)
    start.mockImplementation(() => (window.open("about:blank", "pot-auth"), new Promise(() => {})))
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    fireEvent.click(screen.getByRole("button", { name: tx("signin.cancel") }))
    expect(w.close).not.toHaveBeenCalled()
    // once NEAR Auth's page is in it (cross-origin), it closes
    Object.defineProperty(w, "location", {
      get() {
        throw new DOMException("cross-origin", "SecurityError")
      },
    })
    await act(async () => vi.advanceTimersByTime(150))
    expect(w.close).toHaveBeenCalledTimes(1)
  })

  it("Escape while the window is up means Cancel, and never reaches the dialog under it", () => {
    const w = fakeWindow()
    vi.spyOn(window, "open").mockReturnValue(w as unknown as Window)
    start.mockImplementation(() => (window.open("about:blank", "pot-auth"), new Promise(() => {})))
    const below = vi.fn()
    document.addEventListener("keydown", below)
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(below).not.toHaveBeenCalled()
    expect(w.close).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy()
    // idle again: Escape is the dialog's to handle
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(below).toHaveBeenCalledTimes(1)
    document.removeEventListener("keydown", below)
  })

  it("'Can't see it? Open it again' brings the window forward, or starts again in the tap once it's closed", () => {
    const w = fakeWindow()
    vi.spyOn(window, "open").mockReturnValue(w as unknown as Window)
    start.mockImplementation(() => (window.open("about:blank", "pot-auth"), new Promise(() => {})))
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    fireEvent.click(screen.getByRole("button", { name: tx("signin.step.again") }))
    expect(w.focus).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    w.closed = true
    fireEvent.click(screen.getByRole("button", { name: tx("signin.step.again") }))
    expect(start).toHaveBeenCalledTimes(2)
  })

  it.each([
    [new NearAuthError("blocked"), "auth.popup_blocked"],
    [new NearAuthError("unavailable"), "auth.service_down"],
    [new NearAuthError("timeout"), "signin.timeout"],
    [new NearAuthError("failed"), "signin.failed"],
    [Object.assign(new Error("x"), { reason: "auth_unavailable" }), "auth.service_down"],
    [new Error("boom"), "signin.failed"],
  ] as const)("a failure says what happened: %s → %s", async (err, key) => {
    start.mockReturnValue(Promise.reject(err))
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue with Google" })))
    expect(screen.getByRole("alert").textContent).toBe(tx(key))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue with Google" }))
  })

  it("a closed window is a silent cancel", async () => {
    start.mockReturnValue(Promise.reject(new NearAuthError("cancelled")))
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue with Google" })))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy()
  })

  it("an in-app browser: Open in Safari leads (the marigold, to `next`); no Google; email and the wallet below", () => {
    install.app = "Instagram"
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    expect(screen.getByRole("heading", { level: 3, name: "Open Pot in Safari to sign in" })).toBeTruthy()
    expect(screen.getByText("Google sign-in doesn't work inside Instagram.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open in Safari" }).getAttribute("href")).toBe("x-safari-http://localhost:3000/pots?sheet=create")
    expect(screen.getByText(tx("signin.inapp.here"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull()
    expect(options().map((b) => b.getAttribute("data-variant"))).toEqual(["secondary", "ghost"])
    expect(primaries()).toHaveLength(1)
  })

  it("a browser that can't hold a key: one line instead of Google and email; the wallet leads", () => {
    keys.ok = false
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    expect(screen.getByText(tx("signin.unsupported_browser"))).toBeTruthy()
    expect(names(options())).toEqual([tx("signin.wallet.only")])
    expect(options()[0]!.getAttribute("data-variant")).toBe("primary")
    expect(screen.queryByText(tx("signin.google_later"))).toBeNull() // Google is on; this browser can't
  })

  it("the app's signed-out screen: the same options, [See a demo] secondary, 'What is Pot?' a quiet link", () => {
    render(<SignInPanel layout="page" goal="back" />)
    expect(names(options())).toEqual(["Continue with Google", "Continue with email", "I have a NEAR wallet"])
    const demo = screen.getByRole("link", { name: tx("signin.demo") })
    expect(demo.getAttribute("href")).toBe("/demo")
    expect(demo.className).not.toContain("bg-brand")
    expect(screen.getByRole("link", { name: tx("signin.home") }).getAttribute("href")).toBe("/")
    expect(primaries()).toHaveLength(1)
  })
})

describe("live build, NEAR Auth off (today's hosted testnet)", () => {
  beforeEach(() => live({ nearAuth: false }))

  it("dialog: the wallet alone, as the marigold 'Continue with a NEAR wallet', and why there's no Google", () => {
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    expect(names(options())).toEqual([tx("signin.wallet.only")])
    expect(options()[0]!.getAttribute("data-variant")).toBe("primary")
    expect(screen.getByText(tx("signin.google_later"))).toBeTruthy()
    expect(screen.queryByText(tx("signin.or"))).toBeNull()
    expect(primaries()).toHaveLength(1)
    // the wallet opens NEAR Connect's own picker, not a sign-in window: no "opens in a new window" line
    expect(screen.queryByText(tx("signin.fine"))).toBeNull()
    expect(screen.getByText(tx("signin.fine.wallet"))).toBeTruthy()
  })

  it("page: the same marigold keeps the name the suites press, 'I have a NEAR wallet'", () => {
    render(<SignInPanel layout="page" goal="start" />)
    expect(names(options())).toEqual([tx("landing.more.wallet")])
    expect(options()[0]!.getAttribute("data-variant")).toBe("primary")
  })

  it("wallet: '① Confirm it's you…', then signed in; a limited key says so and comes back", async () => {
    const w1 = deferred<string>()
    walletRun.mockReturnValueOnce(w1.promise)
    const done = vi.fn()
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} onDone={done} />)
    fireEvent.click(screen.getByRole("button", { name: tx("signin.wallet.only") }))
    const steps = within(screen.getByRole("list", { name: tx("signin.steps.a11y") })).getAllByRole("listitem")
    expect(steps.map((s) => s.textContent)).toEqual([tx("signin.step.wallet"), tx("signin.step.session"), tx("signin.step.start")])
    // and screen readers hear the step (the app's own live region sits outside the dialog)
    expect(screen.getByRole("status").textContent).toBe(tx("signin.step.wallet"))
    expect(screen.queryByRole("button", { name: tx("signin.step.again") })).toBeNull()
    await act(async () => w1.resolve("signin.wallet.limited"))
    expect(screen.getByRole("alert").textContent).toBe(tx("signin.wallet.limited"))
    expect(document.activeElement).toBe(screen.getByRole("button", { name: tx("signin.wallet.only") }))
    walletRun.mockResolvedValueOnce("ok")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: tx("signin.wallet.only") })))
    expect(done).toHaveBeenCalledTimes(1)
  })

  it("Escape while NEAR Connect's picker is up dismisses the picker (its own 'User rejected' = a silent cancel)", async () => {
    const picker = document.createElement("div")
    picker.className = "hot-connector-popup"
    const backdrop = document.createElement("div")
    backdrop.className = "modal-container"
    const rejected = vi.fn()
    backdrop.addEventListener("click", rejected)
    picker.append(backdrop)
    const w = deferred<string>()
    walletRun.mockReturnValueOnce(w.promise)
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} />)
    fireEvent.click(screen.getByRole("button", { name: tx("signin.wallet.only") }))
    document.body.append(picker)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(rejected).toHaveBeenCalledTimes(1)
    await act(async () => w.resolve("cancelled"))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: tx("signin.wallet.only") })).toBeTruthy()
    picker.remove()
  })
})

describe("mock build", () => {
  it("simulates the full set; any option signs in as Alex after the window beat", async () => {
    vi.useFakeTimers()
    let resolve!: () => void
    mockJoin.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const done = vi.fn()
    render(<SignInPanel layout="dialog" next={DEFAULT_NEXT} onDone={done} />)
    expect(names(options())).toEqual(["Continue with Google", "Continue with email", "I have a NEAR wallet"])
    expect(screen.getByText(tx("claim.signin.mock"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }))
    expect(mockJoin).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(MOCK_WINDOW_MS))
    expect(mockJoin).toHaveBeenCalledWith("alex")
    expect(screen.getByText(tx("signin.step.done"))).toBeTruthy()
    await act(async () => resolve())
    expect(done).toHaveBeenCalledTimes(1)
  })
})

describe("SignInDialog: the hand-off", () => {
  beforeEach(() => live({ nearAuth: true }))

  it("start mode by default; a session while open → beginHandoff, gone at once, router.replace(next)", () => {
    const { rerender } = render(<SignInDialog open />)
    expect(screen.getByRole("dialog", { name: tx("signin.start.title") })).toBeTruthy()
    me.current = "u-1.users.pots.testnet"
    rerender(<SignInDialog open />)
    expect(handoffActive()).toBe(true)
    expect(nav.replace).toHaveBeenCalledWith(DEFAULT_NEXT)
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("the header's 'Sign in' (next /pots): 'Sign in to Pot', and a sign-in lands on /pots", async () => {
    openSignIn({ next: "/pots", source: "header" })
    const flow = deferred<unknown>()
    start.mockReturnValue(flow.promise)
    render(<SignInDialog open />)
    const d = screen.getByRole("dialog", { name: tx("signin.title") })
    expect(d.getAttribute("aria-describedby")).toBeTruthy()
    expect(screen.getByText(tx("signin.back.body"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))
    expect(start).toHaveBeenCalledWith({ connection: "google-oauth2", returnTo: "/pots" })
    await act(async () => flow.resolve({}))
    expect(nav.replace).toHaveBeenCalledWith("/pots")
    expect(handoffActive()).toBe(true)
  })
})

describe("SignInDialog under NEAR Connect's picker (a stand-in; the real one is never opened)", () => {
  beforeEach(() => live({ nearAuth: false }))

  /** What NEAR Connect does (build/popups/Popup.js): a root on body, a fixed container at z-index 1e8, its rows. */
  function standInPicker() {
    const root = document.createElement("div")
    root.className = "hot-connector-popup"
    const backdrop = document.createElement("div")
    backdrop.className = "modal-container"
    backdrop.style.cssText = "position:fixed;inset:0;z-index:100000000"
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = "Stand-in wallet"
    const pressed = vi.fn()
    button.addEventListener("click", pressed)
    // its own backdrop: "User rejected" + destroy
    backdrop.addEventListener("click", (e) => e.target === backdrop && root.remove())
    backdrop.append(button)
    root.append(backdrop)
    return { root, button, pressed }
  }

  it("non-modal while it's up (nothing hidden, focus can stay there, pressing it never closes us); modal again after", async () => {
    const behind = document.createElement("main")
    behind.innerHTML = "<button type='button'>Behind</button>"
    document.body.append(behind)
    render(<SignInDialog open />)
    const dialog = screen.getByRole("dialog", { name: tx("signin.start.title") })
    // modal at first: the page behind is hidden from screen readers; focus lands on the title (a frame after opening)
    await waitFor(() => expect(behind.getAttribute("aria-hidden")).toBe("true"))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: tx("signin.start.title") })))

    const p = standInPicker()
    await act(async () => document.body.append(p.root))
    await waitFor(() => expect(behind.getAttribute("aria-hidden")).toBeNull())
    expect(p.root.closest("[aria-hidden='true'], [inert]")).toBeNull()
    expect(p.button.closest("[aria-hidden='true'], [inert]")).toBeNull()
    act(() => p.button.focus())
    await tick(50)
    expect(document.activeElement).toBe(p.button) // no trap pulls it back
    fireEvent.click(p.button)
    expect(p.pressed).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("dialog", { name: tx("signin.start.title") })).toBe(dialog)

    // a close request while it's up (Escape here) dismisses the picker, the topmost layer, not us
    fireEvent.keyDown(p.button, { key: "Escape" })
    await waitFor(() => expect(p.root.isConnected).toBe(false))
    expect(screen.getByRole("dialog", { name: tx("signin.start.title") })).toBe(dialog)
    // modal again: the page hidden, focus back inside the sheet
    await waitFor(() => expect(behind.getAttribute("aria-hidden")).toBe("true"))
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    behind.remove()
  })

  it("a picker that hides itself (display:none, as NEAR Connect does) counts as gone", async () => {
    const behind = document.createElement("main")
    document.body.append(behind)
    render(<SignInDialog open />)
    const p = standInPicker()
    await act(async () => document.body.append(p.root))
    await waitFor(() => expect(behind.getAttribute("aria-hidden")).toBeNull())
    await act(async () => void (p.root.style.display = "none"))
    await waitFor(() => expect(behind.getAttribute("aria-hidden")).toBe("true"))
    p.root.remove()
    behind.remove()
  })
})

describe("HomeRedirect", () => {
  it("signed in, no hand-off: /pots", async () => {
    me.current = "maya"
    render(<HomeRedirect />)
    await tick()
    expect(nav.replace).toHaveBeenCalledWith("/pots")
  })

  it("live ordering: the hand-off starts, then the session shows up a task later → it stands down", async () => {
    const { rerender } = render(<HomeRedirect />)
    beginHandoff()
    me.current = "u-1"
    rerender(<HomeRedirect />)
    await tick()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("mock ordering: the session shows up first, the hand-off a microtask later → it still stands down", async () => {
    const { rerender } = render(<HomeRedirect />)
    act(() => {
      me.current = "alex"
      rerender(<HomeRedirect />)
      queueMicrotask(beginHandoff)
    })
    await tick()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("a hand-off that lets go (a callback that wasn't ours) → the redirect resumes", async () => {
    beginHandoff()
    me.current = "u-1"
    render(<HomeRedirect />)
    await tick()
    expect(nav.replace).not.toHaveBeenCalled()
    act(() => endHandoff())
    await tick()
    expect(nav.replace).toHaveBeenCalledWith("/pots")
  })
})

describe("NearAuthCallback", () => {
  it("holds the hand-off while it works; lets go when the callback isn't ours", async () => {
    window.history.replaceState(null, "", "/?code=c&state=s")
    const r = deferred<{ kind: "none" }>()
    complete.mockReturnValue(r.promise)
    render(<NearAuthCallback />)
    await waitFor(() => expect(complete).toHaveBeenCalled())
    expect(handoffActive()).toBe(true)
    await act(async () => r.resolve({ kind: "none" }))
    expect(handoffActive()).toBe(false)
  })

  it("a failed callback lets go too", async () => {
    window.history.replaceState(null, "", "/?error=access_denied&state=s")
    complete.mockResolvedValue({ kind: "error", returnTo: "/pots", error: new NearAuthError("cancelled") })
    render(<NearAuthCallback />)
    await waitFor(() => expect(complete).toHaveBeenCalled())
    await tick()
    expect(handoffActive()).toBe(false)
  })
})

describe("SignInLink", () => {
  it("a real link to next; signed out, a plain click opens the dialog in place", () => {
    render(<SignInLink source="hero">Start a Pot</SignInLink>)
    const a = screen.getByRole("link", { name: "Start a Pot" })
    expect(a.getAttribute("href")).toBe(DEFAULT_NEXT)
    expect(a.getAttribute("data-opens-dialog")).toBe("true")
    // never aria-haspopup: the buttons' press scale is `active:not-aria-[haspopup]:scale-[.97]`
    expect(a.getAttribute("aria-haspopup")).toBeNull()
    expect(a.getAttribute("data-signin-source")).toBe("hero")
    const ev = createEvent.click(a, { button: 0 })
    fireEvent(a, ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(window.location.search).toBe("?signin=1")
  })

  it("a modified click is the browser's (a new tab); a signed-in browser just navigates", () => {
    render(<SignInLink source="hero">Start a Pot</SignInLink>)
    const a = () => screen.getByRole("link", { name: "Start a Pot" })
    const ev = createEvent.click(a(), { button: 0, metaKey: true })
    fireEvent(a(), ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(window.location.search).toBe("")
    localStorage.setItem("pot.mock.session", JSON.stringify({ persona: "maya", kind: "mock" }))
    cleanup()
    render(<SignInLink source="tour">Start a real Pot</SignInLink>)
    const b = screen.getByRole("link", { name: "Start a real Pot" })
    expect(b.getAttribute("data-opens-dialog")).toBeNull()
    const ev2 = createEvent.click(b, { button: 0 })
    fireEvent(b, ev2)
    expect(window.location.search).toBe("")
  })

  it("an unsafe next never becomes the href", () => {
    render(
      <SignInLink source="deeplink" next="//evil.example">
        Go
      </SignInLink>,
    )
    expect(screen.getByRole("link", { name: "Go" }).getAttribute("href")).toBe(DEFAULT_NEXT)
  })
})
