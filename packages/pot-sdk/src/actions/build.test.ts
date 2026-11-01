// U-06 buildCall per intent (exact receiver, method, args JSON, gas, deposit = relayer defaults,
// api-spec §3.1) and U-07 kinds (byte-for-byte with contracts/pot-hub/src/kinds.rs tests).
import { describe, expect, it } from "vitest"
import { testnetConfig } from "../config.ts"
import { base64Encode, utf8Encode } from "../encoding.ts"
import type { AccountId, DaoId, PublicKeyStr, Slug } from "../types/ids.ts"
import type { ActionIntent } from "../types/intents.ts"
import { BuildError, buildCall, buildSync, callSpecToJson, intentFromWire, intentToWire } from "./build.ts"
import { GAS, MILLI_NEAR, RELAY_POLICY, TGAS, directDeposit, voteGas } from "./gas.ts"
import {
  closeDescription,
  closeKind,
  decodeCloseKind,
  decodeRulesKind,
  joinKind,
  kindLabel,
  kindsEqual,
  rulesDescription,
  rulesKind,
  spendDescription,
  transferKind,
} from "./kinds.ts"

const cfg = testnetConfig("potapp")
const HUB = "pots.potapp.testnet"
const USDC = "usdc.potapp.testnet"
const DAO = "lisbon-trip.pots.potapp.testnet" as DaoId
const MAYA = "maya.users.potapp.testnet" as AccountId
const PK = "ed25519:8qEjY9rV1bKk4M1xGdrgWW3T2Zy4kq6WY7uHUnF1hW1m" as PublicKeyStr
const PK2 = "ed25519:7CUDgW32nTdWTSCuZxF1TXBp6aXmJR5o6Zc4TVcdgLZh" as PublicKeyStr

/** The exact bytes near-api-js will put in the FunctionCall (it JSON.stringifies the args object). */
const argsJson = (i: ActionIntent, n = 0) => {
  const a = buildCall(i, cfg).actions[n]
  return a?.type === "FunctionCall" ? JSON.stringify(a.args) : null
}
const fc = (i: ActionIntent, n = 0) => {
  const a = buildCall(i, cfg).actions[n]
  if (a?.type !== "FunctionCall") throw new Error("not a FunctionCall")
  return a
}

describe("buildCall (U-06)", () => {
  it("add_money → usdc.ft_transfer_call, 100 Tgas, exactly 1 yocto, no memo (D-06, R1)", () => {
    const i: ActionIntent = { type: "add_money", pot: DAO, amount: 150_000_000n }
    expect(buildCall(i, cfg).receiverId).toBe(USDC)
    expect(argsJson(i)).toBe(`{"receiver_id":"${HUB}","amount":"150000000","msg":"{\\"pot\\":\\"${DAO}\\"}"}`)
    expect(fc(i)).toMatchObject({ method: "ft_transfer_call", gas: 100n * TGAS, deposit: 1n })
  })

  it("request_spend → hub, 150 Tgas, 0 deposit (contracts-spec §3.4 example)", () => {
    const i: ActionIntent = { type: "request_spend", pot: DAO, amount: 84_000_000n, receiverId: MAYA, category: "groceries", requestRef: "k3d9x1a2b4c6m7n8" }
    expect(buildCall(i, cfg).receiverId).toBe(HUB)
    expect(argsJson(i)).toBe(`{"pot":"${DAO}","amount":"84000000","receiver_id":"${MAYA}","category":"groceries","request_ref":"k3d9x1a2b4c6m7n8"}`)
    expect(fc(i)).toMatchObject({ method: "request_spend", gas: 150n * TGAS, deposit: 0n })
    expect(() => buildCall({ ...i, requestRef: "BAD" }, cfg)).toThrow(BuildError)
    expect(() => buildCall({ ...i, amount: 0n }, cfg)).toThrow(BuildError)
  })

  it("vote: Transfer and AddMemberToRole at exactly 100 Tgas; FunctionCall (close, rules) at exactly 300 (R11)", () => {
    const tk = transferKind(USDC, MAYA, 300_000_000n)
    const v: ActionIntent = { type: "vote", pot: DAO, proposalId: 3, kind: tk, action: "VoteApprove" }
    expect(buildCall(v, cfg).receiverId).toBe(DAO)
    expect(argsJson(v)).toBe(`{"id":3,"action":"VoteApprove","proposal":{"Transfer":{"token_id":"${USDC}","receiver_id":"${MAYA}","amount":"300000000","msg":null}}}`)
    expect(fc(v)).toMatchObject({ method: "act_proposal", gas: 100n * TGAS, deposit: 0n })
    expect(fc({ ...v, kind: joinKind(MAYA) }).gas).toBe(100n * TGAS)
    expect(fc({ ...v, kind: closeKind(USDC, [{ account: MAYA, amount: 22n }]), action: "Finalize" }).gas).toBe(300n * TGAS)
    expect(fc({ ...v, kind: rulesKind(HUB, DAO, { instantCap: 1n, memberBudget: 2n, instantPayees: "members", payeeAllowlist: [] }), action: "VoteReject" }).gas).toBe(300n * TGAS)
    expect("memo" in (fc(v).args as object)).toBe(false)
  })

  it("join → hub, 100 Tgas", () => {
    const sig = "A".repeat(86) + "=="
    const i: ActionIntent = { type: "join", pot: DAO, invitePk: PK, signature: sig }
    expect(argsJson(i)).toBe(`{"pot":"${DAO}","invite_pk":"${PK}","signature":"${sig}"}`)
    expect(fc(i)).toMatchObject({ method: "join", gas: 100n * TGAS, deposit: 0n })
  })

  it("create_pot → hub, 300 Tgas (relayer default; 150-300 accepted), nulls for absent options", () => {
    const i: ActionIntent = { type: "create_pot", slug: "lisbon-trip-7k2f" as Slug, name: "Lisbon Trip", preset: "trip", rules: null, invitePk: PK, emoji: "\u{1F1F5}\u{1F1F9}" }
    expect(argsJson(i)).toBe(`{"slug":"lisbon-trip-7k2f","name":"Lisbon Trip","preset":"trip","rules":null,"invite_pk":"${PK}","emoji":"\u{1F1F5}\u{1F1F9}","float":null}`)
    expect(fc(i)).toMatchObject({ method: "create_pot", gas: 300n * TGAS, deposit: 0n })
    const custom: ActionIntent = { type: "create_pot", slug: "x1" as Slug, name: "X", preset: "custom", rules: { instantCap: 50_000_000n, memberBudget: 150_000_000n, instantPayees: "members", payeeAllowlist: [] } }
    expect(argsJson(custom)).toBe(
      `{"slug":"x1","name":"X","preset":"custom","rules":{"instant_cap":"50000000","member_budget":"150000000","instant_payees":"members","payee_allowlist":[]},"invite_pk":null,"emoji":null,"float":null}`,
    )
    expect(() => buildCall({ ...custom, rules: null }, cfg)).toThrow(BuildError)
  })

  it("invites: add/revoke 30 Tgas each; rotate = one delegate with [revoke_invite, add_invite] (R5)", () => {
    expect(argsJson({ type: "add_invite", pot: DAO, invitePk: PK })).toBe(`{"pot":"${DAO}","invite_pk":"${PK}","expires_at_ms":null,"max_uses":null}`)
    expect(argsJson({ type: "add_invite", pot: DAO, invitePk: PK, expiresAtMs: 1795600000000, maxUses: 5 })).toBe(`{"pot":"${DAO}","invite_pk":"${PK}","expires_at_ms":1795600000000,"max_uses":5}`)
    expect(argsJson({ type: "revoke_invite", pot: DAO, invitePk: PK })).toBe(`{"pot":"${DAO}","invite_pk":"${PK}"}`)
    const rot = buildCall({ type: "rotate_invite", pot: DAO, oldPk: PK, newPk: PK2 }, cfg)
    expect(rot.receiverId).toBe(HUB)
    expect(rot.actions.map((a) => (a.type === "FunctionCall" ? [a.method, a.gas] : a.type))).toEqual([
      ["revoke_invite", 30n * TGAS],
      ["add_invite", 30n * TGAS],
    ])
  })

  it("close, retry, rules", () => {
    expect(argsJson({ type: "propose_close", pot: DAO })).toBe(`{"pot":"${DAO}"}`)
    expect(fc({ type: "propose_close", pot: DAO }).gas).toBe(150n * TGAS)
    expect(argsJson({ type: "retry_payout", pot: DAO, proposalId: 7 })).toBe(`{"pot":"${DAO}","proposal_id":7}`)
    expect(fc({ type: "retry_payout", pot: DAO, proposalId: 7 }).gas).toBe(100n * TGAS)
    const rules = { instantCap: 50_000_000n, memberBudget: 150_000_000n, instantPayees: "members" as const, payeeAllowlist: [] }
    expect(argsJson({ type: "propose_rules", pot: DAO, rules })).toBe(
      `{"pot":"${DAO}","rules":{"instant_cap":"50000000","member_budget":"150000000","instant_payees":"members","payee_allowlist":[]}}`,
    )
    expect(fc({ type: "propose_rules", pot: DAO, rules }).gas).toBe(100n * TGAS)
    expect(fc({ type: "set_rules", pot: DAO, rules }).gas).toBe(30n * TGAS)
    expect(buildSync(cfg, DAO, 3)).toEqual({ receiverId: HUB, actions: [{ type: "FunctionCall", method: "sync", args: { pot: DAO, proposal_id: 3 }, gas: 50n * TGAS, deposit: 0n }] })
  })

  it("add_device_key → AddKey(FullAccess) on the own account", () => {
    expect(buildCall({ type: "add_device_key", account: MAYA, publicKey: PK }, cfg)).toEqual({ receiverId: MAYA, actions: [{ type: "AddKey", publicKey: PK, access: "FullAccess" }] })
  })

  it("every default gas is inside the relayer's accepted range", () => {
    for (const [m, r] of Object.entries(RELAY_POLICY)) {
      expect(BigInt(r.defaultTgas) * TGAS, m).toBeGreaterThanOrEqual(BigInt(r.gasMinTgas) * TGAS)
      expect(BigInt(r.defaultTgas) * TGAS, m).toBeLessThanOrEqual(BigInt(r.gasMaxTgas) * TGAS)
    }
    expect(GAS.create_pot).toBe(BigInt(RELAY_POLICY.create_pot?.defaultTgas ?? 0) * TGAS)
    expect(voteGas("Vote")).toBe(100n * TGAS)
  })

  it("direct calls (wallet without signDelegateActions) attach the hub's cost on the six hub-funded methods (rev4)", () => {
    const o = { direct: true }
    const dep = (i: ActionIntent) => {
      const a = buildCall(i, cfg, o).actions.at(-1)
      return a?.type === "FunctionCall" ? a.deposit : -1n
    }
    expect(dep({ type: "create_pot", slug: "ab" as Slug, name: "A", preset: "trip", rules: null })).toBe(70n * MILLI_NEAR)
    expect(dep({ type: "join", pot: DAO, invitePk: PK, signature: "x" })).toBe(20n * MILLI_NEAR)
    expect(dep({ type: "request_spend", pot: DAO, amount: 1n, receiverId: MAYA, category: "other", requestRef: "k3d9x1a2b4c6m7n8" })).toBe(60n * MILLI_NEAR)
    expect(dep({ type: "add_invite", pot: DAO, invitePk: PK })).toBe(5n * MILLI_NEAR)
    expect(dep({ type: "propose_rules", pot: DAO, rules: { instantCap: 0n, memberBudget: 0n, instantPayees: "members", payeeAllowlist: [] } })).toBe(60n * MILLI_NEAR)
    expect(dep({ type: "propose_close", pot: DAO })).toBe(150n * MILLI_NEAR)
    expect(dep({ type: "rotate_invite", pot: DAO, oldPk: PK, newPk: PK2 })).toBe(5n * MILLI_NEAR)
    expect(dep({ type: "retry_payout", pot: DAO, proposalId: 1 })).toBe(0n)
    expect(directDeposit("create_pot", { daoFloat: 100n * MILLI_NEAR })).toBe(120n * MILLI_NEAR) // mainnet clip hub
  })

  it("wire round-trip (demo relay bodies) and JSON-safe call specs", () => {
    const intents: ActionIntent[] = [
      { type: "add_money", pot: DAO, amount: 150_000_000n },
      { type: "request_spend", pot: DAO, amount: 84_000_000n, receiverId: MAYA, category: "groceries", requestRef: "k3d9x1a2b4c6m7n8" },
      { type: "create_pot", slug: "ab" as Slug, name: "A", preset: "trip", rules: { instantCap: 1n, memberBudget: 2n, instantPayees: "members", payeeAllowlist: [] } },
      { type: "propose_rules", pot: DAO, rules: { instantCap: 1n, memberBudget: 2n, instantPayees: "members", payeeAllowlist: [] } },
      { type: "vote", pot: DAO, proposalId: 1, kind: joinKind(MAYA), action: "VoteApprove" },
    ]
    for (const i of intents) {
      const w = intentToWire(i)
      expect(JSON.parse(JSON.stringify(w))).toEqual(w)
      expect(intentFromWire(JSON.parse(JSON.stringify(w)))).toEqual(i)
    }
    expect(JSON.stringify(callSpecToJson(buildCall(intents[0] as ActionIntent, cfg)))).toContain('"gas":"100000000000000","deposit":"1"')
  })
})

describe("proposal kinds (U-07, = contracts/pot-hub/src/kinds.rs)", () => {
  it("transfer and join kinds, exact JSON", () => {
    expect(JSON.stringify(transferKind(USDC, MAYA, 84_000_000n))).toBe(`{"Transfer":{"token_id":"${USDC}","receiver_id":"${MAYA}","amount":"84000000","msg":null}}`)
    expect(JSON.stringify(joinKind("leo.users.potapp.testnet"))).toBe('{"AddMemberToRole":{"member_id":"leo.users.potapp.testnet","role":"member"}}')
  })

  it("close kind: base64 ft_transfer args, deposit 1, 5 Tgas each", () => {
    const args = base64Encode(utf8Encode('{"receiver_id":"maya.testnet","amount":"22000000","memo":"pot refund"}'))
    expect(JSON.stringify(closeKind(USDC, [{ account: "maya.testnet", amount: 22_000_000n }]))).toBe(
      `{"FunctionCall":{"receiver_id":"${USDC}","actions":[{"method_name":"ft_transfer","args":"${args}","deposit":"1","gas":"5000000000000"}]}}`,
    )
  })

  it("rules kind: set_rules args, deposit 0, 15 Tgas", () => {
    const inner = '{"pot":"lisbon.pots.potapp.testnet","rules":{"instant_cap":"50000000","member_budget":"150000000","instant_payees":"members","payee_allowlist":[]}}'
    const k = rulesKind(HUB, "lisbon.pots.potapp.testnet", { instantCap: 50_000_000n, memberBudget: 150_000_000n, instantPayees: "members", payeeAllowlist: [] })
    expect(JSON.stringify(k)).toBe(
      `{"FunctionCall":{"receiver_id":"${HUB}","actions":[{"method_name":"set_rules","args":"${base64Encode(utf8Encode(inner))}","deposit":"0","gas":"15000000000000"}]}}`,
    )
    expect(decodeRulesKind(k, HUB)).toEqual({ pot: "lisbon.pots.potapp.testnet", rules: { instantCap: 50_000_000n, memberBudget: 150_000_000n, instantPayees: "members", payeeAllowlist: [] } })
    expect(decodeRulesKind(k, "other.testnet")).toBeNull()
  })

  it("descriptions are ASCII and carry no user text", () => {
    expect(spendDescription(3, "groceries", "k3d9x1a2b4c6m7n8")).toBe("Pot request #3: groceries (ref k3d9x1a2b4c6m7n8)")
    expect(closeDescription(66_000_000n, 3)).toBe("Pot close-out: refund 66000000 to 3 members")
    expect(rulesDescription(2)).toBe("Pot rules change v2")
  })

  it("decodes a close proposal into payouts (the Approve sheet renders what is voted on)", () => {
    const payouts = [MAYA, "sam.users.potapp.testnet", "leo.users.potapp.testnet"].map((account) => ({ account, amount: 22_000_000n }))
    expect(decodeCloseKind(closeKind(USDC, payouts), USDC)).toEqual(payouts)
    expect(decodeCloseKind(closeKind(USDC, payouts), "evil.testnet")).toBeNull()
    expect(decodeCloseKind(transferKind(USDC, MAYA, 1n), USDC)).toBeNull()
  })

  it("kindsEqual mirrors Sputnik's structural == (key order irrelevant, msg null ≡ absent)", () => {
    const a = transferKind(USDC, MAYA, 1n)
    expect(kindsEqual(a, { Transfer: { amount: "1", receiver_id: MAYA, token_id: USDC } })).toBe(true)
    expect(kindsEqual(a, transferKind(USDC, MAYA, 2n))).toBe(false)
    expect(kindsEqual(joinKind(MAYA), joinKind("x.testnet"))).toBe(false)
    expect(kindLabel(a)).toBe("transfer")
    expect(kindLabel(closeKind(USDC, []))).toBe("call")
    expect(kindLabel(joinKind(MAYA))).toBe("add_member_to_role")
    expect(kindLabel({ ChangePolicyRemoveRole: { role: "rulebot" } })).toBe("policy_remove_role")
    expect(kindLabel("Vote")).toBe("vote")
  })
})
