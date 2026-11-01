// Onboarding / join as a typed reducer (frontend-architecture §5.1, ux-spec §4.1-4.2, §6.1).
// The mock data source skips the NEAR Auth popup: TAP_JOIN goes straight to creatingSession. On testnet,
// F-14 inserts `authorizing` (popup pre-opened inside the tap) between the two.

export type JoinStage = 1 | 2
export type JoinErrorKey = "setup.error.relayer" | "setup.error.join" | "auth.popup_blocked" | "auth.failed"
export type InviteErrorKind = "invalid" | "expired" | "used" | "replaced" | "pot_closed"

export type JoinState =
  | { tag: "landing"; error: JoinErrorKey | null }
  | { tag: "authorizing" }
  | { tag: "creatingSession"; slow: boolean }
  | { tag: "joining"; slow: boolean }
  | { tag: "joined" }
  | { tag: "alreadyMember" }
  | { tag: "inviteError"; kind: InviteErrorKind }
  | { tag: "setupError"; key: "setup.error.relayer" }
  | { tag: "joinError"; key: "setup.error.join" }

export type JoinEvent =
  | { type: "TAP_JOIN"; signedIn: boolean; needsAuth: boolean }
  | { type: "AUTH_OK" }
  | { type: "AUTH_CANCEL" }
  | { type: "AUTH_ERR"; key: "auth.popup_blocked" | "auth.failed" }
  | { type: "SESSION_OK" }
  | { type: "SESSION_ERR" }
  | { type: "JOINED" }
  | { type: "ALREADY_MEMBER" }
  | { type: "INVITE_ERR"; kind: InviteErrorKind }
  | { type: "RELAY_ERR" }
  | { type: "SLOW" }
  | { type: "RETRY" }

export const initialJoin: JoinState = { tag: "landing", error: null }

export function joinReducer(s: JoinState, e: JoinEvent): JoinState {
  switch (s.tag) {
    case "landing":
      if (e.type === "TAP_JOIN") {
        if (e.signedIn) return { tag: "joining", slow: false }
        return e.needsAuth ? { tag: "authorizing" } : { tag: "creatingSession", slow: false }
      }
      return s
    case "authorizing":
      if (e.type === "AUTH_OK") return { tag: "creatingSession", slow: false }
      if (e.type === "AUTH_CANCEL") return { tag: "landing", error: null } // silent
      if (e.type === "AUTH_ERR") return { tag: "landing", error: e.key }
      return s
    case "creatingSession":
      if (e.type === "SESSION_OK") return { tag: "joining", slow: false }
      if (e.type === "SESSION_ERR") return { tag: "setupError", key: "setup.error.relayer" }
      if (e.type === "SLOW") return { ...s, slow: true }
      return s
    case "joining":
      if (e.type === "JOINED") return { tag: "joined" }
      if (e.type === "ALREADY_MEMBER") return { tag: "alreadyMember" }
      if (e.type === "INVITE_ERR") return { tag: "inviteError", kind: e.kind }
      if (e.type === "RELAY_ERR") return { tag: "joinError", key: "setup.error.join" }
      if (e.type === "SLOW") return { ...s, slow: true }
      return s
    case "setupError":
      return e.type === "RETRY" ? { tag: "creatingSession", slow: false } : s
    case "joinError":
      return e.type === "RETRY" ? { tag: "joining", slow: false } : s
    default:
      return s
  }
}

/** Which ProgressSteps step is current (1 = account, 2 = joining, 3 = done). */
export function joinStep(s: JoinState): 1 | 2 | 3 | null {
  if (s.tag === "creatingSession" || s.tag === "setupError") return 1
  if (s.tag === "joining" || s.tag === "joinError") return 2
  if (s.tag === "joined") return 3
  return null
}
