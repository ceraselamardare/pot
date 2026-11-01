# PWA: manifest, service worker, Web Push (client), install UX
> Owner: web. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

Scope: which PWA approach to use with Next 16.4, client-side Web Push (VAPID subscribe, SW handlers, iOS rules, Declarative Web Push), install UX (Android prompt, iOS coach mark, in-app browsers), mobile viewport/keyboard/safe areas, and the general behaviour of OAuth inside installed iOS web apps.
Not covered here:
- Server-side sending, subscription storage and Telegram → infra ([notifications.md](notifications.md)).
- NEAR Auth specifics → auth ([near-auth.md](near-auth.md)).
- Stack versions → [frontend-stack.md](frontend-stack.md).

## TL;DR
- ✅ **Decision: no Serwist. Use Next built-ins (`app/manifest.ts`) plus a hand-written `public/sw.js` registered at `/sw.js` with scope `/`.**
  - The SW handles `push` and `notificationclick`, and has **no fetch handler and no precache**: money/balances must never come from a stale cache.
  - Verified with `next build`/`next start` and Chrome 155. It covers installability, `beforeinstallprompt` and a full push round trip. ~60 lines, zero dependencies.
- ✅ **Serwist is a poor fit for Next 16.4 defaults.**
  - **`@serwist/next`** injects a webpack config. That makes the default Turbopack `next build` fail unless you pass `--webpack`.
  - **`@serwist/turbopack` 9.5.13** with the scaffold default `cacheComponents: true` turns its `/serwist/[path]` route **dynamic (`ƒ`)**: the destructured `dynamic`/`revalidate` exports are silently ignored. The SW is then compiled with esbuild **at request time**, and the function's file trace contains neither `esbuild` nor `app/sw.ts`, so it very likely 500s on Vercel (⚠️ inferred, not deployed).
  - It prerenders correctly only with `cacheComponents: false`. It also precaches 29 entries / 1.39 MB on install and needs `allowBuilds` for `@swc/core` + `esbuild`.
- ✅ **Alternative B (documented in Next's PWA guide, lastUpdated 2026-07-30): `navigator.serviceWorker.register(new URL("../lib/service-worker.ts", import.meta.url), { scope: "/" })`.**
  - Turbopack 16.4 has a `[service-worker]` transition. It emits `/_next/static/service-worker/sw.js` and adds `Service-Worker-Allowed: /` through routes-manifest. Prod works (incl. push).
  - **But** a SW that uses `import` **breaks under `next dev`** ("ServiceWorker script evaluation failed": the chunks are concatenated as `})()(globalThis["TURBOPACK"]…`).
  - The Vercel header is unverified. Use it only if TypeScript in the SW matters.
- ✅ **Web Push works end to end** on desktop Chrome 155: VAPID `pushManager.subscribe` → `fcm.googleapis.com` endpoint → `web-push@3.6.7 sendNotification` → **201** → notification shown in **0.5–3.5 s**. Same result for flat and **Declarative Web Push** JSON payloads. Headless Chrome cannot subscribe (it hangs), so test push headed or on devices.
- 📄 **iOS Web Push rules.**
  - Only for **Home Screen web apps** (iOS/iPadOS 16.4+).
  - The permission request must be "in response to direct user interaction".
  - Badges (`navigator.setAppBadge`) show only after notification permission.
  - **Declarative Web Push** (iOS/iPadOS 18.4+, macOS 15.5+) renders `{ "web_push": 8030, "notification": {…} }` without running SW code. Send that format to every browser and parse it in the SW for Chrome/Firefox, which have not shipped declarative push (✅ per infra's [notifications.md](notifications.md); same in aimtell's Apr 2026 survey).
- 📄 **iOS 26 changes.**
  - "By default, every website added to the Home Screen opens as a web app."
  - There are "now zero requirements for 'installability' in Safari".
  - There is still **no install prompt API** on iOS, so show a coach mark: Safari ••• → Share → Add to Home Screen → keep "Open as Web App" on → Add (⚠️ path per MacRumors; verify on device).
- ✅ **Android/desktop Chrome installability.**
  - Manifest with name, icons 192+512, `start_url`, `display: standalone`, `id`, plus HTTPS. **No SW fetch handler is required.** CDP `Page.getInstallabilityErrors` returned `[]`, and `beforeinstallprompt` fired (Chrome 155).
  - Lighthouse 12+ has no PWA category; use DevTools › Application › Manifest or CDP.
- 📄/⚠️ **Storage is NOT shared between Safari and the installed iOS app.** Only login *cookies* are copied at install (iOS 17.2+), so a localStorage/IndexedDB session is lost on install. Out-of-scope navigations (OAuth providers) open an in-app browser whose storage isn't the app's. Keep the Pot session in a first-party cookie and run OAuth via a gesture-opened `window.open` popup or a same-origin flow (→ auth).
- 📄 **Keyboard.**
  - iOS Safari only resizes the *visual* viewport: `interactive-widget` is not shipped in Safari 26.x. It landed in WebKit in Aug 2026 and may arrive in Safari 27.1.
  - Chrome Android 108+ honours `interactive-widget=resizes-content`.
  - For bottom sheets with inputs, use Base UI `Drawer.VirtualKeyboardProvider` (`visualViewport`-based, `--drawer-keyboard-inset`).
- ⚠️ **In-app browsers (Telegram, Instagram, …) cannot install or receive push.**
  - Detect them with `inapp-spy` 5.0.10. Telegram is detectable only client-side, via `window.TelegramWebviewProxy` (iOS) or `window.TelegramWebview` (Android).
  - Escape to Safari with `x-safari-https://…`: works in Telegram/TikTok/X, unreliable in Instagram since mid-2025.
  - Escape to Chrome on Android with `intent://…#Intent;scheme=https;package=com.android.chrome;end`.

## Plan check
| Plan claim (the original plan) | Status | Note |
|---|---|---|
| C6: "[PWA: Next.js + serwist service worker]" | ❌ corrected | Use `app/manifest.ts` + `public/sw.js` (no Serwist). Reasons in TL;DR. |
| Key Findings: "Web Push only for Home Screen web apps (since 16.4)" | ✅ 📄 | WebKit blog 13878; firt.dev: "16.4 only for installed PWAs; not available in Safari or other browsers". |
| Key Findings: "Declarative Web Push in 18.4" | ✅ 📄 | iOS/iPadOS 18.4; also macOS 15.5. JSON format in Reference. |
| Key Findings: "since iOS 26 every website your users add to the Home Screen opens as a web app by default" | ✅ 📄 | WebKit "Features in Safari 26.0", plus "zero requirements for installability". |
| Key Findings / C2: "no install prompt" (iOS) | ✅ 📄 | No `beforeinstallprompt` in Safari; use a coach mark. |
| Key Findings: "in-app browsers cannot Add to Home Screen" | ✅/⚠️ | True for WKWebView in-app browsers (Telegram, Instagram). Since iOS 17, installing from an SFSafariViewController *is* possible (firt.dev). |
| C2: "Android Chrome has `beforeinstallprompt`" | ✅ | Fired in Chrome 155 against the smoke app. web.dev criteria: ≥1 click/tap + 30 s engagement (2024-09-19) ⚠️; headless fired after 1 click + 3 s. |
| C2: "ask for permission after install with a reason (…approval); fall back to email and the bot" | ✅ 📄 | Must be inside a click handler on iOS. web.dev: allow rate ~12% without interaction vs ~30% after it. |
| C2: links say "Open in Safari to install" (Telegram) | ✅/⚠️ | Add an `x-safari-https://` button plus copy-link fallback. |
| C9: "iOS install friction → full function in a Safari tab; install only adds push" | ✅/⚠️ | True functionally, but **storage split** means a re-login after install unless the session is a cookie (iOS 17.2+ copies login cookies). |
| C7 day 11: "Push on installed iPhone PWA" | ⚠️ | Needs an HTTPS deploy (Vercel preview) and a physical iPhone. Not testable in this research run. |
| C4 P-10: push for "needs your approval" / "money arrived" | ✅ client side | Payload contract below. Sending → infra. |

## Reference

### PWA approach comparison (Next 16.4.2, Turbopack, `cacheComponents: true`)
| Option | Prod build/serve | `next dev` | Notes | Verdict |
|---|---|---|---|---|
| **A. `public/sw.js` + `register("/sw.js",{scope:"/"})`** | ✅ registers, controls after reload, push OK | ✅ | Plain JS (`// @ts-check` + JSDoc). Headers via `next.config.ts` `headers()` (verified). 1.4–2 KB. | **Use** |
| B. `register(new URL("../lib/service-worker.ts", import.meta.url), {scope:"/"})` | ✅ emitted to `/_next/static/service-worker/sw.js` (9.6–9.9 KB incl. Turbopack runtime); `Service-Worker-Allowed: /`; push OK | ⚠️ works only if the SW has **no `import`/`export`**; with imports, "script evaluation failed" | TS SW must be script-style (`const sw = self as unknown as ServiceWorkerGlobalScope`; redeclaring `self` → TS2451). Lightly documented. Vercel header ⚠️ | Fallback |
| C. `@serwist/turbopack` 9.5.13 (`app/serwist/[path]/route.ts` + `SerwistProvider`) | ⚠️ route becomes `ƒ` dynamic; esbuild runs per cold start; nft trace lacks esbuild + `app/sw.ts` | n/a | Static (`● /serwist/sw.js`) only with `cacheComponents:false`. Precache 29 entries / 1.39 MB. `SerwistProvider` defaults: `reloadOnOnline: true`, `cacheOnNavigation: true` (monkey-patches `history.pushState`), `type: "module"` | No |
| D. `@serwist/next` (webpack plugin) | ❌ default `next build` fails when a webpack config is present (📄 Next 16 upgrade guide) | Turbopack dev ignores it | Requires `next build --webpack` | No |
| E. `@serwist/next/config` + `@serwist/cli` (`next build && serwist build`) | ⚠️ untested | `serwist build --watch` | Writes `public/sw.js` *after* `next build`. Whether Vercel serves late-written `public/` files is unknown | No |
| F. `next-pwa` 5.6.0 / `@ducanh2912/next-pwa` 10.2.9 | n/a | n/a | Last published 2022-08-23 / 2024-09-18. Webpack-based | No |

✅ Primary source for option B: next@16.4.2 `dist/build/index.js` ~L1690-1705 says "Service workers are compiled into `distDir/static/service-worker/` and register at a broader scope than their own directory (e.g. `/`), so their script response needs a `Service-Worker-Allowed` header". It adds a `routesManifest.headers` rule `source: "/_next/static/service-worker/:path*"` → `Service-Worker-Allowed: basePath || "/"`.

### Manifest (✅ served at `/manifest.webmanifest`, `application/manifest+json`, 0 manifest errors in Chrome)
- Fields: `id`, `name`, `short_name`, `description`, `start_url`, `scope`, `display: "standalone"`, `background_color`, `theme_color`, icons 192/512 PNG + a 512 `purpose: "maskable"`.
- Next adds `<link rel="manifest" href="/manifest.webmanifest">`.
- `app/apple-icon.png` → `<link rel="apple-touch-icon" href="/apple-icon.png?…" sizes="180x180">`.
- `appleWebApp` metadata → `<meta name="mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style`.
- 📄 **Chrome `beforeinstallprompt` criteria:**
  - not already installed;
  - ≥1 click/tap and ≥30 s on the page;
  - HTTPS;
  - manifest with `short_name` or `name`, icons 192 + 512, `start_url`, `display` ∈ {fullscreen, standalone, minimal-ui, window-controls-overlay};
  - `prefer_related_applications` absent or false.
  
  No service worker is required.
- 📄 **Richer install UI** (Android bottom sheet with screenshots):
  - `description` (≈324 chars max) plus ≥1 screenshot with `form_factor: "narrow"`.
  - PNG/JPEG, 320–3840 px, longest side ≤ 2.3× shortest; same aspect ratio per form factor; max 8.
  - A 1170×2532 PNG (390×844 @3x, ratio 2.16) fits.
- 📄 **iOS 26.** Manifest icons are used if present. SVG manifest icons are supported since iOS 26 (firt.dev). Users can add any site and it opens as a web app unless they switch "Open as Web App" off.

### Platform capability matrix (📄 unless noted)
| Context | Install path | Web Push | Badge | Notes |
|---|---|---|---|---|
| iOS 26 Safari tab | ••• → Share → Add to Home Screen ("Open as Web App" on by default) ⚠️ | ❌ | ❌ | Full app works in the tab (C9) |
| iOS Home Screen web app (16.4+) | — | ✅ after a gesture-triggered permission | ✅ with notification permission | Storage separate from Safari; login cookies copied at install since 17.2 |
| iOS Chrome/Edge/Firefox | Add to Home Screen if the browser opted in (16.4+) | ❌ in tab | ❌ | |
| iOS SFSafariViewController | Installable since iOS 17.0 | ❌ | ❌ | |
| iOS in-app WKWebView (Telegram, Instagram, FB) | ❌ | ❌ | ❌ | Offer "Open in Safari" |
| Android Chrome tab | `beforeinstallprompt` or ⋮ → Install app | ✅ (no install needed) | ❌ (`setAppBadge` not exposed; launcher dot from notifications) | `interactive-widget` honoured (Chrome 108+) |
| Desktop Chrome 155 | ✅ (verified installable) | ✅ (verified e2e) | ✅ installed apps on Windows/macOS | |

### Push subscription and payload
- ✅ `PushSubscription.toJSON()` shape (Chrome 155): `{ endpoint: "https://fcm.googleapis.com/…", expirationTime: null, keys: { p256dh, auth } }`. Store this in `user.push_sub` (C6 data model) → infra.
- ⚠️ Other endpoint hosts (general knowledge, not fetched): Apple `web.push.apple.com`, Mozilla `updates.push.services.mozilla.com`. The server should accept any HTTPS endpoint the browser returns → infra.
- ✅ **Payload contract (server → SW): always send Declarative Web Push JSON.** This matches infra's [notifications.md](notifications.md), which owns sending.
  ```json
  {"web_push": 8030,
   "notification": {"title": "Leo needs your approval", "body": "$400 · Boat rental",
     "navigate": "https://pot-<team>.vercel.app/p/lisbon?request=7", "lang": "en-US", "dir": "ltr",
     "tag": "req-7", "silent": false, "app_badge": "2",
     "data": {"type": "approval_needed", "potId": "lisbon", "requestId": 7}},
   "app_badge": 2, "mutable": false}
  ```
  - ✅ Chrome's SW (Snippet 2) parses the declarative shape into title/body/tag/`data.url` (tested with `app_badge` inside `notification`; the SW also reads the top-level one).
  - 📄/✅ (infra read WebKit's `NotificationJSONParser.cpp`):
    - `title` must be non-empty.
    - `navigate` is required and **must be an absolute https URL**.
    - WebKit reads only `title, navigate, dir, lang, body, tag, icon, silent, data`.
    - `app_badge` moved to the top level in May 2025, so send it in both places.
- **SW interaction.**
  - Per the W3C Push API ED and WebKit source (via infra), the SW `push` event fires only when top-level `"mutable": true`. If the SW then fails to show a replacement, Safari shows the declarative fallback.
  - ⚠️ WebKit's 2025 blog says "a push event is dispatched to it like before"; treat the blog as superseded.
  - With `mutable: false`, iOS shows the notification without running Pot's SW, so the badge must come from `app_badge` (the SW `setAppBadge` path runs only on Chromium).
- 📄 **iOS requirements:**
  - added to Home Screen;
  - manifest `display` standalone/fullscreen (WebKit 2023; on iOS 26 any added site runs as a web app);
  - `Notification.requestPermission()` / `pushManager.subscribe()` from a user gesture.
  
  Notifications behave like native ones (Lock Screen, Notification Center, Watch, Focus).
- 📄 **Permission UX (web.dev):** never prompt on load; use an in-app pre-prompt with the value ("Get told when friends need your approval"); only call the browser prompt after an affirmative tap; on `denied`, show recovery steps and fall back to email/bot.

### Install UX state machine (client)
`inApp` → show "Open in Safari / Chrome" (no install, no push) · `standalone` → hide install UI, offer push pre-prompt · `ios && !standalone` → coach mark after first contribution (C2) · `canPrompt` (Chromium fired `beforeinstallprompt`) → custom "Install Pot" button calling `prompt()` · else → nothing. Listen for `appinstalled` to clear state. Detect standalone with `matchMedia("(display-mode: standalone)")` (+ legacy `navigator.standalone` on iOS).

### Viewport, safe areas, keyboard
- ✅ **Viewport meta from the `viewport` export:** `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`.
- 📄 With `viewport-fit=cover`, pad with `env(safe-area-inset-top|bottom|left|right)` (e.g. `pt-[max(env(safe-area-inset-top),1rem)]`, used in the smoke app). Use `min-h-dvh`/`h-dvh` instead of `100vh`.
- 📄 **iOS keyboard.**
  - Only the *visual* viewport shrinks, so `dvh` and fixed bottom bars don't move. Use `window.visualViewport` (`resize`/`scroll`) or Base UI `Drawer.VirtualKeyboardProvider` for sheets with inputs.
  - Use 16 px input font to avoid focus zoom.
  - `interactive-widget`: Chrome Android 108+, Firefox Android 133+. Safari: landed in WebKit ~Aug 2026, behind a flag in STP 252, not in Safari 26.x.
  - The VirtualKeyboard API (`navigator.virtualKeyboard.overlaysContent`) is Chromium-only.
- ⚠️ **Safari 26 toolbar tinting** (tab mode, reverse-engineered, no Apple docs): Safari 26 "no longer reads theme-color" and samples `position: fixed/sticky` elements' `background-color`/`backdrop-filter` near the edges, or the body background.
  - Set explicit `html, body { background: … }`.
  - Put a fixed header's background on an absolutely positioned child.
  - Hide overlays with `display: none` (`opacity: 0` still tints).
  - Keep `themeColor` for Android.

### OAuth / redirects inside an installed iOS web app (general, ⚠️ secondary + 📄 firt.dev)
- Out-of-scope navigations open in an **in-app browser** (since iOS 12) whose cookie/storage jar is not the PWA's. A top-level redirect to Google/Auth0 completes there, and the PWA never sees the session.
- A tested community fix (GitHub PR, Supabase + Google):
  1. Synchronously `window.open("about:blank", "_blank")` inside the button's click handler. This stays inside the Home Screen app context, per "Apple's WWDC23 guidance that `window.open` links stay within the Home Screen web app".
  2. Navigate that window to the provider URL.
  3. The provider redirects to the same-origin `/auth/callback`, which exchanges the code in app storage.
  4. Notify the opener via `BroadcastChannel`/`postMessage`.
- Passkeys/WebAuthn inside standalone apps: not tested here.
- → **auth:** confirm how NEAR Auth/Auth0 (`loginWithPopup` vs `loginWithRedirect`) behaves in an installed iOS 26 app, and where the session lives (cookie vs localStorage).

## Snippets
**1. `app/manifest.ts`** (✅ served, installable in Chrome 155; `screenshots` are 📄, untested)
```ts
import type { MetadataRoute } from "next"
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "Pot", short_name: "Pot",
    description: "Group money that follows its own rules",
    start_url: "/?source=pwa", scope: "/", display: "standalone",
    background_color: "#ffffff", theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [ // richer Android install sheet (📄)
      { src: "/screens/pot-1170x2532.png", sizes: "1170x2532", type: "image/png", form_factor: "narrow", label: "Your Pot" },
    ],
  }
}
```

**2. `public/sw.js`** (✅ registered at scope `/`; Chrome e2e push with declarative JSON → notification `{title, body, tag, data.url}`; `setAppBadge` path not exercised)
```js
// @ts-check
/// <reference lib="webworker" />
// Pot service worker: push + notificationclick only. No fetch handler, no precache (money data must be live).
// Accepts Declarative Web Push JSON ({ web_push: 8030, notification: {...} }) and a flat {title, body, url} fallback.
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self))

sw.addEventListener("install", () => { void sw.skipWaiting() })
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()))

/** @param {PushEvent} event */
function parsePush(event) {
  /** @type {any} */ let msg = {}
  try { msg = event.data ? event.data.json() : {} } catch { msg = { title: "Pot", body: event.data?.text() } }
  const n = msg.web_push === 8030 && msg.notification ? msg.notification : msg
  return {
    title: n.title || "Pot",
    badge: n.app_badge ?? msg.app_badge,
    options: {
      body: n.body, tag: n.tag, lang: n.lang, dir: n.dir, silent: n.silent,
      icon: n.icon || "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { ...(n.data || {}), url: n.navigate || n.url || "/" },
    },
  }
}

sw.addEventListener("push", (event) => {
  const { title, options, badge } = parsePush(event)
  event.waitUntil((async () => {
    await sw.registration.showNotification(title, options)
    if (badge != null && "setAppBadge" in sw.navigator) await sw.navigator.setAppBadge(Number(badge)).catch(() => {})
  })())
})

sw.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? "/", sw.location.origin).href
  event.waitUntil((async () => {
    const wins = await sw.clients.matchAll({ type: "window", includeUncontrolled: true })
    const win = wins.find((w) => new URL(w.url).origin === sw.location.origin)
    if (win) { await win.focus(); await win.navigate(url).catch(() => {}); return }
    await sw.clients.openWindow(url)
  })())
})
```
Pair it with the `/sw.js` `headers()` block in frontend-stack.md Snippet 2 (verified to serve `Cache-Control: no-cache, no-store, must-revalidate`). Optional (untested): `pushsubscriptionchange` → re-subscribe with `event.oldSubscription?.options.applicationServerKey` and POST to the server. Optional offline: a navigation-only fetch handler with a cached `/offline` page; or just `experimental.useOffline` + `useOffline()` for an "You're offline" banner (📄 Next 16.3).

**3. Registration** (✅; mount once in the root layout)
```tsx
"use client"
import { useEffect } from "react"
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
  }, [])
  return null
}
```

**4. `usePushSubscription`** (✅ builds, typechecks, passes eslint-config-next incl. `react-hooks/set-state-in-effect`; the subscribe flow is identical to the code verified headed in `e2e/push-public.mjs`)
```ts
"use client"
import { useCallback, useState, useSyncExternalStore } from "react"

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
export type PushState = "unsupported" | "needs-install" | "default" | "granted" | "denied"
const getPushState = (): PushState => {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  if (!supported) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    return ios && !window.matchMedia("(display-mode: standalone)").matches ? "needs-install" : "unsupported"
  }
  return Notification.permission
}
const noop = () => () => {}

/** Call `subscribe()` ONLY from a click handler (iOS requires a user gesture). */
export function usePushSubscription(vapidPublicKey: string, saveUrl = "/api/push/subscribe") {
  const initial = useSyncExternalStore(noop, getPushState, () => "default" as PushState)
  const [override, setOverride] = useState<PushState | null>(null)
  const subscribe = useCallback(async () => {
    const perm = await Notification.requestPermission() // must run inside the user gesture
    setOverride(perm)
    if (perm !== "granted") return null
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(vapidPublicKey) }))
    await fetch(saveUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) })
    return sub
  }, [vapidPublicKey, saveUrl])
  return { state: override ?? initial, subscribe }
}
// usage: const push = usePushSubscription(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)
// state "needs-install" (iOS Safari tab) → show the coach mark instead of a push button.
```
Unsubscribe on logout (asked by infra; ⚠️ untested, standard API):
```ts
export async function unsubscribePush(deleteUrl = "/api/push/subscribe") {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) return
  await fetch(deleteUrl, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) })
  await sub.unsubscribe()
}
```

**5. `useInstallPrompt`** (✅ builds and lints; `beforeinstallprompt` capture verified in Chrome 155; `prompt()` not invoked in automation)
```ts
"use client"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }> }
const STANDALONE = "(display-mode: standalone)"
const subscribeStandalone = (cb: () => void) => {
  const mq = window.matchMedia(STANDALONE); mq.addEventListener("change", cb); window.addEventListener("appinstalled", cb)
  return () => { mq.removeEventListener("change", cb); window.removeEventListener("appinstalled", cb) }
}
const getStandalone = () => window.matchMedia(STANDALONE).matches || (navigator as { standalone?: boolean }).standalone === true
const noop = () => () => {}
const getIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
const getInApp = () => {
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.TelegramWebviewProxy || w.TelegramWebview) || /Instagram|FBAN|FBAV|Line\/|TikTok|musical_ly/i.test(navigator.userAgent)
}
export function useInstallPrompt() {
  const standalone = useSyncExternalStore(subscribeStandalone, getStandalone, () => false)
  const ios = useSyncExternalStore(noop, getIos, () => false)
  const inApp = useSyncExternalStore(noop, getInApp, () => false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent) }
    const onInstalled = () => setDeferred(null)
    window.addEventListener("beforeinstallprompt", onBip); window.addEventListener("appinstalled", onInstalled)
    return () => { window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled) }
  }, [])
  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const
    await deferred.prompt(); const { outcome } = await deferred.userChoice; setDeferred(null); return outcome
  }, [deferred])
  return { standalone, ios, inApp, canPrompt: deferred !== null, promptInstall }
}
```
For broader in-app coverage, `inapp-spy` 5.0.10: `const { isInApp, appKey } = InAppSpy()` (Telegram is client-side only).

**6. "Open in Safari / Chrome" escape links** (📄/⚠️ untested here; must be user-tapped)
```ts
export function escapeUrl(url: string, platform: "ios" | "android") {
  const u = new URL(url)
  return platform === "ios"
    ? `x-safari-https://${u.host}${u.pathname}${u.search}`            // works in Telegram/TikTok/X; flaky in Instagram since mid-2025
    : `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`
}
// Always also show "Copy link" + "Open the menu (•••) → Open in Safari" text as fallback.
```

**7. Installability check in CI (replaces Lighthouse PWA)** (✅ returned `[]` in a persistent context; a default Playwright context returns `[{ errorId: "in-incognito" }]`)
```ts
const ctx = await chromium.launchPersistentContext(tmpDir, { channel: "chrome", headless: true })
const page = await ctx.newPage(); await page.goto(BASE + "/", { waitUntil: "networkidle" })
const cdp = await ctx.newCDPSession(page)
const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors") // expect []
const { errors } = await cdp.send("Page.getAppManifest")                        // expect []
```

**8. Push e2e smoke (headed only)** (✅ FCM 201, notification visible in ~0.5–3.5 s)
```ts
const ctx = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: false })
await ctx.grantPermissions(["notifications"], { origin: BASE })
const page = await ctx.newPage(); await page.goto(BASE)
const sub = await page.evaluate(async (key) => {
  const reg = await navigator.serviceWorker.ready
  const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key /* bytes */ })
  return s.toJSON()
}, vapidPublicKeyBytes)
webpush.setVapidDetails("mailto:dev@example.com", VAPID_PUBLIC, VAPID_PRIVATE)
await webpush.sendNotification(sub, JSON.stringify({ web_push: 8030, notification: { title: "t", navigate: BASE + "/" } }), { TTL: 60, urgency: "high" })
// poll: (await navigator.serviceWorker.ready).getNotifications()
```

**9. Option B (bundled SW)**: only if you need TypeScript in the SW (✅ prod; ⚠️ dev breaks if the file has `import`/`export`)
```tsx
navigator.serviceWorker.register(new URL("../lib/service-worker.ts", import.meta.url), { scope: "/", updateViaCache: "none" })
// lib/service-worker.ts must be script-style:
//   /// <reference lib="webworker" />
//   const sw = self as unknown as ServiceWorkerGlobalScope   // `declare const self: …` → TS2451 in a script file
// Day-1 check on Vercel: curl -I https://<preview>/_next/static/service-worker/sw.js | grep -i service-worker-allowed
```

## Gotchas & failure modes
- **Serwist + Cache Components fails silently.** `createSerwistRoute` exports `dynamic`, `dynamicParams` and `revalidate` via destructuring. Next's Cache Components validation doesn't flag them and doesn't honour them, so the SW route is dynamic. Locally it "works" (esbuild + sources on disk); on Vercel it would likely 500.
- **`SerwistProvider` defaults** (if anyone adds Serwist later): `reloadOnOnline: true` reloads the page when connectivity returns, which can lose a half-typed amount. `cacheOnNavigation` monkey-patches `history.pushState`/`replaceState`.
- **Turbopack dev + bundled ESM SW.** `}))()(globalThis["TURBOPACK"]…` makes the IIFE result get called ("Uncaught TypeError: (intermediate value)(intermediate value)(...) is not a function", sw.js:72). Script-style SWs are fine. Production is unaffected.
- **Headless Chrome can't subscribe to push.** `pushManager.subscribe` never resolves (15 s timeout). CI push tests need headed Chrome (xvfb on Linux) or must mock at the SW level.
- **Push permission UX.** iOS ignores `requestPermission()` outside a gesture (📄 WebKit). ⚠️ Chrome may show its quieter permission UI for sites with low acceptance (not re-verified). Never prompt on load.
- **Storage split on iOS install.** A user who signed in in Safari arrives logged out in the Home Screen app unless the session is a cookie (copied at install since 17.2). IndexedDB/localStorage (e.g. NEAR Connect's `hot-connector` IndexedDB, key material) does **not** carry over.
- **Out-of-scope links in standalone** open an in-app browser sheet. Keep NEAR explorer/Trezu links as explicit "opens in browser" actions. In-scope navigations stay in the app (`scope: "/"`).
- **`navigator.setAppBadge`** silently does nothing on iOS without notification permission and is absent on Android Chrome. Feature-detect.
- **`theme-color`** no longer tints Safari 26 toolbars (⚠️). Don't rely on it for brand colour in iOS tabs.
- **Fixed bottom CTA + iOS keyboard.** The bar stays behind the keyboard (layout viewport unchanged). Use the drawer keyboard provider or `visualViewport` offsets; `interactive-widget` only helps Android.
- **Installability in automation.** The default Playwright context is incognito-like and Chrome reports `in-incognito`. Use `launchPersistentContext`.
- **Lighthouse** no longer audits PWA or installability (v12+). Don't put "Lighthouse PWA passes" in acceptance criteria.

## Costs, limits, latencies
| Item | Value | Source |
|---|---|---|
| Push latency, desktop Chrome → FCM → SW notification | 0.5 s, 0.5 s, 3.5 s (3 runs) | ✅ measured, `web-push` 3.6.7 `sendNotification` → 201 |
| SW size | `public/sw.js` 1.4–2 KB; Turbopack-bundled (option B) 9.6–9.9 KB; Serwist 49.8 KB + **1.39 MB precache (29 entries)** | ✅ |
| `beforeinstallprompt` timing | fired after 1 click + ~3 s (headless Chrome 155) vs documented ≥30 s engagement | ✅ / 📄 ⚠️ |
| Richer install UI | ≤ 8 screenshots, 320–3840 px, ratio ≤ 2.3, description ≈ 324 chars | 📄 web.dev 2026-10-08 |
| Notification permission allow rates | ~12% without prior interaction vs ~30% after interaction | 📄 web.dev 2024-06-17 |
| Push payload size | ~4 KB per message (Web Push encryption, typical push services) | ⚠️ general knowledge; infra to confirm per service |

## Open questions / needs a human
- **Day 1 on a Vercel preview (human or infra):**
  - `curl -I https://<preview>/sw.js` → `cache-control: no-cache…`, 200;
  - `curl -I …/manifest.webmanifest` → `application/manifest+json`;
  - if option B is ever used, check `service-worker-allowed: /` on `/_next/static/service-worker/sw.js`.
- **Real devices (day 11 at the latest; better day 3):**
  1. iPhone on iOS 26: Add to Home Screen, then push permission from a button, then a Declarative push arrives with app closed, badge count shows, tap opens `navigate` URL.
  2. Android Chrome: install sheet (with screenshots), push in tab and installed.
  3. Telegram and Instagram in-app on iOS + Android: detection plus escape links.
- → **infra:**
  - Send Declarative JSON (above) with `TTL` and `urgency: "high"` for approvals.
  - VAPID `subject` must be `mailto:` or `https:`.
  - Delete subscriptions on 404/410.
  - Store `toJSON()` as is.
  - Confirm per-service payload limits (Apple, FCM, Mozilla).
- → **auth:**
  - OAuth/passkey behaviour inside an installed iOS 26 web app.
  - Session storage (cookie vs localStorage), given the Safari↔app storage split.
  - Whether NEAR Auth uses popup or redirect.
  - Sign-in inside Telegram's in-app browser (also asked by infra in notifications.md): if it fails, the invite landing must push "Open in Safari" before the login buttons.
- → **product-ux:**
  - Coach-mark copy and visuals for iOS 26 (••• → Share → Add to Home Screen → Open as Web App → Add), shown after the first contribution.
  - Push pre-prompt copy.
  - "Open in Safari" screen for in-app browsers.
  - Avoid fixed coloured headers that fight Safari 26 tinting.
- Human decision: is an offline fallback page wanted at all? Recommendation: no (a banner via `useOffline` at most).

## Sources
- https://nextjs.org/docs/app/guides/progressive-web-apps : official guide (lastUpdated 2026-07-30); `app/manifest.ts`, `register(new URL(...))`, web-push server actions, `/sw.js` headers, Serwist as optional offline : 2026-10-21
- next@16.4.2 `dist/build/index.js` ~L1690-1705 (local read) : `static/service-worker/` output + `Service-Worker-Allowed` header rule : 2026-10-21
- next@16.4.2 bundled docs `01-app/02-guides/offline-support.md` : `experimental.useOffline` / `useOffline()`; full offline needs a SW : 2026-10-21
- next@16.4.2 bundled docs `01-app/02-guides/upgrading/version-16.md` L130-148 : `next build` fails with a webpack config under Turbopack : 2026-10-21
- https://serwist.pages.dev/docs/next/getting-started : `@serwist/next` guide "meant for webpack" : 2026-10-21
- https://github.com/serwist/serwist/tree/main/examples/next-turbo-basic and …/next-basic-cli : `createSerwistRoute`, `SerwistProvider`, `serwist build` CLI flow : 2026-10-21
- `@serwist/turbopack@9.5.13` `dist/index.mjs`, `dist/index.react.mjs` (npm pack, local read) : force-static exports, esbuild at request, `Service-Worker-Allowed: /`, provider defaults : 2026-10-21
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ : iOS 16.4 Home Screen push, gesture requirement, Badging : 2026-10-21
- https://webkit.org/blog/16535/meet-declarative-web-push/ : Declarative Web Push JSON, `window.pushManager`, iOS 18.4 / macOS 15.5, SW interaction : 2026-10-21
- https://w3c.github.io/push-api/ : declarative push message members, `mutable` semantics, `Window.pushManager` : 2026-10-21
- https://aimtell.com/blog/state-of-declarative-web-push-2026 : support status Apr 2026 (Safari only) ⚠️ secondary : 2026-10-21
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ : Home Screen sites open as web apps by default; zero installability requirements : 2026-10-21
- https://firt.dev/notes/pwa-ios/ : storage not shared; login cookies copied 17.2; out-of-scope links; installs from other browsers 16.4 / SFSafariViewController 17.0; SVG icons iOS 26 : 2026-10-21
- https://webkit.org/blog/14112/badging-for-home-screen-web-apps/ and https://developer.chrome.com/docs/capabilities/web-apis/badging-api : badging support/permission ties : 2026-10-21
- https://web.dev/articles/install-criteria : Chrome install criteria (updated 2024-09-19) : 2026-10-21
- https://web.dev/articles/web-apps/richer-install-ui : description + screenshots rules (updated 2026-10-08) : 2026-10-21
- https://github.com/GoogleChrome/lighthouse/releases/tag/v12.0.0 : PWA category removed : 2026-10-21
- https://web.dev/articles/permissions-best-practices : prompt timing, pre-prompts, allow rates (2024-06-17) : 2026-10-21
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport : `interactive-widget`, `viewport-fit` semantics : 2026-10-21
- https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/ : WebKit implementation, Chrome 108 / Firefox 133 support, Safari status : 2026-10-21
- https://base-ui.com/react/components/drawer : `Drawer.VirtualKeyboardProvider`, `--drawer-keyboard-inset` : 2026-10-21
- https://1ar.io/updates/safari-26-liquid-glass-web/ : Safari 26 tinting behaviour, theme-color ignored ⚠️ secondary : 2026-10-21
- https://github.com/warren-wyn-dev/wynteam/pull/663 : OAuth in installed iPhone PWA, `window.open` fix ⚠️ secondary : 2026-10-21
- https://plugwith.me/blog/what-escapes-instagram-in-app-browser-in-2026/ : `x-safari-https://` reliability per app ⚠️ secondary : 2026-10-21
- https://github.com/shalanah/inapp-spy (README) and https://github.com/shalanah/inapp-spy/issues/30 : in-app detection incl. Telegram globals : 2026-10-21
- https://developer.chrome.com/docs/android/intents : `intent://` syntax, fallback URL, gesture requirement : 2026-10-21
- https://www.macrumors.com/how-to/save-safari-bookmark-web-app-iphone-home-screen/ : iOS 26 Add to Home Screen path ⚠️ secondary : 2026-10-21
- npm registry (`npm view`) : `@serwist/*` 9.5.13 (2026-10-04), `next-pwa` 5.6.0 (2022-08-23), `@ducanh2912/next-pwa` 10.2.9 (2024-09-18), `web-push` 3.6.7, `inapp-spy` 5.0.10 : 2026-10-21
- Local tests (`scratchpad/web/e2e/{smoke,install,push,push-public,swurl,swdev-err}.mjs`, Chrome 155.0.8059.85, Next 16.4.2) : every ✅ above : 2026-10-21
