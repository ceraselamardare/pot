// Spend flow as a typed reducer (frontend-architecture §5.2, §5.3; ux-spec §4.9, §6.3).
// The instant path is "the button becomes the answer":
//   checking (≥ 1200 ms, typing dots) → approved (≥ 600 ms, the one burst) → sending (≥ 400 ms) → sent.
// "Approved" never shows before the relay said so: the relay's early answer (api-spec §3.4) carries the approval,
// and "Sent" waits for the final payout (PAYOUT, from GET /api/relay/[id]); the mock answers both at once.
// Timers live in the hook (useSpendMachine); this file is pure so the tables in spend.test.ts can drive it.

export const MIN_CHECKING_MS = 1200
export const APPROVED_MS = 600
export const SENDING_MS = 400
export const STILL_CHECKING_MS = 6000
export const SLOW_MS = 15000

export type SpendErrorKey = "spend.error.relayer" | "spend.error.generic"

export interface SpendOutcome {
  /** the request id (proposal id on testnet) */
  id: number
  path: "instant" | "vote"
  /** refused: the early answer said approved, a later hub check refused it (final REFUSED_*): nothing moved */
  payout: "sent" | "failed" | "pending" | "refused"
}

export type SpendState =
  | { tag: "editing"; error: SpendErrorKey | null }
  | { tag: "checking"; minElapsed: boolean; outcome: SpendOutcome | null; still: boolean; slow: boolean }
  | { tag: "submittingVote" }
  | { tag: "approved"; outcome: SpendOutcome }
  /** `shown`: the 400 ms "Sending…" beat has played; waiting for the final payout (two-phase answer) */
  | { tag: "sending"; outcome: SpendOutcome; shown?: boolean }
  | { tag: "sent"; outcome: SpendOutcome }
  | { tag: "approvedNotSent"; outcome: SpendOutcome }
  | { tag: "voteSent"; outcome: SpendOutcome }
  | { tag: "becameVote"; outcome: SpendOutcome }
  /** the final answer took back the early "approved": revert, say nothing left the Pot */
  | { tag: "refused"; outcome: SpendOutcome }

export type SpendEvent =
  | { type: "SUBMIT"; expected: "instant" | "vote" }
  | { type: "RESULT"; outcome: SpendOutcome }
  | { type: "ERROR"; key: SpendErrorKey }
  | { type: "MIN_ELAPSED" }
  | { type: "APPROVED_SHOWN" }
  | { type: "SENDING_SHOWN" }
  /** the final payout of an instant spend (api-spec §3.4 two-phase answer: GET /api/relay/[id] → final) */
  | { type: "PAYOUT"; payout: SpendOutcome["payout"] }
  | { type: "STILL_CHECKING" }
  | { type: "SLOW" }
  | { type: "RESET" }

export const initialSpend: SpendState = { tag: "editing", error: null }

/** Where a known instant outcome goes after "approved" has shown for 600 ms. */
function afterApproved(o: SpendOutcome): SpendState {
  if (o.payout === "refused") return { tag: "refused", outcome: o }
  return o.payout === "failed" ? { tag: "approvedNotSent", outcome: o } : { tag: "sending", outcome: o }
}

/** A result that arrives while checking: instant waits for the 1.2 s beat; a vote goes straight on. */
function resolveChecking(s: Extract<SpendState, { tag: "checking" }>, o: SpendOutcome): SpendState {
  if (o.path === "vote") return { tag: "becameVote", outcome: o }
  if (!s.minElapsed) return { ...s, outcome: o }
  return { tag: "approved", outcome: o }
}

export function spendReducer(s: SpendState, e: SpendEvent): SpendState {
  if (e.type === "RESET") return initialSpend
  switch (s.tag) {
    case "editing":
      if (e.type === "SUBMIT")
        return e.expected === "instant"
          ? { tag: "checking", minElapsed: false, outcome: null, still: false, slow: false }
          : { tag: "submittingVote" }
      return s
    case "checking":
      if (e.type === "RESULT") return resolveChecking(s, e.outcome)
      if (e.type === "PAYOUT" && e.payout === "refused" && s.outcome) return { tag: "refused", outcome: { ...s.outcome, payout: "refused" } }
      if (e.type === "PAYOUT") return s.outcome ? { ...s, outcome: { ...s.outcome, payout: e.payout } } : s
      if (e.type === "MIN_ELAPSED") return s.outcome ? { tag: "approved", outcome: s.outcome } : { ...s, minElapsed: true }
      if (e.type === "STILL_CHECKING") return { ...s, still: true }
      if (e.type === "SLOW") return { ...s, slow: true }
      if (e.type === "ERROR") return { tag: "editing", error: e.key } // values are kept by the sheet
      return s
    case "submittingVote":
      if (e.type === "RESULT")
        return e.outcome.path === "vote" ? { tag: "voteSent", outcome: e.outcome } : { tag: "approved", outcome: e.outcome }
      if (e.type === "ERROR") return { tag: "editing", error: e.key }
      return s
    case "approved":
      if (e.type === "APPROVED_SHOWN") return afterApproved(s.outcome)
      if (e.type === "PAYOUT" && e.payout === "refused") return { tag: "refused", outcome: { ...s.outcome, payout: "refused" } }
      if (e.type === "PAYOUT") return { ...s, outcome: { ...s.outcome, payout: e.payout } }
      return s
    case "sending": {
      const o = e.type === "PAYOUT" ? { ...s.outcome, payout: e.payout } : s.outcome
      const shown = s.shown || e.type === "SENDING_SHOWN"
      if (e.type !== "SENDING_SHOWN" && e.type !== "PAYOUT") return s
      if (o.payout === "refused") return { tag: "refused", outcome: o }
      if (o.payout === "failed") return { tag: "approvedNotSent", outcome: o }
      // "Sent" only once the payout is known to be sent; until then "Sending…" stays (spend.slow covers long waits)
      if (shown && o.payout === "sent") return { tag: "sent", outcome: o }
      return { tag: "sending", outcome: o, shown }
    }
    default:
      return s
  }
}

/** True while the sheet shows the result card instead of the form. */
export const isResult = (s: SpendState) => s.tag !== "editing" && s.tag !== "submittingVote"
