// U-WEB-03 (UI part): pending ops: "Sending…" at once, "Sent" for 2 s, revert-with-toast on failure, Undo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dollars } from "../money"
import { createOpsStore, newOpId, opsReducer, pendingIn, type PendingOp } from "./store"

const op = (patch: Partial<PendingOp> = {}): PendingOp => ({
  id: "A",
  kind: "add",
  pot: "lisbon-trip",
  actor: "leo",
  amount: dollars(150),
  status: "relaying",
  createdAt: 0,
  ...patch,
})

describe("opsReducer", () => {
  it("adds once, updates status, removes", () => {
    let s = opsReducer([], { type: "add", op: op() })
    s = opsReducer(s, { type: "add", op: op() })
    expect(s).toHaveLength(1)
    s = opsReducer(s, { type: "status", id: "A", status: "confirmed", resultKey: "c-1" })
    expect(s[0]).toMatchObject({ status: "confirmed", resultKey: "c-1" })
    expect(opsReducer(s, { type: "remove", id: "A" })).toEqual([])
  })

  it("pendingIn counts only adds still on their way", () => {
    const list = [
      op({ id: "1" }),
      op({ id: "2", status: "confirmed" }),
      op({ id: "3", kind: "vote" }),
      op({ id: "4", pot: "porto-weekend" }),
    ]
    expect(pendingIn(list, "lisbon-trip")).toBe(dollars(150))
  })
})

describe("run()", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("success: relaying → confirmed (Sent) → removed after 2 s", async () => {
    const store = createOpsStore()
    const onSuccess = vi.fn()
    const h = store.run({ kind: "add", pot: "p", actor: "leo", amount: dollars(150) }, async () => "c-1", {
      errorKey: "add.error.relayer",
      onSuccess,
    })
    expect(store.getSnapshot()[0]?.status).toBe("relaying")
    await expect(h.done).resolves.toBe("ok")
    expect(store.getSnapshot()[0]).toMatchObject({ status: "confirmed", resultKey: "c-1" })
    expect(onSuccess).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(2000)
    expect(store.getSnapshot()).toEqual([])
  })

  it("failure: the item fades (failed), then is removed and ONE toast fires with the flow's key", async () => {
    const store = createOpsStore()
    const onError = vi.fn()
    const h = store.run({ kind: "add", pot: "p", actor: "leo" }, async () => {
      throw new Error("service_unavailable")
    }, { errorKey: "add.error.relayer", onError })
    await expect(h.done).resolves.toBe("failed")
    expect(store.getSnapshot()[0]?.status).toBe("failed")
    expect(onError).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(store.getSnapshot()).toEqual([])
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0]).toBe("add.error.relayer")
  })

  it("Undo: a queued op inside its window is cancelled and nothing is sent", async () => {
    const store = createOpsStore({ now: () => 0 })
    const exec = vi.fn(async () => undefined)
    const h = store.run({ kind: "vote", pot: "p", actor: "leo", requestId: 12, delayUntil: 4000 }, exec, { errorKey: "approve.error.vote_revert" })
    expect(store.getSnapshot()[0]?.status).toBe("queued")
    vi.advanceTimersByTime(3000)
    expect(store.cancel(h.id)).toBe(true)
    await expect(h.done).resolves.toBe("cancelled")
    vi.advanceTimersByTime(5000)
    expect(exec).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toEqual([])
  })

  it("after the window it sends and can no longer be undone", async () => {
    const store = createOpsStore({ now: () => 0 })
    const exec = vi.fn(async () => "request:12")
    const h = store.run({ kind: "vote", pot: "p", actor: "leo", requestId: 12, delayUntil: 4000 }, exec, { errorKey: "approve.error.vote_revert" })
    vi.advanceTimersByTime(4000)
    expect(h.cancel()).toBe(false)
    await expect(h.done).resolves.toBe("ok")
    expect(exec).toHaveBeenCalledOnce()
  })
})

it("op ids are 16-char Crockford base32", () => {
  expect(newOpId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/)
})
