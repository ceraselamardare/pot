// Landing motion toolkit: "play once when in view" sequences (the engine; pure DOM, no React).
// Motion grammar (round-2 brief): the server HTML is the FINAL state, and so is the DOM without JS. After hydration
// this arms only containers that are wholly BELOW the viewport: it sets data-seq-state="armed" on the container and
// the CSS (landing-motion.css) holds each [data-seq] child at its effect's start, paused. When enough of the container
// is in view it sets "play"; the CSS runs every child's effect after its `data-at` delay; when the last one ends the
// attributes and inline vars come off and the DOM is back to final. Reduced motion: nothing is ever armed.
// The rules (story-tuning, measured on phones at 400-1200 px/s; motion-kit.md §1):
//  - START: 35 % in view (the bottom tenth of the screen doesn't count). Below lg, with `startLine`, also as soon as
//    its top passes that share of the viewport (0.85 for the tall how-it-works panels and the tech flow).
//  - PACE: a story keeps 04's timings unless the visitor is scrolling so fast that a beat still to come would land
//    with its centre already under the sticky header; then the whole story plays faster, by just enough, up to
//    MAX_RATE (2×). Re-checked every 100 ms while it plays, so it relaxes back to 1× when the visitor slows or stops.
//    If waiting for the start line would already need EARLY_RATE (1.5×), it starts as soon as it is on screen.
//  - SKIP to final at once only when it was never seen playing (above the viewport, or over its top edge, before it
//    played: a jump, a fling, an in-page link) or when it leaves the viewport entirely while playing. A story that is
//    still partly on screen keeps playing, wherever its top is.
//
//   <div data-sequence>                                     container (optional data-threshold="0.35")
//     <p data-seq="fade-up">…</p>                           at 0 ms
//     <span data-seq="pop" data-at="320" data-scale=".6">   at 320 ms, from scale .6 (optional data-dur="360")
//     <RollingMoney from={dollars(450)} micro={dollars(366)} at={600} />
//   </div>
// Per-item knobs (all optional): data-at (ms), data-dur (ms), data-y (px: fade-up/drop distance), data-scale (pop /
// fade-up start scale), data-turn (deg: settle). The engine copies them to --seq-* vars on each item; an item with
// none gets `initial`, so it never inherits its container's. Inline seqVars() work too (and are the only way in the
// CSS-only [data-seq-load] mode). The container may carry data-seq itself (it then animates too). Don't nest
// containers. A click on an in-page link finishes every pending container above its target before the smooth
// scroll starts, so nothing plays while flying past.
import type { CSSProperties } from "react"
import type { Micro } from "@/lib/client/money"
import { amountText, amountWriter, keepStyle, rollMoney, type AmountWriter, type MoneyFormat, type Roll } from "./roll"

/** The effects landing-motion.css knows (plus `roll`, which this file drives). */
export const SEQ_EFFECTS = [
  "fade-up",
  "fade",
  "pop",
  "settle",
  "slide",
  "drop",
  "draw-x",
  "draw-y",
  "wipe",
  "fill",
  "goal",
  "out",
  "lit",
  "travel",
  "dots",
  "roll",
] as const
export type SeqEffect = (typeof SEQ_EFFECTS)[number]

export interface SequenceOptions {
  /** how much must be visible before it plays: this fraction of the container, or of the viewport when the
   *  container is taller than it (default 0.35; the bottom tenth of the screen doesn't count). A container's
   *  data-threshold overrides it. */
  threshold?: number
  /** ms between containers that start in the same frame (60 for a row of siblings, 300 for an lg bento pair),
   *  at most 4 steps (default 0) */
  stagger?: number
  /** below lg only: a container also starts as soon as its top passes this share of the viewport height (0.85:
   *  the visitor sees its first rows begin, and a tall story gets the time to finish on screen). From lg the
   *  threshold alone decides. Default: none. */
  startLine?: number
}

export const DEFAULT_THRESHOLD = 0.35
/** the bottom tenth of the screen doesn't count toward the threshold */
export const BOTTOM_INSET = 0.1
/** where `startLine` applies: below Tailwind's lg (64rem), the stacked phone/tablet layouts */
export const BELOW_LG = "(max-width: 63.98rem)"
/** a story never plays faster than this to land on screen (a fling past it is skipped instead) */
export const MAX_RATE = 2
/** if waiting for its start line would already need this rate, a story starts as soon as it is on screen */
export const EARLY_RATE = 1.5
/** a beat should land with its centre at least this far below the viewport's top: under the landing's sticky
 *  header (57 px; 65 px from lg) plus a little room to read it */
export const READ_TOP = 120
const MAX_STAGGER_STEPS = 4
/** a sequence never holds its "before" state longer than this after it starts (a hidden tab, a stuck animation) */
const SAFETY_MS = 5000
/** without the Web Animations API (tests): assume each effect ends this long after its start */
const FALLBACK_DUR_MS = 600
/** only our sequence keyframes count toward "done" (not typing dots, parallax or anything else inside) */
const SEQ_KEYFRAMES = "pot-seq-"
/** fine steps (2.5 %), so the observer reports often enough to measure the scroll speed and catch each rule */
const THRESHOLDS = [...Array.from({ length: 41 }, (_, i) => i / 40), DEFAULT_THRESHOLD].sort((a, b) => a - b)
/** how often a playing story re-checks its pace (scrollY read, one rect per playing story; no scroll listener) */
const PACE_POLL_MS = 100
/** the scroll speed is averaged over this many ms (a wheel or a finger never moves the page evenly frame to frame) */
const SPEED_WINDOW_MS = 400
/** faster than this (px/ms) is a jump or a fling, not someone watching: no pacing and no early start for it */
const MAX_SPEED = 3
/** a beat has landed when its effect is this far through (04's beat rule: the next beat starts at ~70 %), except a
 *  money roll, which lands on its exact final amount (100 %) */
const LAND = 0.7
/** rate changes smaller than this are ignored, so a steady scroll gives a steady story */
const RATE_STEP = 0.1
/** a story slows down by at most this much per pace check (~0.5 s from 2× back to 1× after the visitor stops), so a
 *  moment of uneven scrolling never makes its payoff late; it speeds up at once */
const RATE_EASE = 0.2
/** the page hasn't moved for this long: the visitor has stopped (a story then drops straight back to 04's pace) */
const STILL_MS = 150
/** after a click on an in-page link the smooth scroll is the page's, not the visitor's: no pacing until it ends
 *  (scrollend), for at most this long */
const JUMP_MS = 3000
/** each effect's default duration (landing-motion.css's `var(--seq-dur, …)` fallbacks; a test keeps them equal) */
export const EFFECT_MS: Readonly<Record<string, number>> = {
  "fade-up": 280,
  fade: 200,
  pop: 360,
  settle: 360,
  slide: 360,
  drop: 280,
  "draw-x": 360,
  "draw-y": 360,
  wipe: 280,
  fill: 500,
  goal: 500,
  out: 200,
  lit: 600,
  travel: 500,
  dots: 1200,
  roll: 500,
}

/**
 * Inline custom properties for an item, typed. Needed for CSS-only [data-seq-load] items (the hero), and for the
 * vars that have no data attribute: travel's dx/dy, fill/goal's start (`from`), wipe/fill's corner (`round`) and
 * lit's ring colour (`lit`).
 *   <div data-seq="fade-up" style={seqVars({ at: 0, dur: 360, y: 24 })}>   (the hero phone rising)
 */
export function seqVars(v: {
  at?: number
  dur?: number
  y?: number
  scale?: number
  turn?: number
  dx?: string
  dy?: string
  from?: string
  round?: string
  lit?: string
}): CSSProperties {
  const out: Record<string, string> = {}
  if (v.at !== undefined) out["--seq-at"] = `${v.at}ms`
  if (v.dur !== undefined) out["--seq-dur"] = `${v.dur}ms`
  if (v.y !== undefined) out["--seq-y"] = `${v.y}px`
  if (v.scale !== undefined) out["--seq-scale"] = String(v.scale)
  if (v.turn !== undefined) out["--seq-turn"] = `${v.turn}deg`
  if (v.dx !== undefined) out["--seq-dx"] = v.dx
  if (v.dy !== undefined) out["--seq-dy"] = v.dy
  if (v.from !== undefined) out["--seq-from"] = v.from
  if (v.round !== undefined) out["--seq-round"] = v.round
  if (v.lit !== undefined) out["--seq-lit"] = v.lit
  return out as CSSProperties
}

/** data attribute → var, with its unit */
const KNOBS = [
  ["at", "--seq-at", "ms"],
  ["dur", "--seq-dur", "ms"],
  ["y", "--seq-y", "px"],
  ["scale", "--seq-scale", ""],
  ["turn", "--seq-turn", "deg"],
] as const

type Decision = "play" | "skip" | "wait"

/**
 * What a container should do for one IntersectionObserver entry (the observer's root is the viewport). Exported
 * for tests. `startLine`: the share of the viewport its top must pass to start regardless of the threshold, or
 * null (from lg, or when the section doesn't ask for it).
 */
export function decide(
  e: Pick<IntersectionObserverEntry, "isIntersecting"> & {
    boundingClientRect: { top?: number; bottom: number; height: number }
    rootBounds: { top: number; height: number } | null
  },
  threshold: number,
  viewportHeight: number,
  state: "armed" | "play" = "armed",
  startLine: number | null = null,
): Decision {
  const rootTop = e.rootBounds?.top ?? 0
  const rootHeight = e.rootBounds?.height ?? viewportHeight
  const { bottom, height } = e.boundingClientRect
  const top = e.boundingClientRect.top ?? bottom - height
  // wholly above the viewport: it left while playing, or it was jumped or flung past before it played → final
  if (bottom <= rootTop) return "skip"
  if (!e.isIntersecting) return "wait"
  // still armed but already over the top edge: it came from above (a jump), so it was never seen arriving.
  // (Entering from below, even a tall container starts long before its top reaches the edge.)
  if (state === "armed" && top < rootTop - 1) return "skip"
  // playing and still (partly) on screen: it keeps playing, wherever its top is
  if (state === "play") return "play"
  if (startLine !== null && top <= rootTop + startLine * rootHeight) return "play"
  const line = rootTop + (1 - BOTTOM_INSET) * rootHeight
  const visible = Math.max(0, Math.min(bottom, line) - Math.max(top, rootTop))
  const need = threshold * Math.min(height, line - rootTop)
  return visible > 0 && visible >= need - 0.5 ? "play" : "wait"
}

/** A beat that has to land on screen: when it lands (ms of story time) and where its centre sits (px below the
 *  container's top). */
export interface Mark {
  end: number
  dy: number
}

/**
 * The playback rate a story needs so that every beat still to come lands while its centre is below the sticky
 * header, if the visitor keeps scrolling at `speed` (px/ms; > 0 is down). `top`: the container's top now (px from
 * the viewport's top). `elapsed`: story time already played (ms). Unclamped: ≤ 1 means 04's own pace fits; 0 when
 * the visitor isn't scrolling down. A beat already under the header is lost either way and doesn't count.
 */
export function pace(marks: readonly Mark[], top: number, speed: number, elapsed = 0, readTop = READ_TOP): number {
  if (!(speed > 0)) return 0
  let need = 0
  for (const m of marks) {
    const left = m.end - elapsed
    const room = top + m.dy - readTop
    if (left > 0 && room > 0) need = Math.max(need, (left * speed) / room)
  }
  return need
}

/** The rate a story actually plays at: 04's pace (1) or faster, never past MAX_RATE, in 0.01 steps. */
export const rateFor = (need: number) => Math.min(MAX_RATE, Math.max(1, Math.round(need * 100) / 100))

/** The visitor's scroll speed (px/ms; > 0 is down), averaged over the last 400 ms of samples of something's top
 *  (the page's: −scrollY). 0 when unknown, when it has stopped (no move for 150 ms), or when it's a jump rather
 *  than a scroll (faster than 3000 px/s). */
export function speedOf(samples: readonly { t: number; top: number }[]): number {
  const last = samples.at(-1)
  if (!last) return 0
  const win = samples.filter((s) => last.t - s.t <= SPEED_WINDOW_MS)
  if (last.t - win[0]!.t < 80) return 0
  // stopped: the page hasn't moved for STILL_MS
  let i = win.length - 1
  while (i > 0 && win[i - 1]!.top === last.top) i--
  if (last.t - win[i]!.t >= STILL_MS) return 0
  // the least-squares slope of top over time (a wheel moves the page in steps; the endpoints alone are noisy)
  const mt = win.reduce((a, s) => a + s.t, 0) / win.length
  const my = win.reduce((a, s) => a + s.top, 0) / win.length
  let num = 0
  let den = 0
  for (const s of win) {
    num += (s.t - mt) * (s.top - my)
    den += (s.t - mt) ** 2
  }
  const v = den > 0 ? -num / den : 0
  return v > MAX_SPEED ? 0 : v
}

/** Wholly below the viewport, so arming it can never hide something the visitor already sees. */
export const isBelowViewport = (el: Element, viewportHeight = window.innerHeight) => {
  const r = el.getBoundingClientRect()
  return r.height > 0 && r.top >= viewportHeight
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Something that happens at a moment of story time (a roll starting, the no-WAAPI end), rescheduled on a new rate. */
interface Cue {
  at: number
  fire: () => void
  timer?: ReturnType<typeof setTimeout>
  fired?: boolean
}

interface Entry {
  el: HTMLElement
  items: HTMLElement[]
  threshold: number
  state: "armed" | "play"
  timers: ReturnType<typeof setTimeout>[]
  rolls: Roll[]
  /** puts each touched element's inline style back exactly as the server rendered it */
  restore: (() => void)[]
  /** its beats (measured once, when first needed), and the same with this play's stagger offset */
  base: Mark[] | null
  marks: Mark[]
  /** its CSS animations while it plays (their playbackRate is the story's rate) */
  anims: Animation[]
  cues: Cue[]
  /** story time = at + (now - since) × rate */
  clock: { at: number; since: number; rate: number }
}

const done = new WeakSet<Element>()

/** The [data-seq] elements a container animates: itself (if it has data-seq) and its descendants. */
function itemsOf(el: HTMLElement): HTMLElement[] {
  const kids = [...el.querySelectorAll<HTMLElement>("[data-seq]")]
  return el.hasAttribute("data-seq") ? [el, ...kids] : kids
}

const ms = (v: string | undefined, dflt: number) => {
  const n = Number(v)
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : dflt
}

/** An item's delay: data-at, else an inline --seq-at ("320ms"), else 0. */
const atOf = (it: HTMLElement) => ms(it.dataset.at ?? it.style.getPropertyValue("--seq-at").replace("ms", "").trim(), 0)
const durOf = (it: HTMLElement, dflt: number) => ms(it.dataset.dur ?? it.style.getPropertyValue("--seq-dur").replace("ms", "").trim(), dflt)

function setKnobs(it: HTMLElement) {
  for (const [attr, name, unit] of KNOBS) {
    const v = it.dataset[attr]
    if (v !== undefined && v !== "") it.style.setProperty(name, `${v}${unit}`)
    else if (!it.style.getPropertyValue(name)) it.style.setProperty(name, "initial") // never inherit the container's
  }
}

/** A container's beats: every item that is laid out and still there in the final frame (not out/travel), with
 *  when it lands (data-at + 70 % of its duration; a roll's full duration) and its centre below the container's top. */
function marksOf(en: Entry): Mark[] {
  if (en.base) return en.base
  const top = en.el.getBoundingClientRect().top
  const out: Mark[] = []
  for (const it of en.items) {
    const fx = it.dataset.seq ?? ""
    if (fx === "out" || fx === "travel") continue
    const r = it.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue // display:none (another breakpoint's copy)
    const dur = durOf(it, EFFECT_MS[fx] ?? FALLBACK_DUR_MS)
    out.push({ end: atOf(it) + (fx === "roll" ? dur : LAND * dur), dy: r.top + r.height / 2 - top })
  }
  return (en.base = out)
}

const storyTime = (en: Entry, now = performance.now()) => en.clock.at + (now - en.clock.since) * en.clock.rate

function schedule(en: Entry, c: Cue) {
  clearTimeout(c.timer)
  c.timer = setTimeout(
    () => {
      c.fired = true
      c.fire()
    },
    Math.max(0, (c.at - storyTime(en)) / en.clock.rate),
  )
}

/** Plays the story at `rate` from now on: its CSS animations, and every cue still to come. */
function setRate(en: Entry, rate: number) {
  if (Math.abs(rate - en.clock.rate) < RATE_STEP && !(rate === 1 && en.clock.rate > 1)) return
  const now = performance.now()
  en.clock = { at: storyTime(en, now), since: now, rate }
  for (const a of en.anims) {
    if (typeof a.updatePlaybackRate === "function") a.updatePlaybackRate(rate)
    else a.playbackRate = rate
  }
  for (const c of en.cues) if (!c.fired) schedule(en, c)
  if (rate > 1) en.el.setAttribute("data-seq-rate", rate.toFixed(2))
  else en.el.removeAttribute("data-seq-rate")
}

/**
 * Arms every container in `containers` that is wholly below the viewport and plays each once in view.
 * Returns a cleanup that finishes everything still pending (back to the final state) and disconnects.
 */
export function armSequences(containers: Iterable<HTMLElement>, opts: SequenceOptions = {}): () => void {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined" || reducedMotion()) return () => {}
  const vh = window.innerHeight
  const entries = new Map<Element, Entry>()

  for (const el of containers) {
    if (done.has(el) || entries.has(el) || el.hasAttribute("data-seq-state") || !isBelowViewport(el, vh)) continue
    const items = itemsOf(el)
    if (items.length === 0) continue
    const restore = items.map(keepStyle)
    for (const it of items) setKnobs(it)
    for (const it of items) if (it.dataset.seq === "roll") armRoll(it)
    el.setAttribute("data-seq-state", "armed")
    entries.set(el, {
      el,
      items,
      threshold: ms(el.dataset.threshold, opts.threshold ?? DEFAULT_THRESHOLD),
      state: "armed",
      timers: [],
      rolls: [],
      restore,
      base: null,
      marks: [],
      anims: [],
      cues: [],
      clock: { at: 0, since: 0, rate: 1 },
    })
  }
  if (entries.size === 0) return () => {}

  const belowLg = opts.startLine !== undefined && typeof window.matchMedia === "function" ? window.matchMedia(BELOW_LG) : null
  const startLine = () => (belowLg?.matches ? (opts.startLine ?? null) : null)
  // an in-page jump's smooth scroll is the page's own speed, not the visitor's: don't pace stories meanwhile
  let jumpUntil = 0
  const jumping = (now = performance.now()) => now < jumpUntil
  // the visitor's speed: the page's recent positions (as tops, −scrollY), noted at every observer callback and pace
  // poll; nothing listens to scroll events
  const trail: { t: number; top: number }[] = []
  const speed = (now = performance.now()) => {
    if (jumping(now)) return 0
    if (jumpUntil) {
      // the jump timed out without a scrollend: drop its samples, as endJump does
      jumpUntil = 0
      trail.length = 0
    }
    trail.push({ t: now, top: -window.scrollY })
    while (trail.length > 2 && now - trail[0]!.t > SPEED_WINDOW_MS) trail.shift()
    return speedOf(trail)
  }

  /** back to final; `played`: it played or was skipped, so it never arms again (an unmount, e.g. React
   *  StrictMode's dev remount, leaves it free to be armed by the next mount) */
  const finish = (en: Entry, played = true) => {
    if (!entries.has(en.el)) return
    entries.delete(en.el)
    if (played) done.add(en.el)
    io.unobserve(en.el)
    past.unobserve(en.el)
    for (const t of en.timers) clearTimeout(t)
    for (const c of en.cues) clearTimeout(c.timer)
    for (const r of en.rolls) r.stop(true)
    for (const it of en.items) if (it.dataset.seq === "roll") restoreRoll(it)
    for (const r of en.restore) r()
    en.anims = []
    en.el.style.removeProperty("--seq-offset")
    if (en.el.getAttribute("style") === "") en.el.removeAttribute("style")
    en.el.removeAttribute("data-seq-rate")
    en.el.removeAttribute("data-seq-state")
    if (entries.size === 0) stop()
  }

  const play = (en: Entry, offset: number, top: number, v: number) => {
    en.state = "play"
    if (offset) en.el.style.setProperty("--seq-offset", `${offset}ms`)
    en.el.setAttribute("data-seq-state", "play")
    en.marks = marksOf(en).map((m) => ({ end: m.end + offset, dy: m.dy }))
    const rate = rateFor(pace(en.marks, top, v))
    en.clock = { at: 0, since: performance.now(), rate }
    if (rate > 1) en.el.setAttribute("data-seq-rate", rate.toFixed(2))
    const cue = (at: number, fire: () => void) => {
      const c: Cue = { at, fire }
      en.cues.push(c)
      schedule(en, c)
    }
    const waits: Promise<unknown>[] = []
    let fallbackEnd = 0
    for (const it of en.items) {
      const at = atOf(it) + offset
      fallbackEnd = Math.max(fallbackEnd, at + durOf(it, FALLBACK_DUR_MS))
      if (it.dataset.seq !== "roll") continue
      waits.push(
        new Promise<void>((resolve) => {
          cue(at, () => {
            // a roll that has started keeps its speed (500 ms at 04's pace)
            const r = startRoll(it, durOf(it, 500) / en.clock.rate)
            en.rolls.push(r)
            void r.done.then(resolve)
          })
        }),
      )
    }
    // CSS animations exist as soon as the attribute is set (getAnimations flushes style)
    const anims =
      typeof en.el.getAnimations === "function"
        ? en.el.getAnimations({ subtree: true }).filter((a) => String((a as CSSAnimation).animationName ?? "").startsWith(SEQ_KEYFRAMES))
        : null
    if (anims) {
      en.anims = anims
      if (rate !== 1) for (const a of anims) a.playbackRate = rate
      waits.push(...anims.map((a) => a.finished))
    } else waits.push(new Promise<void>((resolve) => cue(fallbackEnd, resolve)))
    void Promise.allSettled(waits).then(() => finish(en))
    en.timers.push(setTimeout(() => finish(en), Math.max(SAFETY_MS, fallbackEnd + 1000)))
    pollPace()
  }

  // While stories play, re-check their pace every 100 ms from the scroll position (no scroll listener): faster when
  // the visitor speeds up, back to 04's pace when they slow down or stop.
  let poll: ReturnType<typeof setInterval> | undefined
  function pollPace() {
    if (poll !== undefined) return
    poll = setInterval(() => {
      const now = performance.now()
      const v = speed(now)
      let playing = false
      for (const en of entries.values()) {
        if (en.state !== "play") continue
        playing = true
        const need = rateFor(pace(en.marks, en.el.getBoundingClientRect().top, v, storyTime(en, now)))
        // stopped: 04's pace at once; still scrolling: slow down gently (never late because of one uneven moment)
        setRate(en, v === 0 ? 1 : Math.max(need, Math.round((en.clock.rate - RATE_EASE) * 100) / 100))
      }
      if (!playing) stopPoll()
    }, PACE_POLL_MS)
  }
  function stopPoll() {
    clearInterval(poll)
    poll = undefined
  }

  const io = new IntersectionObserver(
    (records) => {
      const v = speed()
      const starting: [Entry, number][] = []
      for (const [i, r] of records.entries()) {
        const en = entries.get(r.target)
        // (one batch can hold two records for the same target: the latest wins)
        if (!en || records.some((o, j) => j > i && o.target === r.target)) continue
        const top = r.boundingClientRect.top
        const d = decide(r, en.threshold, window.innerHeight, en.state, startLine())
        if (d === "skip") finish(en)
        else if (en.state !== "armed" || !r.isIntersecting) continue
        else if (d === "play") starting.push([en, top])
        // scrolling so fast that waiting for its start line would rush it: start now, while it comes on screen
        else if (pace(marksOf(en), top, v) >= EARLY_RATE) starting.push([en, top])
      }
      starting.forEach(([en, top], i) => play(en, Math.min(i, MAX_STAGGER_STEPS) * (opts.stagger ?? 0), top, v))
    },
    { threshold: THRESHOLDS },
  )
  for (const el of entries.keys()) io.observe(el)

  // An instant jump can carry a container from below the viewport to above it without it ever intersecting, and then
  // the observer above reports nothing. This one's root is everything ABOVE the viewport (a huge top margin, the
  // whole viewport cut off the bottom), so passing over a container fires here.
  const past = new IntersectionObserver(
    (records) => {
      for (const r of records) {
        const en = entries.get(r.target)
        if (en && r.isIntersecting && (en.state === "armed" || r.boundingClientRect.bottom <= 0)) finish(en)
      }
    },
    { rootMargin: "99999px 0px -100% 0px", threshold: 0 },
  )
  for (const el of entries.keys()) past.observe(el)

  // an in-page jump (#how, #rules, #tech): finish everything above the target before the smooth scroll flies past
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href^='#']")
    const id = a?.getAttribute("href")?.slice(1)
    const target = id ? document.getElementById(decodeURIComponent(id)) : null
    if (!target) return
    jumpUntil = performance.now() + JUMP_MS
    window.addEventListener("scrollend", endJump, { once: true })
    const top = target.getBoundingClientRect().top
    for (const en of [...entries.values()]) if (en.el.getBoundingClientRect().top < top) finish(en)
  }
  document.addEventListener("click", onClick, true)
  function endJump() {
    jumpUntil = 0
    trail.length = 0 // the smooth scroll's own samples aren't the visitor's speed
  }

  // reduced motion switched on mid-way: everything lands final
  const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null
  const onMotionPref = () => {
    if (mq?.matches) for (const en of [...entries.values()]) finish(en)
  }
  mq?.addEventListener?.("change", onMotionPref)

  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    io.disconnect()
    past.disconnect()
    stopPoll()
    mq?.removeEventListener?.("change", onMotionPref)
    document.removeEventListener("click", onClick, true)
    window.removeEventListener("scrollend", endJump)
  }
  return () => {
    for (const en of [...entries.values()]) finish(en, false)
    stop()
  }
}

/** Arms every [data-sequence] inside `root` (and `root` itself if it is one). */
export function armSequencesIn(root: Element | null | undefined, opts?: SequenceOptions): () => void {
  if (!root) return () => {}
  const list = [...root.querySelectorAll<HTMLElement>("[data-sequence]")]
  if (root instanceof HTMLElement && root.hasAttribute("data-sequence")) list.unshift(root)
  return armSequences(list, opts)
}

// ---------------------------------------------------------------------------------------------------------
// roll: the amount shows its `from` value while armed, counts to the server-rendered value, and always ends on
// exactly the server's text. data-roll-ghost="end|start" keeps the final width while it rolls (RollingMoney sets it
// when the digit count changes).

const writers = new WeakMap<HTMLElement, AmountWriter>()

function rollData(it: HTMLElement): { from: Micro; to: Micro; format: MoneyFormat } | null {
  try {
    return {
      from: BigInt(it.dataset.rollFrom ?? ""),
      to: BigInt(it.dataset.rollTo ?? ""),
      format: (it.dataset.rollFormat as MoneyFormat | undefined) ?? "fixed",
    }
  } catch {
    return null
  }
}

function armRoll(it: HTMLElement) {
  const d = rollData(it)
  const ghost = it.dataset.rollGhost
  const w = d && amountWriter(it, { ghost: ghost === "start" || ghost === "end" ? ghost : null })
  if (!d || !w) return
  writers.set(it, w)
  w.write(amountText(w.text, d.to, d.format)(d.from)) // the start pose: the old amount
}

function startRoll(it: HTMLElement, dur: number): Roll {
  const d = rollData(it)
  const w = writers.get(it)
  if (!d || !w) return { stop: () => {}, done: Promise.resolve() }
  return rollMoney(w, d.from, d.to, { ms: dur, format: d.format })
}

function restoreRoll(it: HTMLElement) {
  const w = writers.get(it)
  w?.write(w.text)
  w?.release()
  writers.delete(it)
}
