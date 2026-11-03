"use client"
// The /demo tour's state (06 §3.7, §7): one index over 16 states (0 = the cover, 1…14 = the steps, 15 = the end).
// The server HTML (and the hydration pass) is the COVER; right after hydration the player moves, before the first
// paint, to `initial` (the cover on /demo, the old chapter's first step on /demo/1…6) or to the URL fragment
// (#step-n, #end, a legacy #beat-k). The fragment then follows the state with replaceState (no history entry per
// step). No storage, no network.
//
// Pacing (05 §5, 06 §2): step 7 is a sequence. Arriving by the visitor's own Next it shows "Checking Pot rules…" and
// holds Next for 1.2 s (also under reduced motion), then "Approved by Pot rules" with the one burst (only on the
// first forward arrival, never on a deep link, after Back + Next, or under reduced motion), then "$84 sent to you"
// with the balance rolling. Back or a deep link lands on the settled screen. The caption waits too: during the hold it
// says "…Pot checks the rules" (`holdCaptionKey`), and the live region speaks the approval once, after the hold.
//
// Taps (polish after QA): the first tap step a visitor lands on shows a visible one-line hint ("tap the button on
// the phone, or press Next") until they tap the phone once. A tap on anything inert in the phone pokes the way on:
// the phone's live button (or Next, on a step with none) rings twice.
//
// "Under the hood" (06 §4): one optional sheet per part. Its content is rendered once, in the server story list
// (a closed <details> per part); while a part's sheet is open, that content is portalled into it (HoodSlot), so
// there is never a second copy (and never a duplicate id). #near opens the current part's sheet; #g-<id> opens the
// sheet that holds that glossary term.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { t } from "@/i18n/t"
import { prefersReducedMotion } from "@/lib/client/browser"
import { MIN_CHECKING_MS, partOf, SEQUENCE_SENT_MS, stepForLegacyBeat, stepsOfPart, TOUR, TOUR_COVER, TOUR_END, TOUR_PARTS, type TourChapter } from "./tour"

export type Via = "load" | "next" | "back" | "jump"

export interface TourState {
  /** 0 = cover, 1…14 = step, 15 = end */
  at: number
  /** the furthest state reached (the burst plays only past it) */
  reached: number
  via: Via
  /** increments on every landing: keys the timers and the push */
  arrival: number
  /** which of the step's screens shows (step 7's sequence) */
  frame: number
  holding: boolean
  /** increments each time the burst should play */
  burst: number
  /** true only during the arrival that triggered the burst */
  burstLive: boolean
  burstPlayed: boolean
  /** the live region's sentence (empty until the visitor moves) */
  spoken: string
  /** say "This is a simulation" in the first caption box after a deep link, until the first move */
  simLine: boolean
  /** the first tap step this visit landed on: it shows the visible tap hint (null = none yet) */
  hintAt: number | null
  /** the visitor has used the phone's own button once: the hint is done */
  tapped: boolean
}

export type TourAction =
  | { type: "next"; reduced: boolean; phone?: boolean }
  | { type: "back" }
  | { type: "goto"; at: number; via: Via }
  | { type: "release"; reduced: boolean }
  | { type: "settle" }

const lastFrame = (at: number) => Math.max(0, (TOUR[at - 1]?.beats.length ?? 1) - 1)

/** a step whose phone button is there on arrival (step 7's appears only after the check) */
const hintable = (at: number) => !!TOUR[at - 1]?.tap && !TOUR[at - 1]?.hold

/** Show the visible tap hint now? */
export function showsTapHint(s: TourState): boolean {
  return s.hintAt === s.at && !s.tapped
}

/** The caption to show: step 7's "checking" line while Next is held, else the step's own. */
export function captionKeyAt(s: TourState): `tour.s${number}` | `tour.s${number}.checking` | null {
  const step = TOUR[s.at - 1]
  if (!step) return null
  return s.holding && step.holdCaptionKey ? step.holdCaptionKey : step.captionKey
}

/** "Part 3 of 5 · Small spends. Step 6 of 14. You're Maya again. …" */
export function spokenAt(at: number): string {
  if (at === TOUR_COVER) return t("tour.cover.title")
  if (at === TOUR_END) return t("tour.end.title")
  const s = TOUR[at - 1]!
  const part = TOUR_PARTS[s.part - 1]!
  const first = stepsOfPart(s.part)[0]!.n === at
  return [
    first ? t("tour.part", { n: part.n, total: TOUR_PARTS.length, name: t(part.nameKey) }) : null,
    t("tour.progress", { n: at, total: TOUR.length }),
    t(s.captionKey as "tour.s1"),
  ]
    .filter(Boolean)
    .join(". ")
}

export function startState(at: number, hydrated: boolean): TourState {
  return {
    at,
    reached: hydrated ? at : TOUR_COVER,
    via: "load",
    arrival: 0,
    frame: lastFrame(at),
    holding: false,
    burst: 0,
    burstLive: false,
    burstPlayed: false,
    spoken: "",
    simLine: hydrated && at > TOUR_COVER && at < TOUR_END,
    hintAt: hydrated && hintable(at) ? at : null,
    tapped: false,
  }
}

function land(s: TourState, at: number, via: Via): TourState {
  const step = TOUR[at - 1]
  const forward = via === "next"
  const seq = !!step && step.beats.length > 1 && forward
  const holding = !!step?.hold && forward
  return {
    ...s,
    at,
    via,
    arrival: s.arrival + 1,
    frame: seq ? 0 : lastFrame(at),
    holding,
    burstLive: false,
    spoken: holding ? "" : spokenAt(at),
    simLine: false,
    hintAt: s.hintAt ?? (hintable(at) ? at : null),
  }
}

export function reduceTour(s: TourState, a: TourAction): TourState {
  switch (a.type) {
    case "next": {
      if (s.holding || s.at >= TOUR_END) return s
      const at = s.at + 1
      const step = TOUR[at - 1]
      const burst = !!step?.burst && at > s.reached && !s.burstPlayed && !a.reduced
      return {
        ...land(s, at, "next"),
        tapped: s.tapped || !!a.phone,
        reached: Math.max(s.reached, at),
        burst: burst ? s.burst + 1 : s.burst,
        burstLive: burst,
        burstPlayed: s.burstPlayed || burst,
      }
    }
    case "back":
      // step 1's Back is disabled; the end's ← returns to step 14
      return s.at <= 1 ? s : land(s, s.at - 1, "back")
    case "goto":
      if (a.at < TOUR_COVER || a.at > TOUR_END || a.at === s.at) return s
      return { ...land(s, a.at, a.via), reached: Math.max(s.reached, a.at) }
    case "release":
      // the rules check is over: approved (the burst), or straight to the settled screen under reduced motion
      return s.holding ? { ...s, holding: false, frame: a.reduced ? lastFrame(s.at) : Math.min(1, lastFrame(s.at)), spoken: spokenAt(s.at) } : s
    case "settle":
      return { ...s, frame: lastFrame(s.at) }
  }
}

/** The state a URL fragment names, or null. `chapter` maps a legacy #beat-k on /demo/N. */
export function stateFromHash(hash: string, chapter: TourChapter | null): number | null {
  let m = /^#step-(\d+)$/.exec(hash)
  if (m) {
    const n = Number(m[1])
    return n >= 1 && n <= TOUR.length ? n : null
  }
  if (hash === "#end") return TOUR_END
  m = /^#beat-(\d+)$/.exec(hash)
  if (m && chapter) return stepForLegacyBeat(chapter, Number(m[1]))
  return null
}

/** The first match that is on screen (Next keeps a previous page's DOM, hidden, after a client navigation). */
export function visible<T extends HTMLElement>(selector: string): T | null {
  return [...document.querySelectorAll<T>(selector)].find((e) => e.offsetParent !== null || e.getClientRects().length > 0) ?? null
}

/** Keys that belong to what has focus: text fields, scrollable JSON, disclosures, tabs, radio groups, dialogs. */
function ownsArrows(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLElement && el.isContentEditable) return true
  if (el.matches("input, textarea, select, summary, [role=tab], [role=radio], [role=slider]")) return true
  return !!el.closest("details, pre, [role=region][tabindex], [role=tablist], [role=radiogroup], [role=dialog]")
}

/**
 * The sign-in dialog is up (the end's [Start a real Pot] opens it, components/features/auth): the tour never moves
 * under it, even while focus sits outside it (NEAR Connect stacks its own picker on top, 07 §2.7). Its panel carries
 * `data-signin-panel`; one inside a page Next keeps hidden after a client navigation (the app's signed-out screen)
 * has no box and doesn't count.
 */
export function signInOpen(): boolean {
  return [...document.querySelectorAll("[data-signin-panel]")].some((e) => !!e.closest("[role=dialog]") || e.getClientRects().length > 0)
}

export type FocusTarget = "next" | "title" | null

interface Ctx extends TourState {
  hydrated: boolean
  /** `phone`: the phone's own button did it (the tap hint is then done) */
  next(focus?: FocusTarget, phone?: boolean): void
  /** a tap on something inert in the phone: ring the way on (the phone's live button, or Next) */
  poke(to: "phone" | "next"): void
  /** the latest poke (0 = none) and what it rings */
  pokes: number
  pokeTo: "phone" | "next"
  back(focus?: FocusTarget): void
  skip(): void
  /** the part whose hood is (or was last) in the sheet; null = none yet */
  hoodPart: number | null
  hoodOpen: boolean
  openHood(part: number): void
  closeHood(): void
  hoodTarget: HTMLElement | null
  setHoodTarget(el: HTMLElement | null): void
}

const TourContext = createContext<Ctx | null>(null)

export function useTour(): Ctx {
  const c = useContext(TourContext)
  if (!c) throw new Error("useTour outside <TourPlayer>")
  return c
}

const noop = () => () => {}

/** false in the server HTML and on the hydration pass, true after. */
export function useHydratedTour(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
}

const FOCUS: Record<Exclude<FocusTarget, null>, string> = { next: "[data-tour-next]", title: "[data-tour-title]" }

/** Open every closed <details> around `el`, then bring it into view. */
function reveal(el: HTMLElement) {
  for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true
  if (el instanceof HTMLDetailsElement) el.open = true
  el.scrollIntoView({ block: "start" })
}

export function TourPlayer({ initial, chapter, children }: { initial: number; chapter: TourChapter | null; children: ReactNode }) {
  const hydrated = useHydratedTour()
  const [own, setOwn] = useState<TourState | null>(null)
  // the first live state, right after hydration: the fragment, or `initial`
  const first = useMemo(() => (hydrated ? startState(stateFromHash(window.location.hash, chapter) ?? initial, true) : startState(TOUR_COVER, false)), [hydrated, chapter, initial])
  const s: TourState = (hydrated && own) || first
  const sRef = useRef(s)
  useLayoutEffect(() => {
    sRef.current = s
  })
  const focusRef = useRef<FocusTarget>(null)

  // a pure updater (StrictMode calls it twice)
  const dispatch = useCallback((a: TourAction) => setOwn((prev) => reduceTour(prev ?? first, a)), [first])

  const [hoodPart, setHoodPart] = useState<number | null>(null)
  const [hoodOpen, setHoodOpen] = useState(false)
  const [hoodTarget, setHoodTarget] = useState<HTMLElement | null>(null)
  const hoodOpenRef = useRef(false)
  useLayoutEffect(() => {
    hoodOpenRef.current = hoodOpen
  })
  const openHood = useCallback((part: number) => {
    setHoodPart(part)
    setHoodOpen(true)
  }, [])
  const closeHood = useCallback(() => setHoodOpen(false), [])

  const next = useCallback(
    (focus: FocusTarget = null, phone = false) => {
      const cur = sRef.current
      if (cur.holding || cur.at >= TOUR_END) return
      focusRef.current = focus ?? (cur.at === TOUR_COVER ? "next" : cur.at === TOUR_END - 1 ? "title" : null)
      dispatch({ type: "next", reduced: prefersReducedMotion(), phone })
    },
    [dispatch],
  )
  const [pk, setPk] = useState<{ n: number; to: "phone" | "next"; at: number }>({ n: 0, to: "next", at: -1 })
  const poke = useCallback((to: "phone" | "next") => setPk((v) => ({ n: v.n + 1, to, at: sRef.current.arrival })), [])
  // a poke belongs to the arrival it happened on
  const pokes = pk.at === s.arrival ? pk.n : 0
  const back = useCallback(
    (focus: FocusTarget = null) => {
      const cur = sRef.current
      if (cur.at <= 1) return
      // Back is disabled on step 1 (its focus would drop to the page); the end's ← lands on step 14's Next
      focusRef.current = focus ?? (cur.at === 2 || cur.at === TOUR_END ? "next" : null)
      dispatch({ type: "back" })
    },
    [dispatch],
  )
  const skip = useCallback(() => {
    focusRef.current = "title"
    dispatch({ type: "goto", at: TOUR_END, via: "jump" })
  }, [dispatch])

  // focus after a move: on the control pressed (it stays), on Next after the cover / the phone's tap, on the end's title
  useEffect(() => {
    const f = focusRef.current
    if (!f) return
    focusRef.current = null
    const id = requestAnimationFrame(() => visible(FOCUS[f])?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
  }, [s.arrival])

  // the URL fragment follows the state (no history entry per step)
  useEffect(() => {
    if (!hydrated || s.via === "load") return
    try {
      const base = window.location.pathname + window.location.search
      history.replaceState(history.state, "", s.at === TOUR_COVER ? base : s.at === TOUR_END ? `${base}#end` : `${base}#step-${s.at}`)
    } catch {
      /* sandboxed */
    }
  }, [hydrated, s.at, s.via])

  // step 7: the 1.2 s rules check, then approved (+ burst), then sent and the roll
  useEffect(() => {
    if (!s.holding) return
    const reduced = prefersReducedMotion()
    const ids = [setTimeout(() => dispatch({ type: "release", reduced }), MIN_CHECKING_MS)]
    if (!reduced && lastFrame(s.at) > 1) ids.push(setTimeout(() => dispatch({ type: "settle" }), SEQUENCE_SENT_MS))
    return () => ids.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, s.arrival])

  // #near opens the current part's hood; #g-<id> (or #p3-g-<id>) opens the hood that holds that glossary word
  const openFromHash = useCallback(
    (hash: string) => {
      if (hash === "#near") return openHood(partOf(sRef.current.at)?.n ?? 1)
      if (!/^#(?:p\d-)?g-[a-z_0-9]+$/.test(hash)) return
      const id = decodeURIComponent(hash.slice(1))
      const bare = id.replace(/^p\d-/, "")
      const part = partOf(sRef.current.at)?.n ?? 1
      const el = document.getElementById(id) ?? document.getElementById(`p${part}-${bare}`) ?? document.querySelector<HTMLElement>(`[id$="-${bare}"]`)
      const host = el?.closest<HTMLElement>("[data-hood-part]")
      if (!el || !host) return
      openHood(Number(host.dataset.hoodPart))
      // the content moves into the sheet on the next commits: wait for it, then open the glossary and scroll
      let tries = 0
      const find = () => {
        const moved = document.getElementById(el.id)
        if (moved?.closest("[data-hood-sheet]")) reveal(moved)
        else if (tries++ < 30) requestAnimationFrame(find)
      }
      requestAnimationFrame(find)
    },
    [openHood],
  )

  // on arrival: a deep link may have scrolled the (no-JS) story list into view; then the hood links
  const linked = useRef(false)
  useEffect(() => {
    if (!hydrated || linked.current) return
    linked.current = true
    if (window.scrollY) window.scrollTo(0, 0)
    openFromHash(window.location.hash)
  }, [hydrated, openFromHash])

  // a fragment changed by hand moves the tour too
  useEffect(() => {
    const onHash = () => {
      const at = stateFromHash(window.location.hash, chapter)
      if (at !== null && at !== sRef.current.at) dispatch({ type: "goto", at, via: "load" })
      else openFromHash(window.location.hash)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [chapter, dispatch, openFromHash])

  // → / ← move the tour unless what has focus owns the arrow keys, or the hood, a glossary word or sign-in is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
      if (hoodOpenRef.current || ownsArrows(document.activeElement)) return
      if (document.querySelector("[data-glossary-popup]") || signInOpen()) return
      e.preventDefault()
      if (e.key === "ArrowRight") next()
      else back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [back, next])

  const value = useMemo<Ctx>(
    () => ({ ...s, hydrated, next, back, skip, poke, pokes, pokeTo: pk.to, hoodPart, hoodOpen, openHood, closeHood, hoodTarget, setHoodTarget }),
    [s, hydrated, next, back, skip, poke, pokes, pk.to, hoodPart, hoodOpen, openHood, closeHood, hoodTarget],
  )
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}
