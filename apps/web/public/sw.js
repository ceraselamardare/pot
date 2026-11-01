// Pot service worker (F-23; frontend-architecture §8.2; D-42). It does two jobs only: show a push, and open the
// right screen when one is tapped. No fetch handler, no precache, no importScripts: money data is always live.
// Payload: Declarative Web Push JSON (api-spec §6.2) {web_push: 8030, notification: {title, body, navigate, tag,
// data, app_badge}, app_badge} or a flat {title, body, url}. iOS 18.4+ shows declarative pushes without running
// this file (mutable: false), so the badge also rides in `app_badge`.
// Deep links: an approval push names its proposal (`data.proposalId`); its `navigate` (/p/<slug>?r=<pid>) is
// rewritten to ?pid=<pid>, which the Pot screen resolves to the spend request, the close or the rules change.
// Bump SW_VERSION by hand when this file changes.
const SW_VERSION = "2026-10-22.1"

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

/** Parse either payload shape into {title, body, url, tag, badge, data}; null when unusable. */
function parsePush(json) {
  if (!json || typeof json !== "object") return null
  const n = json.notification && typeof json.notification === "object" ? json.notification : json
  const title = typeof n.title === "string" ? n.title.trim() : ""
  if (!title) return null
  const data = n.data && typeof n.data === "object" ? n.data : {}
  const url = typeof n.navigate === "string" ? n.navigate : typeof data.url === "string" ? data.url : typeof n.url === "string" ? n.url : "/pots"
  const badge = typeof json.app_badge === "number" ? json.app_badge : typeof n.app_badge === "number" ? n.app_badge : null
  return {
    title,
    body: typeof n.body === "string" ? n.body : "",
    url,
    tag: typeof n.tag === "string" ? n.tag : undefined,
    badge,
    data,
  }
}

/**
 * The in-app URL to open: same origin only (anything else falls back to /pots), and an approval's ?r=<proposal>
 * becomes ?pid=<proposal> so the app can tell a proposal id from a request id.
 */
function targetUrl(raw, data, origin) {
  let u
  try {
    u = new URL(raw, origin)
  } catch {
    return new URL("/pots", origin).href
  }
  if (u.origin !== origin) return new URL("/pots", origin).href
  const pid = data && (typeof data.proposalId === "number" || typeof data.proposalId === "string") ? String(data.proposalId) : null
  if (pid && /^\d+$/.test(pid) && u.searchParams.get("r") === pid) {
    u.searchParams.delete("r")
    u.searchParams.set("pid", pid)
  }
  return u.href
}

self.addEventListener("push", (event) => {
  let json = null
  try {
    json = event.data ? event.data.json() : null
  } catch {
    json = event.data ? { title: "Pot", body: event.data.text() } : null
  }
  const p = parsePush(json)
  if (!p) return
  const url = targetUrl(p.url, p.data, self.location.origin)
  const tasks = [
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      icon: "/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "en-US",
      dir: "ltr",
      data: { url, type: p.data.type || null, v: SW_VERSION },
    }),
  ]
  if (p.badge !== null && self.navigator && "setAppBadge" in self.navigator) {
    tasks.push(p.badge > 0 ? self.navigator.setAppBadge(p.badge).catch(() => {}) : self.navigator.clearAppBadge().catch(() => {}))
  }
  event.waitUntil(Promise.all(tasks))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const url = targetUrl(typeof data.url === "string" ? data.url : "/pots", null, self.location.origin)
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (win) {
        // an open app navigates softly (SwBridge → router.push), keeping its state
        await win.focus()
        win.postMessage({ type: "pot:navigate", url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})

// for unit tests (vitest evaluates this file with a fake `self`)
self.__potSw = { parsePush, targetUrl, SW_VERSION }
