"use client"
// The NEAR Auth redirect callback island (F-14; frontend-architecture §4.4): the shared testnet client only accepts
// the root path as its callback, so a redirect-mode sign-in (popup blocked, iOS standalone) comes back to "/" with
// ?code&state. This island finishes it (code exchange, device PoP, POST /api/session — or, for "Confirm it's you",
// POST /api/devices) and goes back to where the person was. It renders nothing on a normal visit.
import { useEffect, useState, useSyncExternalStore } from "react"
import { TypingDots } from "@/components/feedback/TypingDots"
import { t } from "@/i18n/t"

const hasCallback = () => {
  const q = new URLSearchParams(window.location.search)
  return !!q.get("state") && !!(q.get("code") || q.get("error"))
}
const noop = () => () => undefined

export function NearAuthCallback() {
  const callback = useSyncExternalStore(noop, hasCallback, () => false)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!callback) return
    void (async () => {
      const { completeNearAuthRedirect } = await import("@/lib/signing/near-auth/client")
      const r = await completeNearAuthRedirect()
      if (r.kind === "none") return setDone(true)
      if (r.kind === "approve") {
        try {
          const { submitAddDevice } = await import("@/lib/devices/confirm")
          await submitAddDevice({ bytes: r.bytes, accountId: r.approve.accountId, devicePublicKey: r.approve.devicePublicKey, keyKind: r.approve.keyKind }, r.jwt)
        } catch {
          setFailed(true)
        }
      }
      if (r.kind === "error") {
        setDone(true)
        setFailed(!(r.error && "kind" in r.error && r.error.kind === "cancelled"))
        return
      }
      // a hard navigation wins over "/"'s signed-in redirect to /pots
      window.location.replace(r.returnTo)
    })()
  }, [callback])
  const working = callback && !done
  if (!working && !failed) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-surface-sunken px-4 py-3 text-body-sm text-ink" data-auth-callback>
      {working && <TypingDots size="sm" />}
      {failed ? t("auth.failed") : t("auth.callback.working")}
    </div>
  )
}
