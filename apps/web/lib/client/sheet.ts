"use client"
// Sheets are URL query state, not routes (frontend-architecture §2.2): ?sheet=add|spend|share|create and
// ?r=<id>. Opened with native history.pushState (Next integrates it with useSearchParams), so Back closes the
// sheet and deep links work. close(): history.back() when we opened it, else replaceState (a cold deep link
// never leaves the app).
import { useSearchParams } from "next/navigation"
import { useCallback } from "react"

export type SheetName = "add" | "spend" | "share" | "create" | "close" | "rules" | "coach" | "push"

/** The URL we pushed for the open sheet: Back only when the current entry is ours (a cold deep link isn't). */
let pushedUrl: string | null = null
const here = () => `${window.location.pathname}${window.location.search}`

function urlWith(mutate: (p: URLSearchParams) => void): string {
  const u = new URL(window.location.href)
  mutate(u.searchParams)
  const q = u.searchParams.toString()
  return `${u.pathname}${q ? `?${q}` : ""}`
}

export function openSheet(name: SheetName, extra: Record<string, string> = {}) {
  const url = urlWith((p) => {
    p.delete("r")
    p.set("sheet", name)
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
  })
  pushedUrl = url
  window.history.pushState(null, "", url)
}

/** Approve sheet: ?r=<id> (+ ?pot=<slug> outside the Pot screen, e.g. on Requests). */
export function openRequest(id: number, pot?: string) {
  const url = urlWith((p) => {
    p.delete("sheet")
    p.set("r", String(id))
    if (pot && !window.location.pathname.startsWith(`/p/${pot}`)) p.set("pot", pot)
  })
  pushedUrl = url
  window.history.pushState(null, "", url)
}

const SHEET_PARAMS = ["sheet", "r", "pot", "amount", "src", "d", "pid"]

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
  if (pushedUrl && pushedUrl === here()) {
    pushedUrl = null
    window.history.back()
    return
  }
  pushedUrl = null
  window.history.replaceState(null, "", urlWith((p) => SHEET_PARAMS.forEach((k) => p.delete(k))))
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
      window.history.replaceState(null, "", urlWith((p) => (v === fallback ? p.delete("tab") : p.set("tab", v))))
    },
    [fallback],
  )
  return [value, set]
}
