// hub 1.1.0 (wave 4) SDK surface: earned trust / one-OK decide twin, extras wire, pay-by-link
// builders + claim crypto (byte-identical to the hub's message), parse of the new views.
import { describe, expect, it } from "vitest"
import { buildCall, intentFromWire, intentToWire } from "./actions/build.ts"
import { GAS, RELAY_POLICY, directDeposit } from "./actions/gas.ts"
import { decodeLinkKind, decodeRulesKind, linkTransferKind, rulesKind } from "./actions/kinds.ts"
import { CLAIM_DOMAIN, buildClaimLink, claimMessage, parseClaimLink, signClaimWebCrypto, verifyClaimWebCrypto, webCryptoEd25519Supported } from "./invite.ts"
import { decideSpend, type DecideInput } from "./math/decide.ts"
import { parsePotView, parseRecordEntry, parseRequestView, parseSpendOutcome, parseTrustView } from "./read/parse.ts"
import { defaultExtras, effectiveCap, extrasFromRaw, extrasToRaw, validateExtras } from "./rules.ts"
import { generateClaimKey, signClaim, verifyClaim } from "./sign/invite.ts"
import type { RawPotView, RawRequestView } from "./types/hub-raw.ts"
import { LEGACY_EXTRAS, PRESET_RULES, type RuleExtras } from "./types/hub.ts"
import type { AccountId, DaoId, Slug } from "./types/ids.ts"

const HUB = "pots.potprev.testnet"
const USDC = "usdc.potprev.testnet"
const DAO = "lisbon-trip.pots.potprev.testnet" as DaoId
const MAYA = "maya.testnet" as AccountId
const cfg = { hubId: HUB, usdcId: USDC }
const trip = PRESET_RULES.trip
const ON: RuleExtras = { trust: true, oneOkCap: 300_000_000n, links: true, goal: null }

describe("rule extras", () => {
  it("defaults = trust on, one-OK 3 × the cap, links on, no goal", () => {
    expect(defaultExtras(trip)).toEqual(ON)
    expect(extrasFromRaw(undefined)).toEqual(LEGACY_EXTRAS)
  })
  it("raw round trip, key order = the contract struct", () => {
    const x: RuleExtras = { ...ON, goal: { amount: 500_000_000n, deadlineMs: 1_800_000_000_000, allOrNothing: true } }
    const raw = extrasToRaw(x)
    expect(JSON.stringify(raw)).toBe(
      '{"trust":true,"one_ok_cap":"300000000","links":true,"goal":{"amount":"500000000","deadline_ms":1800000000000,"all_or_nothing":true}}',
    )
    expect(extrasFromRaw(raw)).toEqual(x)
  })
  it("effective cap = cap × (1 + level) with trust on", () => {
    expect(effectiveCap(trip, ON, 0)).toBe(100_000_000n)
    expect(effectiveCap(trip, ON, 2)).toBe(300_000_000n)
    expect(effectiveCap(trip, LEGACY_EXTRAS, 2)).toBe(100_000_000n)
  })
  it("validateExtras = the hub's validate_extras", () => {
    const now = 1_800_000_000_000
    const goal = (deadlineMs: number, allOrNothing = true) => ({ amount: 1n, deadlineMs, allOrNothing })
    expect(validateExtras(trip, ON, now)).toBeNull()
    expect(validateExtras(trip, { ...ON, oneOkCap: 99_000_000n }, now)).toBe("ERR_EXTRAS_INVALID")
    expect(validateExtras(trip, { ...ON, oneOkCap: 0n }, now)).toBeNull()
    expect(validateExtras(trip, { ...ON, goal: goal(now + 60_000) }, now)).toBe("ERR_GOAL_INVALID")
    expect(validateExtras(trip, { ...ON, goal: goal(now + 61_000) }, now)).toBeNull()
    const v1 = { extras: ON, policyVersion: 1, goalLocked: false }
    expect(validateExtras(trip, { ...ON, goal: goal(now + 3_600_000) }, now, v1)).toBe("ERR_GOAL_UNSUPPORTED")
    expect(validateExtras(trip, { ...ON, goal: goal(now + 3_600_000, false) }, now, v1)).toBeNull()
    const locked = { extras: { ...ON, goal: goal(now - 1) }, policyVersion: 2, goalLocked: true }
    expect(validateExtras(trip, { ...ON, goal: goal(now + 3_600_000) }, now, locked)).toBe("ERR_GOAL_LOCKED")
    expect(validateExtras(trip, { ...ON, trust: false, goal: goal(now - 1) }, now, locked)).toBeNull() // goal unchanged
  })
})

describe("decide twin (hub 1.1.0)", () => {
  const base: DecideInput = {
    paused: false,
    potOpen: true,
    hubId: HUB,
    daoId: DAO,
    usdcId: USDC,
    rules: trip,
    requestCount: 0,
    maxRequestsPerPot: 1000,
    maxPendingPerMember: 10,
    requester: { instantUsed: 0n, contributed: 150_000_000n, pendingVotes: 0 },
    receiverIsMember: true,
    receiverId: MAYA,
    amount: 84_000_000n,
    extras: ON,
    trustLevel: 0,
    memberCount: 3,
  }
  it("tiers: instant ≤ effective cap < one_ok ≤ oneOkCap < group", () => {
    expect(decideSpend(base)).toMatchObject({ ok: true, path: "instant", tier: "instant" })
    expect(decideSpend({ ...base, amount: 150_000_000n })).toMatchObject({ path: "vote", reason: "over_cap", tier: "one_ok" })
    expect(decideSpend({ ...base, amount: 150_000_000n, trustLevel: 1 })).toMatchObject({ path: "instant", tier: "instant" })
    expect(decideSpend({ ...base, amount: 301_000_000n })).toMatchObject({ path: "vote", tier: "group" })
    expect(decideSpend({ ...base, amount: 150_000_000n, memberCount: 1 })).toMatchObject({ tier: "group" })
    expect(decideSpend({ ...base, amount: 150_000_000n, extras: LEGACY_EXTRAS, trustLevel: 2 })).toMatchObject({ tier: "group" })
    // the budget still bounds a trusted member
    expect(decideSpend({ ...base, amount: 150_000_000n, trustLevel: 1, requester: { ...base.requester!, instantUsed: 100_000_000n } })).toMatchObject({
      path: "vote",
      reason: "over_budget",
    })
  })
  it("links: the hub is the receiver, links must be on; a link is an allowed payee", () => {
    expect(decideSpend({ ...base, isLink: true, receiverId: HUB, receiverIsMember: false })).toMatchObject({ path: "instant", tier: "instant" })
    expect(decideSpend({ ...base, isLink: true })).toMatchObject({ ok: false, code: "ERR_BAD_RECEIVER" })
    expect(decideSpend({ ...base, receiverId: HUB })).toMatchObject({ ok: false, code: "ERR_BAD_RECEIVER" })
    expect(decideSpend({ ...base, isLink: true, receiverId: HUB, extras: LEGACY_EXTRAS })).toMatchObject({ ok: false, code: "ERR_LINKS_OFF" })
  })
  it("an all-or-nothing goal not reached blocks spends", () => {
    expect(decideSpend({ ...base, goalBlocksSpends: true })).toMatchObject({ ok: false, code: "ERR_GOAL_NOT_REACHED", previewReason: "goal_not_reached" })
  })
})

describe("builders (hub 1.1.0)", () => {
  const pk = "ed25519:8qEj7CUDgW32n2E7k1z6s1N8xZ2b3c4d5e6f7g8h9jA" as const
  const spend = { type: "request_spend" as const, pot: DAO, amount: 25_000_000n, receiverId: MAYA, category: "food" as const, requestRef: "k3d9x1a2b4c6m7n8" }
  it("request_spend without a link is byte-identical to 1.0.0", () => {
    const c = buildCall(spend, cfg)
    const a = c.actions[0]!
    expect(a.type === "FunctionCall" && Object.keys(a.args)).toEqual(["pot", "amount", "receiver_id", "category", "request_ref"])
    expect(a.type === "FunctionCall" && a.gas).toBe(GAS.request_spend)
  })
  it("a link request names the hub, carries the claim key and more gas", () => {
    const c = buildCall({ ...spend, receiverId: HUB as AccountId, link: { claimPk: pk } }, cfg)
    const a = c.actions[0]!
    expect(a.type === "FunctionCall" && a.args).toEqual({
      pot: DAO,
      amount: "25000000",
      receiver_id: HUB,
      category: "food",
      request_ref: "k3d9x1a2b4c6m7n8",
      link: { claim_pk: pk, expires_at_ms: null },
    })
    expect(a.type === "FunctionCall" && a.gas).toBe(GAS.request_spend_link)
    expect(GAS.request_spend_link <= BigInt(RELAY_POLICY.request_spend!.gasMaxTgas) * 10n ** 12n).toBe(true)
    expect(() => buildCall({ ...spend, link: { claimPk: pk } }, cfg)).toThrow(/hub id/)
  })
  it("create_pot / rules with extras; without them no key", () => {
    const create = { type: "create_pot" as const, slug: "fund" as Slug, name: "Fund", preset: "trip" as const, rules: null }
    const a0 = buildCall(create, cfg).actions[0]!
    expect(a0.type === "FunctionCall" && "extras" in a0.args).toBe(false)
    const a1 = buildCall({ ...create, extras: ON }, cfg).actions[0]!
    expect(a1.type === "FunctionCall" && a1.args.extras).toEqual(extrasToRaw(ON))
    const r = buildCall({ type: "propose_rules", pot: DAO, rules: trip, extras: ON }, cfg).actions[0]!
    expect(r.type === "FunctionCall" && r.args).toEqual({ pot: DAO, rules: { instant_cap: "100000000", member_budget: "200000000", instant_payees: "members", payee_allowlist: [] }, extras: extrasToRaw(ON) })
    const w = intentToWire({ ...create, extras: ON })
    expect(JSON.parse(JSON.stringify(w))).toMatchObject({ extras: { trust: true, oneOkCap: "300000000" } })
    expect(intentFromWire(JSON.parse(JSON.stringify(w)))).toEqual({ ...create, extras: ON })
  })
  it("ok_request / claim_link / reclaim_link / refund_unfunded", () => {
    const ok = buildCall({ type: "ok_request", pot: DAO, requestId: 7 }, cfg)
    expect(ok).toMatchObject({ receiverId: HUB, actions: [{ method: "ok_request", args: { pot: DAO, request_id: 7 }, gas: GAS.ok_request, deposit: 0n }] })
    const claim = { type: "claim_link" as const, pot: DAO, requestId: 7, receiverId: MAYA, signature: "sig" }
    expect(buildCall(claim, cfg).actions[0]).toMatchObject({ method: "claim_link", args: { pot: DAO, request_id: 7, receiver_id: MAYA, signature: "sig" }, deposit: 0n })
    expect(buildCall(claim, cfg, { direct: true }).actions[0]).toMatchObject({ deposit: directDeposit("claim_link") })
    expect(directDeposit("claim_link")).toBeGreaterThanOrEqual(1_250_000_000_000_000_000_000n + 1_000_000_000_000_000_000_000n)
    expect(buildCall({ type: "reclaim_link", pot: DAO, requestId: 7 }, cfg).actions[0]).toMatchObject({ method: "reclaim_link", gas: GAS.reclaim_link })
    expect(buildCall({ type: "refund_unfunded", pot: DAO }, cfg).actions[0]).toMatchObject({ method: "refund_unfunded", gas: GAS.refund_unfunded })
    for (const m of ["ok_request", "claim_link", "reclaim_link"]) {
      const row = RELAY_POLICY[m]!
      const g = Number(GAS[m as keyof typeof GAS] / 10n ** 12n)
      expect(g >= row.gasMinTgas && g <= row.gasMaxTgas && row.deposit === 0n).toBe(true)
    }
    expect(RELAY_POLICY.refund_unfunded).toBeUndefined()
  })
})

describe("kinds (= contracts/pot-hub/src/kinds.rs)", () => {
  it("link escrow kind, byte-identical to the hub's link_kind_exact_json test", () => {
    const k = linkTransferKind("usdc.potapp.testnet", "pots.potapp.testnet", 25_000_000n, 7)
    expect(JSON.stringify(k)).toBe('{"Transfer":{"token_id":"usdc.potapp.testnet","receiver_id":"pots.potapp.testnet","amount":"25000000","msg":"{\\"link\\":7}"}}')
    expect(decodeLinkKind(k, "pots.potapp.testnet")).toBe(7)
    expect(decodeLinkKind(k, "pots.other.testnet")).toBeNull()
  })
  it("rules kind with extras round-trips; without extras it is the 1.0.0 kind", () => {
    const k = rulesKind(HUB, DAO, trip, ON)
    expect(decodeRulesKind(k, HUB)).toEqual({ pot: DAO, rules: trip, extras: ON })
    expect(decodeRulesKind(rulesKind(HUB, DAO, trip), HUB)).toEqual({ pot: DAO, rules: trip })
  })
})

describe("pay-by-link crypto (= the hub's message)", () => {
  it("message format", () => {
    expect(CLAIM_DOMAIN).toBe("pot-claim:v1")
    expect(claimMessage(HUB, DAO, 7, MAYA)).toBe("pot-claim:v1:pots.potprev.testnet:lisbon-trip.pots.potprev.testnet:7:maya.testnet")
  })
  it("sign / verify bind hub, pot, request and receiver", () => {
    const k = generateClaimKey()
    const sig = signClaim(k.secret, HUB, DAO, 7, MAYA)
    expect(sig).toMatch(/^[A-Za-z0-9+/]{86}==$/)
    expect(verifyClaim(k.publicKey, HUB, DAO, 7, MAYA, sig)).toBe(true)
    expect(verifyClaim(k.publicKey, HUB, DAO, 7, "eve.testnet", sig)).toBe(false)
    expect(verifyClaim(k.publicKey, HUB, DAO, 8, MAYA, sig)).toBe(false)
    expect(verifyClaim(k.publicKey, "pots.other.testnet", DAO, 7, MAYA, sig)).toBe(false)
  })
  it("WebCrypto twin signs identically (Ed25519 is deterministic)", async () => {
    if (!(await webCryptoEd25519Supported())) return
    const k = generateClaimKey()
    const a = await signClaimWebCrypto(k.seed, HUB, DAO, 3, MAYA)
    expect(a).toBe(signClaim(k.seed, HUB, DAO, 3, MAYA))
    expect(await verifyClaimWebCrypto(k.publicKey, HUB, DAO, 3, MAYA, a)).toBe(true)
  })
  it("claim links", () => {
    const k = generateClaimKey()
    const url = buildClaimLink({ origin: "https://pot.app/", slug: "lisbon-trip", requestId: 7, secret: k.secret })
    expect(url).toBe(`https://pot.app/c/lisbon-trip/7#${k.secret}`)
    expect(parseClaimLink(url)).toEqual({ slug: "lisbon-trip", requestId: 7, secret: k.secret })
    expect(parseClaimLink("/c/lisbon-trip/7")).toEqual({ slug: "lisbon-trip", requestId: 7, secret: null })
    expect(parseClaimLink("/j/lisbon-trip?i=x")).toBeNull()
  })
})

describe("parse (hub 1.1.0)", () => {
  const rawPot = {
    pot: DAO, slug: "lisbon-trip", name: "Lisbon", emoji: null, preset: "trip", seq: 3,
    rules: { instant_cap: "100000000", member_budget: "200000000", instant_payees: "members", payee_allowlist: [] },
    rules_version: 1, status: "open", close_proposal_id: null, creator: MAYA, created_at_ms: 1, closed_at_ms: null,
    member_count: 3, joining_count: 0, approvals_needed: 2, proposal_period_ms: 604_800_000, total_contributed: "0",
    spent_instant: "0", spent_vote: "0", reserved: "0", balance_estimate: "0", last_contributor: null, request_count: 0,
    open_requests: 0, active_invites: 0, unpaid_approved: 0, float: "1", usdc: USDC,
  } as RawPotView
  it("a 1.0.0 PotView parses to the legacy extras", () => {
    expect(parsePotView(rawPot)).toMatchObject({ extras: LEGACY_EXTRAS, policyVersion: 1, openLinks: 0, goalState: "none" })
  })
  it("a 1.1.0 PotView", () => {
    const p = parsePotView({ ...rawPot, extras: extrasToRaw(ON), policy_version: 2, open_links: 1, goal_state: "collecting" })
    expect(p).toMatchObject({ extras: ON, policyVersion: 2, openLinks: 1, goalState: "collecting" })
  })
  it("requests and outcomes default the tier from the path on 1.0.0 data", () => {
    const r = {
      request_id: 1, pot: DAO, requester: MAYA, receiver_id: MAYA, amount: "1", category: "food", request_ref: "abcdefgh",
      path: "vote", reason: "over_cap", status: "pending", proposal_id: 3, created_at_ms: 1, updated_at_ms: 1, expires_at_ms: 2,
    } as RawRequestView
    expect(parseRequestView(r)).toMatchObject({ tier: "group", okBy: null, linkStatus: null })
    expect(parseRequestView({ ...r, tier: "one_ok", ok_by: "sam.testnet", link_status: "funded" })).toMatchObject({ tier: "one_ok", okBy: "sam.testnet", linkStatus: "funded" })
    expect(parseSpendOutcome({ request_id: 1, proposal_id: 2, path: "instant", reason: "within_rules", status: "approved", refusal: null, approvals_needed: 2 })).toMatchObject({ tier: "instant", link: false })
  })
  it("trust view and record entry", () => {
    const t = parseTrustView({
      pot: DAO, account_id: MAYA, enabled: true, level: 1, max_level: 2, streak: 0, step: 3, next_level_in: 3, min_qualifying: "2000000",
      settled: 4, settled_amount: "16000000", declined: 0, last_declined_ms: null, base_cap: "20000000", multiplier: 2,
      effective_cap: "40000000", budget_left: "984000000", instant_up_to: "40000000", one_ok_cap: "60000000",
    })
    expect(t).toMatchObject({ account: MAYA, level: 1, effectiveCap: 40_000_000n, instantUpTo: 40_000_000n, lastDeclinedMs: null })
    const e = parseRecordEntry({
      request_id: 5, proposal_id: 9, requester: MAYA, payee: null, link: true, amount: "25000000", category: "food", request_ref: "abcdefgh",
      tier: "instant", approved_by: "rules", ok_by: null, status: "approved", money: "held_for_link", link_status: "funded", created_at_ms: 1, updated_at_ms: 2,
    })
    expect(e).toMatchObject({ requestId: 5, payee: null, link: true, amount: 25_000_000n, money: "held_for_link", approvedBy: "rules" })
  })
})
