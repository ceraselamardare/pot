// Dependency-free byte encodings shared by the read client, invites and the sign module.
// base58 (NEAR keys), base64 with padding (Base64VecU8 args, signatures), base64url without
// padding (invite secrets), UTF-8. Works in browsers and in Node 22 (no Buffer).

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const B58_MAP: Record<string, number> = Object.fromEntries([...B58_ALPHABET].map((c, i) => [c, i]))

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits: number[] = []
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i] as number
    for (let j = 0; j < digits.length; j++) {
      carry += (digits[j] as number) << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = "1".repeat(zeros)
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i] as number]
  return out
}

export function base58Decode(s: string): Uint8Array {
  let zeros = 0
  while (zeros < s.length && s[zeros] === "1") zeros++
  const bytes: number[] = []
  for (let i = zeros; i < s.length; i++) {
    const v = B58_MAP[s[i] as string]
    if (v === undefined) throw new Error(`invalid base58 character ${JSON.stringify(s[i])}`)
    let carry = v
    for (let j = 0; j < bytes.length; j++) {
      carry += (bytes[j] as number) * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  const out = new Uint8Array(zeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) out[out.length - 1 - i] = bytes[i] as number
  return out
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const B64_MAP: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]))

/** Standard base64 with `=` padding (NEAR `Base64VecU8`). */
export function base64Encode(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "="
    out += i + 2 < bytes.length ? B64[n & 63] : "="
  }
  return out
}

/** Decodes standard or url-safe base64, with or without padding. Throws on bad input. */
export function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "")
  if (clean.length % 4 === 1) throw new Error("invalid base64 length")
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of clean) {
    const v = B64_MAP[ch]
    if (v === undefined) throw new Error(`invalid base64 character ${JSON.stringify(ch)}`)
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

/** base64url without padding (RFC 4648 §5): invite secrets, PoP signatures. */
export function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64UrlDecode(s: string): Uint8Array {
  if (/[+/=]/.test(s)) throw new Error("not base64url (no padding, url-safe alphabet)")
  return base64Decode(s)
}

const enc = new TextEncoder()
const dec = new TextDecoder("utf-8", { fatal: false })
export const utf8Encode = (s: string): Uint8Array => enc.encode(s)
export const utf8Decode = (b: Uint8Array): string => dec.decode(b)

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Cryptographically random bytes (WebCrypto; present in browsers and Node ≥ 19). */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  globalThis.crypto.getRandomValues(out)
  return out
}
