// The claim page (/c/<slug>/<id>#<secret>) as a pure state machine: what the link is (get_link / the mock world),
// whether this browser holds its secret, who is signed in, and what the person did → one screen. Pure, so
// claim.test.ts drives every case; ClaimFlow.tsx only renders it and runs the effects.
import type { Category, LinkStatusVM } from "../mock/types"

/** What the claim page knows about a link (no secret, no account ids except the claimer check). */
export interface ClaimLinkVM {
  slug: string
  requestId: number
  potName: string
  potEmoji: string
  potCover: number
  /** micro-dollars as a decimal string (crosses the RSC boundary) */
  amount: string
  category: Category
  /** the requester's display name (null when we don't know one) */
  requesterName: string | null
  status: LinkStatusVM
  expiresAt: number
  /** the link key's public half (public on chain): the page checks the #secret against it before anything else */
  claimPk: string
  /** who claimed it (an id: persona or account); compared with the signed-in person, never shown */
  receiver: string | null
  doneAt: number | null
  returnedOnExpiry: boolean
}

/** The #secret check: matches the link's key (ok), no fragment, not a secret, or another link's secret. */
export type SecretCheck = "checking" | "ok" | "missing" | "malformed" | "wrong"

export type ClaimErrorKind = "claimed" | "expired" | "wrong_secret" | "not_funded" | "busy" | "failed" | "network" | "returned"

export type ClaimPhase =
  | { tag: "idle" }
  | { tag: "signin" }
  | { tag: "claiming" }
  | { tag: "success"; amount: string }
  | { tag: "error"; kind: ClaimErrorKind }

export type ClaimEvent =
  | { type: "TAP_GET"; signedIn: boolean }
  | { type: "SIGNED_IN" }
  | { type: "CANCEL" }
  | { type: "CLAIM_OK"; amount: string }
  | { type: "CLAIM_ERR"; kind: ClaimErrorKind }
  | { type: "RETRY"; signedIn: boolean }

export const initialClaim: ClaimPhase = { tag: "idle" }

export function claimReducer(s: ClaimPhase, e: ClaimEvent): ClaimPhase {
  switch (e.type) {
    case "TAP_GET":
      return s.tag === "idle" ? (e.signedIn ? { tag: "claiming" } : { tag: "signin" }) : s
    case "SIGNED_IN":
      return s.tag === "signin" ? { tag: "claiming" } : s
    case "CANCEL":
      return s.tag === "signin" ? { tag: "idle" } : s
    case "CLAIM_OK":
      return s.tag === "claiming" ? { tag: "success", amount: e.amount } : s
    case "CLAIM_ERR":
      return s.tag === "claiming" ? { tag: "error", kind: e.kind } : s
    case "RETRY":
      return s.tag === "error" ? (e.signedIn ? { tag: "claiming" } : { tag: "signin" }) : s
  }
}

/** Errors that are worth another tap (the link may still be claimable). */
export const retryable = (k: ClaimErrorKind): boolean => k === "failed" || k === "network" || k === "busy"

export type ClaimScreen =
  | "loading"
  | "not_found"
  | "incomplete"
  | "wrong"
  | "waiting"
  | "ready"
  | "signin"
  | "claiming"
  | "success"
  | "claimed"
  | "returned"
  | "expired"
  | "void"
  | "busy"
  | "error"

/**
 * One screen from everything the page knows. `me`: undefined while the session loads, null when signed out.
 * Order: what already happened to the link (claimed / returned / void) beats the secret, so a claimer who reloads
 * (the fragment is gone) still sees "$84 is yours".
 */
export function claimScreen(link: ClaimLinkVM | null | undefined, secret: SecretCheck, me: string | null | undefined, phase: ClaimPhase): ClaimScreen {
  if (phase.tag === "success") return "success"
  if (link === undefined) return "loading"
  if (link === null) return "not_found"
  if (link.status === "claimed") return me && link.receiver === me ? "success" : me === undefined ? "loading" : "claimed"
  if (link.status === "returned") return "returned"
  if (link.status === "void") return "void"
  if (link.status === "expired") return "expired"
  if (phase.tag === "claiming") return "claiming"
  if (secret === "checking") return "loading"
  if (secret === "missing" || secret === "malformed") return "incomplete"
  if (secret === "wrong") return "wrong"
  if (link.status === "waiting") return "waiting"
  if (link.status === "busy") return "busy"
  if (phase.tag === "error") return ERROR_SCREEN[phase.kind] ?? "error"
  if (phase.tag === "signin") return "signin"
  return "ready"
}

/** A claim refused for a reason the page already has a screen for (the next read of the link agrees). */
const ERROR_SCREEN: Partial<Record<ClaimErrorKind, ClaimScreen>> = {
  claimed: "claimed",
  expired: "expired",
  returned: "returned",
  wrong_secret: "wrong",
  not_funded: "waiting",
}

/** The page polls the link while something can still change by itself (the group's OK, a claim in flight). */
export const shouldPoll = (screen: ClaimScreen): boolean => screen === "waiting" || screen === "busy" || screen === "claiming" || screen === "loading"

/** Map a claim's hub error code (or relay reason) to what the page says. */
export function claimErrorOf(code: string | null | undefined): ClaimErrorKind {
  switch (code) {
    case "ERR_LINK_DONE":
      return "claimed"
    case "ERR_LINK_EXPIRED":
      return "expired"
    case "ERR_BAD_SIGNATURE":
      return "wrong_secret"
    case "ERR_LINK_NOT_FUNDED":
      return "not_funded"
    case "ERR_LINK_BUSY":
      return "busy"
    default:
      return "failed"
  }
}
