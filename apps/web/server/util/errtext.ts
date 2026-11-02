// errText: an error as one log-safe line (privacy audit 2026-11-02, notes/backend.md).
// Drizzle (≥ 0.44) wraps every failed query in DrizzleQueryError, whose message is "Failed query: <sql>\nparams:
// <values>": the values are what the person sent (a comment, a note, a receipt's items, a display name, an email).
// String(e) of such an error put them in console logs and error_log (kept 14 days). This keeps the SQL and the
// cause and drops the values. Postgres errors keep their code and message, minus a quoted input value
// ("invalid input syntax for type json: \"…\"").
type ErrLike = { query?: unknown; params?: unknown; cause?: unknown; message?: unknown; code?: unknown }

const scrubDb = (m: string) => m.replace(/(input syntax for type [a-z ]+|invalid input value for [a-z ]+): ".*"/gi, '$1: "…"')

function describe(e: unknown, depth: number): string {
  if (depth > 3) return "…"
  if (e && typeof e === "object") {
    const o = e as ErrLike
    if (typeof o.query === "string" && Array.isArray(o.params)) {
      const sqlText = o.query.replace(/\s+/g, " ").slice(0, 200)
      return `Failed query: ${sqlText} (${o.params.length} values hidden)${o.cause ? ` · ${describe(o.cause, depth + 1)}` : ""}`
    }
    if (typeof o.code === "string" && /^[0-9A-Z]{5}$/.test(o.code) && typeof o.message === "string") return `db ${o.code}: ${scrubDb(o.message)}`
  }
  return String(e)
}

/** A log-safe one-line description of `e` (no query values), cut at `max` characters. */
export function errText(e: unknown, max = 300): string {
  return describe(e, 0).slice(0, max)
}
