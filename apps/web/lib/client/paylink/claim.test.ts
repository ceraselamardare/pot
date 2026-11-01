// The claim page's state machine (lib/client/paylink/claim.ts): every screen from (link, #secret, session, action).
import { describe, expect, it } from "vitest"
import { claimErrorOf, claimReducer, claimScreen, initialClaim, retryable, shouldPoll, type ClaimLinkVM, type ClaimPhase } from "./claim"

const link = (over: Partial<ClaimLinkVM> = {}): ClaimLinkVM => ({
  slug: "lisbon-trip",
  requestId: 7,
  potName: "Lisbon Trip",
  potEmoji: "🇵🇹",
  potCover: 0,
  amount: "84000000",
  category: "stay",
  requesterName: "Maya",
  status: "ready",
  expiresAt: 2_000_000_000_000,
  claimPk: "ed25519:x",
  receiver: null,
  doneAt: null,
  returnedOnExpiry: false,
  ...over,
})
const idle: ClaimPhase = initialClaim

describe("claimScreen", () => {
  it("loading, not found", () => {
    expect(claimScreen(undefined, "ok", null, idle)).toBe("loading")
    expect(claimScreen(null, "ok", null, idle)).toBe("not_found")
  })
  it("the #secret: checking → loading, missing / cut → incomplete, another link's → wrong", () => {
    expect(claimScreen(link(), "checking", null, idle)).toBe("loading")
    expect(claimScreen(link(), "missing", null, idle)).toBe("incomplete")
    expect(claimScreen(link(), "malformed", null, idle)).toBe("incomplete")
    expect(claimScreen(link(), "wrong", null, idle)).toBe("wrong")
  })
  it("a good link: ready (signed in or not), waiting for the group's OK, busy", () => {
    expect(claimScreen(link(), "ok", null, idle)).toBe("ready")
    expect(claimScreen(link(), "ok", "alex", idle)).toBe("ready")
    expect(claimScreen(link({ status: "waiting" }), "ok", null, idle)).toBe("waiting")
    expect(claimScreen(link({ status: "busy" }), "ok", null, idle)).toBe("busy")
  })
  it("what already happened beats the secret: claimed (by me = success), returned, expired, void", () => {
    expect(claimScreen(link({ status: "claimed", receiver: "alex" }), "missing", "alex", idle)).toBe("success")
    expect(claimScreen(link({ status: "claimed", receiver: "sam" }), "ok", "alex", idle)).toBe("claimed")
    expect(claimScreen(link({ status: "claimed", receiver: "sam" }), "ok", null, idle)).toBe("claimed")
    expect(claimScreen(link({ status: "claimed", receiver: "sam" }), "ok", undefined, idle)).toBe("loading")
    expect(claimScreen(link({ status: "returned" }), "missing", null, idle)).toBe("returned")
    expect(claimScreen(link({ status: "expired" }), "ok", null, idle)).toBe("expired")
    expect(claimScreen(link({ status: "void" }), "ok", null, idle)).toBe("void")
  })
  it("the action: sign in, claiming, success, errors (a refused claim shows the link's real state)", () => {
    expect(claimScreen(link(), "ok", null, { tag: "signin" })).toBe("signin")
    expect(claimScreen(link(), "ok", "alex", { tag: "claiming" })).toBe("claiming")
    expect(claimScreen(link({ status: "claimed", receiver: "alex" }), "ok", "alex", { tag: "success", amount: "1" })).toBe("success")
    expect(claimScreen(link(), "ok", "alex", { tag: "error", kind: "network" })).toBe("error")
    expect(claimScreen(link(), "ok", "alex", { tag: "error", kind: "failed" })).toBe("error")
    expect(claimScreen(link(), "ok", "alex", { tag: "error", kind: "claimed" })).toBe("claimed")
    expect(claimScreen(link(), "ok", "alex", { tag: "error", kind: "expired" })).toBe("expired")
    expect(claimScreen(link(), "ok", "alex", { tag: "error", kind: "wrong_secret" })).toBe("wrong")
    expect(claimScreen(link(), "ok", "alex", { tag: "error", kind: "not_funded" })).toBe("waiting")
  })
  it("polls while something can change by itself", () => {
    expect(shouldPoll("waiting")).toBe(true)
    expect(shouldPoll("busy")).toBe(true)
    expect(shouldPoll("claiming")).toBe(true)
    expect(shouldPoll("ready")).toBe(false)
    expect(shouldPoll("success")).toBe(false)
  })
})

describe("claimReducer", () => {
  it("signed out: Get → sign in → claiming → success", () => {
    let s = claimReducer(idle, { type: "TAP_GET", signedIn: false })
    expect(s).toEqual({ tag: "signin" })
    expect(claimReducer(s, { type: "CANCEL" })).toEqual({ tag: "idle" })
    s = claimReducer(s, { type: "SIGNED_IN" })
    expect(s).toEqual({ tag: "claiming" })
    s = claimReducer(s, { type: "CLAIM_OK", amount: "84000000" })
    expect(s).toEqual({ tag: "success", amount: "84000000" })
  })
  it("signed in: Get → claiming; an error offers Try again (retryable ones)", () => {
    let s = claimReducer(idle, { type: "TAP_GET", signedIn: true })
    expect(s).toEqual({ tag: "claiming" })
    s = claimReducer(s, { type: "CLAIM_ERR", kind: "network" })
    expect(s).toEqual({ tag: "error", kind: "network" })
    expect(retryable("network")).toBe(true)
    expect(retryable("failed")).toBe(true)
    expect(retryable("claimed")).toBe(false)
    expect(claimReducer(s, { type: "RETRY", signedIn: true })).toEqual({ tag: "claiming" })
    expect(claimReducer(s, { type: "RETRY", signedIn: false })).toEqual({ tag: "signin" })
  })
  it("ignores events out of order (a double tap, a late answer)", () => {
    const claiming: ClaimPhase = { tag: "claiming" }
    expect(claimReducer(claiming, { type: "TAP_GET", signedIn: true })).toBe(claiming)
    expect(claimReducer(idle, { type: "CLAIM_OK", amount: "1" })).toBe(idle)
    expect(claimReducer(idle, { type: "SIGNED_IN" })).toBe(idle)
  })
})

describe("claimErrorOf", () => {
  it("maps the hub's link errors", () => {
    expect(claimErrorOf("ERR_LINK_DONE")).toBe("claimed")
    expect(claimErrorOf("ERR_LINK_EXPIRED")).toBe("expired")
    expect(claimErrorOf("ERR_BAD_SIGNATURE")).toBe("wrong_secret")
    expect(claimErrorOf("ERR_LINK_NOT_FUNDED")).toBe("not_funded")
    expect(claimErrorOf("ERR_LINK_BUSY")).toBe("busy")
    expect(claimErrorOf("ERR_PAUSED")).toBe("failed")
    expect(claimErrorOf(null)).toBe("failed")
  })
})
