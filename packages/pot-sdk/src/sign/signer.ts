// Signers. The browser adapters (DeviceKey/WebCrypto, NearAuth, NearConnect, Demo) live in
// apps/web (frontend-architecture §4.2); here:
//  - HashSigner: a near-api-js Signer around any "sign these 32 bytes" function, e.g. a
//    non-extractable WebCrypto Ed25519 key: new HashSigner(pk, (h) => subtle.sign("Ed25519", key, h))
//  - KeyPairPotSigner: a full PotSigner over a KeyPair, for tests, scripts and seeding.

import { KeyPair, KeyPairSigner, PublicKey, Signer, type KeyPairString } from "near-api-js"
import type { SdkConfig } from "../config.ts"
import { buildCall, type BuildOptions } from "../actions/build.ts"
import type { AccountViews } from "../read/views.ts"
import type { IntentType, RelaySignedReq } from "../types/api.ts"
import type { AccountId, PublicKeyStr } from "../types/ids.ts"
import type { ActionIntent } from "../types/intents.ts"
import type { PotSigner, Prepared, Readiness, SignedPayload, SignerKind } from "../types/signer.ts"
import { newOpKey, opKeyOfRef } from "../validate.ts"
import { buildDelegate, delegateActionBytes, signDelegate } from "./delegate.ts"
import { DEFAULT_DELEGATE_TTL_BLOCKS, NonceTracker, maxBlockHeightFor } from "./nonce.ts"

export class HashSigner extends Signer {
  private readonly pk: PublicKey
  private readonly signHash: (hash: Uint8Array) => Promise<Uint8Array>

  constructor(publicKey: PublicKeyStr | string, signHash: (hash: Uint8Array) => Promise<Uint8Array>) {
    super()
    this.pk = PublicKey.from(publicKey)
    this.signHash = signHash
  }

  async getPublicKey(): Promise<PublicKey> {
    return this.pk
  }

  protected async signBytes(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await this.signHash(bytes))
  }
}

export interface KeyPairPotSignerOptions {
  accountId: string
  /** "ed25519:<base58 secret>" (or a KeyPair). Never log it. */
  secretKey: string | KeyPair
  /** Where nonces and block heights come from (RPC ChainViews or MockChain). */
  chain: { account: AccountViews }
  cfg: Pick<SdkConfig, "hubId" | "usdcId">
  kind?: SignerKind
  ttlBlocks?: number
  nonces?: NonceTracker
  build?: BuildOptions
}

/** Thrown by prepare() when the key isn't (yet) a full-access key of the account. */
export class SignerNotReadyError extends Error {
  readiness: Readiness
  constructor(readiness: Readiness) {
    super(`signer not ready: ${readiness}`)
    this.name = "SignerNotReadyError"
    this.readiness = readiness
  }
}

export class KeyPairPotSigner implements PotSigner {
  readonly kind: SignerKind
  readonly accountId: AccountId
  readonly publicKey: PublicKeyStr
  readonly needsGesture = false
  readonly relayed = true
  private readonly signer: KeyPairSigner
  private readonly opts: KeyPairPotSignerOptions
  private readonly nonces: NonceTracker

  constructor(opts: KeyPairPotSignerOptions) {
    const kp = typeof opts.secretKey === "string" ? KeyPair.fromString(opts.secretKey as KeyPairString) : opts.secretKey
    this.signer = new KeyPairSigner(kp)
    this.publicKey = kp.getPublicKey().toString() as PublicKeyStr
    this.accountId = opts.accountId as AccountId
    this.kind = opts.kind ?? "device"
    this.opts = opts
    this.nonces = opts.nonces ?? new NonceTracker()
  }

  async readiness(): Promise<Readiness> {
    const ak = await this.opts.chain.account.accessKey(this.accountId, this.publicKey)
    return ak.value?.fullAccess ? "ready" : "needs_device"
  }

  async prepare(intent: ActionIntent): Promise<Prepared> {
    const call = buildCall(intent, this.opts.cfg, this.opts.build)
    const ak = await this.opts.chain.account.accessKey(this.accountId, this.publicKey)
    if (!ak.value) throw new SignerNotReadyError("needs_device")
    const nonce = this.nonces.next(this.accountId, this.publicKey, ak.value.nonce)
    const maxBlockHeight = maxBlockHeightFor(ak.blockHeight, this.opts.ttlBlocks ?? DEFAULT_DELEGATE_TTL_BLOCKS)
    const opId = intent.type === "request_spend" ? opKeyOfRef(intent.requestRef) : newOpKey()
    const delegateBytes = delegateActionBytes(buildDelegate({ senderId: this.accountId, publicKey: this.publicKey, call, nonce, maxBlockHeight }))
    return { intent, call, senderId: this.accountId, opId, nonce, maxBlockHeight, delegateBytes }
  }

  /** The signed delegate as base64 (for routes that take one directly, e.g. pairing complete). */
  async signDelegateBase64(p: Prepared): Promise<string> {
    if (p.nonce === undefined || p.maxBlockHeight === undefined) throw new Error("prepare() first")
    const r = await signDelegate(this.signer, { senderId: p.senderId, publicKey: this.publicKey, call: p.call, nonce: p.nonce, maxBlockHeight: p.maxBlockHeight })
    return r.signedDelegateBase64
  }

  async sign(p: Prepared): Promise<SignedPayload> {
    if (p.intent.type === "add_device_key") throw new Error("add_device_key goes through /api/devices or pairing, not /api/relay")
    const signedDelegate = await this.signDelegateBase64(p)
    return { via: "relay", body: relayBody(p, signedDelegate) }
  }
}

/** The /api/relay body for a signed delegate (api-spec §2.3). */
export function relayBody(p: Prepared, signedDelegate: string): RelaySignedReq {
  const body: RelaySignedReq = { signedDelegate, idempotencyKey: p.opId, intent: p.intent.type as IntentType }
  if (p.intent.type === "request_spend") body.requestRef = p.intent.requestRef
  return body
}
