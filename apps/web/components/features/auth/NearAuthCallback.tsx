"use client"
// The NEAR Auth redirect callback island (F-14; frontend-architecture §4.4): the shared testnet client only accepts
// the root path as its callback, so a redirect-mode sign-in (popup blocked, iOS standalone) comes back to "/" with
// ?code&state. This island finishes it (code exchange, device PoP, POST /api/session — or, for "Confirm it's you",
// POST /api/devices) and goes back to where the person was: for the sign-in dialog that's its `next`
// (/pots?sheet=create → the intro → Create), passed as returnTo. It renders nothing on a normal visit.
// While it works it holds the hand-off (lib/client/signin.ts), so "/"'s signed-in redirect to /pots doesn't race
// it; a callback that turns out not to be ours, or fails, lets go again.
import { useEffect, useState, useSyncExternalStore } from "react"
import { TypingDots } from "@/components/feedback/TypingDots"
import { t } from "@/i18n/t"
import { beginHandoff, endHandoff, safeNext } from "@/lib/client/signin"

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
    beginHandoff()
    void (async () => {
      const { completeNearAuthRedirect } = await import("@/lib/signing/near-auth/client")
      const r = await completeNearAuthRedirect()
      if (r.kind === "none") {
        endHandoff()
        return setDone(true)
      }
      if (r.kind === "approve") {
        try {
          const { submitAddDevice } = await import("@/lib/devices/confirm")
          await submitAddDevice({ bytes: r.bytes, accountId: r.approve.accountId, devicePublicKey: r.approve.devicePublicKey, keyKind: r.approve.keyKind }, r.jwt)
        } catch {
          setFailed(true)
        }
      }
      if (r.kind === "error") {
        endHandoff()
        setDone(true)
        setFailed(!(r.error && "kind" in r.error && r.error.kind === "cancelled"))
        return
      }
      // a hard navigation; the hand-off keeps "/"'s signed-in redirect to /pots out of its way meanwhile
      window.location.replace(safeNext(r.returnTo, "/pots"))
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
