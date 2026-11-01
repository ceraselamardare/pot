// Action intents (frontend-architecture §1.4): names match the decisions.md §8 hub/DAO/USDC methods.
// `buildCall` (actions/build.ts) turns one into a CallSpec; the web app signs and relays it.

import type { Micro } from "../money.ts"
import type { ProposalKind, VoteAction } from "./dao.ts"
import type { Category, PresetId, Rules } from "./hub.ts"
import type { AccountId, DaoId, ProposalId, PublicKeyStr, Slug } from "./ids.ts"

export type ActionIntent =
  /** usdc.ft_transfer_call → pots.<root> (D-06) */
  | { type: "add_money"; pot: DaoId; amount: Micro }
  /** D-07; requestRef = the client's 16-char op id (OpKey) */
  | { type: "request_spend"; pot: DaoId; amount: Micro; receiverId: AccountId; category: Category; requestRef: string }
  /** gas follows `kind`: Transfer / AddMemberToRole 100 Tgas, FunctionCall (close, rules) 300 */
  | { type: "vote"; pot: DaoId; proposalId: ProposalId; kind: ProposalKind; action: VoteAction }
  /** D-08 */
  | { type: "join"; pot: DaoId; invitePk: PublicKeyStr; signature: string }
  /** rules null = preset defaults */
  | { type: "create_pot"; slug: Slug; name: string; preset: PresetId; rules: Rules | null; invitePk?: PublicKeyStr; emoji?: string }
  | { type: "add_invite"; pot: DaoId; invitePk: PublicKeyStr; expiresAtMs?: number; maxUses?: number }
  | { type: "revoke_invite"; pot: DaoId; invitePk: PublicKeyStr }
  /** 1 delegate, 2 FunctionCalls (relayer R5 allows the pair) */
  | { type: "rotate_invite"; pot: DaoId; oldPk: PublicKeyStr; newPk: PublicKeyStr; expiresAtMs?: number; maxUses?: number }
  | { type: "propose_close"; pot: DaoId }
  | { type: "retry_payout"; pot: DaoId; proposalId: ProposalId }
  /** sole member only (decisions.md §8) */
  | { type: "set_rules"; pot: DaoId; rules: Rules }
  /** several members (D-07b); then the proposer's own VoteApprove at 300 Tgas */
  | { type: "propose_rules"; pot: DaoId; rules: Rules }
  /** AddKey on own account (D-21) */
  | { type: "add_device_key"; account: AccountId; publicKey: PublicKeyStr }

export type ActionIntentType = ActionIntent["type"]
export const ACTION_INTENT_TYPES: readonly ActionIntentType[] = [
  "add_money",
  "request_spend",
  "vote",
  "join",
  "create_pot",
  "add_invite",
  "revoke_invite",
  "rotate_invite",
  "propose_close",
  "retry_payout",
  "set_rules",
  "propose_rules",
  "add_device_key",
]

export type CallAction =
  | { type: "FunctionCall"; method: string; args: Record<string, unknown>; gas: bigint; deposit: bigint }
  | { type: "AddKey"; publicKey: PublicKeyStr; access: "FullAccess" }

/** One delegate's worth of work: a single receiver and its actions. */
export interface CallSpec {
  receiverId: string
  actions: CallAction[]
}

/** Rules on the wire (bigint → decimal string). */
export interface RulesWire {
  instantCap: string
  memberBudget: string
  instantPayees: Rules["instantPayees"]
  payeeAllowlist: string[]
}

type Wire<T> = T extends Micro ? string : T extends Rules ? RulesWire : T extends Rules | null ? RulesWire | null : T

/** ActionIntent with bigint → string, for JSON bodies (api-spec `ActionIntentWire`, demo relays). */
export type ActionIntentWire = {
  [K in ActionIntentType]: { [F in keyof Extract<ActionIntent, { type: K }>]: Wire<Extract<ActionIntent, { type: K }>[F]> }
}[ActionIntentType]
