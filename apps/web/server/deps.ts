// Per-instance singletons for route handlers: DB, RPC (failover), hub reader, the key-pool submitter.
// Tests build their own (createTestDb + a fake RpcClient) and never import this module's getters.
import "server-only"
import { after } from "next/server"
import { getDb, type Db } from "@/db/client"
import { createHubReader, type HubReader } from "./chain/hub"
import { loadKeys } from "./chain/keys"
import { createRpc, type RpcClient } from "./chain/rpc"
import { createSubmitter, type Submitter } from "./chain/submitter"
import { getConfig, type Config } from "./config"
import { giftsEnabled } from "./features/gifts/core"
import { onGiftReceived } from "./features/gifts/received"
import { giftRefValidator, markGiftFailed } from "./features/gifts/validate"
import { getPushSender, type PushSender } from "./notify/webpush"
import type { RelayDeps, RelayGiftHooks } from "./relay/pipeline"
import { errText } from "./util/errtext"

let rpc: RpcClient | undefined
let hub: HubReader | undefined
let submitter: Submitter | undefined

export function getRpc(): RpcClient {
  return (rpc ??= createRpc(getConfig().rpcUrls, { apiKey: process.env.FASTNEAR_API_KEY, timeoutMs: 10_000 }))
}

export function getHub(): HubReader {
  return (hub ??= createHubReader(getRpc(), getConfig().hubId))
}

/** Route-level tests only: the hub reader the routes use (a FakeChain-backed one); undefined resets it. */
export function setHubForTests(next: HubReader | undefined): void {
  hub = next
}

export function getSubmitter(): Submitter {
  const cfg = getConfig()
  return (submitter ??= createSubmitter({
    db: getDb(),
    rpc: getRpc(),
    pools: { [cfg.relayerPool]: loadKeys("RELAYER_KEYS"), [cfg.treasuryPool]: loadKeys("TREASURY_KEYS") },
  }))
}

/** after() keeps the instance alive for follow-ups; failures are logged, never thrown into the response. */
export function defer(fn: () => Promise<void>): void {
  after(async () => {
    try {
      await fn()
    } catch (e) {
      console.error(JSON.stringify({ level: "error", where: "after", err: errText(e, 300) }))
    }
  })
}

/**
 * hub 1.2.0 gifts (notes/contracts-gifts.md §8): the relayer's hooks into the gifts server module.
 *  - enabled: FLAG_GIFTS (R16 gift / R17 set_gifts are refused while it's off);
 *  - validateGiftRef: before relaying a gift, the ref must be one our server started (POST /api/gifts) for this Pot,
 *    amount and sender, through a link that still works or a public page that is on (else 409 gifts_unavailable);
 *  - onGiftReceived: the hub's trusted `gift_received` → our row `received` once (+ its link's uses), push to members;
 *  - onGiftFailed: the gift bounced (the token refunded the giver) → our row `failed`.
 */
export function giftRelayHooks(base: { db: Db; hub: HubReader; cfg: Config; push: PushSender | null }): RelayGiftHooks {
  return {
    enabled: giftsEnabled,
    validateGiftRef: giftRefValidator(base.db),
    onGiftReceived: (ev) => onGiftReceived({ db: base.db, hub: base.hub, cfg: base.cfg, sender: base.push }, ev),
    onGiftFailed: (ref) => markGiftFailed(base.db, ref),
  }
}

export function relayDeps(): RelayDeps {
  const base = { db: getDb(), hub: getHub(), cfg: getConfig(), push: getPushSender() }
  return { ...base, rpc: getRpc(), submitter: getSubmitter(), defer, gifts: giftRelayHooks(base) }
}
