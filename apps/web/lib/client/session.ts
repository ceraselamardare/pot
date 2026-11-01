"use client"
// Who is signed in, for both data sources (lib/client/config.ts):
//  - mock: a persona (maya | sam | leo) in localStorage (lib/client/mock/store.ts);
//  - testnet: the cookie session from GET /api/session (dev, demo or NEAR Auth), an account id.
// Components use these hooks and actions only, never the mock store or the API directly.
import { IS_LIVE } from "./config"
import { PEOPLE, PERSONAS, type PersonaId } from "./mock/fixtures"
import * as mock from "./mock/store"
import { initialsOf } from "./mock/world"
import { ensureLiveSession, liveSignOut, startDemoSession, startDevSession, useLiveSession, getLiveSession, type SessionInfo } from "./live/session"
import { nameFromAccount } from "./live/vm"

export interface MeInfo {
  /** the id members/requests use: persona id (mock) or account id (testnet) */
  id: string
  name: string
  initials: string
  emailHint?: string
  /** the NEAR account (shown only in You → Advanced) */
  account: string
  kind: "demo" | "dev" | "near-auth" | "wallet"
  persona?: PersonaId
  /** avatar colour slot */
  joinIndex: number
}

function useMockMe(): MeInfo | null | undefined {
  const s = mock.useSession()
  if (s === undefined) return undefined
  if (!s) return null
  const p = PEOPLE[s.persona]
  return { id: s.persona, name: p.name, initials: initialsOf(p.name), emailHint: p.emailHint, account: p.account, kind: "demo", persona: s.persona, joinIndex: PERSONAS.indexOf(s.persona) }
}

export function infoOf(s: SessionInfo): MeInfo {
  const persona = s.demo?.persona
  const name = s.displayName || nameFromAccount(s.accountId) || s.accountId
  return {
    id: s.accountId,
    name,
    initials: initialsOf(name),
    emailHint: s.emailHint,
    account: s.accountId,
    kind: s.kind,
    persona,
    joinIndex: persona ? PERSONAS.indexOf(persona) : 0,
  }
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

/** Synchronous best guess (mock store / query cache), for event handlers. */
export function currentKind(): MeInfo["kind"] | null {
  if (!IS_LIVE) return mock.getSession() ? "demo" : null
  return getLiveSession()?.kind ?? null
}

/** The current session kind, loading it if needed (null = signed out). */
export async function sessionKind(): Promise<MeInfo["kind"] | null> {
  if (!IS_LIVE) return mock.getSession() ? "demo" : null
  return (await ensureLiveSession().catch(() => null))?.kind ?? null
}

/** /demo "Try as …": returns where to go next (the leased Pot on testnet). */
export async function signInDemo(persona: PersonaId): Promise<string> {
  if (!IS_LIVE) {
    mock.setSession(persona)
    return "/p/lisbon-trip"
  }
  const r = await startDemoSession({ persona })
  return `/p/${r.lease.slug}`
}

/** Demo banner: switch person inside the same leased Pot. */
export async function switchPersona(persona: PersonaId): Promise<void> {
  if (!IS_LIVE) return mock.setSession(persona)
  await startDemoSession({ persona })
}

/** Demo banner: a fresh Pot (testnet: a new lease; nothing on chain is undone). Returns the new Pot's path. */
export async function resetDemo(): Promise<string> {
  if (!IS_LIVE) {
    mock.resetWorld()
    return "/pots"
  }
  const r = await startDemoSession({ reset: true })
  return `/p/${r.lease.slug}`
}

/** Test account (preview/local only, FLAG_DEV_SESSION). */
export async function signInDev(displayName: string): Promise<MeInfo> {
  return infoOf(await startDevSession(displayName))
}

export async function signOut(): Promise<void> {
  if (!IS_LIVE) return mock.setSession(null)
  await liveSignOut()
}
