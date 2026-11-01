// Signers (frontend-architecture §4.1-4.2, §4.6-4.7) and `send()`: intent → prepare → sign → POST /api/relay.
//  - DeviceKeySigner (near-auth sessions): the non-extractable device key signs a NEP-366 delegate.
//    nonce = max(view_access_key(optimistic).nonce, last used) + 1, max_block_height = that block + 200.
//    Sign + relay run inside the SigningQueue (FIFO per account:key, one in flight), so nonces land in order.
//    `expired` / `nonce_used` → re-read the nonce, re-sign and retry once with the same idempotencyKey.
//  - Wallet sessions sign in their wallet (lib/signing/near-connect/wallet.ts).
import {
  buildCall,
  newOpKey,
  type AccountId,
  type ActionIntent,
  type Api,
  type PotSigner,
  type Prepared,
  type PublicKeyStr,
  type Readiness,
  type SignedPayload,
} from "@pot/sdk"
import { sdkConfig } from "../config"
import { ActionError } from "../errors"
import { deviceKeys } from "../keys/device-key-store"
import { signingChain as chain } from "./chain"
import { postRelay, type RelayOk } from "./relay"
import { ensureLiveSession, type SessionInfo } from "./session"

type Engine = typeof import("../keys/engine")
let enginePromise: Promise<Engine> | null = null
/** The lazy signing chunk (near-api-js). Warm it when a money sheet opens. */
export const loadEngine = (): Promise<Engine> => (enginePromise ??= import("../keys/engine"))

export class DeviceKeySigner implements PotSigner {
  readonly kind = "device" as const
  readonly needsGesture = false
  readonly relayed = true
  constructor(
    readonly accountId: AccountId,
    readonly publicKey: PublicKeyStr,
  ) {}

  async readiness(): Promise<Readiness> {
    const ak = await chain().account.accessKey(this.accountId, this.publicKey)
    return ak.value?.fullAccess ? "ready" : "needs_device"
  }

  async prepare(intent: ActionIntent, opId?: string): Promise<Prepared> {
    const engine = await loadEngine()
    const call = buildCall(intent, sdkConfig())
    const ak = await chain().account.accessKey(this.accountId, this.publicKey) // optimistic finality
    if (!ak.value) throw new ActionError("needs_device", "key_not_found")
    // A key added a moment ago starts at nonce = (its block) × 10⁶; the relayer refuses nonces at or above
    // (final head) × 10⁶ (`nonce` too_large), so a brand-new account waits until finality passes that block.
    for (let i = 0; i < 12; i++) {
      const head = await chain().account.head("final")
      if (ak.value.nonce + 1n < (BigInt(head.blockHeight) - 1n) * 1_000_000n) break
      await new Promise((r) => setTimeout(r, 700))
    }
    const { nonce, maxBlockHeight } = engine.nonceAndExpiry(this.accountId, this.publicKey, ak.value.nonce, ak.blockHeight)
    return { intent, call, senderId: this.accountId, opId: opId ?? (intent.type === "request_spend" ? intent.requestRef : newOpKey()), nonce, maxBlockHeight }
  }

  async sign(p: Prepared): Promise<SignedPayload> {
    const engine = await loadEngine()
    const store = deviceKeys()
    if (!store) throw new ActionError("needs_device", "unsupported")
    return { via: "relay", body: await engine.signPrepared(store, p) }
  }
}

/** frontend-architecture §4.1 resolveSigner: a NEAR Auth session signs with this browser's device key. */
export async function resolveSigner(s: SessionInfo | null): Promise<DeviceKeySigner> {
  if (!s) throw new ActionError("session", "not_signed_in")
  const key = await deviceKeys()?.get("current")
  if (!key || (key.accountId && key.accountId !== s.accountId)) throw new ActionError("needs_device", "key_not_found")
  return new DeviceKeySigner(s.accountId as AccountId, key.publicKey)
}

export interface SendOptions {
  opId?: string
  context?: Api.RelayContext
}

/** intent → signed → relayed → RelayOk (inner failures included; the caller reads `outcome`/`errorCode`). */
export async function send(intent: ActionIntent, opts: SendOptions = {}): Promise<RelayOk> {
  const session = await ensureLiveSession()
  // integrations (F-19): a wallet session signs with its wallet (a gasless delegate when it can, else self-paid)
  if (session?.kind === "wallet") return (await import("@/lib/signing/near-connect/wallet")).walletSend(intent, opts)
  try {
    return await sendOnce(intent, opts, session)
  } catch (e) {
    // integrations (B-13, D-21): a NEAR Auth account on a new device → "Confirm it's you", then the action resumes
    if (session?.kind === "near-auth" && e instanceof ActionError && e.cls === "needs_device") {
      await (await import("@/lib/devices/confirm")).requireDeviceConfirmation()
      return sendOnce(intent, opts, session)
    }
    throw e
  }
}

async function sendOnce(intent: ActionIntent, opts: SendOptions, session: SessionInfo | null): Promise<RelayOk> {
  const signer = await resolveSigner(session)
  const opId = opts.opId ?? (intent.type === "request_spend" ? intent.requestRef : newOpKey())
  const withContext = (body: Api.RelayReq): Api.RelayReq => (opts.context ? { ...body, context: opts.context } : body)

  const engine = await loadEngine()
  return engine.queue.run(`${signer.accountId}:${signer.publicKey}`, async () => {
    for (let attempt = 0; ; attempt++) {
      // sign when the job STARTS, not when it was enqueued, so the expiry stays fresh (§4.7)
      const s = await signer.sign(await signer.prepare(intent, opId))
      if (s.via !== "relay") throw new ActionError("bug", "via")
      try {
        return await postRelay(withContext(s.body))
      } catch (e) {
        if (attempt === 0 && e instanceof ActionError && e.cls === "retryable") {
          engine.nonces.reset(signer.accountId, signer.publicKey)
          await new Promise((r) => setTimeout(r, e.reason === "nonce_pending" ? 2000 : 300))
          continue
        }
        throw e
      }
    }
  })
}
