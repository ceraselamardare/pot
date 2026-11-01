// Proposal kinds (contracts-spec §3.0; byte-for-byte twins of contracts/pot-hub/src/kinds.rs).
// The hub is the only one who proposes these; clients use the builders to check what the DAO
// returns (the Approve sheet renders the decoded kind, rev4 M-10), and MockChain to simulate it.
// Votes must send the kind exactly as get_proposal returned it (kindsEqual mirrors Sputnik's ==).

import { base64Decode, base64Encode, utf8Decode, utf8Encode } from "../encoding.ts"
import type { RuleExtras, Rules } from "../types/hub.ts"
import type { ActionCall, AddMemberToRoleKind, FunctionCallKind, KindLabel, ProposalKind, TransferKind } from "../types/dao.ts"
import { extrasFromRaw, extrasToRaw, rulesFromRaw, rulesToRaw } from "../rules.ts"
import type { RawRuleExtras, RawRules } from "../types/hub-raw.ts"

export const CLOSE_ACTION_GAS = "5000000000000"
export const SET_RULES_ACTION_GAS = "15000000000000"
export const CLOSE_MEMO = "pot refund"

export function transferKind(usdc: string, receiver: string, amount: bigint): TransferKind {
  return { Transfer: { token_id: usdc, receiver_id: receiver, amount: amount.toString(), msg: null } }
}

/** hub 1.1.0 pay by link: the DAO pays the hub (escrow) with ft_transfer_call, msg `{"link":<id>}`. */
export const linkMsg = (requestId: number): string => `{"link":${requestId}}`
export function linkTransferKind(usdc: string, hub: string, amount: bigint, requestId: number): TransferKind {
  return { Transfer: { token_id: usdc, receiver_id: hub, amount: amount.toString(), msg: linkMsg(requestId) } }
}
/** The request id of a link escrow kind (receiver = the hub, msg {"link":id}), or null. */
export function decodeLinkKind(kind: ProposalKind, hubId: string): number | null {
  if (!isTransferKind(kind) || kind.Transfer.receiver_id !== hubId || typeof kind.Transfer.msg !== "string") return null
  const m = /^\{"link":(0|[1-9][0-9]{0,9})\}$/.exec(kind.Transfer.msg)
  return m ? Number(m[1]) : null
}

/** Role is always "member" and member_id the joiner (INV-09). */
export function joinKind(joiner: string): AddMemberToRoleKind {
  return { AddMemberToRole: { member_id: joiner, role: "member" } }
}

/** The exact ft_transfer args of one close payout (key order fixed). */
export const closeTransferArgs = (receiver: string, amount: bigint): string =>
  `{"receiver_id":${JSON.stringify(receiver)},"amount":"${amount.toString()}","memo":"${CLOSE_MEMO}"}`

export function closeKind(usdc: string, payouts: readonly { account: string; amount: bigint }[]): FunctionCallKind {
  return {
    FunctionCall: {
      receiver_id: usdc,
      actions: payouts.map((p) => ({
        method_name: "ft_transfer",
        args: base64Encode(utf8Encode(closeTransferArgs(p.account, p.amount))),
        deposit: "1",
        gas: CLOSE_ACTION_GAS,
      })),
    },
  }
}

/** hub 1.1.0: `extras` is appended only when set, so 1.0.0 kinds stay byte-identical. */
export const setRulesArgs = (pot: string, rules: Rules, extras?: RuleExtras): string =>
  JSON.stringify(extras ? { pot, rules: rulesToRaw(rules), extras: extrasToRaw(extras) } : { pot, rules: rulesToRaw(rules) })

export function rulesKind(hub: string, pot: string, rules: Rules, extras?: RuleExtras): FunctionCallKind {
  return {
    FunctionCall: {
      receiver_id: hub,
      actions: [{ method_name: "set_rules", args: base64Encode(utf8Encode(setRulesArgs(pot, rules, extras))), deposit: "0", gas: SET_RULES_ACTION_GAS }],
    },
  }
}

// Descriptions: ASCII, no user text beyond the category (D-07).
export const spendDescription = (id: number, category: string, requestRef: string): string => `Pot request #${id}: ${category} (ref ${requestRef})`
export const joinDescription = (): string => "Pot join via invite"
export const closeDescription = (balance: bigint, n: number): string => `Pot close-out: refund ${balance.toString()} to ${n} members`
export const rulesDescription = (version: number): string => `Pot rules change v${version}`

export const isTransferKind = (k: ProposalKind): k is TransferKind => typeof k === "object" && k !== null && "Transfer" in k
export const isAddMemberKind = (k: ProposalKind): k is AddMemberToRoleKind => typeof k === "object" && k !== null && "AddMemberToRole" in k
export const isFunctionCallKind = (k: ProposalKind): k is FunctionCallKind => typeof k === "object" && k !== null && "FunctionCall" in k

const LABELS: Record<string, KindLabel> = {
  ChangeConfig: "config",
  ChangePolicy: "policy",
  AddMemberToRole: "add_member_to_role",
  RemoveMemberFromRole: "remove_member_from_role",
  FunctionCall: "call",
  UpgradeSelf: "upgrade_self",
  UpgradeRemote: "upgrade_remote",
  Transfer: "transfer",
  SetStakingContract: "set_vote_token",
  AddBounty: "add_bounty",
  BountyDone: "bounty_done",
  Vote: "vote",
  FactoryInfoUpdate: "factory_info_update",
  ChangePolicyAddOrUpdateRole: "policy_add_or_update_role",
  ChangePolicyRemoveRole: "policy_remove_role",
  ChangePolicyUpdateDefaultVotePolicy: "policy_update_default_vote_policy",
  ChangePolicyUpdateParameters: "policy_update_parameters",
}

/** Sputnik's label for a kind (the permission / vote_policy key). */
export function kindLabel(k: ProposalKind): KindLabel {
  const v = typeof k === "string" ? k : k && typeof k === "object" ? Object.keys(k)[0] : undefined
  return (v && LABELS[v]) || "unknown"
}

/** Strips `msg: null` / absent equivalence the way Sputnik's structural == does (msg absent ≡ null). */
function normalizeForCompare(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizeForCompare)
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === null || x === undefined) continue
      out[k] = normalizeForCompare(x)
    }
    return out
  }
  return v
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object)
    const kb = Object.keys(b as object)
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/** Structural kind equality as Sputnik checks it for `ERR_WRONG_KIND` (key order irrelevant; null ≡ absent). */
export const kindsEqual = (a: ProposalKind, b: ProposalKind): boolean => deepEqual(normalizeForCompare(a), normalizeForCompare(b))

export interface DecodedAction {
  methodName: string
  /** Parsed JSON args, or null if not JSON. */
  args: unknown
  argsText: string
  deposit: bigint
  gas: bigint
}

export function decodeActionCall(a: ActionCall): DecodedAction {
  const argsText = utf8Decode(base64Decode(a.args))
  let args: unknown = null
  try {
    args = JSON.parse(argsText)
  } catch {
    args = null
  }
  return { methodName: a.method_name, args, argsText, deposit: BigInt(a.deposit), gas: BigInt(a.gas) }
}

/**
 * Decodes a close proposal (FunctionCall to usdc with only ft_transfer actions) into payouts, or
 * null when the kind isn't exactly that shape (the Approve sheet then refuses to sign).
 */
export function decodeCloseKind(kind: ProposalKind, usdcId: string): { account: string; amount: bigint }[] | null {
  if (!isFunctionCallKind(kind) || kind.FunctionCall.receiver_id !== usdcId) return null
  const out: { account: string; amount: bigint }[] = []
  for (const a of kind.FunctionCall.actions) {
    const d = decodeActionCall(a)
    const args = d.args as { receiver_id?: unknown; amount?: unknown } | null
    if (d.methodName !== "ft_transfer" || d.deposit !== 1n || !args || typeof args.receiver_id !== "string" || typeof args.amount !== "string") return null
    out.push({ account: args.receiver_id, amount: BigInt(args.amount) })
  }
  return out
}

/** Decodes a rules proposal (FunctionCall to the hub with one set_rules action), or null. */
export function decodeRulesKind(kind: ProposalKind, hubId: string): { pot: string; rules: Rules; extras?: RuleExtras } | null {
  if (!isFunctionCallKind(kind) || kind.FunctionCall.receiver_id !== hubId || kind.FunctionCall.actions.length !== 1) return null
  const d = decodeActionCall(kind.FunctionCall.actions[0] as ActionCall)
  const args = d.args as { pot?: unknown; rules?: RawRules; extras?: RawRuleExtras } | null
  if (d.methodName !== "set_rules" || !args || typeof args.pot !== "string" || !args.rules) return null
  try {
    return { pot: args.pot, rules: rulesFromRaw(args.rules), ...(args.extras ? { extras: extrasFromRaw(args.extras) } : {}) }
  } catch {
    return null
  }
}
