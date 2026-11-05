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
import { appUser, depositIntent, relayLog } from "@/db/schema"
import { sendAlert } from "../../alerts"
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
import { DEADLINE_MS, OPEN_STATUSES, SIM_QR_TEXT, stepOf, TERMINAL } from "./assets"
import { listedPrice, missingFromCatalogue, noteUnavailable, unavailableNow } from "./availability"
import { probeBody, quoteBody, type OneClickClient, type QuoteResponse, type TokenInfo } from "./client"
import {
  assetOf,
  COIN_NAME,
  defaultCoin,
  offlineCoinNumbers,
  offlineUsdOut,
  roundUpSig,
  slippageFor,
  stableUnits,
  XC_CHAINS,
  XC_CONFIG,
  type XcAsset,
  type XcChain,
  type XcCoin,
} from "./origins"
import { jitterFor, planSimSend, shortenedDeadline, simAmountOut, simProfile, simSent, simStatus, type SimScenario, type SimState } from "./sim"
import { errText } from "../../util/errtext"

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

export type DepositIntentRow = typeof depositIntent.$inferSelect
type Row = DepositIntentRow
type Mode = "real" | "simulated"

/** Testnet always simulates. `real` needs mainnet AND ONECLICK_MODE=real (the Phase 2 clip build only). */
export function oneclickMode(cfg: Config, env: Record<string, string | undefined> = process.env): Mode {
  return cfg.network === "mainnet" && env.ONECLICK_MODE === "real" ? "real" : "simulated"
}

/**
 * The recipient of the DRY quotes the simulator borrows its numbers from: a fixed implicit (64-hex) mainnet account,
 * sha256("pot: dry-quote recipient (no key, never funded)"). 1Click accepts implicit ids before they exist (named ones
 * must exist, else 400 "Internal server error"); it is never the recipient of a quote with an address. Being
 * unregistered, its quotes carry the storage `withdrawFee` (≈ 0.0051 USDC on 2026-11-04), given back to a registered
 * member by forMember().
 */
export const DRY_RECIPIENT = "e2beb9d895d15a4e6379a4fd02916fcdc3d63d6aa741277fce64cee3937f443b"
/** rev4 H-3: simulated mode refuses quotes above $500 */
export const SIM_MAX = 500_000_000n
const MAX_OPEN = 5
const USD_FLOOR = 1_000_000n

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

const maxOf = (...xs: bigint[]): bigint => xs.reduce((a, b) => (b > a ? b : a))

// ---------------------------------------------------------------------------------------------
// GET /api/oneclick/chains

export interface CoinRow {
  coin: XcCoin
  name: string
  stable: boolean
  decimals: number
  status: "ok" | "unavailable"
  /** the smallest amount offered with this coin right now, USD micro */
  minAmount: string
}

export interface ChainRow {
  id: XcChain
  label: string
  /** "slower" = not under a minute (kept for older clients); `speed` says how slow */
  status: "ok" | "paused" | "slower"
  speed: "fast" | "slower" | "slow"
  typicalSeconds: number
  /** the smallest amount offered on this network right now (its cheapest open coin), USD micro */
  minAmount: string
  coins: CoinRow[]
}

export async function listChains(
  deps: Pick<OneClickDeps, "cfg" | "oneclick" | "now">,
  env: Record<string, string | undefined> = process.env,
): Promise<{ mode: Mode; chains: ChainRow[] }> {
  const mode = oneclickMode(deps.cfg, env)
  const now = deps.now?.() ?? Date.now()
  const [shield, tokens] = await Promise.all([deps.oneclick.pausedChains(), deps.oneclick.tokens ? deps.oneclick.tokens().catch(() => null) : Promise.resolve(null)])
  const paused = new Set<XcChain>(shield)
  // simulator: ONECLICK_SIM_PAUSED=base,… shows the "paused" picker state (kb scenario `paused`)
  if (mode === "simulated")
    for (const c of (env.ONECLICK_SIM_PAUSED ?? "").split(",").map((x) => x.trim()))
      if ((XC_CHAINS as readonly string[]).includes(c)) paused.add(c as XcChain)
  const missing = missingFromCatalogue(tokens)
  return {
    mode,
    chains: XC_CHAINS.map((id) => {
      const c = XC_CONFIG[id]
      const coins: CoinRow[] = c.assets.map((a) => {
        const u = unavailableNow(id, a.coin, now)
        const off = missing.has(`${id}:${a.coin}`) || u?.kind === "paused"
        return {
          coin: a.coin,
          name: COIN_NAME[a.coin],
          stable: a.stable,
          decimals: a.decimals,
          status: off ? ("unavailable" as const) : ("ok" as const),
          minAmount: maxOf(USD_FLOOR, c.minUsd, u?.kind === "min" ? u.minUsd : 0n).toString(),
        }
      })
      const open = coins.filter((x) => x.status === "ok")
      const minAmount = open.length ? open.map((x) => BigInt(x.minAmount)).reduce((a, b) => (b < a ? b : a)) : maxOf(USD_FLOOR, c.minUsd)
      return {
        id,
        label: c.label,
        status: paused.has(id) || open.length === 0 ? ("paused" as const) : c.speed === "fast" ? ("ok" as const) : ("slower" as const),
        speed: c.speed,
        typicalSeconds: c.typicalSeconds,
        minAmount: minAmount.toString(),
        coins,
      }
    }),
  }
}

// ---------------------------------------------------------------------------------------------
// POST /api/oneclick/quote, POST /api/oneclick/price

export interface QuoteBody {
  pot: string
  chain: XcChain
  /** default: USDC where the network has it (the original behaviour), else its first coin */
  coin?: XcCoin
  /** what the person wants to add, USD micro */
  amount: string
  dry?: boolean
  idempotencyKey: string
}

export interface PriceBody {
  chain: XcChain
  coin?: XcCoin
  amount: string
}

/** Origin amounts (`amountIn`, `minAmountIn`, `refundFee`) are in the coin's base units; out amounts are USD micro. */
export interface QuoteNumbers {
  amountIn: string
  minAmountIn: string
  amountOut: string
  minAmountOut: string
  timeEstimateSec: number
  refundFee: string
  withdrawFee: string
}

/** What a deposit row remembers about the coin (quote jsonb `origin`); old rows are USDC. */
export interface OriginInfo {
  coin: XcCoin
  decimals: number
  stable: boolean
  assetId: string
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
    timeEstimateSec: XC_CONFIG[chain].typicalSeconds,
    refundFee: "0",
    withdrawFee: withdrawFee.toString(),
  }
}

/** A coin's numbers without 1Click: the listed (or reference) price, 25 bps, FLEX at 300 bps. */
export function computedCoinNumbers(chain: XcChain, asset: XcAsset, usd: bigint, price = asset.refUsd): QuoteNumbers {
  return offlineCoinNumbers(chain, asset, usd, price)
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

/** A quote error's minimum in USD micro (whole dollars, rounded up; a coin's minimum gets 10 % headroom for price moves). */
function minUsdOf(e: ApiError, asset: XcAsset, price: number): bigint | null {
  const d = (e.detail ?? {}) as { minimum?: string; minUsd?: string }
  let usd: bigint | null = null
  // a dollar swap limit is checked on the value sent (100 USDT = $99.88 was refused for "$100"): 1 % headroom
  if (d.minUsd) usd = (BigInt(d.minUsd) * 101n) / 100n
  else if (d.minimum) {
    const units = BigInt(d.minimum)
    usd = asset.stable ? (units * 1_000_000n) / 10n ** BigInt(asset.decimals) : (offlineUsdOut(units, asset, price) * 110n) / 100n
  }
  if (usd === null) return null
  return ((usd + 999_999n) / 1_000_000n) * 1_000_000n
}

/** Remember a refusal for 10 min (availability.ts) and answer it in USD (`minimum` = USD micro for the UI). */
function noteQuoteError(chain: XcChain, asset: XcAsset, e: unknown, now: number, price: number): unknown {
  if (!(e instanceof ApiError)) return e
  // a quote whose signature doesn't verify is never used for real money: that coin waits 10 min like a paused one
  if (e.reason === "quote_failed" && (e.detail as { cause?: string } | undefined)?.cause === "signature") {
    noteUnavailable(chain, asset.coin, { kind: "paused" }, now)
    return e
  }
  if (e.reason === "chain_paused") {
    noteUnavailable(chain, asset.coin, { kind: "paused", ...((e.detail as { why?: string })?.why === "unsupported" ? { why: "unsupported" as const } : {}) }, now)
    return e
  }
  if (e.reason === "amount_too_low") {
    const minUsd = minUsdOf(e, asset, price)
    if (minUsd === null) return e
    noteUnavailable(chain, asset.coin, { kind: "min", minUsd }, now)
    return new ApiError("amount_too_low", { detail: { minimum: minUsd.toString() } })
  }
  return e
}

interface Priced {
  numbers: QuoteNumbers
  correlationId?: string
  /** the FLEX quote itself (real mode keeps it whole: signature, deposit address) */
  quote?: QuoteResponse
}

/**
 * The numbers for adding `usd` with `coin` on `chain` (kb "Any coin"):
 *  - stablecoins: one FLEX_INPUT quote (100 bps) for the same dollar amount;
 *  - other coins: a dry EXACT_OUTPUT probe for `usd` → its minAmountIn rounded up to 4 significant digits → the FLEX_INPUT
 *    quote (300 bps) for that coin amount, whose amountOut ≈ `usd` (a rounding surplus becomes Pot dollars).
 * `dry: false` only in real mode (the FLEX quote then carries the deposit address).
 */
async function priceWith(
  deps: OneClickDeps,
  o: { chain: XcChain; asset: XcAsset; usd: bigint; recipient: string; dry: boolean; now: number; price: number; simulated?: boolean },
): Promise<Priced> {
  const { chain, asset, usd, recipient, dry, now } = o
  // only the simulator's previews may use a dry quote whose signature doesn't verify (client.ts QuoteOptions)
  const qo = o.simulated && dry ? { unverifiedDryOk: true } : {}
  try {
    if (asset.stable) {
      const q = await deps.oneclick.quote(quoteBody(chain, recipient, stableUnits(usd, asset.decimals), dry, now, asset.coin), qo)
      return { numbers: numbersOf(q.quote), ...(q.correlationId ? { correlationId: q.correlationId } : {}), quote: q }
    }
    const probe = await deps.oneclick.quote(probeBody(chain, asset.coin, recipient, usd, now), qo)
    const amount = roundUpSig(BigInt(probe.quote.minAmountIn))
    const q = await deps.oneclick.quote(quoteBody(chain, recipient, amount, dry, now, asset.coin), qo)
    return { numbers: numbersOf(q.quote), ...(q.correlationId ? { correlationId: q.correlationId } : {}), quote: q }
  } catch (e) {
    throw noteQuoteError(chain, asset, e, now, o.price)
  }
}

/** Simulated numbers: the live dry quote's when 1Click answers, else the offline formula (paused / too low still refuse). */
async function simulatedNumbers(deps: OneClickDeps, s: SessionCtx, o: { chain: XcChain; asset: XcAsset; usd: bigint; now: number; price: number }): Promise<Priced> {
  const priced = await priceWith(deps, { ...o, recipient: DRY_RECIPIENT, dry: true, simulated: true }).catch((e: unknown) => {
    if (e instanceof ApiError && (e.reason === "chain_paused" || e.reason === "amount_too_low")) throw e
    return null
  })
  if (!priced) return { numbers: o.asset.stable ? computedNumbers(o.chain, stableUnits(o.usd, o.asset.decimals)) : computedCoinNumbers(o.chain, o.asset, o.usd, o.price) }
  return { ...priced, numbers: forMember(priced.numbers, await isRegistered(deps, s.user.nearAccount)) }
}

interface Checked {
  usd: bigint
  asset: XcAsset
  price: number
}

/** The origin checks every quote shares: a curated coin, the minimum, the $500 demo cap, Shield and availability. */
async function checkOrigin(deps: OneClickDeps, body: { chain: XcChain; coin?: XcCoin; amount: string }, mode: Mode): Promise<Checked> {
  const coin = body.coin ?? defaultCoin(body.chain)
  const asset = assetOf(body.chain, coin)
  if (!asset) throw new ApiError("bad_request", { detail: { field: "coin" } })
  const usd = BigInt(body.amount)
  const { chains } = await listChains(deps)
  const row = chains.find((c) => c.id === body.chain)!
  const coinRow = row.coins.find((c) => c.coin === coin)!
  const minimum = BigInt(coinRow.minAmount)
  if (usd < minimum) throw new ApiError("amount_too_low", { detail: { minimum: minimum.toString() } })
  if (mode === "simulated" && usd > SIM_MAX) throw new ApiError("amount_too_high", { detail: { maximum: SIM_MAX.toString() } })
  if (row.status === "paused" || coinRow.status !== "ok") throw new ApiError("chain_paused")
  const tokens = deps.oneclick.tokens ? await deps.oneclick.tokens().catch(() => null) : null
  return { usd, asset, price: listedPrice(tokens as TokenInfo[] | null, asset.assetId) ?? asset.refUsd }
}

async function validateQuote(deps: OneClickDeps, s: SessionCtx, body: QuoteBody, mode: Mode): Promise<Checked> {
  if (!daoSlug(body.pot, deps.cfg.hubId)) throw new ApiError("bad_request", { detail: { field: "pot" } })
  const checked = await checkOrigin(deps, body, mode)
  const potRow = await ensurePot(deps.db, deps.hub, deps.cfg, body.pot)
  if (potRow.status !== "open") {
    const v = await deps.hub.getPot(body.pot, { fresh: true }).catch(() => null)
    if (!v || v.status !== "open") throw new ApiError("pot_closed")
  }
  if (!(await isMember(deps.hub, body.pot, s.user.nearAccount))) throw new ApiError("not_a_member")
  return checked
}

const originOfAsset = (a: XcAsset): OriginInfo => ({ coin: a.coin, decimals: a.decimals, stable: a.stable, assetId: a.assetId })

/** The coin part of a quote answer. */
const coinFields = (a: XcAsset, usd: bigint) => ({ coin: a.coin, decimals: a.decimals, stable: a.stable, usdTarget: usd.toString(), slippageBps: slippageFor(a) })

/**
 * A dry quote for the coin step (the live "Send about 0.008638 ETH → about $20.00 arrives"), for members and for
 * people paying in from outside alike: no Pot, no row, charged to the person's daily dry-quote quota.
 */
export async function priceQuote(deps: OneClickDeps, s: SessionCtx, body: PriceBody): Promise<Record<string, unknown>> {
  const mode = oneclickMode(deps.cfg)
  const now = deps.now?.() ?? Date.now()
  const c = await checkOrigin(deps, body, mode)
  await charge(deps.db, [{ subject: subjectOf(s), action: "xc_dry", amount: 1n, limit: xcLimit("xc_dry") }])
  const priced =
    mode === "real"
      ? await priceWith(deps, { chain: body.chain, asset: c.asset, usd: c.usd, recipient: s.user.nearAccount, dry: true, now, price: c.price })
      : await simulatedNumbers(deps, s, { chain: body.chain, asset: c.asset, usd: c.usd, now, price: c.price })
  return {
    mode,
    chain: body.chain,
    ...coinFields(c.asset, c.usd),
    quote: priced.numbers,
    quotedAt: new Date(now).toISOString(),
    ...(priced.correlationId ? { correlationId: priced.correlationId } : {}),
  }
}

export async function createQuote(deps: OneClickDeps, s: SessionCtx, body: QuoteBody): Promise<Record<string, unknown>> {
  const { db, cfg } = deps
  const mode = oneclickMode(cfg)
  const now = deps.now?.() ?? Date.now()
  const coin = body.coin ?? defaultCoin(body.chain)

  // a non-dry retry with the same key returns the stored intent (before any check that could have changed)
  if (!body.dry) {
    const prior = (
      await db.select().from(depositIntent).where(and(eq(depositIntent.userId, s.user.id), eq(depositIntent.idempotencyKey, body.idempotencyKey))).limit(1)
    )[0]
    if (prior) {
      if (prior.potId !== body.pot || prior.chain !== body.chain || originOf(prior).coin !== coin || usdTargetOf(prior) !== body.amount)
        throw new ApiError("idempotency_conflict")
      return { ...quoteResponse(prior, cfg), replayed: true }
    }
  }

  const c = await validateQuote(deps, s, body, mode)

  if (body.dry) {
    await charge(db, [{ subject: subjectOf(s), action: "xc_dry", amount: 1n, limit: xcLimit("xc_dry") }])
    const priced =
      mode === "real"
        ? await priceWith(deps, { chain: body.chain, asset: c.asset, usd: c.usd, recipient: s.user.nearAccount, dry: true, now, price: c.price })
        : await simulatedNumbers(deps, s, { chain: body.chain, asset: c.asset, usd: c.usd, now, price: c.price })
    return { mode, ...coinFields(c.asset, c.usd), quote: priced.numbers, ...(priced.correlationId ? { correlationId: priced.correlationId } : {}) }
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
  const origin = originOfAsset(c.asset)
  let numbers: QuoteNumbers
  let depositAddress: string
  let depositMemo: string | null = null
  let correlationId: string | null = null
  let signature: string | null = null
  let quoteJson: Record<string, unknown>
  let deadline = new Date(now + DEADLINE_MS)
  if (mode === "real") {
    // the member's own NEAR account receives (named accounts must exist: they do, the member is signed in)
    const priced = await priceWith(deps, { chain: body.chain, asset: c.asset, usd: c.usd, recipient: s.user.nearAccount, dry: false, now, price: c.price })
    const q = priced.quote!
    if (!q.quote.depositAddress) throw new ApiError("quote_failed", { detail: { cause: "no_address", correlationId: q.correlationId ?? null } })
    numbers = priced.numbers
    depositAddress = q.quote.depositAddress
    depositMemo = q.quote.depositMemo ?? null
    correlationId = q.correlationId ?? null
    signature = q.signature
    quoteJson = { ...(q as unknown as Record<string, unknown>), origin, usdTarget: c.usd.toString() }
    deadline = new Date(String(q.quoteRequest.deadline ?? deadline.toISOString()))
  } else {
    const priced = await simulatedNumbers(deps, s, { chain: body.chain, asset: c.asset, usd: c.usd, now, price: c.price })
    numbers = priced.numbers
    depositAddress = `SIMULATED-${body.chain}-${Buffer.from(random(4)).toString("hex")}`
    correlationId = priced.correlationId ?? null
    quoteJson = { simulated: true, numbers, dryCorrelationId: correlationId, origin, usdTarget: c.usd.toString(), __sim: null }
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
      amountIn: numbers.amountIn,
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

/** The coin of a deposit (rows from before any-coin are USDC). */
export function originOf(row: Pick<Row, "quote" | "chain">): OriginInfo {
  const o = (row.quote as { origin?: OriginInfo } | null)?.origin
  if (o && o.coin) return o
  const a = assetOf(row.chain, "USDC")
  return { coin: "USDC", decimals: 6, stable: true, assetId: a?.assetId ?? "" }
}

/** The dollars the person asked to add (rows from before any-coin: the USDC amount). */
export function usdTargetOf(row: Pick<Row, "quote" | "amountIn">): string {
  return (row.quote as { usdTarget?: string } | null)?.usdTarget ?? row.amountIn
}

/** USD micro for `units` of this deposit's coin, at the quote's own rate (rounded up: caps and quotas). */
function usdOfUnits(row: Row, units: bigint): bigint {
  const quoted = BigInt(row.amountIn)
  const usd = BigInt(usdTargetOf(row))
  if (quoted <= 0n || usd === quoted) return units
  return (units * usd + quoted - 1n) / quoted
}

function quoteResponse(row: Row, _cfg: Config): Record<string, unknown> {
  void _cfg
  const o = originOf(row)
  return {
    mode: row.mode,
    depositIntentId: row.id,
    coin: o.coin,
    decimals: o.decimals,
    stable: o.stable,
    usdTarget: usdTargetOf(row),
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

export const simOf = (row: Pick<Row, "quote">): (SimState & { keys?: string[] }) | null => ((row.quote as { __sim?: SimState & { keys?: string[] } }).__sim ?? null)

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
  const scenario: SimScenario = prev?.scenario ?? body.scenario ?? "ok"
  let status: string = row.status
  if (prev && prev.sends.length > 0) status = (await refresh(deps, row, now)).status
  else if (row.status !== "PENDING_DEPOSIT" || now >= row.deadline.getTime())
    throw new ApiError("bad_request", { detail: { field: "depositIntentId", why: "not_pending" } })

  // a partial deposit can be topped up while INCOMPLETE, with what is still missing; a second tap while the
  // first top-up is still on its way answers like the first one (2026-11-02: it was `amount_too_high`).
  // Amounts are the coin's base units; never more than the quote (which is ≤ $500, checked at quote time).
  const cap = quoted
  const plan = planSimSend(
    prev,
    {
      status,
      scenario,
      required: BigInt(row.minAmountIn ?? row.amountIn),
      quoted,
      cap,
      deadlineMs: row.deadline.getTime(),
      ...(body.amount !== undefined ? { amount: BigInt(body.amount) } : {}),
    },
    now,
  )
  if (plan.kind === "already_sent")
    return { startedAt: new Date(prev?.sends[0]?.at ?? now).toISOString(), profile, replayed: true, topUp: "already_sent" }
  if (plan.kind === "refused") {
    if (plan.why === "amount_too_high") throw new ApiError("amount_too_high", { detail: { maximum: (plan.maximum ?? 0n).toString() } })
    throw new ApiError("bad_request", { detail: { field: "depositIntentId", why: plan.why } })
  }
  const amount = plan.amount
  if (scenario !== "expired" && amount === 0n) throw new ApiError("bad_request", { detail: { field: "amount" } })

  // rev4 H-3: ≤ $500 per person per UTC day, inside the global faucet cap (in dollars, at the quote's rate)
  if (amount > 0n) {
    const usd = usdOfUnits(row, amount)
    await charge(db, [
      { subject: subjectOf(s), action: "xc_sim_usd", amount: usd, limit: xcLimit("xc_sim_usd") },
      { subject: "global", action: "faucet_usd", amount: usd, limit: limit("global_faucet_usd") },
    ])
  }

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
  /** real mode: the transactions on the origin network (the deposit first) */
  originTxHashes?: string[]
  updatedAt: Date
}

/**
 * deposit_intent.last_status (jsonb, no migration): the last status and its time, plus a small trail the money-in
 * details read (server/features/deposits.ts): when each status was first seen (ISO) and the origin transactions.
 */
export interface StatusTrail {
  status: string
  at: string
  seen?: Record<string, string>
  originTx?: string[]
}

export function trailOf(row: Pick<Row, "lastStatus">): StatusTrail | null {
  const t = row.lastStatus as StatusTrail | null
  return t && typeof t === "object" && typeof t.status === "string" ? t : null
}

/** The next trail: the new status, its first-seen time kept from before, origin transactions once known. */
export function nextTrail(prev: StatusTrail | null, status: string, at: Date, originTx?: string[]): StatusTrail {
  const seen = { ...(prev?.seen ?? {}) }
  if (!seen[status]) seen[status] = at.toISOString()
  const tx = originTx && originTx.length ? originTx.slice(0, 4) : prev?.originTx
  return { status, at: at.toISOString(), seen, ...(tx && tx.length ? { originTx: tx } : {}) }
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
        quotedOut: BigInt(row.amountOutQuoted ?? q.amountOut),
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
        originTxHashes: (d.originChainTxHashes ?? []).map((x) => x?.hash).filter((h): h is string => typeof h === "string" && h.length > 0),
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
      lastStatus: nextTrail(trailOf(row), snap.status, snap.updatedAt, snap.originTxHashes),
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
      quotedOut: BigInt(row.amountOutQuoted ?? q.amountOut),
      deadlineMs: row.deadline.getTime(),
      withdrawFee: BigInt(q.withdrawFee ?? "0"),
      createdAt: row.createdAt.getTime(),
    },
    now,
  )
  if (v.status !== "SUCCESS" || !v.amountOut) return
  // APP-8: the delivery boundary checks for itself (never trusting how the row was made)
  const owner =
    (await db.select({ account: appUser.nearAccount }).from(appUser).where(eq(appUser.id, row.userId)).limit(1))[0]?.account ?? null
  const refusal = deliveryRefusal(cfg, { recipient: row.recipient, owner, amountOut: v.amountOut })
  if (refusal) {
    await sendAlert(db, `delivery_refused:${id}`, `simulated delivery ${id} refused: ${refusal}`).catch(() => undefined)
    return
  }

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
        lastStatus: nextTrail(trailOf(row), "SUCCESS", new Date(v.updatedAt)),
        updatedAt: new Date(),
      })
      .where(and(eq(depositIntent.id, id), sql`${depositIntent.destinationTxHash} IS NULL`))
  } catch (e) {
    // nothing (or a failed transfer) reached the member: free the lock so the next poll retries
    await db.delete(relayLog).where(eq(relayLog.id, rowId)).catch(() => undefined)
    await logError({ route: "oneclick.deliver", reason: "sim_delivery", detail: { id, err: errText(e, 300) } })
  }
}

/**
 * APP-8 (security audit 2026-11-04): the guard of `deliver()` itself. The simulator pays REAL tokens from the treasury,
 * so it refuses unless: the network is testnet (a mainnet treasury holds real money), the receiver is the deposit's
 * owner, a testnet account (`*.testnet` or implicit), never one of ours (hub, token, relayer, treasury, a Pot, the
 * project root), and the amount is within the simulator's cap. Returns why, or null when the delivery may go ahead.
 */
export function deliveryRefusal(cfg: Config, x: { recipient: string; owner: string | null; amountOut: bigint }): string | null {
  if (cfg.network !== "testnet") return "network"
  const r = x.recipient
  if (!x.owner || r !== x.owner) return "not_owner"
  if (!(r.endsWith(".testnet") || /^[0-9a-f]{64}$/.test(r))) return "receiver_network"
  const root = cfg.hubId.includes(".") ? cfg.hubId.slice(cfg.hubId.indexOf(".") + 1) : cfg.hubId
  const ours = [cfg.hubId, cfg.usdcId, cfg.relayerAccountId, cfg.treasuryAccountId, root].filter(Boolean)
  if (ours.includes(r) || daoSlug(r, cfg.hubId)) return "receiver_ours"
  if (x.amountOut > SIM_MAX * 2n) return "amount"
  return null
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
  const o = originOf(row)
  return {
    mode: row.mode,
    id: row.id,
    pot: row.potId,
    chain: row.chain,
    coin: o.coin,
    decimals: o.decimals,
    stable: o.stable,
    usdTarget: usdTargetOf(row),
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
    ...(row.simScenario
      ? {
          scenario: row.simScenario,
          simulated: {
            sent: (simOf(row)?.sends.length ?? 0) > 0,
            sentAmount: simSent(simOf(row)).toString(),
            ...(simOf(row)?.sends[0] ? { sentAt: new Date(simOf(row)!.sends[0]!.at).toISOString() } : {}),
          },
        }
      : {}),
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
