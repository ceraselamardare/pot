// NEAR Auth, the protocol half of the thin wrapper (D-20 rev4, review-security M-1/F-15; kb/near-auth.md §1).
// auth0-spa-js overwrites a caller's OIDC `nonce`, so Pot talks to the tenant directly: Authorization Code + PKCE
// (S256) with OUR nonce = base64url(sha256(rawPk(devicePublicKey) ‖ rawBytes(challenge))), which binds the ID token
// to this browser's device key and a server challenge (api-spec §2.1, B-20). The same flow, with the signing
// audience and the `delegateAction` bytes, returns the 60 s signing JWT for "Confirm it's you" (the Auth0 Action
// puts the bytes in `fatxn`). Pure: WebCrypto + fetch only, so it runs (and is tested) in Node too.
import { base58, base64urlnopad } from "@scure/base"

export interface NearAuthConfig {
  /** where /authorize and /oauth/token live, e.g. https://login.testnet.fast-auth.com */
  base: string
  clientId: string
  /** the Auth0 API the signing token is for (the guard account) */
  signingAudience: string
}

/** Public build-time config. The shared testnet client only accepts http://localhost:3000 (kb/near-auth.md). */
export function nearAuthConfig(): NearAuthConfig {
  const domain = process.env.NEXT_PUBLIC_NEAR_AUTH_DOMAIN || "login.testnet.fast-auth.com"
  return {
    base: (process.env.NEXT_PUBLIC_NEAR_AUTH_BASE_URL || `https://${domain}`).replace(/\/$/, ""),
    clientId: process.env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID || "",
    signingAudience: process.env.NEXT_PUBLIC_NEAR_AUTH_SIGNING_AUDIENCE || "auth0.jwt.fast-auth.testnet",
  }
}

/** NEAR Auth is on for this build (flag + a client id). Hosted builds keep it off until H-01 (D-22). */
export const nearAuthEnabled = (): boolean => process.env.NEXT_PUBLIC_FLAG_NEAR_AUTH === "true" && !!nearAuthConfig().clientId

const enc = new TextEncoder()
const sha256 = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export interface Pkce {
  verifier: string
  challenge: string
}

/** RFC 7636: a 43-char verifier from 32 random bytes; challenge = base64url(sha256(verifier)). */
export async function makePkce(): Promise<Pkce> {
  const verifier = base64urlnopad.encode(rand(32))
  return { verifier, challenge: base64urlnopad.encode(await sha256(enc.encode(verifier))) }
}

export const makeState = (): string => base64urlnopad.encode(rand(16))

/** nonce = base64url(sha256(rawPk(devicePublicKey) ‖ rawBytes(challenge))), the server's `nonceFor`. */
export async function deviceNonce(devicePublicKey: string, challenge: string): Promise<string> {
  const pk = base58.decode(devicePublicKey.replace(/^ed25519:/, ""))
  const ch = base64urlnopad.decode(challenge)
  const both = new Uint8Array(pk.length + ch.length)
  both.set(pk)
  both.set(ch, pk.length)
  return base64urlnopad.encode(await sha256(both))
}

export interface AuthorizeParams {
  redirectUri: string
  state: string
  codeChallenge: string
  /** `web_message` for the popup (Auth0 posts the code to the opener), `query` for the redirect fallback */
  responseMode: "web_message" | "query"
  nonce?: string
  /** google-oauth2 skips the chooser (ux-spec 6.1 row 2b); undefined = email / passkey on Universal Login */
  connection?: string
  /** a signing request: the guard's audience + the bytes the Approve form shows */
  audience?: string
  delegateAction?: Uint8Array
  scope?: string
  prompt?: "login" | "none"
  /** fake issuer only: which test user signs in */
  loginHint?: string
}

export function authorizeUrl(cfg: NearAuthConfig, p: AuthorizeParams): string {
  const u = new URL(`${cfg.base}/authorize`)
  const q = u.searchParams
  q.set("client_id", cfg.clientId)
  q.set("response_type", "code")
  q.set("redirect_uri", p.redirectUri)
  q.set("scope", p.scope ?? (p.audience ? "openid transaction:sign" : "openid profile email"))
  q.set("state", p.state)
  q.set("code_challenge", p.codeChallenge)
  q.set("code_challenge_method", "S256")
  q.set("response_mode", p.responseMode)
  if (p.nonce) q.set("nonce", p.nonce)
  if (p.connection) q.set("connection", p.connection)
  if (p.audience) q.set("audience", p.audience)
  if (p.delegateAction) q.set("delegateAction", Array.from(p.delegateAction).join(","))
  if (p.prompt) q.set("prompt", p.prompt)
  if (p.loginHint) q.set("login_hint", p.loginHint)
  return u.toString()
}

export interface TokenSet {
  idToken: string
  accessToken: string
}

export class NearAuthError extends Error {
  constructor(
    /** cancelled: the person closed or denied the window (silent) · blocked: no window · timeout · failed · unavailable */
    readonly kind: "cancelled" | "blocked" | "timeout" | "failed" | "unavailable",
    message?: string,
  ) {
    super(message ?? kind)
    this.name = "NearAuthError"
  }
}

/** POST /oauth/token (public client + PKCE verifier; the origin must be in the client's Allowed Web Origins). */
export async function exchangeCode(
  cfg: NearAuthConfig,
  p: { code: string; verifier: string; redirectUri: string },
  f: typeof fetch = fetch,
): Promise<TokenSet> {
  let res: Response
  try {
    res = await f(`${cfg.base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: cfg.clientId,
        code: p.code,
        code_verifier: p.verifier,
        redirect_uri: p.redirectUri,
      }).toString(),
    })
  } catch {
    throw new NearAuthError("unavailable")
  }
  const j = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error?: string }
  if (!res.ok || !j.id_token) throw new NearAuthError(res.status >= 500 ? "unavailable" : "failed", j.error)
  return { idToken: j.id_token, accessToken: j.access_token ?? "" }
}

/** The ID token's claims, unverified (display only: the first name for "Welcome, Leo"; the server verifies). */
export function peekClaims(idToken: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(base64urlnopad.decode(idToken.split(".")[1]!.replace(/=+$/, ""))))
  } catch {
    return {}
  }
}

/** pot-session-v1|b64url(sha256(idToken))|ts — the PoP message for POST /api/session (api-spec §4.2). */
export async function sessionPopMessage(idToken: string, ts: number): Promise<Uint8Array> {
  return enc.encode(`pot-session-v1|${base64urlnopad.encode(await sha256(enc.encode(idToken)))}|${ts}`)
}
