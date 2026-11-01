// Small crypto and encoding helpers (Node runtime only).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"
import { ulid } from "ulid"

export const sha256 = (data: Uint8Array | string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(data).digest())
export const sha256Hex = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex")
export const hmac = (key: string, data: Uint8Array | string): Uint8Array =>
  new Uint8Array(createHmac("sha256", key).update(data).digest())
export const hmacHex = (key: string, data: Uint8Array | string): string =>
  createHmac("sha256", key).update(data).digest("hex")

export const b64url = (b: Uint8Array): string => Buffer.from(b).toString("base64url")
export const fromB64url = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64url"))
export const b64 = (b: Uint8Array): string => Buffer.from(b).toString("base64")
export const fromB64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"))
export const bs58 = base58

export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

export const random = (n: number): Uint8Array => new Uint8Array(randomBytes(n))

/** Lowercase Crockford base32 (no i, l, o, u): the OpKey and account-suffix alphabet. */
export const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"
export function crockford(n: number): string {
  const bytes = random(n)
  let s = ""
  for (const b of bytes) s += CROCKFORD[b & 31]
  return s
}

export const newRequestId = () => `req_${ulid()}`
export const newRelayId = () => `rl_${ulid()}`

/** "ed25519:<base58 32 bytes>" → 32 raw bytes, or null. */
export function parseEd25519PublicKey(pk: string): Uint8Array | null {
  if (!pk.startsWith("ed25519:")) return null
  try {
    const raw = bs58.decode(pk.slice(8))
    return raw.length === 32 ? raw : null
  } catch {
    return null
  }
}
export const ed25519PublicKeyString = (raw: Uint8Array) => `ed25519:${bs58.encode(raw)}`

export function ed25519Verify(sig: Uint8Array, msg: Uint8Array, pk: Uint8Array): boolean {
  try {
    return sig.length === 64 && ed25519.verify(sig, msg, pk)
  } catch {
    return false
  }
}

export { ed25519 }
