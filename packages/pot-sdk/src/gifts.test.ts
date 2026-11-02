// hub 1.2.0 gifts: msg builder / parser, event parse, views parse, intents → CallSpec, the close-split
// twin (shared vectors with contracts/pot-hub prorata.rs close_split), relay policy row.
import { existsSync, readFileSync } from "node:fs"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { buildCall, intentFromWire, intentToWire } from "./actions/build.ts"
import { GAS, RELAY_POLICY, directDeposit } from "./actions/gas.ts"
import { giftAmountError, giftMsg, isValidGiftRef, parseGiftMsg, parseGiftReceived } from "./gifts.ts"
import { closeSplit, closeSplitKind, prorata } from "./math/prorata.ts"
import { parseClosePreview, parseGiftsView, parseGoalView, parsePotView } from "./read/parse.ts"
import { errorCodeFromText, HUB_ERROR_CODES } from "./types/errors.ts"
import { formatEventLog, HUB_EVENT_NAMES, isHubEvent, parseEventLog } from "./types/events.ts"
import { GIFT_LIMITS } from "./types/hub.ts"
import type { RawPotView } from "./types/hub-raw.ts"
import type { DaoId } from "./types/ids.ts"
import { ACTION_INTENT_TYPES } from "./types/intents.ts"
import { RELAY_INTENT_TYPES } from "./types/api.ts"

const cfg = { hubId: "pots.potapp.testnet", usdcId: "usdc.potapp.testnet" }
const POT = "lisbon-trip.pots.potapp.testnet" as DaoId

describe("gift msg", () => {
  it("builds the exact msg the hub parses (pot, gift)", () => {
    expect(giftMsg(POT, "Zm9vYmFyYmF6cXV4MTIzNA")).toBe(`{"pot":"${POT}","gift":"Zm9vYmFyYmF6cXV4MTIzNA"}`)
    expect(parseGiftMsg(giftMsg(POT, "a-b_c"))).toEqual({ pot: POT, giftRef: "a-b_c" })
  })
  it("refs: 1-32 of [A-Za-z0-9_-]", () => {
    for (const ok of ["a", "AbC-_09", "x".repeat(32)]) expect(isValidGiftRef(ok)).toBe(true)
    for (const bad of ["", "x".repeat(33), "a b", "a.b", "é", "a+b", "a=b"]) expect(isValidGiftRef(bad)).toBe(false)
    expect(() => giftMsg(POT, "bad ref")).toThrow()
  })
  it("parseGiftMsg: only {pot, gift}", () => {
    expect(parseGiftMsg(JSON.stringify({ pot: POT }))).toBeNull() // a contribution
    expect(parseGiftMsg(JSON.stringify({ link: 3 }))).toBeNull()
    expect(parseGiftMsg(JSON.stringify({ pot: POT, gift: "r", x: 1 }))).toBeNull()
    expect(parseGiftMsg(JSON.stringify({ pot: POT, gift: 7 }))).toBeNull()
    expect(parseGiftMsg("{")).toBeNull()
    expect(parseGiftMsg("[]")).toBeNull()
  })
  it("amount bounds: ≥ $1", () => {
    expect(giftAmountError(999_999n)).toBe("too_small")
    expect(giftAmountError(1_000_000n)).toBeNull()
    expect(giftAmountError(GIFT_LIMITS.maxAmount + 1n)).toBe("too_large")
  })
})

describe("gift events + errors", () => {
  const line = formatEventLog({
    standard: "pot",
    version: "1.2.0",
    event: "gift_received",
    data: { pot: POT, from: "ana.users.potapp.testnet", amount: "10000000", ref: "lnk1", gifts_total: "25000000", gifts_count: 3 },
  })
  it("parses gift_received", () => {
    const e = parseEventLog(line)
    expect(isHubEvent(e, "gift_received")).toBe(true)
    expect(parseGiftReceived(e)).toEqual({ pot: POT, from: "ana.users.potapp.testnet", amount: 10_000_000n, ref: "lnk1", giftsTotal: 25_000_000n, giftsCount: 3 })
    expect(parseGiftReceived({ standard: "pot", event: "contribution", data: {} })).toBeNull()
  })
  it("event names + error codes", () => {
    expect(HUB_EVENT_NAMES).toContain("gift_received")
    expect(HUB_EVENT_NAMES).toContain("gifts_set")
    for (const c of ["ERR_GIFTS_OFF", "ERR_GIFT_TOO_SMALL", "ERR_GIFT_REF_INVALID", "ERR_GIFT_SELF", "ERR_GIFT_IN_FLIGHT", "ERR_GOAL_COLLECTING"])
      expect(HUB_ERROR_CODES).toContain(c)
    expect(errorCodeFromText("Smart contract panicked: ERR_GIFTS_OFF")).toBe("ERR_GIFTS_OFF")
  })
})

describe("gift views", () => {
  it("get_gifts", () => {
    expect(
      parseGiftsView({ pot: POT, on: false, total: "15000000", count: 2, last_gift_ms: 5, in_flight: false, accepting: false, refusal: "gifts_off", min_amount: "1000000" }),
    ).toEqual({ pot: POT, on: false, total: 15_000_000n, count: 2, lastGiftMs: 5, inFlight: false, accepting: false, refusal: "gifts_off", minAmount: 1_000_000n })
  })
  const rawPot = (extra: Partial<RawPotView>): RawPotView => ({
    pot: POT, slug: "lisbon-trip", name: "Lisbon", emoji: null, preset: "trip", seq: 1,
    rules: { instant_cap: "100000000", member_budget: "200000000", instant_payees: "members", payee_allowlist: [] },
    rules_version: 1, status: "open", close_proposal_id: null, creator: "maya.near", created_at_ms: 1, closed_at_ms: null,
    member_count: 2, joining_count: 0, approvals_needed: 2, proposal_period_ms: 604_800_000, total_contributed: "200000000",
    spent_instant: "0", spent_vote: "0", reserved: "0", balance_estimate: "210000000", last_contributor: null, request_count: 0,
    open_requests: 0, active_invites: 0, unpaid_approved: 0, float: "1", usdc: "usdc.near", ...extra,
  })
  it("get_pot gift fields (absent on older hubs)", () => {
    const p = parsePotView(rawPot({ gifts_on: true, gifts_total: "10000000", gifts_count: 1 }))
    expect([p.giftsOn, p.giftsTotal, p.giftsCount, p.totalIn, p.balanceEstimate]).toEqual([true, 10_000_000n, 1, 200_000_000n, 210_000_000n])
    const old = parsePotView(rawPot({}))
    expect([old.giftsOn, old.giftsTotal, old.giftsCount]).toEqual([undefined, undefined, undefined])
  })
  it("goal progress + close preview split", () => {
    const g = parseGoalView({ pot: POT, amount: "50000000", deadline_ms: 9, all_or_nothing: false, total_contributed: "30000000", gifts_total: "20000000", progress: "50000000", state: "reached", reached_at_ms: 3, refund_proposal_id: null, can_refund: false, spends_blocked: false })
    expect([g.totalIn, g.giftsTotal, g.progress]).toEqual([30_000_000n, 20_000_000n, 50_000_000n])
    const c = parseClosePreview({ pot: POT, balance: "100000000", balance_source: "ledger", total_contributed: "0", gifts_total: "100000000", split: "equal", approvals_needed: 2, open_requests: 0, payouts: [], dust: "1", dust_to: "c.near", can_propose: true, blocked_reason: null })
    expect([c.giftsTotal, c.split]).toEqual([100_000_000n, "equal"])
  })
})

describe("gift intents", () => {
  it("send_gift → usdc.ft_transfer_call, 100 Tgas, 1 yocto, the gift msg", () => {
    const c = buildCall({ type: "send_gift", pot: POT, amount: 5_000_000n, giftRef: "lnk1" }, cfg)
    expect(c).toEqual({
      receiverId: cfg.usdcId,
      actions: [{ type: "FunctionCall", method: "ft_transfer_call", args: { receiver_id: cfg.hubId, amount: "5000000", msg: `{"pot":"${POT}","gift":"lnk1"}` }, gas: GAS.ft_transfer_call, deposit: 1n }],
    })
    expect(() => buildCall({ type: "send_gift", pot: POT, amount: 999_999n, giftRef: "lnk1" }, cfg)).toThrow(/at least \$1/)
    expect(() => buildCall({ type: "send_gift", pot: POT, amount: 5_000_000n, giftRef: "a b" }, cfg)).toThrow(/giftRef/)
  })
  it("set_gifts → hub, 30 Tgas, 0 deposit (relayed); direct pays the first write", () => {
    const c = buildCall({ type: "set_gifts", pot: POT, on: false }, cfg)
    expect(c).toEqual({ receiverId: cfg.hubId, actions: [{ type: "FunctionCall", method: "set_gifts", args: { pot: POT, on: false }, gas: GAS.set_gifts, deposit: 0n }] })
    const d = buildCall({ type: "set_gifts", pot: POT, on: false }, cfg, { direct: true })
    expect(d.actions[0]).toMatchObject({ deposit: directDeposit("set_gifts") })
    expect(directDeposit("set_gifts")).toBeGreaterThan(0n)
  })
  it("wire round trip + intent lists", () => {
    const i = { type: "send_gift" as const, pot: POT, amount: 25_000_000n, giftRef: "x" }
    expect(intentToWire(i)).toEqual({ ...i, amount: "25000000" })
    expect(intentFromWire(intentToWire(i))).toEqual(i)
    expect(ACTION_INTENT_TYPES).toEqual(expect.arrayContaining(["send_gift", "set_gifts"]))
    expect(RELAY_INTENT_TYPES).toEqual(expect.arrayContaining(["send_gift", "set_gifts"]))
    expect(RELAY_POLICY.set_gifts).toMatchObject({ rule: "R17", receiver: "hub", deposit: 0n, gasMinTgas: 10, gasMaxTgas: 50 })
  })
})

interface VectorFile {
  vectors: {
    id: string
    balance: string
    contributions: { account_id: string; contributed: string }[]
    last_contributor: string | null
    expected: { payouts?: { account_id: string; amount: string }[]; dust?: string; dust_to?: string; nothing_to_refund?: boolean }
  }[]
}
const load = (u: URL): VectorFile => JSON.parse(readFileSync(u, "utf8")) as VectorFile

function check(file: VectorFile): void {
  for (const v of file.vectors) {
    const r = closeSplit(
      BigInt(v.balance),
      v.contributions.map((c) => ({ account: c.account_id, contributed: BigInt(c.contributed) })),
      v.last_contributor,
    )
    if (v.expected.nothing_to_refund) {
      expect(r, v.id).toBeNull()
      continue
    }
    expect(r?.payouts.map((p) => ({ account_id: p.account, amount: p.amount.toString() })), v.id).toEqual(v.expected.payouts)
    expect(r?.dust.toString(), v.id).toBe(v.expected.dust)
    expect(r?.dustTo, v.id).toBe(v.expected.dust_to)
  }
}

describe("close split (twin of prorata.rs close_split)", () => {
  const mine = new URL("./math/vectors/close-split.json", import.meta.url)
  it("shared vectors E1-E10", () => {
    const f = load(mine)
    expect(f.vectors.map((v) => v.id)).toEqual(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10"])
    check(f)
  })
  it("parity with the contract's copy, when present", () => {
    const theirs = new URL("../../../contracts/tests/vectors/close-split.json", import.meta.url)
    if (!existsSync(theirs)) return
    expect(load(theirs).vectors).toEqual(load(mine).vectors)
  })
  it("equal when nobody contributed; = prorata otherwise", () => {
    const zero = [{ account: "a", contributed: 0n }, { account: "b", contributed: 0n }, { account: "c", contributed: 0n }]
    expect(closeSplitKind(zero)).toBe("equal")
    expect(closeSplit(100_000_000n, zero)?.payouts.map((p) => p.amount)).toEqual([33_333_333n, 33_333_333n, 33_333_334n])
    const mixed = [{ account: "a", contributed: 0n }, { account: "b", contributed: 5n }]
    expect(closeSplitKind(mixed)).toBe("prorata")
    expect(closeSplit(10n, mixed, "b")).toEqual(prorata(10n, mixed, "b"))
    expect(closeSplit(10n, [])).toBeNull()
    expect(closeSplit(0n, zero)).toBeNull()
  })
  it("properties: Σ = B, floor(B/n) each, the dust < n to the last member", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.bigInt({ min: 1n, max: 1_000_000_000_000_000n }), (n, b) => {
        const ms = Array.from({ length: n }, (_, i) => ({ account: `m${i}`, contributed: 0n }))
        const r = closeSplit(b, ms)!
        const each = b / BigInt(n)
        expect(r.payouts.reduce((t, p) => t + p.amount, 0n)).toBe(b)
        expect(r.dust).toBe(b - each * BigInt(n))
        expect(r.dustTo).toBe(`m${n - 1}`)
      }),
      { numRuns: 500 },
    )
  })
})
