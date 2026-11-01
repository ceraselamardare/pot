// A PotSigner for MockChain-backed UIs and tests: it behaves like the DemoSigner (no gesture,
// relayed; the "server" builds the CallSpec), producing a demo relay body that
// MockChain.handleRelayBody executes. Lets the frontend run every flow before testnet is wired.

import { intentToWire } from "../actions/build.ts"
import { buildCall } from "../actions/build.ts"
import type { RelayOk, Err } from "../types/api.ts"
import type { AccountId } from "../types/ids.ts"
import type { ActionIntent } from "../types/intents.ts"
import type { PotSigner, Prepared, Readiness, SignedPayload, SignerKind } from "../types/signer.ts"
import { newOpKey } from "../validate.ts"
import type { MockChain } from "./mock-chain.ts"

export class MockSigner implements PotSigner {
  readonly kind: SignerKind = "demo"
  readonly accountId: AccountId
  readonly publicKey = null
  readonly needsGesture = false
  readonly relayed = true
  private readonly chain: MockChain

  constructor(chain: MockChain, accountId: string) {
    this.chain = chain
    this.accountId = accountId as AccountId
  }

  async readiness(): Promise<Readiness> {
    return "ready"
  }

  async prepare(intent: ActionIntent): Promise<Prepared> {
    const opId = intent.type === "request_spend" ? intent.requestRef : newOpKey()
    return { intent, call: buildCall(intent, this.chain.cfg), senderId: this.accountId, opId }
  }

  async sign(p: Prepared): Promise<SignedPayload> {
    return { via: "relay", body: { demo: { intent: intentToWire(p.intent) }, idempotencyKey: p.opId } }
  }

  /** prepare → sign → MockChain.handleRelayBody, i.e. what POST /api/relay would answer. */
  async send(intent: ActionIntent): Promise<RelayOk | Err> {
    const signed = await this.sign(await this.prepare(intent))
    if (signed.via !== "relay") throw new Error("MockSigner only relays")
    return this.chain.handleRelayBody(this.accountId, signed.body)
  }
}
