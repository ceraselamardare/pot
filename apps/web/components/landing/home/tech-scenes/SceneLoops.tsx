"use client"
// The bento's one client island (plan/design-direction/08-tech-bento.md, v2): it arms the six scene loops and is the
// visible Pause/Play control they need (WCAG 2.2.2: they run longer than 5 s).
//  - Arms: marks the list (`target`) with `data-scenes`, which gives every `.sc` part its loop (bento.css), paused on
//    its first frame, which is the scene's end frame (the server HTML), so nothing changes on screen.
//  - Plays: a scene gets `data-play` only while at least half of it is on screen, the tab is visible and the visitor
//    hasn't paused; anything else freezes it where it is (`animation-play-state`), so off-screen loops cost nothing.
//  - Reduced motion (also when switched on later) or no JS: nothing is armed and the control isn't shown; every
//    scene is its still end frame.
// The control is a toggle with one fixed name ("Pause the animations"; aria-pressed = paused); its icon shows what a
// press does (pause while running, play while paused). A 44 px target, its row keeps the height without it (CLS 0).
import { Pause, Play } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

const REDUCE = "(prefers-reduced-motion: reduce)"
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}
/** no motion until we know (the server and the first client render): the control appears after hydration */
const reducedNow = () => window.matchMedia(REDUCE).matches
const reducedOnServer = () => true

/** at least this share of a scene must be on screen for it to play */
const IN_VIEW = 0.5

export function SceneLoops({ target, label }: { target: string; label: string }) {
  const reduced = useSyncExternalStore(subscribe, reducedNow, reducedOnServer)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  const sync = useRef<() => void>(() => {})

  useEffect(() => {
    const list = document.getElementById(target)
    if (!list || reduced || typeof IntersectionObserver === "undefined") return
    const scenes = [...list.querySelectorAll<HTMLElement>("[data-scene]")]
    const seen = new Set<Element>()
    const update = () => {
      const on = !pausedRef.current && document.visibilityState !== "hidden"
      for (const s of scenes) s.toggleAttribute("data-play", on && seen.has(s))
    }
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          if (r.isIntersecting && r.intersectionRatio >= IN_VIEW - 0.01) seen.add(r.target)
          else seen.delete(r.target)
        }
        update()
      },
      { threshold: [0, IN_VIEW] },
    )
    list.setAttribute("data-scenes", "")
    for (const s of scenes) io.observe(s)
    document.addEventListener("visibilitychange", update)
    sync.current = update
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", update)
      sync.current = () => {}
      list.removeAttribute("data-scenes")
      for (const s of scenes) s.removeAttribute("data-play")
    }
  }, [target, reduced])

  useEffect(() => {
    pausedRef.current = paused
    sync.current()
  }, [paused])

  if (reduced) return null
  const Icon = paused ? Play : Pause
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={paused}
      aria-controls={target}
      onClick={() => setPaused((p) => !p)}
      data-scenes-control
      // a 44 px target around a 36 px secondary circle (Night: transparent, line-strong edge), flush with the grid's edge
      className="group/loop l-press -mr-1 grid size-11 shrink-0 place-items-center rounded-pill"
    >
      <span className="grid size-9 place-items-center rounded-pill border border-line-strong text-ink transition-colors duration-200 group-hover/loop:bg-surface-sunken">
        <Icon aria-hidden className="size-5" strokeWidth={2} />
      </span>
    </button>
  )
}
