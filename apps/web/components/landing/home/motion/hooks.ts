"use client"
// Landing motion toolkit: scroll-state hooks. No per-frame work: one shared passive scroll listener throttled to one
// read of scrollY per animation frame (reading scrollY forces no layout), and IntersectionObserver for sections.
import { useEffect, useState, useSyncExternalStore } from "react"

const listeners = new Set<() => void>()
let frame = 0
function onScroll() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    for (const l of listeners) l()
  })
}
function subscribeScroll(cb: () => void) {
  if (listeners.size === 0) window.addEventListener("scroll", onScroll, { passive: true })
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    if (listeners.size > 0) return
    window.removeEventListener("scroll", onScroll)
    cancelAnimationFrame(frame)
    frame = 0
  }
}

/** true once the page has scrolled more than `threshold` px (the header's "scrolled" state). false on the server. */
export function useScrolled(threshold = 8): boolean {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > threshold,
    () => false,
  )
}

/**
 * The id (from `ids`) of the section under a reading line `line` of the way down the viewport (default 0.35, the
 * spec's scroll-spy line), or
 * null above the first one / below the last one. With touching sections the lower one wins at a boundary.
 */
export function useActiveSection(ids: readonly string[], { line = 0.35 }: { line?: number } = {}): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(" ")
  useEffect(() => {
    const els = key
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return
    const top = Math.round(line * 100)
    const crossing = new Set<Element>()
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          if (r.isIntersecting) crossing.add(r.target)
          else crossing.delete(r.target)
        }
        // document order: the last section touching the line
        const hit = els.filter((el) => crossing.has(el)).at(-1)
        setActive(hit?.id ?? null)
      },
      // a 1 % band at the line (a zero-height root is unreliable across engines)
      { rootMargin: `-${top}% 0px -${Math.max(0, 99 - top)}% 0px`, threshold: 0 },
    )
    for (const el of els) io.observe(el)
    return () => io.disconnect()
  }, [key, line])
  return active
}
