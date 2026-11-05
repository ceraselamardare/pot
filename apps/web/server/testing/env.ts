// Shared test setup: a test config, a FakeChain seeded with the D-61 cast, users in the test DB.
import type { KeyPair } from "near-api-js"
import { loadConfig, setConfigForTests, type Config } from "../config"
import { appUser, device } from "@/db/schema"
import type { Db } from "@/db/client"
import type { PotView } from "../chain/hub"
import { FakeChain } from "./fakeChain"
import { DAO, HUB, USDC } from "./delegates"

export const RELAYER = "users.potapp.testnet"
export const TREASURY = "treasury.potapp.testnet"
export const NEAR = 10n ** 24n

export function testConfig(env: Record<string, string> = {}): Config {
  const cfg = loadConfig({
    NODE_ENV: "test",
    NEXT_PUBLIC_NETWORK: "testnet",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_URL: "https://pot.test",
    HUB_ID: HUB,
    USDC_ID: USDC,
    RELAYER_ACCOUNT_ID: RELAYER,
    TREASURY_ACCOUNT_ID: TREASURY,
    NEAR_AUTH_CLIENT_ID: "test-client",
    APP_HMAC_SECRET: "x".repeat(40),
    SERVER_RPC_URLS: "https://rpc.testnet.fastnear.com",
    RELAY_TEST_ALLOWLIST: "wrap.testnet:ft_transfer:1",
    // APP-3: the nonce is required unless a local run turns it off explicitly; most unit tests log in without one
    NEAR_AUTH_REQUIRE_NONCE: "false",
    ...env,
  } as NodeJS.ProcessEnv)
  setConfigForTests(cfg)
  process.env.APP_HMAC_SECRET = "x".repeat(40)
  return cfg
}

export function potView(over: Partial<PotView> = {}): PotView {
  return {
    rules: { instant_cap: "100000000", member_budget: "200000000", instant_payees: "members", payee_allowlist: [] },
    rules_version: 1,
    closed_at_ms: null,
    total_contributed: "450000000",
    spent_instant: "0",
    spent_vote: "0",
    reserved: "0",
    balance_estimate: "450000000",
    last_contributor: null,
    open_requests: 0,
    active_invites: 1,
    unpaid_approved: 0,
    float: "50000000000000000000000",
    usdc: USDC,
    pot: DAO,
    slug: "lisbon-trip",
    name: "Lisbon Trip",
    emoji: "🇵🇹",
    preset: "trip",
    seq: 1,
    status: "open",
    close_proposal_id: null,
    creator: "maya.users.potapp.testnet",
    created_at_ms: 1_793_000_000_000,
    member_count: 3,
    joining_count: 0,
    approvals_needed: 2,
    proposal_period_ms: 604_800_000,
    request_count: 1,
    ...over,
  }
}

export function seedChain(chain: FakeChain, opts: { pot?: Partial<PotView> | null } = {}): FakeChain {
  chain.account(RELAYER, { amount: 20n * NEAR })
  chain.account(HUB, { amount: 30n * NEAR })
  chain.account(DAO, { amount: 1n * NEAR })
  const pv = opts.pot === null ? null : potView(opts.pot ?? {})
  chain.view(HUB, "get_pot", (a) => (pv && a.pot === pv.pot ? pv : null))
  return chain
}

let n = 0
export async function insertUser(
  db: Db,
  opts: { account: string; key?: KeyPair; kind?: "near-auth" | "wallet"; deviceStatus?: "active" | "pending" | "revoked" },
) {
  const kind = opts.kind ?? "near-auth"
  const [u] = await db
    .insert(appUser)
    .values({
      kind,
      authSub: kind === "near-auth" ? `google-oauth2|${++n}${Date.now()}` : null,
      nearAccount: opts.account,
      displayName: "Maya",
      avatarTint: "peach",
      usdcRegistered: true,
    })
    .returning()
  let d: typeof device.$inferSelect | undefined
  if (opts.key) {
    ;[d] = await db
      .insert(device)
      .values({ userId: u!.id, publicKey: opts.key.getPublicKey().toString(), keyKind: "fallback", status: opts.deviceStatus ?? "active" })
      .returning()
  }
  return { user: u!, device: d ?? null }
}
