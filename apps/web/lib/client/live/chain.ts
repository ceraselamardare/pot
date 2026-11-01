// The browser's chain reads (frontend-architecture §3.1): @pot/sdk ChainViews over the failover RPC client
// (FastNEAR → dRPC, 4 s timeout, 60 s stickiness, a 100/min per-tab token bucket). One instance per tab.
import { createChainViews, createRpcClient, type ChainViews, type RpcClient } from "@pot/sdk"
import { sdkConfig } from "../config"

let rpc: RpcClient | null = null
let views: ChainViews | null = null

export function chainRpc(): RpcClient {
  rpc ??= createRpcClient({ urls: sdkConfig().rpcUrls })
  return rpc
}

export function chain(): ChainViews {
  views ??= createChainViews(sdkConfig(), chainRpc())
  return views
}

let signingViews: ChainViews | null = null
/**
 * Reads on the signing path (nonce, head, the proposal to vote on): no token bucket, so a busy screen's
 * heartbeat can never queue an action behind it (they are a handful per action). Also the open proposals'
 * votes (queries.ts proposalsQuery: ≤ 1 call per 3 s, only while a proposal is open).
 */
export function signingChain(): ChainViews {
  signingViews ??= createChainViews(sdkConfig(), createRpcClient({ urls: sdkConfig().rpcUrls, budget: false }))
  return signingViews
}
