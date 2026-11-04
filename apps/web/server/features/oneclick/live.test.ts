// Opt-in: LIVE_ONECLICK=1 pnpm --filter web exec vitest run server/features/oneclick/live.test.ts
// A handful of REAL dry quotes against https://1click.chaindefuser.com (read-only: dry: true, nothing gets an address,
// no funds move) through the same client and bodies the app uses, plus the curated list against GET /v0/tokens.
// Skipped by default (network, and 1Click's prices / limits change).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { missingFromCatalogue } from "./availability"
import { createOneClick, probeBody, quoteBody } from "./client"
import { roundUpSig, stableUnits, type XcChain, type XcCoin } from "./origins"
import { DRY_RECIPIENT } from "./service"

vi.mock("@/db/client", () => ({ getDb: () => null }))

const live = !!process.env.LIVE_ONECLICK
const c = createOneClick({ timeoutMs: 15_000 })
const USD = 20_000_000n

describe.skipIf(!live)("1Click live dry quotes (LIVE_ONECLICK=1)", () => {
  it("every curated coin is still in the token list with its decimals", async () => {
    const tokens = await c.tokens!()
    expect(tokens?.length).toBeGreaterThan(100)
    expect([...missingFromCatalogue(tokens)]).toEqual([])
  })

  it.each([
    ["op", "USDC"],
    ["ton", "USDT"],
    ["aptos", "USDT"],
  ] as [XcChain, XcCoin][])("stablecoin %s %s: FLEX 100 bps, $20 in ≈ $20 out, signed", async (chain, coin) => {
    const q = await c.quote(quoteBody(chain, DRY_RECIPIENT, stableUnits(USD, 6), true, Date.now(), coin))
    expect(q.unverified).toBeUndefined()
    expect(Number(q.quote.amountOut) / 1e6).toBeGreaterThan(19.9)
  })

  it.each([
    ["base", "ETH"],
    ["sol", "SOL"],
    ["pol", "POL"],
    ["xrp", "XRP"],
  ] as [XcChain, XcCoin][])("coin %s %s: the EXACT_OUTPUT probe's amount, as FLEX 300 bps, brings ≈ $20", async (chain, coin) => {
    const probe = await c.quote(probeBody(chain, coin, DRY_RECIPIENT, USD, Date.now()))
    const q = await c.quote(quoteBody(chain, DRY_RECIPIENT, roundUpSig(BigInt(probe.quote.minAmountIn)), true, Date.now(), coin))
    const out = (Number(q.quote.amountOut) + Number(q.quote.withdrawFee ?? 0)) / 1e6
    expect(out).toBeGreaterThan(19.9)
    expect(out).toBeLessThan(20.2)
  })

  it("Bitcoin: its quotes still don't verify (2026-11-04); the simulator's preview accepts them, nothing else does", async () => {
    await expect(c.quote(probeBody("btc", "BTC", DRY_RECIPIENT, USD, Date.now()))).rejects.toMatchObject({ reason: "quote_failed" })
    const q = await c.quote(probeBody("btc", "BTC", DRY_RECIPIENT, USD, Date.now()), { unverifiedDryOk: true })
    expect(BigInt(q.quote.minAmountIn)).toBeGreaterThan(0n)
  })

  it("Tron below $100 is refused with its swap limit", async () => {
    await expect(c.quote(quoteBody("tron", DRY_RECIPIENT, stableUnits(USD, 6), true, Date.now(), "USDT"))).rejects.toMatchObject({ reason: "amount_too_low" })
  })
})
