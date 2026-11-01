// The text rule for a comment on a request (isomorphic: the composer, the mock world and the API all use it).
// NFC, CRLF/CR → LF, tabs → a space, trailing spaces cut per line, at most one blank line in a row, trimmed;
// 1-280 code points; no control characters except the line break; no Unicode format characters (Cf) except
// ZWJ U+200D and VS16 U+FE0F. Never HTML-escaped here: React escapes on render, push bodies never carry it.

export type CommentCheck = { ok: true; value: string } | { ok: false; why: "length" | "control" | "format" }

/** Max length of a comment on a request, in code points (the composer counts the same way). */
export const COMMENT_MAX = 280

/**
 * A comment on a request: like cleanText, but line breaks are allowed. CRLF/CR → LF, tabs → a space, trailing
 * spaces cut on every line, at most one blank line in a row, then the whole text trimmed. Never HTML-escaped
 * here: React escapes on render, and push bodies never carry the text.
 */
export function cleanComment(input: string): CommentCheck {
  const value = input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const cps = [...value]
  if (cps.length < 1 || cps.length > COMMENT_MAX) return { ok: false, why: "length" }
  for (const ch of cps) {
    if (ch === "\n") continue
    if (/\p{Cc}/u.test(ch)) return { ok: false, why: "control" }
    if (/\p{Cf}/u.test(ch) && ch !== "\u200d" && ch !== "\ufe0f") return { ok: false, why: "format" }
    if (ch === "\u2028" || ch === "\u2029") return { ok: false, why: "control" }
  }
  return { ok: true, value }
}

/** Code points, as the server counts them (an emoji is one). */
export const commentLength = (s: string): number => [...s].length
