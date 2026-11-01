"use client"
// Browser-only values as useSyncExternalStore hooks with a server snapshot (frontend-architecture §2.3):
// online state, reduced motion, a delayed flag for skeletons (shown only after 150 ms), and a live region.
import { useEffect, useState, useSyncExternalStore } from "react"

function mediaStore(query: string) {
  return {
    subscribe(cb: () => void) {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    get: () => window.matchMedia(query).matches,
  }
}

const reduced = mediaStore("(prefers-reduced-motion: reduce)")
export function useReducedMotion(): boolean {
  return useSyncExternalStore(reduced.subscribe, reduced.get, () => false)
}
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb)
  window.addEventListener("offline", cb)
  return () => {
    window.removeEventListener("online", cb)
    window.removeEventListener("offline", cb)
  }
}
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}
export const isOnline = () => typeof navigator === "undefined" || navigator.onLine

/** false for the first `ms`, then true: skeletons appear only after 150 ms (no flash on fast loads). */
export function useDelayedFlag(ms = 150): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setOn(true), ms)
    return () => clearTimeout(id)
  }, [ms])
  return on
}

// ---------------------------------------------------------------------------------------------------------
// One polite live region per screen (WCAG 4.1.3). announce() speaks once; the toast or the live region speaks
// for an event, never both (frontend-architecture §6.2).

let message = ""
let seq = 0
const subs = new Set<() => void>()

export function announce(text: string) {
  seq += 1
  // a zero-width suffix toggles so the same sentence is re-announced
  message = seq % 2 ? text : `${text}​`
  for (const s of subs) s()
}

export function useAnnouncement(): string {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => message,
    () => "",
  )
}
