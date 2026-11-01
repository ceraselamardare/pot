// Cookies (api-spec §4.1). `__Host-pot_session` on https, `pot_session` on http://localhost:3000 where Secure
// and __Host- aren't usable. The DB stores only sha256(value). `pot_hint` is display/routing only: the server
// never reads it for authorization.
import "server-only"
import type { Config } from "../config"
import { b64url } from "../util/crypto"

export const SESSION_MAX_AGE = 30 * 24 * 3600
export const VISITOR_MAX_AGE = 7 * 24 * 3600

export const sessionCookieName = (cfg: Config) => (cfg.secureCookies ? "__Host-pot_session" : "pot_session")

function attrs(cfg: Config, httpOnly: boolean, maxAge: number): string {
  return [httpOnly ? "HttpOnly" : null, cfg.secureCookies ? "Secure" : null, "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`]
    .filter(Boolean)
    .join("; ")
}

export function sessionCookie(cfg: Config, value: string, maxAge = SESSION_MAX_AGE): string {
  return `${sessionCookieName(cfg)}=${value}; ${attrs(cfg, true, maxAge)}`
}

export interface SessionHint {
  accountId: string
  kind: "near-auth" | "wallet" | "demo" | "dev"
  displayName: string
  emailHint?: string
  persona?: string
  leasedPot?: string
  devicePublicKey?: string
}

export function hintCookie(cfg: Config, hint: SessionHint, maxAge = SESSION_MAX_AGE): string {
  const v = b64url(new TextEncoder().encode(JSON.stringify(hint)))
  return `pot_hint=${v}; ${attrs(cfg, false, maxAge)}`
}

export function visitorCookie(cfg: Config, value: string): string {
  return `pot_demo_visitor=${value}; ${attrs(cfg, true, VISITOR_MAX_AGE)}`
}

export function clearCookie(cfg: Config, name: string): string {
  return `${name}=; ${attrs(cfg, name !== "pot_hint", 0)}`
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

/** "m•••@gmail.com" (landing.signed_in_as) */
export function emailHint(email: string | null | undefined): string | undefined {
  if (!email) return undefined
  const [local = "", domain = ""] = email.split("@")
  if (!domain) return undefined
  return `${local.slice(0, 1)}•••@${domain}`
}
