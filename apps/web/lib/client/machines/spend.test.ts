// U-WEB-01 (spend): the frontend-architecture §5.2/§5.3 tables as fixtures. The beats never show "Approved"
// before the relay said so, and "Checking Pot rules" lasts at least 1.2 s even when the answer is instant.
import { describe, expect, it } from "vitest"
import { initialSpend, isResult, spendReducer, type SpendEvent, type SpendOutcome, type SpendState } from "./spend"

const instant: SpendOutcome = { id: 12, path: "instant", payout: "sent" }
const failed: SpendOutcome = { id: 12, path: "instant", payout: "failed" }
const vote: SpendOutcome = { id: 13, path: "vote", payout: "pending" }
const run = (events: SpendEvent[], from: SpendState = initialSpend) => events.reduce(spendReducer, from)

describe("instant spend beats", () => {
  it("relay answers first: waits for the 1.2 s beat, then approved → sending → sent", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: instant }])
    expect(s1.tag).toBe("checking")
    const s2 = spendReducer(s1, { type: "MIN_ELAPSED" })
    expect(s2).toEqual({ tag: "approved", outcome: instant })
    const s3 = spendReducer(s2, { type: "APPROVED_SHOWN" })
    expect(s3.tag).toBe("sending")
    expect(spendReducer(s3, { type: "SENDING_SHOWN" })).toEqual({ tag: "sent", outcome: instant })
  })

  it("beat elapses first: approved only when the answer arrives", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "MIN_ELAPSED" }])
    expect(s1).toMatchObject({ tag: "checking", minElapsed: true })
    expect(spendReducer(s1, { type: "RESULT", outcome: instant }).tag).toBe("approved")
  })

  it("never jumps from checking to sent", () => {
    const s = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: instant }, { type: "SENDING_SHOWN" }, { type: "APPROVED_SHOWN" }])
    expect(s.tag).toBe("checking")
  })

  it("shows still-checking at 6 s and slow at 15 s", () => {
    const s = run([{ type: "SUBMIT", expected: "instant" }, { type: "STILL_CHECKING" }, { type: "SLOW" }])
    expect(s).toMatchObject({ tag: "checking", still: true, slow: true })
  })

  it("approved but the Pot is short → approvedNotSent (no sending beat)", () => {
    const s = run([{ type: "SUBMIT", expected: "instant" }, { type: "MIN_ELAPSED" }, { type: "RESULT", outcome: failed }, { type: "APPROVED_SHOWN" }])
    expect(s.tag).toBe("approvedNotSent")
  })

  it("a race over a limit turns it into a vote (spend.became_vote)", () => {
    const s = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: vote }])
    expect(s).toEqual({ tag: "becameVote", outcome: vote })
  })

  it("a relay error before approval goes back to the form with the error", () => {
    const s = run([{ type: "SUBMIT", expected: "instant" }, { type: "ERROR", key: "spend.error.relayer" }])
    expect(s).toEqual({ tag: "editing", error: "spend.error.relayer" })
    expect(isResult(s)).toBe(false)
  })
})

describe("vote request", () => {
  it("submitting → voteSent", () => {
    const s1 = run([{ type: "SUBMIT", expected: "vote" }])
    expect(s1.tag).toBe("submittingVote")
    expect(spendReducer(s1, { type: "RESULT", outcome: vote })).toEqual({ tag: "voteSent", outcome: vote })
  })
  it("error keeps the form", () => {
    expect(run([{ type: "SUBMIT", expected: "vote" }, { type: "ERROR", key: "spend.error.generic" }])).toEqual({
      tag: "editing",
      error: "spend.error.generic",
    })
  })
})

it("RESET returns to an empty form from anywhere", () => {
  const s = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: instant }, { type: "MIN_ELAPSED" }, { type: "RESET" }])
  expect(s).toEqual(initialSpend)
})

describe("two-phase payout (testnet: early answer, then the final one)", () => {
  const early: SpendOutcome = { id: 14, path: "instant", payout: "pending" }
  it("stays on Sending… until the payout is known to be sent", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: early }, { type: "MIN_ELAPSED" }, { type: "APPROVED_SHOWN" }, { type: "SENDING_SHOWN" }])
    expect(s1).toMatchObject({ tag: "sending", shown: true })
    expect(spendReducer(s1, { type: "PAYOUT", payout: "sent" })).toEqual({ tag: "sent", outcome: { ...early, payout: "sent" } })
  })
  it("a payout known before the beat ends goes straight to sent after it", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: early }, { type: "PAYOUT", payout: "sent" }, { type: "MIN_ELAPSED" }, { type: "APPROVED_SHOWN" }])
    expect(s1.tag).toBe("sending")
    expect(spendReducer(s1, { type: "SENDING_SHOWN" }).tag).toBe("sent")
  })
  it("a failed payout while sending → approvedNotSent", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: early }, { type: "MIN_ELAPSED" }, { type: "APPROVED_SHOWN" }])
    expect(spendReducer(s1, { type: "PAYOUT", payout: "failed" }).tag).toBe("approvedNotSent")
  })
})

describe("a later hub check refuses after the early approval", () => {
  const early: SpendOutcome = { id: 15, path: "instant", payout: "pending" }
  it("approved → refused: never a false Sent", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: early }, { type: "MIN_ELAPSED" }])
    expect(s1.tag).toBe("approved")
    expect(spendReducer(s1, { type: "PAYOUT", payout: "refused" }).tag).toBe("refused")
  })
  it("sending (shown) → refused", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: early }, { type: "MIN_ELAPSED" }, { type: "APPROVED_SHOWN" }, { type: "SENDING_SHOWN" }])
    const s2 = spendReducer(s1, { type: "PAYOUT", payout: "refused" })
    expect(s2.tag).toBe("refused")
    expect(spendReducer(s2, { type: "SENDING_SHOWN" }).tag).toBe("refused")
  })
  it("refused while still checking skips the approval beat", () => {
    const s1 = run([{ type: "SUBMIT", expected: "instant" }, { type: "RESULT", outcome: early }, { type: "PAYOUT", payout: "refused" }])
    expect(s1.tag).toBe("refused")
  })
})
