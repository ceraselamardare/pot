// @vitest-environment jsdom
// First-run onboarding (components/onboarding): three screens (one idea each, a real app fragment, Skip everywhere,
// dots as buttons, one marigold), then "Help us make Pot better" (chips, all optional, why + privacy note). Creators
// get 3 questions, joiners 2 and copy about their own Pot and its real rules. Plus the host: it opens by itself only
// when due and never on top of another sheet, and the landing's "Start a Pot" gets the intro first.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { findBanned } from "@/i18n/banned.mjs"
import type { SurveyReq, SurveyWire } from "@/lib/survey"

const sendSurvey = vi.fn<(r: SurveyReq) => Promise<SurveyWire>>()
const loadMySurvey = vi.fn<() => Promise<SurveyWire | null>>(async () => null)
const potState = { current: { state: "loading" } as unknown }
vi.mock("@/lib/client/survey", () => ({ sendSurvey: (r: SurveyReq) => sendSurvey(r), loadMySurvey: () => loadMySurvey() }))
vi.mock("@/lib/client/data", () => ({ useMe: () => "maya", usePot: () => potState.current }))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))
const nav = { search: "", pathname: "/pots", replace: vi.fn() }
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
}))
const sheetCalls = { open: vi.fn(), replaceParams: vi.fn(), replace: vi.fn(), close: vi.fn() }
vi.mock("@/lib/client/sheet", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/sheet")>()),
  openSheet: (...a: unknown[]) => sheetCalls.open(...a),
  replaceSheetParams: (f: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(nav.search)
    f(p)
    sheetCalls.replaceParams(p.toString())
  },
  replaceSheet: (...a: unknown[]) => sheetCalls.replace(...a),
  closeSheet: () => sheetCalls.close(),
}))

import { OnboardingHost, OnboardingSheet } from "@/components/onboarding/Onboarding"
import { ENTRY_KEY, ONBOARDING_KEY, resetOnboardingMemory } from "@/lib/client/onboarding"

const onFinish = vi.fn()
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetOnboardingMemory()
  onFinish.mockReset()
  sendSurvey.mockReset()
  loadMySurvey.mockReset().mockResolvedValue(null)
  potState.current = { state: "loading" }
  nav.search = ""
  nav.pathname = "/pots"
  Object.values(sheetCalls).forEach((f) => f.mockReset())
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function sheet() {
  render(<OnboardingSheet open onFinish={onFinish} />)
  return screen.getByRole("dialog", { name: "Welcome to Pot" })
}
const primaries = (d: HTMLElement) => [...d.querySelectorAll("button[data-variant='primary']")]
const heading = (d: HTMLElement) => d.querySelector("[data-step-heading]")!.textContent
const next = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: /^(Next|Continue)$/ }))

// a full walk renders four screens with axe-free fragments: give slow machines room
describe("the intro", { timeout: 20_000 }, () => {
  it("three screens, one idea each, one marigold per screen, plain words", () => {
    const d = sheet()
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      seen.push(heading(d)!)
      expect(primaries(d)).toHaveLength(1)
      expect(findBanned(d.textContent ?? "")).toBeNull()
      next(d)
    }
    expect(seen).toEqual(["Group money with its own rules", "Everyone sees where it goes", "Free, and nothing to set up"])
    expect(heading(d)).toBe("Help us make Pot better")
    expect(primaries(d)).toHaveLength(1)
  })

  it("screen 1 says the rules as sentences (read aloud); the example rows are decorative", () => {
    const d = sheet()
    const rules = d.querySelector("[data-onboarding-rules]")!
    // a new Pot's rules (what Create starts with): the $300 boat trip needs one OK, not 2 of 3
    expect([...rules.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Anyone can spend up to $100 without asking.", "Spends up to $300 need just one OK from someone else who has added money."])
    const example = d.querySelector("[data-onboarding-example]")!
    expect(example.getAttribute("aria-hidden")).toBe("true")
    expect(example.hasAttribute("inert")).toBe(true)
    expect([...example.querySelectorAll("[data-status]")].map((c) => c.textContent)).toEqual(["Instant", "Needs one OK"])
    expect(example.textContent).not.toMatch(/approvals/)
    // the example is built from the app's parts: status chips are icon + word, amounts tabular
    for (const c of example.querySelectorAll("[data-status]")) expect(c.querySelector("svg") && c.textContent!.trim()).toBeTruthy()
    for (const m of example.querySelectorAll("[data-money]")) expect(m.className).toContain("tabular-nums")
  })

  it("dots: one button per screen, the current one marked; they jump", () => {
    const d = sheet()
    const dots = within(within(d).getByRole("list", { name: "Intro" })).getAllByRole("button")
    expect(dots.map((b) => b.getAttribute("aria-label"))).toEqual(["Screen 1 of 3", "Screen 2 of 3", "Screen 3 of 3"])
    expect(dots[0]!.getAttribute("aria-current")).toBe("step")
    fireEvent.click(dots[2]!)
    expect(heading(d)).toBe("Free, and nothing to set up")
    expect(within(d).getByRole("button", { name: "Screen 3 of 3" }).getAttribute("aria-current")).toBe("step")
  })

  it("moving on focuses the new screen's heading", async () => {
    const d = sheet()
    next(d)
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Everyone sees where it goes"))
  })

  it("Skip on every screen ends it (skipped); ✕ ends it (closed)", () => {
    const d = sheet()
    next(d)
    fireEvent.click(within(d).getByRole("button", { name: "Skip the intro" }))
    expect(onFinish).toHaveBeenLastCalledWith("skipped", "skipped")
    fireEvent.click(within(d).getByRole("button", { name: "Close" }))
    expect(onFinish).toHaveBeenLastCalledWith("skipped", "closed")
  })

  it("a joiner reads about their own Pot and its real rules", () => {
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify({ how: "joined", slug: "porto-weekend", potName: "Porto Weekend" }))
    // a Pot from before one OK: the group decides everything over the instant limit
    potState.current = { state: "ready", data: { rules: { instantCap: 50_000_000n }, k: 2, n: 2 } }
    const d = sheet()
    expect(heading(d)).toBe("Welcome to Porto Weekend")
    expect(d.querySelector("[data-onboarding-rules]")!.textContent).toContain("Anyone can spend up to $50 without asking.")
    expect(d.querySelector("[data-onboarding-rules]")!.textContent).toContain("Bigger spends need 2 of 2 approvals.")
    expect(d.querySelector("[data-onboarding-example] [data-status='needs']")!.textContent).toBe("1 of 2 approvals")
  })

  it("a joiner's Pot with one OK says so, and the example follows its limit", () => {
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify({ how: "joined", slug: "ski-chalet", potName: "Ski Chalet" }))
    const pot = (oneOkCap: bigint) => ({ state: "ready", data: { rules: { instantCap: 100_000_000n }, extras: { trust: true, oneOkCap, links: true }, k: 2, n: 3 } })
    potState.current = pot(300_000_000n)
    let d = sheet()
    expect([...d.querySelectorAll("[data-onboarding-rules] li")].map((li) => li.textContent)).toEqual(["Anyone can spend up to $100 without asking.", "Spends up to $300 need just one OK from someone else who has added money."])
    expect(d.querySelector("[data-onboarding-example] [data-status='needs']")!.textContent).toBe("Needs one OK")
    cleanup()
    // one OK only up to $150: the $300 boat trip goes to the group
    potState.current = pot(150_000_000n)
    d = sheet()
    expect(d.querySelector("[data-onboarding-rules]")!.textContent).toContain("Spends up to $150 need just one OK from someone else who has added money.")
    expect(d.querySelector("[data-onboarding-example] [data-status='needs']")!.textContent).toBe("1 of 2 approvals")
  })
})

function toSurvey() {
  const d = sheet()
  for (let i = 0; i < 3; i++) next(d)
  return d
}

describe("Help us make Pot better", { timeout: 20_000 }, () => {
  it("creators: 3 chip questions, why + privacy note, Send waits for an answer", () => {
    const d = toSurvey()
    expect(within(d).getByText("3 quick questions. Your answers help us decide what to build next.")).toBeTruthy()
    expect(within(d).getByText("Only the Pot team sees your answers. They're never shown to your groups.")).toBeTruthy()
    expect([...d.querySelectorAll("[data-survey-question]")].map((q) => q.getAttribute("data-survey-question"))).toEqual(["use", "today", "heard"])
    expect(within(d).getByRole("group", { name: /What will you use Pot for\?/ })).toBeTruthy()
    expect(within(d).getByRole("radiogroup", { name: /How does your group mostly handle shared money today\?/ })).toBeTruthy()
    expect(within(d).getByRole("radiogroup", { name: /How did you first hear about Pot\?/ })).toBeTruthy()
    expect(d.querySelector("[data-survey-optional]")!.textContent).toBe("Optional")
    expect(within(d).getByRole("button", { name: "Send answers" })).toHaveProperty("disabled", true)
    expect(findBanned(d.textContent ?? "")).toBeNull()
  })

  it("multi-select (pressed) and single-select (radios); sends enum ids + context, then finishes", async () => {
    sendSurvey.mockResolvedValue({ version: 1, answers: {}, context: "other", createdAt: "", updatedAt: "" })
    const d = toSurvey()
    const trip = within(d).getByRole("button", { name: "A trip" })
    fireEvent.click(trip)
    fireEvent.click(within(d).getByRole("button", { name: "A club or team" }))
    expect(trip.getAttribute("aria-pressed")).toBe("true")
    const cash = within(d).getByRole("radio", { name: "Cash" })
    fireEvent.click(cash)
    expect(cash.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(d).getByRole("radio", { name: "A shared bank account or card" }))
    expect(cash.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(within(d).getByRole("button", { name: "Send answers" }))
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("sent", "finished"))
    expect(sendSurvey).toHaveBeenCalledWith({ version: 1, answers: { use: ["trip", "club"], today: "bank" }, context: "other" })
  })

  it("a failed send says so and stays; Skip still leaves", async () => {
    sendSurvey.mockRejectedValue(new Error("offline"))
    const d = toSurvey()
    fireEvent.click(within(d).getByRole("button", { name: "Family" }))
    fireEvent.click(within(d).getByRole("button", { name: "Send answers" }))
    expect(await within(d).findByRole("alert")).toHaveProperty("textContent", "Your answers didn't send. Try again, or skip: nothing else depends on them.")
    expect(onFinish).not.toHaveBeenCalled()
    fireEvent.click(within(d).getByRole("button", { name: "Skip" }))
    expect(onFinish).toHaveBeenCalledWith("skipped", "skipped")
  })

  it("joiners get 2 questions (not how they heard: that was the invite), context joined", async () => {
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify({ how: "joined", slug: "porto-weekend", potName: "Porto Weekend" }))
    sendSurvey.mockResolvedValue({ version: 1, answers: {}, context: "joined", createdAt: "", updatedAt: "" })
    const d = toSurvey()
    expect([...d.querySelectorAll("[data-survey-question]")].map((q) => q.getAttribute("data-survey-question"))).toEqual(["use", "today"])
    expect(within(d).getByText("2 quick questions. Your answers help us decide what to build next.")).toBeTruthy()
    fireEvent.click(within(d).getByRole("radio", { name: "One person pays, then chases everyone" }))
    fireEvent.click(within(d).getByRole("button", { name: "Send answers" }))
    await waitFor(() => expect(sendSurvey).toHaveBeenCalledWith({ version: 1, answers: { today: "fronts" }, context: "joined" }))
  })

  it("earlier answers are filled in (a replay, or another browser)", async () => {
    loadMySurvey.mockResolvedValue({ version: 1, answers: { use: ["home"], heard: "search" }, context: "other", createdAt: "", updatedAt: "" })
    const d = toSurvey()
    await within(d).findByText("Your earlier answers are filled in. Change any of them and send again.")
    expect(within(d).getByRole("button", { name: "Housemates and bills" }).getAttribute("aria-pressed")).toBe("true")
    expect(within(d).getByRole("radio", { name: "Search" }).getAttribute("aria-checked")).toBe("true")
    expect(within(d).getByRole("button", { name: "Send answers" })).toHaveProperty("disabled", false)
  })
})

describe("OnboardingHost: when it opens by itself", () => {
  async function host() {
    vi.useFakeTimers()
    render(<OnboardingHost />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
  }
  it("due and nothing open → opens the intro after a beat", async () => {
    await host()
    expect(sheetCalls.open).toHaveBeenCalledWith("intro")
  })
  it("already done → never", async () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ done: true, at: 1, survey: "skipped", via: "skipped" }))
    await host()
    expect(sheetCalls.open).not.toHaveBeenCalled()
  })
  it("another sheet is open (Add money right after You're in!) → waits", async () => {
    window.history.replaceState(null, "", "/p/porto-weekend?sheet=add&amount=150")
    nav.search = "sheet=add&amount=150"
    nav.pathname = "/p/porto-weekend"
    await host()
    expect(sheetCalls.open).not.toHaveBeenCalled()
    window.history.replaceState(null, "", "/")
  })
  it("the landing's Start a Pot → the intro first, ending in Create", async () => {
    window.history.replaceState(null, "", "/pots?sheet=create")
    nav.search = "sheet=create"
    await host()
    expect(sheetCalls.replaceParams).toHaveBeenCalledWith("sheet=intro&then=create")
    window.history.replaceState(null, "", "/")
  })
})
