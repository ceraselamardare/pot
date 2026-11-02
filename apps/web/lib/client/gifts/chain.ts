// The thin chain side of gifts on testnet (hub 1.2.0; notes/gifts-plan.md "Contract", notes/contracts-gifts.md §8):
//  - sendGiftTransfer: the sdk's `send_gift` intent = usdc.ft_transfer_call(hub, amount, msg = {"pot","gift"}), 1 yocto,
//    100 Tgas, as a gasless delegate through POST /api/relay (R16 accepts it from anyone, member or not), the same
//    send() path as Add money;
//  - setGiftsOnChain: the sdk's `set_gifts` intent = hub.set_gifts(pot, on) by any active member (R17, relayable);
//  - readGiftsView: the hub's `get_gifts(pot)` (chain().hub.getGifts); null on a 1.1.0 hub or a failed read.
// The mock build never imports this module's chain paths (lib/client/gifts/actions.ts picks the mock store).
import type { DaoId, GiftRefusal, Micro } from "@pot/sdk"
import { ActionError } from "../errors"
import { chain } from "../live/chain"
import { innerError, type RelayOk } from "../live/relay"
import { send } from "../live/signing"

export interface GiftsChainView {
  on: boolean
  total: Micro
  count: number
  /** a gift sent now would pass the hub's checks */
  accepting: boolean
  refusal: GiftRefusal | null
}

function failIfInner(r: RelayOk): void {
  const code = innerError(r)
  if (code) throw new ActionError("failed", code, { txHash: r.txHash })
}

/**
 * The gift itself: the giver signs one ft_transfer_call to the hub with the gift msg (the server made the ref and
 * checked the link first: POST /api/gifts). Returns the relay's answer (its txHash is the gift's receipt).
 * A bounced gift (the hub refused it after the pre-flight, or the forward failed) throws `GIFT_REFUNDED`: the token
 * gave the money back. A self-paid wallet send has no relay result; its receipts were already checked for failures.
 */
export async function sendGiftTransfer(input: { dao: string; amount: Micro; ref: string }): Promise<RelayOk> {
  const r = await send({ type: "send_gift", pot: input.dao as DaoId, amount: input.amount, giftRef: input.ref })
  failIfInner(r)
  if (r.result?.type === "gift" && !r.result.recorded) throw new ActionError("failed", "GIFT_REFUNDED", { txHash: r.txHash })
  return r
}

/** ••• → Gifts → on/off: hub.set_gifts(pot, on), any active member (predecessor-authorized, relayable). */
export async function setGiftsOnChain(dao: string, on: boolean): Promise<RelayOk> {
  const r = await send({ type: "set_gifts", pot: dao as DaoId, on })
  failIfInner(r)
  return r
}

/** The hub's gifts view (`get_gifts`); null when the hub doesn't have it (a 1.1.0 hub) or the read failed. */
export async function readGiftsView(dao: string): Promise<GiftsChainView | null> {
  const hub = chain().hub
  if (!hub.getGifts) return null
  try {
    const v = (await hub.getGifts(dao as DaoId)).value
    return v ? { on: v.on, total: v.total, count: v.count, accepting: v.accepting, refusal: v.refusal } : null
  } catch {
    return null
  }
}
