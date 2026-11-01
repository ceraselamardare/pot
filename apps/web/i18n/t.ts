// Typed t() over the flat en.json (frontend-architecture §9.1-9.2). Pure, so it runs in server and client
// components alike. Plurals use `key#one` / `key#other` picked by Intl.PluralRules('en-US') on `n`.
import en from "./en.json"
import type { Messages } from "./messages"

export type MessageKey = keyof Messages
export type MessageVars<K extends MessageKey> = Messages[K]
type Args<K extends MessageKey> = Messages[K] extends undefined ? [] : [Messages[K]]

const table = en as Record<string, string>
const plural = new Intl.PluralRules("en-US")

function lookup(key: string, vars: Record<string, unknown> | undefined): string {
  const direct = table[key]
  if (direct !== undefined) return direct
  const n = typeof vars?.n === "number" ? vars.n : 0
  return table[`${key}#${plural.select(n)}`] ?? table[`${key}#other`] ?? key
}

function interpolate(template: string, vars: Record<string, unknown> | undefined): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export function t<K extends MessageKey>(key: K, ...args: Args<K>): string {
  const vars = args[0] as Record<string, unknown> | undefined
  return interpolate(lookup(key, vars), vars)
}

/**
 * Several ux-spec strings carry a title and a body in one key, joined by " · " (preview.*, spend.vote_sent,
 * approve.expired, xc.step.*). The UI shows them on two lines; this splits at the first separator.
 */
export function tLines<K extends MessageKey>(key: K, ...args: Args<K>): [string, string | null] {
  const s = t(key, ...args)
  const i = s.indexOf(" · ")
  return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 3)]
}

/** document.title for a screen: "Lisbon Trip · Pot" (WCAG 2.4.2, frontend-architecture §2.7). */
export function pageTitle(name: string): string {
  return `${name} · ${table["app.name"]}`
}

/** For tests and the lint: every key in the table. */
export function hasKey(key: string): boolean {
  return key in table || `${key}#other` in table
}
