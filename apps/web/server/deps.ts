// Per-instance singletons for route handlers: DB, RPC (failover), hub reader, the key-pool submitter.
// Tests build their own (createTestDb + a fake RpcClient) and never import this module's getters.
import "server-only"
import { after } from "next/server"
import { getDb } from "@/db/client"
import { createHubReader, type HubReader } from "./chain/hub"
import { loadKeys } from "./chain/keys"
import { createRpc, type RpcClient } from "./chain/rpc"
import { createSubmitter, type Submitter } from "./chain/submitter"
import { getConfig } from "./config"
import { getPushSender } from "./notify/webpush"
import type { RelayDeps } from "./relay/pipeline"

let rpc: RpcClient | undefined
let hub: HubReader | undefined
let submitter: Submitter | undefined

export function getRpc(): RpcClient {
  return (rpc ??= createRpc(getConfig().rpcUrls, { apiKey: process.env.FASTNEAR_API_KEY, timeoutMs: 10_000 }))
}

export function getHub(): HubReader {
  return (hub ??= createHubReader(getRpc(), getConfig().hubId))
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
      console.error(JSON.stringify({ level: "error", where: "after", err: String(e).slice(0, 300) }))
    }
  })
}

export function relayDeps(): RelayDeps {
  return { db: getDb(), rpc: getRpc(), hub: getHub(), submitter: getSubmitter(), cfg: getConfig(), defer, push: getPushSender() }
}
