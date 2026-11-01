// Pay anyone by link (hub 1.1.0, notes/contracts-wave4.md D4-4…D4-6): the pure parts, shared by the mock world,
// the live view models, the claim page and the server.
//  - link URL: /c/<slug>/<request id>#<secret>; the secret (32-byte ed25519 seed, base64url, 43 chars) lives only in
//    the #fragment and on the requester's device. Built with @pot/sdk buildClaimLink / parseClaimLink.
//  - claim message: `pot-claim:v1:<hub>:<pot>:<request id>:<receiver>` (@pot/sdk claimMessage, the hub's exact bytes).
//  - status: the hub's link status + the request's status + the link's date → what a person sees (LinkStatusVM).
// No I/O, no React: unit-tested in link.test.ts.
import { buildClaimLink, parseClaimLink, WAVE4_LIMITS } from "@pot/sdk"
import type { LinkStatusVM, RequestStatusVM } from "../mock/types"

/** The hub's raw link status (contracts LinkStatus, @pot/sdk RawLinkStatus). */
export type HubLinkStatus = "awaiting_funds" | "funded" | "claiming" | "claimed" | "returning" | "returned" | "void"

/** A new link lasts 14 days (the hub's default; the requester can cancel it any time before it's claimed). */
export const LINK_TTL_MS = WAVE4_LIMITS.defaultLinkTtlMs
/** The label is a few words ("Casa Lisboa host"): kept off-chain with the request, like a memo. */
export const LABEL_MAX = 40
/** The mock's stand-in receiver for a link request (the hub's escrow on testnet). */
export const LINK_RECEIVER = "@link"

export const SECRET_RE = /^[A-Za-z0-9_-]{43}$/

/** When a link made now stops working. */
export const linkExpiry = (now: number, ttl: number = LINK_TTL_MS): number => now + ttl

/** `${origin}/c/<slug>/<id>#<secret>` */
export function claimUrl(origin: string, slug: string, requestId: number, secret: string): string {
  return buildClaimLink({ origin, slug, requestId, secret })
}

/** The secret from a claim page's #fragment: the secret, "missing" (no fragment) or "malformed". */
export function secretFromHash(hash: string): { secret: string } | { error: "missing" | "malformed" } {
  const h = hash.startsWith("#") ? hash.slice(1) : hash
  if (!h) return { error: "missing" }
  return SECRET_RE.test(h) ? { secret: h } : { error: "malformed" }
}

/** Parse a whole claim link (the share card's own check, and the tests'). */
export const parseClaimUrl = parseClaimLink

/**
 * What a person sees, from the hub's link status, the request's status and the date:
 *  awaiting_funds: the request is still being decided (waiting), or it was declined / expired (void);
 *    approved but the money didn't reach the link yet (a payout retry) also reads "waiting".
 *  funded: ready until the date, then expired (the money goes back to the Pot: the requester, anyone, or our daily job).
 */
export function linkStatusOf(hub: HubLinkStatus, request: RequestStatusVM, expiresAt: number, now: number): LinkStatusVM {
  switch (hub) {
    case "awaiting_funds":
      return request === "declined" || request === "expired" ? "void" : "waiting"
    case "funded":
      return now >= expiresAt ? "expired" : "ready"
    case "claiming":
    case "returning":
      return "busy"
    case "claimed":
      return "claimed"
    case "returned":
      return "returned"
    case "void":
      return "void"
  }
}

/** The link's label, cleaned the way the server cleans notes (NFC, trimmed, one line, ≤ 40 code points); null when empty. */
export function cleanLabel(input: string): string | null {
  const v = input
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!v) return null
  return [...v].slice(0, LABEL_MAX).join("")
}

/** Whether the money of this link is out of the Pot right now (paid to the link, claimed or on its way back). */
export const moneyLeftPot = (s: LinkStatusVM): boolean => s === "ready" || s === "busy" || s === "claimed" || s === "expired"

/** Whether the requester can still cancel it (the money goes back to the Pot). */
export const canCancel = (s: LinkStatusVM): boolean => s === "ready" || s === "expired"

/**
 * Links the daily job sends back (cron): the hub lets anyone return a link once its date has passed, when it is
 * funded, or approved-but-never-funded (the escrow payment bounced; the money never left the Pot). Oldest first,
 * at most `max` per run.
 */
export function selectReclaimable<T extends { linkStatus: HubLinkStatus; requestStatus: string; expiresAtMs: number }>(
  links: readonly T[],
  now: number,
  max: number,
): T[] {
  return links
    .filter((l) => now >= l.expiresAtMs && (l.linkStatus === "funded" || (l.linkStatus === "awaiting_funds" && l.requestStatus === "approved")))
    .sort((a, b) => a.expiresAtMs - b.expiresAtMs)
    .slice(0, Math.max(0, max))
}
