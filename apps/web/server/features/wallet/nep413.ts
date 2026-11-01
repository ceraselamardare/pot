// NEP-413 signed messages (api-spec §4.4; kb/near-connect.md). The wallet signs
//   sha256( u32_le(2³¹ + 413) ‖ borsh(Payload{ message: string, nonce: [u8; 32], recipient: string, callbackUrl: Option<string> }) )
// with the account's ed25519 key. borsh: string = u32_le(len) ‖ utf8; Option = 0u8 (None) or 1u8 ‖ value.
// Pure and dependency-light, so the server, the e2e mock wallet and the tests share the exact byte layout.
import { sha256 } from "@noble/hashes/sha2.js"
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"

export const NEP413_TAG = 2 ** 31 + 413 // 2147484061
export const SIGN_IN_MESSAGE = "Sign in to Pot"

const u32le = (n: number) => {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, true)
  return b
}

function borshString(s: string): Uint8Array {
  const utf8 = new TextEncoder().encode(s)
  return concat(u32le(utf8.length), utf8)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export interface Nep413Payload {
  message: string
  nonce: Uint8Array
  recipient: string
  callbackUrl?: string | null
}

/** The exact bytes that get hashed (prefix + borsh payload). */
export function nep413Bytes(p: Nep413Payload): Uint8Array {
  if (p.nonce.length !== 32) throw new Error("nonce must be 32 bytes")
  const cb = p.callbackUrl == null ? new Uint8Array([0]) : concat(new Uint8Array([1]), borshString(p.callbackUrl))
  return concat(u32le(NEP413_TAG), borshString(p.message), p.nonce, borshString(p.recipient), cb)
}

export const nep413Hash = (p: Nep413Payload): Uint8Array => sha256(nep413Bytes(p))

/** Wallets return the signature as standard base64 (NEP-413); some return "ed25519:<base58>". */
export function decodeSignature(sig: string): Uint8Array | null {
  try {
    if (sig.startsWith("ed25519:")) return base58.decode(sig.slice(8))
    const b = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    return b
  } catch {
    return null
  }
}

export function parsePublicKey(pk: string): Uint8Array | null {
  if (!pk.startsWith("ed25519:")) return null
  try {
    const raw = base58.decode(pk.slice(8))
    return raw.length === 32 ? raw : null
  } catch {
    return null
  }
}

export function verifyNep413(p: Nep413Payload, signature: string, publicKey: string): boolean {
  const sig = decodeSignature(signature)
  const pk = parsePublicKey(publicKey)
  if (!sig || sig.length !== 64 || !pk) return false
  try {
    return ed25519.verify(sig, nep413Hash(p), pk)
  } catch {
    return false
  }
}

/** api-spec §2.1: 8-byte big-endian Unix ms ‖ 24 random bytes (5-minute window, single use). */
export function makeNonce(nowMs = Date.now(), rnd: Uint8Array = crypto.getRandomValues(new Uint8Array(24))): Uint8Array {
  const n = new Uint8Array(32)
  new DataView(n.buffer).setBigUint64(0, BigInt(nowMs))
  n.set(rnd.slice(0, 24), 8)
  return n
}

export const nonceTime = (nonce: Uint8Array): number => Number(new DataView(nonce.buffer, nonce.byteOffset, 8).getBigUint64(0))

export const toBase64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b))
export const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
