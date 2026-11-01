// Sponsored account creation (D-23; kb/accounts-onboarding.md): a named sub-account of the relayer with only
// full-access keys and 0 NEAR (NEP-448), and the token registration paid in parallel (≈ 0.0085 NEAR total).
// Both txs go through the relayer key pool and get relay_log rows with deterministic server keys:
// `create:{account}` and `register:{account}` (the faucet reads the second, rev4 L-6).
import "server-only"
import { and, eq, isNull } from "drizzle-orm"
import { actions, PublicKey } from "near-api-js"
import type { Db } from "@/db/client"
import { relayLog } from "@/db/schema"
import { viewAccount, type FinalOutcome } from "../chain/near"
import type { RpcClient } from "../chain/rpc"
import type { Submitter } from "../chain/submitter"
import { burnt, failureText, firstFailure, statusFailure } from "../chain/outcome"
import type { Config } from "../config"
import { ApiError, unavailable } from "../http/errors"
import { crockford, newRelayId } from "../util/crypto"

export interface OnboardDeps {
  db: Db
  rpc: RpcClient
  submitter: Submitter
  cfg: Config
}

const TGAS = 1_000_000_000_000n

/** One relay_log row per deterministic server key (a resumed onboarding reuses and resets it). */
export async function serverRow(
  db: Db,
  r: { op: (typeof relayLog.$inferInsert)["op"]; key: string; senderId: string; receiverId: string; methods: string[]; potId?: string },
): Promise<string> {
  const find = async () =>
    (
      await db
        .select({ id: relayLog.id })
        .from(relayLog)
        .where(and(eq(relayLog.op, r.op), eq(relayLog.idempotencyKey, r.key), isNull(relayLog.userId)))
        .limit(1)
    )[0]?.id
  const existing = await find()
  if (existing) {
    await db.update(relayLog).set({ status: "validated", outerTxHash: null }).where(eq(relayLog.id, existing))
    return existing
  }
  const id = newRelayId()
  try {
    await db.insert(relayLog).values({
      id,
      requestId: id,
      op: r.op,
      idempotencyKey: r.key,
      senderId: r.senderId,
      receiverId: r.receiverId,
      methods: r.methods,
      potId: r.potId ?? null,
      status: "validated",
    })
    return id
  } catch (e) {
    const again = await find()
    if (again) return again
    throw e
  }
}

/** `u-{8 Crockford chars}.{RELAYER_ACCOUNT_ID}` that doesn't exist yet (3 draws). */
export async function drawAccountId(deps: OnboardDeps): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const id = `u-${crockford(8)}.${deps.cfg.relayerAccountId}`
    if (!(await viewAccount(deps.rpc, id, "optimistic"))) return id
  }
  throw unavailable("rpc", 2_000, { why: "account_id_draw" })
}

async function serverTx(
  deps: OnboardDeps,
  opts: { op: "create_account" | "storage_deposit"; key: string; receiverId: string; methods: string[]; actions: ReturnType<typeof actions.createAccount>[]; budgetMs?: number },
): Promise<{ txHash: string; outcome: FinalOutcome | null; failed: string | null }> {
  const { db, cfg } = deps
  const rowId = await serverRow(db, {
    op: opts.op,
    key: opts.key,
    senderId: cfg.relayerAccountId,
    receiverId: opts.receiverId,
    methods: opts.methods,
  })
  const r = await deps.submitter.submit(
    { signerId: cfg.relayerAccountId, receiverId: opts.receiverId, actions: opts.actions },
    {
      pool: cfg.relayerPool,
      holder: rowId,
      budgetMs: opts.budgetMs ?? 20_000,
      onSigned: async ({ txHash, publicKey }) => {
        await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, rowId))
      },
    },
  )
  if (r.kind === "pending") {
    await db.update(relayLog).set({ status: "pending" }).where(eq(relayLog.id, rowId))
    return { txHash: r.txHash, outcome: null, failed: null }
  }
  const top = r.outcome.status as Record<string, unknown>
  const fail = "Failure" in top ? failureText(top.Failure) : (() => {
    const f = firstFailure(r.outcome)
    return f ? failureText(statusFailure(f.outcome.status)) : null
  })()
  await db
    .update(relayLog)
    .set({
      status: fail ? "failed" : "executed",
      outcome: fail ? "inner_failed" : "success",
      errorText: fail,
      costYocto: (burnt(r.outcome).yocto + (opts.op === "storage_deposit" ? deps.cfg.tokenStorageDepositYocto : 0n)).toString(),
      finishedAt: new Date(),
    })
    .where(eq(relayLog.id, rowId))
  return { txHash: r.txHash, outcome: r.outcome, failed: fail }
}

/** [CreateAccount, AddKey(pk, FullAccess)…] signed by the parent (relayer). */
export async function createAccount(deps: OnboardDeps, accountId: string, publicKeys: string[]) {
  const r = await serverTx(deps, {
    op: "create_account",
    key: `create:${accountId}`,
    receiverId: accountId,
    methods: ["CreateAccount", ...publicKeys.map(() => "AddKey")],
    actions: [actions.createAccount(), ...publicKeys.map((pk) => actions.addFullAccessKey(PublicKey.from(pk)))],
  })
  if (r.failed || !r.outcome) throw new ApiError("account_setup_failed", { txHash: r.txHash, message: r.failed ?? "pending" })
  return r.txHash
}

/** usdc.storage_deposit({account_id, registration_only: true}) with the registration deposit. */
export async function registerToken(deps: OnboardDeps, accountId: string): Promise<{ ok: boolean; txHash: string }> {
  const token = deps.cfg.usdcId
  const r = await serverTx(deps, {
    op: "storage_deposit",
    key: `register:${accountId}`,
    receiverId: token,
    methods: ["storage_deposit"],
    actions: [
      actions.functionCall("storage_deposit", { account_id: accountId, registration_only: true }, 30n * TGAS, deps.cfg.tokenStorageDepositYocto),
    ],
  })
  return { ok: !r.failed && !!r.outcome, txHash: r.txHash }
}
