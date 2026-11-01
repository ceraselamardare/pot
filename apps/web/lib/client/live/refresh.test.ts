// QA 2026-10-22 (testnet E-d): a burst of heartbeat changes must not restart the bundle fetch again and again.
// Each restart left its RPC reads queued in the tab's FIFO budget, so the surviving fetch never landed.
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { afterEach, describe, expect, it } from "vitest"
import { refreshQuery } from "./refresh"

const KEY = ["pot", "trip.pots.x.testnet", "bundle"] as const

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  let calls = 0
  let chainValue = 1
  const gates: (() => void)[] = []
  const queryFn = async () => {
    calls++
    const seen = chainValue // the reads happen at the start (they are queued RPC calls in the app)
    await new Promise<void>((r) => gates.push(r))
    return seen
  }
  const obs = new QueryObserver(qc, { queryKey: KEY, queryFn }) // an active observer, like a mounted screen
  const unsub = obs.subscribe(() => {})
  const release = async () => {
    while (gates.length) gates.shift()!()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { qc, calls: () => calls, setChain: (v: number) => (chainValue = v), release, unsub }
}

let cleanup: (() => void) | null = null
afterEach(() => cleanup?.())

describe("refreshQuery", () => {
  it("ten changes while a fetch is in flight → that fetch lands, then exactly one more read (not ten restarts)", async () => {
    const s = setup()
    cleanup = s.unsub
    await s.release() // the first (mount) fetch lands
    expect(s.qc.getQueryData(KEY)).toBe(1)
    let t = 1_000
    const now = () => t
    void refreshQuery(s.qc, KEY, now) // a change: one fetch starts and reads 1
    const before = s.calls()
    s.setChain(2) // the chain moves on after that fetch's reads
    t += 500
    const burst = Array.from({ length: 10 }, () => refreshQuery(s.qc, KEY, now))
    expect(s.calls()).toBe(before) // nothing restarted
    await s.release() // the in-flight fetch lands (value 1) …
    await s.release() // … then the single trailing read sees 2
    await Promise.all(burst)
    await s.release()
    expect(s.calls()).toBe(before + 1)
    expect(s.qc.getQueryData(KEY)).toBe(2)
  })

  it("calls in the same burst as the fetch they find in flight add no trailing read", async () => {
    const s = setup()
    cleanup = s.unsub
    await s.release()
    const now = () => 5_000
    const first = s.calls()
    for (let i = 0; i < 5; i++) void refreshQuery(s.qc, KEY, now)
    await s.release()
    await s.release()
    expect(s.calls()).toBe(first + 1)
  })

  it("the old way (invalidateQueries) restarts the fetch on every call — the bug this replaces", async () => {
    const s = setup()
    cleanup = s.unsub
    await s.release()
    const first = s.calls()
    for (let i = 0; i < 5; i++) void s.qc.invalidateQueries({ queryKey: KEY })
    expect(s.calls()).toBe(first + 5)
  })
})
