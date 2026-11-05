// The relay pipeline (api-spec §3.2 steps 3-17). Cheapest and stateless first; no quota is consumed before
// step 12 and nothing is signed before step 15. Rejections after the decode are recorded as `rejected`
// relay_log rows WITHOUT the idempotency key or delegate hash, so a corrected retry is never blocked.
import "server-only"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import { actions as nearActions } from "near-api-js"
import type { Db } from "@/db/client"
import { adjustQuota, chargeQuotas, nextUtcDay, type QuotaCharge } from "@/db/quota"
import { relayLog } from "@/db/schema"
import { sendAlert } from "../alerts"
import { relayerAvailable, sponsorAllows, sponsorLevel } from "../chain/balance"
import type { HubReader, PotView } from "../chain/hub"
import { block, viewAccessKey, viewAccount, viewFunction, type FinalOutcome } from "../chain/near"
import { RpcUnavailableError, type RpcClient } from "../chain/rpc"
import type { Submitter } from "../chain/submitter"
import type { Config } from "../config"
import { ApiError, errBody, REASON_STATUS, unavailable } from "../http/errors"
import { logError } from "../log"
import { notifyFromEvents } from "../notify/notify"
import type { PushSender } from "../notify/webpush"
import { hubAllows } from "../ops/balances"
import { limit } from "../quotas"
import { newRelayId } from "../util/crypto"
import { classify, retryPayoutFailed, type Classified } from "./classify"
import { kindsEqual, type ProposalKind } from "@pot/sdk"
import { decodeSignedDelegate, verifyDelegateSignature, type DecodedDelegate } from "./decode"
import { burnt, trustedEvents } from "../chain/outcome"
import { closePayees, ensureRegistered, registerPayees, type PayeeRegistration } from "../features/registration"
import { applyHubEvents, upsertPotRow } from "./effects"
import { evaluatePolicy, TGAS, type PolicyMatch } from "./policy"
import type { RelayOk, RelayPending, RelayResult } from "./types"
import { errText } from "../util/errtext"

/**
 * hub 1.2.0 gifts: the web app's hooks into the relay (all optional). FLAG_GIFTS gates R16 (gift) and R17
 * (set_gifts) server-side: off → `method_not_allowed`. With the flag on and no `validateGiftRef`, every
 * well-formed gift ref is allowed (the hub re-checks Pot, gifts on, goal and amount; a refusal refunds the giver).
 */
export interface RelayGiftHooks {
  /** FLAG_GIFTS; default: process.env.FLAG_GIFTS is "true" / "1", read per call */
  enabled?: () => boolean
  /**
   * Pre-flight: is `ref` a gift our server started for this Pot, amount and sender, through a link that still
   * works (or a public page that is on)? `{ok: false, why}` → 409 gifts_unavailable {why}. Throwing = 503.
   * (server/features/gifts `giftRefValidator(db)` has exactly this shape.)
   */
  validateGiftRef?: (pot: string, ref: string, amount: bigint, sender?: string) => Promise<{ ok: true } | { ok: false; why: string }>
  /** after the hub's `gift_received` (deferred, after the response; errors are logged, never thrown) */
  onGiftReceived?: (ev: { pot: string; from: string; amount: string; ref: string; txHash?: string; at?: Date }) => Promise<unknown>
  /** after a relayed gift bounced (refused by the hub or a failed forward: the token refunded the giver) */
  onGiftFailed?: (ref: string) => Promise<unknown>
}

const flagGifts = (): boolean => {
  const v = (process.env.FLAG_GIFTS ?? "").trim().toLowerCase()
  return v === "true" || v === "1"
}

export interface RelayDeps {
  /** hub 1.2.0 gifts (see RelayGiftHooks); absent = FLAG_GIFTS from env, every well-formed ref allowed */
  gifts?: RelayGiftHooks
  db: Db
  rpc: RpcClient
  hub: HubReader
  submitter: Submitter
  cfg: Config
  /** next/server `after()` in routes; tests run the work inline or collect it */
  defer: (fn: () => Promise<void>) => void
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** X-06 Web Push sender; null/absent = push off (no VAPID keys) */
  push?: PushSender | null
}

export interface Actor {
  userId: string
  accountId: string
  kind: "near-auth" | "wallet"
  device: { publicKey: string; status: "pending" | "active" | "revoked" } | null
  /** sha256 of a verified email (per-email create quota) */
  emailHash?: string | null
  /** app_user.created_at: APP-1's lower tier for accounts first seen < 24 h ago (absent = treated as established) */
  createdAt?: Date | null
  /** app_user.usdc_registered: APP-2's lazy registration before a spend to oneself (absent = not checked) */
  usdcRegistered?: boolean
}

/** APP-1: an account first seen less than this long ago gets the `new_user_*` tier. */
export const NEW_ACCOUNT_MS = 24 * 3_600_000
export const isNewAccount = (actor: Actor, now: number): boolean => !!actor.createdAt && now - actor.createdAt.getTime() < NEW_ACCOUNT_MS

export interface RelayRequest {
  requestId: string
  signedDelegate: string
  idempotencyKey: string
  intent?: string
  requestRef?: string
  bodyHash: string
  /** the route's ipHash(req) (HMAC of the IP, never the IP): per-IP gift quota (ip_gift) when given */
  ipHash?: string
}

export interface RelayResponse {
  status: number
  body: Record<string, unknown>
}

type Row = typeof relayLog.$inferSelect

const sleepDefault = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------------------------
// match snapshot: kept in relay_log.result while a relay is in flight, so GET /api/relay/[id] can classify
// a late outcome without the delegate bytes

export function snapshotMatch(m: PolicyMatch): Record<string, unknown> {
  return JSON.parse(JSON.stringify(m, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)))
}
export function restoreMatch(s: unknown): PolicyMatch {
  return JSON.parse(JSON.stringify(s), (_k, v) => (typeof v === "string" && /^-?[0-9]+n$/.test(v) ? BigInt(v.slice(0, -1)) : v))
}

// ---------------------------------------------------------------------------------------------

async function findByKey(db: Db, userId: string, key: string): Promise<Row | undefined> {
  const rows = await db
    .select()
    .from(relayLog)
    .where(and(eq(relayLog.userId, userId), eq(relayLog.idempotencyKey, key)))
    .limit(1)
  return rows[0]
}

async function findByHash(db: Db, hash: string): Promise<Row | undefined> {
  const rows = await db.select().from(relayLog).where(eq(relayLog.delegateHash, hash)).limit(1)
  return rows[0]
}

function pendingBody(row: Row, requestId: string): RelayPending {
  return { ok: true, requestId, status: "pending", relayId: row.id, txHash: row.outerTxHash ?? "" }
}

/** Return a stored response (replayed), or wait ≤ 10 s for an in-flight one, then 202 pending. */
async function replay(deps: RelayDeps, row: Row, requestId: string, bodyHash: string | null): Promise<RelayResponse> {
  if (bodyHash !== null && row.bodyHash && row.bodyHash !== bodyHash) throw new ApiError("idempotency_conflict")
  const sleep = deps.sleep ?? sleepDefault
  let cur: Row | undefined = row
  for (let i = 0; cur && !cur.response && i < 20; i++) {
    await sleep(500)
    cur = (await deps.db.select().from(relayLog).where(eq(relayLog.id, row.id)).limit(1))[0]
  }
  if (cur?.response) return { status: cur.httpStatus ?? 200, body: { ...(cur.response as object), replayed: true } }
  return { status: 202, body: { ...pendingBody(cur ?? row, requestId), replayed: true } }
}

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === "23505" || err?.cause?.code === "23505"
}
const constraintOf = (e: unknown): string | undefined => {
  const err = e as { constraint?: string; cause?: { constraint?: string } }
  return err?.constraint ?? err?.cause?.constraint
}

/** `p`, or undefined after `ms` (or on error); the timer never outlives the race. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)))])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Step 11 (APP-1, security audit 2026-11-04): refuse with 503 `sponsor_low` while the sponsors can still pay, never
 * after. The relayer's balance is cached ≤ 30 s while healthy and re-read (≤ 5 s) once it is below the warn level, and
 * must cover this delegate's estimate above the floor; the hub must keep its floor plus this action's sponsored
 * storage (create, spends, joins, closes, links…). A refusal alerts the team (deduped hourly; ALERT_WEBHOOK_URL).
 */
async function sponsorGuard(deps: RelayDeps, m: PolicyMatch): Promise<void> {
  const { cfg } = deps
  let available = await mapRpc(relayerAvailable(deps.rpc, cfg.relayerAccountId))
  if (sponsorLevel(available, cfg.relayerThresholds) !== "ok")
    available = await mapRpc(relayerAvailable(deps.rpc, cfg.relayerAccountId, 5_000))
  const level = sponsorLevel(available - m.estYocto, cfg.relayerThresholds)
  if (!sponsorAllows(level, m.rule === "R2" ? "create_pot" : "relay")) {
    deps.defer(
      async () =>
        void (await sendAlert(
          deps.db,
          "sponsor_refused:relayer",
          `relayer ${cfg.relayerAccountId} available ${available} yocto: refusing relays`,
        )),
    )
    throw unavailable("sponsor_low", 60_000)
  }
  // B-11 + APP-1: the hub sponsors create_pot (float + storage) and every request/close/link's storage; refuse before
  // it would panic ERR_HUB_LOW_BALANCE
  if (m.hubYocto > 0n && !(await hubAllows(deps.rpc, cfg, m.hubYocto))) {
    deps.defer(
      async () => void (await sendAlert(deps.db, "sponsor_refused:hub", `hub ${cfg.hubId} is below its floor: refusing ${m.rule}`)),
    )
    throw unavailable("sponsor_low", 60_000, { account: "hub" })
  }
}

/** Give back a request's quota pre-charges (a refusal after step 12 that is not the caller's doing). */
async function refundCharges(deps: RelayDeps, charges: QuotaCharge[]): Promise<void> {
  for (const c of charges) {
    if (c.period === "minute") continue
    await adjustQuota(deps.db, [c.subject], c.action, -c.amount).catch(() => undefined)
  }
}

function mapRpc<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  })
}

// ---------------------------------------------------------------------------------------------
// step 10: chain reads

/** api-spec §3: a delegate may live at most this many blocks past the final head... */
export const MAX_DELEGATE_TTL = 600n
/** ...plus this slack for a signer whose head is ahead of our final read (optimistic, another RPC). */
export const TTL_SKEW = 30n

/** The highest delegate nonce still in flight for a key; rows whose delegate expired (≤ head) don't count. */
export function inflightNonce(rows: { nonce: string; mbh: number | null }[], head: number): bigint | null {
  let max: bigint | null = null
  for (const r of rows) {
    if (r.mbh !== null && r.mbh !== undefined && Number(r.mbh) < head) continue
    const n = BigInt(r.nonce)
    if (max === null || n > max) max = n
  }
  return max
}

interface ChainContext {
  head: number
  potView: PotView | null
}

async function chainChecks(deps: RelayDeps, actor: Actor, d: DecodedDelegate, m: PolicyMatch): Promise<ChainContext> {
  const { rpc, hub, db } = deps
  const now = deps.now?.() ?? Date.now()
  const inflightP = db.execute<{ nonce: string; mbh: number | null }>(sql`
    SELECT delegate_nonce::text AS nonce, max_block_height AS mbh FROM relay_log
    WHERE sender_id = ${d.senderId} AND delegate_public_key = ${d.publicKey}
      AND status IN ('validated', 'signed', 'submitted', 'pending') AND delegate_nonce IS NOT NULL
    ORDER BY delegate_nonce DESC LIMIT 100`)
  const potP = m.potId && m.rule !== "R2" ? hub.getPot(m.potId) : Promise.resolve(null)
  const [head, ak, inflight, potView] = await Promise.all([
    mapRpc(block(rpc, { finality: "final" })),
    mapRpc(viewAccessKey(rpc, d.senderId, d.publicKey, "optimistic")),
    inflightP,
    mapRpc(potP),
  ])
  const h = BigInt(head.height)
  if (d.maxBlockHeight <= h + 10n)
    throw new ApiError("expired", { detail: { maxBlockHeight: Number(d.maxBlockHeight), head: head.height } })
  // ≤ head + 600 (api-spec), plus a little slack: wallets (Meteor: optimistic head + 600) count from a head a few
  // blocks ahead of our `final` read, and a delegate relayed within a second of signing used to be refused
  if (d.maxBlockHeight > h + MAX_DELEGATE_TTL + TTL_SKEW)
    throw new ApiError("ttl_too_long", { detail: { maxBlockHeight: Number(d.maxBlockHeight), head: head.height } })
  if (!ak) throw new ApiError("key_not_found")
  if (ak.permission !== "FullAccess") {
    const fc = ak.permission.FunctionCall
    const a = d.actions[0]
    if (d.actions.length !== 1 || a?.kind !== "functionCall") throw new ApiError("key_not_allowed", { detail: { why: "fc_key" } })
    if (a.deposit > 0n) throw new ApiError("fc_key_deposit")
    if (fc.receiver_id !== d.receiverId || (fc.method_names.length > 0 && !fc.method_names.includes(a.method)))
      throw new ApiError("key_not_allowed", { detail: { why: "fc_key_scope" } })
  }
  if (d.nonce <= ak.nonce) throw new ApiError("nonce_used", { detail: { accessKeyNonce: ak.nonce.toString() } })
  // The runtime refuses nonce ≥ (executing block) × 10⁶. A key added a block ago has nonce (its block − 1) × 10⁶,
  // which can be above `final × 10⁶` (final lags optimistic by 2-3 blocks), so the bound is the optimistic head
  // (the access-key read's block) + 2 (the delegate executes ≥ 2 blocks later). Frontend request 1, wave 3.
  const nonceHead = BigInt(Math.max(head.height, ak.block_height)) + 2n
  if (d.nonce >= nonceHead * 1_000_000n)
    throw new ApiError("bad_request", { detail: { field: "nonce", why: "too_large" } })
  // an in-flight row whose delegate is past its max_block_height can never execute any more (a lost broadcast the
  // reconcile pass hasn't marked yet): it must not block this key's next action (2026-11-02)
  const maxInflight = inflightNonce(inflight.rows, head.height)
  if (maxInflight !== null && d.nonce <= maxInflight) throw new ApiError("nonce_pending", { retryAfterMs: 2_000 })

  if (m.rule === "R2") {
    const [acct, existing] = await Promise.all([
      mapRpc(viewAccount(rpc, m.potId!, "optimistic")),
      mapRpc(hub.getPot(m.potId!)),
    ])
    if (acct || existing) throw new ApiError("slug_taken", { detail: { slug: m.create?.slug } })
  } else if (m.potId) {
    if (!potView) throw new ApiError("pot_unknown", { detail: { pot: m.potId } })
    if (m.needsOpenPot && potView.status !== "open")
      throw new ApiError("pot_closed", { detail: { status: potView.status } })
    if (m.rule === "R8") m.hubYocto = 8n * 10n ** 21n + 25n * 10n ** 20n * BigInt(Math.max(1, potView.member_count))
  }
  if (m.rule === "R9") {
    const pid = m.retry?.proposalId ?? m.sync?.proposalId ?? 0
    const last = await mapRpc(viewFunction<number>(rpc, m.potId!, "get_last_proposal_id", {}, "optimistic"))
    if (pid >= Number(last)) throw new ApiError("args_invalid", { detail: { field: "proposal_id", why: "unknown" } })
    // hub 1.3.0 (HUB-4/HUB-6): retry_payout(pot, close_id) finalizes the Pot's current failed close as rulebot. It
    // needs 40 + 6·n Tgas for n payees (≤ members); the relayed call is capped at R9's 150 Tgas (≈ 17 payees), so a
    // bigger close is retried server-signed at 300 Tgas instead (≤ 43 payees; the hub caps members at 40)
    if (m.retry && potView && isCurrentClose(potView, pid)) {
      const fcGas = d.actions[0]?.kind === "functionCall" ? d.actions[0].gas : 0n
      if (closeRetryTgas(potView.member_count) * TGAS > fcGas) {
        scheduleServerCloseRetry(deps, m.potId!, pid, `relay:${newRelayId()}`)
        throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "close_retry_by_server", retrying: true } })
      }
      ;(m as PolicyMatch & { closeKind?: Record<string, unknown> }).closeKind = (await mapRpc(hub.getProposal(m.potId!, pid)))?.kind as
        | Record<string, unknown>
        | undefined
    }
  }
  if (m.rule === "R11") await r11Preflight(deps, actor, m, potView!, now)
  if (m.rule === "R16") await giftPreflight(deps, actor, m)
  return { head: head.height, potView }
}

/**
 * R16 pre-flight (hub 1.2.0): the hub would accept a gift now (`get_gifts.accepting`: open, not paused, gifts on,
 * no all-or-nothing goal collecting), then the web app's gift-ref check. A hub without gifts (1.1.0) → hub_not_ready.
 */
async function giftPreflight(deps: RelayDeps, actor: Actor, m: PolicyMatch): Promise<void> {
  const pot = m.potId!
  let g: { accepting?: unknown; refusal?: unknown } | null
  try {
    g = await viewFunction<{ accepting?: unknown; refusal?: unknown } | null>(deps.rpc, deps.cfg.hubId, "get_gifts", { pot }, "optimistic")
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    // MethodNotFound: the hub predates 1.2.0 (it would refund the gift as a bad contribution msg)
    throw new ApiError("gifts_unavailable", { detail: { pot, why: "hub_not_ready" } })
  }
  if (!g) throw new ApiError("pot_unknown", { detail: { pot } })
  if (g.accepting !== true) throw new ApiError("gifts_unavailable", { detail: { pot, why: typeof g.refusal === "string" ? g.refusal : "not_accepting" } })
  const check = deps.gifts?.validateGiftRef
  if (check) {
    const r = await check(pot, m.gift!.ref, m.amount!, actor.accountId)
    if (!r.ok) throw new ApiError("gifts_unavailable", { detail: { pot, why: r.why } })
  }
}

/** R11 pre-flight (rev4 S-2): exists, hub-tracked and live, sender a member, kind deep-equal, open, not voted. */
async function r11Preflight(deps: RelayDeps, actor: Actor, m: PolicyMatch, potView: PotView, now: number) {
  const v = m.vote!
  const [proposal, subject, members] = await Promise.all([
    mapRpc(deps.hub.getProposal(v.daoId, v.proposalId)),
    mapRpc(deps.hub.getProposalSubject(v.daoId, v.proposalId)),
    mapRpc(deps.hub.getMembers(v.daoId)),
  ])
  if (!proposal) throw new ApiError("not_found", { detail: { proposalId: v.proposalId } })
  if (!subject || !subject.live) throw new ApiError("proposal_not_tracked", { detail: { proposalId: v.proposalId } })
  if (!members.some((x) => x.account_id === actor.accountId && x.status === "active")) throw new ApiError("not_a_member")
  if (!kindsEqual(proposal.kind as ProposalKind, v.kind as ProposalKind)) throw new ApiError("args_invalid", { detail: { field: "proposal", why: "kind_mismatch" } })
  const periodMs = potView.proposal_period_ms || 7 * 86_400_000
  const expired = now > Number(BigInt(proposal.submission_time) / 1_000_000n) + periodMs
  if (v.action === "Finalize") {
    if (!(proposal.status === "Failed" || (proposal.status === "InProgress" && expired)))
      throw new ApiError("proposal_not_open", { detail: { status: proposal.status, expired } })
    // hub 1.3.0 (HUB-6): members have no Finalize on policy v3/v4 Pots (the DAO would refuse it, ERR_PERMISSION_DENIED,
    // and the relayer would pay for nothing). The hub retries a failed close itself (retry_payout as rulebot): the
    // server starts that (300 Tgas, payees registered first) and the member is told it's on its way.
    if ((potView.policy_version ?? 1) >= 3) {
      const retrying = subject.kind === "close" && proposal.status === "Failed" && isCurrentClose(potView, v.proposalId)
      if (retrying) scheduleServerCloseRetry(deps, v.daoId, v.proposalId, `finalize:${newRelayId()}`)
      throw new ApiError("action_not_allowed", { status: 409, detail: { cause: "finalize_by_hub", retrying } })
    }
  } else {
    if (proposal.status !== "InProgress" || expired)
      throw new ApiError("proposal_not_open", { detail: { status: proposal.status, expired } })
    if (proposal.votes[actor.accountId]) throw new ApiError("already_voted")
  }
  // a close approval registers unregistered payees first (rev4 M-5): step 12 needs the subject kind
  ;(m as PolicyMatch & { subjectKind?: string }).subjectKind = subject.kind
}

// ---------------------------------------------------------------------------------------------
// step 12: quotas

export function quotaCharges(actor: Actor, m: PolicyMatch, ipHash?: string, now = Date.now()): QuotaCharge[] {
  const user = `user:${actor.userId}`
  const fresh = isNewAccount(actor, now)
  const c: QuotaCharge[] = [
    { subject: user, action: "burst", amount: 1n, limit: limit("user_burst"), period: "minute", tag: "burst" },
    { subject: user, action: m.family, amount: 1n, limit: limit(`user_${m.family}`), tag: `family:${m.family}` },
  ]
  // APP-1 (security audit 2026-11-04): per trusted client IP (HMAC, never the IP), so a farm of free accounts behind
  // one address can't take the global caps and the sponsors' NEAR for everyone. Every relay passes through here.
  if (ipHash) {
    const ip = `ip:${ipHash}`
    c.push({ subject: ip, action: "relay_burst", amount: 1n, limit: limit("ip_relay_burst"), period: "minute", tag: "burst" })
    c.push({ subject: ip, action: "relays", amount: 1n, limit: limit("ip_relays"), tag: "family:ip" })
    c.push({ subject: ip, action: "relay_yocto", amount: m.estYocto, limit: limit("ip_relay_yocto"), tag: "budget" })
    if (m.hubYocto > 0n) c.push({ subject: ip, action: "hub_yocto", amount: m.hubYocto, limit: limit("ip_hub_yocto"), tag: "budget" })
    if (m.rule === "R2") c.push({ subject: ip, action: "pots_created", amount: 1n, limit: limit("ip_pots_created"), tag: "family:create" })
  }
  // APP-1: the lower tier for brand-new accounts: a daily total, and together at most a share of the global budgets
  if (fresh) {
    c.push({ subject: user, action: "relays", amount: 1n, limit: limit("new_user_relays"), tag: "budget" })
    c.push({ subject: "global", action: "new_relay_yocto", amount: m.estYocto, limit: limit("global_new_relay_yocto"), tag: "global_cap" })
    if (m.hubYocto > 0n)
      c.push({ subject: "global", action: "new_hub_yocto", amount: m.hubYocto, limit: limit("global_new_hub_yocto"), tag: "global_cap" })
  }
  if (m.potId && ["contribute", "spend", "vote", "close", "gift"].includes(m.family))
    c.push({ subject: `pot:${m.potId}`, action: m.family, amount: 1n, limit: limit(`pot_${m.family}`), tag: `family:${m.family}` })
  // hub 1.2.0: gifts come from anyone, so they are also capped per (hashed) IP when the route passes it
  if (m.family === "gift" && ipHash)
    c.push({ subject: `ip:${ipHash}`, action: "gift", amount: 1n, limit: limit("ip_gift"), tag: "family:gift" })
  const finalizePid = m.vote?.action === "Finalize" ? m.vote.proposalId : m.retry?.proposalId
  if (finalizePid !== undefined)
    c.push({ subject: `proposal:${m.potId}:${finalizePid}`, action: "finalize", amount: 1n, limit: limit("proposal_finalize"), tag: "family:finalize" })
  if (m.rule === "R2") {
    c.push({ subject: "global", action: "pots_created", amount: 1n, limit: limit("global_pots_created"), tag: "family:create" })
    if (actor.emailHash)
      c.push({ subject: `email:${actor.emailHash}`, action: "create", amount: 1n, limit: limit("email_create"), tag: "family:create" })
  }
  c.push({ subject: "global", action: "relays", amount: 1n, limit: limit("global_relays"), tag: "global_cap" })
  c.push({ subject: "global", action: "relay_yocto", amount: m.estYocto, limit: limit("global_relay_yocto"), tag: "global_cap" })
  c.push({
    subject: user,
    action: "relay_yocto",
    amount: m.estYocto,
    limit: limit(fresh ? "new_user_relay_yocto" : "user_relay_yocto"),
    tag: "budget",
  })
  if (m.hubYocto > 0n) {
    c.push({
      subject: user,
      action: "hub_yocto",
      amount: m.hubYocto,
      limit: limit(fresh ? "new_user_hub_yocto" : "user_hub_yocto"),
      tag: "budget",
    })
    c.push({ subject: "global", action: "hub_yocto", amount: m.hubYocto, limit: limit("global_hub_yocto"), tag: "global_cap" })
  }
  return c
}

async function chargeOrThrow(deps: RelayDeps, actor: Actor, m: PolicyMatch, ipHash?: string): Promise<QuotaCharge[]> {
  const r = await deps.db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM relay_log
    WHERE user_id = ${actor.userId} AND outcome = 'delegate_failed'
      AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')`)
  if ((r.rows[0]?.n ?? 0) > 10) throw new ApiError("user_suspended", { detail: { resetsAt: nextUtcDay().toISOString() } })
  const charges = quotaCharges(actor, m, ipHash, deps.now?.() ?? Date.now())
  const res = await chargeQuotas(deps.db, charges)
  if (res.ok) return charges
  const f = res.failed
  const resetsAt = nextUtcDay().toISOString()
  if (f.tag === "burst") {
    const ms = 60_000 - (Date.now() % 60_000)
    throw new ApiError("rate_limited", { retryAfterMs: ms, detail: { limit: Number(f.limit) } })
  }
  if (f.tag === "global_cap") {
    deps.defer(async () => {
      await sendAlert(deps.db, "global_cap_hit", `global ${f.action} cap reached`)
    })
    throw unavailable("global_cap", 60_000, { counter: f.action })
  }
  const family = f.tag === "budget" ? "budget" : f.tag === "family:ip" ? "relays" : (f.tag ?? "family:other").replace("family:", "")
  throw new ApiError("quota_exceeded", { detail: { family, limit: f.limit.toString(), resetsAt } })
}

// ---------------------------------------------------------------------------------------------
// the entry point

export async function relay(deps: RelayDeps, actor: Actor, req: RelayRequest): Promise<RelayResponse> {
  const { db, cfg } = deps
  // 3. idempotency
  const prior = await findByKey(db, actor.userId, req.idempotencyKey)
  if (prior) return replay(deps, prior, req.requestId, req.bodyHash)

  // 4. decode (a malformed body is a plain 400, nothing recorded)
  const d = decodeSignedDelegate(req.signedDelegate)
  let m: PolicyMatch | undefined
  let chain: ChainContext | undefined
  try {
    // 5. identity
    if (d.senderId !== actor.accountId) throw new ApiError("sender_mismatch")
    // 6. static policy
    m = evaluatePolicy(d, {
      hubId: cfg.hubId,
      usdcId: cfg.usdcId,
      intent: req.intent,
      requestRef: req.requestRef,
      nowMs: deps.now?.() ?? Date.now(),
      testAllowlist: cfg.testAllowlist,
    })
    // 6b. hub 1.2.0 gifts stay behind FLAG_GIFTS (server side) until verified on testnet
    if ((m.rule === "R16" || m.rule === "R17") && !(deps.gifts?.enabled ?? flagGifts)())
      throw new ApiError("method_not_allowed", { detail: { method: m.methods[0], why: "gifts_off" } })
    // 7. key binding
    if (actor.kind === "near-auth") {
      if (!actor.device || actor.device.status !== "active" || actor.device.publicKey !== d.publicKey)
        throw new ApiError("key_not_allowed")
    }
    // 8. signature
    if (!(await verifyDelegateSignature(d))) throw new ApiError("bad_signature")
    // 9. dedupe by bytes
    const dup = await findByHash(db, d.hash)
    if (dup) return replay(deps, dup, req.requestId, null)
    // 10. chain reads
    chain = await chainChecks(deps, actor, d, m)
    // 11. sponsor health (APP-1: fails closed with 503 sponsor_low before a sponsor runs dry, and tells the team)
    await sponsorGuard(deps, m)
    // 12. quotas (one transaction, all or nothing)
    const charges = await chargeOrThrow(deps, actor, m, req.ipHash)
    if (chain.potView) await upsertPotRow(db, cfg.hubId, chain.potView).catch(() => undefined)
    if (m.rule === "R11" && m.vote!.action !== "VoteReject" && (m as PolicyMatch & { subjectKind?: string }).subjectKind === "close") {
      // HUB-5: every payee registered before the vote that may execute the close (one unregistered payee fails the whole
      // atomic batch). Payees we could not even try (budget, sponsor) → 503 now, quota pre-charges given back.
      const reg = await registerClosePayees(deps, m.vote!.kind, m.potId ?? undefined)
      if (reg.skipped.length > 0) {
        await refundCharges(deps, charges)
        throw unavailable("sponsor_low", 60_000, { why: "payee_registration" })
      }
    }
    // HUB-5 + hub 1.3.0: a relayed retry of a failed close pays every payee in one batch: register them first
    const closeKind = (m as PolicyMatch & { closeKind?: Record<string, unknown> }).closeKind
    if (m.rule === "R9" && closeKind) {
      const reg = await registerClosePayees(deps, closeKind, m.potId ?? undefined)
      if (reg.skipped.length > 0) {
        await refundCharges(deps, charges)
        throw unavailable("sponsor_low", 60_000, { why: "payee_registration" })
      }
    }
    // APP-2: a spend to oneself is the first time an account may receive money: register it now (once ever) so the
    // hub's payee check doesn't refuse it. Best effort and bounded; the hub still has the last word.
    if (m.rule === "R3" && m.spend?.receiverId === actor.accountId && actor.usdcRegistered === false)
      await withTimeout(
        ensureRegistered(deps, { account: actor.accountId, userId: actor.userId, ipHash: req.ipHash, budget: "general" }),
        8_000,
      )
  } catch (e) {
    if (e instanceof ApiError) await recordRejected(deps, actor, req, d, m, e)
    throw e
  }

  // 13. record
  const relayId = newRelayId()
  const insertRow = () =>
    db.insert(relayLog).values({
      id: relayId,
      requestId: req.requestId,
      userId: actor.userId,
      idempotencyKey: req.idempotencyKey,
      bodyHash: req.bodyHash,
      op: "relay",
      intent: m!.intent,
      senderId: d.senderId,
      receiverId: d.receiverId,
      methods: m!.methods,
      potId: m!.potId,
      delegateHash: d.hash,
      delegatePublicKey: d.publicKey,
      delegateNonce: d.nonce.toString(),
      maxBlockHeight: Number(d.maxBlockHeight),
      status: "validated",
      estYocto: m!.estYocto.toString(),
      result: { __match: snapshotMatch(m!) },
    })
  try {
    // APP-9: an in-flight row holding this nonce whose delegate already expired can never execute (step 10 checked the
    // key's nonce is still below ours): it is a lost broadcast, so free the nonce and insert again, once
    await insertRow().catch(async (e) => {
      if (constraintOf(e) !== "relay_log_inflight_nonce_uq" || !(await releaseExpiredNonce(deps, d, chain!.head))) throw e
      await insertRow()
    })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // a concurrent duplicate (same key or same bytes): return its result
    const other = (await findByKey(db, actor.userId, req.idempotencyKey)) ?? (await findByHash(db, d.hash))
    if (other) return replay(deps, other, req.requestId, other.idempotencyKey === req.idempotencyKey ? req.bodyHash : null)
    // APP-9: another delegate with the same (sender, key, nonce) went in flight between our read (step 10) and this
    // insert (relay_log_inflight_nonce_uq): only one of them could ever execute, so this one waits, and the quota
    // pre-charges are given back.
    if (constraintOf(e) === "relay_log_inflight_nonce_uq") {
      await refundCharges(deps, quotaCharges(actor, m, req.ipHash, deps.now?.() ?? Date.now()))
      const err = new ApiError("nonce_pending", { retryAfterMs: 2_000 })
      await recordRejected(deps, actor, req, d, m, err)
      throw err
    }
    throw e
  }

  return submitAndClassify(deps, actor, req, d, m, relayId, chain?.potView ?? null)
}

/**
 * APP-9: in-flight rows of this (sender, key, nonce) whose delegate is past its max_block_height at the final head can
 * never run (the caller saw the key's nonce below it): mark them lost (as reconcileRelayRow would) and give their yocto
 * pre-charge back. Returns how many were released.
 */
async function releaseExpiredNonce(deps: RelayDeps, d: DecodedDelegate, head: number): Promise<number> {
  const rows = await deps.db
    .update(relayLog)
    .set({ status: "failed", reason: "expired", errorText: "lost_broadcast", finishedAt: new Date() })
    .where(
      and(
        eq(relayLog.senderId, d.senderId),
        eq(relayLog.delegatePublicKey, d.publicKey),
        eq(relayLog.delegateNonce, d.nonce.toString()),
        inArray(relayLog.status, ["validated", "signed", "submitted", "pending"]),
        lt(relayLog.maxBlockHeight, head),
      ),
    )
    .returning({ userId: relayLog.userId, estYocto: relayLog.estYocto })
  for (const r of rows)
    if (r.estYocto)
      await adjustQuota(deps.db, ["global", ...(r.userId ? [`user:${r.userId}`] : [])], "relay_yocto", -BigInt(r.estYocto)).catch(
        () => undefined,
      )
  return rows.length
}

async function recordRejected(
  deps: RelayDeps,
  actor: Actor,
  req: RelayRequest,
  d: DecodedDelegate,
  m: PolicyMatch | undefined,
  e: ApiError,
): Promise<void> {
  await deps.db
    .insert(relayLog)
    .values({
      id: newRelayId(),
      requestId: req.requestId,
      userId: actor.userId,
      op: "relay",
      intent: m?.intent ?? req.intent ?? null,
      senderId: d.senderId,
      receiverId: d.receiverId,
      methods: d.actions.map((a) => (a.kind === "functionCall" ? a.method : a.kind)),
      potId: m?.potId ?? null,
      delegatePublicKey: d.publicKey,
      delegateNonce: d.nonce.toString(),
      maxBlockHeight: Number(d.maxBlockHeight),
      status: "rejected",
      reason: e.reason,
      response: errBody(e, req.requestId),
      httpStatus: e.status,
      finishedAt: new Date(),
    })
    .catch(() => undefined)
}

// ---------------------------------------------------------------------------------------------
// steps 14-17

async function submitAndClassify(
  deps: RelayDeps,
  actor: Actor,
  req: RelayRequest,
  d: DecodedDelegate,
  m: PolicyMatch,
  relayId: string,
  potView: PotView | null,
): Promise<RelayResponse> {
  const { db, cfg } = deps
  const yoctoSubjects = { action: "relay_yocto", subjects: ["global", `user:${actor.userId}`] }

  const submitP = deps.submitter.submit(
    {
      signerId: cfg.relayerAccountId,
      receiverId: d.senderId,
      actions: [nearActions.signedDelegate(d.raw as unknown as Parameters<typeof nearActions.signedDelegate>[0])],
    },
    {
      pool: cfg.relayerPool,
      holder: relayId,
      budgetMs: 25_000,
      onSigned: async ({ txHash, publicKey }) => {
        await db
          .update(relayLog)
          .set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() })
          .where(eq(relayLog.id, relayId))
      },
    },
  )

  type Settled = { kind: "final"; r: Awaited<typeof submitP> } | { kind: "error"; e: unknown } | { kind: "early"; r: RelayResult }
  const finalP: Promise<Settled> = submitP.then(
    (r) => ({ kind: "final" as const, r }),
    (e) => ({ kind: "error" as const, e }),
  )
  const ac = new AbortController()
  const racers: Promise<Settled>[] = [finalP]
  if (m.rule === "R3") racers.push(probeEarlySpend(deps, m, d.senderId, ac.signal, potView?.request_count ?? null))
  const first = await Promise.race(racers)
  ac.abort()

  if (first.kind === "early") {
    const row = (await db.select().from(relayLog).where(eq(relayLog.id, relayId)).limit(1))[0]
    const txHash = row?.outerTxHash ?? ""
    const early: RelayOk = {
      ok: true,
      requestId: req.requestId,
      relayId,
      txHash,
      receiptUrl: `${cfg.explorerUrl}/txns/${txHash}`,
      outcome: "success",
      events: [],
      executedAtBlock: 0,
      result: first.r,
      final: false,
    }
    await db
      .update(relayLog)
      .set({ status: "submitted", response: early, httpStatus: 200 })
      .where(eq(relayLog.id, relayId))
    deps.defer(async () => {
      const settled = await finalP
      await settle(deps, actor, req, m, relayId, settled, yoctoSubjects)
    })
    return { status: 200, body: early as unknown as Record<string, unknown> }
  }
  return settle(deps, actor, req, m, relayId, first, yoctoSubjects)

  async function settle(
    deps: RelayDeps,
    actor: Actor,
    req: RelayRequest,
    m: PolicyMatch,
    relayId: string,
    s: Settled,
    yocto: { action: string; subjects: string[] },
  ): Promise<RelayResponse> {
    if (s.kind === "error") {
      // never reached the chain: give the yocto pre-charge back
      await adjustQuota(deps.db, yocto.subjects, yocto.action, -m.estYocto).catch(() => undefined)
      const e = s.e instanceof ApiError ? s.e : s.e instanceof RpcUnavailableError ? unavailable("rpc", 3_000) : new ApiError("internal")
      await deps.db
        .update(relayLog)
        .set({ status: "failed", reason: e.reason, response: errBody(e, req.requestId), httpStatus: e.status, finishedAt: new Date() })
        .where(eq(relayLog.id, relayId))
      if (!(s.e instanceof ApiError))
        await logError({ route: "/api/relay", requestId: req.requestId, relayId, reason: e.reason, detail: { err: String(s.e).slice(0, 300) } })
      throw e
    }
    if (s.kind === "early") throw new Error("unreachable")
    if (s.r.kind === "pending") {
      const body = pendingBody({ id: relayId, outerTxHash: s.r.txHash } as Row, req.requestId)
      await deps.db.update(relayLog).set({ status: "pending" }).where(eq(relayLog.id, relayId))
      return { status: 202, body: body as unknown as Record<string, unknown> }
    }
    const done = await completeRelay(deps, {
      relayId,
      requestId: req.requestId,
      userId: actor.userId,
      actor,
      m,
      delegateReceiver: d.receiverId,
      txHash: s.r.txHash,
      outcome: s.r.outcome,
      yocto,
      ipHash: req.ipHash,
    })
    return done
  }
}

/**
 * B-09 two-phase `request_spend`: poll `get_requests` at optimistic finality while send_tx waits.
 * - instant path: answer as soon as the hub has recorded the request with its decision (`checking` onwards).
 *   `request_spend` runs the Pot-rules decision synchronously (D-07 "Approved by Pot rules"), and the record
 *   appears 2 blocks after inclusion; the proposal id only exists 4 blocks later (measured on testnet:
 *   decision +1.2 s, proposal id +3.7 s, payout +5.0 s after inclusion; notes/backend.md wave 2), which would
 *   miss the ≤ 4 s early answer (P-5a). `proposalId` is null until known; the post-checks (balance, payee
 *   registration, DAO group) can still refuse, which the final body (`final: true`, REFUSED_*) reports.
 * - vote path: answer once the proposal exists (the requester's own vote needs its id).
 * One RPC per poll (every 300 ms), starting from the request count read in the chain checks.
 */
async function probeEarlySpend(deps: RelayDeps, m: PolicyMatch, sender: string, signal: AbortSignal, fromIndex: number | null) {
  const sleep = deps.sleep ?? sleepDefault
  const pot = m.potId!
  const ref = m.spend!.requestRef
  while (!signal.aborted) {
    await sleep(300)
    if (signal.aborted) break
    try {
      let from = fromIndex
      if (from === null) {
        const pv = await deps.hub.getPot(pot, { fresh: true })
        if (!pv) continue
        from = Math.max(0, pv.request_count - 10)
      }
      const reqs = await deps.hub.getRequests(pot, Math.max(0, from - 2), 10)
      const r = reqs.find((x) => x.request_ref === ref && x.requester === sender)
      if (!r) continue
      const hasProposal = r.proposal_id !== null && r.proposal_id !== undefined
      const decidedInstant = r.path === "instant" && ["checking", "proposing", "approving", "approved"].includes(r.status)
      const votePending = hasProposal && ["approving", "approved", "pending"].includes(r.status)
      if (decidedInstant || votePending) {
        const pv = await deps.hub.getPot(pot).catch(() => null)
        const result: RelayResult = {
          type: "spend",
          requestId: r.request_id,
          path: r.path,
          proposalId: hasProposal ? r.proposal_id! : null,
          ...(r.path === "instant" ? { payout: "pending" as const } : {}),
          ...(pv ? { approvalsNeeded: pv.approvals_needed } : {}),
        }
        return { kind: "early" as const, r: result }
      }
    } catch {
      // a failed probe read is not an error: the full outcome still arrives
    }
  }
  return new Promise<never>(() => undefined)
}

export async function blockTimes(rpc: RpcClient, hashes: string[]): Promise<Map<string, { height: number; ms: number }>> {
  const out = new Map<string, { height: number; ms: number }>()
  await Promise.all(
    hashes.map(async (h) => {
      try {
        const b = await block(rpc, { blockId: h })
        out.set(h, { height: b.height, ms: Number(BigInt(b.timestampNs) / 1_000_000n) })
      } catch {
        // fall back to the head below
      }
    }),
  )
  return out
}

export interface CompleteInput {
  relayId: string
  requestId: string
  userId: string | null
  actor?: Actor
  m: PolicyMatch
  /** the delegate's receiver (hub, token, DAO or a test receiver) */
  delegateReceiver: string
  txHash: string
  outcome: FinalOutcome
  yocto: { action: string; subjects: string[] }
  /** the request's IP hash (APP-2: the lazy registration after a create/join is charged to it) */
  ipHash?: string
}

/** Step 16 (+ 17 in after()): classify, store, correct the yocto pre-charge, write feed rows. */
export async function completeRelay(deps: RelayDeps, x: CompleteInput): Promise<RelayResponse> {
  const { db, cfg, hub, rpc } = deps
  const m = x.m
  const proposalStatus =
    m.rule === "R11" ? (await hub.getProposal(m.vote!.daoId, m.vote!.proposalId, "optimistic").catch(() => null))?.status : undefined
  const c: Classified = classify(x.outcome, m, {
    hubId: cfg.hubId,
    usdcId: cfg.usdcId,
    senderId: x.outcome.transaction.receiver_id,
    receiverId: x.delegateReceiver,
    proposalStatus,
  })
  const times = await blockTimes(rpc, c.blockHashes)
  let executedAtBlock = Math.max(0, ...[...times.values()].map((t) => t.height))
  if (executedAtBlock === 0) executedAtBlock = (await block(rpc, { finality: "optimistic" }).catch(() => ({ height: 0 }))).height

  let status: number
  let body: Record<string, unknown>
  if (c.outcome === "delegate_failed") {
    const e = new ApiError(c.reason ?? "internal", { txHash: x.txHash, message: c.error })
    status = e.status
    body = errBody(e, x.requestId) as unknown as Record<string, unknown>
  } else {
    const ok: RelayOk = {
      ok: true,
      requestId: x.requestId,
      relayId: x.relayId,
      txHash: x.txHash,
      receiptUrl: `${cfg.explorerUrl}/txns/${x.txHash}`,
      outcome: c.outcome,
      ...(c.error ? { error: c.error } : {}),
      ...(c.errorCode ? { errorCode: c.errorCode } : {}),
      events: c.events,
      executedAtBlock,
      result: c.result,
      final: true,
    }
    status = 200
    body = ok as unknown as Record<string, unknown>
  }
  await db
    .update(relayLog)
    .set({
      status: c.outcome === "delegate_failed" ? "failed" : "executed",
      outcome: c.outcome,
      reason: c.reason ?? null,
      errorCode: c.errorCode ?? null,
      errorText: c.error ?? null,
      result: c.result,
      events: c.events,
      response: body,
      httpStatus: status,
      executedAtBlock,
      costYocto: c.costYocto.toString(),
      gasBurnt: c.gasBurnt.toString(),
      finishedAt: new Date(),
    })
    .where(eq(relayLog.id, x.relayId))
  await adjustQuota(db, x.yocto.subjects, x.yocto.action, c.costYocto - m.estYocto).catch(() => undefined)
  await applyHubEvents(db, { hubId: cfg.hubId, txHash: x.txHash, events: c.rawEvents, blockTimes: times }).catch((e) =>
    logError({ route: "/api/relay", relayId: x.relayId, reason: "feed_write", detail: { err: errText(e, 300) } }),
  )
  if (c.outcome === "inner_failed")
    await logError({ route: "/api/relay", relayId: x.relayId, reason: "inner_failed", detail: { errorCode: c.errorCode } })
  if (m.potId) hub.invalidate(m.potId)

  // 17. follow-ups after the response (B-05)
  deps.defer(async () => {
    await followUps(deps, x, c)
  })
  return { status, body }
}

/** after(): `sync` after every relayed DAO vote and after a failed payout (D-05 Rev 2); balance check. */
export async function followUps(deps: RelayDeps, x: CompleteInput, c: Classified): Promise<void> {
  const m = x.m
  const tasks: Promise<unknown>[] = []
  if (c.outcome === "success" && m.rule === "R11") tasks.push(serverSync(deps, m.vote!.daoId, m.vote!.proposalId, x.relayId))
  if (c.outcome === "success" && m.rule === "R3" && c.payoutFailed && c.result?.type === "spend" && c.result.proposalId !== null)
    tasks.push(serverSync(deps, m.potId!, c.result.proposalId, x.relayId))
  // hub 1.1.0: a one-OK approval whose payout failed (the hub's `approved` is optimistic, D7) → sync
  if (c.outcome === "success" && m.rule === "R13" && c.payoutFailed && c.result?.type === "ok" && c.result.proposalId !== null)
    tasks.push(serverSync(deps, m.potId!, c.result.proposalId, x.relayId))
  // B-05 / D7: a relayed retry_payout → sync. Hub 1.3.0: after ANY retry, not only a failed one: a retried close is
  // Closed only when sync sees the money out of the DAO (HUB-4), and a spend's `approved` is optimistic (D7).
  // (Every relayed R11 vote, close approvals included, is already synced above.)
  if (c.outcome !== "delegate_failed" && m.rule === "R9" && m.retry) tasks.push(serverSync(deps, m.potId!, m.retry.proposalId, x.relayId))
  // B-05: new money may cover an approved payout that failed for lack of balance → retry_payout
  if (c.outcome === "success" && m.rule === "R1" && m.potId) tasks.push(retryFailedPayouts(deps, m.potId, x.relayId))
  // hub 1.2.0: a gift is new money too, and the web app records it (gift row, link uses, push) or marks it failed
  if (m.rule === "R16" && c.outcome !== "delegate_failed") {
    if (c.outcome === "success" && m.potId) tasks.push(retryFailedPayouts(deps, m.potId, x.relayId))
    tasks.push(giftFollowUp(deps, x, c))
  }
  // APP-2: creating or joining a Pot is when an account first needs to receive money (spends, refunds): register it now
  // (once ever, per-IP and global budgets), not at sign-in
  if (c.outcome === "success" && (m.rule === "R2" || m.rule === "R4") && x.actor)
    tasks.push(ensureRegistered(deps, { account: x.actor.accountId, userId: x.actor.userId, ipHash: x.ipHash, budget: "general" }))
  // HUB-5: a close was just proposed: register its payees now (close budget), well before the vote that pays them
  if (c.outcome === "success" && m.rule === "R8" && m.potId) tasks.push(registerProposedClosePayees(deps, c, m.potId))
  tasks.push(checkRelayerBalance(deps))
  // X-06: "money arrived", "needs your approval", "Pot closed" from this tx's trusted hub events
  if (c.outcome !== "delegate_failed" && deps.push) tasks.push(notifyFromEvents(notifyDeps(deps), c.rawEvents, x.txHash))
  await Promise.allSettled(tasks)
}

const notifyDeps = (deps: RelayDeps) => ({ db: deps.db, hub: deps.hub, cfg: deps.cfg, sender: deps.push ?? null })

/** hub 1.2.0: hand the trusted `gift_received` event (or the bounce) to the web app's hooks. Never throws. */
async function giftFollowUp(deps: RelayDeps, x: CompleteInput, c: Classified): Promise<void> {
  const hooks = deps.gifts
  const ref = x.m.gift?.ref
  if (!hooks || !ref) return
  try {
    const ev = c.rawEvents.find((e) => e.standard === "pot" && e.event === "gift_received")
    const d = (ev?.data ?? null) as { pot?: unknown; from?: unknown; amount?: unknown; ref?: unknown } | null
    if (c.outcome === "success" && d && typeof d.pot === "string" && typeof d.from === "string" && typeof d.amount === "string" && typeof d.ref === "string") {
      await hooks.onGiftReceived?.({ pot: d.pot, from: d.from, amount: d.amount, ref: d.ref, txHash: x.txHash })
    } else if (c.outcome === "inner_failed") {
      await hooks.onGiftFailed?.(ref)
    }
  } catch (e) {
    await logError({ route: "/api/relay", relayId: x.relayId, reason: "gift_hook", detail: { err: errText(e, 300) } })
  }
}

/** A relayer-signed hub.sync (permissionless, idempotent); relay_log op `sync`. */
export function serverSync(deps: RelayDeps, pot: string, proposalId: number, cause: string): Promise<void> {
  return serverHubCall(deps, { op: "sync", method: "sync", pot, proposalId, gasTgas: 50n, cause })
}

/** A relayer-signed hub.retry_payout (the caller charges the ≤ 3/proposal/day finalize quota). */
export function serverRetryPayout(deps: RelayDeps, pot: string, proposalId: number, cause: string): Promise<void> {
  return serverHubCall(deps, { op: "retry_payout", method: "retry_payout", pot, proposalId, gasTgas: 100n, cause })
}

/** hub 1.3.0: is `proposalId` the Pot's current close (status closing)? */
export const isCurrentClose = (v: PotView, proposalId: number): boolean => v.status === "closing" && v.close_proposal_id === proposalId

/** hub 1.3.0 retry_payout on a close: 20 + 6·n Tgas for the payout batch + 20 for the hub (notes/contracts.md). */
export const closeRetryTgas = (payees: number): bigint => 40n + 6n * BigInt(Math.max(1, payees))
/** The server's own close retry: the most a tx's single call may use. */
export const SERVER_CLOSE_RETRY_TGAS = 300n

/**
 * hub 1.3.0: retry the Pot's current failed close, relayer-signed at 300 Tgas (any close size up to the hub's 40
 * members), after registering every payee (HUB-5). Bounded by the shared ≤ 3/proposal/day finalize quota; the
 * follow-up `sync` confirms the money is out (HUB-4). Never throws.
 */
export async function serverRetryClose(deps: RelayDeps, pot: string, proposalId: number, cause: string): Promise<"retried" | "skipped"> {
  try {
    const q = await chargeQuotas(deps.db, [
      { subject: `proposal:${pot}:${proposalId}`, action: "finalize", amount: 1n, limit: limit("proposal_finalize") },
    ])
    if (!q.ok) return "skipped"
    const proposal = await deps.hub.getProposal(pot, proposalId).catch(() => null)
    if (proposal) {
      const reg = await registerClosePayees(deps, proposal.kind as Record<string, unknown>, pot)
      if (reg.skipped.length > 0) return "skipped"
    }
    await serverHubCall(deps, {
      op: "retry_payout",
      method: "retry_payout",
      pot,
      proposalId,
      gasTgas: SERVER_CLOSE_RETRY_TGAS,
      cause,
      syncAfter: true,
    })
    return "retried"
  } catch (e) {
    await logError({ route: "after:retry_close", reason: "retry_close_failed", detail: { pot, proposalId, err: errText(e, 300) } })
    return "skipped"
  }
}

/** In after(): each request gets its own cause (a unique relay_log key); the finalize quota bounds how many run. */
function scheduleServerCloseRetry(deps: RelayDeps, pot: string, proposalId: number, cause: string): void {
  deps.defer(async () => void (await serverRetryClose(deps, pot, proposalId, cause)))
}

/** B-05: after a contribution, retry approved payouts that failed (≤ 3 per proposal per UTC day, shared with Finalize). */
export async function retryFailedPayouts(deps: RelayDeps, pot: string, cause: string): Promise<void> {
  const v = await deps.hub.getPot(pot, { fresh: true }).catch(() => null)
  if (!v || v.status !== "open" || !v.unpaid_approved) return
  const reqs = await deps.hub.getRequests(pot, Math.max(0, v.request_count - 50), 50).catch(() => [])
  for (const r of reqs.filter((x) => x.status === "payout_failed" && x.proposal_id !== null).slice(0, 3)) {
    const q = await chargeQuotas(deps.db, [
      { subject: `proposal:${pot}:${r.proposal_id}`, action: "finalize", amount: 1n, limit: limit("proposal_finalize") },
    ])
    if (!q.ok) continue
    await serverHubCall(deps, { op: "retry_payout", method: "retry_payout", pot, proposalId: r.proposal_id!, gasTgas: 100n, cause })
  }
}

async function serverHubCall(
  deps: RelayDeps,
  x: { op: "sync" | "retry_payout"; method: string; pot: string; proposalId: number; gasTgas: bigint; cause: string; syncAfter?: boolean },
): Promise<void> {
  const { db, cfg } = deps
  const id = newRelayId()
  const key = `${x.op}:${x.pot}:${x.proposalId}:${x.cause}`
  try {
    await db.insert(relayLog).values({
      id,
      requestId: x.cause,
      op: x.op,
      idempotencyKey: key,
      senderId: cfg.relayerAccountId,
      receiverId: cfg.hubId,
      methods: [x.method],
      potId: x.pot,
      status: "validated",
    })
  } catch (e) {
    if (isUniqueViolation(e)) return
    throw e
  }
  try {
    const r = await deps.submitter.submit(
      {
        signerId: cfg.relayerAccountId,
        receiverId: cfg.hubId,
        actions: [nearActions.functionCall(x.method, { pot: x.pot, proposal_id: x.proposalId }, x.gasTgas * TGAS, 0n)],
      },
      {
        pool: cfg.relayerPool,
        holder: id,
        budgetMs: 25_000,
        onSigned: async ({ txHash, publicKey }) => {
          await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, id))
        },
      },
    )
    if (r.kind === "pending") {
      await db.update(relayLog).set({ status: "pending" }).where(eq(relayLog.id, id))
      return
    }
    const failed = r.outcome.receipts_outcome.some((o) => typeof o.outcome.status === "object" && o.outcome.status && "Failure" in o.outcome.status)
    const times = await blockTimes(deps.rpc, [...new Set(r.outcome.receipts_outcome.map((o) => o.block_hash))])
    const events = trustedEvents(r.outcome, cfg.hubId, cfg.usdcId)
    await db
      .update(relayLog)
      .set({
        status: failed ? "failed" : "executed",
        outcome: failed ? "inner_failed" : "success",
        costYocto: burnt(r.outcome).yocto.toString(),
        events: events.map((e) => ({ standard: e.standard, version: e.version, event: e.event, data: e.data, executor: e.executor, receiptId: e.receiptId })),
        finishedAt: new Date(),
      })
      .where(eq(relayLog.id, id))
    await applyHubEvents(db, { hubId: cfg.hubId, txHash: r.txHash, events, blockTimes: times })
    deps.hub.invalidate(x.pot)
    // X-06: a sync that settles a vote → "approved" / "not approved" / "expired" to the requester
    if (deps.push) await notifyFromEvents(notifyDeps(deps), events, r.txHash).catch(() => undefined)
    // B-05 / D7: scan the retry's receipts like a vote's; if the payout (or the DAO callback) failed, sync
    if (x.op === "retry_payout" && (x.syncAfter || retryPayoutFailed(r.outcome, x.pot, cfg.usdcId)))
      await serverSync(deps, x.pot, x.proposalId, id)
  } catch (e) {
    await db.update(relayLog).set({ status: "failed", reason: e instanceof ApiError ? e.reason : "internal", finishedAt: new Date() }).where(eq(relayLog.id, id))
    await logError({ route: `after:${x.op}`, relayId: id, reason: `${x.op}_failed`, detail: { err: errText(e, 300) } })
  }
}

/**
 * rev4 M-5 + HUB-5: before a close's approval or a Finalize, register every payee that isn't registered on the token, so
 * a payee who unregistered (or never registered) can't make the atomic close fail and keep the Pot Closing. Paid from
 * the separate close budget (server/features/registration.ts); `skipped` = payees we could not try now.
 */
export async function registerClosePayees(deps: RelayDeps, kind: Record<string, unknown>, potId?: string): Promise<PayeeRegistration> {
  return registerPayees(deps, closePayees(kind, deps.cfg.usdcId), potId)
}

/** HUB-5: the payees of a `close_proposed` event this relay produced (hub-trusted), registered ahead of the vote. */
async function registerProposedClosePayees(deps: RelayDeps, c: Classified, potId: string): Promise<void> {
  const ev = c.rawEvents.find((e) => e.standard === "pot" && e.event === "close_proposed")
  const payouts = (ev?.data as { payouts?: { account_id?: unknown }[] } | undefined)?.payouts ?? []
  const payees = payouts.map((p) => p.account_id).filter((a): a is string => typeof a === "string")
  if (payees.length) await registerPayees(deps, payees, potId)
}

async function checkRelayerBalance(deps: RelayDeps): Promise<void> {
  const available = await relayerAvailable(deps.rpc, deps.cfg.relayerAccountId, 60_000)
  const level = sponsorLevel(available, deps.cfg.relayerThresholds)
  if (level === "critical" || level === "empty") await sendAlert(deps.db, "relayer_critical", `relayer available ${available} yocto`)
  else if (level === "low") await sendAlert(deps.db, "relayer_low", `relayer available ${available} yocto`)
}

export { REASON_STATUS }
