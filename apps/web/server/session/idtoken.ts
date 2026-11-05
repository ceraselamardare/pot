// NEAR Auth (Auth0) ID token verification (api-spec §4.3): jose with RS256 only (the tenant also advertises
// HS256 and PS256, review-security F-13), issuer with the trailing slash, aud = our client id, azp if present,
// iat ≤ 10 min old, 60 s clock tolerance, a SUB_RE `sub`; the rev4 nonce binding to the device key and a
// server challenge (B-20). Tokens are verified in memory and never stored or logged.
import "server-only"
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import { b64url, fromB64url, hmac, parseEd25519PublicKey, random, safeEqual, sha256 } from "../util/crypto"

export const SUB_RE = /^(google-oauth2|auth0)\|[^#\s]{1,240}$/

let jwks: JWTVerifyGetKey | undefined
let jwksUrl: string | undefined
export function getJwks(cfg: Config): JWTVerifyGetKey {
  if (!jwks || jwksUrl !== cfg.nearAuth.jwksUrl) {
    jwksUrl = cfg.nearAuth.jwksUrl
    jwks = createRemoteJWKSet(new URL(cfg.nearAuth.jwksUrl), { timeoutDuration: 5_000, cooldownDuration: 30_000 })
  }
  return jwks
}
export function setJwksForTests(next: JWTVerifyGetKey | undefined): void {
  jwks = next
  jwksUrl = next ? "test" : undefined
}

export interface IdClaims {
  sub: string
  email?: string
  emailVerified: boolean
  givenName?: string
  name?: string
  nonce?: string
}

export async function verifyIdToken(
  token: string,
  cfg: Config,
  opts: { jwks?: JWTVerifyGetKey; currentDate?: Date } = {},
): Promise<IdClaims> {
  if (cfg.nearAuth.acceptedAudiences.length === 0) throw new ApiError("auth_unavailable", { detail: { cause: "no_client_id" } })
  let payload: Record<string, unknown>
  try {
    const r = await jwtVerify(token, opts.jwks ?? getJwks(cfg), {
      algorithms: ["RS256"],
      issuer: cfg.nearAuth.issuer,
      audience: cfg.nearAuth.acceptedAudiences,
      maxTokenAge: "10m",
      clockTolerance: 60,
      currentDate: opts.currentDate,
    })
    payload = r.payload as Record<string, unknown>
  } catch (e) {
    if (e instanceof errors.JWKSTimeout || (e instanceof Error && !(e instanceof errors.JOSEError)))
      throw new ApiError("auth_unavailable", { retryAfterMs: 5_000 })
    throw new ApiError("id_token_invalid", { detail: { cause: (e as { code?: string }).code ?? "invalid" } })
  }
  if (payload.azp !== undefined && !cfg.nearAuth.acceptedAudiences.includes(String(payload.azp)))
    throw new ApiError("id_token_invalid", { detail: { cause: "azp" } })
  const sub = payload.sub
  if (typeof sub !== "string" || !SUB_RE.test(sub)) throw new ApiError("id_token_invalid", { detail: { cause: "sub" } })
  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
    givenName: typeof payload.given_name === "string" ? payload.given_name : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    nonce: typeof payload.nonce === "string" ? payload.nonce : undefined,
  }
}

// ---- rev4 (B-20): the stateless login challenge and the device-bound nonce ----

const CHALLENGE_TTL_MS = 10 * 60_000

/**
 * APP-7 (security audit 2026-11-04): the MAC also covers the environment's scope (`cfg.authScope`: network, Vercel
 * environment, host), so a challenge minted by a preview never verifies on production (or the other way round), even
 * when both share APP_HMAC_SECRET. The 32 challenge bytes the browser hashes into its nonce are unchanged.
 */
const challengeMac = (secret: string, scope: string, body: Uint8Array) =>
  hmac(secret, new Uint8Array([...new TextEncoder().encode(`pot-challenge-v2|${scope}|`), ...body])).slice(0, 8)

/** base64url(8-byte BE ms ‖ 16 random ‖ first 8 bytes of HMAC(secret, scope ‖ ts ‖ random)) */
export function makeChallenge(secret: string, nowMs = Date.now(), scope = ""): { challenge: string; expiresAt: string } {
  const ts = new Uint8Array(8)
  new DataView(ts.buffer).setBigUint64(0, BigInt(nowMs))
  const rnd = random(16)
  const body = new Uint8Array([...ts, ...rnd])
  const mac = challengeMac(secret, scope, body)
  return { challenge: b64url(new Uint8Array([...body, ...mac])), expiresAt: new Date(nowMs + CHALLENGE_TTL_MS).toISOString() }
}

/** The 32 challenge bytes when the MAC is right and it is ≤ 10 min old; else id_token_invalid (cause nonce). */
export function checkChallenge(secret: string, challenge: string, nowMs = Date.now(), scope = ""): Uint8Array {
  const bad = () => new ApiError("id_token_invalid", { detail: { cause: "nonce" } })
  let raw: Uint8Array
  try {
    raw = fromB64url(challenge)
  } catch {
    throw bad()
  }
  if (raw.length !== 32) throw bad()
  const body = raw.slice(0, 24)
  if (!safeEqual(challengeMac(secret, scope, body), raw.slice(24))) throw bad()
  const ts = Number(new DataView(body.buffer, body.byteOffset, 8).getBigUint64(0))
  if (nowMs - ts > CHALLENGE_TTL_MS || ts - nowMs > 60_000) throw bad()
  return raw
}

/** nonce = base64url(sha256(rawPk(devicePublicKey) ‖ rawBytes(challenge))) */
export function nonceFor(devicePublicKey: string, challengeBytes: Uint8Array): string {
  const pk = parseEd25519PublicKey(devicePublicKey)
  if (!pk) throw new ApiError("bad_request", { detail: { field: "devicePublicKey" } })
  return b64url(sha256(new Uint8Array([...pk, ...challengeBytes])))
}
