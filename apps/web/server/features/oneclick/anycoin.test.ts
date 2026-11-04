// Any coin (2026-11-04), the pure parts: the curated config against 1Click's real token list, the catalogue check,
// the coin amount (rounding, offline prices), error parsing (minimums in coin units or dollars, MEMO-only origins), the
// swap type per coin, the recorded quotes' signatures, the simulator's capped timing and its credit, the availability memo.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, expectTypeOf, it } from "vitest"
import type { Api } from "@pot/sdk"
import { listedPrice, missingFromCatalogue, noteUnavailable, resetAvailabilityForTests, unavailableNow, UNAVAILABLE_TTL_MS } from "./availability"
import { createOneClick, parseSwapLimit, parseTryAtLeast, pausedFromShield, probeBody, quoteBody, verifyQuoteSignature, type QuoteResponse, type TokenInfo } from "./client"
import anyCoinFixtures from "./fixtures/dry-quotes-anycoin.json"
import tokensSnapshot from "./fixtures/tokens-2026-11-04.json"
import {
  assetOf,
  defaultCoin,
  offlineCoinAmount,
  offlineCoinNumbers,
  offlineUsdOut,
  roundUpSig,
  SIM_MAX_SECONDS,
  simIsSpedUp,
  slippageFor,
  stableUnits,
  typicalMinutes,
  XC_CHAINS,
  XC_COINS,
  XC_CONFIG,
  type XcChain,
  type XcCoin,
} from "./origins"
import { simCredit, simProfile, simStatus } from "./sim"

const tokens = tokensSnapshot as TokenInfo[]
const quotes = anyCoinFixtures as unknown as Record<string, QuoteResponse>

describe("the curated config (origins.ts)", () => {
  it("matches the SDK's wire types", () => {
    expectTypeOf<XcChain>().toEqualTypeOf<Api.XcChain>()
    expectTypeOf<XcCoin>().toEqualTypeOf<Api.XcCoin>()
  })

  it("every curated asset is in 1Click's token list of 2026-11-04 under its symbol, with its decimals", () => {
    for (const chain of XC_CHAINS)
      for (const a of XC_CONFIG[chain].assets) {
        const t = tokens.find((x) => x.assetId === a.assetId)
        expect(t, `${chain}:${a.coin}`).toBeDefined()
        expect([t!.blockchain, t!.symbol, t!.decimals], `${chain}:${a.coin}`).toEqual([chain === "aptos" ? "aptos" : XC_CONFIG[chain].shield, a.listedAs, a.decimals])
      }
    expect(missingFromCatalogue(tokens).size).toBe(0)
  })

  it("is well-formed: unique ids, stablecoins first (6 decimals, 100 bps), minimums from $1 to $500, speed bands agree", () => {
    const ids = XC_CHAINS.flatMap((c) => XC_CONFIG[c].assets.map((a) => a.assetId))
    expect(new Set(ids).size).toBe(ids.length)
    for (const chain of XC_CHAINS) {
      const c = XC_CONFIG[chain]
      expect(c.id).toBe(chain)
      expect(c.assets.length).toBeGreaterThan(0)
      const firstPriced = c.assets.findIndex((a) => !a.stable)
      if (firstPriced >= 0) expect(c.assets.slice(firstPriced).every((a) => !a.stable), chain).toBe(true)
      for (const a of c.assets) {
        expect((XC_COINS as readonly string[]).includes(a.coin)).toBe(true)
        if (a.stable) expect([a.decimals, slippageFor(a)]).toEqual([6, 100])
        else expect(slippageFor(a)).toBe(300)
      }
      expect(c.minUsd).toBeGreaterThanOrEqual(1_000_000n)
      expect(c.minUsd).toBeLessThanOrEqual(500_000_000n)
      expect(c.speed, chain).toBe(c.typicalSeconds <= 60 ? "fast" : c.typicalSeconds <= 150 ? "slower" : "slow")
    }
    // never a look-alike as "USDC" (kb gotcha): every USDC is the network's own
    expect(tokens.filter((t) => ["sUSDC", "steakUSDC", "gtUSDCp", "sparkUSDC", "mwUSDC", "laUSDC"].includes(t.symbol)).some((t) => ids.includes(t.assetId))).toBe(false)
    // the four measured networks keep their measured p50s
    expect(XC_CHAINS.filter((c) => XC_CONFIG[c].measured).map((c) => [c, XC_CONFIG[c].typicalSeconds])).toEqual([["base", 29], ["arb", 18], ["sol", 42], ["eth", 84]])
    // BSC (min $1,000) and Stellar (MEMO deposits) are left out
    expect(XC_CHAINS as readonly string[]).not.toContain("bsc")
    expect(XC_CHAINS as readonly string[]).not.toContain("stellar")
  })

  it("defaults to USDC where offered (older clients), else the network's first coin", () => {
    expect([defaultCoin("base"), defaultCoin("ton"), defaultCoin("tron"), defaultCoin("btc")]).toEqual(["USDC", "USDT", "USDT", "BTC"])
    expect(assetOf("base", "SOL")).toBeNull()
    expect(typicalMinutes("btc")).toBe(20)
  })
})

describe("the catalogue (GET /v0/tokens) and the availability memo", () => {
  it("hides a curated coin that disappears or changes decimals; a missing list hides nothing", () => {
    const less = tokens.filter((t) => t.assetId !== "nep141:doge.omft.near")
    expect([...missingFromCatalogue(less)]).toEqual(["doge:DOGE"])
    const changed = tokens.map((t) => (t.assetId === "nep141:sol.omft.near" ? { ...t, decimals: 8 } : t))
    expect([...missingFromCatalogue(changed)]).toEqual(["sol:SOL"])
    expect(missingFromCatalogue(null).size).toBe(0)
    expect(missingFromCatalogue([]).size).toBe(0)
    expect(listedPrice(tokens, "nep141:btc.omft.near")).toBe(78_490)
    expect(listedPrice(null, "nep141:btc.omft.near")).toBeNull()
  })

  it("remembers a refusal for 10 minutes", () => {
    resetAvailabilityForTests()
    noteUnavailable("tron", "USDT", { kind: "min", minUsd: 100_000_000n }, 1_000)
    expect(unavailableNow("tron", "USDT", 1_000 + UNAVAILABLE_TTL_MS - 1)).toEqual({ kind: "min", minUsd: 100_000_000n })
    expect(unavailableNow("tron", "USDT", 1_000 + UNAVAILABLE_TTL_MS)).toBeNull()
    expect(unavailableNow("base", "USDC", 0)).toBeNull()
  })
})

describe("coin amounts", () => {
  it("rounds up to 4 significant digits (people type it by hand), never down", () => {
    expect(roundUpSig(8_620_536_288_316_404n)).toBe(8_621_000_000_000_000n)
    expect(roundUpSig(8_621_000_000_000_000n)).toBe(8_621_000_000_000_000n)
    expect(roundUpSig(25_551n)).toBe(25_560n) // 0.0002556 BTC
    expect(roundUpSig(999n)).toBe(999n)
    expect(roundUpSig(0n)).toBe(0n)
  })
  it("stablecoins are 1:1 by value", () => {
    expect(stableUnits(20_000_000n, 6)).toBe(20_000_000n)
    expect(stableUnits(20_000_000n, 18)).toBe(20_000_000_000_000_000_000n)
    expect(stableUnits(20_000_000n, 2)).toBe(2_000n)
  })
  it("offline (mock / 1Click unreachable): $20 of ETH at $2,324.78 is 0.008625 ETH and about $20 comes out", () => {
    const eth = assetOf("base", "ETH")!
    const units = offlineCoinAmount(20_000_000n, eth, eth.refUsd)
    expect(units).toBe(8_625_000_000_000_000n)
    const out = offlineUsdOut(units, eth, eth.refUsd)
    expect(Number(out) / 1e6).toBeCloseTo(20, 1)
    expect(out).toBeGreaterThanOrEqual(20_000_000n)
    const n = offlineCoinNumbers("base", eth, 20_000_000n)
    expect(n).toMatchObject({ amountIn: units.toString(), minAmountIn: ((units * 97n) / 100n).toString(), timeEstimateSec: 29 })
    // every curated coin prices $20 to something positive that converts back to about $20
    for (const c of XC_CHAINS)
      for (const a of XC_CONFIG[c].assets.filter((x) => !x.stable)) {
        const u = offlineCoinAmount(20_000_000n, a, a.refUsd)
        expect(Number(offlineUsdOut(u, a, a.refUsd)) / 1e6, `${c}:${a.coin}`).toBeGreaterThan(19.99)
        expect(Number(offlineUsdOut(u, a, a.refUsd)) / 1e6, `${c}:${a.coin}`).toBeLessThan(20.03)
      }
  })
})

describe("swap type per coin (kb 'Any coin')", () => {
  const AT = Date.parse("2026-11-04T12:00:00Z")
  it("stablecoin → FLEX_INPUT 100 bps; other coins → FLEX_INPUT 300 bps; the probe → dry EXACT_OUTPUT for the dollars", () => {
    expect(quoteBody("op", "maya.near", 20_000_000n, false, AT, "USDC")).toMatchObject({ swapType: "FLEX_INPUT", slippageTolerance: 100, amount: "20000000" })
    expect(quoteBody("base", "maya.near", 8_621_000_000_000_000n, false, AT, "ETH")).toMatchObject({ swapType: "FLEX_INPUT", slippageTolerance: 300, amount: "8621000000000000", originAsset: "nep141:base.omft.near" })
    expect(probeBody("btc", "BTC", "maya.near", 50_000_000n, AT)).toMatchObject({ swapType: "EXACT_OUTPUT", dry: true, slippageTolerance: 100, amount: "50000000", originAsset: "nep141:btc.omft.near" })
    expect(() => quoteBody("base", "maya.near", 1n, true, AT, "SOL")).toThrow()
  })
  it("the recorded 2026-11-04 quotes (EXACT_OUTPUT probes, FLEX at 100 and 300 bps) verify; Bitcoin's don't (SDK 0.1.26 agrees)", () => {
    for (const [name, q] of Object.entries(quotes)) expect(verifyQuoteSignature(q), name).toBe(!name.includes("btc"))
    const tampered = structuredClone(quotes["flex-eth-base-20"]!)
    tampered.quote.amountOut = "1"
    expect(verifyQuoteSignature(tampered)).toBe(false)
  })
  it("evidence: a FLEX quote for the probe's minAmountIn (rounded up) brings about the dollars asked for", () => {
    const probe = quotes["probe-eth-base-20"]!
    const flex = quotes["flex-eth-base-20"]!
    expect(probe.quoteRequest).toMatchObject({ swapType: "EXACT_OUTPUT", amount: "20000000" })
    expect(flex.quoteRequest).toMatchObject({ swapType: "FLEX_INPUT", slippageTolerance: 300, amount: roundUpSig(BigInt(probe.quote.minAmountIn)).toString() })
    // the out includes the 0.0051 USDC storage fee the dry recipient (unregistered) would pay
    const out = (Number(flex.quote.amountOut) + Number(flex.quote.withdrawFee ?? 0)) / 1e6
    expect(out).toBeGreaterThan(19.98)
    expect(out).toBeLessThan(20.05)
    // EXACT_OUTPUT itself would ask for +1 % and refund the excess into the member's NEAR Intents balance
    expect(BigInt(probe.quote.amountIn)).toBeGreaterThan(BigInt(probe.quote.minAmountIn))
  })
})

describe("1Click errors → what the UI can say", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  it("parses minimums in coin units (formatted or base units) and dollar swap limits", () => {
    expect(parseTryAtLeast("0.300001", 6)).toBe(300_001n)
    expect(parseTryAtLeast("6400", 8)).toBe(6_400n) // sats
    expect(parseTryAtLeast("2000000", 6)).toBe(2_000_000n) // 2 XRP in drops
    expect(parseTryAtLeast("1", 6)).toBe(1_000_000n)
    expect(parseTryAtLeast("0.001", 8)).toBe(100_000n)
    expect(parseSwapLimit("Temporary swap limits: minimum swap amount is $1,000")).toBe(1_000_000_000n)
    expect(parseSwapLimit("Temporary swap limits: minimum swap amount is $100")).toBe(100_000_000n)
    expect(parseSwapLimit("Amount is too low")).toBeNull()
  })
  it("maps the live refusals of 2026-11-04 (BSC/Tron limits, Stellar MEMO, BTC/XRP/ZEC minimums)", async () => {
    const replies = [
      res(400, { message: "Temporary swap limits: minimum swap amount is $100" }),
      res(400, { message: "Incorrect depositMode for originAsset from stellar chain" }),
      res(400, { message: "Amount is too low for bridge, try at least 6400" }),
    ]
    const c = createOneClick({ fetch: (async () => replies.shift()!) as typeof fetch })
    await expect(c.quote(quoteBody("tron", "x.near", 1n, true, 0, "USDT"))).rejects.toMatchObject({ reason: "amount_too_low", detail: { minUsd: "100000000" } })
    await expect(c.quote(quoteBody("base", "x.near", 1n, true, 0, "USDC"))).rejects.toMatchObject({ reason: "chain_paused", detail: { why: "unsupported" } })
    await expect(c.quote(probeBody("btc", "BTC", "x.near", 1n, 0))).rejects.toMatchObject({ reason: "amount_too_low", detail: { minimum: "6400" } })
  })
  it("a dry quote whose signature doesn't verify is only accepted when the caller says it's a preview", async () => {
    const btc = quotes["probe-btc-50"]!
    const c = createOneClick({ fetch: (async () => res(201, btc)) as typeof fetch })
    await expect(c.quote(probeBody("btc", "BTC", "x.near", 50_000_000n, 0))).rejects.toMatchObject({ reason: "quote_failed", detail: { cause: "signature" } })
    expect(await c.quote(probeBody("btc", "BTC", "x.near", 50_000_000n, 0), { unverifiedDryOk: true })).toMatchObject({ unverified: true })
    // never for a quote that would carry an address
    await expect(c.quote(quoteBody("btc", "x.near", 64_000n, false, 0, "BTC"), { unverifiedDryOk: true })).rejects.toMatchObject({ reason: "quote_failed" })
  })

  it("reads the token list once an hour and fails open", async () => {
    let calls = 0
    let now = 0
    const c = createOneClick({
      now: () => now,
      fetch: (async () => {
        calls++
        return calls === 2 ? res(500, {}) : res(200, tokens)
      }) as typeof fetch,
    })
    expect((await c.tokens!())?.length).toBe(tokens.length)
    now = 3_599_000
    await c.tokens!()
    expect(calls).toBe(1)
    now = 3_600_000
    expect(await c.tokens!()).toBeNull()
    expect(calls).toBe(2)
  })
  it("Shield: a chain's own incident, the HOT bridge, or everything ('*')", () => {
    expect([...pausedFromShield([{ scopeType: "chain", scopeValue: "btc", status: "active" }])]).toEqual(["btc"])
    expect([...pausedFromShield([{ scopeType: "bridge", scopeValue: "hot" }])]).toEqual(["pol", "op", "avax", "ton"])
    expect(pausedFromShield([{ scopeType: "chain", scopeValue: "*" }]).size).toBe(XC_CHAINS.length)
    expect(pausedFromShield([{ scopeType: "chain", scopeValue: "eth", status: "resolved" }]).size).toBe(0)
  })
})

describe("the simulator for every network and coin", () => {
  it("timing follows the network but never takes more than 30 s (jitter included); slow networks say it's sped up", () => {
    for (const c of XC_CHAINS)
      for (const j of [0.8, 1, 1.2]) {
        const p = simProfile(c, j)
        expect(p.pendingSec + p.processingSec, `${c} × ${j}`).toBeLessThanOrEqual(SIM_MAX_SECONDS)
        expect(p.pendingSec).toBeGreaterThan(0)
      }
    expect(simProfile("arb", 1)).toEqual({ pendingSec: 6, processingSec: 12 })
    expect(XC_CHAINS.filter(simIsSpedUp)).toEqual(["sol", "eth", "pol", "op", "avax", "sui", "aptos", "ton", "tron", "xrp", "btc", "doge", "zec"])
  })
  it("the credit is the quote's rate: the quoted amount gives exactly the quoted dollars, less gives less", () => {
    const o = { quoted: 8_621_000_000_000_000n, quotedOut: 20_003_000n }
    expect(simCredit(o.quoted, o)).toBe(20_003_000n)
    expect(simCredit(o.quoted / 2n, o)).toBe(10_001_500n)
    expect(simCredit(150_000_000n, { quoted: 150_000_000n })).toBe(149_985_000n) // no quote: the 1 bp formula
    const s = { scenario: "ok" as const, jitter: 1, sends: [{ at: 0, amount: o.quoted.toString() }] }
    const v = simStatus(s, { chain: "btc", required: (o.quoted * 97n) / 100n, quoted: o.quoted, quotedOut: o.quotedOut, deadlineMs: 1e12, createdAt: 0 }, 31_000)
    expect(v).toMatchObject({ status: "SUCCESS", amountOut: 20_003_000n, depositedAmount: o.quoted })
  })
})
