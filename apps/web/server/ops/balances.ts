// B-11 balance alerts and global-cap watch (api-spec §3.5; architecture §4.4). Called by the reconcile cron
// and (relayer only, cached) after every relay. Alerts are deduped to one per key per hour (alert_state).
//   relayer  `users.{root}`  available NEAR   warn RELAYER_WARN_NEAR (relayer_low) · critical RELAYER_CRITICAL_NEAR
//   hub      `pots.{root}`   available NEAR   warn HUB_WARN_NEAR (hub_low; 5 prod / 1 preview) · create_pot refused
//                                             below HUB_FLOOR_NEAR (1) by the relay pipeline (hubAllowsCreate)
//   treasury `treasury.{root}` USDC (test)    warn TREASURY_WARN_USD ($100k, treasury_low) · below
//                                             TREASURY_CRITICAL_USD ($1,000) the faucet answers 503 `treasury`
//   global daily counters (quota_usage `global`): ≥ 80 % → `global_cap_near:<counter>`; hub_yocto ≥ 80 % → `hub_budget`
import "server-only"
import type { DbOrTx } from "@/db/client"
import { readQuota } from "@/db/quota"
import { sendAlert } from "../alerts"
import { relayerAvailable, sponsorLevel, type SponsorLevel } from "../chain/balance"
import { availableYocto, viewAccount, viewFunction } from "../chain/near"
import type { RpcClient } from "../chain/rpc"
import { nearToYocto, type Config } from "../config"
import { limit } from "../quotas"

const usd = (v: string | undefined, dflt: bigint) => (v && /^[0-9]+$/.test(v) ? BigInt(v) * 1_000_000n : dflt)

export function opsThresholds(cfg: Config, env: Record<string, string | undefined> = process.env) {
  const prod = cfg.quotaScale === "prod"
  return {
    hubWarn: nearToYocto(env.HUB_WARN_NEAR || (prod ? "5" : "1")),
    hubFloor: nearToYocto(env.HUB_FLOOR_NEAR || "1"),
    treasuryWarn: usd(env.TREASURY_WARN_USD, 100_000_000_000n),
    treasuryCritical: usd(env.TREASURY_CRITICAL_USD, 1_000_000_000n),
  }
}

// --- cached reads (per instance) ------------------------------------------------------------------
const cache = new Map<string, { at: number; v: bigint }>()
async function cached(key: string, maxAgeMs: number, read: () => Promise<bigint>): Promise<bigint> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at <= maxAgeMs) return hit.v
  const v = await read()
  cache.set(key, { at: Date.now(), v })
  return v
}
export function resetOpsCacheForTests(): void {
  cache.clear()
}

export const accountAvailable = (rpc: RpcClient, account: string, maxAgeMs = 30_000) =>
  cached(`near:${account}`, maxAgeMs, async () => {
    const a = await viewAccount(rpc, account, "optimistic")
    return a ? availableYocto(a) : 0n
  })

export const tokenBalance = (rpc: RpcClient, token: string, account: string, maxAgeMs = 60_000) =>
  cached(`ft:${token}:${account}`, maxAgeMs, async () => BigInt((await viewFunction<string>(rpc, token, "ft_balance_of", { account_id: account })) ?? "0"))

/** create_pot pre-check: the hub panics ERR_HUB_LOW_BALANCE below its reserve; refuse earlier (api-spec §3.5). */
export async function hubAllowsCreate(rpc: RpcClient, cfg: Config): Promise<boolean> {
  const available = await accountAvailable(rpc, cfg.hubId).catch(() => null)
  return available === null || available >= opsThresholds(cfg).hubFloor
}

/** Faucet / simulator pre-check: below the critical treasury float the faucet is off (api-spec §3.5). */
export async function treasuryAllowsFaucet(rpc: RpcClient, cfg: Config): Promise<boolean> {
  const bal = await tokenBalance(rpc, cfg.usdcId, cfg.treasuryAccountId).catch(() => null)
  return bal === null || bal >= opsThresholds(cfg).treasuryCritical
}

export interface BalanceReport {
  relayer: { available: string; level: SponsorLevel }
  hub: { available: string; level: "ok" | "low" | "critical" }
  treasury: { usd: string; level: "ok" | "low" | "critical" }
  alerts: string[]
}

/** Fresh reads of all three accounts; sends the alerts that apply. */
export async function checkBalances(deps: { db: DbOrTx; rpc: RpcClient; cfg: Config }): Promise<BalanceReport> {
  const { db, rpc, cfg } = deps
  const th = opsThresholds(cfg)
  const alerts: string[] = []
  const alert = async (key: string, text: string) => {
    alerts.push(key)
    await sendAlert(db, key, text)
  }
  const [relayer, hub, treasury] = await Promise.all([
    relayerAvailable(rpc, cfg.relayerAccountId, 0),
    accountAvailable(rpc, cfg.hubId, 0),
    tokenBalance(rpc, cfg.usdcId, cfg.treasuryAccountId, 0),
  ])
  const rLevel = sponsorLevel(relayer, cfg.relayerThresholds)
  if (rLevel === "critical" || rLevel === "empty") await alert("relayer_critical", `relayer ${cfg.relayerAccountId} available ${fmtNear(relayer)} NEAR`)
  else if (rLevel === "low") await alert("relayer_low", `relayer ${cfg.relayerAccountId} available ${fmtNear(relayer)} NEAR`)
  const hLevel = hub < th.hubFloor ? "critical" : hub < th.hubWarn ? "low" : "ok"
  if (hLevel !== "ok") await alert("hub_low", `hub ${cfg.hubId} available ${fmtNear(hub)} NEAR (${hLevel})`)
  const tLevel = treasury < th.treasuryCritical ? "critical" : treasury < th.treasuryWarn ? "low" : "ok"
  if (tLevel !== "ok") await alert("treasury_low", `treasury ${cfg.treasuryAccountId} holds $${(treasury / 1_000_000n).toString()} (${tLevel})`)
  return {
    relayer: { available: relayer.toString(), level: rLevel },
    hub: { available: hub.toString(), level: hLevel },
    treasury: { usd: treasury.toString(), level: tLevel },
    alerts,
  }
}

/** The global daily counters the relayer enforces (api-spec §3.5) and their usage today. */
export const GLOBAL_COUNTERS = [
  "relay_yocto",
  "hub_yocto",
  "demo_yocto",
  "topup_yocto",
  "relays",
  "pots_created",
  "accounts_created",
  "registrations",
  "dev_accounts",
  "mpc_signs",
  "faucet_usd",
] as const

export async function checkGlobalCaps(db: DbOrTx): Promise<{ counters: Record<string, { used: string; limit: string; pct: number }>; alerts: string[] }> {
  const counters: Record<string, { used: string; limit: string; pct: number }> = {}
  const alerts: string[] = []
  for (const c of GLOBAL_COUNTERS) {
    const lim = limit(`global_${c}`)
    const used = await readQuota(db, "global", c)
    const pct = lim > 0n ? Number((used * 1000n) / lim) / 10 : 0
    counters[c] = { used: used.toString(), limit: lim.toString(), pct }
    if (lim > 0n && pct >= 80) {
      const key = c === "hub_yocto" ? "hub_budget" : `global_cap_near:${c}`
      alerts.push(key)
      await sendAlert(db, key, `global ${c} at ${pct}% of today's cap (${used}/${lim})`)
    }
  }
  return { counters, alerts }
}

function fmtNear(y: bigint): string {
  const s = (y / 10n ** 21n).toString().padStart(4, "0")
  return `${s.slice(0, -3)}.${s.slice(-3)}`
}
