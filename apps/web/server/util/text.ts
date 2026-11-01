// The shared text validator (api-spec §2.1 PATCH /api/me, §2.5 notes; review-security L-4; test U-11).
// NFC, trimmed, length in code points, no control characters, no Unicode format characters (Cf) except
// ZWJ U+200D and VS16 U+FE0F (bidi overrides can't spoof names), reserved display names refused.

const RESERVED_NAMES = new Set(["pot", "near", "support", "admin", "team"])

export type TextCheck = { ok: true; value: string } | { ok: false; why: "length" | "control" | "format" | "reserved" }

export function cleanText(input: string, opts: { min: number; max: number }): TextCheck {
  const value = input.normalize("NFC").trim()
  const cps = [...value]
  if (cps.length < opts.min || cps.length > opts.max) return { ok: false, why: "length" }
  for (const ch of cps) {
    if (/\p{Cc}/u.test(ch)) return { ok: false, why: "control" }
    if (/\p{Cf}/u.test(ch) && ch !== "‍" && ch !== "️") return { ok: false, why: "format" }
    // line/paragraph separators are not Cc but render as breaks
    if (ch === " " || ch === " ") return { ok: false, why: "control" }
  }
  return { ok: true, value }
}

export function cleanDisplayName(input: string): TextCheck {
  const r = cleanText(input, { min: 1, max: 40 })
  if (r.ok && RESERVED_NAMES.has(r.value.toLowerCase())) return { ok: false, why: "reserved" }
  return r
}

export const cleanNote = (input: string) => cleanText(input, { min: 1, max: 140 })

/** Default display name for a new NEAR Auth user (api-spec §2.1): never derived from the email. */
export function defaultDisplayName(given?: unknown, name?: unknown): string {
  for (const c of [given, name]) {
    if (typeof c === "string") {
      const cut = [...c.normalize("NFC").trim()].slice(0, 40).join("")
      const r = cleanDisplayName(cut)
      if (r.ok) return r.value
    }
  }
  return "Friend"
}
