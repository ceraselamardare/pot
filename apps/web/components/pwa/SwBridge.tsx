"use client"
// SwBridge (frontend-architecture §8.2): registers /sw.js once (scope /, updateViaCache none), captures Chrome's
// install prompt early (it fires once per page load), and turns the worker's `pot:navigate` message (a tapped
// notification while the app is open) into a soft navigation that keeps state.
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { wireInstallEvents } from "@/lib/client/pwa/platform"

export function SwBridge() {
  const router = useRouter()
  useEffect(() => {
    wireInstallEvents()
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* no SW: the app works fully without it (push is the only thing it adds) */
    })
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null
      if (!d || d.type !== "pot:navigate" || typeof d.url !== "string") return
      try {
        const u = new URL(d.url, window.location.origin)
        if (u.origin !== window.location.origin) return
        router.push(`${u.pathname}${u.search}`)
      } catch {}
    }
    navigator.serviceWorker.addEventListener("message", onMessage)
    return () => navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [router])
  return null
}
