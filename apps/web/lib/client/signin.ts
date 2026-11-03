// The sign-in dialog's plumbing (site update 2026-11-03; scratchpad auth-map §4.1, design-direction 07 §1.3, §2):
//  - the site's start CTAs (SignInLink) stay real links to `next` for no-JS, new tabs and crawlers; with JS and no
//    session they open the dialog in place by pushing `?signin=1` (Back closes it, a reload reopens it);
//  - `next` never rides in the URL (open redirects): the opener's {next, source} is kept here and in
//    sessionStorage['pot.signin'] (a reload), always through safeNext();
//  - the hand-off flag: a sign-in that just finished navigates to its own destination (the dialog's `next`, the NEAR
//    Auth callback's returnTo), and "/"'s signed-in redirect to /pots stands down meanwhile (auth-map §5 risk 1).
// Tiny on purpose: the landing and the tour import it on first load, so it has no data-layer imports (only the
// mock cast's ids, to read the mock session hint). No "use client": a server component may import DEFAULT_NEXT;
// everything that touches the browser runs inside a function.
import { PERSONAS, type PersonaId } from "./mock/fixtures"

/** Where a start CTA lands after signing in: the app's first-run intro, then Create (lib/client/onboarding). */
export const DEFAULT_NEXT = "/pots?sheet=create"
/** The URL state that opens the dialog (not `sheet=`: on a route with sheets, `sheet=create` must survive). */
export const SIGNIN_PARAM = "signin"
/** The app shell's routes: there the signed-out screen shows the same panel inline, so the dialog never opens. */
const APP_ROUTE = /^\/(?:pots|requests|you|p)(?:\/|$)/

export type SignInSource = "hero" | "final" | "header" | "tour" | "deeplink"
export interface SignInRequest {
  next: string
  source: SignInSource
}
/** Start mode (a start CTA: "Sign in to start your Pot") or back mode (the header's "Sign in": "Sign in to Pot"). */
export type SignInMode = "start" | "back"

const REQUEST_KEY = "pot.signin"
const MOCK_SESSION_KEY = "pot.mock.session"
const SOURCES: readonly SignInSource[] = ["hero", "final", "header", "tour", "deeplink"]

const isLive = () => process.env.NEXT_PUBLIC_DATA_SOURCE === "testnet"

/**
 * A same-origin path to go to after signing in, or `fallback`. Refuses anything that could leave the site or be
 * read as another host: "//host", "/\host" and any backslash, schemes ("https:", "javascript:"), whitespace and
 * control characters (the URL parser drops tabs and newlines, so "/\t/host" would become "//host"). Drops our own
 * `signin` param, so landing never reopens the dialog.
 */
export function safeNext(raw?: string | null, fallback: string = DEFAULT_NEXT): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback
  if (raw.includes("\\") || /[\s\u0000-\u001f\u007f]/.test(raw)) return fallback
  let u: URL
  try {
    u = new URL(raw, "https://pot.invalid")
  } catch {
    return fallback
  }
  if (u.origin !== "https://pot.invalid") return fallback
  u.searchParams.delete(SIGNIN_PARAM)
  return `${u.pathname}${u.search}${u.hash}`
}

/** Start mode for the start CTAs' destination; back mode for anything else (the header's "Sign in" → /pots). */
export const modeOf = (next: string): SignInMode => (safeNext(next) === DEFAULT_NEXT ? "start" : "back")

export const isAppRoute = (pathname: string): boolean => APP_ROUTE.test(pathname)

/**
 * Does this browser look signed in? Testnet: the JS-readable `pot_hint` cookie (routing only, never authorization;
 * server/session/cookies.ts). Mock: a known persona in localStorage['pot.mock.session']. Any failure reads as no.
 */
export function hasSessionHint(): boolean {
  if (typeof window === "undefined") return false
  if (isLive()) {
    try {
      return /(?:^|;\s*)pot_hint=[^;\s]/.test(document.cookie)
    } catch {
      return false
    }
  }
  try {
    const s = JSON.parse(localStorage.getItem(MOCK_SESSION_KEY) ?? "null") as { persona?: unknown } | null
    return !!s && typeof s.persona === "string" && PERSONAS.includes(s.persona as PersonaId)
  } catch {
    return false
  }
}

/**
 * Which ways in this build has (07 §2.4). Testnet: NEAR Auth (Google, email) when its flag and client id are set
 * (the same test as lib/signing/near-auth/oidc.ts `nearAuthEnabled`, without importing it: this module ships on
 * first load), Google never inside an in-app browser (Google blocks embedded webviews); the NEAR wallet always.
 * Mock: the full set, simulated (each signs in as the mock newcomer Alex).
 */
export function signInMethods(inApp: string | null): { google: boolean; email: boolean; wallet: boolean; mock: boolean } {
  if (!isLive()) return { google: !inApp, email: true, wallet: true, mock: true }
  const nearAuth = process.env.NEXT_PUBLIC_FLAG_NEAR_AUTH === "true" && !!process.env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID
  return { google: nearAuth && !inApp, email: nearAuth, wallet: true, mock: false }
}

// ---------------------------------------------------------------------------------------------------------
// the opener's request

let request: SignInRequest | null = null

function readStoredRequest(): SignInRequest | null {
  try {
    const j = JSON.parse(sessionStorage.getItem(REQUEST_KEY) ?? "null") as Partial<SignInRequest> | null
    if (!j || typeof j.next !== "string") return null
    return { next: safeNext(j.next), source: SOURCES.includes(j.source as SignInSource) ? (j.source as SignInSource) : "deeplink" }
  } catch {
    return null
  }
}

/** What the open dialog is for: the opener's request, the one kept for a reload, else a start from a deep link. */
export function currentSignInRequest(): SignInRequest {
  return request ?? readStoredRequest() ?? { next: DEFAULT_NEXT, source: "deeplink" }
}

/** Forget the request (the dialog closed or handed off), so a later deep link starts fresh. */
export function forgetSignInRequest() {
  request = null
  try {
    sessionStorage.removeItem(REQUEST_KEY)
  } catch {}
}

/** Our key in history.state beside Next's own (as lib/client/sheet.ts `potSheet`): we pushed this entry. */
interface SignInEntry {
  potSignIn?: number
}

function urlWithout(param: string): string {
  const u = new URL(window.location.href)
  u.searchParams.delete(param)
  return `${u.pathname}${u.search}${u.hash}`
}

/** Open the dialog: remember {next, source}, then push `?signin=1` (Back closes it again). */
export function openSignIn(o: { next?: string; source?: SignInSource } = {}) {
  request = { next: safeNext(o.next), source: o.source ?? "deeplink" }
  try {
    sessionStorage.setItem(REQUEST_KEY, JSON.stringify(request))
  } catch {}
  const u = new URL(window.location.href)
  if (u.searchParams.get(SIGNIN_PARAM) === "1") return
  u.searchParams.set(SIGNIN_PARAM, "1")
  window.history.pushState({ potSignIn: 1 } satisfies SignInEntry, "", `${u.pathname}${u.search}${u.hash}`)
}

/** Close it: back over the entry we pushed, or strip the param in place (a cold deep link never leaves the site). */
export function closeSignIn() {
  forgetSignInRequest()
  const pushed = (window.history.state as SignInEntry | null)?.potSignIn === 1
  if (pushed) {
    window.history.back()
    return
  }
  window.history.replaceState(null, "", urlWithout(SIGNIN_PARAM))
}

// ---------------------------------------------------------------------------------------------------------
// the hand-off

/** The path the hand-off started on; null when none is running. SignInHost ends it once the route changes. */
let handoffFrom: string | null = null
const handoffSubs = new Set<() => void>()
const emitHandoff = () => handoffSubs.forEach((f) => f())

/** A sign-in finished here and its own navigation is on the way: "/"'s redirect to /pots must not race it. */
export function beginHandoff() {
  handoffFrom = typeof window === "undefined" ? "/" : window.location.pathname
  emitHandoff()
}

export function endHandoff() {
  if (handoffFrom === null) return
  handoffFrom = null
  emitHandoff()
}

export const handoffActive = (): boolean => handoffFrom !== null

/** The route changed: the hand-off's navigation happened (or the person went elsewhere), so it's over. */
export function settleHandoff(pathname: string) {
  if (handoffFrom !== null && pathname !== handoffFrom) endHandoff()
}

export function subscribeHandoff(cb: () => void): () => void {
  handoffSubs.add(cb)
  return () => handoffSubs.delete(cb)
}

/** For tests: forget this page's state. */
export function resetSignInMemory() {
  request = null
  handoffFrom = null
}
