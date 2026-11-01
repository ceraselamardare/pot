// Sponsor health (api-spec §3.2 step 11, §3.5 thresholds): the relayer's available balance, cached ≤ 30 s
// per instance. Warn/critical 5/2 NEAR (rev4; 1-yocto MPC deposit), < 1 NEAR refuses everything.
import "server-only"
import type { Thresholds } from "../config"
import { availableYocto, viewAccount } from "./near"
import type { RpcClient } from "./rpc"

let cache: { account: string; at: number; available: bigint } | null = null

export async function relayerAvailable(rpc: RpcClient, accountId: string, maxAgeMs = 30_000): Promise<bigint> {
  if (cache && cache.account === accountId && Date.now() - cache.at <= maxAgeMs) return cache.available
  const a = await viewAccount(rpc, accountId, "optimistic")
  const available = a ? availableYocto(a) : 0n
  cache = { account: accountId, at: Date.now(), available }
  return available
}

export function resetBalanceCacheForTests(): void {
  cache = null
}

export type SponsorLevel = "ok" | "low" | "critical" | "empty"
export function sponsorLevel(available: bigint, t: Thresholds): SponsorLevel {
  if (available < t.floor) return "empty"
  if (available < t.critical) return "critical"
  if (available < t.warn) return "low"
  return "ok"
}

/** Ops that need more than the floor: refused once the relayer is critical (create_pot, registrations, MPC). */
export const HEAVY_OPS = new Set(["create_pot", "registration", "mpc_sign", "create_account"])

export function sponsorAllows(level: SponsorLevel, op: string): boolean {
  if (level === "empty") return false
  if (level === "critical") return !HEAVY_OPS.has(op)
  return true
}
