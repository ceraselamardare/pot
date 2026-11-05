"use client"
// Who is signed in, for both data sources (lib/client/config.ts):
//  - mock: a persona (maya | sam | leo) in localStorage (lib/client/mock/store.ts);
//  - testnet: the cookie session from GET /api/session (NEAR Auth or a NEAR wallet), an account id.
// Components use these hooks and actions only, never the mock store or the API directly.
import { IS_LIVE } from "./config"
import { PEOPLE, PERSONAS, type PersonaId } from "./mock/fixtures"
import * as mock from "./mock/store"
import { avatarOf, initialsOf } from "./mock/world"
import { avatarOrNull, type AvatarId } from "@/lib/avatars"
import { useMemo } from "react"
import { liveSignOut, useLiveSession, type SessionInfo } from "./live/session"
import { forgetAllInvites } from "./live/invites"
import { forgetAllLinkSecrets } from "./paylink/secrets"
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
  /** the chosen brand avatar (You → Profile); null = initials */
  avatar: AvatarId | null
}

function useMockMe(): MeInfo | null | undefined {
  const s = mock.useSession()
  const world = mock.useWorld()
  const avatar = s && world ? avatarOf(world, s.persona) : null
  return useMemo(() => {
    if (s === undefined) return undefined
    if (!s) return null
    const p = PEOPLE[s.persona]
    return { id: s.persona, name: p.name, initials: initialsOf(p.name), emailHint: p.emailHint, account: p.account, kind: "mock", persona: s.persona, joinIndex: PERSONAS.indexOf(s.persona), avatar }
  }, [s, avatar])
}

export function infoOf(s: SessionInfo): MeInfo {
  const name = s.displayName || nameFromAccount(s.accountId) || s.accountId
  return { id: s.accountId, name, initials: initialsOf(name), emailHint: s.emailHint, account: s.accountId, kind: s.kind, joinIndex: 0, avatar: avatarOrNull(s.avatar) }
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
  // CLI-6 (security audit 2026-11-04): the bearer secrets this device kept (payment links, invite links) go with the
  // session. The tab's sessionStorage stash of an invite or claim being opened right now stays (the invite page's
  // "Not you? Switch" signs out mid-join and must still have the link); it ends with the tab.
  await forgetLinkSecrets()
  if (!IS_LIVE) return mock.setSession(null)
  await liveSignOut()
}

/** CLI-6: forget every link secret kept on this device (localStorage payment links + the IndexedDB invites). */
export async function forgetLinkSecrets(): Promise<void> {
  forgetAllLinkSecrets()
  await forgetAllInvites().catch(() => {})
}
