"use client"
// The header nav's client half (design-direction 04 §0), a marker inside the server-rendered <nav> of SiteHeader:
//  - the active section: aria-current="true" on the link of the section under the viewport's 35 % line
//    (useActiveSection: hero, problem, final CTA and footer have none);
//  - ONE 2 px `ink` bar, 6 px above the links' 44 px hit areas, as wide as the active link's text. It moves with
//    transform only (translateX + scaleX from a fixed 96 px box, so its 1 px round ends never visibly squash):
//    280 ms ease-standard between links; it fades 0 ↔ 1 over 200 ms when a section with no link starts or ends.
//    Reduced motion: it jumps and fades in over 120 ms (top.css). No JS: no bar, no aria-current.
//  - after an anchor jump, focus moves to the target section's H2 (tabindex -1, no ring: top.css), without
//    scrolling, so the smooth scroll stays smooth, a screen reader announces where you landed and the next Tab
//    continues inside that section (the link itself keeps nothing).
import { useEffect, useRef } from "react"
import { useActiveSection } from "./motion/hooks"

/** the bar's own width in px; it is scaled to each link's text width */
const BAR = 96

/** slide: from the last link (280 ms; a jump + fade when there was none, or under reduced motion); appear: fade in
 *  where it lands; snap: move at once and keep the opacity */
type Mode = "slide" | "appear" | "snap"

export function SiteHeaderNav({ ids }: { ids: readonly string[] }) {
  const ref = useRef<HTMLSpanElement>(null)
  const active = useActiveSection(ids)
  const shown = useRef(false)

  /** the current placement, for the layout observer below (it must not restart with every section change, or its
   *  first callback would cut the 280 ms slide short) */
  const placeRef = useRef<(mode: Mode) => void>(() => {})

  // aria-current + the bar
  useEffect(() => {
    const bar = ref.current
    const nav = bar?.parentElement
    if (!bar || !nav) return
    for (const a of nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      if (active !== null && a.getAttribute("href") === `#${active}`) a.setAttribute("aria-current", "true")
      else a.removeAttribute("aria-current")
    }
    const place = (mode: Mode) => {
      const text = active !== null ? nav.querySelector(`a[href="#${CSS.escape(active)}"] [data-nav-text]`) : null
      const n = nav.getBoundingClientRect()
      const r = text?.getBoundingClientRect()
      if (!r || r.width === 0 || n.width === 0) {
        bar.style.opacity = "0"
        shown.current = false
        return
      }
      const transform = `translateX(${(r.left - n.left).toFixed(2)}px) scaleX(${(r.width / BAR).toFixed(4)})`
      if (mode === "slide" && shown.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        bar.style.transform = transform
      } else {
        bar.style.transition = "none"
        if (mode !== "snap" || !shown.current) bar.style.opacity = "0"
        bar.style.transform = transform
        void bar.offsetWidth
        bar.style.removeProperty("transition")
      }
      bar.style.opacity = "1"
      shown.current = true
    }
    placeRef.current = place
    place("slide")
  }, [active])

  // re-measure without motion when the layout changes (a resize, crossing lg, the web font arriving)
  useEffect(() => {
    const nav = ref.current?.parentElement
    if (!nav) return
    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => placeRef.current("snap"))
    }
    const ro = new ResizeObserver(remeasure)
    ro.observe(nav)
    void document.fonts?.ready.then(remeasure)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  // focus follows an anchor jump
  useEffect(() => {
    const nav = ref.current?.parentElement
    if (!nav) return
    let frame = 0
    let late = 0
    let onHash: (() => void) | null = null
    const dropLate = () => {
      clearTimeout(late)
      if (onHash) window.removeEventListener("hashchange", onHash)
      onHash = null
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#"]')
      const id = a?.getAttribute("href")?.slice(1)
      if (!id || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const focusHeading = () => {
        const target = document.getElementById(decodeURIComponent(id))
        const heading = target?.querySelector<HTMLElement>("h2") ?? target
        if (!heading) return
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1")
        heading.focus({ preventScroll: true })
      }
      // after the browser's own fragment navigation (it moved the hash and started the smooth scroll)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(focusHeading)
      // Firefox runs that navigation a moment later and drops focus to <body> doing it (motion-QA): focus again on the
      // hashchange it fires, if focus fell (a click on the current hash fires none; the first focus then stands)
      dropLate()
      onHash = () => {
        if (document.activeElement === document.body) focusHeading()
        dropLate()
      }
      window.addEventListener("hashchange", onHash)
      late = window.setTimeout(dropLate, 500)
    }
    nav.addEventListener("click", onClick)
    return () => {
      nav.removeEventListener("click", onClick)
      cancelAnimationFrame(frame)
      dropLate()
    }
  }, [])

  return <span ref={ref} aria-hidden data-nav-indicator className="pointer-events-none absolute bottom-1.5 left-0 h-0.5 w-24 origin-left rounded-pill bg-ink opacity-0" />
}
