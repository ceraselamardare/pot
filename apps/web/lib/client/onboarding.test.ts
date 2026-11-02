// @vitest-environment jsdom
// The first-run onboarding flag (localStorage pot.onboarding.v1, versioned) and when the intro may open by itself:
// parsing, storage that throws on read or on write, the in-memory fallback, never stacking on another sheet, the
// landing's "Start a Pot" intercept, the push pre-prompt gate, and the joiner/creator context in sessionStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  autoShow,
  clearEntry,
  ENTRY_KEY,
  markOnboardingDone,
  noteOnboardingShown,
  ONBOARDING_KEY,
  onboardingBusy,
  onboardingDone,
  parseRecord,
  readEntry,
  readFlag,
  rememberEntry,
  resetOnboardingMemory,
  writeFlag,
  type FlagRead,
} from "./onboarding"

const NONE: FlagRead = { ok: true, record: null }
const DONE: FlagRead = { ok: true, record: { done: true, at: 1, survey: "sent", via: "finished" } }
const show = (q: string, flag: FlagRead = NONE, pathname = "/pots", doneThisLoad = false) => autoShow({ flag, doneThisLoad, params: new URLSearchParams(q), pathname })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetOnboardingMemory()
})
afterEach(() => vi.restoreAllMocks())

describe("parseRecord", () => {
  it("reads a stored record", () => {
    expect(parseRecord(JSON.stringify({ done: true, at: 5, survey: "sent", via: "finished" }))).toEqual({ done: true, at: 5, survey: "sent", via: "finished" })
  })
  it("absent, garbled or not done → not done", () => {
    expect(parseRecord(null)).toBeNull()
    expect(parseRecord("")).toBeNull()
    expect(parseRecord("{nope")).toBeNull()
    expect(parseRecord("null")).toBeNull()
    expect(parseRecord(JSON.stringify({ done: false }))).toBeNull()
    expect(parseRecord(JSON.stringify({ done: "yes" }))).toBeNull()
  })
  it("fills unknown fields with safe values", () => {
    expect(parseRecord(JSON.stringify({ done: true, survey: "maybe", via: 3 }))).toEqual({ done: true, at: 0, survey: "skipped", via: "skipped" })
  })
})

describe("readFlag / writeFlag", () => {
  it("no storage, or a read that throws → unreadable", () => {
    expect(readFlag(null)).toEqual({ ok: false })
    expect(
      readFlag({
        getItem: () => {
          throw new Error("SecurityError")
        },
      }),
    ).toEqual({ ok: false })
  })
  it("round-trips through a real Storage under the versioned key", () => {
    expect(writeFlag(localStorage, { done: true, at: 9, survey: "skipped", via: "closed" })).toBe(true)
    expect(JSON.parse(localStorage.getItem(ONBOARDING_KEY)!)).toEqual({ done: true, at: 9, survey: "skipped", via: "closed" })
    expect(readFlag(localStorage)).toEqual({ ok: true, record: { done: true, at: 9, survey: "skipped", via: "closed" } })
    expect(ONBOARDING_KEY).toBe("pot.onboarding.v1")
  })
  it("a write that throws (quota, private mode) → false, never throws", () => {
    expect(
      writeFlag(
        {
          setItem: () => {
            throw new Error("QuotaExceededError")
          },
        },
        { done: true, at: 1, survey: "skipped", via: "skipped" },
      ),
    ).toBe(false)
    expect(writeFlag(null, { done: true, at: 1, survey: "skipped", via: "skipped" })).toBe(false)
  })
})

describe("autoShow", () => {
  it("shows on a bare app screen when not done", () => {
    expect(show("")).toBe("show")
    expect(show("", NONE, "/p/lisbon-trip")).toBe("show")
    expect(show("tab=members", NONE, "/p/lisbon-trip")).toBe("show")
  })
  it("never when done, done earlier in this page's life, or storage can't be read", () => {
    expect(show("", DONE)).toBe("never")
    expect(show("", NONE, "/pots", true)).toBe("never")
    expect(show("", { ok: false })).toBe("never")
    expect(show("sheet=create", DONE)).toBe("never")
  })
  it("waits while another sheet or a request is open (never stacks)", () => {
    for (const q of ["sheet=add&amount=150", "sheet=share", "sheet=push", "sheet=privacy", "r=12", "pid=4", "sheet=create&step=rules", "sheet=intro"]) expect(show(q, NONE, "/p/lisbon-trip"), q).toBe("wait")
  })
  it("the landing's Start a Pot (/pots?sheet=create) → the intro first, then Create", () => {
    expect(show("sheet=create")).toBe("intercept_create")
    expect(show("sheet=create", NONE, "/p/lisbon-trip")).toBe("wait")
  })
})

describe("the page's memory", () => {
  it("marks done in storage and in memory", () => {
    expect(onboardingDone()).toBe(false)
    expect(onboardingBusy()).toBe(true)
    const rec = markOnboardingDone("sent", "finished", 42)
    expect(rec).toEqual({ done: true, at: 42, survey: "sent", via: "finished" })
    expect(parseRecord(localStorage.getItem(ONBOARDING_KEY))).toEqual(rec)
    expect(onboardingDone()).toBe(true)
    expect(onboardingBusy()).toBe(false)
  })
  it("storage refuses the write → still done for the rest of this page", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })
    expect(() => markOnboardingDone("skipped", "skipped")).not.toThrow()
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull()
    expect(onboardingDone()).toBe(true)
  })
  it("storage can't be read → counts as done (never nags), the push pre-prompt isn't held", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    expect(onboardingDone()).toBe(true)
    expect(onboardingBusy()).toBe(false)
  })
  it("shown in this page's life → the push pre-prompt waits even after it's done", () => {
    noteOnboardingShown()
    markOnboardingDone("skipped", "closed")
    expect(onboardingBusy()).toBe(true)
  })
})

describe("entry context (sessionStorage)", () => {
  it("remembers a joiner's Pot, and clears", () => {
    rememberEntry({ how: "joined", slug: "porto-weekend", potName: "Porto Weekend" })
    expect(readEntry()).toEqual({ how: "joined", slug: "porto-weekend", potName: "Porto Weekend" })
    expect(JSON.parse(sessionStorage.getItem(ENTRY_KEY)!).how).toBe("joined")
    clearEntry()
    expect(readEntry()).toBeNull()
  })
  it("refuses anything that isn't a plain slug (it becomes a link)", () => {
    for (const slug of ["../you", "https://evil.example", "", "Porto", "a/b"]) {
      sessionStorage.setItem(ENTRY_KEY, JSON.stringify({ how: "joined", slug, potName: "X" }))
      expect(readEntry(), slug).toBeNull()
    }
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify({ how: "admin", slug: "x", potName: "X" }))
    expect(readEntry()).toBeNull()
    sessionStorage.setItem(ENTRY_KEY, "{nope")
    expect(readEntry()).toBeNull()
  })
  it("storage that throws → no context, no throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })
    expect(() => rememberEntry({ how: "created", slug: "x", potName: "X" })).not.toThrow()
    expect(readEntry()).toBeNull()
  })
})
