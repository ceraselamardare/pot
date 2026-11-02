// ActionIntent → CallSpec (frontend-architecture §1.4, test U-06). Pure JSON call specs; the web
// app's lib/actions/run.ts signs and relays them, and the server's demo path builds the same spec.
// Args mirror the hub method signatures (contracts/pot-hub/src/lib.rs) key for key.

import type { SdkConfig } from "../config.ts"
import { extrasFromWire, extrasToRaw, extrasToWire, rulesToRaw, rulesToWire, rulesFromWire } from "../rules.ts"
import type { ActionIntent, ActionIntentWire, CallAction, CallSpec } from "../types/intents.ts"
import { isValidRequestRef } from "../validate.ts"
import { giftAmountError, giftMsg, isValidGiftRef } from "../gifts.ts"
import { GAS, ONE_YOCTO, directDeposit, voteGas } from "./gas.ts"

export interface BuildOptions {
  /**
   * A direct (non-relayed) call from a wallet without signDelegateActions: attach the hub's cost
   * on the six hub-funded methods (contracts-spec §3.0, rev4). Never set for relayed delegates
   * (the relayer refuses any deposit on hub calls: `deposit_cap`).
   */
  direct?: boolean
  /** The hub's dao_float (yocto) for the create_pot direct deposit; default 0.05 NEAR. */
  daoFloat?: bigint
}

export class BuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BuildError"
  }
}

function fc(method: string, args: Record<string, unknown>, gas: bigint, deposit = 0n): CallAction {
  return { type: "FunctionCall", method, args, gas, deposit }
}

function hubFc(method: string, args: Record<string, unknown>, gas: bigint, o: BuildOptions): CallAction {
  return fc(method, args, gas, o.direct ? directDeposit(method, { daoFloat: o.daoFloat }) : 0n)
}

function positive(amount: bigint, what: string): string {
  if (amount <= 0n) throw new BuildError(`${what} must be > 0`)
  return amount.toString()
}

/** Builds the single-receiver call for one intent. */
export function buildCall(i: ActionIntent, cfg: Pick<SdkConfig, "hubId" | "usdcId">, o: BuildOptions = {}): CallSpec {
  const hub = cfg.hubId
  switch (i.type) {
    case "add_money":
      // D-06: ≥ 100 Tgas (below 35 the money silently bounces), exactly 1 yocto, no memo (R1).
      return {
        receiverId: cfg.usdcId,
        actions: [
          fc("ft_transfer_call", { receiver_id: hub, amount: positive(i.amount, "amount"), msg: JSON.stringify({ pot: i.pot }) }, GAS.ft_transfer_call, ONE_YOCTO),
        ],
      }
    case "request_spend": {
      if (!isValidRequestRef(i.requestRef)) throw new BuildError("requestRef must match ^[a-z0-9]{8,32}$")
      if (i.link && i.receiverId !== hub) throw new BuildError("a link request's receiverId must be the hub id (the escrow)")
      const args: Record<string, unknown> = {
        pot: i.pot,
        amount: positive(i.amount, "amount"),
        receiver_id: i.receiverId,
        category: i.category,
        request_ref: i.requestRef,
      }
      // the `link` key only when set, so 1.0.0-shaped calls stay byte-identical
      if (i.link) args.link = { claim_pk: i.link.claimPk, expires_at_ms: i.link.expiresAtMs ?? null }
      return { receiverId: hub, actions: [hubFc("request_spend", args, i.link ? GAS.request_spend_link : GAS.request_spend, o)] }
    }
    case "vote":
      // Always send `proposal` = the kind exactly as get_proposal returned it (D-05); never a memo (R11).
      return { receiverId: i.pot, actions: [fc("act_proposal", { id: i.proposalId, action: i.action, proposal: i.kind }, voteGas(i.kind))] }
    case "join":
      return { receiverId: hub, actions: [hubFc("join", { pot: i.pot, invite_pk: i.invitePk, signature: i.signature }, GAS.join, o)] }
    case "create_pot":
      if (i.preset === "custom" && !i.rules) throw new BuildError("custom preset needs explicit rules")
      return {
        receiverId: hub,
        actions: [
          hubFc(
            "create_pot",
            {
              slug: i.slug,
              name: i.name,
              preset: i.preset,
              rules: i.rules ? rulesToRaw(i.rules) : null,
              invite_pk: i.invitePk ?? null,
              emoji: i.emoji ?? null,
              float: null,
              ...(i.extras ? { extras: extrasToRaw(i.extras) } : {}),
            },
            GAS.create_pot,
            o,
          ),
        ],
      }
    case "add_invite":
      return {
        receiverId: hub,
        actions: [
          hubFc("add_invite", { pot: i.pot, invite_pk: i.invitePk, expires_at_ms: i.expiresAtMs ?? null, max_uses: i.maxUses ?? null }, GAS.add_invite, o),
        ],
      }
    case "revoke_invite":
      return { receiverId: hub, actions: [fc("revoke_invite", { pot: i.pot, invite_pk: i.invitePk }, GAS.revoke_invite)] }
    case "rotate_invite":
      return {
        receiverId: hub,
        actions: [
          fc("revoke_invite", { pot: i.pot, invite_pk: i.oldPk }, GAS.revoke_invite),
          hubFc("add_invite", { pot: i.pot, invite_pk: i.newPk, expires_at_ms: i.expiresAtMs ?? null, max_uses: i.maxUses ?? null }, GAS.add_invite, o),
        ],
      }
    case "propose_close":
      return { receiverId: hub, actions: [hubFc("propose_close", { pot: i.pot }, GAS.propose_close, o)] }
    case "retry_payout":
      return { receiverId: hub, actions: [fc("retry_payout", { pot: i.pot, proposal_id: i.proposalId }, GAS.retry_payout)] }
    case "set_rules":
      return {
        receiverId: hub,
        actions: [fc("set_rules", { pot: i.pot, rules: rulesToRaw(i.rules), ...(i.extras ? { extras: extrasToRaw(i.extras) } : {}) }, GAS.set_rules)],
      }
    case "propose_rules":
      return {
        receiverId: hub,
        actions: [
          hubFc("propose_rules", { pot: i.pot, rules: rulesToRaw(i.rules), ...(i.extras ? { extras: extrasToRaw(i.extras) } : {}) }, GAS.propose_rules, o),
        ],
      }
    case "ok_request":
      return { receiverId: hub, actions: [fc("ok_request", { pot: i.pot, request_id: i.requestId }, GAS.ok_request)] }
    case "claim_link":
      return {
        receiverId: hub,
        actions: [hubFc("claim_link", { pot: i.pot, request_id: i.requestId, receiver_id: i.receiverId, signature: i.signature }, GAS.claim_link, o)],
      }
    case "reclaim_link":
      return { receiverId: hub, actions: [fc("reclaim_link", { pot: i.pot, request_id: i.requestId }, GAS.reclaim_link)] }
    case "refund_unfunded":
      return { receiverId: hub, actions: [hubFc("refund_unfunded", { pot: i.pot }, GAS.refund_unfunded, o)] }
    case "send_gift": {
      // hub 1.2.0: like add_money (≥ 100 Tgas, exactly 1 yocto, no memo), with the gift msg
      if (!isValidGiftRef(i.giftRef)) throw new BuildError("giftRef must match ^[A-Za-z0-9_-]{1,32}$")
      const err = giftAmountError(i.amount)
      if (err) throw new BuildError(err === "too_small" ? "a gift is at least $1" : "gift too large")
      return {
        receiverId: cfg.usdcId,
        actions: [fc("ft_transfer_call", { receiver_id: hub, amount: i.amount.toString(), msg: giftMsg(i.pot, i.giftRef) }, GAS.ft_transfer_call, ONE_YOCTO)],
      }
    }
    case "set_gifts":
      return { receiverId: hub, actions: [hubFc("set_gifts", { pot: i.pot, on: i.on }, GAS.set_gifts, o)] }
    case "add_device_key":
      return { receiverId: i.account, actions: [{ type: "AddKey", publicKey: i.publicKey, access: "FullAccess" }] }
  }
}

/** hub.sync(pot, proposal_id), which the relayer calls after every relayed vote (D-05 Rev 2). */
export function buildSync(cfg: Pick<SdkConfig, "hubId">, pot: string, proposalId: number): CallSpec {
  return { receiverId: cfg.hubId, actions: [fc("sync", { pot, proposal_id: proposalId }, GAS.sync)] }
}

/** The intent's method names, for the relay body's advisory `intent` check. */
export const intentMethods = (i: ActionIntent): string[] =>
  buildCall(i, { hubId: "hub", usdcId: "usdc" }).actions.map((a) => (a.type === "FunctionCall" ? a.method : "AddKey"))

// ---------------------------------------------------------------- wire (bigint ↔ string)

/** ActionIntent → JSON-safe ActionIntentWire (demo relay bodies). */
export function intentToWire(i: ActionIntent): ActionIntentWire {
  switch (i.type) {
    case "add_money":
      return { ...i, amount: i.amount.toString() }
    case "request_spend":
      return { ...i, amount: i.amount.toString() }
    case "send_gift":
      return { ...i, amount: i.amount.toString() }
    case "create_pot": {
      const { extras, ...rest } = i
      return { ...rest, rules: i.rules ? rulesToWire(i.rules) : null, ...(extras ? { extras: extrasToWire(extras) } : {}) }
    }
    case "set_rules":
    case "propose_rules": {
      const { extras, ...rest } = i
      return { ...rest, rules: rulesToWire(i.rules), ...(extras ? { extras: extrasToWire(extras) } : {}) }
    }
    default:
      return i as ActionIntentWire
  }
}

/** ActionIntentWire → ActionIntent (throws on malformed amounts). */
export function intentFromWire(w: ActionIntentWire): ActionIntent {
  switch (w.type) {
    case "add_money":
      return { ...w, amount: BigInt(w.amount) } as ActionIntent
    case "request_spend":
      return { ...w, amount: BigInt(w.amount) } as ActionIntent
    case "send_gift":
      return { ...w, amount: BigInt(w.amount) } as ActionIntent
    case "create_pot":
      return { ...w, rules: w.rules ? rulesFromWire(w.rules) : null, ...(w.extras ? { extras: extrasFromWire(w.extras) } : {}) } as ActionIntent
    case "set_rules":
    case "propose_rules":
      return { ...w, rules: rulesFromWire(w.rules), ...(w.extras ? { extras: extrasFromWire(w.extras) } : {}) } as ActionIntent
    default:
      return w as ActionIntent
  }
}

/** JSON-safe view of a CallSpec (bigint → string), e.g. for logs and snapshots. */
export function callSpecToJson(c: CallSpec): unknown {
  return {
    receiverId: c.receiverId,
    actions: c.actions.map((a) => (a.type === "FunctionCall" ? { ...a, gas: a.gas.toString(), deposit: a.deposit.toString() } : a)),
  }
}
