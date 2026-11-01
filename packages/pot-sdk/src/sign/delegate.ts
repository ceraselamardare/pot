// NEP-366 delegate building and signing with near-api-js 7.3.1 (frontend-architecture §4.7,
// kb/meta-tx-relayer.md). The signer hashes encodeDelegateAction(da) (NEP-461 prefix ‖ borsh) with
// sha256 and signs those 32 bytes; the relay body carries base64(borsh(SignedDelegate)).

import {
  actions,
  buildDelegateAction,
  encodeDelegateAction,
  encodeSignedDelegate,
  PublicKey,
  type Action,
  type DelegateAction,
  type SignedDelegate,
  type Signer,
} from "near-api-js"
import { base64Encode } from "../encoding.ts"
import type { CallSpec } from "../types/intents.ts"
import type { PublicKeyStr } from "../types/ids.ts"
import { decodeSignedDelegate, delegateHash, type DecodedSignedDelegate } from "./encode.ts"

export function toNearActions(call: CallSpec): Action[] {
  return call.actions.map((a) =>
    a.type === "FunctionCall" ? actions.functionCall(a.method, a.args, a.gas, a.deposit) : actions.addFullAccessKey(PublicKey.from(a.publicKey)),
  )
}

export interface DelegateParams {
  senderId: string
  publicKey: PublicKeyStr | string
  call: CallSpec
  nonce: bigint
  maxBlockHeight: bigint
}

export function buildDelegate(p: DelegateParams): DelegateAction {
  return buildDelegateAction({
    senderId: p.senderId,
    receiverId: p.call.receiverId,
    actions: toNearActions(p.call),
    nonce: p.nonce,
    maxBlockHeight: p.maxBlockHeight,
    publicKey: PublicKey.from(p.publicKey),
  } as DelegateAction)
}

/** NEP-461-prefixed DelegateAction bytes (what NEAR Auth's `signPayload` carries, base64). */
export const delegateActionBytes = (da: DelegateAction): Uint8Array => encodeDelegateAction(da)

export const encodeSignedDelegateBase64 = (sd: SignedDelegate): string => base64Encode(encodeSignedDelegate(sd))

export interface SignedDelegateResult {
  signedDelegate: SignedDelegate
  /** = RelayReq.signedDelegate */
  signedDelegateBase64: string
  /** sha256 of the signed bytes */
  delegateHash: Uint8Array
}

/** Builds and signs one delegate. `signer` may be a KeyPairSigner, a HashSigner (WebCrypto) or any near-api-js Signer. */
export async function signDelegate(signer: Signer, p: Omit<DelegateParams, "publicKey"> & { publicKey?: PublicKeyStr | string }): Promise<SignedDelegateResult> {
  const publicKey = p.publicKey ?? (await signer.getPublicKey()).toString()
  const da = buildDelegate({ ...p, publicKey })
  const { signedDelegate, delegateHash: hash } = await signer.signDelegateAction(da)
  return { signedDelegate, signedDelegateBase64: encodeSignedDelegateBase64(signedDelegate), delegateHash: hash }
}

/** Checks an ed25519 SignedDelegate's signature locally (relayer validation step 8). */
export async function verifySignedDelegate(d: DecodedSignedDelegate | string): Promise<boolean> {
  const dec = typeof d === "string" ? decodeSignedDelegate(d) : d
  if (dec.signature.keyType !== "ed25519" || !dec.publicKey.startsWith("ed25519:")) return false
  const hash = await delegateHash(dec.delegateActionBytes)
  try {
    return PublicKey.from(dec.publicKey).verify(hash, dec.signature.data)
  } catch {
    return false
  }
}
