// "Confirm it's you" bytes (frontend-architecture §4.4 "AddKey prepare", D-21): the NEP-461-prefixed DelegateAction
// AddKey(this device's key, FullAccess) on the person's own account, signed later by their NEAR Auth MPC key.
// Loaded lazily (near-api-js lives in the signing chunk, D-42); built BEFORE the tap so the window opens inside it.
import { actions, buildDelegateAction, encodeDelegateAction, PublicKey } from "near-api-js"

/** The relayer accepts head + 10 < max_block_height ≤ head + 600 (final head); optimistic runs a few blocks ahead. */
export const NEAR_AUTH_TTL_BLOCKS = 550

export function addKeyDelegateBytes(p: { accountId: string; mpcPublicKey: string; devicePublicKey: string; mpcNonce: bigint; blockHeight: number }): Uint8Array {
  const da = buildDelegateAction({
    senderId: p.accountId,
    receiverId: p.accountId,
    actions: [actions.addFullAccessKey(PublicKey.from(p.devicePublicKey))],
    nonce: p.mpcNonce + 1n,
    maxBlockHeight: BigInt(p.blockHeight + NEAR_AUTH_TTL_BLOCKS),
    publicKey: PublicKey.from(p.mpcPublicKey),
  })
  return encodeDelegateAction(da)
}
