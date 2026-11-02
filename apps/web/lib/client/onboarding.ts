"use client"
// First-run onboarding (2026-11-02; notes/frontend.md "Onboarding"): the intro + "Help us make Pot better" shows
// once per browser for a signed-in person, inside the app shell only (never on /demo, the landing, an invite before
// sign-in, or the claim/gift pages: those are outside the (app) layout).
//
// The flag lives in localStorage under a VERSIONED key, so a future flow can show again with a new key:
//   pot.onboarding.v1 = {"done":true,"at":<ms>,"survey":"sent"|"skipped","via":"finished"|"skipped"|"closed"}
// Every access is wrapped in try/catch:
//  - can't read storage at all → never auto-show (we couldn't remember the answer, and it would come back on every
//    visit); "See the intro again" still works;
//  - can read but not write → it shows once, and an in-memory flag keeps it away for the rest of this page's life.
// How they came in rides in sessionStorage['pot.onboarding.entry'] = {how: joined|created, slug, potName}: a joiner's
// intro speaks about their Pot and returns them to it, and the survey records the context (never asked).
import { useSyncExternalStore } from "react"

export const ONBOARDING_KEY = "pot.onboarding.v1"
export const ENTRY_KEY = "pot.onboarding.entry"

export interface OnboardingRecord {
  done: true
  /** when it was finished or dismissed (ms) */
  at: number
  /** did they send answers to "Help us make Pot better"? */
  survey: "sent" | "skipped"
  /** finished every screen / tapped Skip / closed it (✕, Esc, Back) */
  via: "finished" | "skipped" | "closed"
}

export type FlagRead = { ok: true; record: OnboardingRecord | null } | { ok: false }

type Getter = Pick<Storage, "getItem">
type Setter = Pick<Storage, "setItem">

/** A stored value → a record, or null when absent or not ours (a garbled value counts as not done). */
export function parseRecord(raw: string | null): OnboardingRecord | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as Partial<OnboardingRecord> | null
    if (!j || j.done !== true) return null
    return {
      done: true,
      at: typeof j.at === "number" ? j.at : 0,
      survey: j.survey === "sent" ? "sent" : "skipped",
      via: j.via === "finished" || j.via === "closed" ? j.via : "skipped",
    }
  } catch {
    return null
  }
}

export function readFlag(storage: Getter | null | undefined): FlagRead {
  if (!storage) return { ok: false }
  try {
    return { ok: true, record: parseRecord(storage.getItem(ONBOARDING_KEY)) }
  } catch {
    return { ok: false }
  }
}

/** true when it was stored */
export function writeFlag(storage: Setter | null | undefined, rec: OnboardingRecord): boolean {
  if (!storage) return false
  try {
    storage.setItem(ONBOARDING_KEY, JSON.stringify(rec))
    return true
  } catch {
    return false
  }
}

export type AutoShow = "show" | "intercept_create" | "wait" | "never"

/**
 * May the intro open by itself now?
 *  - never: already done (stored, or earlier in this page's life), or storage can't be read;
 *  - wait: another sheet is open (an Add money right after "You're in!", a request, the push pre-prompt…): the
 *    intro never stacks on another overlay, it comes once that one closes;
 *  - intercept_create: "Start a Pot" from the landing (/pots?sheet=create) right after signing in: the intro comes
 *    first and ends in the Create sheet;
 *  - show: open it.
 */
export function autoShow(i: { flag: FlagRead; doneThisLoad: boolean; params: URLSearchParams; pathname: string }): AutoShow {
  if (i.doneThisLoad || !i.flag.ok || i.flag.record) return "never"
  const sheet = i.params.get("sheet")
  if (sheet === "intro") return "wait" // already open (a deep link or a replay)
  if (sheet === "create" && !i.params.get("step") && i.pathname === "/pots") return "intercept_create"
  if (sheet || i.params.has("r") || i.params.has("pid")) return "wait"
  return "show"
}

// ---------------------------------------------------------------------------------------------------------
// the browser side

const subs = new Set<() => void>()
let doneThisLoad = false
let shownThisLoad = false

const local = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

function emit() {
  subs.forEach((f) => f())
}

/** Done (stored or this page's in-memory flag). */
export function onboardingDone(): boolean {
  if (doneThisLoad) return true
  const f = readFlag(local())
  return !f.ok || !!f.record
}

/** Remember that it was finished or dismissed; works (for this page) even when storage refuses. */
export function markOnboardingDone(survey: OnboardingRecord["survey"], via: OnboardingRecord["via"], now = Date.now()): OnboardingRecord {
  const rec: OnboardingRecord = { done: true, at: now, survey, via }
  doneThisLoad = true
  writeFlag(local(), rec)
  emit()
  return rec
}

/** The intro opened by itself in this page's life (the push pre-prompt then waits for the next launch). */
export function noteOnboardingShown() {
  shownThisLoad = true
  emit()
}

/** Is the intro due or was it on screen in this page's life? The push pre-prompt never stacks on it. */
export function onboardingBusy(): boolean {
  return shownThisLoad || !onboardingDone()
}

/** For tests: forget this page's in-memory state. */
export function resetOnboardingMemory() {
  doneThisLoad = false
  shownThisLoad = false
  emit()
}

interface Snapshot {
  flag: FlagRead
  doneThisLoad: boolean
  shownThisLoad: boolean
}
let snap: Snapshot | null = null
let snapKey = ""
function snapshot(): Snapshot {
  const flag = readFlag(local())
  const key = `${flag.ok ? JSON.stringify(flag.record) : "x"}|${doneThisLoad}|${shownThisLoad}`
  if (!snap || key !== snapKey) {
    snap = { flag, doneThisLoad, shownThisLoad }
    snapKey = key
  }
  return snap
}
const SERVER: Snapshot = { flag: { ok: true, record: { done: true, at: 0, survey: "skipped", via: "skipped" } }, doneThisLoad: true, shownThisLoad: false }

/** The flag as React state (another tab finishing it counts too). Server/hydration: "done", so nothing flashes. */
export function useOnboardingState(): Snapshot {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      const onStorage = (e: StorageEvent) => {
        if (e.key === ONBOARDING_KEY || e.key === null) cb()
      }
      window.addEventListener("storage", onStorage)
      return () => {
        subs.delete(cb)
        window.removeEventListener("storage", onStorage)
      }
    },
    snapshot,
    () => SERVER,
  )
}

// ---------------------------------------------------------------------------------------------------------
// how the person came in, for this tab: set on "You're in!" (/j) or when they create a Pot, read by the intro
// (a joiner's copy names their Pot and the intro returns them to it; the survey's `context`), cleared when it ends

export interface EntryContext {
  how: "joined" | "created"
  slug: string
  potName: string
}

const session = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function rememberEntry(ctx: EntryContext) {
  try {
    session()?.setItem(ENTRY_KEY, JSON.stringify(ctx))
  } catch {}
}

export function readEntry(storage: Getter | null | undefined = session()): EntryContext | null {
  try {
    const j = JSON.parse(storage?.getItem(ENTRY_KEY) ?? "null") as Partial<EntryContext> | null
    if (!j || (j.how !== "joined" && j.how !== "created")) return null
    if (typeof j.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(j.slug) || typeof j.potName !== "string") return null
    return { how: j.how, slug: j.slug, potName: j.potName.slice(0, 80) }
  } catch {
    return null
  }
}

export function clearEntry() {
  try {
    session()?.removeItem(ENTRY_KEY)
  } catch {}
}
