// POST /api/faucet (X-09; api-spec §2.4): "Demo dollars (testnet)" from the treasury key pool.
// Idempotent per (user, key); per-account 5 claims and $500 a day, $1,000 per IP, a global daily cap; a $50
// minimum (rev4 L-6); registers the account once ever (relay_log key `register:{account}`), 409
// `registration_used` if it unregistered since. Never ft_transfer_call on the user's behalf.
import "server-only"
import { and, eq } from "drizzle-orm"
import { actions } from "near-api-js"
import type { Db } from "@/db/client"
import { adjustQuota, chargeQuotas, nextUtcDay, type QuotaCharge } from "@/db/quota"
import { appUser, relayLog } from "@/db/schema"
import { sendAlert } from "../alerts"
import { relayerAvailable, sponsorAllows, sponsorLevel } from "../chain/balance"
import { block, viewFunction } from "../chain/near"
import { burnt, failureText, firstFailure, statusFailure } from "../chain/outcome"
import type { RpcClient } from "../chain/rpc"
import type { Submitter } from "../chain/submitter"
import type { Config } from "../config"
import { ApiError, errBody, unavailable } from "../http/errors"
import { treasuryAllowsFaucet } from "../ops/balances"
import { limit } from "../quotas"
import { registerToken } from "../session/onboard"
import type { SessionCtx } from "../session/store"
import { newRelayId, sha256Hex } from "../util/crypto"

export interface FaucetDeps {
  db: Db
  rpc: RpcClient
  submitter: Submitter
  cfg: Config
  sleep?: (ms: number) => Promise<void>
}

export const FAUCET_DEFAULT = 150_000_000n
export const FAUCET_MIN = 50_000_000n
export const FAUCET_MAX = 500_000_000n
const TGAS = 1_000_000_000_000n

type Row = typeof relayLog.$inferSelect

export async function claimFaucet(
  deps: FaucetDeps,
  s: SessionCtx,
  body: { amount?: string; idempotencyKey: string },
  meta: { ipHash: string; requestId: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { db, cfg } = deps
  if (cfg.network !== "testnet") throw new ApiError("not_found")
  const amount = body.amount === undefined ? FAUCET_DEFAULT : BigInt(body.amount)
  if (amount < FAUCET_MIN || amount > FAUCET_MAX) throw new ApiError("bad_request", { detail: { field: "amount", min: "50000000", max: "500000000" } })
  const account = s.user.nearAccount
  const key = `faucet:${body.idempotencyKey}`
  const bodyHash = sha256Hex(`${amount}`)

  // idempotency: the same key returns the earlier result (the Add sheet may call this as it opens)
  const prior = (await db.select().from(relayLog).where(and(eq(relayLog.userId, s.user.id), eq(relayLog.idempotencyKey, key))).limit(1))[0]
  if (prior) return replay(deps, prior, bodyHash)

  // B-11: below the critical treasury float the faucet is off (api-spec §3.5); the cron alerts `treasury_low`
  if (!(await treasuryAllowsFaucet(deps.rpc, cfg))) throw unavailable("treasury", 60_000, { why: "treasury_low" })
  const subject = `account:${account}`
  const charges: QuotaCharge[] = [
    { subject, action: "faucet_claims", amount: 1n, limit: limit("account_faucet_claims") },
    { subject, action: "faucet_usd", amount, limit: limit("account_faucet_usd") },
    { subject: `ip:${meta.ipHash}`, action: "faucet_usd", amount, limit: limit("ip_faucet_usd") },
    { subject: "global", action: "faucet_usd", amount, limit: limit("global_faucet_usd") },
  ]
  const q = await chargeQuotas(db, charges)
  if (!q.ok)
    throw new ApiError("quota_exceeded", { detail: { family: "faucet", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
  const refund = () =>
    Promise.all(charges.map((c) => adjustQuota(db, [c.subject], c.action, -c.amount))).catch(() => undefined)

  const relayId = newRelayId()
  try {
    await db.insert(relayLog).values({
      id: relayId,
      requestId: meta.requestId,
      userId: s.user.id,
      idempotencyKey: key,
      bodyHash,
      op: "faucet",
      senderId: cfg.treasuryAccountId,
      receiverId: cfg.usdcId,
      methods: ["ft_transfer"],
      status: "validated",
    })
  } catch (e) {
    await refund()
    const again = (await db.select().from(relayLog).where(and(eq(relayLog.userId, s.user.id), eq(relayLog.idempotencyKey, key))).limit(1))[0]
    if (again) return replay(deps, again, bodyHash)
    throw e
  }

  try {
    // 1. registration (once per account ever)
    let registeredNow = false
    const bal = await viewFunction<unknown>(deps.rpc, cfg.usdcId, "storage_balance_of", { account_id: account })
    if (!bal) {
      const before = (
        await db
          .select({ status: relayLog.status })
          .from(relayLog)
          .where(and(eq(relayLog.op, "storage_deposit"), eq(relayLog.idempotencyKey, `register:${account}`)))
          .limit(1)
      )[0]
      if (before?.status === "executed") throw new ApiError("registration_used")
      const reg = await chargeQuotas(db, [{ subject: "global", action: "registrations", amount: 1n, limit: limit("global_registrations") }])
      if (!reg.ok) throw new ApiError("quota_exceeded", { detail: { family: "accounts", resetsAt: nextUtcDay().toISOString() } })
      const level = sponsorLevel(await relayerAvailable(deps.rpc, cfg.relayerAccountId), cfg.relayerThresholds)
      if (!sponsorAllows(level, "registration")) throw unavailable("sponsor_low", 60_000)
      const r = await registerToken(deps, account)
      if (!r.ok) throw new ApiError("account_setup_failed", { txHash: r.txHash })
      registeredNow = true
      await db.update(appUser).set({ usdcRegistered: true }).where(eq(appUser.id, s.user.id))
    }
    // 2. treasury ft_transfer with 1 yocto
    const res = await deps.submitter.submit(
      {
        signerId: cfg.treasuryAccountId,
        receiverId: cfg.usdcId,
        actions: [
          actions.functionCall("ft_transfer", { receiver_id: account, amount: amount.toString(), memo: "Demo dollars (testnet)" }, 30n * TGAS, 1n),
        ],
      },
      {
        pool: cfg.treasuryPool,
        holder: relayId,
        budgetMs: 20_000,
        busyCause: "treasury",
        onSigned: async ({ txHash, publicKey }) => {
          await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, relayId))
        },
      },
    )
    if (res.kind === "pending") {
      await db.update(relayLog).set({ status: "pending" }).where(eq(relayLog.id, relayId))
      return { status: 202, body: { status: "pending", txHash: res.txHash, amount: amount.toString(), registeredNow } }
    }
    const top = res.outcome.status as Record<string, unknown>
    const failedReceipt = firstFailure(res.outcome)
    const failure = "Failure" in top ? failureText(top.Failure) : failedReceipt ? failureText(statusFailure(failedReceipt.outcome.status)) : null
    if (failure) {
      await sendAlert(db, "treasury_low", `faucet transfer failed: ${failure.slice(0, 120)}`)
      throw unavailable("treasury", 60_000, { txHash: res.txHash })
    }
    const head = await block(deps.rpc, { blockId: res.outcome.receipts_outcome.at(-1)?.block_hash ?? res.outcome.transaction_outcome.block_hash }).catch(() => null)
    const out = { txHash: res.txHash, amount: amount.toString(), registeredNow, executedAtBlock: head?.height ?? 0 }
    await db
      .update(relayLog)
      .set({
        status: "executed",
        outcome: "success",
        response: { ok: true, requestId: meta.requestId, ...out },
        httpStatus: 200,
        costYocto: (burnt(res.outcome).yocto + 1n).toString(),
        finishedAt: new Date(),
      })
      .where(eq(relayLog.id, relayId))
    return { status: 200, body: out }
  } catch (e) {
    await refund()
    const err = e instanceof ApiError ? e : new ApiError("internal")
    if (err.status >= 500 && !err.txHash) {
      // transient and nothing reached the chain: free the key so the same intent can retry
      await db.delete(relayLog).where(eq(relayLog.id, relayId))
      throw e
    }
    await db
      .update(relayLog)
      .set({ status: "failed", reason: err.reason, response: errBody(err, meta.requestId), httpStatus: err.status, finishedAt: new Date() })
      .where(eq(relayLog.id, relayId))
    throw e
  }
}

async function replay(deps: FaucetDeps, row: Row, bodyHash: string): Promise<{ status: number; body: Record<string, unknown> }> {
  if (row.bodyHash && row.bodyHash !== bodyHash) throw new ApiError("idempotency_conflict")
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let cur: Row | undefined = row
  for (let i = 0; cur && !cur.response && i < 20; i++) {
    await sleep(500)
    cur = (await deps.db.select().from(relayLog).where(eq(relayLog.id, row.id)).limit(1))[0]
  }
  const stored = cur?.response as Record<string, unknown> | undefined
  if (!stored) return { status: 202, body: { status: "pending", txHash: cur?.outerTxHash ?? "", replayed: true } }
  if (stored.ok === false) {
    const { reason, detail, retryAfterMs, txHash } = stored as { reason: string; detail?: Record<string, unknown>; retryAfterMs?: number; txHash?: string }
    throw new ApiError(reason as never, { detail, retryAfterMs, txHash })
  }
  const { ok: _ok, requestId: _rid, ...rest } = stored
  void _ok
  void _rid
  return { status: cur?.httpStatus ?? 200, body: { ...rest, replayed: true } }
}
