"use client"
// Install coach state (frontend-architecture §5.8; ux-spec §9; design-direction 01 §5). Install is earned:
// the card appears after the first contribution or after creating a Pot, never on the landing, never on desktop
// or when already installed. At most 2 automatic shows per device; "Not now" snoozes for 7 days.
// Persisted in localStorage `pot.coach` = {shows, snoozedUntil} (try/catch: private mode just forgets).
import { useSyncExternalStore } from "react"
import type { InstallContext } from "./platform"

export interface CoachState {
  /** automatic card shows on this device */
  shows: number
  snoozedUntil: number
  /** the Pot whose success state should carry the card (set by a first contribution / a new Pot) */
  pending: string | null
  /** the card was counted as shown for this Pot (it stays until answered) */
  shownFor?: string | null
}

export const COACH_KEY = "pot.coach"
export const MAX_AUTO_SHOWS = 2
export const SNOOZE_MS = 7 * 86_400_000
const EMPTY: CoachState = { shows: 0, snoozedUntil: 0, pending: null }

export type CoachEvent =
  | { type: "TRIGGER"; pot: string }
  | { type: "SHOWN"; pot: string }
  | { type: "NOT_NOW"; now: number }
  | { type: "SHOW_ME" }
  | { type: "INSTALLED" }

/** Pure transitions (unit-tested). */
export function coachReducer(s: CoachState, e: CoachEvent): CoachState {
  switch (e.type) {
    case "TRIGGER":
      return { ...s, pending: e.pot }
    case "SHOWN":
      return s.shownFor === e.pot ? s : { ...s, shows: s.shows + 1, shownFor: e.pot }
    case "NOT_NOW":
      return { ...s, pending: null, shownFor: null, snoozedUntil: e.now + SNOOZE_MS }
    case "SHOW_ME":
    case "INSTALLED":
      return { ...s, pending: null, shownFor: null }
  }
}

/** Is the card on screen for this Pot? (already counted, or allowed to show now) */
export function coachVisible(s: CoachState, pot: string, ctx: InstallContext, now: number): boolean {
  if (s.pending !== pot) return false
  return s.shownFor === pot || canAutoShow(s, ctx, now)
}

/** May the card show by itself now? */
export function canAutoShow(s: CoachState, ctx: InstallContext, now: number): boolean {
  if (ctx === "standalone" || ctx === "desktop") return false
  return s.shows < MAX_AUTO_SHOWS && now >= s.snoozedUntil
}

let state: CoachState | null = null
const subs = new Set<() => void>()

function load(): CoachState {
  if (state) return state
  try {
    const raw = localStorage.getItem(COACH_KEY)
    const j = raw ? (JSON.parse(raw) as Partial<CoachState>) : null
    state = {
      shows: typeof j?.shows === "number" ? j.shows : 0,
      snoozedUntil: typeof j?.snoozedUntil === "number" ? j.snoozedUntil : 0,
      pending: typeof j?.pending === "string" ? j.pending : null,
      shownFor: typeof j?.shownFor === "string" ? j.shownFor : null,
    }
  } catch {
    state = { ...EMPTY }
  }
  return state
}

export function coachDispatch(e: CoachEvent): void {
  state = coachReducer(load(), e)
  try {
    localStorage.setItem(COACH_KEY, JSON.stringify(state))
  } catch {}
  subs.forEach((f) => f())
}

const FIRST_KEY = "pot.coach.contributed"

/** The first contribution on this device, or a new Pot: the success state may carry the coach card. */
export function coachTrigger(pot: string, reason: "contribution" | "pot_created"): void {
  if (typeof window === "undefined") return
  if (reason === "contribution") {
    try {
      if (localStorage.getItem(FIRST_KEY)) return
      localStorage.setItem(FIRST_KEY, "1")
    } catch {
      return
    }
  }
  coachDispatch({ type: "TRIGGER", pot })
}

export function useCoachState(): CoachState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      const onStorage = (e: StorageEvent) => {
        if (e.key === COACH_KEY) {
          state = null
          cb()
        }
      }
      window.addEventListener("storage", onStorage)
      return () => {
        subs.delete(cb)
        window.removeEventListener("storage", onStorage)
      }
    },
    load,
    () => EMPTY,
  )
}
