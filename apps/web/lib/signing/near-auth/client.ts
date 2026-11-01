"use client"
// NEAR Auth, the browser half (F-14 / F-27; frontend-architecture §4.4; D-20, D-21):
//  - prepareNearAuthLogin() on idle: the pending device key + a server challenge → the device-bound nonce, so the
//    tap does no async work before the window opens;
//  - startNearAuthLogin() INSIDE the tap: window.open() synchronously (popup rule), then the /authorize URL, the
//    web_message answer, the code exchange, the device PoP and POST /api/session;
//  - no window (iOS standalone can return null, blockers) → redirect fallback: the pending flow goes to
//    sessionStorage and the callback island on "/" finishes it (the shared client only accepts the root path);
//  - startNearAuthApproval() for "Confirm it's you": the same flow with the signing audience and the delegate
//    bytes; the access token is the 60 s signing JWT.
import type { Api } from "@pot/sdk"
import { base64urlnopad } from "@scure/base"
import { deviceKeys } from "@/lib/client/keys/device-key-store"
import { api } from "@/lib/client/live/api"
import { SESSION_KEY } from "@/lib/client/live/session"
import { queryClient } from "@/lib/client/query"
import {
  authorizeUrl,
  deviceNonce,
  exchangeCode,
  makePkce,
  makeState,
  nearAuthConfig,
  NearAuthError,
  sessionPopMessage,
  type AuthorizeParams,
} from "./oidc"

const PENDING_KEY = "pot.nearauth.pending"
const HINT_KEY = "pot.nearauth.loginHint"
const CHALLENGE_MAX_AGE = 8 * 60_000
const WINDOW_TIMEOUT = 180_000

export interface PreparedLogin {
  devicePublicKey: string
  keyKind: "webcrypto" | "fallback"
  challenge: string
  nonce: string
  at: number
}

let prepared: Promise<PreparedLogin> | null = null
let preparedAt = 0

/** On idle (signed-out screen, /j): the device key and a fresh challenge (refreshed after 8 min). */
export function prepareNearAuthLogin(): Promise<PreparedLogin> {
  if (prepared && Date.now() - preparedAt < CHALLENGE_MAX_AGE) return prepared
  preparedAt = Date.now()
  prepared = (async () => {
    const keys = deviceKeys()
    if (!keys) throw new NearAuthError("failed", "unsupported")
    const k = await keys.ensurePending()
    const { data } = await api<Api.SessionChallengeRes>("GET", "/api/session/challenge")
    return { devicePublicKey: k.publicKey, keyKind: k.impl, challenge: data.challenge, nonce: await deviceNonce(k.publicKey, data.challenge), at: Date.now() }
  })()
  prepared.catch(() => {
    prepared = null
  })
  return prepared
}

/** Synchronous: a named, sized popup, or null (blocked / iOS standalone). */
function openWindow(): Window | null {
  try {
    const w = 480
    const h = 720
    const left = Math.max(0, (window.screenX ?? 0) + ((window.outerWidth ?? w) - w) / 2)
    const top = Math.max(0, (window.screenY ?? 0) + ((window.outerHeight ?? h) - h) / 2)
    return window.open("about:blank", "pot-auth", `popup,width=${w},height=${h},left=${left},top=${top}`)
  } catch {
    return null
  }
}

const redirectUri = () => window.location.origin

function loginHint(): string | undefined {
  try {
    return localStorage.getItem(HINT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** Wait for Auth0's web_message answer from the popup (matching origin and state). */
function waitForCode(popup: Window, state: string): Promise<string> {
  const origin = new URL(nearAuthConfig().base).origin
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      window.removeEventListener("message", onMessage)
      clearInterval(poll)
      clearTimeout(timer)
      fn()
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin) return
      const d = e.data as { type?: string; response?: { code?: string; state?: string; error?: string } } | null
      if (d?.type !== "authorization_response" || !d.response) return
      if (d.response.state !== state) return
      finish(() => {
        try {
          popup.close()
        } catch {}
        if (d.response!.code) resolve(d.response!.code)
        else reject(new NearAuthError(d.response!.error === "access_denied" || d.response!.error === "login_required" ? "cancelled" : "failed", d.response!.error))
      })
    }
    window.addEventListener("message", onMessage)
    const poll = setInterval(() => {
      if (popup.closed) finish(() => reject(new NearAuthError("cancelled", "Popup closed")))
    }, 500)
    const timer = setTimeout(() => finish(() => reject(new NearAuthError("timeout"))), WINDOW_TIMEOUT)
  })
}

interface PendingRedirect {
  kind: "login" | "approve"
  state: string
  verifier: string
  returnTo: string
  login?: PreparedLogin
  /** approve: base64 of the delegate bytes + what to do with the JWT */
  bytes?: string
  approve?: { devicePublicKey: string; keyKind: "webcrypto" | "fallback"; accountId: string }
}

async function runAuthorize(
  popup: Window | null,
  params: Omit<AuthorizeParams, "redirectUri" | "state" | "codeChallenge" | "responseMode">,
  pending: Omit<PendingRedirect, "state" | "verifier">,
): Promise<{ idToken: string; accessToken: string }> {
  const cfg = nearAuthConfig()
  const pkce = await makePkce()
  const state = makeState()
  const common = { ...params, redirectUri: redirectUri(), state, codeChallenge: pkce.challenge, loginHint: loginHint() }
  if (!popup || popup.closed) {
    // redirect fallback: the callback island on "/" finishes it
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, state, verifier: pkce.verifier } satisfies PendingRedirect))
    } catch {
      throw new NearAuthError("blocked")
    }
    window.location.assign(authorizeUrl(cfg, { ...common, responseMode: "query" }))
    return new Promise(() => undefined) // the page navigates away
  }
  popup.location.href = authorizeUrl(cfg, { ...common, responseMode: "web_message" })
  const code = await waitForCode(popup, state)
  return exchangeCode(cfg, { code, verifier: pkce.verifier, redirectUri: redirectUri() })
}

/** The device PoP + POST /api/session; the pending key becomes this account's key. */
async function finishLogin(idToken: string, p: PreparedLogin, displayName?: string): Promise<Api.SessionCreateRes> {
  const keys = deviceKeys()
  if (!keys) throw new NearAuthError("failed", "unsupported")
  const ts = Date.now()
  const sig = await keys.sign(await sessionPopMessage(idToken, ts), "pending")
  const body: Api.SessionCreateReq = {
    idToken,
    devicePublicKey: p.devicePublicKey as Api.SessionCreateReq["devicePublicKey"],
    keyKind: p.keyKind,
    challenge: p.challenge,
    pop: { ts, sig: base64urlnopad.encode(sig) },
    ...(displayName ? { displayName } : {}),
  }
  const { data } = await api<Api.SessionCreateRes>("POST", "/api/session", body)
  await keys.promotePending(data.accountId)
  prepared = null
  const qc = queryClient()
  qc.setQueryData(SESSION_KEY, data.session)
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
  return data
}

/**
 * "Continue with Google" / email / passkey. CALL IT SYNCHRONOUSLY FROM THE TAP: the window opens before any await.
 * Rejects with NearAuthError (cancelled = silent) or the API's ActionError.
 */
export function startNearAuthLogin(opts: { connection?: "google-oauth2"; returnTo?: string; displayName?: string } = {}): Promise<Api.SessionCreateRes> {
  const popup = openWindow()
  return (async () => {
    try {
      const p = await prepareNearAuthLogin()
      const returnTo = opts.returnTo ?? `${window.location.pathname}${window.location.search}`
      const { idToken } = await runAuthorize(popup, { nonce: p.nonce, connection: opts.connection }, { kind: "login", returnTo, login: p })
      return await finishLogin(idToken, p, opts.displayName)
    } catch (e) {
      try {
        popup?.close()
      } catch {}
      throw e
    }
  })()
}

/**
 * "Confirm it's you": approve the exact NEP-461-prefixed DelegateAction bytes (prebuilt BEFORE the tap) in the NEAR
 * Auth window; resolves with the 60 s signing JWT. Synchronous window like the login.
 */
export function startNearAuthApproval(
  bytes: Uint8Array,
  ctx: { devicePublicKey: string; keyKind: "webcrypto" | "fallback"; accountId: string; connection?: "google-oauth2"; returnTo?: string },
): Promise<string> {
  const popup = openWindow()
  return (async () => {
    const cfg = nearAuthConfig()
    const returnTo = ctx.returnTo ?? `${window.location.pathname}${window.location.search}`
    const t = await runAuthorize(
      popup,
      { audience: cfg.signingAudience, delegateAction: bytes, connection: ctx.connection },
      { kind: "approve", returnTo, bytes: btoa(String.fromCharCode(...bytes)), approve: { devicePublicKey: ctx.devicePublicKey, keyKind: ctx.keyKind, accountId: ctx.accountId } },
    )
    if (!t.accessToken) throw new NearAuthError("failed", "no_signing_token")
    return t.accessToken
  })()
}

export type RedirectOutcome =
  | { kind: "none" }
  | { kind: "login"; returnTo: string; session: Api.SessionInfo }
  | { kind: "approve"; returnTo: string; jwt: string; bytes: Uint8Array; approve: NonNullable<PendingRedirect["approve"]> }
  | { kind: "error"; returnTo: string; error: NearAuthError | Error }

/** The callback island ("/"): finish a redirect-mode login or approval. */
export async function completeNearAuthRedirect(): Promise<RedirectOutcome> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  if (!state || (!code && !error)) return { kind: "none" }
  let pending: PendingRedirect | null = null
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as PendingRedirect | null
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    pending = null
  }
  if (!pending || pending.state !== state) return { kind: "none" }
  // strip ?code&state at once (never left in history or referrers)
  window.history.replaceState(null, "", url.pathname)
  const returnTo = pending.returnTo.startsWith("/") && !pending.returnTo.startsWith("//") ? pending.returnTo : "/pots"
  if (error || !code) return { kind: "error", returnTo, error: new NearAuthError(error === "access_denied" ? "cancelled" : "failed", error ?? undefined) }
  try {
    const t = await exchangeCode(nearAuthConfig(), { code, verifier: pending.verifier, redirectUri: redirectUri() })
    if (pending.kind === "login" && pending.login) {
      const r = await finishLogin(t.idToken, pending.login)
      return { kind: "login", returnTo, session: r.session }
    }
    if (pending.kind === "approve" && pending.bytes && pending.approve)
      return { kind: "approve", returnTo, jwt: t.accessToken, bytes: Uint8Array.from(atob(pending.bytes), (c) => c.charCodeAt(0)), approve: pending.approve }
    return { kind: "none" }
  } catch (e) {
    return { kind: "error", returnTo, error: e as Error }
  }
}
