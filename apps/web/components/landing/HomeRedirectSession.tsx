"use client"
// The real check behind <HomeRedirect /> (loaded only when the browser has a session hint): the session from useMe
// (testnet: GET /api/session; mock: its persona) sends a signed-in visitor to their Pots (frontend-architecture §2.1).
// Except during a hand-off (lib/client/signin.ts): a sign-in that just finished on this page navigates to its own
// destination (the sign-in dialog's /pots?sheet=create → the intro → Create; the NEAR Auth callback's returnTo), and
// "/pots" must not win that race (scratchpad auth-map §5 risk 1: the session query notifies its observers a task
// after the sign-in's own callback runs, so a redirect fired then would drop ?sheet=create). The check waits one
// task, so a hand-off started in the same turn as the session (the mock's store notifies synchronously) is seen.
import { useRouter } from "next/navigation"
import { useEffect, useSyncExternalStore } from "react"
import { useMe } from "@/lib/client/session"
import { handoffActive, subscribeHandoff } from "@/lib/client/signin"

export function HomeRedirectSession() {
  const me = useMe()
  const router = useRouter()
  const handingOff = useSyncExternalStore(subscribeHandoff, handoffActive, () => false)
  useEffect(() => {
    if (!me || handingOff) return
    const id = setTimeout(() => {
      if (!handoffActive()) router.replace("/pots")
    }, 0)
    return () => clearTimeout(id)
  }, [me, handingOff, router])
  return null
}
