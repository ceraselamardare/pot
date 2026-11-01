// The data-source switch (implementation-plan §6.3, frontend-architecture §3): one build reads either the browser
// mock world (`NEXT_PUBLIC_DATA_SOURCE=mock`, the default; CI visual/axe tests, design work, hallway replays) or
// the live chain + our API (`testnet`). NEXT_PUBLIC_* values are inlined at build time, so a build is one or the
// other and the unused branch is dead code. Ids come from env only (D-02); never the deprecated near.org RPC.
import { TESTNET_RPC_URLS, type SdkConfig } from "@pot/sdk"

export type DataSource = "mock" | "testnet"

export const DATA_SOURCE: DataSource = process.env.NEXT_PUBLIC_DATA_SOURCE === "testnet" ? "testnet" : "mock"
export const IS_LIVE = DATA_SOURCE === "testnet"

/** preview/local only: "Join with a test account" (POST /api/session/dev, api-spec §2.1). */
export const FLAG_DEV_SESSION = process.env.NEXT_PUBLIC_FLAG_DEV_SESSION === "true"

const list = (v: string | undefined): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

/** The sdk config for this build. Server components may pass server-side overrides (HUB_ID, SERVER_RPC_URLS). */
export function sdkConfig(): SdkConfig {
  const rpc = list(process.env.NEXT_PUBLIC_RPC_URLS)
  return {
    network: "testnet",
    hubId: process.env.NEXT_PUBLIC_HUB_ID ?? "",
    usdcId: process.env.NEXT_PUBLIC_USDC_ID ?? "",
    rpcUrls: rpc.length ? rpc : TESTNET_RPC_URLS,
    txApiUrl: process.env.NEXT_PUBLIC_TX_API ?? "https://tx.test.fastnear.com",
    explorerUrl: process.env.NEXT_PUBLIC_EXPLORER ?? "https://testnet.nearblocks.io",
  }
}

/** `<slug>.<hub>` (D-02). */
export const daoOf = (slug: string): string => `${slug}.${sdkConfig().hubId}`
