// Server-side chain reads for the SSR pages (/j/[slug], /demo): @pot/sdk ChainViews over the server's RPC
// list (SERVER_RPC_URLS → NEXT_PUBLIC_RPC_URLS, FastNEAR first; near.org is refused by the server config) and
// the server-side ids (HUB_ID / USDC_ID override the public ones). No request budget on the server.
import "server-only"
import { createChainViews, createRpcClient, type ChainViews, type SdkConfig } from "@pot/sdk"
import { inArray } from "drizzle-orm"
import { getDb } from "@/db/client"
import { appUser } from "@/db/schema"
import { getConfig } from "@/server/config"

let views: ChainViews | null = null
let cfgCache: SdkConfig | null = null

export function serverSdkConfig(): SdkConfig {
  if (cfgCache) return cfgCache
  const c = getConfig()
  cfgCache = {
    network: "testnet",
    hubId: c.hubId,
    usdcId: c.usdcId,
    rpcUrls: c.rpcUrls,
    txApiUrl: process.env.NEXT_PUBLIC_TX_API ?? "https://tx.test.fastnear.com",
    explorerUrl: process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet.nearblocks.io",
  }
  return cfgCache
}

export function serverChain(): ChainViews {
  if (views) return views
  const key = process.env.FASTNEAR_API_KEY
  const rpc = createRpcClient({
    urls: serverSdkConfig().rpcUrls,
    budget: false,
    headers: key ? (u) => (u.includes("fastnear") ? { Authorization: `Bearer ${key}` } : undefined) : undefined,
  })
  views = createChainViews(serverSdkConfig(), rpc)
  return views
}

/** Display names from our DB (best effort; an empty map when the DB is unreachable). Off-chain: callers show them only
 *  to people allowed to see them (the invite's inviter, an open payment link's requester; privacy audit 2026-11-02). */
export async function displayNames(accounts: string[]): Promise<Map<string, string>> {
  if (!accounts.length) return new Map()
  try {
    const rows = await getDb()
      .select({ a: appUser.nearAccount, n: appUser.displayName })
      .from(appUser)
      .where(inArray(appUser.nearAccount, accounts))
    return new Map(rows.map((r) => [r.a, r.n]))
  } catch {
    return new Map()
  }
}
