"use client"
// "/" sends a signed-in visitor to their Pots (frontend-architecture §2.1), without putting the data layer on the
// landing's first load: a signed-out visitor (most of them) only reads the cheap session hint (lib/client/signin.ts
// hasSessionHint: testnet's JS-readable `pot_hint` cookie, the mock's persona in localStorage) and loads nothing else.
// With a hint, <HomeRedirectSession /> is loaded on demand and confirms the session (useMe: GET /api/session on
// testnet) before redirecting, as before, so a stale hint never redirects. The hint is read again when a hand-off
// starts or ends (a sign-in finished on this page), and the session check then stands down until it's over.
import dynamic from "next/dynamic"
import { useSyncExternalStore } from "react"
import { hasSessionHint, subscribeHandoff } from "@/lib/client/signin"

const HomeRedirectSession = dynamic(() => import("./HomeRedirectSession").then((m) => m.HomeRedirectSession), { ssr: false })

export function HomeRedirect() {
  const hinted = useSyncExternalStore(subscribeHandoff, hasSessionHint, () => false)
  return hinted ? <HomeRedirectSession /> : null
}
