// The signing engine (F-08, frontend-architecture §4.7): the ONLY browser module that imports @pot/sdk/sign
// (near-api-js 7.3.1). It is loaded with a dynamic import() from lib/client/live/signing.ts, so near-api-js stays
// out of first load (D-42, PF-01). The device key signs through HashSigner: near-api-js hashes the NEP-461-prefixed
// delegate and hands the 32 bytes to the WebCrypto key (§4.3).
import {
  DEFAULT_DELEGATE_TTL_BLOCKS,
  maxBlockHeightFor,
  NonceTracker,
  relayBody,
  signDelegate,
  SigningQueue,
} from "@pot/sdk/sign"
import type { Api, Prepared } from "@pot/sdk"
import type { DeviceKeyStore } from "./device-key-store"

/** FIFO per account:key, one job in flight, 90 s per job (it covers sign + relay, so nonces land in order). */
export const queue = new SigningQueue(90_000)
/** nonce = max(view_access_key(optimistic).nonce, last used) + 1 */
export const nonces = new NonceTracker()

export const TTL_BLOCKS = DEFAULT_DELEGATE_TTL_BLOCKS

export function nonceAndExpiry(account: string, publicKey: string, chainNonce: bigint, blockHeight: number): { nonce: bigint; maxBlockHeight: bigint } {
  return { nonce: nonces.next(account, publicKey, chainNonce), maxBlockHeight: maxBlockHeightFor(blockHeight, TTL_BLOCKS) }
}

/** Signs a prepared delegate with the device key → the POST /api/relay body. */
export async function signPrepared(store: DeviceKeyStore, p: Prepared): Promise<Api.RelaySignedReq> {
  if (p.nonce === undefined || p.maxBlockHeight === undefined) throw new Error("prepare() first")
  const signer = await store.nearSigner("current")
  const pk = (await signer.getPublicKey()).toString()
  const r = await signDelegate(signer, { senderId: p.senderId, publicKey: pk, call: p.call, nonce: p.nonce, maxBlockHeight: p.maxBlockHeight })
  return relayBody(p, r.signedDelegateBase64)
}

/** D-08 join signature with noble (browsers without WebCrypto Ed25519). */
export { signJoin } from "@pot/sdk/sign"
