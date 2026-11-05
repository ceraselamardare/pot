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
  // per-user NEAR budgets (rev4). user_hub_yocto prod 0.3 → 0.6 (2026-11-05): the hub's per-action estimates are
  // upper bounds (create 0.061, spend 0.011), so a judge's 3 Pots + 20 spends (≈ 0.40) no longer hits it; sybils are
  // bounded by the per-IP and new-account caps below instead.
  user_relay_yocto: [mNEAR(0.2), mNEAR(0.1)],
  user_hub_yocto: [mNEAR(0.6), mNEAR(0.15)],
  // APP-1 (security audit 2026-11-04): the lower tier for accounts first seen < 24 h ago (free wallet accounts are free
  // sybils). Sized from relay_log's measured costs: a judge's busy first day (3 Pots, ~20 spends, ~10 adds and
  // approvals) is ≈ 0.11 NEAR relayer / ≈ 0.40 NEAR hub and ~45 relays.
  new_user_relays: [150n, 150n], // relays per day, every family
  new_user_relay_yocto: [mNEAR(0.15), mNEAR(0.08)],
  new_user_hub_yocto: [mNEAR(0.5), mNEAR(0.15)],
  // global
  global_relay_yocto: [5n * NEAR, 1n * NEAR],
  global_hub_yocto: [5n * NEAR, 1n * NEAR],
  global_relays: [20_000n, 2_000n],
  // 20 → 40 (APP-1): with per-IP caps a handful of IPs no longer blocks creation for everyone; the money side is bounded
  // by global_hub_yocto and the pipeline's hub balance guard (hubAllows)
  global_pots_created: [40n, 10n],
  global_accounts_created: [300n, 50n],
  global_registrations: [200n, 50n], // lazy registrations (create/join/spend to self; APP-2) and the faucet
  global_close_registrations: [150n, 40n], // HUB-5: close payees only, never starved by sign-ups
  // APP-1: brand-new accounts together may use at most this much of the global relayer / hub budgets (estimate-based),
  // so a sybil wave leaves the rest for people who were here before today
  global_new_relay_yocto: [mNEAR(3.5), mNEAR(0.7)],
  global_new_hub_yocto: [mNEAR(3.5), mNEAR(0.7)],
  global_mpc_signs: [100n, 20n],
  global_faucet_usd: [50_000_000_000n, 5_000_000_000n],
  global_receipts: [2_000n, 300n], // receipt readings per day, everyone (bounds the NEAR AI credit)
  // per Pot
  pot_close_registrations: [80n, 80n], // HUB-5: two full closes' worth of payees per Pot per day
  // per IP (HMAC of the trusted client IP, APP-9: only Vercel's X-Forwarded-For is trusted). APP-1: generous enough for
  // a few judges behind one NAT, small next to the global caps
  ip_relays: [300n, 300n], // relays per day
  ip_relay_burst: [60n, 60n], // relays per minute
  ip_relay_yocto: [mNEAR(1), mNEAR(0.3)], // relayer NEAR (estimates) per day
  ip_hub_yocto: [mNEAR(1.2), mNEAR(0.3)], // hub NEAR (estimates) per day
  ip_pots_created: [6n, 6n],
  ip_signups: [10n, 10n], // new people (first wallet sign-in) per day
  ip_registrations: [6n, 6n], // lazy USDC registrations per day (APP-2)
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
