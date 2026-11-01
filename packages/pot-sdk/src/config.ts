// SdkConfig and id helpers (frontend-architecture §1.4; D-02 account map, D-32 RPC list).

import type { AccountId, DaoId } from "./types/ids.ts"

export type Network = "testnet" | "mainnet"

export interface SdkConfig {
  network: Network
  /** pots.<root>.testnet (D-02) */
  hubId: string
  /** usdc.<root>.testnet (D-11) */
  usdcId: string
  /** RPC failover list, FastNEAR first (D-32). Never the deprecated near.org endpoint. */
  rpcUrls: readonly string[]
  /** FastNEAR Tx API, e.g. https://tx.test.fastnear.com */
  txApiUrl: string
  /** e.g. https://testnet.nearblocks.io */
  explorerUrl: string
}

/** D-32: FastNEAR first, dRPC as failover (kb/backend-infra.md). */
export const TESTNET_RPC_URLS = ["https://rpc.testnet.fastnear.com", "https://near-testnet.drpc.org"] as const
export const MAINNET_RPC_URLS = ["https://rpc.mainnet.fastnear.com", "https://near.drpc.org"] as const

/** Builds the D-02 testnet account map for `<root>` (e.g. "potapp" → pots.potapp.testnet). */
export function testnetConfig(root: string, overrides: Partial<SdkConfig> = {}): SdkConfig {
  return {
    network: "testnet",
    hubId: `pots.${root}.testnet`,
    usdcId: `usdc.${root}.testnet`,
    rpcUrls: TESTNET_RPC_URLS,
    txApiUrl: "https://tx.test.fastnear.com",
    explorerUrl: "https://testnet.nearblocks.io",
    ...overrides,
  }
}

/** A Pot's DAO account is `<slug>.<hubId>` (D-02). */
export function daoIdFromSlug(slug: string, hubId: string): DaoId {
  return `${slug}.${hubId}` as DaoId
}

/** The slug of `<slug>.<hubId>`, or null when the id isn't a direct sub-account of the hub. */
export function slugFromDaoId(dao: string, hubId: string): string | null {
  const suffix = `.${hubId}`
  if (!dao.endsWith(suffix)) return null
  const slug = dao.slice(0, -suffix.length)
  return slug.length > 0 && !slug.includes(".") ? slug : null
}

export const isPotDao = (id: string, hubId: string): id is DaoId => slugFromDaoId(id, hubId) !== null

export const explorerTxUrl = (cfg: Pick<SdkConfig, "explorerUrl">, txHash: string): string =>
  `${cfg.explorerUrl}/txns/${txHash}`
export const explorerAccountUrl = (cfg: Pick<SdkConfig, "explorerUrl">, account: AccountId | string): string =>
  `${cfg.explorerUrl}/address/${account}`
