// Money-in details, the pure rules (lib/deposits.ts): what a key names, receipts on the origin network (real only,
// safe URLs), the five moments and how long it took, the top-up ask an add counted toward, the per-coin rate.
import { describe, expect, it } from "vitest"
import { depositKeyKind, intentsExplorerUrl, originTxUrl, perCoinUsd, topupFor, xcTimeline, xcTook } from "./deposits"

const TX = "8KCez9cqCEv2DW5usNffsv3Bfy9j99kZgL9U2ifDNTDD"

describe("depositKeyKind", () => {
  it("a NEAR transaction hash is a member's add, a pay-in ref a pay-in; anything else nothing", () => {
    expect(depositKeyKind(TX)).toBe("tx")
    expect(depositKeyKind("g0000000000000000000ax01")).toBe("payin")
    for (const k of ["", "e2", "g000", "contribution:" + TX, "../etc", null, undefined]) expect(depositKeyKind(k as string)).toBeNull()
  })
})

describe("receipts on the origin network", () => {
  it("each network's explorer; odd hashes and unknown networks get none", () => {
    expect(originTxUrl("base", "0xabc123def4567890abc123")).toBe("https://basescan.org/tx/0xabc123def4567890abc123")
    expect(originTxUrl("sol", "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW")).toMatch(/^https:\/\/solscan\.io\/tx\//)
    expect(originTxUrl("btc", "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6")).toBe("https://mempool.space/tx/a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6")
    expect(originTxUrl("base", "0xabc\"><script>")).toBeNull()
    expect(originTxUrl("base", "short")).toBeNull()
    expect(originTxUrl("nowhere", "0xabc123def4567890abc123")).toBeNull()
    expect(originTxUrl("base", null)).toBeNull()
    expect(intentsExplorerUrl("0xDeposit/1")).toBe("https://explorer.near-intents.org/transactions/0xDeposit%2F1")
  })
})

describe("the moments", () => {
  it("five in order, unknown ones null; took = sent → arrived (or address → added)", () => {
    const tl = xcTimeline({ address: 0, sent: 20_000, converting: 30_000, arrived: 78_000, added: 90_000 })
    expect(tl.map((x) => x.step)).toEqual(["address", "sent", "converting", "arrived", "added"])
    expect(xcTook(tl)).toBe(58_000)
    expect(xcTook(xcTimeline({ address: 0, added: 90_000 }))).toBe(90_000)
    expect(xcTook(xcTimeline({ address: 0 }))).toBeNull()
    expect(xcTimeline({ sent: Number.NaN })[1]!.at).toBeNull()
  })
})

describe("topupFor", () => {
  const ask = (id: string, createdAt: number, o: Partial<{ endedAt: number | null; dueAt: number; asked: string[] }> = {}) => ({ id, by: "maya", createdAt, endedAt: null, dueAt: 1_000, asked: ["maya", "sam"], ...o })
  it("the newest ask open when the money came in that asked this person", () => {
    const asks = [ask("1", 10, { endedAt: 50 }), ask("2", 60), ask("3", 70, { asked: ["maya"] })]
    expect(topupFor(asks, "sam", 40)?.id).toBe("1")
    expect(topupFor(asks, "sam", 55)).toBeNull() // after #1 ended, before #2
    expect(topupFor(asks, "sam", 80)?.id).toBe("2") // #3 didn't ask Sam
    expect(topupFor(asks, "maya", 80)?.id).toBe("3")
    expect(topupFor(asks, "sam", 5)).toBeNull() // before any ask
    expect(topupFor([ask("4", 10, { dueAt: 20 })], "sam", 30)).toBeNull() // past its date
    expect(topupFor(asks, "eve", 80)).toBeNull()
  })
})

describe("perCoinUsd", () => {
  it("dollars per whole coin for a coin whose price moves; none for a stablecoin or without both amounts", () => {
    expect(perCoinUsd({ sent: 129_300_000_000_000_000n, arrived: 300_000_000n, decimals: 18, stable: false })).toBe(2_320_185_614n)
    expect(perCoinUsd({ sent: 20_000_000n, arrived: 20_000_000n, decimals: 6, stable: true })).toBeNull()
    expect(perCoinUsd({ sent: null, arrived: 1n, decimals: 18, stable: false })).toBeNull()
  })
})
