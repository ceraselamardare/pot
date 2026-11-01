"use client"
// Install context detection (frontend-architecture §5.8; ux-spec §9; F-23). Pure `detectContext(env)` for tests,
// plus browser hooks. Since iOS 26 the OS part of the user agent is frozen at 18_x, so iOS 26 vs 27 comes from
// Safari's `Version/26` / `Version/27` token only.
import { useSyncExternalStore } from "react"

export type InstallContext = "standalone" | "in_app" | "ios27" | "ios26" | "ios_other" | "android_prompt" | "android_menu" | "desktop"

export interface PlatformEnv {
  ua: string
  standalone: boolean
  /** navigator.maxTouchPoints (iPadOS reports MacIntel + touch) */
  maxTouchPoints: number
  platform: string
  /** Chrome's beforeinstallprompt was captured */
  hasPrompt: boolean
  /** Telegram's in-app browser globals (TelegramWebviewProxy / TelegramWebview) */
  telegram: boolean
}

const IN_APP: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/Messenger|MessengerForiOS|Orca-Android/i, "Messenger"],
  [/LinkedInApp/i, "LinkedIn"],
  [/musical_ly|TikTok|BytedanceWebview/i, "TikTok"],
  [/\bLine\//i, "LINE"],
  [/MicroMessenger/i, "WeChat"],
  [/Snapchat/i, "Snapchat"],
  [/Twitter|TwitterAndroid/i, "X"],
  [/Telegram/i, "Telegram"],
]

/** The in-app browser's app name ("Instagram"), or null in a real browser. */
export function inAppName(ua: string, telegram = false): string | null {
  if (telegram) return "Telegram"
  for (const [re, name] of IN_APP) if (re.test(ua)) return name
  return null
}

export const isIOS = (env: Pick<PlatformEnv, "ua" | "platform" | "maxTouchPoints">): boolean =>
  /iPhone|iPad|iPod/.test(env.ua) || (env.platform === "MacIntel" && env.maxTouchPoints > 1)

export const isAndroid = (ua: string): boolean => /Android/i.test(ua)

export function detectContext(env: PlatformEnv): InstallContext {
  if (env.standalone) return "standalone"
  if (inAppName(env.ua, env.telegram)) return "in_app"
  if (isIOS(env)) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(env.ua)) return "ios_other"
    if (/Version\/27/.test(env.ua)) return "ios27"
    return "ios26" // iOS 26 copy + the "Don't see it?" line also covers an unknown version
  }
  if (isAndroid(env.ua)) return env.hasPrompt ? "android_prompt" : "android_menu"
  return "desktop"
}

/** Which browser the in-app escape opens: Safari on iOS, Chrome on Android. */
export function escapeBrowser(env: Pick<PlatformEnv, "ua" | "platform" | "maxTouchPoints">): "safari" | "chrome" | null {
  if (isIOS(env)) return "safari"
  if (isAndroid(env.ua)) return "chrome"
  return null
}

/**
 * The "Open in Safari / Chrome" link for an in-app browser. iOS: `x-safari-https://…`, which keeps the
 * `#fragment` (the invite secret; frontend-architecture §2.5 ⚠️ verify on a device). Android: an intent URL
 * can't carry the page's fragment (its own `#Intent;…` takes that place), so a URL with a fragment gets no
 * Chrome link and the person copies it instead (Copy link keeps the fragment).
 */
export function escapeHref(href: string, browser: "safari" | "chrome"): string | null {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  if (browser === "safari") return `x-safari-${u.protocol.replace(":", "")}://${u.host}${u.pathname}${u.search}${u.hash}`
  if (u.hash) return null
  const fallback = encodeURIComponent(u.href)
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${fallback};end`
}

// ---------------------------------------------------------------------------------------------------------
// browser state: display mode and the captured install prompt

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
let wired = false

/** Capture Chrome's install prompt and `appinstalled` (called once, early, by SwBridge). */
export function wireInstallEvents(): void {
  if (wired || typeof window === "undefined") return
  wired = true
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    installed = true
    deferred = null
    emit()
  })
  try {
    window.matchMedia("(display-mode: standalone)").addEventListener("change", emit)
  } catch {}
}

/** Show Chrome's install dialog (inside the tap). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const d = deferred
  if (!d) return "unavailable"
  deferred = null
  emit()
  await d.prompt()
  const c = await d.userChoice
  if (c.outcome === "accepted") {
    installed = true
    emit()
  }
  return c.outcome
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true
  } catch {}
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function currentEnv(): PlatformEnv {
  const w = window as Window & { TelegramWebviewProxy?: unknown; TelegramWebview?: unknown }
  return {
    ua: navigator.userAgent,
    standalone: isStandalone(),
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    platform: navigator.platform ?? "",
    hasPrompt: deferred !== null,
    telegram: !!(w.TelegramWebviewProxy || w.TelegramWebview),
  }
}

let snapshot: { ctx: InstallContext; installed: boolean; app: string | null } | null = null
function read() {
  const env = currentEnv()
  const next = { ctx: detectContext(env), installed: installed || env.standalone, app: inAppName(env.ua, env.telegram) }
  if (!snapshot || snapshot.ctx !== next.ctx || snapshot.installed !== next.installed || snapshot.app !== next.app) snapshot = next
  return snapshot
}

const SERVER = { ctx: "desktop" as InstallContext, installed: false, app: null }

/** The install context (server / first render: "desktop", so nothing install-related renders before hydration). */
export function useInstallContext(): { ctx: InstallContext; installed: boolean; app: string | null } {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    read,
    () => SERVER,
  )
}
