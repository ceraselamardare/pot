"use client"
// Relative times are computed on the client only (Cache Components: no Date.now() during prerender).
// useNow() ticks every 30 s while mounted, so "2h ago" and "Expires in 7 days" stay honest.
import { useSyncExternalStore } from "react"
import { t } from "@/i18n/t"

let now = 0
const subs = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(cb: () => void) {
  subs.add(cb)
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now()
      for (const s of subs) s()
    }, 30_000)
  }
  return () => {
    subs.delete(cb)
    if (subs.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot() {
  if (now === 0 || Date.now() - now > 30_000) now = Date.now()
  return now
}

/** The current time, refreshed every 30 s. 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0)
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })

export const formatDate = (ms: number) => dateFmt.format(ms)
export const formatTime = (ms: number) => timeFmt.format(ms)

/** "just now", "5 min ago", "2h ago", "3 days ago", then "Nov 12" after 7 days (ux-spec §1.3). */
export function ago(at: number, nowMs: number): string {
  const d = Math.max(0, nowMs - at)
  if (d < 60_000) return t("time.just_now")
  if (d < 3_600_000) return t("time.minutes_ago", { n: Math.floor(d / 60_000) })
  if (d < 86_400_000) return t("time.hours_ago", { n: Math.floor(d / 3_600_000) })
  const days = Math.floor(d / 86_400_000)
  return days < 7 ? t("time.days_ago", { n: days }) : formatDate(at)
}

/** "in 7 days", "in 5 hours", "soon". */
export function inTime(at: number, nowMs: number): string {
  const d = at - nowMs
  if (d <= 0) return t("time.soon")
  if (d < 86_400_000) return d < 3_600_000 ? t("time.soon") : t("time.in_hours", { n: Math.round(d / 3_600_000) })
  return t("time.in_days", { n: Math.round(d / 86_400_000) })
}

/** Day heading for the feed: "Today", "Yesterday", "Nov 12". */
export function dayLabel(at: number, nowMs: number): string {
  const a = new Date(at)
  const b = new Date(nowMs)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((startOf(b) - startOf(a)) / 86_400_000)
  if (diff <= 0) return t("feed.day.today")
  if (diff === 1) return t("feed.day.yesterday")
  return formatDate(at)
}
