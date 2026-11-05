// Token (USDC) registration, paid by the relayer, only when an account first needs to receive money.
//
// APP-2 (security audit 2026-11-04): it used to be paid at every first wallet sign-in, from the same global counter
// the close payouts use, so throwaway accounts could drain NEAR and starve a close. Now:
//  - "general" budget: an account that creates or joins a Pot, or asks for a spend to itself, is registered once ever
//    (relay_log key `register:{account}`), charged to `global_registrations` and, when the caller passes it, to the
//    hashed IP's `ip_registrations`. The faucet keeps its own path (server/features/faucet.ts).
//  - "close" budget (HUB-5): a close's payees are registered before the deciding vote / the goal refund approval, from a
//    SEPARATE `global_close_registrations` counter (plus `pot_close_registrations` per Pot), so sign-ups can never
//    starve it. A payee who unregistered on purpose is registered again (that's the attack this closes).
// Nothing here throws for chain or quota trouble: callers get an outcome and decide.
import "server-only"
import { and, eq } from "drizzle-orm"
import type { Db } from "@/db/client"
import { chargeQuotas, type QuotaCharge } from "@/db/quota"
import { appUser, relayLog } from "@/db/schema"
import { relayerAvailable, sponsorAllows, sponsorLevel } from "../chain/balance"
import { viewFunction } from "../chain/near"
import type { RpcClient } from "../chain/rpc"
import type { Submitter } from "../chain/submitter"
import type { Config } from "../config"
import { limit } from "../quotas"
import { registerToken } from "../session/onboard"

export interface RegistrationDeps {
  db: Db
  rpc: RpcClient
  submitter: Submitter
  cfg: Config
}

export type RegistrationBudget = "general" | "close"
/** registered = we paid now · already = nothing to pay · skipped = not attempted (budget, sponsor, unknown) · failed = the tx failed */
export type RegisterOutcome = "registered" | "already" | "skipped" | "failed"

/** storage_balance_of on the token: true / false, or null when the chain can't say right now. */
export async function tokenRegistered(deps: Pick<RegistrationDeps, "rpc" | "cfg">, account: string): Promise<boolean | null> {
  try {
    return !!(await viewFunction<unknown>(deps.rpc, deps.cfg.usdcId, "storage_balance_of", { account_id: account }, "optimistic"))
  } catch {
    return null
  }
}

async function paidBefore(db: Db, account: string): Promise<boolean> {
  const row = (
    await db
      .select({ status: relayLog.status })
      .from(relayLog)
      .where(and(eq(relayLog.op, "storage_deposit"), eq(relayLog.idempotencyKey, `register:${account}`)))
      .limit(1)
  )[0]
  return row?.status === "executed"
}

export async function ensureRegistered(
  deps: RegistrationDeps,
  x: { account: string; budget: RegistrationBudget; userId?: string | null; ipHash?: string; potId?: string },
): Promise<RegisterOutcome> {
  const { db, cfg } = deps
  if (!cfg.usdcId) return "skipped"
  if (x.budget === "general" && x.userId) {
    const u = (await db.select({ r: appUser.usdcRegistered }).from(appUser).where(eq(appUser.id, x.userId)).limit(1))[0]
    if (u?.r) return "already"
  }
  const onChain = await tokenRegistered(deps, x.account)
  if (onChain) {
    await db
      .update(appUser)
      .set({ usdcRegistered: true })
      .where(eq(appUser.nearAccount, x.account))
      .catch(() => undefined)
    return "already"
  }
  // general: never on an unknown read, and once per account ever; close: a registration_only deposit to an account that
  // is registered after all is refunded by the token, so an unknown read still tries
  if (x.budget === "general" && (onChain === null || (await paidBefore(db, x.account)))) return onChain === null ? "skipped" : "already"
  const level = sponsorLevel(await relayerAvailable(deps.rpc, cfg.relayerAccountId).catch(() => 0n), cfg.relayerThresholds)
  if (!sponsorAllows(level, "registration")) return "skipped"
  const charges: QuotaCharge[] =
    x.budget === "close"
      ? [
          { subject: "global", action: "close_registrations", amount: 1n, limit: limit("global_close_registrations") },
          ...(x.potId
            ? [{ subject: `pot:${x.potId}`, action: "close_registrations", amount: 1n, limit: limit("pot_close_registrations") }]
            : []),
        ]
      : [
          { subject: "global", action: "registrations", amount: 1n, limit: limit("global_registrations") },
          ...(x.ipHash ? [{ subject: `ip:${x.ipHash}`, action: "registrations", amount: 1n, limit: limit("ip_registrations") }] : []),
        ]
  if (!(await chargeQuotas(db, charges)).ok) return "skipped"
  const r = await registerToken(deps, x.account).catch(() => ({ ok: false }))
  if (!r.ok) return "failed"
  await db
    .update(appUser)
    .set({ usdcRegistered: true })
    .where(eq(appUser.nearAccount, x.account))
    .catch(() => undefined)
  return "registered"
}

/** The `ft_transfer` receivers of a close's DAO proposal kind (FunctionCall on the token); [] for anything else. */
export function closePayees(kind: Record<string, unknown>, usdcId: string): string[] {
  const fc = (kind.FunctionCall ?? {}) as { receiver_id?: string; actions?: { method_name?: string; args?: string }[] }
  if (fc.receiver_id !== usdcId) return []
  const payees = new Set<string>()
  for (const a of fc.actions ?? []) {
    if (a.method_name !== "ft_transfer" || !a.args) continue
    try {
      const args = JSON.parse(Buffer.from(a.args, "base64").toString("utf8")) as { receiver_id?: unknown }
      if (typeof args.receiver_id === "string") payees.add(args.receiver_id)
    } catch {
      // not a payout action
    }
  }
  return [...payees]
}

export interface PayeeRegistration {
  registered: string[]
  /** unregistered payees we could not try now (budget, sponsor): the close would fail on chain */
  skipped: string[]
  failed: string[]
}

/** HUB-5 / rev4 M-5: register every payee that isn't registered on the token (≤ 40, the hub's member cap). */
export async function registerPayees(deps: RegistrationDeps, payees: string[], potId?: string): Promise<PayeeRegistration> {
  const out: PayeeRegistration = { registered: [], skipped: [], failed: [] }
  for (const p of payees.slice(0, 40)) {
    const r = await ensureRegistered(deps, { account: p, budget: "close", potId })
    if (r === "registered") out.registered.push(p)
    else if (r === "skipped") out.skipped.push(p)
    else if (r === "failed") out.failed.push(p)
  }
  return out
}
