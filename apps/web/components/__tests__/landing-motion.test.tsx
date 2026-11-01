// @vitest-environment jsdom
// The landing motion toolkit (components/landing/home/motion): easing, the money roll, the "play once in view"
// sequence engine (arm only below the viewport, play, land final, skip when jumped past, never under reduced motion,
// StrictMode-safe; story-tuning: the start line below lg, the pace that keeps a story's payoff on screen during a
// fast scroll, the skip only when it leaves), LiveMoney, the scroll hooks, and the stylesheet's scoping.
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, render, renderHook } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LiveMoney } from "@/components/landing/home/motion/LiveMoney"
import { RollingMoney } from "@/components/landing/home/motion/RollingMoney"
import { SmoothAnchors } from "@/components/landing/home/motion/ScrollMarkers"
import { Sequences } from "@/components/landing/home/motion/Sequences"
import { useActiveSection, useScrolled } from "@/components/landing/home/motion/hooks"
import { amountText, amountWriter, cubicBezier, easeStandard, moneyString, rollMoney } from "@/components/landing/home/motion/roll"
import { HowItWorks } from "@/components/landing/home/HowItWorks"
import { ROLL_MS } from "@/components/landing/home/motion/roll"
import {
  armSequences,
  BELOW_LG,
  BOTTOM_INSET,
  decide,
  EARLY_RATE,
  EFFECT_MS,
  MAX_RATE,
  pace,
  rateFor,
  READ_TOP,
  SEQ_EFFECTS,
  seqVars,
  speedOf,
} from "@/components/landing/home/motion/sequence"
import { dollars } from "@/lib/client/money"

// ---------------------------------------------------------------------------------------------------------
// Test doubles: matchMedia (reduced motion), IntersectionObserver, and element boxes.

let reduced = false
let belowLg = false
const VH = 800
/** the bottom of the trigger region: the bottom tenth of the screen doesn't count */
const LINE = VH * (1 - BOTTOM_INSET)

class FakeIO {
  static all: FakeIO[] = []
  targets = new Set<Element>()
  constructor(
    public cb: IntersectionObserverCallback,
    public opts?: IntersectionObserverInit,
  ) {
    FakeIO.all.push(this)
  }
  observe(el: Element) {
    this.targets.add(el)
  }
  unobserve(el: Element) {
    this.targets.delete(el)
  }
  disconnect() {
    this.targets.clear()
  }
  takeRecords() {
    return []
  }
}

/** Fire one IntersectionObserver record for `el`, as if its box were now at [top, top + height). */
function see(el: Element, top: number, height = 200) {
  const bottom = top + height
  const visible = Math.max(0, Math.min(bottom, VH) - Math.max(top, 0))
  const rec = {
    target: el,
    isIntersecting: visible > 0,
    intersectionRatio: visible / height,
    boundingClientRect: { top, bottom, height },
    intersectionRect: { height: visible },
    rootBounds: { top: 0, height: VH },
  } as unknown as IntersectionObserverEntry
  // the viewport observer only (the "past" one has its own root: everything above the viewport)
  for (const io of FakeIO.all)
    if (io.targets.has(el) && io.opts?.rootMargin !== "99999px 0px -100% 0px") act(() => io.cb([rec], io as unknown as IntersectionObserver))
}

function place(el: Element, top: number, height = 200) {
  el.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() {} }) as DOMRect
}

beforeEach(() => {
  reduced = false
  belowLg = false
  FakeIO.all = []
  window.scrollY = 0
  vi.useFakeTimers()
  vi.stubGlobal("IntersectionObserver", FakeIO)
  window.innerHeight = VH
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes("reduced-motion") ? reduced : q === BELOW_LG ? belowLg : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const flush = () => act(async () => void (await Promise.resolve()))

// ---------------------------------------------------------------------------------------------------------

describe("easing and the money roll", () => {
  it("cubicBezier: endpoints, linear identity, ease-standard is monotonic and front-loaded", () => {
    const lin = cubicBezier(0, 0, 1, 1)
    for (const p of [0, 0.1, 0.5, 0.9, 1]) expect(lin(p)).toBeCloseTo(p, 4)
    expect(easeStandard(0)).toBe(0)
    expect(easeStandard(1)).toBe(1)
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const v = easeStandard(i / 100)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(easeStandard(0.5)).toBeGreaterThan(0.75) // decelerating: most of the change lands early
  })

  it("moneyString matches MoneyText's formats", () => {
    expect(moneyString(dollars(366))).toBe("$366.00")
    expect(moneyString(dollars(150), "whole")).toBe("$150")
    expect(moneyString(dollars(84), "out")).toBe("− $84.00")
    expect(moneyString(dollars(150), "in")).toBe("+ $150.00")
  })

  it("rollMoney writes the start, counts through in-between values, and ends on the final text", async () => {
    document.body.innerHTML = `<span id="w"><span data-money>$366.00</span></span>`
    const el = document.querySelector("[data-money]")!
    const w = amountWriter(document.getElementById("w")!)!
    expect(w.text).toBe("$366.00")
    const seen = new Set<string>()
    const r = rollMoney(w, dollars(450), dollars(366), { onFrame: () => seen.add(el.textContent!) })
    expect(el.textContent).toBe("$450.00")
    for (let t = 0; t < 520; t += 16) advance(16)
    await r.done
    expect(el.textContent).toBe("$366.00")
    expect(seen.size).toBeGreaterThan(5)
    expect([...seen].every((s) => /^\$\d{3}\.\d{2}$/.test(s))).toBe(true) // always a whole formatted amount
  })

  it("stop(true) jumps to the end; stop(false) leaves the text as it is", () => {
    document.body.innerHTML = `<span id="w"><span data-money>$100.00</span></span>`
    const el = document.querySelector("[data-money]")!
    const a = rollMoney(amountWriter(document.getElementById("w")!)!, dollars(0), dollars(100))
    advance(100)
    a.stop(true)
    expect(el.textContent).toBe("$100.00")
    const b = rollMoney(amountWriter(document.getElementById("w")!)!, dollars(0), dollars(100))
    advance(100)
    const mid = el.textContent
    b.stop(false)
    advance(600)
    expect(el.textContent).toBe(mid)
    expect(mid).not.toBe("$100.00")
  })

  it("a sentence rolls only its amount (a GoalBar's \"$450 of $450 collected\")", () => {
    const text = amountText("$450 of $450 collected", dollars(450), "whole")
    expect(text(dollars(300))).toBe("$300 of $450 collected")
    expect(text(dollars(450))).toBe("$450 of $450 collected")
    expect(amountText("$66.00", dollars(66), "fixed")(dollars(366))).toBe("$366.00")
  })

  it("a ghost keeps the final width: the real amount hides, an aria-hidden copy rolls, release() undoes it", () => {
    document.body.innerHTML = `<span id="w"><span data-money class="tabular-nums">$66.00</span></span>`
    const wrap = document.getElementById("w")!
    const real = wrap.querySelector<HTMLElement>("[data-money]")!
    const html = wrap.outerHTML
    const w = amountWriter(wrap, { ghost: "end" })!
    const ghost = wrap.querySelector<HTMLElement>("[data-roll-ghost]")!
    expect(real.style.visibility).toBe("hidden")
    expect(ghost.getAttribute("aria-hidden")).toBe("true")
    expect(ghost.hasAttribute("data-money")).toBe(false)
    expect(ghost.style.position).toBe("absolute")
    expect(ghost.style.right).toBe("0px")
    expect(wrap.style.direction).toBe("rtl") // the wrapper's start corner is its right edge, so narrowing never shifts it
    w.write("$366.00")
    expect(ghost.textContent).toBe("$366.00")
    expect(real.textContent).toBe("$66.00") // the real amount never changes
    w.release()
    expect(wrap.outerHTML.replace(' style=""', "").replace(' style=""', "")).toBe(html)
  })
})

// ---------------------------------------------------------------------------------------------------------

describe("decide()", () => {
  const rec = (top: number, height: number) => {
    const visible = Math.max(0, Math.min(top + height, VH) - Math.max(top, 0))
    return {
      isIntersecting: visible > 0,
      boundingClientRect: { bottom: top + height, height },
      intersectionRect: { height: visible },
      rootBounds: { top: 0, height: VH },
    }
  }
  it("skips a container that is above the viewport (jumped or flung past)", () => expect(decide(rec(-400, 200), 0.35, VH)).toBe("skip"))
  it("waits below the viewport and under the threshold", () => {
    expect(decide(rec(900, 200), 0.35, VH)).toBe("wait")
    expect(decide(rec(LINE - 60, 200), 0.35, VH)).toBe("wait") // 30 % in view
  })
  it("plays at the threshold", () => expect(decide(rec(LINE - 70, 200), 0.35, VH)).toBe("play"))
  it("the bottom tenth of the screen doesn't count toward the threshold", () => {
    expect(decide(rec(LINE - 5, 200), 0.01, VH)).toBe("play") // 5 px above the line (2 % of 200 = 2 px needed)
    expect(decide(rec(LINE + 20, 200), 0.01, VH)).toBe("wait") // 60 px on screen, all in the bottom tenth
  })
  it("armed but already over the top edge: it came from above, so it lands final; a playing one keeps playing", () => {
    expect(decide({ ...rec(-100, 400), boundingClientRect: { top: -100, bottom: 300, height: 400 } }, 0.35, VH, "armed")).toBe("skip")
    expect(decide({ ...rec(-100, 400), boundingClientRect: { top: -100, bottom: 300, height: 400 } }, 0.35, VH, "play")).toBe("play")
  })
  it("a playing story keeps playing while any part of it is on screen, wherever its top is, and lands final once it leaves", () => {
    const at = (top: number, height: number) => ({ ...rec(top, height), boundingClientRect: { top, bottom: top + height, height } })
    expect(decide(at(-560, 600), 0.35, VH, "play")).toBe("play") // 40 px left at the top
    expect(decide(at(-600, 600), 0.35, VH, "play")).toBe("skip") // gone
  })
  it("a container taller than the viewport plays once 35 % of the screen above the bottom tenth is covered", () => {
    expect(decide(rec(LINE - 260, 3000), 0.35, VH)).toBe("play") // 260 px of a 3000 px container: 9 %, but 36 % of the region
    expect(decide(rec(LINE - 240, 3000), 0.35, VH)).toBe("wait")
  })
  it("startLine (below lg): a tall panel plays once its top passes that share of the screen, before its threshold", () => {
    expect(decide(rec(0.85 * VH - 1, 500), 0.35, VH, "armed", 0.85)).toBe("play") // 41 px of 500 in the region: under 35 %
    expect(decide(rec(0.85 * VH - 1, 500), 0.35, VH, "armed", null)).toBe("wait") // the same panel at lg
    expect(decide(rec(0.85 * VH + 10, 500), 0.35, VH, "armed", 0.85)).toBe("wait")
  })
})

// ---------------------------------------------------------------------------------------------------------

describe("pace(), speedOf(), rateFor()", () => {
  // step 3 on a 390 × 844 phone: the $450.00 → $366.00 roll lands at 2460 ms with its centre 283 px below the panel's top
  const STEP3 = [{ end: 1960 + 500, dy: 283 }]
  it("a beat must land with its centre below the header (READ_TOP): the rate is just enough at this speed", () => {
    expect(pace(STEP3, 717, 0.7)).toBeCloseTo((2460 * 0.7) / (717 + 283 - READ_TOP), 6) // ≈ 1.84 at 700 px/s
    expect(pace(STEP3, 717, 0.4)).toBeCloseTo(1.12, 2) // 400 px/s: only a touch faster than 04
  })
  it("0 when the visitor isn't scrolling down; landed beats and beats already under the header don't count", () => {
    expect(pace(STEP3, 717, 0)).toBe(0)
    expect(pace(STEP3, 717, -0.5)).toBe(0)
    expect(pace(STEP3, 717, 0.7, 2500)).toBe(0) // it has landed
    expect(pace(STEP3, -300, 0.7)).toBe(0) // it's under the header: lost either way
  })
  it("rateFor: never slower than 04's pace, never faster than MAX_RATE, in 0.01 steps", () => {
    expect(rateFor(0)).toBe(1)
    expect(rateFor(0.8)).toBe(1)
    expect(rateFor(1.234)).toBe(1.23)
    expect(rateFor(9)).toBe(MAX_RATE)
    expect(MAX_RATE).toBe(2)
  })
  it("speedOf: the least-squares slope over the last 400 ms, so a wheel's steps average out", () => {
    // 35 px every 50 ms (700 px/s) in steps, as the page sees it: tops decreasing
    const steps = Array.from({ length: 9 }, (_, i) => ({ t: i * 50, top: -i * 35 + (i % 2 ? 10 : -10) }))
    expect(speedOf(steps)).toBeCloseTo(0.7, 1)
    // only the last 400 ms count
    expect(speedOf([{ t: 0, top: 5000 }, ...Array.from({ length: 5 }, (_, i) => ({ t: 1000 + i * 100, top: -i * 40 }))])).toBeCloseTo(0.4, 3)
  })
  it("speedOf: 0 when unknown (under 80 ms of samples), stopped (no move for 150 ms) or a jump (over 3000 px/s)", () => {
    expect(speedOf([])).toBe(0)
    expect(speedOf([{ t: 0, top: 0 }, { t: 50, top: -40 }])).toBe(0)
    expect(speedOf([{ t: 0, top: 0 }, { t: 100, top: -70 }, { t: 200, top: -70 }, { t: 260, top: -70 }])).toBe(0)
    expect(speedOf([{ t: 0, top: 0 }, { t: 100, top: -4000 }])).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------

const FRAGMENT = `
  <div data-sequence id="c">
    <p data-seq="fade-up">Groceries</p>
    <span data-seq="pop" data-at="320">✓</span>
    <span data-seq="roll" data-at="400" data-roll-from="450000000" data-roll-to="366000000" data-roll-format="fixed"><span data-money>$366.00</span></span>
  </div>`

function mount(html = FRAGMENT) {
  document.body.innerHTML = html
  const c = document.getElementById("c")!
  return { c, html: c.outerHTML }
}

describe("armSequences", () => {
  it("arms only a container wholly below the viewport, holding the roll at its start", () => {
    const { c } = mount()
    place(c, 1200)
    armSequences([c])
    expect(c.getAttribute("data-seq-state")).toBe("armed")
    expect(c.querySelector<HTMLElement>("[data-seq=pop]")!.style.getPropertyValue("--seq-at")).toBe("320ms")
    expect(c.querySelector("[data-money]")!.textContent).toBe("$450.00")
  })

  it("never touches a container that is on screen or above it", () => {
    for (const top of [100, VH - 10, -600]) {
      const { c, html } = mount()
      place(c, top)
      armSequences([c])
      expect(c.outerHTML).toBe(html)
    }
  })

  it("plays once in view and lands exactly on the server's DOM", async () => {
    const { c, html } = mount()
    place(c, 1200)
    armSequences([c])
    see(c, 900) // still below
    expect(c.getAttribute("data-seq-state")).toBe("armed")
    see(c, LINE - 100) // 50 % in view
    expect(c.getAttribute("data-seq-state")).toBe("play")
    advance(400 + 100)
    expect(c.querySelector("[data-money]")!.textContent).not.toBe("$450.00") // rolling
    for (let t = 0; t < 1200; t += 16) advance(16)
    await flush()
    expect(c.hasAttribute("data-seq-state")).toBe(false)
    expect(c.outerHTML).toBe(html)
    see(c, LINE - 100) // once: never again
    expect(c.hasAttribute("data-seq-state")).toBe(false)
  })

  it("jumped past before it played: final at once, no play", () => {
    const { c, html } = mount()
    place(c, 1200)
    armSequences([c])
    see(c, -900)
    expect(c.outerHTML).toBe(html)
  })

  it("flung past while playing: final at once", () => {
    const { c, html } = mount()
    place(c, 1200)
    armSequences([c])
    see(c, VH - 150)
    advance(450)
    see(c, -300)
    expect(c.outerHTML).toBe(html)
  })

  it("an instant jump that never intersects the viewport still lands final (the observer of everything above)", () => {
    const { c, html } = mount()
    place(c, 1200)
    armSequences([c])
    const past = FakeIO.all.find((io) => io.opts?.rootMargin === "99999px 0px -100% 0px")!
    expect(past.targets.has(c)).toBe(true)
    const rec = { target: c, isIntersecting: true, boundingClientRect: { top: -2000, bottom: -1800, height: 200 } } as unknown as IntersectionObserverEntry
    act(() => past.cb([rec], past as unknown as IntersectionObserver))
    expect(c.outerHTML).toBe(html)
  })

  it("reduced motion: nothing is ever armed", () => {
    reduced = true
    const { c, html } = mount()
    place(c, 1200)
    const stop = armSequences([c])
    expect(c.outerHTML).toBe(html)
    expect(FakeIO.all).toHaveLength(0)
    stop()
  })

  it("containers that start together stagger, at most 4 steps", () => {
    document.body.innerHTML = [0, 1, 2, 3, 4, 5].map((i) => `<div data-sequence id="s${i}" data-seq="fade-up">${i}</div>`).join("")
    const els = [...document.querySelectorAll<HTMLElement>("[data-sequence]")]
    els.forEach((el) => place(el, 1000))
    armSequences(els, { stagger: 60 })
    const recs = els.map((el) => ({
      target: el,
      isIntersecting: true,
      intersectionRatio: 1,
      boundingClientRect: { top: 100, bottom: 300, height: 200 },
      intersectionRect: { height: 200 },
      rootBounds: { top: 0, height: VH },
    })) as unknown as IntersectionObserverEntry[]
    act(() => FakeIO.all[0]!.cb(recs, FakeIO.all[0] as unknown as IntersectionObserver))
    expect(els.map((el) => el.style.getPropertyValue("--seq-offset"))).toEqual(["", "60ms", "120ms", "180ms", "240ms", "240ms"])
  })

  it("data-threshold overrides the default", () => {
    const { c } = mount(`<div data-sequence data-threshold="0.9" id="c"><p data-seq="fade">x</p></div>`)
    place(c, 1200)
    armSequences([c])
    see(c, LINE - 100) // 50 %
    expect(c.getAttribute("data-seq-state")).toBe("armed")
    see(c, LINE - 190) // 95 %
    expect(c.getAttribute("data-seq-state")).toBe("play")
  })

  it("cleanup puts everything back, and a remount (React StrictMode) can arm again", () => {
    const { c, html } = mount()
    place(c, 1200)
    const stop = armSequences([c])
    stop()
    expect(c.outerHTML).toBe(html)
    armSequences([c])
    expect(c.getAttribute("data-seq-state")).toBe("armed")
  })

  it("seqVars types the inline custom properties", () => {
    expect(seqVars({ at: 200, dur: 360, y: 24, scale: 0.96, turn: 6, dx: "4rem", from: "67%" })).toEqual({
      "--seq-at": "200ms",
      "--seq-dur": "360ms",
      "--seq-y": "24px",
      "--seq-scale": "0.96",
      "--seq-turn": "6deg",
      "--seq-dx": "4rem",
      "--seq-from": "67%",
    })
  })

  it("knobs: data-* become vars, an item without one gets `initial` (never its container's), inline values stay", () => {
    const { c, html } = mount(`
      <div data-sequence data-scale=".9" id="c" data-seq="fade-up">
        <span data-seq="pop" data-at="640" data-scale=".6" id="a">1</span>
        <span data-seq="pop" id="b">2</span>
        <span data-seq="fade-up" id="i" style="--seq-y: 24px">3</span>
      </div>`)
    place(c, 1200)
    armSequences([c])
    const v = (id: string, name: string) => document.getElementById(id)!.style.getPropertyValue(name)
    expect(v("a", "--seq-scale")).toBe(".6")
    expect(v("a", "--seq-at")).toBe("640ms")
    expect(v("b", "--seq-scale")).toBe("initial")
    expect(v("i", "--seq-y")).toBe("24px")
    expect(v("c", "--seq-scale")).toBe(".9")
    see(c, -900) // skipped: everything the engine set comes off again, inline values stay
    expect(c.outerHTML).toBe(html)
  })

  it("uses the spec's trigger: 35 % in view, the bottom tenth of the screen not counting (the observer watches it all)", () => {
    const { c } = mount()
    place(c, 1200)
    armSequences([c])
    expect(FakeIO.all[0]!.opts?.rootMargin).toBeUndefined() // the whole viewport: the speed is measured from the edge
    expect(FakeIO.all[0]!.opts?.threshold).toContain(0.35)
    expect(BOTTOM_INSET).toBe(0.1)
    see(c, VH - 70) // 70 px on screen, all in the bottom tenth
    expect(c.getAttribute("data-seq-state")).toBe("armed")
    see(c, LINE - 70) // 35 % above it
    expect(c.getAttribute("data-seq-state")).toBe("play")
  })

  it("a click on an in-page link finishes every pending container above its target before the scroll", () => {
    document.body.innerHTML = `
      <a href="#tech" id="link">Under the hood</a>
      <div data-sequence id="above"><p data-seq="fade-up">a</p></div>
      <section id="tech"><div data-sequence id="inside"><p data-seq="fade-up">b</p></div></section>`
    const above = document.getElementById("above")!
    const inside = document.getElementById("inside")!
    place(above, 1500)
    place(document.getElementById("tech")!, 3000, 800)
    place(inside, 3100)
    armSequences([above, inside])
    document.getElementById("link")!.click()
    expect(above.hasAttribute("data-seq-state")).toBe(false) // final, before the smooth scroll flies past it
    expect(inside.getAttribute("data-seq-state")).toBe("armed") // the target's own story still plays
  })

  it("rolls with a ghost: armed shows the old amount over the hidden final one, and lands on the server DOM", async () => {
    const { c, html } = mount(`
      <div data-sequence id="c">
        <span data-seq="roll" data-roll-from="366000000" data-roll-to="66000000" data-roll-format="fixed" data-roll-ghost="end" class="relative inline-block"><span data-money>$66.00</span></span>
      </div>`)
    place(c, 1200)
    armSequences([c])
    expect(c.querySelector("[data-roll-ghost] ")).toBeTruthy()
    expect(c.querySelector<HTMLElement>("[data-money]")!.style.visibility).toBe("hidden")
    expect(c.querySelector("span[aria-hidden]")!.textContent).toBe("$366.00")
    see(c, VH - 150)
    for (let t = 0; t < 1300; t += 16) advance(16)
    await flush()
    expect(c.outerHTML.replaceAll(' style=""', "")).toBe(html)
  })

  it("a whole-dollar roll steps in dollars (\"$323 of $450\", never \"$323.32\")", () => {
    document.body.innerHTML = `<p id="w"><span data-money>$450 of $450 collected</span></p>`
    const el = document.querySelector("[data-money]")!
    const seen = new Set<string>()
    rollMoney(amountWriter(document.getElementById("w")!)!, dollars(300), dollars(450), { format: "whole", onFrame: () => seen.add(el.textContent!) })
    for (let t = 0; t < 520; t += 16) advance(16)
    expect([...seen].every((s) => /^\$\d+ of \$450 collected$/.test(s))).toBe(true)
    expect(el.textContent).toBe("$450 of $450 collected")
  })

  it("a GoalBar's sentence rolls inside a goal fill", () => {
    const { c } = mount(`
      <div data-sequence id="c"><div data-seq="goal"><div data-seq="roll" data-roll-from="300000000" data-roll-to="450000000" data-roll-format="whole">
        <div data-goalbar><div aria-hidden><div></div></div><p data-goal-text>$450 of $450 collected</p></div>
      </div></div></div>`)
    place(c, 1200)
    armSequences([c])
    expect(c.querySelector("[data-goal-text]")!.textContent).toBe("$300 of $450 collected")
  })
})

// ---------------------------------------------------------------------------------------------------------
// story-tuning: on a phone a steady 700 px/s scroll keeps a 314 px panel on screen for ~1.3-1.8 s, and step 3's story
// is 2.46 s, so no trigger alone lets its roll land on screen. A story now starts earlier below lg, plays faster (by
// just enough, up to 2×) while the visitor scrolls fast, and relaxes to 04's pace when they stop.

describe("start line and pace (story-tuning)", () => {
  // step 3's shape on a 390 × 844 phone: the checking row 64 px down, the "In the Pot" roll 268 px down, 314 px tall
  const STORY = `
    <div data-sequence id="c">
      <p data-seq="fade-up" data-at="200" id="row">Checking Pot rules…</p>
      <span data-seq="roll" data-at="1960" data-roll-from="450000000" data-roll-to="366000000" data-roll-format="fixed" id="roll"><span data-money>$366.00</span></span>
    </div>`
  const H = 314
  /** lays the panel out with its top at `top` (and its rows at their offsets) */
  const lay = (c: Element, top: number) => {
    place(c, top, H)
    place(document.getElementById("row")!, top + 64, 48)
    place(document.getElementById("roll")!, top + 268, 30)
  }
  /** a steady scroll at `speed` px/ms in 20 ms steps, until `until()` or `maxMs`: the page moves, the observer reports */
  const scroll = (c: Element, from: number, speed: number, until: () => boolean, maxMs = 3000) => {
    let top = from
    let ms = 0
    for (; ms < maxMs && !until(); ms += 20) {
      advance(20)
      window.scrollY += speed * 20
      top -= speed * 20
      lay(c, top)
      see(c, top, H)
    }
    return { top, ms }
  }
  const state = (c: Element) => c.getAttribute("data-seq-state")
  const rate = (c: Element) => Number(c.getAttribute("data-seq-rate") ?? 1)
  const amount = () => document.querySelector("#roll [data-money]")!.textContent

  it("below lg only, a panel starts once its top passes the start line (85 %), before its 35 %", () => {
    for (const lg of [false, true]) {
      belowLg = !lg
      const { c } = mount(STORY)
      lay(c, 1200)
      armSequences([c], { startLine: 0.85 })
      lay(c, 0.85 * VH - 5)
      see(c, 0.85 * VH - 5, H) // 55 px of 314 above the bottom tenth: under its threshold
      expect(state(c)).toBe(lg ? "armed" : "play")
      cleanup()
    }
  })

  it("a fast scroll (700 px/s) plays the story faster, just enough to land its roll on screen; it relaxes to 04's pace when the visitor stops, and ends on the server's DOM", async () => {
    belowLg = true
    const { c, html } = mount(STORY)
    lay(c, VH + 60)
    armSequences([c], { startLine: 0.85 })
    const { top } = scroll(c, VH + 60, 0.7, () => state(c) === "play")
    expect(state(c)).toBe("play")
    const need = rateFor(pace([{ end: 2460, dy: 283 }], top, 0.7))
    expect(need).toBeGreaterThan(EARLY_RATE)
    expect(Math.abs(rate(c) - need)).toBeLessThan(0.2)
    expect(rate(c)).toBeLessThanOrEqual(MAX_RATE)
    // the roll (1960 ms of story) starts well before 1960 ms, while it's still below the header
    const roll = scroll(c, top, 0.7, () => amount() !== "$450.00", 1960)
    expect(roll.ms).toBeLessThan(1960 / 1.4)
    expect(roll.top + 283).toBeGreaterThan(READ_TOP)
    // the visitor stops: within ~0.3 s the story is back at 04's pace
    advance(300)
    expect(c.hasAttribute("data-seq-rate")).toBe(false)
    for (let t = 0; t < 2000; t += 16) advance(16)
    await flush()
    expect(c.outerHTML).toBe(html) // no data-seq-rate, no state: the server's DOM
  })

  it("a slow scroll (200 px/s) keeps 04's timings", () => {
    belowLg = true
    const { c } = mount(STORY)
    lay(c, VH + 20)
    armSequences([c], { startLine: 0.85 })
    const { top } = scroll(c, VH + 20, 0.2, () => state(c) === "play")
    expect(state(c)).toBe("play")
    expect(c.hasAttribute("data-seq-rate")).toBe(false)
    expect(scroll(c, top, 0.2, () => amount() !== "$450.00", 2500).ms).toBeGreaterThanOrEqual(1940)
  })

  it("so fast that waiting for its threshold would already need 1.5× (1200 px/s): it starts as soon as it is on screen", () => {
    const { c } = mount(STORY)
    lay(c, VH + 60)
    armSequences([c]) // lg: no start line
    const { top } = scroll(c, VH + 60, 1.2, () => state(c) === "play")
    expect(state(c)).toBe("play")
    expect(top).toBeLessThan(VH)
    expect(top).toBeGreaterThan(LINE - 0.35 * H) // before its 35 %
    expect(rate(c)).toBe(MAX_RATE)
  })

  it("an in-page link's smooth scroll is the page's speed, not the visitor's: the story it lands on plays at 04's pace", () => {
    document.body.innerHTML = `<a href="#t" id="link">Under the hood</a><section id="t">${STORY}</section>`
    const c = document.getElementById("c")!
    place(document.getElementById("t")!, VH + 40, 400)
    lay(c, VH + 60)
    armSequences([c])
    document.getElementById("link")!.click()
    scroll(c, VH + 60, 2.5, () => state(c) === "play")
    expect(state(c)).toBe("play")
    expect(c.hasAttribute("data-seq-rate")).toBe(false)
  })

  it("a playing story partly above the top keeps playing; it lands final only once it has left entirely", () => {
    const { c, html } = mount(STORY)
    lay(c, 1200)
    armSequences([c])
    see(c, LINE - 150, H)
    expect(state(c)).toBe("play")
    see(c, -200, H) // its top is far above the edge, its foot still on screen
    expect(state(c)).toBe("play")
    see(c, -H, H)
    expect(c.outerHTML).toBe(html)
  })
})

// ---------------------------------------------------------------------------------------------------------

describe("React pieces", () => {
  it("server HTML is the final state: RollingMoney renders the final amount; Sequences only a hidden marker", () => {
    const html = renderToString(
      <section>
        <Sequences />
        <RollingMoney from={dollars(450)} micro={dollars(366)} at={600} variant="title" />
      </section>,
    )
    expect(html).toContain("$366.00")
    expect(html).not.toContain("$450.00")
    expect(html).toContain('data-roll-from="450000000"')
    expect(html).toMatch(/<span hidden="" data-sequences="true"><\/span>/)
    expect(html).not.toContain("data-seq-state")
  })

  it("HowItWorks: each fragment's first beat is part of its armed frame (never a sequence item), and the feet roll from the balance before their spend", () => {
    document.body.innerHTML = renderToString(<HowItWorks />)
    for (const n of [1, 2, 3, 4]) {
      const first = document.querySelector(`[data-how-fragment="${n}"] > div > :first-child`)!
      expect(first.hasAttribute("data-seq"), `step ${n}`).toBe(false)
    }
    expect(document.querySelector('[data-how-fragment="5"] caption')!.hasAttribute("data-seq")).toBe(false)
    expect(document.querySelector('[data-how-fragment="5"] thead tr')!.hasAttribute("data-seq")).toBe(false)
    const from = (n: number) => document.querySelector(`[data-how-fragment="${n}"] [data-seq="roll"]`)!.getAttribute("data-roll-from")
    expect([from(3), from(4)]).toEqual([String(dollars(450)), String(dollars(366))]) // $450.00 → $366.00, $366.00 → $66.00
  })

  it("<Sequences /> arms the containers of its section after mount", () => {
    const view = render(
      <section>
        <Sequences />
        <div data-sequence id="c">
          <p data-seq="fade-up">x</p>
        </div>
      </section>,
    )
    // jsdom lays nothing out: put the container below the fold and remount
    const c = view.container.querySelector<HTMLElement>("#c")!
    expect(c.hasAttribute("data-seq-state")).toBe(false) // a 0-height box is never armed
    view.unmount()
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { top: 2000, bottom: 2200, height: 200, left: 0, right: 0, width: 0, x: 0, y: 2000, toJSON() {} } as DOMRect
    }
    const again = render(
      <section>
        <Sequences />
        <div data-sequence id="c2">
          <p data-seq="fade-up">x</p>
        </div>
      </section>,
    )
    expect(again.container.querySelector("#c2")!.getAttribute("data-seq-state")).toBe("armed")
    again.unmount()
    // @ts-expect-error restore jsdom's own
    delete HTMLElement.prototype.getBoundingClientRect
  })

  it("LiveMoney: a new value mid-roll continues from what is on screen and ends on React's text", () => {
    const amount = (v: ReturnType<typeof render>) => v.container.querySelector("[data-money]")!.textContent
    const view = render(<LiveMoney micro={dollars(450)} />)
    view.rerender(<LiveMoney micro={dollars(366)} />)
    advance(150)
    const mid = amount(view)!
    view.rerender(<LiveMoney micro={dollars(282)} />)
    expect(amount(view)).toBe(mid) // no jump back to $450.00 or ahead to the end
    advance(600)
    expect(amount(view)).toBe("$282.00")
  })

  it("LiveMoney with ghost: the width-changing roll uses a copy, then the copy goes", () => {
    const view = render(<LiveMoney micro={dollars(150)} ghost="start" />)
    view.rerender(<LiveMoney micro={dollars(66)} ghost="start" />)
    expect(view.container.querySelector("[data-roll-ghost]")).toBeTruthy()
    advance(600)
    expect(view.container.querySelector("[data-roll-ghost]")).toBeNull()
    expect(view.container.querySelector<HTMLElement>("[data-money]")!.style.visibility).toBe("")
    expect(view.container.querySelector("[data-money]")!.textContent).toBe("$66.00")
  })

  it("LiveMoney rolls to a new value over 500 ms, swaps instantly with roll={false} and under reduced motion", () => {
    const amount = (v: ReturnType<typeof render>) => v.container.querySelector("[data-money]")!.textContent
    const view = render(<LiveMoney micro={dollars(450)} />)
    expect(amount(view)).toBe("$450.00")
    view.rerender(<LiveMoney micro={dollars(366)} />)
    expect(amount(view)).toBe("$450.00") // the start of the roll, written before paint
    advance(200)
    expect(amount(view)).not.toMatch(/^\$(450|366)\.00$/)
    advance(400)
    expect(amount(view)).toBe("$366.00")
    view.rerender(<LiveMoney micro={dollars(450)} roll={false} />)
    expect(amount(view)).toBe("$450.00")
    reduced = true
    view.rerender(<LiveMoney micro={dollars(84)} />)
    expect(amount(view)).toBe("$84.00")
  })

  it("SmoothAnchors: smooth jumps a frame after load, and never once its page unmounts or is hidden", () => {
    const Host = ({ on }: { on: boolean }) => <div id="l">{on && <SmoothAnchors />}</div>
    const view = render(<Host on />)
    const host = view.container.querySelector("#l")!
    expect(host.hasAttribute("data-smooth-anchors")).toBe(false) // not during the load's own fragment scroll
    advance(20)
    expect(host.hasAttribute("data-smooth-anchors")).toBe(true)
    view.rerender(<Host on={false} />) // an effect cleanup: unmount, or Next hiding the page in <Activity>
    expect(host.hasAttribute("data-smooth-anchors")).toBe(false)
  })

  it("useScrolled: false on the server, then follows scrollY (one read per frame)", () => {
    expect(renderToString(<Probe />)).toContain("false")
    const { result } = renderHook(() => useScrolled(8))
    expect(result.current).toBe(false)
    window.scrollY = 120
    act(() => void window.dispatchEvent(new Event("scroll")))
    expect(result.current).toBe(false) // not before the frame
    advance(20)
    expect(result.current).toBe(true)
    window.scrollY = 0
    act(() => void window.dispatchEvent(new Event("scroll")))
    advance(20)
    expect(result.current).toBe(false)
  })

  it("useActiveSection: the last section touching the reading line, null outside", () => {
    document.body.innerHTML = `<section id="how"></section><section id="rules"></section><section id="tech"></section>`
    const { result } = renderHook(() => useActiveSection(["how", "rules", "tech"]))
    const io = FakeIO.all.at(-1)!
    expect(io.opts?.rootMargin).toBe("-35% 0px -64% 0px") // the spec's scroll-spy line
    const fire = (id: string, on: boolean) =>
      act(() => io.cb([{ target: document.getElementById(id)!, isIntersecting: on } as unknown as IntersectionObserverEntry], io as unknown as IntersectionObserver))
    expect(result.current).toBe(null)
    fire("how", true)
    expect(result.current).toBe("how")
    fire("rules", true) // a boundary: the lower one wins
    expect(result.current).toBe("rules")
    fire("how", false)
    fire("rules", false)
    expect(result.current).toBe(null)
  })
})

function Probe() {
  return <span>{String(useScrolled())}</span>
}

// ---------------------------------------------------------------------------------------------------------

describe("landing-motion.css", () => {
  // jsdom's import.meta.url isn't a file: URL, so resolve from the package (or the repo root)
  const rel = "components/landing/home/motion/landing-motion.css"
  const file = [resolve(process.cwd(), rel), resolve(process.cwd(), "apps/web", rel)].find((f) => existsSync(f))!
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

  it("styles every effect the engine knows", () => {
    for (const fx of SEQ_EFFECTS.filter((f) => f !== "roll")) expect(css).toContain(`[data-seq="${fx}"]`)
  })

  it("scopes every rule to the landing (Next keeps page CSS loaded after navigating away)", () => {
    const selectors = [...css.matchAll(/([^{};]+)\{/g)]
      .map((m) => m[1]!.trim())
      .filter((s) => s && !s.startsWith("@") && !/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(s))
    expect(selectors.length).toBeGreaterThan(20)
    for (const s of selectors)
      for (const part of s.split(/,(?![^(]*\))/)) expect(part.trim()).toMatch(/^(\[data-landing\]|html:has\(\[data-landing\](\[[\w-]+\])?\))/)
  })

  it("names keyframes so they can't collide with the app's (pot-seq-*, pot-l-*)", () => {
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(m[1]).toMatch(/^pot-(seq|l)-/)
  })

  it("only animates transform, opacity, clip-path and visibility (plus the header hairline's colour)", () => {
    const frames = [...css.matchAll(/@keyframes\s+([\w-]+)[^{]*\{([\s\S]*?\}\s*)\}/g)]
    expect(frames.length).toBeGreaterThan(10)
    for (const [, name, body] of frames) {
      const props = new Set([...body!.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]!))
      const allowed = name === "pot-l-hairline" ? ["border-bottom-color"] : ["transform", "opacity", "clip-path", "visibility"]
      for (const p of props) expect(allowed).toContain(p)
    }
  })

  it("the engine's default durations (EFFECT_MS, which pace() reads) are the stylesheet's", () => {
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    for (const fx of SEQ_EFFECTS.filter((f) => f !== "roll")) {
      const durs = blocks
        .filter(([, sel, body]) => sel!.includes(`[data-seq="${fx}"]`) && body!.includes("--seq-dur,"))
        .map(([, , body]) => Number(/var\(--seq-dur, (\d+)ms\)/.exec(body!)![1]))
      expect(durs.length, fx).toBeGreaterThan(0)
      for (const d of durs) expect(d, fx).toBe(EFFECT_MS[fx])
    }
    expect(EFFECT_MS.roll).toBe(ROLL_MS)
  })

  it("has no parallax or scroll-scrubbed content (04: cut)", () => {
    expect(css).not.toMatch(/parallax|view\(\)/)
  })
})
