"use client"
// Sheets are URL query state, not routes (frontend-architecture §2.2): ?sheet=add|spend|share|create and
// ?r=<id>. Opened with native history.pushState (Next integrates it with useSearchParams), so Back closes the
// sheet and deep links work.
// Multi-step sheets push one entry per step (Add money → network → address; Create name → rules; Spend how much →
// what for), so the browser/Android Back steps back one level like the in-sheet [Back]. Every entry we push carries its depth in
// history.state (`potSheet`: 1 = the sheet's first step). close() unwinds all of the sheet's entries with
// history.go(-depth); a cold deep link (depth 0) is stripped with replaceState, so it never leaves the app.
import { useSearchParams } from "next/navigation"
import { useCallback } from "react"

export type SheetName = "add" | "spend" | "share" | "create" | "close" | "rules" | "coach" | "push" | "person" | "refund" | "paylink"

/** Our keys in history.state (Next.js copies its own internals in beside them). */
interface SheetEntry {
  /** how many entries of the open sheet we pushed up to and including this one */
  potSheet?: number
  /** the entry under depth 1 is a cold deep link to the sheet (not the bare page) */
  potSheetCold?: boolean
}

const entry = (): SheetEntry => (typeof window === "undefined" ? {} : ((window.history.state as SheetEntry | null) ?? {}))
/** This entry's depth in the open sheet: 0 for a cold deep link or a page without a sheet. */
export function sheetDepth(): number {
  const d = entry().potSheet
  return typeof d === "number" && d > 0 ? d : 0
}
/** Our keys of this entry, to carry over a replaceState (a bare replaceState(null) would drop them). */
function ours(): SheetEntry {
  const e = entry()
  return { ...(e.potSheet ? { potSheet: e.potSheet } : {}), ...(e.potSheetCold ? { potSheetCold: true } : {}) }
}
const hasSheet = (p: URLSearchParams) => p.has("sheet") || p.has("r")

function urlWith(mutate: (p: URLSearchParams) => void): string {
  const u = new URL(window.location.href)
  mutate(u.searchParams)
  const q = u.searchParams.toString()
  return `${u.pathname}${q ? `?${q}` : ""}`
}

/** Push one sheet entry: a new sheet (depth 1) or the next step of the open one (depth + 1). */
function push(url: string) {
  const open = hasSheet(new URLSearchParams(window.location.search))
  const d = open ? sheetDepth() : 0
  const cold = open && (d === 0 || entry().potSheetCold === true)
  const state: SheetEntry = { potSheet: d + 1, ...(cold ? { potSheetCold: true } : {}) }
  window.history.pushState(state, "", url)
}

export function openSheet(name: SheetName, extra: Record<string, string> = {}) {
  const url = urlWith((p) => {
    p.delete("r")
    p.set("sheet", name)
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
  })
  push(url)
}

/** Approve sheet: ?r=<id> (+ ?pot=<slug> outside the Pot screen, e.g. on Requests). */
export function openRequest(id: number, pot?: string) {
  const url = urlWith((p) => {
    p.delete("sheet")
    p.set("r", String(id))
    if (pot && !window.location.pathname.startsWith(`/p/${pot}`)) p.set("pot", pot)
  })
  push(url)
}

// "link": the payment link sheet's request id (?sheet=paylink&link=<id>; not ?r=, which opens the request sheet)
const SHEET_PARAMS = ["sheet", "r", "pot", "amount", "src", "d", "pid", "step", "who", "link"]
const strip = (p: URLSearchParams) => SHEET_PARAMS.forEach((k) => p.delete(k))

/**
 * A notification names a proposal (?pid=<id>, set by public/sw.js): open the sheet for what it is, a close, a
 * rules change or a spend request (?r=<request id>). Replaces the entry, so Back still leaves the sheet.
 */
export function resolveProposalParam(
  pid: number,
  known: { close: number | null; rules: number | null; requests: readonly (readonly [proposalId: number, requestId: number])[] },
): "close" | "rules" | "request" | null {
  const target = pid === known.close ? "close" : pid === known.rules ? "rules" : known.requests.some(([p]) => p === pid) ? "request" : null
  if (!target) return null
  const url = urlWith((p) => {
    p.delete("pid")
    p.delete("sheet")
    p.delete("r")
    if (target === "request") p.set("r", String(known.requests.find(([x]) => x === pid)![1]))
    else p.set("sheet", target)
  })
  window.history.replaceState(null, "", url)
  return target
}

export function closeSheet() {
  const n = sheetDepth()
  if (n > 0) {
    // a cold deep link sits under our entries: once back on it, strip it too
    if (entry().potSheetCold) window.addEventListener("popstate", () => window.history.replaceState(null, "", urlWith(strip)), { once: true })
    window.history.go(-n)
    return
  }
  window.history.replaceState(null, "", urlWith(strip))
}

/** The next step of the open sheet as its own history entry, so Back (in-sheet or the browser's) returns here. */
export function pushSheetStep(mutate: (p: URLSearchParams) => void) {
  push(urlWith(mutate))
}

/** Can the in-sheet Back pop the history entry? Only when the entry under this one is the same sheet's. */
export function canPopStep(): boolean {
  const n = sheetDepth()
  return n >= 2 || (n === 1 && entry().potSheetCold === true)
}

/**
 * The in-sheet [Back]: history.back() when the previous step is the entry under this one (so it agrees with the
 * browser's Back); otherwise (a deep link straight to a later step) the previous step replaces this entry.
 */
export function sheetStepBack(previous: (p: URLSearchParams) => void) {
  if (canPopStep()) {
    window.history.back()
    return
  }
  window.history.replaceState(ours(), "", urlWith(previous))
}

/** Change this entry's sheet params in place (keeps our depth keys): e.g. a deep link to a step that can't show yet. */
export function replaceSheetParams(mutate: (p: URLSearchParams) => void) {
  window.history.replaceState(ours(), "", urlWith(mutate))
}

/** Replace the current sheet with another without growing history (Create → Share). */
export function replaceSheet(name: SheetName | null) {
  window.history.replaceState(
    null,
    "",
    urlWith((p) => {
      SHEET_PARAMS.forEach((k) => p.delete(k))
      if (name) p.set("sheet", name)
    }),
  )
}

export function useSheetParams() {
  const params = useSearchParams()
  const sheet = params.get("sheet") as SheetName | null
  const r = params.get("r")
  const requestId = r && /^\d+$/.test(r) ? Number(r) : null
  return { sheet, requestId, amount: params.get("amount"), params }
}

/** Segmented tab state: ?tab= with replaceState (no history entry per tab). */
export function useTabParam<T extends string>(allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const params = useSearchParams()
  const raw = params.get("tab") as T | null
  const value = raw && allowed.includes(raw) ? raw : fallback
  const set = useCallback(
    (v: T) => {
      window.history.replaceState(ours(), "", urlWith((p) => (v === fallback ? p.delete("tab") : p.set("tab", v))))
    },
    [fallback],
  )
  return [value, set]
}
