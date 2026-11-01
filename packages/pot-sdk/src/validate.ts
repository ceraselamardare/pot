// Client-side validators that mirror the hub's (contracts/pot-hub/src/lib.rs valid_slug,
// valid_name, valid_emoji, valid_request_ref) and api-spec text rules (U-11). The chain and the
// server stay authoritative; these give instant feedback and keep requests from failing late.

import { RESERVED_SLUGS } from "./types/hub.ts"
import { randomBytes } from "./encoding.ts"

/** ^[a-z0-9]+(-[a-z0-9]+)*$, 2-32 chars (contracts-spec §3.2). */
export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 32 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}
export const isReservedSlug = (slug: string): boolean => RESERVED_SLUGS.includes(slug)

/** The hub's `ERR_SLUG_*` checks, in its order, plus the ≤ 64-char full id rule. */
export function slugError(slug: string, hubId: string): "ERR_SLUG_INVALID" | "ERR_SLUG_RESERVED" | null {
  if (!isValidSlug(slug) || `${slug}.${hubId}`.length > 64) return "ERR_SLUG_INVALID"
  if (isReservedSlug(slug)) return "ERR_SLUG_RESERVED"
  return null
}

/** Unicode Cf (format) characters, as the hub's is_format_char. ZWJ / VS16 are handled by callers. */
export function isFormatChar(cp: number): boolean {
  return (
    cp === 0x00ad ||
    (cp >= 0x0600 && cp <= 0x0605) ||
    cp === 0x061c ||
    cp === 0x06dd ||
    cp === 0x070f ||
    (cp >= 0x0890 && cp <= 0x0891) ||
    cp === 0x08e2 ||
    cp === 0x180e ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    (cp >= 0x2066 && cp <= 0x206f) ||
    cp === 0xfeff ||
    (cp >= 0xfff9 && cp <= 0xfffb) ||
    cp === 0x110bd ||
    cp === 0x110cd ||
    (cp >= 0x13430 && cp <= 0x1343f) ||
    (cp >= 0x1bca0 && cp <= 0x1bca3) ||
    (cp >= 0x1d173 && cp <= 0x1d17a) ||
    cp === 0xe0001 ||
    (cp >= 0xe0020 && cp <= 0xe007f)
  )
}

const isControl = (cp: number): boolean => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)

/** True when the text has a control character or a Cf other than ZWJ (U+200D). VS16 is Mn, allowed. */
export function hasForbiddenChars(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number
    if (isControl(cp) || (isFormatChar(cp) && cp !== 0x200d)) return true
  }
  return false
}

const codePoints = (s: string): number => [...s].length

/** Pot name (hub ERR_NAME_INVALID: 1-48 chars, no control/Cf). The UI rule is 2-40 (api-spec R2). */
export function isValidPotName(name: string, opts: { ui?: boolean } = {}): boolean {
  const n = codePoints(name)
  const [min, max] = opts.ui ? [2, 40] : [1, 48]
  return n >= min && n <= max && !hasForbiddenChars(name) && (!opts.ui || name.trim() === name)
}

/** Cover emoji (hub ERR_EMOJI_INVALID): 1-16 UTF-8 bytes, no ASCII byte, no control/Cf. */
export function isValidEmoji(e: string): boolean {
  const bytes = new TextEncoder().encode(e)
  return bytes.length >= 1 && bytes.length <= 16 && !bytes.some((b) => b < 0x80) && !hasForbiddenChars(e)
}

/** The hub's request_ref rule: ^[a-z0-9]{8,32}$. */
export const isValidRequestRef = (r: string): boolean => /^[a-z0-9]{8,32}$/.test(r)

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"
/** api-spec OpKey: 16 chars of lowercase Crockford base32. */
export const isOpKey = (s: string): boolean => /^[0-9a-hjkmnp-tv-z]{16}$/.test(s)

/** A fresh OpKey (80 random bits). Also a valid hub request_ref. */
export function newOpKey(): string {
  const b = randomBytes(10)
  let bits = 0
  let acc = 0
  let out = ""
  for (const byte of b) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += CROCKFORD[(acc >> bits) & 31]
    }
  }
  return out
}

// A spend's request_ref (the hub keeps it on the request, in the DAO proposal's description and in the
// spend_requested event): its OpKey, optionally followed by the first RECEIPT_FP_HEX hex chars of the SHA-256 of the
// saved receipt's canonical JSON (web lib/receipt-saved.ts). 16 + 16 = 32 = the hub's maximum, so no contract change.
/** Hex chars of a receipt fingerprint carried in a request_ref (64 bits). */
export const RECEIPT_FP_HEX = 16
const SPEND_REF_RE = /^[0-9a-hjkmnp-tv-z]{16}(?:[0-9a-f]{16})?$/
/** An OpKey, or an OpKey + a 16-hex receipt fingerprint (32 chars). */
export const isSpendRef = (s: string): boolean => SPEND_REF_RE.test(s)
/** The request_ref for a spend: `opKey`, plus the receipt fingerprint's first 16 hex chars when one is attached. */
export function spendRef(opKey: string, fingerprint?: string | null): string {
  if (!isOpKey(opKey)) throw new Error("spendRef: not an OpKey")
  if (!fingerprint) return opKey
  const fp = fingerprint.slice(0, RECEIPT_FP_HEX)
  if (!/^[0-9a-f]{16}$/.test(fp)) throw new Error("spendRef: fingerprint must be lowercase hex (≥ 16 chars)")
  return opKey + fp
}
/** The OpKey part of a request_ref (the relay's idempotencyKey). */
export const opKeyOfRef = (ref: string): string => ref.slice(0, 16)
/** The receipt fingerprint a request_ref carries (16 hex chars), or null. */
export const receiptFingerprintOfRef = (ref: string | null | undefined): string | null =>
  !!ref && ref.length === 32 && SPEND_REF_RE.test(ref) ? ref.slice(16) : null

const RESERVED_DISPLAY_NAMES = ["pot", "near", "support", "admin", "team"]

/** Display names (api-spec §2.1 PATCH /api/me): NFC, trimmed, 1-40 code points, no control/Cf, not reserved. */
export function displayNameError(name: string): "empty" | "too_long" | "bad_chars" | "reserved" | null {
  const n = name.normalize("NFC").trim()
  if (codePoints(n) === 0) return "empty"
  if (codePoints(n) > 40) return "too_long"
  if (hasForbiddenChars(n)) return "bad_chars"
  if (RESERVED_DISPLAY_NAMES.includes(n.toLowerCase())) return "reserved"
  return null
}

/** Notes (memo, decline reason): 1-140 code points after NFC + trim, no control/Cf. */
export function noteTextError(text: string): "empty" | "too_long" | "bad_chars" | null {
  const t = text.normalize("NFC").trim()
  if (codePoints(t) === 0) return "empty"
  if (codePoints(t) > 140) return "too_long"
  if (hasForbiddenChars(t)) return "bad_chars"
  return null
}
