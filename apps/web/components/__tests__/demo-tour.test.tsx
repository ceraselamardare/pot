// @vitest-environment jsdom
// The /demo tour (plan/design-direction/06 §1.3, §8.4 "Unit"): 14 steps, caption word counts and the 2-minute
// budget, the main-path copy (`tour.*`) is never allowlisted and never says a banned word, every key the tour names
// exists, each step's beats resolve in the dataset, every state of the stage is jargon-free with at most one
// marigold, and the player's rules (bounds, the 1.2 s hold, the one burst, deep links, legacy #beat-k).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { peopleVMs } from "@/components/demo/Chapter"
import { getChapter, sceneAt } from "@/components/demo/data"
import { Scene } from "@/components/demo/Scenes"
import { Stage } from "@/components/demo/Stage"
import {
  MIN_CHECKING_MS,
  stepForLegacyBeat,
  TOUR,
  TOUR_CHAPTER_START,
  TOUR_COVER,
  TOUR_COVER_BUDGET_MS,
  TOUR_END,
  TOUR_END_BUDGET_MS,
  TOUR_PARTS,
  TOUR_STATES,
} from "@/components/demo/tour"
import { captionKeyAt, reduceTour, showsTapHint, startState, stateFromHash, TourPlayer, useTour } from "@/components/demo/TourPlayer"
import { tourPhones } from "@/components/demo/TourPage"
import en from "@/i18n/en.json"
import { ALLOW_KEYS, ALLOW_PREFIXES, findBanned, isAllowlisted } from "@/i18n/banned.mjs"
import { phoneStory } from "@/components/demo/Chapter"

window.matchMedia ??= ((query: string) =>
  ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList) as typeof window.matchMedia

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ""
})

const keys = en as Record<string, string>
const words = (s: string) => s.trim().split(/\s+/).length

describe("the tour's shape (S1-S3)", () => {
  it("has 14 steps in 5 parts, plus a cover and an end", () => {
    expect(TOUR).toHaveLength(14)
    expect(TOUR_STATES).toBe(16)
    expect(TOUR.map((s) => s.n)).toEqual([...Array(14)].map((_, i) => i + 1))
    expect(TOUR_PARTS.map((p) => p.n)).toEqual([1, 2, 3, 4, 5])
    // parts are contiguous and in order
    expect(TOUR.map((s) => s.part)).toEqual([1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5])
  })

  it("keeps every caption ≤ 25 words and the whole walk ≤ 280 words and ≤ 2 minutes", () => {
    let total = 0
    for (const s of TOUR) {
      const n = words(keys[s.captionKey]!)
      expect(n, s.captionKey).toBeLessThanOrEqual(25)
      total += n
    }
    expect(total).toBeLessThanOrEqual(280)
    const ms = TOUR.reduce((a, s) => a + s.budgetMs, 0) + TOUR_COVER_BUDGET_MS + TOUR_END_BUDGET_MS
    expect(ms).toBeLessThanOrEqual(120_000)
  })

  it("has the tap steps, the one hold + burst and the two pushes of 06 §2", () => {
    expect(TOUR.filter((s) => s.tap).map((s) => s.n)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(TOUR.filter((s) => s.hold).map((s) => s.n)).toEqual([7])
    expect(TOUR.filter((s) => s.burst).map((s) => s.n)).toEqual([7])
    expect(TOUR.filter((s) => s.push).map((s) => s.n)).toEqual([10, 13])
  })
})

describe("main-path copy (S4)", () => {
  it("never allowlists tour.*", () => {
    expect(ALLOW_PREFIXES.some((p) => p.startsWith("tour") || "tour.".startsWith(p))).toBe(false)
    expect(ALLOW_KEYS.some((k) => k.startsWith("tour."))).toBe(false)
    expect(isAllowlisted("tour.s1")).toBe(false)
  })

  it("says no banned word in any tour.* string", () => {
    const tour = Object.entries(keys).filter(([k]) => k.startsWith("tour."))
    expect(tour.length).toBeGreaterThan(50)
    for (const [k, v] of tour) expect(findBanned(v), `${k}: ${v}`).toBeNull()
  })

  it("has every key the tour names", () => {
    const need = [
      ...TOUR.map((s) => s.captionKey),
      ...TOUR_PARTS.flatMap((p) => [p.nameKey, p.summaryKey]),
      ...["meta.title", "meta.description", "cover.title", "cover.body", "cover.start", "sim", "skip", "you", "part", "progress", "progress.label"].map((k) => `tour.${k}`),
      ...TOUR.flatMap((s) => (s.holdCaptionKey ? [s.holdCaptionKey] : [])),
      ...["back", "next", "finish", "checking", "phone.label", "phone.cover", "phone.tap_hint", "tap_hint", "hood.label", "hood.hint", "list.title", "list.part"].map((k) => `tour.${k}`),
      ...["title", "l1", "l2", "l3", "l4", "l5", "cta", "note", "home"].map((k) => `tour.end.${k}`),
      ...["maya", "sam", "leo", "label"].map((k) => `tour.cast.${k}`),
      "demo.near.title",
      "demo.near.steps",
      "demo.near.all",
      "demo.all.title",
    ]
    expect(need.filter((k) => !(k in keys))).toEqual([])
  })
})

describe("step → beat mapping", () => {
  it("resolves every step's beats in the dataset, with the dataset's persona, push and celebration", () => {
    for (const s of TOUR) {
      for (const [c, b] of s.beats) expect(getChapter(c).beats[b - 1], `step ${s.n}: c${c} b${b}`).toBeDefined()
      const [c, b] = s.beats.at(-1)!
      expect(getChapter(c).beats[b - 1]!.you, `step ${s.n} persona`).toBe(s.you)
      if (s.push) expect(getChapter(s.beats[0]![0]).beats[s.beats[0]![1] - 1]!.appBefore, `step ${s.n} push`).toBeDefined()
      if (s.burst) expect(s.beats.some(([c, b]) => getChapter(c).beats[b - 1]!.celebrate)).toBe(true)
    }
  })

  it("draws a live primary on every tap step and none elsewhere", () => {
    const people = peopleVMs()
    for (const s of TOUR) {
      const [c, b] = s.beats.at(-1)!
      const ch = getChapter(c)
      const { container, unmount } = render(<Scene scene={sceneAt(ch, b - 1)} story={phoneStory(ch)} you={s.you} people={people} tapped={false} active={s.tap} onPrimary={() => {}} burst={0} />)
      expect(container.querySelectorAll("[data-phone-primary]").length, `step ${s.n}`).toBe(s.tap ? 1 : 0)
      unmount()
    }
  })

  it("maps the old chapter routes and #beat-k links to the nearest step", () => {
    expect(TOUR_CHAPTER_START).toEqual({ 1: 1, 2: 3, 3: 4, 4: 6, 5: 8, 6: 12 })
    expect(stepForLegacyBeat(4, 1)).toBe(6)
    expect(stepForLegacyBeat(4, 7)).toBe(7)
    expect(stepForLegacyBeat(3, 2)).toBe(4)
    expect(stepForLegacyBeat(3, 7)).toBe(5)
    expect(stepForLegacyBeat(5, 8)).toBe(10)
    expect(stepForLegacyBeat(6, 10)).toBe(14)
    expect(stateFromHash("#step-7", null)).toBe(7)
    expect(stateFromHash("#step-15", null)).toBeNull()
    expect(stateFromHash("#end", null)).toBe(TOUR_END)
    expect(stateFromHash("#beat-8", 5)).toBe(10)
    expect(stateFromHash("#beat-8", null)).toBeNull()
  })
})

describe("the stage", () => {
  const phones = tourPhones()
  const people = peopleVMs()

  it("is jargon-free with at most one marigold control in every state (S4, S5)", () => {
    for (let at = TOUR_COVER; at <= TOUR_END; at++) {
      const { container, unmount } = render(
        <TourPlayer initial={at} chapter={null}>
          <Stage phones={phones} people={people} />
        </TourPlayer>,
      )
      const stage = container.querySelector("[data-tour-stage]")!
      expect(stage.getAttribute("data-state")).toBe(String(at))
      const text = stage.textContent ?? ""
      const labels = [...stage.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label")).join(" ")
      expect(findBanned(text), `state ${at}: ${text.slice(0, 80)}`).toBeNull()
      expect(findBanned(labels), `state ${at} labels`).toBeNull()
      const marigold = [...stage.querySelectorAll("a, button")].filter((e) => e.className.split(/\s+/).includes("bg-brand") && !e.closest("[inert]"))
      expect(marigold.length, `state ${at}`).toBeLessThanOrEqual(1)
      unmount()
    }
  })

  it("speaks 'Step n of 14' and the caption after Next, focusing nothing new", () => {
    render(
      <TourPlayer initial={1} chapter={null}>
        <Stage phones={phones} people={people} />
      </TourPlayer>,
    )
    fireEvent.click(screen.getByRole("button", { name: /Next/ }))
    expect(document.querySelector("[data-tour-live]")!.textContent).toBe(`Step 2 of 14. ${keys["tour.s2"]}`)
    expect(document.querySelector("[data-tour-stage]")!.getAttribute("data-state")).toBe("2")
  })
})

function Probe() {
  const p = useTour()
  return <output data-testid="probe">{JSON.stringify({ at: p.at, frame: p.frame, holding: p.holding, burst: p.burstLive })}</output>
}
const probe = () => JSON.parse(screen.getByTestId("probe").textContent!) as { at: number; frame: number; holding: boolean; burst: boolean }

describe("the tour player", () => {
  it("steps within bounds; Back is a no-op on step 1 and the end's ← returns to 14", () => {
    let s = startState(1, true)
    expect(reduceTour(s, { type: "back" }).at).toBe(1)
    s = startState(TOUR_END, true)
    expect(reduceTour(s, { type: "next", reduced: false }).at).toBe(TOUR_END)
    expect(reduceTour(s, { type: "back" }).at).toBe(14)
    expect(reduceTour(startState(TOUR_COVER, true), { type: "next", reduced: false }).at).toBe(1)
  })

  it("plays step 7 as checking (held 1.2 s) → approved with the burst → sent, once", () => {
    vi.useFakeTimers()
    render(
      <TourPlayer initial={6} chapter={null}>
        <Probe />
      </TourPlayer>,
    )
    expect(probe()).toMatchObject({ at: 6 })
    const next = () => act(() => void fireEvent.keyDown(window, { key: "ArrowRight" }))
    next()
    expect(probe()).toMatchObject({ at: 7, frame: 0, holding: true, burst: true })
    next()
    expect(probe().at).toBe(7) // held
    act(() => void vi.advanceTimersByTime(MIN_CHECKING_MS))
    expect(probe()).toMatchObject({ at: 7, frame: 1, holding: false })
    act(() => void vi.advanceTimersByTime(600))
    expect(probe()).toMatchObject({ frame: 2 })
    // Back + Next: the sequence runs again, the burst does not
    act(() => void fireEvent.keyDown(window, { key: "ArrowLeft" }))
    next()
    expect(probe()).toMatchObject({ at: 7, frame: 0, holding: true, burst: false })
  })

  it("opens a deep link at its step on the settled screen, without a burst", () => {
    window.location.hash = "#step-7"
    render(
      <TourPlayer initial={0} chapter={null}>
        <Probe />
      </TourPlayer>,
    )
    expect(probe()).toMatchObject({ at: 7, frame: 2, holding: false, burst: false })
  })

  it("never bursts under reduced motion, and lands on the settled screen after the hold", () => {
    let s = reduceTour(startState(6, true), { type: "next", reduced: true })
    expect(s).toMatchObject({ at: 7, holding: true, burstLive: false })
    s = reduceTour(s, { type: "release", reduced: true })
    expect(s).toMatchObject({ holding: false, frame: 2 })
  })

  it("keeps step 7's caption on 'checking' while Next is held, then the approval (polish after QA, F3)", () => {
    let s = reduceTour(startState(6, true), { type: "next", reduced: false })
    expect(captionKeyAt(s)).toBe("tour.s7.checking")
    expect(s.spoken).toBe("")
    s = reduceTour(s, { type: "release", reduced: false })
    expect(captionKeyAt(s)).toBe("tour.s7")
    expect(s.spoken).toContain(keys["tour.s7"])
    // a deep link or Back lands on the settled screen and its caption
    expect(captionKeyAt(startState(7, true))).toBe("tour.s7")
  })

  it("shows the visible tap hint on the first tap step only, until the phone's own button is used (F5)", () => {
    let s = startState(TOUR_COVER, true)
    expect(showsTapHint(s)).toBe(false)
    s = reduceTour(s, { type: "next", reduced: false })
    expect(showsTapHint(s)).toBe(true)
    // Next instead of the phone: the hint stays behind on step 1
    s = reduceTour(s, { type: "next", reduced: false })
    expect(showsTapHint(s)).toBe(false)
    s = reduceTour(s, { type: "back" })
    expect(showsTapHint(s)).toBe(true)
    // the phone's own button: done for good
    s = reduceTour(s, { type: "next", reduced: false, phone: true })
    s = reduceTour(s, { type: "back" })
    expect(showsTapHint(s)).toBe(false)
    // a deep link to a step whose button only comes after the check waits for the next tap step
    s = startState(7, true)
    expect(s.hintAt).toBeNull()
    s = reduceTour(s, { type: "next", reduced: false })
    expect(showsTapHint(s)).toBe(true)
  })
})
