// Server configuration, read once from env (names in .env.example; notes/backend.md lists the backend ones).
// Secrets (keys, HMAC) are NOT here: server/chain/keys.ts loads them lazily and never logs them.
import "server-only"

export type Network = "testnet" | "mainnet"

export interface Thresholds {
  /** below this the relayer refuses everything (yocto) */
  floor: bigint
  /** below this: refuse create_pot, faucet registrations, demo seeding, MPC signs */
  critical: bigint
  /** alert only */
  warn: bigint
}

export interface Config {
  network: Network
  vercelEnv: "production" | "preview" | "development"
  isProd: boolean
  appUrl: string
  /** origins allowed on non-GET routes (api-spec §0.2) */
  allowedOrigins: string[]
  secureCookies: boolean
  hubId: string
  usdcId: string
  rpcUrls: string[]
  txApiUrl: string
  explorerUrl: string
  relayerAccountId: string
  treasuryAccountId: string
  demoReferencePot: string | null
  nearAuth: { clientId: string; issuer: string; jwksUrl: string; acceptedAudiences: string[]; requireNonce: boolean }
  mpc: { contract: string; predecessor: string; domainId: number; signDepositYocto: bigint }
  flags: { devSession: boolean; demo: boolean; nearAuth: boolean; botId: boolean }
  /** USDC registration deposit (storage_balance_bounds.min); 0.00125 NEAR */
  tokenStorageDepositYocto: bigint
  relayerThresholds: Thresholds
  /** relayer key-pool lease names: relayer_key:<i> */
  relayerPool: string
  treasuryPool: string
  /** test-only extra relay rules (never honoured on production or mainnet), "receiver:method:depositYocto[:maxTgas]" */
  testAllowlist: TestRule[]
  quotaScale: "prod" | "preview"
}

export interface TestRule {
  receiver: string
  method: string
  deposit: bigint
  maxGas: bigint
}

const TGAS = 1_000_000_000_000n
const NEAR = 10n ** 24n

function bool(v: string | undefined, dflt = false): boolean {
  if (v === undefined || v === "") return dflt
  return v === "true" || v === "1"
}

function nearToYocto(v: string): bigint {
  const [w = "0", f = ""] = v.trim().split(".")
  return BigInt(w) * NEAR + BigInt((f + "0".repeat(24)).slice(0, 24))
}

function origin(u: string | undefined): string | null {
  if (!u) return null
  try {
    return new URL(u.includes("://") ? u : `https://${u}`).origin
  } catch {
    return null
  }
}

export function parseTestAllowlist(raw: string | undefined): TestRule[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [receiver, method, deposit, maxTgas] = entry.split(":")
      if (!receiver || !method) throw new Error(`bad RELAY_TEST_ALLOWLIST entry: ${entry}`)
      return {
        receiver,
        method,
        deposit: BigInt(deposit ?? "0"),
        maxGas: BigInt(maxTgas ?? "100") * TGAS,
      }
    })
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const vercelEnv = (env.VERCEL_ENV as Config["vercelEnv"]) || "development"
  const isProd = vercelEnv === "production"
  const network: Network = env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet"
  const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const rpcUrls = (env.SERVER_RPC_URLS || env.NEXT_PUBLIC_RPC_URLS || "https://rpc.testnet.fastnear.com,https://near-testnet.drpc.org")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  // D-32: the deprecated endpoint adds ~3 s per call and 429s; refuse to start with it.
  if (rpcUrls.some((u) => /rpc\.(testnet|mainnet)\.near\.org/.test(u))) throw new Error("near.org RPC is banned (D-32)")
  const allowedOrigins = [
    origin(appUrl),
    origin(env.VERCEL_URL),
    origin(env.VERCEL_BRANCH_URL),
    origin(env.VERCEL_PROJECT_PRODUCTION_URL),
    vercelEnv === "development" ? "http://localhost:3000" : null,
  ].filter((o): o is string => !!o)
  const issuer = `https://${env.NEXT_PUBLIC_NEAR_AUTH_DOMAIN || "login.testnet.fast-auth.com"}/`
  const clientId = env.NEAR_AUTH_CLIENT_ID || env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID || ""
  const testAllowlist = !isProd && network === "testnet" ? parseTestAllowlist(env.RELAY_TEST_ALLOWLIST) : []
  return {
    network,
    vercelEnv,
    isProd,
    appUrl,
    allowedOrigins: [...new Set(allowedOrigins)],
    secureCookies: appUrl.startsWith("https://"),
    hubId: env.HUB_ID || env.NEXT_PUBLIC_HUB_ID || "",
    usdcId: env.USDC_ID || env.NEXT_PUBLIC_USDC_ID || "",
    rpcUrls,
    txApiUrl: env.NEXT_PUBLIC_TX_API || "https://tx.test.fastnear.com",
    explorerUrl: env.NEXT_PUBLIC_EXPLORER || "https://testnet.nearblocks.io",
    relayerAccountId: env.RELAYER_ACCOUNT_ID || "",
    treasuryAccountId: env.TREASURY_ACCOUNT_ID || "",
    demoReferencePot: env.DEMO_REFERENCE_POT || null,
    nearAuth: {
      clientId,
      issuer,
      jwksUrl: env.NEAR_AUTH_JWKS_URL || `${issuer}.well-known/jwks.json`,
      acceptedAudiences: clientId ? [clientId] : [],
      // rev4 (B-20): production requires the device-bound nonce; local dev may log in without a challenge.
      requireNonce: isProd || bool(env.NEAR_AUTH_REQUIRE_NONCE),
    },
    mpc: {
      contract: env.MPC_CONTRACT_ID || (network === "testnet" ? "v1.signer-prod.testnet" : "v1.signer"),
      predecessor: env.FAST_AUTH_CONTRACT_ID || (network === "testnet" ? "fast-auth.testnet" : "fast-auth.near"),
      domainId: 1,
      signDepositYocto: BigInt(env.MPC_SIGN_DEPOSIT_YOCTO || "1"),
    },
    flags: {
      devSession: bool(env.FLAG_DEV_SESSION),
      demo: bool(env.FLAG_DEMO, true),
      nearAuth: bool(env.FLAG_NEAR_AUTH),
      botId: bool(env.FLAG_BOTID),
    },
    tokenStorageDepositYocto: BigInt(env.TOKEN_STORAGE_DEPOSIT_YOCTO || "1250000000000000000000"),
    relayerThresholds: {
      floor: nearToYocto(env.RELAYER_FLOOR_NEAR || "1"),
      critical: nearToYocto(env.RELAYER_CRITICAL_NEAR || "2"),
      warn: nearToYocto(env.RELAYER_WARN_NEAR || "5"),
    },
    relayerPool: "relayer_key",
    treasuryPool: "treasury_key",
    testAllowlist,
    quotaScale: isProd ? "prod" : "preview",
  }
}

let cached: Config | undefined
export function getConfig(): Config {
  return (cached ??= loadConfig())
}
/** Tests: override or reset the cached config. */
export function setConfigForTests(next: Config | undefined): void {
  cached = next
}

export { NEAR, TGAS, nearToYocto }
