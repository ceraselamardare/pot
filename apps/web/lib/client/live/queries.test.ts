// QA 2026-10-22 (testnet E-d): the open proposals' votes must not wait in the tab's budgeted RPC queue. After an
// action the settle loops and bundle refetches saturate the 100/min FIFO bucket for tens of seconds; the Pot
// screen holds its last ready state until the proposals query answers, so a queued read hid the new request.
import { beforeEach, describe, expect, it, vi } from "vitest"

const budgeted = { dao: { getProposals: vi.fn() } }
const unbudgeted = { dao: { getProposals: vi.fn(async () => ({ value: [{ id: 2, status: "InProgress", votes: { "ana.testnet": "Approve" } }], blockHeight: 10 })) } }
vi.mock("./chain", () => ({ chain: () => budgeted, signingChain: () => unbudgeted }))

const { proposalsQuery } = await import("./queries")

describe("proposalsQuery", () => {
  beforeEach(() => {
    budgeted.dao.getProposals.mockClear()
    unbudgeted.dao.getProposals.mockClear()
  })

  it("reads the DAO proposals through the unbudgeted client, never the heartbeat's queue", async () => {
    const q = proposalsQuery("trip.pots.x.testnet", [1, 2])
    const data = await q.queryFn()
    expect(unbudgeted.dao.getProposals).toHaveBeenCalledWith("trip.pots.x.testnet", 1, 2)
    expect(budgeted.dao.getProposals).not.toHaveBeenCalled()
    expect(data.byId[2]?.votes).toEqual({ "ana.testnet": "Approve" })
  })

  it("stays bounded: no call without ids, and polls only while a proposal is open", async () => {
    const none = proposalsQuery("trip.pots.x.testnet", [])
    expect(none.enabled).toBe(false)
    expect(await none.queryFn()).toEqual({ byId: {}, blockHeight: 0 })
    expect(unbudgeted.dao.getProposals).not.toHaveBeenCalled()
    const q = proposalsQuery("trip.pots.x.testnet", [2])
    expect(q.refetchInterval({ state: { data: { byId: { 2: { status: "InProgress" } as never }, blockHeight: 1 } } })).toBe(3000)
    expect(q.refetchInterval({ state: { data: { byId: { 2: { status: "Approved" } as never }, blockHeight: 1 } } })).toBe(false)
  })
})
