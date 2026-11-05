// B-14 / D-50: 1Click quote signatures (against real recorded dry quotes), the simulator timeline, and the
// quote → simulate → status → treasury delivery → ADDED path on a test DB with a fake chain and fake 1Click.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { depositIntent, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../../chain/balance"
import { createHubReader } from "../../chain/hub"
import type { Config } from "../../config"
import { ApiError } from "../../http/errors"
import type { SessionCtx } from "../../session/store"
import { DAO, HUB, USDC } from "../../testing/delegates"
import { insertUser, NEAR, RELAYER, seedChain, testConfig, TREASURY } from "../../testing/env"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../../testing/fakeChain"
import { stepOf } from "./assets"
import { createOneClick, quoteBody, quoteHash, stableStringify, verifyQuoteSignature, type OneClickClient, type QuoteResponse } from "./client"
import fixtures from "./fixtures/dry-quotes.json"
import anyCoinFixtures from "./fixtures/dry-quotes-anycoin.json"
import tokensSnapshot from "./fixtures/tokens-2026-11-04.json"
import { resetAvailabilityForTests, UNAVAILABLE_TTL_MS } from "./availability"
import { probeBody, type QuoteRequestBody, type TokenInfo } from "./client"
import { roundUpSig } from "./origins"
import {
  createQuote,
  deliver,
  deliveryRefusal,
  depositStatus,
  DRY_RECIPIENT,
  listChains,
  listDeposits,
  priceQuote,
  simulate,
  SIM_MAX,
  type OneClickDeps,
} from "./service"
import { jitterFor, planSimSend, simAmountOut, simProfile, simSent, simStatus, type SimState } from "./sim"
import { readQuota } from "@/db/quota"

const quotes = fixtures as unknown as Record<string, QuoteResponse>

describe("1Click quote signature (SDK 0.1.26 verifyQuoteSignature twin)", () => {
  it("stable stringify sorts keys and drops undefined", () => {
    expect(stableStringify({ b: 1, a: { d: undefined, c: [1, "x"] }, e: null })).toBe('{"a":{"c":[1,"x"]},"b":1,"e":null}')
  })
  it.each(Object.keys(quotes))("verifies the real recorded dry quote %s", (name) => {
    expect(verifyQuoteSignature(quotes[name]!)).toBe(true)
  })
  it("rejects a tampered quote, a tampered request and a wrong key", () => {
    const q = structuredClone(quotes["q9-recommended-base"]!)
    q.quote.amountOut = "149999999"
    expect(verifyQuoteSignature(q)).toBe(false)
    const r = structuredClone(quotes["q9-recommended-base"]!)
    r.quoteRequest.recipient = "evil.near"
    expect(verifyQuoteSignature(r)).toBe(false)
    expect(verifyQuoteSignature(quotes["q9-recommended-base"]!, "ed25519:4ePu6MJVtv74NDZvT7DeqUdL6j9saHHx5YTsTscbNTyJ")).toBe(false)
    expect(quoteHash(quotes["q9-recommended-base"]!)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/)
  })
  it("builds the kb's recommended body (FLEX_INPUT, 100 bps, INTENTS refunds, 2 h deadline, referral)", () => {
    const b = quoteBody("base", "maya.near", 150_000_000n, true, Date.parse("2026-10-21T12:00:00Z"))
    expect(b).toMatchObject({
      swapType: "FLEX_INPUT",
      slippageTolerance: 100,
      depositType: "ORIGIN_CHAIN",
      recipientType: "DESTINATION_CHAIN",
      refundType: "INTENTS",
      refundTo: "maya.near",
      amount: "150000000",
      referral: "pot",
      deadline: "2026-10-21T14:00:00.000Z",
    })
  })
})

describe("1Click HTTP client (fake fetch)", () => {
  const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  it("201 + valid signature → the quote; 400 'not available' → chain_paused; 'try at least' → amount_too_low", async () => {
    const good = quotes["q9-recommended-arb"]!
    const replies = [res(201, good), res(400, { message: "Quoting for this pair is not available" }), res(400, { message: "Amount is too low for bridge, try at least 0.300001" })]
    const c = createOneClick({ fetch: (async () => replies.shift()!) as typeof fetch })
    expect((await c.quote(quoteBody("arb", "pot.near", 150_000_000n, true))).quote.amountOut).toBe(good.quote.amountOut)
    await expect(c.quote(quoteBody("arb", "pot.near", 1n, true))).rejects.toMatchObject({ reason: "chain_paused" })
    await expect(c.quote(quoteBody("eth", "pot.near", 1n, true))).rejects.toMatchObject({ reason: "amount_too_low", detail: { minimum: "300001" } })
  })
  it("a 201 with a bad signature is quote_failed; a bad key is retried once without it", async () => {
    const bad = structuredClone(quotes["q9-recommended-sol"]!)
    bad.quote.amountOut = "1"
    const seen: (string | null)[] = []
    const replies = [res(401, { message: "Invalid token" }), res(201, bad)]
    const c = createOneClick({
      apiKey: "k",
      fetch: (async (_u: string, init: RequestInit) => {
        seen.push((init.headers as Record<string, string>)["x-api-key"] ?? null)
        return replies.shift()!
      }) as typeof fetch,
    })
    await expect(c.quote(quoteBody("sol", "pot.near", 150_000_000n, true))).rejects.toMatchObject({ reason: "quote_failed", detail: { cause: "signature" } })
    expect(seen).toEqual(["k", null])
  })
  it("Shield: active chain incidents are paused (a `hot` bridge incident pauses the HOT chains); fails open; 60 s cache", async () => {
    let calls = 0
    let t = 0
    const c = createOneClick({
      now: () => t,
      fetch: (async () => {
        calls++
        if (calls === 2) throw new Error("down")
        return res(200, { activeIncidents: [{ scopeType: "chain", scopeValue: "base", status: "active" }, { scopeType: "chain", scopeValue: "pol" }, { scopeType: "bridge", scopeValue: "hot" }] })
      }) as unknown as typeof fetch,
    })
    expect([...(await c.pausedChains())]).toEqual(["base", "pol", "op", "avax", "ton"])
    t = 30_000
    expect([...(await c.pausedChains())]).toEqual(["base", "pol", "op", "avax", "ton"])
    expect(calls).toBe(1)
    t = 61_000
    expect([...(await c.pausedChains())]).toEqual([])
  })
})

describe("simulator timeline (api-spec §2.7 profiles, ± 20 % jitter)", () => {
  const o = { chain: "base" as const, required: 148_500_000n, quoted: 150_000_000n, deadlineMs: 10_000_000, createdAt: 0 }
  const send = (scenario: SimState["scenario"], sends: [number, bigint][], deadlineMs?: number): SimState => ({
    scenario,
    jitter: 1,
    sends: sends.map(([at, amount]) => ({ at, amount: amount.toString() })),
    ...(deadlineMs ? { deadlineMs } : {}),
  })
  it("jitter is deterministic and within ± 20 %", () => {
    for (const id of ["dp_a", "dp_b", "dp_01jbqxyz"]) {
      expect(jitterFor(id)).toBe(jitterFor(id))
      expect(jitterFor(id)).toBeGreaterThanOrEqual(0.8)
      expect(jitterFor(id)).toBeLessThanOrEqual(1.2)
    }
    expect(simProfile("arb", 1)).toEqual({ pendingSec: 6, processingSec: 12 })
    expect(simProfile("base", 1)).toEqual({ pendingSec: 17, processingSec: 12 })
    // capped at 30 s so demos stay quick (any coin, 2026-11-04): Ethereum's 84 s, Bitcoin's ~20 min
    expect(simProfile("eth", 1.2)).toEqual({ pendingSec: 16, processingSec: 14 })
    expect(simProfile("btc", 1)).toEqual({ pendingSec: 18, processingSec: 12 })
  })
  it("ok: waiting → spotted → converting → SUCCESS with 1 bp off", () => {
    const s = send("ok", [[1000, 150_000_000n]])
    expect(simStatus(null, o, 500).status).toBe("PENDING_DEPOSIT")
    expect(simStatus(s, o, 1000 + 5_000).status).toBe("PENDING_DEPOSIT")
    expect(simStatus(s, o, 1000 + 11_000).status).toBe("KNOWN_DEPOSIT_TX")
    const p = simStatus(s, o, 1000 + 18_000)
    expect(p).toMatchObject({ status: "PROCESSING", processingSince: 18_000 })
    const done = simStatus(s, o, 1000 + 29_000)
    expect(done).toMatchObject({ status: "SUCCESS", amountOut: 149_985_000n })
    expect(simAmountOut(150_000_000n)).toBe(149_985_000n)
  })
  it("partial: INCOMPLETE, then a top-up converts; or REFUNDED (PARTIAL_DEPOSIT) after the shortened deadline", () => {
    const s = send("partial", [[0, 120_000_000n]], 77_000)
    expect(simStatus(s, o, 20_000)).toMatchObject({ status: "INCOMPLETE_DEPOSIT", depositedAmount: 120_000_000n })
    expect(simStatus(s, o, 90_000)).toMatchObject({ status: "REFUNDED", refundReason: "PARTIAL_DEPOSIT", refundedAmount: 120_000_000n })
    const topped = send("partial", [[0, 120_000_000n], [30_000, 28_500_000n]], 77_000)
    expect(simStatus(topped, o, 40_000).status).toBe("INCOMPLETE_DEPOSIT")
    expect(simStatus(topped, o, 50_000)).toMatchObject({ status: "PROCESSING", processingSince: 47_000 })
    expect(simStatus(topped, o, 60_000)).toMatchObject({ status: "SUCCESS", depositedAmount: 148_500_000n })
  })
  it("partial: the rest sent before the deadline is not refunded while it's still on its way (2026-11-02)", () => {
    // the top-up at 75 s (deadline 77 s) is spotted at 92 s, after deadline + 10 s
    const late = send("partial", [[0, 120_000_000n], [75_000, 28_500_000n]], 77_000)
    expect(simStatus(late, o, 88_000)).toMatchObject({ status: "INCOMPLETE_DEPOSIT", depositedAmount: 120_000_000n })
    expect(simStatus(late, o, 92_000 + 1)).toMatchObject({ status: "PROCESSING", processingSince: 92_000 })
    expect(simStatus(late, o, 92_000 + 12_000 + 1)).toMatchObject({ status: "SUCCESS", depositedAmount: 148_500_000n })
    // sent after the deadline: refunded as before
    const tooLate = send("partial", [[0, 120_000_000n], [77_000, 28_500_000n]], 77_000)
    expect(simStatus(tooLate, o, 88_000)).toMatchObject({ status: "REFUNDED", refundReason: "PARTIAL_DEPOSIT" })
  })
  it("planSimSend: a second 'send more' while the first is on its way is the same top-up, never a refusal", () => {
    const base = { scenario: "partial" as const, required: 4_950_000n, quoted: 5_000_000n, cap: 5_000_000n, deadlineMs: 100_000 }
    const first = send("partial", [[0, 4_000_000n]], 100_000)
    // the screen asks for the missing $0.95 (what it saw arrive): sent
    expect(planSimSend(first, { ...base, status: "INCOMPLETE_DEPOSIT", amount: 950_000n }, 40_000)).toEqual({ kind: "send", amount: 950_000n })
    // the owner's second tap, same label (the top-up wasn't spotted yet): nothing more is sent, no error
    const topped = send("partial", [[0, 4_000_000n], [40_000, 950_000n]], 100_000)
    expect(simSent(topped)).toBe(4_950_000n)
    expect(planSimSend(topped, { ...base, status: "INCOMPLETE_DEPOSIT", amount: 950_000n }, 42_000)).toEqual({ kind: "already_sent" })
    // a bigger amount than what's missing is trimmed to what's missing
    expect(planSimSend(first, { ...base, status: "INCOMPLETE_DEPOSIT", amount: 1_000_000n }, 40_000)).toEqual({ kind: "send", amount: 950_000n })
    // after the deadline: too late; a converting / ok deposit can't take more
    expect(planSimSend(first, { ...base, status: "INCOMPLETE_DEPOSIT" }, 100_000)).toEqual({ kind: "refused", why: "too_late" })
    expect(planSimSend(topped, { ...base, status: "PROCESSING" }, 80_000)).toEqual({ kind: "refused", why: "already_sent" })
    // first sends: partial = 80 %, ok = the quote, above the cap refused
    expect(planSimSend(null, { ...base, status: "PENDING_DEPOSIT" }, 0)).toEqual({ kind: "send", amount: 4_000_000n })
    expect(planSimSend(null, { ...base, scenario: "ok", status: "PENDING_DEPOSIT" }, 0)).toEqual({ kind: "send", amount: 5_000_000n })
    expect(planSimSend(null, { ...base, scenario: "ok", status: "PENDING_DEPOSIT", amount: 5_000_001n }, 0)).toMatchObject({ kind: "refused", why: "amount_too_high" })
  })
  it("no_liquidity → REFUNDED; failed → FAILED with nothing refunded; slow stays converting 6 min", () => {
    expect(simStatus(send("no_liquidity", [[0, 150_000_000n]]), o, 17_000 + 20_001)).toMatchObject({ status: "REFUNDED", refundReason: "NO_LIQUIDITY" })
    expect(simStatus(send("failed", [[0, 150_000_000n]]), o, 17_000 + 30_001)).toMatchObject({ status: "FAILED", refundedAmount: 0n })
    const slow = send("slow", [[0, 150_000_000n]])
    expect(simStatus(slow, o, 17_000 + 5 * 60_000).status).toBe("PROCESSING")
    expect(simStatus(slow, o, 17_000 + 6 * 60_000).status).toBe("SUCCESS")
  })
  it("expired: no send, past the deadline", () => {
    const s: SimState = { scenario: "expired", jitter: 1, sends: [], deadlineMs: 60_000 }
    expect(simStatus(s, o, 59_000).status).toBe("PENDING_DEPOSIT")
    expect(simStatus(s, o, 60_000).status).toBe("EXPIRED")
  })
  it("maps statuses to the 5 stepper steps", () => {
    expect(["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "ADDED"].map((s) => stepOf(s))).toEqual([1, 2, 3, 4, 5])
    expect(stepOf("FAILED", 3)).toBe(3)
  })
})

// ---------------------------------------------------------------------------------------------

const ME = "u-xcuser01.users.potapp.testnet"
let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deps: OneClickDeps
let clock = 1_800_000_000_000
let deferred: (() => Promise<void>)[] = []
let me: SessionCtx
let paused = new Set<string>()

const fakeOneClick: OneClickClient = {
  async quote(body) {
    if (!body.dry) throw new Error("non-dry on testnet")
    const q = structuredClone(quotes["q9-recommended-base"]!)
    q.quote.amountIn = body.amount
    return q
  },
  async status() {
    return null
  },
  async pausedChains() {
    return paused as Set<never>
  },
}

beforeAll(async () => {
  t = await createTestDb("oneclick")
})
afterAll(async () => {
  await t.close()
})

async function session(kind: "near-auth" | "wallet" = "near-auth", account = ME): Promise<SessionCtx> {
  const { user } = await insertUser(t.db, { account, kind })
  return { idHash: `h-${account}`, kind, expiresAt: new Date(clock + 86_400_000), user, device: null, pendingDevice: false }
}

beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
  resetBalanceCacheForTests()
  clock = 1_800_000_000_000
  deferred = []
  paused = new Set()
  chain = seedChain(new FakeChain())
  chain.account(TREASURY, { amount: 1n * NEAR })
  chain.view(HUB, "get_members", (a) => (a.pot === DAO ? [{ account_id: ME, status: "active" }, { account_id: "bob.testnet", status: "active" }] : []))
  chain.view(USDC, "storage_balance_of", () => ({ total: "1250000000000000000000", available: "0" }))
  sub = new FakeSubmitter((spec) => plainOutcome("x", spec.signerId, spec.receiverId))
  deps = {
    db: t.db,
    rpc: chain,
    hub: createHubReader(chain, HUB),
    submitter: sub,
    cfg,
    oneclick: fakeOneClick,
    defer: (fn) => void deferred.push(fn),
    now: () => clock,
  }
  me = await session()
})

const runDeferred = async () => {
  const fns = deferred
  deferred = []
  for (const f of fns) await f()
}
let keyN = 0
const key = (n: number) => `0000000000000${String(n).padStart(3, "0")}`.replace(/[ilou]/g, "0")

describe("POST /api/oneclick/quote", () => {
  it("chains: simulated mode on testnet, slower / slow networks, Shield-paused chains marked, coins and minimums", async () => {
    paused = new Set(["base"])
    const r = await listChains(deps, { ONECLICK_SIM_PAUSED: "sol" })
    expect(r.mode).toBe("simulated")
    expect(Object.fromEntries(r.chains.map((c) => [c.id, c.status]))).toEqual({
      base: "paused",
      arb: "ok",
      sol: "paused",
      eth: "slower",
      pol: "ok",
      op: "ok",
      avax: "ok",
      sui: "ok",
      aptos: "ok",
      ton: "slower",
      tron: "slower",
      xrp: "ok",
      btc: "slower",
      doge: "slower",
      zec: "slower",
    })
    expect(Object.fromEntries(r.chains.map((c) => [c.id, c.speed]))).toMatchObject({ arb: "fast", eth: "slower", btc: "slow", doge: "slow", zec: "slow" })
    expect(r.chains.find((c) => c.id === "arb")?.typicalSeconds).toBe(18)
    expect(r.chains.find((c) => c.id === "base")?.coins.map((c) => c.coin)).toEqual(["USDC", "ETH"])
    expect(r.chains.find((c) => c.id === "sol")?.coins.map((c) => [c.coin, c.stable])).toEqual([["USDC", true], ["USDT", true], ["SOL", false]])
    expect(r.chains.find((c) => c.id === "tron")).toMatchObject({ minAmount: "101000000", coins: [{ coin: "USDT", minAmount: "101000000" }] })
    expect(r.chains.find((c) => c.id === "btc")?.minAmount).toBe("10000000")
  })

  it("dry: the real 1Click numbers, no row", async () => {
    const r = await createQuote(deps, me, { pot: DAO, chain: "base", amount: "150000000", dry: true, idempotencyKey: key(1) })
    expect(r).toMatchObject({ mode: "simulated", quote: { amountOut: "149984459", minAmountIn: "148500000", withdrawFee: "0" } })
    expect(r.depositAddress).toBeUndefined()
    expect(await t.db.select().from(depositIntent)).toHaveLength(0)
  })

  it("non-dry: a labelled simulated address + DO NOT SEND QR; idempotent; conflicting retry", async () => {
    const body = { pot: DAO, chain: "arb" as const, amount: "150000000", idempotencyKey: key(2) }
    const r = await createQuote(deps, me, body)
    expect(r.depositIntentId).toMatch(/^dp_[0-9a-z]{26}$/)
    expect(r.depositAddress).toMatch(/^SIMULATED-arb-[0-9a-f]{8}$/)
    expect(r.qrText).toBe("POT TESTNET DEMO - DO NOT SEND FUNDS")
    expect(Date.parse(String(r.deadline)) - clock).toBe(2 * 3600_000)
    const again = await createQuote(deps, me, body)
    expect(again).toMatchObject({ depositIntentId: r.depositIntentId, replayed: true })
    await expect(createQuote(deps, me, { ...body, amount: "100000000" })).rejects.toMatchObject({ reason: "idempotency_conflict" })
  })

  it("refuses: above $500 (rev4), below the minimum, paused chain, non-member, unknown Pot", async () => {
    await expect(createQuote(deps, me, { pot: DAO, chain: "base", amount: "500000001", idempotencyKey: key(3) })).rejects.toMatchObject({ reason: "amount_too_high" })
    await expect(createQuote(deps, me, { pot: DAO, chain: "base", amount: "999999", idempotencyKey: key(4) })).rejects.toMatchObject({ reason: "amount_too_low" })
    paused = new Set(["eth"])
    await expect(createQuote(deps, me, { pot: DAO, chain: "eth", amount: "150000000", idempotencyKey: key(5) })).rejects.toMatchObject({ reason: "chain_paused" })
    const stranger = await session("near-auth", "u-stranger.users.potapp.testnet")
    await expect(createQuote(deps, stranger, { pot: DAO, chain: "base", amount: "150000000", idempotencyKey: key(6) })).rejects.toMatchObject({ reason: "not_a_member" })
    await expect(createQuote(deps, me, { pot: `nope.${HUB}`, chain: "base", amount: "150000000", idempotencyKey: key(7) })).rejects.toMatchObject({ reason: "pot_unknown" })
  })

  it("falls back to the FLEX formula when 1Click is unreachable", async () => {
    deps.oneclick = { ...fakeOneClick, quote: async () => Promise.reject(new ApiError("quote_failed")) }
    const r = await createQuote(deps, me, { pot: DAO, chain: "sol", amount: "100000000", idempotencyKey: key(8) })
    expect(r.quote).toMatchObject({ amountIn: "100000000", minAmountIn: "99000000", amountOut: "99990000", timeEstimateSec: 42 })
  })

  it("at most 5 open deposits per person", async () => {
    for (let i = 0; i < 5; i++) {
      const q = await createQuote(deps, me, { pot: DAO, chain: "arb", amount: "10000000", idempotencyKey: key(20 + i) })
      await simulate(deps, me, { depositIntentId: String(q.depositIntentId), amount: "1000000", idempotencyKey: key(40 + i) })
    }
    await expect(createQuote(deps, me, { pot: DAO, chain: "arb", amount: "10000000", idempotencyKey: key(30) })).rejects.toMatchObject({
      reason: "quota_exceeded",
      detail: { family: "xc", why: "open_intents" },
    })
  })
})

describe("simulate → status → delivery → ADDED", () => {
  async function newIntent(amount = "150000000", chain: "arb" | "base" | "sol" = "arb", s = me) {
    const q = await createQuote(deps, s, { pot: DAO, chain, amount, idempotencyKey: key(100 + ++keyN) })
    return String(q.depositIntentId)
  }

  it("ok on Arbitrum: steps 1 → 2 → 3 → (delivery) 4, then ADDED from the member's own relayed contribution", async () => {
    const id = await newIntent()
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "PENDING_DEPOSIT", step: 1 })
    const r = await simulate(deps, me, { depositIntentId: id, idempotencyKey: key(1) })
    expect(r.profile).toMatchObject({ pendingSec: expect.any(Number), processingSec: expect.any(Number) })
    // replay
    expect(await simulate(deps, me, { depositIntentId: id, idempotencyKey: key(1) })).toMatchObject({ replayed: true })
    const { pendingSec, processingSec } = r.profile as { pendingSec: number; processingSec: number }
    clock += Math.ceil(pendingSec * 700)
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "KNOWN_DEPOSIT_TX", step: 2 })
    clock += Math.ceil(pendingSec * 300) + 1000
    const conv = await depositStatus(deps, me, id)
    expect(conv).toMatchObject({ status: "PROCESSING", step: 3 })
    expect(conv.processingSince).toBeDefined()
    clock += processingSec * 1000 + 1000
    // computed SUCCESS, but the money isn't in the account yet: still converting, delivery scheduled
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "PROCESSING", step: 3 })
    expect(deferred).toHaveLength(1)
    await runDeferred()
    // the treasury's real token transfer (1 yocto, ft_transfer, amount − 1 bp)
    const tx = sub.submitted.at(-1)!
    const quoted = String((await depositStatus(deps, me, id)).amountOutQuoted)
    expect(tx.spec.signerId).toBe(TREASURY)
    expect(tx.spec.receiverId).toBe(USDC)
    expect(methodOf(tx.spec)).toBe("ft_transfer")
    const fc = (tx.spec.actions[0] as unknown as { functionCall: { args: Uint8Array; deposit: bigint } }).functionCall
    // exactly the quoted amountOut (what the screen promised), the storage fee given back to a registered member
    expect(JSON.parse(new TextDecoder().decode(fc.args))).toMatchObject({ receiver_id: ME, amount: quoted })
    expect(fc.deposit).toBe(1n)
    expect(tx.opts.pool).toBe(cfg.treasuryPool)
    const arrived = await depositStatus(deps, me, id)
    expect(arrived).toMatchObject({ status: "SUCCESS", step: 4, amountOut: quoted, destinationTxHash: tx.txHash })
    expect(String(arrived.explorerUrl)).toContain(`/txns/${tx.txHash}`)
    // a second delivery attempt is a no-op
    await deliver(deps, id)
    expect(sub.submitted.filter((x) => x.spec.signerId === TREASURY)).toHaveLength(1)

    // the add: a relay_log row for this person's contribution to this Pot
    await t.db.insert(relayLog).values({
      id: "rl_01JBQZ5A6V0000000000000000",
      requestId: "r",
      userId: me.user.id,
      idempotencyKey: key(900),
      op: "relay",
      intent: "add_money",
      receiverId: USDC,
      potId: DAO,
      status: "executed",
      outcome: "success",
      result: { type: "contribution", recorded: true, amount: "149985000", usedAmount: "149985000" },
    })
    const added = await depositStatus(deps, me, id, { relayId: "rl_01JBQZ5A6V0000000000000000" })
    expect(added).toMatchObject({ status: "ADDED", step: 5, addedRelayId: "rl_01JBQZ5A6V0000000000000000" })
  })

  it("ADDED needs a real contribution of this person to this Pot", async () => {
    const id = await newIntent()
    await simulate(deps, me, { depositIntentId: id, idempotencyKey: key(2) })
    clock += 60_000
    await depositStatus(deps, me, id)
    await runDeferred()
    await t.db.insert(relayLog).values({
      id: "rl_01JBQZ5A6V0000000000000001",
      requestId: "r",
      userId: me.user.id,
      op: "relay",
      intent: "add_money",
      receiverId: USDC,
      potId: `other.${HUB}`,
      status: "executed",
      outcome: "success",
      result: { type: "contribution", recorded: true },
    })
    await expect(depositStatus(deps, me, id, { relayId: "rl_01JBQZ5A6V0000000000000001" })).rejects.toMatchObject({ reason: "bad_request" })
  })

  it("registers the member first when unregistered (like 1Click), then delivers", async () => {
    chain.view(USDC, "storage_balance_of", () => null)
    const id = await newIntent()
    await simulate(deps, me, { depositIntentId: id, idempotencyKey: key(3) })
    clock += 60_000
    await depositStatus(deps, me, id)
    await runDeferred()
    expect(sub.submitted.map((s) => `${s.spec.signerId}:${methodOf(s.spec)}`)).toEqual([`${RELAYER}:storage_deposit`, `${TREASURY}:ft_transfer`])
  })

  it("a failed delivery frees the lock and is retried on the next poll", async () => {
    let n = 0
    sub.script = (spec) => (n++ === 0 ? new Error("rpc down") : plainOutcome("x", spec.signerId, spec.receiverId))
    const id = await newIntent()
    await simulate(deps, me, { depositIntentId: id, idempotencyKey: key(4) })
    clock += 60_000
    await depositStatus(deps, me, id)
    await runDeferred()
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "PROCESSING" })
    await runDeferred()
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "SUCCESS" })
  })

  it("partial: INCOMPLETE with the deposited amount, then a top-up converts", async () => {
    const id = await newIntent("150000000", "base")
    await simulate(deps, me, { depositIntentId: id, scenario: "partial", idempotencyKey: key(5) })
    clock += 30_000
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "INCOMPLETE_DEPOSIT", step: 1, depositedAmount: "120000000" })
    // an "ok" re-send of a non-partial deposit is refused, a top-up of a partial one is accepted
    await simulate(deps, me, { depositIntentId: id, idempotencyKey: key(6) })
    clock += 60_000
    const s = await depositStatus(deps, me, id)
    expect(["PROCESSING", "SUCCESS"]).toContain(s.status)
  })

  it("partial on Solana, the owner's case: 'send $0.95 more' tapped twice → one top-up, no error, then it arrives", async () => {
    // the FLEX numbers for $5 (minimum $4.95), as on testnet
    deps.oneclick = { ...deps.oneclick, quote: async () => Promise.reject(new ApiError("quote_failed")) }
    const id = await newIntent("5000000", "sol")
    await simulate(deps, me, { depositIntentId: id, scenario: "partial", idempotencyKey: key(30) })
    clock += 60_000
    const inc = await depositStatus(deps, me, id)
    expect(inc).toMatchObject({ status: "INCOMPLETE_DEPOSIT", depositedAmount: "4000000", simulated: { sent: true, sentAmount: "4000000" } })
    expect(inc.minAmountIn).toBe("4950000")
    const missing = "950000"
    await simulate(deps, me, { depositIntentId: id, amount: missing, idempotencyKey: key(31) })
    // still INCOMPLETE until the top-up is spotted, but the body says the rest was sent
    const still = await depositStatus(deps, me, id)
    expect(still).toMatchObject({ status: "INCOMPLETE_DEPOSIT", simulated: { sentAmount: inc.minAmountIn } })
    const charged = await readQuota(t.db, `user:${me.user.id}`, "xc_sim_usd")
    // the second tap (same label, new key): answered like the first, nothing more sent or charged
    const again = await simulate(deps, me, { depositIntentId: id, amount: missing, idempotencyKey: key(32) })
    expect(again).toMatchObject({ replayed: true, topUp: "already_sent" })
    expect(await readQuota(t.db, `user:${me.user.id}`, "xc_sim_usd")).toBe(charged)
    clock += 3 * 60_000
    await depositStatus(deps, me, id)
    await runDeferred()
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "SUCCESS", depositedAmount: inc.minAmountIn })
  })

  it("failed / no_liquidity / expired end in their terminal states without any delivery", async () => {
    for (const [i, scenario, expected] of [
      [7, "failed", "FAILED"],
      [8, "no_liquidity", "REFUNDED"],
      [9, "expired", "EXPIRED"],
    ] as const) {
      const id = await newIntent("50000000")
      await simulate(deps, me, { depositIntentId: id, scenario, idempotencyKey: key(i) })
      clock += 3 * 60_000
      expect(await depositStatus(deps, me, id)).toMatchObject({ status: expected })
    }
    expect(sub.submitted).toHaveLength(0)
  })

  it("caps: amount ≤ the quote; $500 per person per day", async () => {
    const a = await newIntent("300000000")
    await expect(simulate(deps, me, { depositIntentId: a, amount: "300000001", idempotencyKey: key(10) })).rejects.toMatchObject({ reason: "amount_too_high" })
    await simulate(deps, me, { depositIntentId: a, idempotencyKey: key(11) })
    const b = await newIntent("200000000")
    await simulate(deps, me, { depositIntentId: b, idempotencyKey: key(12) })
    const c = await newIntent("10000000")
    await expect(simulate(deps, me, { depositIntentId: c, idempotencyKey: key(13) })).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "xc" } })

    // the cap is per person: another member (a wallet session) has their own $500
    const other = await session("wallet", "bob.testnet")
    const d1 = await newIntent("100000000", "arb", other)
    await simulate(deps, other, { depositIntentId: d1, idempotencyKey: key(21) })
  })

  it("owner only; real-mode intents can't be simulated", async () => {
    const id = await newIntent()
    const other = await session("near-auth", "u-other.users.potapp.testnet")
    await expect(depositStatus(deps, other, id)).rejects.toMatchObject({ reason: "not_found" })
    await t.db.update(depositIntent).set({ mode: "real" }).where(eq(depositIntent.id, id))
    await expect(simulate(deps, me, { depositIntentId: id, idempotencyKey: key(23) })).rejects.toMatchObject({ reason: "demo_forbidden" })
  })

  it("lists this person's in-progress and arrived deposits for a Pot (skips untouched addresses)", async () => {
    await newIntent()
    const sent = await newIntent()
    await simulate(deps, me, { depositIntentId: sent, idempotencyKey: key(24) })
    const r = await listDeposits(deps, me, DAO)
    expect(r.deposits.map((d) => d.id)).toEqual([sent])
  })
})

// ---------------------------------------------------------------------------------------------
// any coin (2026-11-04): more networks, coins whose price moves, availability, the exact bodies we send

const anyCoin = anyCoinFixtures as unknown as Record<string, QuoteResponse>
type QN = { amountIn: string; minAmountIn: string; amountOut: string }

/** A fake 1Click that answers like the recorded 2026-11-04 quotes and remembers every body it was sent. */
function recordingOneClick(opts: { tokens?: TokenInfo[] | null; refuse?: (b: QuoteRequestBody) => ApiError | null } = {}) {
  const bodies: QuoteRequestBody[] = []
  const client: OneClickClient = {
    async quote(body) {
      bodies.push(structuredClone(body))
      const refused = opts.refuse?.(body)
      if (refused) throw refused
      if (body.swapType === "EXACT_OUTPUT") {
        const q = structuredClone(anyCoin["probe-eth-base-20"]!)
        // the probe's minAmountIn scales with the dollars asked for
        q.quote.minAmountIn = ((BigInt(q.quote.minAmountIn) * BigInt(body.amount)) / 20_000_000n).toString()
        return q
      }
      const stable = body.slippageTolerance === 100
      const q = structuredClone(stable ? anyCoin["flex-usdc-op-20"]! : anyCoin["flex-eth-base-20"]!)
      const base = BigInt(q.quote.amountIn)
      q.quote.amountOut = ((BigInt(q.quote.amountOut) * BigInt(body.amount)) / base).toString()
      q.quote.minAmountOut = ((BigInt(q.quote.minAmountOut) * BigInt(body.amount)) / base).toString()
      q.quote.amountIn = body.amount
      q.quote.minAmountIn = ((BigInt(body.amount) * BigInt(10_000 - body.slippageTolerance)) / 10_000n).toString()
      if (!body.dry) Object.assign(q.quote, { depositAddress: "0x00000000000000000000000000000000000000aa", deadline: body.deadline })
      return q
    },
    async status() {
      return null
    },
    async pausedChains() {
      return paused as Set<never>
    },
    async tokens() {
      return opts.tokens === undefined ? (tokensSnapshot as TokenInfo[]) : opts.tokens
    },
  }
  return { client, bodies }
}

describe("any coin (2026-11-04)", () => {
  beforeEach(() => resetAvailabilityForTests())

  it("ETH on Base, $20: a dry EXACT_OUTPUT probe, then FLEX_INPUT at 300 bps for its minAmountIn rounded up to 4 digits", async () => {
    const f = recordingOneClick()
    deps.oneclick = f.client
    const r = await createQuote(deps, me, { pot: DAO, chain: "base", coin: "ETH", amount: "20000000", idempotencyKey: key(200) })
    const probe = anyCoin["probe-eth-base-20"]!.quote
    const amount = roundUpSig(BigInt(probe.minAmountIn)).toString()
    expect(f.bodies.map((b) => [b.swapType, b.dry, b.slippageTolerance, b.amount, b.originAsset, b.recipient])).toEqual([
      ["EXACT_OUTPUT", true, 100, "20000000", "nep141:base.omft.near", DRY_RECIPIENT],
      ["FLEX_INPUT", true, 300, amount, "nep141:base.omft.near", DRY_RECIPIENT],
    ])
    expect(amount).toBe("8621000000000000") // 0.008621 ETH (from 0.008620… on 2026-11-04)
    expect(r).toMatchObject({ mode: "simulated", coin: "ETH", decimals: 18, stable: false, usdTarget: "20000000" })
    expect(r.depositAddress).toMatch(/^SIMULATED-base-[0-9a-f]{8}$/)
    const q = r.quote as QN
    expect(q.amountIn).toBe(amount)
    expect(q.minAmountIn).toBe(((BigInt(amount) * 97n) / 100n).toString())
    // about $20 arrives (the recorded FLEX quote's out, + the storage fee given back to a registered member)
    expect(Number(q.amountOut) / 1e6).toBeGreaterThan(19.95)
    expect(Number(q.amountOut) / 1e6).toBeLessThan(20.05)
    const st = await depositStatus(deps, me, String(r.depositIntentId))
    expect(st).toMatchObject({ chain: "base", coin: "ETH", decimals: 18, stable: false, usdTarget: "20000000", amountIn: amount, amountOutQuoted: q.amountOut })
  })

  it("simulated ETH: sending the quoted coin amount credits exactly the quoted dollars; the daily cap counts dollars", async () => {
    deps.oneclick = recordingOneClick().client
    const r = await createQuote(deps, me, { pot: DAO, chain: "base", coin: "ETH", amount: "20000000", idempotencyKey: key(201) })
    const id = String(r.depositIntentId)
    const quotedOut = (r.quote as QN).amountOut
    await simulate(deps, me, { depositIntentId: id, idempotencyKey: key(202) })
    // charged in dollars at the quote's rate, not in wei
    expect(await readQuota(t.db, `user:${me.user.id}`, "xc_sim_usd")).toBe(20_000_000n)
    clock += 60_000
    await depositStatus(deps, me, id)
    await runDeferred()
    const tx = sub.submitted.at(-1)!
    const fc = (tx.spec.actions[0] as unknown as { functionCall: { args: Uint8Array } }).functionCall
    expect(JSON.parse(new TextDecoder().decode(fc.args))).toMatchObject({ receiver_id: ME, amount: quotedOut })
    expect(await depositStatus(deps, me, id)).toMatchObject({ status: "SUCCESS", amountOut: quotedOut, depositedAmount: (r.quote as QN).amountIn })
  })

  it("partial ETH: 80 % arrives, the missing coin amount tops it up; the credit follows what arrived", async () => {
    deps.oneclick = recordingOneClick().client
    const r = await createQuote(deps, me, { pot: DAO, chain: "arb", coin: "ETH", amount: "20000000", idempotencyKey: key(203) })
    const id = String(r.depositIntentId)
    const q = r.quote as QN
    await simulate(deps, me, { depositIntentId: id, scenario: "partial", idempotencyKey: key(204) })
    clock += 30_000
    const inc = await depositStatus(deps, me, id)
    expect(inc).toMatchObject({ status: "INCOMPLETE_DEPOSIT", depositedAmount: ((BigInt(q.amountIn) * 8n) / 10n).toString() })
    const missing = BigInt(q.minAmountIn) - BigInt(String(inc.depositedAmount))
    await simulate(deps, me, { depositIntentId: id, amount: missing.toString(), idempotencyKey: key(205) })
    clock += 60_000
    await depositStatus(deps, me, id)
    await runDeferred()
    const done = await depositStatus(deps, me, id)
    expect(done).toMatchObject({ status: "SUCCESS", depositedAmount: q.minAmountIn })
    expect(String(done.amountOut)).toBe(((BigInt(q.amountOut) * BigInt(q.minAmountIn)) / BigInt(q.amountIn)).toString())
  })

  it("stablecoins keep today's behaviour: one FLEX_INPUT quote at 100 bps for the same dollar amount (USDT on Optimism)", async () => {
    const f = recordingOneClick()
    deps.oneclick = f.client
    const r = await createQuote(deps, me, { pot: DAO, chain: "op", coin: "USDT", amount: "20000000", idempotencyKey: key(206) })
    expect(f.bodies).toHaveLength(1)
    expect(f.bodies[0]).toMatchObject({ swapType: "FLEX_INPUT", slippageTolerance: 100, amount: "20000000", originAsset: "nep245:v2_1.omni.hot.tg:10_359RPSJVdTxwTJT9TyGssr2rFoWo" })
    expect(r).toMatchObject({ coin: "USDT", stable: true, usdTarget: "20000000", quote: { amountIn: "20000000", minAmountIn: "19800000" } })
    // no coin named: USDC where the network has it (older clients)
    await createQuote(deps, me, { pot: DAO, chain: "op", amount: "20000000", dry: true, idempotencyKey: key(207) })
    expect(f.bodies.at(-1)?.originAsset).toBe("nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ")
  })

  it("price: the coin step's live quote, no Pot needed (people paying in), charged as a dry quote", async () => {
    deps.oneclick = recordingOneClick().client
    const stranger = await session("near-auth", "u-payer.users.potapp.testnet")
    const p = await priceQuote(deps, stranger, { chain: "base", coin: "ETH", amount: "25000000" })
    expect(p).toMatchObject({ mode: "simulated", chain: "base", coin: "ETH", decimals: 18, stable: false, usdTarget: "25000000", slippageBps: 300 })
    expect(Date.parse(String(p.quotedAt))).toBe(clock)
    expect(await readQuota(t.db, `user:${stranger.user.id}`, "xc_dry")).toBe(1n)
    expect(await t.db.select().from(depositIntent)).toHaveLength(0)
  })

  it("refuses a coin the network doesn't offer, below a network's minimum, and above $500", async () => {
    deps.oneclick = recordingOneClick().client
    await expect(createQuote(deps, me, { pot: DAO, chain: "base", coin: "SOL", amount: "20000000", idempotencyKey: key(208) })).rejects.toMatchObject({
      reason: "bad_request",
      detail: { field: "coin" },
    })
    await expect(priceQuote(deps, me, { chain: "tron", coin: "USDT", amount: "100000000" })).rejects.toMatchObject({ reason: "amount_too_low", detail: { minimum: "101000000" } })
    await expect(priceQuote(deps, me, { chain: "btc", coin: "BTC", amount: "5000000" })).rejects.toMatchObject({ reason: "amount_too_low", detail: { minimum: "10000000" } })
    await expect(priceQuote(deps, me, { chain: "sol", coin: "SOL", amount: "500000001" })).rejects.toMatchObject({ reason: "amount_too_high" })
  })

  it("quote errors make a coin 'temporarily unavailable' (or raise its minimum) for 10 min, then it's offered again", async () => {
    const f = recordingOneClick({
      refuse: (b) =>
        b.originAsset.includes("43114_372B") // USDT on Avalanche: a swap limit
          ? new ApiError("amount_too_low", { detail: { minUsd: "1000000000", why: "swap_limit" } })
          : b.originAsset === "nep141:sui.omft.near" // SUI: paused
            ? new ApiError("chain_paused")
            : b.originAsset === "nep141:btc.omft.near" && b.swapType === "EXACT_OUTPUT" // BTC: "try at least 6400" (sats)
              ? new ApiError("amount_too_low", { detail: { minimum: "6400" } })
              : null,
    })
    deps.oneclick = f.client
    await expect(priceQuote(deps, me, { chain: "avax", coin: "USDT", amount: "20000000" })).rejects.toMatchObject({ reason: "amount_too_low", detail: { minimum: "1010000000" } })
    await expect(priceQuote(deps, me, { chain: "sui", coin: "SUI", amount: "20000000" })).rejects.toMatchObject({ reason: "chain_paused" })
    // a coin minimum in its own units is answered in dollars (6,400 sats at the listed price + 10 %, whole dollars up)
    await expect(priceQuote(deps, me, { chain: "btc", coin: "BTC", amount: "10000000" })).rejects.toMatchObject({ reason: "amount_too_low", detail: { minimum: "6000000" } })
    let chains = (await listChains(deps)).chains
    expect(chains.find((c) => c.id === "avax")?.coins.find((c) => c.coin === "USDT")).toMatchObject({ status: "ok", minAmount: "1010000000" })
    expect(chains.find((c) => c.id === "sui")?.coins.find((c) => c.coin === "SUI")?.status).toBe("unavailable")
    expect(chains.find((c) => c.id === "sui")?.status).toBe("ok") // its USDC is still there
    // the memo answers at once next time, without asking 1Click
    const n = f.bodies.length
    await expect(priceQuote(deps, me, { chain: "sui", coin: "SUI", amount: "20000000" })).rejects.toMatchObject({ reason: "chain_paused" })
    expect(f.bodies).toHaveLength(n)
    clock += UNAVAILABLE_TTL_MS
    chains = (await listChains(deps)).chains
    expect(chains.find((c) => c.id === "sui")?.coins.find((c) => c.coin === "SUI")?.status).toBe("ok")
    expect(chains.find((c) => c.id === "avax")?.coins.find((c) => c.coin === "USDT")?.minAmount).toBe("1000000")
  })

  it("the catalogue: a curated coin missing from 1Click's token list (or with other decimals) is hidden; no list hides nothing", async () => {
    const tokens = (tokensSnapshot as TokenInfo[]).filter((x) => x.assetId !== "nep141:sui.omft.near").map((x) => (x.assetId === "nep141:aptos.omft.near" ? { ...x, decimals: 18 } : x))
    deps.oneclick = recordingOneClick({ tokens }).client
    const chains = (await listChains(deps)).chains
    expect(chains.find((c) => c.id === "sui")?.coins.map((c) => [c.coin, c.status])).toEqual([["USDC", "ok"], ["SUI", "unavailable"]])
    expect(chains.find((c) => c.id === "aptos")?.coins.find((c) => c.coin === "APT")?.status).toBe("unavailable")
    await expect(priceQuote(deps, me, { chain: "sui", coin: "SUI", amount: "20000000" })).rejects.toMatchObject({ reason: "chain_paused" })
    deps.oneclick = recordingOneClick({ tokens: null }).client
    expect((await listChains(deps)).chains.flatMap((c) => c.coins).every((c) => c.status === "ok")).toBe(true)
  })

  it("a quote whose signature doesn't verify (Bitcoin, 2026-11-04): fine for the simulator's preview, never for real money", async () => {
    const seen: (boolean | undefined)[] = []
    const strict: OneClickClient = {
      ...recordingOneClick().client,
      async quote(body, opts) {
        seen.push(opts?.unverifiedDryOk)
        if (!opts?.unverifiedDryOk) throw new ApiError("quote_failed", { detail: { cause: "signature" } })
        return { ...structuredClone(anyCoin["probe-btc-50"]!), unverified: true }
      },
    }
    deps.oneclick = strict
    const p = await priceQuote(deps, me, { chain: "btc", coin: "BTC", amount: "50000000" })
    expect(p).toMatchObject({ coin: "BTC", mode: "simulated" })
    expect(seen.every((x) => x === true)).toBe(true)
    // real mode: refused, and Bitcoin waits 10 min like a paused coin
    deps.cfg = { ...cfg, network: "mainnet" } as Config
    const prev = process.env.ONECLICK_MODE
    process.env.ONECLICK_MODE = "real"
    try {
      await expect(priceQuote(deps, me, { chain: "btc", coin: "BTC", amount: "50000000" })).rejects.toMatchObject({ reason: "quote_failed" })
      expect(seen.at(-1)).toBeUndefined()
      expect((await listChains(deps)).chains.find((c) => c.id === "btc")?.status).toBe("paused")
    } finally {
      if (prev === undefined) delete process.env.ONECLICK_MODE
      else process.env.ONECLICK_MODE = prev
      deps.cfg = cfg
    }
  })

  it("real mode (mainnet + ONECLICK_MODE=real): the member receives and is refunded; the probe is dry, the address quote isn't", async () => {
    const f = recordingOneClick()
    deps.oneclick = f.client
    deps.cfg = { ...cfg, network: "mainnet" } as Config
    const prev = process.env.ONECLICK_MODE
    process.env.ONECLICK_MODE = "real"
    try {
      const r = await createQuote(deps, me, { pot: DAO, chain: "sol", coin: "SOL", amount: "20000000", idempotencyKey: key(209) })
      expect(r).toMatchObject({ mode: "real", coin: "SOL", depositAddress: "0x00000000000000000000000000000000000000aa" })
      expect(f.bodies.map((b) => ({ ...b, deadline: "<now + 2 h>" }))).toMatchSnapshot()
      expect(f.bodies.every((b) => b.recipient === ME && b.refundTo === ME && b.refundType === "INTENTS" && b.recipientType === "DESTINATION_CHAIN")).toBe(true)
      expect(f.bodies.map((b) => b.dry)).toEqual([true, false])
      // simulating a real deposit is refused
      await expect(simulate(deps, me, { depositIntentId: String(r.depositIntentId), idempotencyKey: key(210) })).rejects.toMatchObject({ reason: "not_found" })
    } finally {
      if (prev === undefined) delete process.env.ONECLICK_MODE
      else process.env.ONECLICK_MODE = prev
    }
  })
})

describe("the exact quote bodies per network and coin (what Pot would send 1Click)", () => {
  const AT = Date.parse("2026-11-04T12:00:00Z")
  it("FLEX_INPUT for every curated coin (stablecoins 100 bps, others 300 bps), and the EXACT_OUTPUT probe", async () => {
    const { XC_CHAINS, XC_CONFIG } = await import("./origins")
    const bodies: Record<string, unknown> = {}
    for (const chain of XC_CHAINS)
      for (const a of XC_CONFIG[chain].assets) {
        bodies[`${chain}:${a.coin}`] = a.stable
          ? quoteBody(chain, "maya.near", 20_000_000n, false, AT, a.coin)
          : { probe: probeBody(chain, a.coin, "maya.near", 20_000_000n, AT), flex: quoteBody(chain, "maya.near", 10n ** BigInt(a.decimals), false, AT, a.coin) }
      }
    expect(bodies).toMatchSnapshot()
  })
})

describe("APP-8: the simulator's delivery guard", () => {
  const cfg = testConfig()
  const ok = { recipient: "u-maya0001.users.potapp.testnet", owner: "u-maya0001.users.potapp.testnet", amountOut: 50_000_000n }
  it("delivers only on testnet, to the deposit's owner, on the right network, never to our own accounts, within the cap", () => {
    expect(deliveryRefusal(cfg, ok)).toBeNull()
    expect(deliveryRefusal(cfg, { ...ok, recipient: "a".repeat(64), owner: "a".repeat(64) })).toBeNull()
    expect(deliveryRefusal({ ...cfg, network: "mainnet" }, ok)).toBe("network")
    expect(deliveryRefusal(cfg, { ...ok, owner: "sam.testnet" })).toBe("not_owner")
    expect(deliveryRefusal(cfg, { ...ok, owner: null })).toBe("not_owner")
    expect(deliveryRefusal(cfg, { ...ok, recipient: "maya.near", owner: "maya.near" })).toBe("receiver_network")
    for (const ours of [cfg.treasuryAccountId, cfg.relayerAccountId, cfg.hubId, DAO, "potapp.testnet"])
      expect(deliveryRefusal(cfg, { ...ok, recipient: ours, owner: ours }), ours).toBe("receiver_ours")
    expect(deliveryRefusal(cfg, { ...ok, amountOut: SIM_MAX * 2n + 1n })).toBe("amount")
  })
})
