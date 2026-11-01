"use client"
// Landing motion toolkit: markers that let server components react to scroll without becoming client components.
// Each renders a hidden span and sets an attribute on its PARENT element; style it with Tailwind's data/aria variants.
//  - <ScrollFlag />: data-scrolled on the parent once the page has scrolled (e.g. the sticky header's rule/shadow):
//      <header className="… data-scrolled:shadow-card"><ScrollFlag />…</header>
//  - <ActiveNav ids={["how","rules","tech"]} />: aria-current="true" on the parent's a[href="#<id>"] for the section
//      under the reading line (useActiveSection), removed from the others:
//      <nav><ActiveNav ids={…} /><a href="#how" className="aria-[current=true]:bg-surface-sunken">…</a></nav>
//  - <SmoothAnchors />: data-smooth-anchors on the parent (page.tsx: the [data-landing] wrapper) while the landing is
//      the page on screen and has loaded; landing-motion.css turns smooth in-page jumps on with it.
import { useEffect, useLayoutEffect, useRef } from "react"
import { useActiveSection, useScrolled } from "./hooks"

/**
 * Smooth anchors only once the page has loaded, and only while it is mounted and shown (motion-QA):
 *  - set a frame after the load event, so a cold deep link (/#tech) lands at once instead of flying through the whole
 *    page (Chromium and WebKit apply scroll-behavior to the initial fragment scroll);
 *  - removed on unmount AND when Next keeps the page hidden after a client navigation (React <Activity> keeps the DOM,
 *    so `html:has([data-landing])` would still match, but it runs effect cleanups): /demo and /pots never inherit
 *    smooth scrolling (their scroll-to-top glided ~500 px after a click from deep in the page). A LAYOUT effect, so the
 *    cleanup runs in the commit's mutation phase, before the new page's scroll-to-top (a layout-phase lifecycle).
 */
export function SmoothAnchors() {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    let frame = 0
    const on = () => {
      frame = requestAnimationFrame(() => host.setAttribute("data-smooth-anchors", ""))
    }
    if (document.readyState === "complete") on()
    else window.addEventListener("load", on, { once: true })
    return () => {
      window.removeEventListener("load", on)
      cancelAnimationFrame(frame)
      host.removeAttribute("data-smooth-anchors")
    }
  }, [])
  return <span ref={ref} hidden />
}

export function ScrollFlag({ threshold = 8 }: { threshold?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const scrolled = useScrolled(threshold)
  useEffect(() => {
    ref.current?.parentElement?.toggleAttribute("data-scrolled", scrolled)
  }, [scrolled])
  return <span ref={ref} hidden />
}

export function ActiveNav({ ids, line }: { ids: readonly string[]; line?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const active = useActiveSection(ids, { line })
  useEffect(() => {
    const root = ref.current?.parentElement
    if (!root) return
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      if (active !== null && a.getAttribute("href") === `#${active}`) a.setAttribute("aria-current", "true")
      else a.removeAttribute("aria-current")
    }
  }, [active])
  return <span ref={ref} hidden />
}
