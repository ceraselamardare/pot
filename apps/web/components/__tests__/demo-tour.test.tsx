// @vitest-environment jsdom
// The /demo tour (plan/design-direction/06 §1.3, §8.4 "Unit"): 14 steps, caption word counts and the 2-minute
// budget, the main-path copy (`tour.*`) is never allowlisted and never says a banned word, every key the tour names
// exists, each step's beats resolve in the dataset, every state of the stage is jargon-free with at most one
// marigold, and the player's rules (bounds, the 1.2 s hold, the one burst, deep links, legacy #beat-k).
// Site update (2026-11-03): the phone tells today's rules (step 1 is the one-screen Create; the $300 tickets need one
// OK, steps 8-11), the end's [Start a real Pot] is the sign-in link, and ←/→ never move the tour under that dialog.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { peopleVMs, phoneBeats } from "@/components/demo/Chapter"
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

  it("drops the presets' copy: Create has no Trip / Club / Team any more", () => {
    expect(Object.keys(keys).filter((k) => k.startsWith("tour.create."))).toEqual([])
  })
})

/** What the phone says on step `n`'s settled screen (or the push it opens on), spaces normalised. */
function phoneText(n: number, which: "screen" | "push" | "busy" = "screen"): string {
  const step = TOUR[n - 1]!
  const [c, b] = which === "busy" ? [step.beats[0]![0], step.beats[0]![1] + 1] : step.beats.at(-1)!
  const ch = getChapter(c)
  const beat = phoneBeats(ch)[b - 1]!
  const scene = which === "push" ? beat.before! : beat.scene
  const { container, unmount } = render(
    <Scene scene={scene} story={phoneStory(ch)} you={step.you} people={peopleVMs()} tapped={beat.tapped} active={step.tap && which === "screen"} onPrimary={() => {}} burst={0} />,
  )
  const text = (container.textContent ?? "").replaceAll(" ", " ")
  unmount()
  return text
}
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => v[k]!)

describe("today's rules on the phone (site update)", () => {
  it("step 1 is the one-screen Create: the name, $150 each, the suggested rules with [Change], [Create Pot]", () => {
    const s = phoneText(1)
    for (const k of ["create.title", "create.preview.members", "create.preview_hint", "create.name.label", "create.goal.inline", "create.goal.each.after", "create.summary.change", "create.cta"])
      expect(s, k).toContain(keys[k])
    expect(s).toContain("Lisbon Trip")
    expect(s).toContain("150")
    expect(s).toContain(fill(keys["create.summary.instant"]!, { instantLimit: "$100" }))
    // no presets, no second step
    for (const gone of ["How should it work?", "Coming soon", "Step 2 of 2", "Club", "Team"]) expect(s).not.toContain(gone)
    // right after the tap: the sheet's progress step
    expect(phoneText(1, "busy")).toContain("Creating Lisbon Trip…")
  })

  it("step 8: the $300 tickets are over the $100 instant limit and within one OK: [Ask for one OK]", () => {
    const s = phoneText(8)
    expect(s).toContain("This needs one OK from anyone else")
    expect(s).toContain("It's over your $100 instant limit.")
    expect(s).toContain(keys["spend.cta.one_ok"])
    expect(s).not.toContain("approvals")
    expect(s).not.toContain(keys["spend.cta.vote"])
  })

  it("step 9: sent, 'Needs one OK', and anyone else can give it", () => {
    const s = phoneText(9)
    const [sent, paid] = keys["spend.one_ok_sent"]!.split(" · ")
    expect(s).toContain(sent)
    expect(s).toContain(paid)
    expect(s).toContain(keys["feed.pending.one_ok"])
    expect(s).toContain("Maya · asked, approval counted")
    expect(s).toContain("Anyone in Lisbon Trip except Maya can give it.")
    expect(s).toContain("$366.00")
    expect(s).not.toMatch(/of 2 approvals|Sent to the group/)
  })

  it("step 10: Leo's push says one OK, then the Approve sheet's one-OK header, who, and [OK $300] → Sending your OK…", () => {
    const push = phoneText(10, "push")
    expect(push).toContain("Maya needs one OK")
    expect(push).toContain("$300 for tickets · Lisbon Trip · Anyone can OK it")
    const s = phoneText(10)
    expect(s).toContain("Needs one OK from anyone in the group. It's over Maya's instant limit.")
    expect(s).toContain(keys["approve.one_ok.header"])
    expect(s).toContain("Anyone in Lisbon Trip except Maya can give it.")
    expect(s).toContain("OK $300")
    expect(s).toContain("$66.00")
    expect(s).not.toMatch(/Approve \$300|of 2/)
    expect(phoneText(10, "busy")).toContain(keys["approve.cta.oking"])
  })

  it("step 11: 'Done. Your OK sent $300 to Maya.', who gave the OK, $66 left", () => {
    const s = phoneText(11)
    expect(s).toContain("Done. Your OK sent $300 to Maya.")
    expect(s).toContain("You · gave the OK")
    expect(s).toContain("$66.00")
    expect(s).not.toMatch(/Approved!|2 of 2/)
  })

  it("closing still goes to the group (step 13)", () => {
    expect(phoneText(13)).toContain("Approvals · 1 of 2")
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

  it("ends on [Start a real Pot]: the site's start link (sign in, then Create), the screen's one marigold", () => {
    const { container } = render(
      <TourPlayer initial={TOUR_END} chapter={null}>
        <Stage phones={phones} people={people} />
      </TourPlayer>,
    )
    const cta = container.querySelector("[data-tour-cta]")!
    expect(cta.tagName).toBe("A")
    expect(cta.getAttribute("href")).toBe("/pots?sheet=create")
    expect(cta.textContent).toBe(keys["tour.end.cta"])
    expect(cta.className.split(/\s+/)).toContain("bg-brand")
    expect(container.querySelector("[data-tour-note]")!.textContent).toBe(keys["tour.end.note"])
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

  it("ignores ←/→ while the sign-in dialog is up, even with focus outside it (NEAR Connect's picker on top)", () => {
    render(
      <TourPlayer initial={TOUR_END} chapter={null}>
        <Probe />
      </TourPlayer>,
    )
    const key = (k: string) => act(() => void fireEvent.keyDown(window, { key: k }))
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.innerHTML = "<div data-signin-panel></div>"
    document.body.append(dialog)
    expect(document.activeElement).toBe(document.body)
    key("ArrowLeft")
    expect(probe().at).toBe(TOUR_END)
    dialog.remove()
    // a panel outside any dialog with no box (the app's signed-out screen in a page Next keeps hidden) doesn't count
    const kept = document.createElement("div")
    kept.innerHTML = "<div data-signin-panel></div>"
    document.body.append(kept)
    key("ArrowLeft")
    expect(probe().at).toBe(14)
    kept.remove()
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
