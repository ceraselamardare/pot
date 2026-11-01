// Invite links and the D-08 join message (contracts-spec §3.7). Dependency-free.
//   link:     /j/<slug>?i=<pk_b58>#<secret>      (pk without "ed25519:"; secret never reaches a server)
//   secret:   base64url, no padding, of the 32-byte ed25519 seed (43 chars)
//   message:  UTF-8 `pot-join:v1:<dao_id>:<joiner_account_id>`, raw ed25519 (no hash, no NEP-413)
//   signature on the wire (join arg, relayer R4): standard base64 WITH padding of 64 bytes (88 chars)
// Signing here uses WebCrypto Ed25519 (Node ≥ 22, Chrome 137+, Safari 17+, Firefox 129+); the
// "@pot/sdk/sign" twin (signJoin/verifyJoin) uses near-api-js / noble for browsers without it.

import { base58Decode, base58Encode, base64Decode, base64Encode, base64UrlDecode, base64UrlEncode, concatBytes, randomBytes, utf8Encode } from "./encoding.ts"
import type { PublicKeyStr } from "./types/ids.ts"

export const JOIN_DOMAIN = "pot-join:v1"

/** `pot-join:v1:<dao_id>:<joiner>` */
export const joinMessage = (daoId: string, joiner: string): string => `${JOIN_DOMAIN}:${daoId}:${joiner}`
export const joinMessageBytes = (daoId: string, joiner: string): Uint8Array => utf8Encode(joinMessage(daoId, joiner))

/** A fresh 32-byte invite seed (the private half). */
export const generateInviteSeed = (): Uint8Array => randomBytes(32)

export function seedToSecret(seed: Uint8Array): string {
  if (seed.length !== 32) throw new Error("invite seed must be 32 bytes")
  return base64UrlEncode(seed)
}

/** Decodes the `#<secret>` fragment (43 base64url chars) back to the seed. */
export function secretToSeed(secret: string): Uint8Array {
  const s = secret.startsWith("#") ? secret.slice(1) : secret
  if (!/^[A-Za-z0-9_-]{43}$/.test(s)) throw new Error("invite secret must be 43 base64url chars")
  const seed = base64UrlDecode(s)
  if (seed.length !== 32) throw new Error("invite secret must decode to 32 bytes")
  return seed
}

/** "ed25519:<b58>" → "<b58>" (the `?i=` value). */
export function invitePkToParam(pk: PublicKeyStr | string): string {
  const b58 = pk.startsWith("ed25519:") ? pk.slice("ed25519:".length) : pk
  if (base58Decode(b58).length !== 32) throw new Error("invite public key must be 32 bytes")
  return b58
}

/** "<b58>" (from `?i=`) → "ed25519:<b58>", validated. */
export function invitePkFromParam(param: string): PublicKeyStr {
  const b58 = param.startsWith("ed25519:") ? param.slice("ed25519:".length) : param
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(b58) || base58Decode(b58).length !== 32) {
    throw new Error("invalid invite public key")
  }
  return `ed25519:${b58}`
}

export const publicKeyFromBytes = (pk: Uint8Array): PublicKeyStr => `ed25519:${base58Encode(pk)}`
export function publicKeyBytes(pk: PublicKeyStr | string): Uint8Array {
  const b = base58Decode(pk.startsWith("ed25519:") ? pk.slice(8) : pk)
  if (b.length !== 32) throw new Error("ed25519 public key must be 32 bytes")
  return b
}

/** `${origin}/j/${slug}?i=${pk_b58}#${secret}` (origin optional → a path). */
export function buildInviteLink(p: { origin?: string; slug: string; invitePk: PublicKeyStr; secret: string }): string {
  const origin = (p.origin ?? "").replace(/\/+$/, "")
  return `${origin}/j/${encodeURIComponent(p.slug)}?i=${invitePkToParam(p.invitePk)}#${p.secret}`
}

export interface ParsedInviteLink {
  slug: string
  /** null when `?i=` is missing or invalid (the landing falls back to "You're invited to {pot}"). */
  invitePk: PublicKeyStr | null
  /** null when the fragment is missing (`invite.incomplete`) or malformed. */
  secret: string | null
}

/** Parses a full URL or a path like "/j/lisbon-trip?i=…#…". Returns null when it isn't a /j/ link. */
export function parseInviteLink(url: string): ParsedInviteLink | null {
  let u: URL
  try {
    u = new URL(url, "https://pot.invalid")
  } catch {
    return null
  }
  const m = /^\/j\/([^/]+)\/?$/.exec(u.pathname)
  if (!m) return null
  let invitePk: PublicKeyStr | null = null
  const i = u.searchParams.get("i")
  if (i) {
    try {
      invitePk = invitePkFromParam(i)
    } catch {
      invitePk = null
    }
  }
  const frag = u.hash.replace(/^#/, "")
  let secret: string | null = null
  if (frag) {
    try {
      secretToSeed(frag)
      secret = frag
    } catch {
      secret = null
    }
  }
  return { slug: decodeURIComponent(m[1] as string), invitePk, secret }
}

/** The `signature` join arg format: standard padded base64 of exactly 64 bytes (88 chars). */
export function isJoinSignatureFormat(sig: string): boolean {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sig)) return false
  try {
    return base64Decode(sig).length === 64
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- WebCrypto Ed25519

/** PKCS#8 wrapper for a raw 32-byte Ed25519 seed (RFC 8410). */
const PKCS8_ED25519_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])

/** Copies into an ArrayBuffer-backed view (WebCrypto's BufferSource typing rejects SharedArrayBuffer-able views). */
const ab = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b)

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error("WebCrypto is not available")
  return s
}

/** Whether this runtime's WebCrypto supports Ed25519. */
export async function webCryptoEd25519Supported(): Promise<boolean> {
  try {
    const k = await subtle().importKey("raw", new Uint8Array(32).fill(1), { name: "Ed25519" }, false, ["verify"])
    return !!k
  } catch {
    return false
  }
}

export interface WebCryptoInviteKey {
  seed: Uint8Array
  publicKey: PublicKeyStr
  /** base64url secret for the link fragment */
  secret: string
  sign(message: Uint8Array): Promise<Uint8Array>
}

/** Imports an invite seed into WebCrypto and derives its public key (via a JWK export). */
export async function webCryptoInviteKey(seed: Uint8Array): Promise<WebCryptoInviteKey> {
  if (seed.length !== 32) throw new Error("invite seed must be 32 bytes")
  const priv = await subtle().importKey("pkcs8", ab(concatBytes(PKCS8_ED25519_PREFIX, seed)), { name: "Ed25519" }, true, ["sign"])
  const jwk = await subtle().exportKey("jwk", priv)
  if (!jwk.x) throw new Error("WebCrypto did not export the Ed25519 public key")
  const pk = base64UrlDecode(jwk.x)
  return {
    seed,
    publicKey: publicKeyFromBytes(pk),
    secret: seedToSecret(seed),
    sign: async (message) => new Uint8Array(await subtle().sign("Ed25519", priv, ab(message))),
  }
}

/** Signs the D-08 join message with WebCrypto → `{invitePk, signature}` ready for the `join` intent. */
export async function signJoinWebCrypto(seed: Uint8Array, daoId: string, joiner: string): Promise<{ invitePk: PublicKeyStr; signature: string }> {
  const key = await webCryptoInviteKey(seed)
  const sig = await key.sign(joinMessageBytes(daoId, joiner))
  return { invitePk: key.publicKey, signature: base64Encode(sig) }
}

/** Raw Ed25519 verification with WebCrypto. Returns false for malformed inputs. */
export async function ed25519VerifyWebCrypto(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) return false
  try {
    const k = await subtle().importKey("raw", ab(publicKey), { name: "Ed25519" }, false, ["verify"])
    return await subtle().verify("Ed25519", k, ab(signature), ab(message))
  } catch {
    return false
  }
}

/** Verifies a join signature exactly as the hub does (`env::ed25519_verify` over the message bytes). */
export async function verifyJoinWebCrypto(invitePk: PublicKeyStr | string, daoId: string, joiner: string, signatureB64: string): Promise<boolean> {
  let pk: Uint8Array
  let sig: Uint8Array
  try {
    pk = publicKeyBytes(invitePk)
    sig = base64Decode(signatureB64)
  } catch {
    return false
  }
  return ed25519VerifyWebCrypto(pk, joinMessageBytes(daoId, joiner), sig)
}

// ---------------------------------------------------------------- pay by link (hub 1.1.0)
// A link payout reuses the invite key shape: a fresh 32-byte ed25519 seed whose secret lives only
// in the link's #fragment; `request_spend(…, link: {claim_pk})` registers the public key.
//   link:     /c/<slug>/<request_id>#<secret>        (route owned by the frontend; helpers below)
//   message:  UTF-8 `pot-claim:v1:<hub_id>:<dao_id>:<request_id>:<receiver>`, raw ed25519
//   signature on the wire (claim_link arg): standard base64 WITH padding (88 chars), like join

export const CLAIM_DOMAIN = "pot-claim:v1"

/** `pot-claim:v1:<hub>:<dao>:<request_id>:<receiver>` (the hub id stops cross-hub replay). */
export const claimMessage = (hubId: string, daoId: string, requestId: number, receiver: string): string =>
  `${CLAIM_DOMAIN}:${hubId}:${daoId}:${requestId}:${receiver}`
export const claimMessageBytes = (hubId: string, daoId: string, requestId: number, receiver: string): Uint8Array =>
  utf8Encode(claimMessage(hubId, daoId, requestId, receiver))

/** `${origin}/c/${slug}/${requestId}#${secret}` (origin optional → a path). */
export function buildClaimLink(p: { origin?: string; slug: string; requestId: number; secret: string }): string {
  const origin = (p.origin ?? "").replace(/\/+$/, "")
  return `${origin}/c/${encodeURIComponent(p.slug)}/${p.requestId}#${p.secret}`
}

export interface ParsedClaimLink {
  slug: string
  requestId: number
  /** null when the fragment is missing or malformed */
  secret: string | null
}

/** Parses a full URL or a path like "/c/lisbon-trip/7#…". Returns null when it isn't a /c/ link. */
export function parseClaimLink(url: string): ParsedClaimLink | null {
  let u: URL
  try {
    u = new URL(url, "https://pot.invalid")
  } catch {
    return null
  }
  const m = /^\/c\/([^/]+)\/(0|[1-9][0-9]{0,9})\/?$/.exec(u.pathname)
  if (!m) return null
  const frag = u.hash.replace(/^#/, "")
  let secret: string | null = null
  if (frag) {
    try {
      secretToSeed(frag)
      secret = frag
    } catch {
      secret = null
    }
  }
  return { slug: decodeURIComponent(m[1] as string), requestId: Number(m[2]), secret }
}

/** Signs the claim message with WebCrypto → the `claim_link` signature (padded base64). */
export async function signClaimWebCrypto(seed: Uint8Array, hubId: string, daoId: string, requestId: number, receiver: string): Promise<string> {
  const key = await webCryptoInviteKey(seed)
  return base64Encode(await key.sign(claimMessageBytes(hubId, daoId, requestId, receiver)))
}

/** Verifies a claim signature exactly as the hub does. */
export async function verifyClaimWebCrypto(claimPk: PublicKeyStr | string, hubId: string, daoId: string, requestId: number, receiver: string, signatureB64: string): Promise<boolean> {
  let pk: Uint8Array
  let sig: Uint8Array
  try {
    pk = publicKeyBytes(claimPk)
    sig = base64Decode(signatureB64)
  } catch {
    return false
  }
  return ed25519VerifyWebCrypto(pk, claimMessageBytes(hubId, daoId, requestId, receiver), sig)
}
