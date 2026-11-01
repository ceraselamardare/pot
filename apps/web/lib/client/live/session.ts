"use client"
// Live sessions (api-spec §2.1, §2.8): the cookie session is the truth; GET /api/session tells the UI who is
// signed in. Login for testing is the preview-only dev session (a 0-NEAR `u-<8>` account whose one key is this
// browser's device key, D-21); /demo personas come from POST /api/demo/session. NEAR Auth live login is F-14.
import { newOpKey, type Api } from "@pot/sdk"
import { useQuery } from "@tanstack/react-query"
import { base64urlnopad } from "@scure/base"
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

/**
 * Dev session (api-spec §2.1, B-04): the pending device key proves possession of
 * `pot-dev-session-v1|<pk>|<ts>`, the server creates `u-<8>.<relayer>` with that key as its only full-access key
 * and registers it with the token; the key becomes this browser's current key.
 */
export async function startDevSession(displayName: string): Promise<SessionInfo> {
  const keys = deviceKeys()
  if (!keys) throw new Error("unsupported")
  const pending = await keys.ensurePending()
  const ts = Date.now()
  const sig = await keys.sign(new TextEncoder().encode(`pot-dev-session-v1|${pending.publicKey}|${ts}`), "pending")
  const body: Api.DevSessionReq = {
    devicePublicKey: pending.publicKey,
    keyKind: pending.impl,
    pop: { ts, sig: base64urlnopad.encode(sig) },
    displayName: displayName.trim().slice(0, 40) || "Friend",
    idempotencyKey: newOpKey(),
  }
  const { data } = await api<Api.DevSessionRes>("POST", "/api/session/dev", body)
  await keys.promotePending(data.accountId)
  setSession(data.session)
  return data.session
}

/** /demo persona, persona switch, or reset (api-spec §2.8). */
export async function startDemoSession(req: Api.DemoSessionReq): Promise<Api.DemoSessionRes> {
  const { data } = await api<Api.DemoSessionRes>("POST", "/api/demo/session", req)
  setSession(data.session)
  return data
}

export async function liveSignOut(): Promise<void> {
  const s = getLiveSession()
  try {
    await api("DELETE", "/api/session", {})
  } catch {
    /* the cookie may already be gone */
  }
  // a dev/near-auth key is the account's own key: destroying it ends that account on this browser (§4.3)
  if (s && s.kind !== "demo") await deviceKeys()?.clear().catch(() => {})
  setSession(null)
}
