"use client"
// Live sessions (api-spec §2.1): the cookie session is the truth; GET /api/session tells the UI who is signed
// in. Sign-in is NEAR Auth (lib/signing/near-auth, F-14) or a NEAR wallet through NEAR Connect
// (lib/signing/near-connect, F-19); there is no test-account or server-signed login (Rev 9).
import type { Api } from "@pot/sdk"
import { useQuery } from "@tanstack/react-query"
import { deviceKeys } from "../keys/device-key-store"
import { queryClient } from "../query"
import { api } from "./api"

export type SessionInfo = Api.SessionInfo
export const SESSION_KEY = ["session"] as const

async function fetchSession(): Promise<SessionInfo | null> {
  const { data } = await api<Api.SessionGetRes>("GET", "/api/session")
  return data.session ?? null
}

/** undefined while loading (and on the server), null when signed out. */
export function useLiveSession(): SessionInfo | null | undefined {
  const q = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: 60_000, retry: 2 })
  if (q.isPending) return undefined
  if (q.isError) return null
  return q.data
}

export const getLiveSession = (): SessionInfo | null | undefined => queryClient().getQueryData<SessionInfo | null>(SESSION_KEY)

/** The current session, fetching it once if the cache is cold. */
export async function ensureLiveSession(): Promise<SessionInfo | null> {
  return queryClient().fetchQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: 30_000 })
}

function setSession(s: SessionInfo | null) {
  const qc = queryClient()
  qc.setQueryData(SESSION_KEY, s)
  // everything below the session is per person
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
}

export async function liveSignOut(): Promise<void> {
  const s = getLiveSession()
  try {
    await api("DELETE", "/api/session", {})
  } catch {
    /* the cookie may already be gone */
  }
  // a NEAR Auth device key is the account's own key: destroying it ends that account on this browser (§4.3)
  if (s) await deviceKeys()?.clear().catch(() => {})
  setSession(null)
}
