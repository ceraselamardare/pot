// Any-chain deposits (B-14; api-spec §2.7, §5.1; D-50; review-security H-3 / S-5).
//  - GET  /api/oneclick/chains        chain list + Shield status
//  - POST /api/oneclick/quote         dry: a real signed 1Click quote (mainnet API, read-only); non-dry: a
//                                     deposit_intent row (simulated on testnet: a labelled fake address)
//  - GET  /api/oneclick/status[/id]   the stepper status; lazily advances the simulator and, at SUCCESS, delivers
//                                     real "USDC (test)" from the treasury (through the token, like 1Click would)
//  - POST /api/oneclick/simulate      "Simulate sending" (testnet only), capped ≤ $500 per person per day,
//                                     inside the global faucet cap
// The Workflow poller (§5.1) isn't wired (workflow is not in next.config): status advances when the client polls,
// which it does while the stepper or the Pot's deposit card is on screen. ADDED is set when the client shows the
// relayed contribution (`?relayId=`), verified against relay_log.
import "server-only"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { actions } from "near-api-js"
import { ulid } from "ulid"
import type { Db } from "@/db/client"
import { adjustQuota, chargeQuotas, nextUtcDay, type QuotaCharge } from "@/db/quota"
import { depositIntent, relayLog } from "@/db/schema"
import type { HubReader } from "../../chain/hub"
import { viewFunction } from "../../chain/near"
import { failureText, firstFailure, statusFailure } from "../../chain/outcome"
import type { RpcClient } from "../../chain/rpc"
import type { Submitter } from "../../chain/submitter"
import type { Config } from "../../config"
import { ApiError } from "../../http/errors"
import { logError } from "../../log"
import { limit } from "../../quotas"
import { registerToken } from "../../session/onboard"
import type { SessionCtx } from "../../session/store"
import { newRelayId, random } from "../../util/crypto"
import { daoSlug } from "../../util/ids"
import { ensurePot, isMember } from "../notes"
import {
  CHAIN_LABEL,
  DEADLINE_MS,
  MIN_AMOUNT,
  OPEN_STATUSES,
  SIM_QR_TEXT,
  stepOf,
  TERMINAL,
  TYPICAL_SECONDS,
  XC_CHAINS,
  type XcChain,
} from "./assets"
import { quoteBody, type OneClickClient, type QuoteResponse } from "./client"
import { jitterFor, shortenedDeadline, simAmountOut, simProfile, simStatus, type SimScenario, type SimState } from "./sim"

export interface OneClickDeps {
  db: Db
  rpc: RpcClient
  hub: HubReader
  submitter: Submitter
  cfg: Config
  oneclick: OneClickClient
  defer: (fn: () => Promise<void>) => void
  now?: () => number
}

type Row = typeof depositIntent.$inferSelect
type Mode = "real" | "simulated"

/** Testnet always simulates. `real` needs mainnet AND ONECLICK_MODE=real (the Phase 2 clip build only). */
export function oneclickMode(cfg: Config, env: Record<string, string | undefined> = process.env): Mode {
  return cfg.network === "mainnet" && env.ONECLICK_MODE === "real" ? "real" : "simulated"
}

/** A mainnet account that exists, used as the recipient of the DRY quotes the simulator borrows numbers from. */
const DRY_RECIPIENT = "pot.near"
/** rev4 H-3: simulated mode refuses quotes above $500 */
export const SIM_MAX = 500_000_000n
const MAX_OPEN = 5

/** xc limits with QUOTA_<NAME> overrides (same convention as server/quotas.ts). */
export function xcLimit(name: "xc_quotes" | "xc_dry" | "xc_sim_usd"): bigint {
  const env = process.env[`QUOTA_${name.toUpperCase()}`]
  if (env && /^[0-9]+$/.test(env)) return BigInt(env)
  return { xc_quotes: 20n, xc_dry: 300n, xc_sim_usd: 500_000_000n }[name]
}

const subjectOf = (s: SessionCtx) => `user:${s.user.id}`

async function charge(db: Db, charges: QuotaCharge[]) {
  const r = await chargeQuotas(db, charges)
  if (!r.ok)
    throw new ApiError("quota_exceeded", { detail: { family: "xc", limit: r.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
}

// ---------------------------------------------------------------------------------------------
// GET /api/oneclick/chains

export async function listChains(deps: Pick<OneClickDeps, "cfg" | "oneclick">, env: Record<string, string | undefined> = process.env) {
  const mode = oneclickMode(deps.cfg, env)
  const paused = new Set(await deps.oneclick.pausedChains())
  // simulator: ONECLICK_SIM_PAUSED=base,… shows the "paused" picker state (kb scenario `paused`)
  if (mode === "simulated")
    for (const c of (env.ONECLICK_SIM_PAUSED ?? "").split(",").map((x) => x.trim()))
      if ((XC_CHAINS as readonly string[]).includes(c)) paused.add(c as XcChain)
  return {
    mode,
    chains: XC_CHAINS.map((id) => ({
      id,
      label: CHAIN_LABEL[id],
      status: paused.has(id) ? ("paused" as const) : id === "eth" ? ("slower" as const) : ("ok" as const),
      minAmount: MIN_AMOUNT[id].toString(),
      typicalSeconds: TYPICAL_SECONDS[id],
    })),
  }
}

// ---------------------------------------------------------------------------------------------
// POST /api/oneclick/quote

export interface QuoteBody {
  pot: string
  chain: XcChain
  amount: string
  dry?: boolean
  idempotencyKey: string
}

interface QuoteNumbers {
  amountIn: string
  minAmountIn: string
  amountOut: string
  minAmountOut: string
  timeEstimateSec: number
  refundFee: string
  withdrawFee: string
}

const numbersOf = (q: QuoteResponse["quote"]): QuoteNumbers => ({
  amountIn: q.amountIn,
  minAmountIn: q.minAmountIn,
  amountOut: q.amountOut,
  minAmountOut: q.minAmountOut,
  timeEstimateSec: q.timeEstimate ?? 0,
  refundFee: q.refundFee ?? "0",
  withdrawFee: q.withdrawFee ?? "0",
})

/** FLEX_INPUT numbers without 1Click (kb: amountOut = amount × (1 − 1 bp), minAmountIn = amount × 0.99). */
export function computedNumbers(chain: XcChain, amount: bigint, withdrawFee = 0n): QuoteNumbers {
  const out = simAmountOut(amount, withdrawFee)
  return {
    amountIn: amount.toString(),
    minAmountIn: ((amount * 99n) / 100n).toString(),
    amountOut: out.toString(),
    minAmountOut: ((out * 99n) / 100n).toString(),
    timeEstimateSec: TYPICAL_SECONDS[chain],
    refundFee: "0",
    withdrawFee: withdrawFee.toString(),
  }
}

async function isRegistered(deps: OneClickDeps, account: string): Promise<boolean> {
  return !!(await viewFunction<unknown>(deps.rpc, deps.cfg.usdcId, "storage_balance_of", { account_id: account }).catch(() => "unknown"))
}

/**
 * The dry quote names a placeholder recipient (unregistered on mainnet), so its `withdrawFee` is the storage
 * registration 1Click would charge. A registered member pays none: give it back to the out amount.
 */
function forMember(n: QuoteNumbers, registered: boolean): QuoteNumbers {
  if (!registered) return n
  const fee = BigInt(n.withdrawFee || "0")
  return { ...n, withdrawFee: "0", amountOut: (BigInt(n.amountOut) + fee).toString(), minAmountOut: (BigInt(n.minAmountOut) + fee).toString() }
}

async function validateQuote(deps: OneClickDeps, s: SessionCtx, body: QuoteBody, mode: Mode): Promise<bigint> {
  if (!daoSlug(body.pot, deps.cfg.hubId)) throw new ApiError("bad_request", { detail: { field: "pot" } })
  const amount = BigInt(body.amount)
  if (amount < MIN_AMOUNT[body.chain] || amount < 1_000_000n)
    throw new ApiError("amount_too_low", { detail: { minimum: (MIN_AMOUNT[body.chain] > 1_000_000n ? MIN_AMOUNT[body.chain] : 1_000_000n).toString() } })
  if (mode === "simulated" && amount > SIM_MAX) throw new ApiError("amount_too_high", { detail: { maximum: SIM_MAX.toString() } })
  const potRow = await ensurePot(deps.db, deps.hub, deps.cfg, body.pot)
  if (potRow.status !== "open") {
    const v = await deps.hub.getPot(body.pot, { fresh: true }).catch(() => null)
    if (!v || v.status !== "open") throw new ApiError("pot_closed")
  }
  if (!(await isMember(deps.hub, body.pot, s.user.nearAccount))) throw new ApiError("not_a_member")
  const { chains } = await listChains(deps)
  if (chains.find((c) => c.id === body.chain)?.status === "paused") throw new ApiError("chain_paused")
  return amount
}

export async function createQuote(deps: OneClickDeps, s: SessionCtx, body: QuoteBody): Promise<Record<string, unknown>> {
  const { db, cfg } = deps
  const mode = oneclickMode(cfg)
  const now = deps.now?.() ?? Date.now()

  // a non-dry retry with the same key returns the stored intent (before any check that could have changed)
  if (!body.dry) {
    const prior = (
      await db.select().from(depositIntent).where(and(eq(depositIntent.userId, s.user.id), eq(depositIntent.idempotencyKey, body.idempotencyKey))).limit(1)
    )[0]
    if (prior) {
      if (prior.potId !== body.pot || prior.chain !== body.chain || prior.amountIn !== body.amount) throw new ApiError("idempotency_conflict")
      return { ...quoteResponse(prior, cfg), replayed: true }
    }
  }

  const amount = await validateQuote(deps, s, body, mode)

  if (body.dry) {
    await charge(db, [{ subject: subjectOf(s), action: "xc_dry", amount: 1n, limit: xcLimit("xc_dry") }])
    const recipient = mode === "real" ? s.user.nearAccount : DRY_RECIPIENT
    if (mode === "real") {
      const q = await deps.oneclick.quote(quoteBody(body.chain, recipient, amount, true, now))
      return { mode, quote: numbersOf(q.quote), correlationId: q.correlationId }
    }
    // simulated: the live dry quote's numbers (fees, out amount) when 1Click answers, else the FLEX formula
    const q = await deps.oneclick.quote(quoteBody(body.chain, recipient, amount, true, now)).catch((e: unknown) => {
      if (e instanceof ApiError && (e.reason === "chain_paused" || e.reason === "amount_too_low")) throw e
      return null
    })
    const numbers = q ? forMember(numbersOf(q.quote), await isRegistered(deps, s.user.nearAccount)) : computedNumbers(body.chain, amount)
    return { mode, quote: numbers, ...(q?.correlationId ? { correlationId: q.correlationId } : {}) }
  }

  // non-dry: quotas (20 quotes/day, ≤ 5 open intents)
  const open = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(depositIntent)
    .where(and(eq(depositIntent.userId, s.user.id), inArray(depositIntent.status, [...OPEN_STATUSES])))
  if ((open[0]?.n ?? 0) >= MAX_OPEN)
    throw new ApiError("quota_exceeded", { detail: { family: "xc", limit: String(MAX_OPEN), why: "open_intents" } })
  await charge(db, [{ subject: subjectOf(s), action: "xc_quotes", amount: 1n, limit: xcLimit("xc_quotes") }])

  const id = `dp_${ulid().toLowerCase()}`
  let numbers: QuoteNumbers
  let depositAddress: string
  let depositMemo: string | null = null
  let correlationId: string | null = null
  let signature: string | null = null
  let quoteJson: Record<string, unknown>
  let deadline = new Date(now + DEADLINE_MS)
  if (mode === "real") {
    const q = await deps.oneclick.quote(quoteBody(body.chain, s.user.nearAccount, amount, false, now))
    if (!q.quote.depositAddress) throw new ApiError("quote_failed", { detail: { cause: "no_address", correlationId: q.correlationId ?? null } })
    numbers = numbersOf(q.quote)
    depositAddress = q.quote.depositAddress
    depositMemo = q.quote.depositMemo ?? null
    correlationId = q.correlationId ?? null
    signature = q.signature
    quoteJson = q as unknown as Record<string, unknown>
    deadline = new Date(String(q.quoteRequest.deadline ?? deadline.toISOString()))
  } else {
    const dry = await deps.oneclick.quote(quoteBody(body.chain, DRY_RECIPIENT, amount, true, now)).catch(() => null)
    numbers = dry ? forMember(numbersOf(dry.quote), await isRegistered(deps, s.user.nearAccount)) : computedNumbers(body.chain, amount)
    depositAddress = `SIMULATED-${body.chain}-${Buffer.from(random(4)).toString("hex")}`
    correlationId = dry?.correlationId ?? null
    quoteJson = { simulated: true, numbers, dryCorrelationId: correlationId, __sim: null }
  }
  const [row] = await db
    .insert(depositIntent)
    .values({
      id,
      userId: s.user.id,
      potId: body.pot,
      idempotencyKey: body.idempotencyKey,
      mode,
      chain: body.chain,
      recipient: s.user.nearAccount,
      amountIn: amount.toString(),
      minAmountIn: numbers.minAmountIn,
      amountOutQuoted: numbers.amountOut,
      depositAddress,
      depositMemo,
      correlationId,
      quoteSignature: signature,
      quote: quoteJson,
      deadline,
      status: "PENDING_DEPOSIT",
      lastPolledAt: new Date(now),
    })
    .onConflictDoNothing()
    .returning()
  if (!row) {
    // a concurrent duplicate under the same key
    const again = (
      await db.select().from(depositIntent).where(and(eq(depositIntent.userId, s.user.id), eq(depositIntent.idempotencyKey, body.idempotencyKey))).limit(1)
    )[0]
    if (!again) throw new ApiError("internal")
    return { ...quoteResponse(again, cfg), replayed: true }
  }
  return quoteResponse(row, cfg)
}

function quoteNumbersOf(row: Row): QuoteNumbers {
  const q = row.quote as { numbers?: QuoteNumbers; quote?: QuoteResponse["quote"] }
  if (q.numbers) return q.numbers
  if (q.quote) return numbersOf(q.quote)
  return computedNumbers(row.chain, BigInt(row.amountIn))
}

function quoteResponse(row: Row, _cfg: Config): Record<string, unknown> {
  void _cfg
  return {
    mode: row.mode,
    depositIntentId: row.id,
    quote: quoteNumbersOf(row),
    depositAddress: row.depositAddress,
    ...(row.depositMemo ? { depositMemo: row.depositMemo } : {}),
    deadline: row.deadline.toISOString(),
    qrText: row.mode === "simulated" ? SIM_QR_TEXT : row.depositAddress,
    ...(row.correlationId ? { correlationId: row.correlationId } : {}),
  }
}

// ---------------------------------------------------------------------------------------------
// POST /api/oneclick/simulate

export interface SimulateBody {
  depositIntentId: string
  scenario?: SimScenario
  amount?: string
  idempotencyKey: string
}

const simOf = (row: Row): (SimState & { keys?: string[] }) | null => ((row.quote as { __sim?: SimState & { keys?: string[] } }).__sim ?? null)

async function ownIntent(db: Db, s: SessionCtx, id: string): Promise<Row> {
  const row = (await db.select().from(depositIntent).where(and(eq(depositIntent.id, id), eq(depositIntent.userId, s.user.id))).limit(1))[0]
  if (!row) throw new ApiError("not_found")
  return row
}

export async function simulate(deps: OneClickDeps, s: SessionCtx, body: SimulateBody): Promise<Record<string, unknown>> {
  const { db, cfg } = deps
  if (cfg.network !== "testnet") throw new ApiError("not_found")
  const now = deps.now?.() ?? Date.now()
  const row = await ownIntent(db, s, body.depositIntentId)
  if (row.mode !== "simulated") throw new ApiError("demo_forbidden", { detail: { why: "not_simulated" } })
  const prev = simOf(row)
  const jitter = prev?.jitter ?? jitterFor(row.id)
  const profile = simProfile(row.chain, jitter)
  if (prev?.keys?.includes(body.idempotencyKey))
    return { startedAt: new Date(prev.sends[0]?.at ?? now).toISOString(), profile, replayed: true }

  const quoted = BigInt(row.amountIn)
  const sent = (prev?.sends ?? []).reduce((a, x) => a + BigInt(x.amount), 0n)
  const scenario: SimScenario = prev?.scenario ?? body.scenario ?? "ok"
  if (prev && prev.sends.length > 0) {
    // only a partial deposit can be topped up, and only while it is INCOMPLETE
    const cur = await refresh(deps, row, now)
    if (scenario !== "partial" || cur.status !== "INCOMPLETE_DEPOSIT")
      throw new ApiError("bad_request", { detail: { field: "depositIntentId", why: "already_sent" } })
  } else if (row.status !== "PENDING_DEPOSIT" || now >= row.deadline.getTime()) {
    throw new ApiError("bad_request", { detail: { field: "depositIntentId", why: "not_pending" } })
  }

  const required = BigInt(row.minAmountIn ?? row.amountIn)
  const amount =
    body.amount !== undefined
      ? BigInt(body.amount)
      : scenario === "expired"
        ? 0n
        : sent > 0n
          ? required - sent > 0n
            ? required - sent
            : 0n
          : scenario === "partial"
            ? (quoted * 8n) / 10n
            : quoted
  const cap = quoted < SIM_MAX ? quoted : SIM_MAX
  if (amount < 0n || sent + amount > cap) throw new ApiError("amount_too_high", { detail: { maximum: (cap - sent).toString() } })
  if (scenario !== "expired" && amount === 0n) throw new ApiError("bad_request", { detail: { field: "amount" } })

  // rev4 H-3: ≤ $500 per person per UTC day, inside the global faucet cap
  if (amount > 0n)
    await charge(db, [
      { subject: subjectOf(s), action: "xc_sim_usd", amount, limit: xcLimit("xc_sim_usd") },
      { subject: "global", action: "faucet_usd", amount, limit: limit("global_faucet_usd") },
    ])

  const next: SimState & { keys: string[] } = {
    scenario,
    jitter,
    sends: scenario === "expired" ? [] : [...(prev?.sends ?? []), { at: now, amount: amount.toString() }],
    keys: [...(prev?.keys ?? []), body.idempotencyKey],
    ...(prev?.deadlineMs ? { deadlineMs: prev.deadlineMs } : {}),
  }
  if (!prev && (scenario === "partial" || scenario === "expired")) next.deadlineMs = shortenedDeadline(row.chain, jitter, now)
  await db
    .update(depositIntent)
    .set({
      quote: { ...(row.quote as object), __sim: next },
      simScenario: scenario,
      simStartedAt: row.simStartedAt ?? new Date(now),
      ...(next.deadlineMs ? { deadline: new Date(next.deadlineMs) } : {}),
      updatedAt: new Date(now),
    })
    .where(eq(depositIntent.id, row.id))
  return { startedAt: new Date(next.sends[0]?.at ?? now).toISOString(), profile }
}

// ---------------------------------------------------------------------------------------------
// GET /api/oneclick/status/[id]

interface Snapshot {
  status: Row["status"]
  depositedAmount?: string | null
  amountOut?: string | null
  refundedAmount?: string | null
  refundReason?: string | null
  processingSince?: Date | null
  destinationTxHash?: string | null
  updatedAt: Date
}

/** Recompute a non-terminal intent (simulator profile or 1Click status), store it and return the row. */
async function refresh(deps: OneClickDeps, row: Row, now: number): Promise<Row> {
  if (TERMINAL.has(row.status)) return row
  let snap: Snapshot
  if (row.mode === "simulated") {
    const sim = simOf(row)
    const q = quoteNumbersOf(row)
    const v = simStatus(
      sim,
      {
        chain: row.chain,
        required: BigInt(row.minAmountIn ?? row.amountIn),
        quoted: BigInt(row.amountIn),
        deadlineMs: row.deadline.getTime(),
        withdrawFee: BigInt(q.withdrawFee ?? "0"),
        createdAt: row.createdAt.getTime(),
      },
      now,
    )
    snap = {
      status: v.status,
      depositedAmount: v.depositedAmount?.toString() ?? null,
      amountOut: v.amountOut?.toString() ?? null,
      refundedAmount: v.refundedAmount?.toString() ?? null,
      refundReason: v.refundReason ?? null,
      processingSince: v.processingSince ? new Date(v.processingSince) : null,
      updatedAt: new Date(v.updatedAt),
    }
    // SUCCESS means "in the member's account": until the treasury delivery lands, it's still converting
    if (v.status === "SUCCESS" && !row.destinationTxHash) {
      deps.defer(() => deliver(deps, row.id))
      snap = { ...snap, status: "PROCESSING", amountOut: null }
    }
  } else {
    const fresh = row.lastPolledAt && now - row.lastPolledAt.getTime() < 5_000
    if (fresh) return row
    const st = await deps.oneclick.status(row.depositAddress).catch(() => null)
    if (!st) {
      if (row.status === "PENDING_DEPOSIT" && now > row.deadline.getTime() + 10 * 60_000) snap = { status: "EXPIRED", updatedAt: new Date(now) }
      else return row
    } else {
      const d = st.swapDetails ?? {}
      const status = (["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED"].includes(st.status)
        ? st.status
        : row.status) as Row["status"]
      snap = {
        status,
        depositedAmount: d.depositedAmount ?? null,
        amountOut: d.amountOut ?? null,
        refundedAmount: d.refundedAmount ?? null,
        refundReason: d.refundReason ?? null,
        destinationTxHash: d.destinationChainTxHashes?.[0]?.hash ?? null,
        processingSince: status === "PROCESSING" ? (row.processingSince ?? new Date(now)) : row.processingSince,
        updatedAt: st.updatedAt ? new Date(st.updatedAt) : new Date(now),
      }
    }
  }
  const [updated] = await deps.db
    .update(depositIntent)
    .set({
      status: snap.status,
      depositedAmount: snap.depositedAmount ?? row.depositedAmount,
      amountOut: snap.amountOut ?? row.amountOut,
      refundedAmount: snap.refundedAmount ?? row.refundedAmount,
      refundReason: snap.refundReason ?? row.refundReason,
      processingSince: snap.processingSince ?? row.processingSince,
      destinationTxHash: snap.destinationTxHash ?? row.destinationTxHash,
      lastPolledAt: new Date(now),
      lastStatus: { status: snap.status, at: snap.updatedAt.toISOString() },
      updatedAt: new Date(now),
    })
    .where(and(eq(depositIntent.id, row.id), sql`${depositIntent.status} NOT IN ('SUCCESS','ADDED','REFUNDED','FAILED','EXPIRED','STUCK')`))
    .returning()
  return updated ?? (await deps.db.select().from(depositIntent).where(eq(depositIntent.id, row.id)).limit(1))[0]!
}

const TGAS = 1_000_000_000_000n

/**
 * Simulator SUCCESS: real "USDC (test)" from the treasury to the member, through the token (`ft_transfer`, 1 yocto),
 * registering the member first if needed (1Click registers storage itself). One delivery per deposit: the
 * relay_log server key `sim:{id}` is the lock.
 */
export async function deliver(deps: OneClickDeps, id: string): Promise<void> {
  const { db, cfg } = deps
  const row = (await db.select().from(depositIntent).where(eq(depositIntent.id, id)).limit(1))[0]
  if (!row || row.destinationTxHash || row.mode !== "simulated") return
  const now = deps.now?.() ?? Date.now()
  const sim = simOf(row)
  const q = quoteNumbersOf(row)
  const v = simStatus(
    sim,
    {
      chain: row.chain,
      required: BigInt(row.minAmountIn ?? row.amountIn),
      quoted: BigInt(row.amountIn),
      deadlineMs: row.deadline.getTime(),
      withdrawFee: BigInt(q.withdrawFee ?? "0"),
      createdAt: row.createdAt.getTime(),
    },
    now,
  )
  if (v.status !== "SUCCESS" || !v.amountOut) return

  const rowId = newRelayId()
  const key = `sim:${id}`
  const claimed = await db
    .insert(relayLog)
    .values({
      id: rowId,
      requestId: rowId,
      idempotencyKey: key,
      op: "sim_delivery",
      senderId: cfg.treasuryAccountId,
      receiverId: cfg.usdcId,
      methods: ["ft_transfer"],
      potId: row.potId,
      status: "validated",
    })
    .onConflictDoNothing()
    .returning({ id: relayLog.id })
  if (claimed.length === 0) return // another poll is delivering it

  try {
    const bal = await viewFunction<unknown>(deps.rpc, cfg.usdcId, "storage_balance_of", { account_id: row.recipient }).catch(() => "unknown")
    if (bal === null) await registerToken(deps, row.recipient)
    const res = await deps.submitter.submit(
      {
        signerId: cfg.treasuryAccountId,
        receiverId: cfg.usdcId,
        actions: [
          actions.functionCall(
            "ft_transfer",
            { receiver_id: row.recipient, amount: v.amountOut.toString(), memo: "Simulated deposit (testnet)" },
            30n * TGAS,
            1n,
          ),
        ],
      },
      {
        pool: cfg.treasuryPool,
        holder: rowId,
        budgetMs: 20_000,
        busyCause: "treasury",
        onSigned: async ({ txHash, publicKey }) => {
          await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, rowId))
        },
      },
    )
    let failure: string | null = null
    if (res.kind === "outcome") {
      const top = res.outcome.status as Record<string, unknown>
      const f = firstFailure(res.outcome)
      failure = "Failure" in top ? failureText(top.Failure) : f ? failureText(statusFailure(f.outcome.status)) : null
    }
    if (failure) throw new Error(failure)
    await db
      .update(relayLog)
      .set({ status: res.kind === "pending" ? "pending" : "executed", outcome: res.kind === "pending" ? null : "success", finishedAt: new Date() })
      .where(eq(relayLog.id, rowId))
    await db
      .update(depositIntent)
      .set({
        status: "SUCCESS",
        depositedAmount: v.depositedAmount?.toString() ?? row.depositedAmount,
        amountOut: v.amountOut.toString(),
        destinationTxHash: res.txHash,
        processingSince: v.processingSince ? new Date(v.processingSince) : row.processingSince,
        lastStatus: { status: "SUCCESS", at: new Date(v.updatedAt).toISOString() },
        updatedAt: new Date(),
      })
      .where(and(eq(depositIntent.id, id), sql`${depositIntent.destinationTxHash} IS NULL`))
  } catch (e) {
    // nothing (or a failed transfer) reached the member: free the lock so the next poll retries
    await db.delete(relayLog).where(eq(relayLog.id, rowId)).catch(() => undefined)
    await logError({ route: "oneclick.deliver", reason: "sim_delivery", detail: { id, err: String(e).slice(0, 300) } })
  }
}

/** ADDED: the member's own relayed contribution for this Pot, after the deposit arrived (api-spec RelayContext). */
async function markAdded(deps: OneClickDeps, s: SessionCtx, row: Row, relayId: string): Promise<Row> {
  if (row.status !== "SUCCESS") return row
  const r = (await deps.db.select().from(relayLog).where(and(eq(relayLog.id, relayId), eq(relayLog.userId, s.user.id))).limit(1))[0]
  const result = r?.result as { type?: string; recorded?: boolean } | null | undefined
  const ok =
    !!r &&
    r.op === "relay" &&
    r.intent === "add_money" &&
    r.status === "executed" &&
    r.outcome === "success" &&
    r.potId === row.potId &&
    result?.type === "contribution" &&
    result.recorded === true &&
    r.createdAt.getTime() >= row.createdAt.getTime()
  if (!ok) throw new ApiError("bad_request", { detail: { field: "relayId" } })
  const [u] = await deps.db
    .update(depositIntent)
    .set({ status: "ADDED", addedRelayId: relayId, addedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(depositIntent.id, row.id), eq(depositIntent.status, "SUCCESS")))
    .returning()
  return u ?? row
}

export function statusBody(row: Row, cfg: Config): Record<string, unknown> {
  const reached: 1 | 3 = row.processingSince ? 3 : 1
  const explorer =
    row.mode === "real"
      ? `https://explorer.near-intents.org/transactions/${encodeURIComponent(row.depositAddress)}`
      : row.destinationTxHash
        ? `${cfg.explorerUrl}/txns/${row.destinationTxHash}`
        : undefined
  return {
    mode: row.mode,
    id: row.id,
    pot: row.potId,
    chain: row.chain,
    status: row.status,
    step: stepOf(row.status, reached),
    amountIn: row.amountIn,
    minAmountIn: row.minAmountIn ?? row.amountIn,
    amountOutQuoted: row.amountOutQuoted ?? undefined,
    ...(row.depositedAmount ? { depositedAmount: row.depositedAmount } : {}),
    ...(row.amountOut ? { amountOut: row.amountOut } : {}),
    ...(row.refundedAmount ? { refundedAmount: row.refundedAmount } : {}),
    refundReason: row.refundReason ?? null,
    ...(row.destinationTxHash ? { destinationTxHash: row.destinationTxHash } : {}),
    ...(explorer ? { explorerUrl: explorer } : {}),
    depositAddress: row.depositAddress,
    qrText: row.mode === "simulated" ? SIM_QR_TEXT : row.depositAddress,
    ...(row.correlationId ? { correlationId: row.correlationId } : {}),
    ...(row.simScenario ? { scenario: row.simScenario, simulated: { sent: (simOf(row)?.sends.length ?? 0) > 0 } } : {}),
    deadline: row.deadline.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.processingSince ? { processingSince: row.processingSince.toISOString() } : {}),
    ...(row.addedRelayId ? { addedRelayId: row.addedRelayId } : {}),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function depositStatus(deps: OneClickDeps, s: SessionCtx, id: string, opts: { relayId?: string } = {}) {
  const now = deps.now?.() ?? Date.now()
  let row = await ownIntent(deps.db, s, id)
  row = await refresh(deps, row, now)
  if (opts.relayId) row = await markAdded(deps, s, row, opts.relayId)
  return statusBody(row, deps.cfg)
}

/** GET /api/oneclick/status?pot=: this person's deposits for a Pot that still need the UI (open, or arrived and not added). */
export async function listDeposits(deps: OneClickDeps, s: SessionCtx, pot: string) {
  if (!daoSlug(pot, deps.cfg.hubId)) throw new ApiError("bad_request", { detail: { field: "pot" } })
  const now = deps.now?.() ?? Date.now()
  const rows = await deps.db
    .select()
    .from(depositIntent)
    .where(
      and(
        eq(depositIntent.userId, s.user.id),
        eq(depositIntent.potId, pot),
        sql`(${depositIntent.status} IN ('PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING','INCOMPLETE_DEPOSIT','SUCCESS') OR ${depositIntent.updatedAt} > now() - interval '1 hour')`,
      ),
    )
    .orderBy(desc(depositIntent.createdAt))
    .limit(5)
  const out: Record<string, unknown>[] = []
  for (const r of rows) {
    const fresh = await refresh(deps, r, now).catch(() => r)
    // an untouched address nobody sent to stays out of the Pot screen
    if (fresh.status === "PENDING_DEPOSIT" && !simOf(fresh)?.sends.length && fresh.mode === "simulated") continue
    out.push(statusBody(fresh, deps.cfg))
  }
  return { deposits: out }
}

/** Refund the sim quota charge when nothing was delivered (exported for tests and future cleanup). */
export async function refundSimCharge(db: Db, s: SessionCtx, amount: bigint) {
  await adjustQuota(db, [subjectOf(s)], "xc_sim_usd", -amount).catch(() => undefined)
}
