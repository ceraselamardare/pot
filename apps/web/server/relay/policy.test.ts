// The relayer policy table (api-spec §3.1 R1-R12, §8 "Relayer safety", A-01, A-22, A-24): every rule
// accepted at its bounds and refused just outside them, on real signed delegates decoded canonically.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { parseTestAllowlist } from "../config"
import { ApiError } from "../http/errors"
import { DAO, fc, HUB, newKey, signDelegate, TGAS, transfer, USDC, USER, addFullAccessKey } from "../testing/delegates"
import { decodeSignedDelegate, verifyDelegateSignature } from "./decode"
import { evaluatePolicy, type PolicyContext } from "./policy"

const key = newKey()
const NOW = 1_793_000_000_000
const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  hubId: HUB,
  usdcId: USDC,
  nowMs: NOW,
  testAllowlist: parseTestAllowlist("wrap.testnet:ft_transfer:1"),
  ...over,
})

type Act = ReturnType<typeof fc>
async function run(receiver: string, actions: Act[], c: Partial<PolicyContext> = {}) {
  const { b64 } = await signDelegate({ key, receiver, actions })
  const d = decodeSignedDelegate(b64)
  try {
    return { match: evaluatePolicy(d, ctx(c)) }
  } catch (e) {
    if (e instanceof ApiError) return { reason: e.reason, detail: e.detail }
    throw e
  }
}

const contribute = (over: Record<string, unknown> = {}, gas = 100, dep = 1n) =>
  fc("ft_transfer_call", { receiver_id: HUB, amount: "150000000", msg: JSON.stringify({ pot: DAO }), ...over }, gas, dep)
const RULES = { instant_cap: "100000000", member_budget: "200000000", instant_payees: "members", payee_allowlist: [] }
const createArgs = (over: Record<string, unknown> = {}) => ({ slug: "lisbon-trip-7k2f", name: "Lisbon Trip", preset: "trip", ...over })
const spendArgs = (over: Record<string, unknown> = {}) => ({
  pot: DAO,
  amount: "84000000",
  receiver_id: USER,
  category: "groceries",
  request_ref: "k3d9x1a2b4c6m7n8",
  ...over,
})
const PK = "ed25519:8qEj7CUDgW32n2E7k1z6s1N8xZ2b3c4d5e6f7g8h9jA"
const realPk = newKey().getPublicKey().toString()
const SIG = Buffer.alloc(64, 7).toString("base64")
const transferKind = { Transfer: { token_id: USDC, receiver_id: USER, amount: "300000000", msg: null } }
const callKind = { FunctionCall: { receiver_id: USDC, actions: [] } }

type Case = [name: string, receiver: string, actions: () => Act[], expected: string, c?: Partial<PolicyContext>]

const cases: Case[] = [
  // ---- general ----
  ["no actions", USDC, () => [], "action_not_allowed"],
  ["Transfer action", USDC, () => [transfer(1n)], "action_not_allowed"],
  ["AddKey in /api/relay (R12 only via device routes)", USER, () => [addFullAccessKey(realPk)], "action_not_allowed"],
  ["two calls outside the rotate pair", USDC, () => [contribute(), contribute()], "action_not_allowed"],
  ["unknown receiver", "evil.testnet", () => [fc("x", {})], "receiver_not_allowed"],
  ["near_deposit on wrap (unlisted method)", "wrap.testnet", () => [fc("near_deposit", {}, 30, 10n ** 22n)], "method_not_allowed"],
  // ---- R1 ----
  ["R1 accepts a 100 Tgas, 1 yocto contribution", USDC, () => [contribute()], "R1"],
  ["R1 accepts 150 Tgas and $10,000", USDC, () => [contribute({ amount: "10000000000" }, 150)], "R1"],
  ["R1 deposit 2 yocto", USDC, () => [contribute({}, 100, 2n)], "deposit_cap"],
  ["R1 deposit 0", USDC, () => [contribute({}, 100, 0n)], "deposit_cap"],
  ["R1 300 Tgas", USDC, () => [contribute({}, 300)], "gas_cap"],
  ["R1 99 Tgas", USDC, () => [contribute({}, 99)], "gas_cap"],
  ["R1 to a non-hub receiver", USDC, () => [contribute({ receiver_id: "evil.testnet" })], "args_invalid"],
  ["R1 amount 0", USDC, () => [contribute({ amount: "0" })], "args_invalid"],
  ["R1 amount over $10,000", USDC, () => [contribute({ amount: "10000000001" })], "args_invalid"],
  ["R1 with a memo", USDC, () => [contribute({ memo: "hi" })], "args_invalid"],
  ["R1 msg with extra keys", USDC, () => [contribute({ msg: JSON.stringify({ pot: DAO, x: 1 }) })], "args_invalid"],
  ["R1 msg for a foreign DAO", USDC, () => [contribute({ msg: JSON.stringify({ pot: "x.sputnik-dao.near" }) })], "args_invalid"],
  ["R1 msg not JSON", USDC, () => [contribute({ msg: "pot" })], "args_invalid"],
  ["R1 ft_transfer (not _call)", USDC, () => [fc("ft_transfer", { receiver_id: HUB, amount: "1" }, 100, 1n)], "method_not_allowed"],
  ["R1 storage_withdraw", USDC, () => [fc("storage_withdraw", {}, 30, 1n)], "method_not_allowed"],
  ["R1 non-JSON args", USDC, () => [fc("ft_transfer_call", "not json", 100, 1n)], "args_invalid"],
  ["R1 intent mismatch", USDC, () => [contribute()], "args_invalid", { intent: "vote" }],
  // ---- R2 ----
  ["R2 accepts create_pot at 300 Tgas", HUB, () => [fc("create_pot", createArgs(), 300)], "R2"],
  ["R2 accepts 150 Tgas with rules, invite and emoji", HUB, () => [fc("create_pot", createArgs({ rules: RULES, invite_pk: realPk, emoji: "🇵🇹", float: null }), 150)], "R2"],
  ["R2 any deposit on a hub method", HUB, () => [fc("create_pot", createArgs(), 300, 1n)], "deposit_cap"],
  ["R2 gas 100", HUB, () => [fc("create_pot", createArgs(), 100)], "gas_cap"],
  ["R2 slug with --", HUB, () => [fc("create_pot", createArgs({ slug: "a--b" }), 300)], "args_invalid"],
  ["R2 slug too short", HUB, () => [fc("create_pot", createArgs({ slug: "a" }), 300)], "args_invalid"],
  ["R2 reserved slug", HUB, () => [fc("create_pot", createArgs({ slug: "admin" }), 300)], "args_invalid"],
  ["R2 uppercase slug", HUB, () => [fc("create_pot", createArgs({ slug: "Lisbon" }), 300)], "args_invalid"],
  ["R2 name 1 char", HUB, () => [fc("create_pot", createArgs({ name: "L" }), 300)], "args_invalid"],
  ["R2 name 41 chars", HUB, () => [fc("create_pot", createArgs({ name: "x".repeat(41) }), 300)], "args_invalid"],
  ["R2 name with a bidi override", HUB, () => [fc("create_pot", createArgs({ name: "Lis‮bon" }), 300)], "args_invalid"],
  ["R2 unknown preset", HUB, () => [fc("create_pot", createArgs({ preset: "party" }), 300)], "args_invalid"],
  ["R2 custom without rules", HUB, () => [fc("create_pot", createArgs({ preset: "custom" }), 300)], "args_invalid"],
  ["R2 rules over the instant cap bound", HUB, () => [fc("create_pot", createArgs({ rules: { ...RULES, instant_cap: "1000000001" } }), 300)], "args_invalid"],
  ["R2 allowlist with members-only payees", HUB, () => [fc("create_pot", createArgs({ rules: { ...RULES, payee_allowlist: ["a.testnet"] } }), 300)], "args_invalid"],
  ["R2 allowlist of 11", HUB, () => [fc("create_pot", createArgs({ rules: { ...RULES, instant_payees: "members_and_allowlist", payee_allowlist: Array.from({ length: 11 }, (_, i) => `a${i}.testnet`) } }), 300)], "args_invalid"],
  ["R2 emoji with ASCII", HUB, () => [fc("create_pot", createArgs({ emoji: "A" }), 300)], "args_invalid"],
  ["R2 emoji over 16 bytes", HUB, () => [fc("create_pot", createArgs({ emoji: "🇵🇹🇵🇹🇵🇹" }), 300)], "args_invalid"],
  ["R2 bad invite_pk", HUB, () => [fc("create_pot", createArgs({ invite_pk: "ed25519:xyz" }), 300)], "args_invalid"],
  ["R2 unknown field", HUB, () => [fc("create_pot", createArgs({ owner: "me" }), 300)], "args_invalid"],
  // ---- R3 ----
  ["R3 accepts request_spend at 150 Tgas", HUB, () => [fc("request_spend", spendArgs(), 150)], "R3"],
  ["R3 requestRef must equal args.request_ref", HUB, () => [fc("request_spend", spendArgs(), 150)], "args_invalid", { requestRef: "zzzzzzzzzzzzzzzz" }],
  ["R3 accepts a matching requestRef", HUB, () => [fc("request_spend", spendArgs(), 150)], "R3", { requestRef: "k3d9x1a2b4c6m7n8", intent: "request_spend" }],
  ["R3 gas 200", HUB, () => [fc("request_spend", spendArgs(), 200)], "gas_cap"],
  ["R3 unknown category", HUB, () => [fc("request_spend", spendArgs({ category: "boats" }), 150)], "args_invalid"],
  ["R3 request_ref not an OpKey", HUB, () => [fc("request_spend", spendArgs({ request_ref: "ABC" }), 150)], "args_invalid"],
  ["R3 amount 0", HUB, () => [fc("request_spend", spendArgs({ amount: "0" }), 150)], "args_invalid"],
  ["R3 invalid receiver", HUB, () => [fc("request_spend", spendArgs({ receiver_id: "Bad..id" }), 150)], "args_invalid"],
  ["R3 pot of another hub", HUB, () => [fc("request_spend", spendArgs({ pot: "x.pots.other.testnet" }), 150)], "args_invalid"],
  // ---- R4 ----
  ["R4 accepts join", HUB, () => [fc("join", { pot: DAO, invite_pk: realPk, signature: SIG }, 100)], "R4"],
  ["R4 signature without padding", HUB, () => [fc("join", { pot: DAO, invite_pk: realPk, signature: SIG.replace(/=+$/, "") }, 100)], "args_invalid"],
  ["R4 invite_pk without prefix", HUB, () => [fc("join", { pot: DAO, invite_pk: realPk.slice(8), signature: SIG }, 100)], "args_invalid"],
  ["R4 gas 300", HUB, () => [fc("join", { pot: DAO, invite_pk: realPk, signature: SIG }, 300)], "gas_cap"],
  // ---- R5 ----
  ["R5 add_invite with nulls (hub applies 7 d, 10 uses)", HUB, () => [fc("add_invite", { pot: DAO, invite_pk: realPk, expires_at_ms: null, max_uses: null }, 30)], "R5"],
  ["R5 add_invite at 30 days and 40 uses", HUB, () => [fc("add_invite", { pot: DAO, invite_pk: realPk, expires_at_ms: NOW + 30 * 86_400_000, max_uses: 40 }, 30)], "R5"],
  ["R5 expiry past 30 days (A-24)", HUB, () => [fc("add_invite", { pot: DAO, invite_pk: realPk, expires_at_ms: NOW + 30 * 86_400_000 + 1 }, 30)], "args_invalid"],
  ["R5 expiry in the past", HUB, () => [fc("add_invite", { pot: DAO, invite_pk: realPk, expires_at_ms: NOW - 1 }, 30)], "args_invalid"],
  ["R5 max_uses 41 (A-24)", HUB, () => [fc("add_invite", { pot: DAO, invite_pk: realPk, max_uses: 41 }, 30)], "args_invalid"],
  ["R5 revoke_invite", HUB, () => [fc("revoke_invite", { pot: DAO, invite_pk: realPk }, 30)], "R5"],
  ["R5 gas 60", HUB, () => [fc("revoke_invite", { pot: DAO, invite_pk: realPk }, 60)], "gas_cap"],
  ["R5 rotate pair", HUB, () => [fc("revoke_invite", { pot: DAO, invite_pk: realPk }, 30), fc("add_invite", { pot: DAO, invite_pk: realPk }, 30)], "R5"],
  ["R5 rotate pair over 100 Tgas total", HUB, () => [fc("revoke_invite", { pot: DAO, invite_pk: realPk }, 50), fc("add_invite", { pot: DAO, invite_pk: realPk }, 51)], "gas_cap"],
  ["R5 rotate pair across Pots", HUB, () => [fc("revoke_invite", { pot: DAO, invite_pk: realPk }, 30), fc("add_invite", { pot: `other.${HUB}`, invite_pk: realPk }, 30)], "args_invalid"],
  ["R5 pair in the wrong order", HUB, () => [fc("add_invite", { pot: DAO, invite_pk: realPk }, 30), fc("revoke_invite", { pot: DAO, invite_pk: realPk }, 30)], "action_not_allowed"],
  // ---- R6 / R7 / R8 / R9 / R10 ----
  ["R6 set_rules", HUB, () => [fc("set_rules", { pot: DAO, rules: RULES }, 30)], "R6"],
  ["R6 gas 80", HUB, () => [fc("set_rules", { pot: DAO, rules: RULES }, 80)], "gas_cap"],
  ["R7 propose_rules", HUB, () => [fc("propose_rules", { pot: DAO, rules: RULES }, 100)], "R7"],
  ["R7 propose_rules bad rules", HUB, () => [fc("propose_rules", { pot: DAO, rules: { ...RULES, member_budget: "-1" } }, 100)], "args_invalid"],
  ["R8 propose_close", HUB, () => [fc("propose_close", { pot: DAO }, 150)], "R8"],
  ["R8 gas 100", HUB, () => [fc("propose_close", { pot: DAO }, 100)], "gas_cap"],
  ["R9 retry_payout", HUB, () => [fc("retry_payout", { pot: DAO, proposal_id: 3 }, 100)], "R9"],
  ["R9 sync at 50 Tgas", HUB, () => [fc("sync", { pot: DAO, proposal_id: 3 }, 50)], "R9"],
  ["R9 proposal_id as a string", HUB, () => [fc("sync", { pot: DAO, proposal_id: "3" }, 50)], "args_invalid"],
  ["R10 withdraw_request is Phase 3", HUB, () => [fc("withdraw_request", { pot: DAO, request_id: 1 }, 100)], "method_not_allowed"],
  ["hub set_config", HUB, () => [fc("set_config", { patch: {} }, 30)], "method_not_allowed"],
  ["hub ft_on_transfer", HUB, () => [fc("ft_on_transfer", {}, 30)], "method_not_allowed"],
  // ---- R11 ----
  ["R11 VoteApprove on a Transfer at exactly 100 Tgas", DAO, () => [fc("act_proposal", { id: 3, action: "VoteApprove", proposal: transferKind }, 100)], "R11"],
  ["R11 VoteReject", DAO, () => [fc("act_proposal", { id: 3, action: "VoteReject", proposal: transferKind }, 100)], "R11"],
  ["R11 Finalize on a call kind at 300 Tgas", DAO, () => [fc("act_proposal", { id: 4, action: "Finalize", proposal: callKind }, 300)], "R11"],
  // frontend request 10: a vote on the hub's set_rules FunctionCall proposal (a rules change) at exactly 300 Tgas
  ["R11 VoteApprove on a rules (set_rules) call kind at 300 Tgas", DAO, () => [fc("act_proposal", { id: 5, action: "VoteApprove", proposal: { FunctionCall: { receiver_id: HUB, actions: [{ method_name: "set_rules", args: "e30=", deposit: "0", gas: "15000000000000" }] } } }, 300)], "R11"],
  ["R11 a rules vote at 100 Tgas", DAO, () => [fc("act_proposal", { id: 5, action: "VoteApprove", proposal: { FunctionCall: { receiver_id: HUB, actions: [{ method_name: "set_rules", args: "e30=", deposit: "0", gas: "15000000000000" }] } } }, 100)], "gas_cap"],
  ["R11 300 Tgas on a Transfer vote", DAO, () => [fc("act_proposal", { id: 3, action: "VoteApprove", proposal: transferKind }, 300)], "gas_cap"],
  ["R11 200 Tgas on a call vote", DAO, () => [fc("act_proposal", { id: 4, action: "VoteApprove", proposal: callKind }, 200)], "gas_cap"],
  ["R11 RemoveProposal", DAO, () => [fc("act_proposal", { id: 3, action: "VoteRemove", proposal: transferKind }, 100)], "args_invalid"],
  ["R11 with a memo", DAO, () => [fc("act_proposal", { id: 3, action: "VoteApprove", proposal: transferKind, memo: "hi" }, 100)], "args_invalid"],
  ["R11 without the stored kind", DAO, () => [fc("act_proposal", { id: 3, action: "VoteApprove" }, 100)], "args_invalid"],
  ["R11 ChangePolicy kind", DAO, () => [fc("act_proposal", { id: 3, action: "VoteApprove", proposal: { ChangePolicy: {} } }, 100)], "args_invalid"],
  ["R11 add_proposal (member-created proposals are never relayed)", DAO, () => [fc("add_proposal", { proposal: {} }, 100)], "method_not_allowed"],
  ["R11 a deposit on a vote", DAO, () => [fc("act_proposal", { id: 3, action: "VoteApprove", proposal: transferKind }, 100, 1n)], "deposit_cap"],
  ["R11 a DAO of a different hub", "lisbon.pots.other.testnet", () => [fc("act_proposal", { id: 3, action: "VoteApprove", proposal: transferKind }, 100)], "receiver_not_allowed"],
  ["R11 a nested sub-account of a DAO", `x.${DAO}`, () => [fc("act_proposal", { id: 3, action: "VoteApprove", proposal: transferKind }, 100)], "receiver_not_allowed"],
  // ---- test allowlist (never on production) ----
  ["TEST wrap.testnet ft_transfer with 1 yocto", "wrap.testnet", () => [fc("ft_transfer", { receiver_id: "a.testnet", amount: "1" }, 30, 1n)], "TEST"],
  ["TEST wrap.testnet ft_transfer with 2 yocto", "wrap.testnet", () => [fc("ft_transfer", { receiver_id: "a.testnet", amount: "1" }, 30, 2n)], "deposit_cap"],
  ["TEST allowlist off (production config)", "wrap.testnet", () => [fc("ft_transfer", { receiver_id: "a.testnet", amount: "1" }, 30, 1n)], "receiver_not_allowed", { testAllowlist: [] }],
]

describe("relayer policy table", () => {
  it.each(cases)("%s", async (_name, receiver, actions, expected, c) => {
    const r = await run(receiver, actions(), c)
    if (expected.startsWith("R") || expected === "TEST") expect(r.match?.rule ?? r.reason).toBe(expected)
    else expect(r.reason ?? `accepted ${r.match?.rule}`).toBe(expected)
  })

  it("derives family, Pot and estimates", async () => {
    const a = (await run(USDC, [contribute()])).match!
    expect(a).toMatchObject({ family: "contribute", potId: DAO, intent: "add_money", needsOpenPot: true })
    const v = (await run(DAO, [fc("act_proposal", { id: 4, action: "Finalize", proposal: callKind }, 300)])).match!
    expect(v.vote).toMatchObject({ daoId: DAO, proposalId: 4, action: "Finalize", kindName: "FunctionCall" })
    expect(v.estYocto).toBe(30_600_000_000_000_000_000_000n) // 0.03 + 0.0006 sync (rev4)
    const c = (await run(HUB, [fc("create_pot", createArgs(), 300)])).match!
    expect(c).toMatchObject({ potId: `lisbon-trip-7k2f.${HUB}`, hubYocto: 61_000_000_000_000_000_000_000n })
  })
})

describe("decode and signature (§3.2 steps 4 and 8)", () => {
  it("decodes canonically and verifies the NEP-461-prefixed signature", async () => {
    const { b64 } = await signDelegate({ key, receiver: USDC, actions: [contribute()], nonce: 77n, maxBlockHeight: 900n })
    const d = decodeSignedDelegate(b64)
    expect(d).toMatchObject({ senderId: USER, receiverId: USDC, nonce: 77n, maxBlockHeight: 900n })
    expect(d.publicKey).toBe(key.getPublicKey().toString())
    expect(d.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyDelegateSignature(d)).toBe(true)
  })

  it("rejects tampered bytes as a bad signature", async () => {
    const { bytes } = await signDelegate({ key, receiver: USDC, actions: [contribute()] })
    const t = Uint8Array.from(bytes)
    // flip a byte inside the amount string ("150000000" → "150000001")
    const s = Buffer.from(t).toString("latin1")
    const i = s.indexOf("150000000")
    t[i + 8] = "1".charCodeAt(0)
    const d = decodeSignedDelegate(Buffer.from(t).toString("base64"))
    expect(await verifyDelegateSignature(d)).toBe(false)
  })

  it("rejects a signature by another key", async () => {
    const other = newKey()
    const { bytes } = await signDelegate({ key, receiver: USDC, actions: [contribute()] })
    const { bytes: theirs } = await signDelegate({ key: other, receiver: USDC, actions: [contribute()] })
    const mixed = Uint8Array.from(bytes)
    mixed.set(theirs.slice(theirs.length - 64), mixed.length - 64)
    expect(await verifyDelegateSignature(decodeSignedDelegate(Buffer.from(mixed).toString("base64")))).toBe(false)
  })

  it.each([
    ["not base64", "%%%"],
    ["empty", ""],
    ["truncated", "AAAA"],
  ])("rejects %s with bad_request", (_n, v) => {
    expect(() => decodeSignedDelegate(v)).toThrow(ApiError)
  })

  it("rejects trailing bytes (non-canonical)", async () => {
    const { bytes } = await signDelegate({ key, receiver: USDC, actions: [contribute()] })
    const longer = new Uint8Array([...bytes, 0])
    expect(() => decodeSignedDelegate(Buffer.from(longer).toString("base64"))).toThrow(/bad_request/)
  })

  it("rejects a delegate over 4 KB", async () => {
    const { b64 } = await signDelegate({ key, receiver: USDC, actions: [fc("ft_transfer_call", { pad: "x".repeat(4200) }, 100, 1n)] })
    expect(() => decodeSignedDelegate(b64)).toThrow(/bad_request/)
  })

  it("keeps AddKey details for the device routes (R12)", async () => {
    const { b64 } = await signDelegate({ key, receiver: USER, actions: [addFullAccessKey(realPk)] })
    const d = decodeSignedDelegate(b64)
    expect(d.actions[0]).toEqual({ kind: "addKey", publicKey: realPk, fullAccess: true })
  })

  it("gas units are Tgas", () => {
    expect(TGAS).toBe(10n ** 12n)
    expect(PK.startsWith("ed25519:")).toBe(true)
  })
})

describe("@pot/sdk buildCall ↔ relayer policy (reconciliation)", async () => {
  const { buildCall } = await import("@pot/sdk")
  const { toNearActions } = await import("@pot/sdk/sign")
  const cfg = { hubId: HUB, usdcId: USDC } as never
  const rules = { instantCap: 100_000_000n, memberBudget: 200_000_000n, instantPayees: "members", payeeAllowlist: [] }
  const intents: [string, Record<string, unknown>, string][] = [
    ["add_money", { type: "add_money", pot: DAO, amount: 150_000_000n }, "R1"],
    ["request_spend", { type: "request_spend", pot: DAO, amount: 84_000_000n, receiverId: USER, category: "groceries", requestRef: "k3d9x1a2b4c6m7n8" }, "R3"],
    ["vote (Transfer)", { type: "vote", pot: DAO, proposalId: 3, kind: transferKind, action: "VoteApprove" }, "R11"],
    ["vote (call)", { type: "vote", pot: DAO, proposalId: 4, kind: callKind, action: "Finalize" }, "R11"],
    ["join", { type: "join", pot: DAO, invitePk: realPk, signature: SIG }, "R4"],
    ["create_pot (explicit nulls)", { type: "create_pot", slug: "lisbon-trip-7k2f", name: "Lisbon Trip", preset: "trip", rules: null }, "R2"],
    ["create_pot (custom rules)", { type: "create_pot", slug: "club-2", name: "Club", preset: "custom", rules, invitePk: realPk, emoji: "🏃" }, "R2"],
    ["add_invite", { type: "add_invite", pot: DAO, invitePk: realPk }, "R5"],
    ["revoke_invite", { type: "revoke_invite", pot: DAO, invitePk: realPk }, "R5"],
    ["rotate_invite", { type: "rotate_invite", pot: DAO, oldPk: realPk, newPk: realPk }, "R5"],
    ["propose_close", { type: "propose_close", pot: DAO }, "R8"],
    ["retry_payout", { type: "retry_payout", pot: DAO, proposalId: 3 }, "R9"],
    ["set_rules", { type: "set_rules", pot: DAO, rules }, "R6"],
    ["propose_rules", { type: "propose_rules", pot: DAO, rules }, "R7"],
  ]
  it.each(intents)("%s is accepted as %s", async (_n, intent, rule) => {
    const call = buildCall(intent as never, cfg)
    const r = await run(call.receiverId, toNearActions(call), { intent: (intent.type as string) === "rotate_invite" ? "rotate_invite" : (intent.type as string) })
    expect(r.match?.rule ?? r.reason).toBe(rule)
  })
})
