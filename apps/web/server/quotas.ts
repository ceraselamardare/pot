// Quota limits (api-spec §3.1 families, §3.5 global caps and budgets). Every limit can be overridden with
// QUOTA_<NAME> (e.g. QUOTA_GLOBAL_RELAY_YOCTO, QUOTA_USER_CONTRIBUTE); unset → the coded default for the
// environment (prod vs preview/local).
import "server-only"
import { getConfig } from "./config"

const NEAR = 10n ** 24n
const mNEAR = (n: number) => (BigInt(Math.round(n * 1e6)) * NEAR) / 1_000_000n

/** name → [prod, preview] */
const DEFAULTS: Record<string, [bigint, bigint]> = {
  // per user per UTC day (families)
  user_contribute: [20n, 20n],
  user_create: [3n, 3n],
  email_create: [3n, 3n],
  user_spend: [30n, 30n],
  user_join: [10n, 10n],
  user_invite: [20n, 20n],
  user_rules: [10n, 10n],
  user_close: [3n, 3n],
  user_maintenance: [20n, 20n],
  user_vote: [100n, 100n],
  user_gift: [10n, 10n], // hub 1.2.0: gifts sent per giver per day (any account, member or not)
  user_test: [20n, 50n],
  user_notes: [60n, 60n],
  user_comments: [200n, 200n], // comments on requests, per day
  user_comment_burst: [10n, 10n], // per minute
  user_burst: [20n, 20n], // per minute
  user_receipts: [30n, 30n], // "Snap the receipt" readings per day (each one is a paid NEAR AI call)
  user_receipt_burst: [5n, 5n], // per minute
  user_receipt_saves: [60n, 60n], // receipt details saved with a spend, per day
  user_receipt_save_burst: [10n, 10n], // per minute
  user_survey: [20n, 20n], // "Help us make Pot better" saves per day (one row per person, upserted)
  user_survey_burst: [5n, 5n], // per minute
  user_topups: [10n, 10n], // "Ask for a top-up": asks made per day
  user_topup_burst: [5n, 5n], // asks and cancels, per minute
  user_nudges: [10n, 10n], // people nudged per sender per day (api-spec §2.5)
  // per Pot per day
  pot_contribute: [200n, 200n],
  pot_spend: [100n, 100n],
  pot_vote: [500n, 500n],
  pot_close: [3n, 3n],
  pot_gift: [100n, 100n], // hub 1.2.0: gifts received per Pot per day
  proposal_finalize: [3n, 3n],
  // per-user NEAR budgets (rev4)
  user_relay_yocto: [mNEAR(0.2), mNEAR(0.1)],
  user_hub_yocto: [mNEAR(0.3), mNEAR(0.15)],
  // global
  global_relay_yocto: [5n * NEAR, 1n * NEAR],
  global_hub_yocto: [5n * NEAR, 1n * NEAR],
  global_relays: [20_000n, 2_000n],
  global_pots_created: [20n, 10n],
  global_accounts_created: [300n, 50n],
  global_registrations: [200n, 50n],
  global_mpc_signs: [100n, 20n],
  global_faucet_usd: [50_000_000_000n, 5_000_000_000n],
  global_receipts: [2_000n, 300n], // receipt readings per day, everyone (bounds the NEAR AI credit)
  // per IP
  ip_accounts_created: [3n, 3n],
  ip_session_create: [10n, 10n], // per hour in the spec; daily bucket here (WAF covers bursts)
  ip_faucet_usd: [1_000_000_000n, 1_000_000_000n],
  ip_gift: [30n, 30n], // hub 1.2.0: gifts relayed per IP (hashed) per day, when the route passes the IP hash
  // faucet per account
  account_faucet_claims: [5n, 5n],
  account_faucet_usd: [500_000_000n, 500_000_000n],
}

export function limit(name: keyof typeof DEFAULTS | string): bigint {
  const env = process.env[`QUOTA_${name.toUpperCase()}`]
  if (env && /^[0-9]+$/.test(env)) return BigInt(env)
  const d = DEFAULTS[name]
  if (!d) throw new Error(`unknown quota ${name}`)
  return getConfig().quotaScale === "prod" ? d[0] : d[1]
}
