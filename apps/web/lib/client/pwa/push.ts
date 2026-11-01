"use client"
// Push permission (frontend-architecture §5.9; D-42: only after install, with a reason; F-23).
// The pre-prompt sheet shows first; the system dialog only ever comes from its button, and
// Notification.requestPermission() is the FIRST call inside that tap (iOS needs the user gesture: no await
// before it). Then pushManager.subscribe (VAPID) → POST /api/push/subscription (api-spec §2.6). Turning it off:
// unsubscribe + DELETE /api/push/subscription.
// The pre-prompt's own state (snoozed, shown) lives in localStorage `pot.push` inside try/catch.
import { useSyncExternalStore } from "react"
import { isIOS, isStandalone } from "./platform"

export type PushSupport = "ready" | "needs_install" | "unsupported"
export type PushStatus = "default" | "requesting" | "subscribing" | "subscribed" | "denied" | "error"

export const PUSH_KEY = "pot.push"
const SNOOZE_MS = 7 * 86_400_000

export interface PushLocal {
  /** the pre-prompt was answered or dismissed on this device */
  prompted: boolean
  snoozedUntil: number
  subscribed: boolean
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""

/** Pure: what this browser can do (unit-tested with a fake environment). */
export function pushSupport(env: { hasNotification: boolean; hasSW: boolean; hasPushManager: boolean; ios: boolean; standalone: boolean }): PushSupport {
  if (env.ios && !env.standalone) return "needs_install" // iOS: web push only for Home Screen apps
  if (!env.hasNotification || !env.hasSW || !env.hasPushManager) return "unsupported"
  return "ready"
}

export function currentSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported"
  return pushSupport({
    hasNotification: "Notification" in window,
    hasSW: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    ios: isIOS({ ua: navigator.userAgent, platform: navigator.platform ?? "", maxTouchPoints: navigator.maxTouchPoints ?? 0 }),
    standalone: isStandalone(),
  })
}

export function permission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
}

/** base64url VAPID public key → applicationServerKey bytes. */
export function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4)
  const s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Should the pre-prompt open by itself? First launch from the Home Screen, not answered, not snoozed. */
export function shouldAutoPrompt(l: PushLocal, opts: { standalone: boolean; permission: string; support: PushSupport; now: number }): boolean {
  return opts.standalone && opts.support === "ready" && opts.permission === "default" && !l.prompted && !l.subscribed && opts.now >= l.snoozedUntil
}

// ---------------------------------------------------------------------------------------------------------
// local state

let local: PushLocal | null = null
let status: PushStatus | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

function loadLocal(): PushLocal {
  if (local) return local
  try {
    const j = JSON.parse(localStorage.getItem(PUSH_KEY) ?? "null") as Partial<PushLocal> | null
    local = { prompted: !!j?.prompted, snoozedUntil: typeof j?.snoozedUntil === "number" ? j.snoozedUntil : 0, subscribed: !!j?.subscribed }
  } catch {
    local = { prompted: false, snoozedUntil: 0, subscribed: false }
  }
  return local
}

function saveLocal(patch: Partial<PushLocal>) {
  local = { ...loadLocal(), ...patch }
  try {
    localStorage.setItem(PUSH_KEY, JSON.stringify(local))
  } catch {}
  emit()
}

function setStatus(s: PushStatus) {
  status = s
  emit()
}

function currentStatus(): PushStatus {
  if (status && status !== "default") return status
  const p = permission()
  if (p === "denied") return "denied"
  if (p === "granted" && loadLocal().subscribed) return "subscribed"
  return "default"
}

let snap: { status: PushStatus; local: PushLocal; support: PushSupport } | null = null
function read() {
  const next = { status: currentStatus(), local: loadLocal(), support: currentSupport() }
  if (!snap || snap.status !== next.status || snap.local !== next.local || snap.support !== next.support) snap = next
  return snap
}
const SERVER = { status: "default" as PushStatus, local: { prompted: false, snoozedUntil: 0, subscribed: false }, support: "unsupported" as PushSupport }

export function usePush(): { status: PushStatus; local: PushLocal; support: PushSupport } {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    read,
    () => SERVER,
  )
}

/** "Not now" on the pre-prompt: ask again in 7 days at most. */
export function snoozePush(now = Date.now()): void {
  saveLocal({ prompted: true, snoozedUntil: now + SNOOZE_MS })
}

async function post(method: "POST" | "DELETE", body: unknown): Promise<boolean> {
  try {
    const res = await fetch("/api/push/subscription", {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

function platformOf(): "ios" | "android" | "desktop" | "other" {
  const ua = navigator.userAgent
  if (isIOS({ ua, platform: navigator.platform ?? "", maxTouchPoints: navigator.maxTouchPoints ?? 0 })) return "ios"
  if (/Android/i.test(ua)) return "android"
  return /Mobi/i.test(ua) ? "other" : "desktop"
}

/**
 * [Turn on notifications]. Must be called synchronously from the click handler: the permission request is
 * the first thing it does, before any await.
 */
export function enablePush(): Promise<PushStatus> {
  if (currentSupport() !== "ready") return Promise.resolve(currentStatus())
  const asked = Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission)
  setStatus("requesting")
  return (async () => {
    const p = await asked
    saveLocal({ prompted: true })
    if (p !== "granted") {
      setStatus(p === "denied" ? "denied" : "default")
      return currentStatus()
    }
    setStatus("subscribing")
    try {
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(VAPID) }))
      const ok = await post("POST", { subscription: sub.toJSON(), standalone: isStandalone(), platform: platformOf() })
      if (!ok) throw new Error("subscription_not_saved")
      saveLocal({ subscribed: true })
      setStatus("subscribed")
      return "subscribed" as const
    } catch {
      setStatus("error")
      return "error" as const
    }
  })()
}

/** You → Notifications off (and on sign-out): unsubscribe here and tell the server. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await post("DELETE", { endpoint: sub.endpoint })
      await sub.unsubscribe().catch(() => false)
    }
  } catch {}
  saveLocal({ subscribed: false })
  setStatus("default")
}
