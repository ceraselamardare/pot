"use client"
// Who is signed in, for both data sources (lib/client/config.ts):
//  - mock: a persona (maya | sam | leo) in localStorage (lib/client/mock/store.ts);
//  - testnet: the cookie session from GET /api/session (NEAR Auth or a NEAR wallet), an account id.
// Components use these hooks and actions only, never the mock store or the API directly.
import { IS_LIVE } from "./config"
import { PEOPLE, PERSONAS, type PersonaId } from "./mock/fixtures"
import * as mock from "./mock/store"
import { initialsOf } from "./mock/world"
import { liveSignOut, useLiveSession, type SessionInfo } from "./live/session"
import { nameFromAccount } from "./live/vm"

export interface MeInfo {
  /** the id members/requests use: persona id (mock) or account id (testnet) */
  id: string
  name: string
  initials: string
  emailHint?: string
  /** the NEAR account (shown only in You → Advanced) */
  account: string
  /** "mock": the mock data source's fictional people (tests and design only, never shipped) */
  kind: "mock" | "near-auth" | "wallet"
  persona?: PersonaId
  /** avatar colour slot */
  joinIndex: number
}

function useMockMe(): MeInfo | null | undefined {
  const s = mock.useSession()
  if (s === undefined) return undefined
  if (!s) return null
  const p = PEOPLE[s.persona]
  return { id: s.persona, name: p.name, initials: initialsOf(p.name), emailHint: p.emailHint, account: p.account, kind: "mock", persona: s.persona, joinIndex: PERSONAS.indexOf(s.persona) }
}

export function infoOf(s: SessionInfo): MeInfo {
  const name = s.displayName || nameFromAccount(s.accountId) || s.accountId
  return { id: s.accountId, name, initials: initialsOf(name), emailHint: s.emailHint, account: s.accountId, kind: s.kind, joinIndex: 0 }
}

function useLiveMe(): MeInfo | null | undefined {
  const s = useLiveSession()
  if (s === undefined) return undefined
  return s ? infoOf(s) : null
}

/** undefined before hydration / while loading, null when signed out. */
export const useMeInfo: () => MeInfo | null | undefined = IS_LIVE ? useLiveMe : useMockMe

/** The signed-in person's id; undefined before hydration, null when signed out. */
export function useMe(): string | null | undefined {
  const m = useMeInfo()
  return m === undefined ? undefined : (m?.id ?? null)
}

export async function signOut(): Promise<void> {
  if (!IS_LIVE) return mock.setSession(null)
  await liveSignOut()
}
