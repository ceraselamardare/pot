// U-WEB-01 (join): frontend-architecture §5.1 as a table.
import { describe, expect, it } from "vitest"
import { initialJoin, joinReducer, joinStep, type JoinEvent, type JoinState } from "./join"

const run = (events: JoinEvent[], from: JoinState = initialJoin) => events.reduce(joinReducer, from)

describe("join machine", () => {
  it("new person, no popup (mock / device key): landing → session → joining → joined", () => {
    const steps: [JoinEvent, JoinState["tag"], ReturnType<typeof joinStep>][] = [
      [{ type: "TAP_JOIN", signedIn: false, needsAuth: false }, "creatingSession", 1],
      [{ type: "SESSION_OK" }, "joining", 2],
      [{ type: "JOINED" }, "joined", 3],
    ]
    let s: JoinState = initialJoin
    for (const [e, tag, step] of steps) {
      s = joinReducer(s, e)
      expect(s.tag).toBe(tag)
      expect(joinStep(s)).toBe(step)
    }
  })

  it("with NEAR Auth: authorizing first; cancel is silent, a blocked popup says so", () => {
    expect(run([{ type: "TAP_JOIN", signedIn: false, needsAuth: true }]).tag).toBe("authorizing")
    expect(run([{ type: "TAP_JOIN", signedIn: false, needsAuth: true }, { type: "AUTH_CANCEL" }])).toEqual({ tag: "landing", error: null })
    expect(run([{ type: "TAP_JOIN", signedIn: false, needsAuth: true }, { type: "AUTH_ERR", key: "auth.popup_blocked" }])).toEqual({
      tag: "landing",
      error: "auth.popup_blocked",
    })
    expect(run([{ type: "TAP_JOIN", signedIn: false, needsAuth: true }, { type: "AUTH_OK" }]).tag).toBe("creatingSession")
  })

  it("signed in already: one tap straight to joining (2 taps total)", () => {
    expect(run([{ type: "TAP_JOIN", signedIn: true, needsAuth: true }]).tag).toBe("joining")
  })

  it("already a member and invite errors", () => {
    const joining = run([{ type: "TAP_JOIN", signedIn: true, needsAuth: false }])
    expect(joinReducer(joining, { type: "ALREADY_MEMBER" }).tag).toBe("alreadyMember")
    expect(joinReducer(joining, { type: "INVITE_ERR", kind: "expired" })).toEqual({ tag: "inviteError", kind: "expired" })
  })

  it("errors retry idempotently into the step that failed", () => {
    const setupErr = run([{ type: "TAP_JOIN", signedIn: false, needsAuth: false }, { type: "SESSION_ERR" }])
    expect(setupErr).toEqual({ tag: "setupError", key: "setup.error.relayer" })
    expect(joinReducer(setupErr, { type: "RETRY" }).tag).toBe("creatingSession")
    const joinErr = run([{ type: "TAP_JOIN", signedIn: true, needsAuth: false }, { type: "RELAY_ERR" }])
    expect(joinErr).toEqual({ tag: "joinError", key: "setup.error.join" })
    expect(joinReducer(joinErr, { type: "RETRY" }).tag).toBe("joining")
  })

  it("marks slow progress at 10 s", () => {
    expect(run([{ type: "TAP_JOIN", signedIn: false, needsAuth: false }, { type: "SLOW" }])).toEqual({ tag: "creatingSession", slow: true })
  })

  it("ignores events that don't belong to the state", () => {
    expect(run([{ type: "JOINED" }])).toBe(initialJoin)
  })
})
