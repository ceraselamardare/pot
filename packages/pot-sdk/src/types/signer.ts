// The PotSigner interface (frontend-architecture §4.1). Type-only, so UI code can depend on it
// without loading near-api-js. Browser adapters (DeviceKey/WebCrypto, NearAuth, NearConnect, Demo)
// live in apps/web; "@pot/sdk/sign" ships KeyPairPotSigner (tests, scripts) and HashSigner (the
// base class a WebCrypto adapter needs).

import type { DevicesReq, OpKey, RelayReq } from "./api.ts"
import type { AccountId, PublicKeyStr } from "./ids.ts"
import type { ActionIntent, CallSpec } from "./intents.ts"

export type SignerKind = "device" | "near-auth" | "near-connect" | "demo"
export type Readiness = "ready" | "needs_device" | "reconnect_wallet" | "unsupported"

export interface Prepared {
  intent: ActionIntent
  call: CallSpec
  senderId: AccountId
  /** The op id that becomes the relay idempotencyKey (= requestRef for request_spend). */
  opId: OpKey
  nonce?: bigint
  maxBlockHeight?: bigint
  /** NEP-461-prefixed DelegateAction bytes, for NEAR Auth (it signs sha256 of them). */
  delegateBytes?: Uint8Array
}

export type SignedPayload =
  /** device, wallet delegate, demo → POST /api/relay */
  | { via: "relay"; body: RelayReq }
  /** NEAR Auth AddKey → POST /api/devices */
  | { via: "devices"; body: DevicesReq }
  /** wallet signAndSendTransaction (user paid gas) */
  | { via: "submitted"; txHash: string }

export interface PotSigner {
  readonly kind: SignerKind
  readonly accountId: AccountId
  readonly publicKey: PublicKeyStr | null
  /** true → ConfirmStep before sign() (popup or wallet UI) */
  readonly needsGesture: boolean
  /** false → the user pays testnet gas (wallet without signDelegateActions) */
  readonly relayed: boolean
  readiness(): Promise<Readiness>
  /** ALL async work happens here, before the tap. */
  prepare(intent: ActionIntent): Promise<Prepared>
  /** No await before opening a popup. */
  sign(p: Prepared, g?: { popup?: Window | null }): Promise<SignedPayload>
}
