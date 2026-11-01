// The relay pipeline (api-spec §3.2 steps 3-17). Cheapest and stateless first; no quota is consumed before
// step 12 and nothing is signed before step 15. Rejections after the decode are recorded as `rejected`
// relay_log rows WITHOUT the idempotency key or delegate hash, so a corrected retry is never blocked.
import "server-only"
import { and, eq, sql } from "drizzle-orm"
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
import { hubAllowsCreate } from "../ops/balances"
import { limit } from "../quotas"
import { newRelayId } from "../util/crypto"
import { classify, retryPayoutFailed, type Classified } from "./classify"
import { kindsEqual, type ProposalKind } from "@pot/sdk"
import { decodeSignedDelegate, verifyDelegateSignature, type DecodedDelegate } from "./decode"
import { burnt, trustedEvents } from "../chain/outcome"
import { registerToken } from "../session/onboard"
import { applyHubEvents, upsertPotRow } from "./effects"
import { evaluatePolicy, TGAS, type PolicyMatch } from "./policy"
import type { RelayOk, RelayPending, RelayResult } from "./types"

export interface RelayDeps {
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
}

export interface RelayRequest {
  requestId: string
  signedDelegate: string
  idempotencyKey: string
  intent?: string
  requestRef?: string
  bodyHash: string
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

function mapRpc<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  })
}

// ---------------------------------------------------------------------------------------------
// step 10: chain reads

interface ChainContext {
  head: number
  potView: PotView | null
}

async function chainChecks(deps: RelayDeps, actor: Actor, d: DecodedDelegate, m: PolicyMatch): Promise<ChainContext> {
  const { rpc, hub, db } = deps
  const now = deps.now?.() ?? Date.now()
  const inflightP = db.execute<{ max: string | null }>(sql`
    SELECT max(delegate_nonce)::text AS max FROM relay_log
    WHERE sender_id = ${d.senderId} AND delegate_public_key = ${d.publicKey}
      AND status IN ('validated', 'signed', 'submitted', 'pending')`)
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
  if (d.maxBlockHeight > h + 600n)
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
  const maxInflight = inflight.rows[0]?.max
  if (maxInflight !== null && maxInflight !== undefined && d.nonce <= BigInt(maxInflight))
    throw new ApiError("nonce_pending", { retryAfterMs: 2_000 })

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
  }
  if (m.rule === "R11") await r11Preflight(deps, actor, m, potView!, now)
  return { head: head.height, potView }
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

function quotaCharges(actor: Actor, m: PolicyMatch): QuotaCharge[] {
  const user = `user:${actor.userId}`
  const c: QuotaCharge[] = [
    { subject: user, action: "burst", amount: 1n, limit: limit("user_burst"), period: "minute", tag: "burst" },
    { subject: user, action: m.family, amount: 1n, limit: limit(`user_${m.family}`), tag: `family:${m.family}` },
  ]
  if (m.potId && ["contribute", "spend", "vote", "close"].includes(m.family))
    c.push({ subject: `pot:${m.potId}`, action: m.family, amount: 1n, limit: limit(`pot_${m.family}`), tag: `family:${m.family}` })
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
  c.push({ subject: user, action: "relay_yocto", amount: m.estYocto, limit: limit("user_relay_yocto"), tag: "budget" })
  if (m.hubYocto > 0n) {
    c.push({ subject: user, action: "hub_yocto", amount: m.hubYocto, limit: limit("user_hub_yocto"), tag: "budget" })
    c.push({ subject: "global", action: "hub_yocto", amount: m.hubYocto, limit: limit("global_hub_yocto"), tag: "global_cap" })
  }
  return c
}

async function chargeOrThrow(deps: RelayDeps, actor: Actor, m: PolicyMatch): Promise<QuotaCharge[]> {
  const r = await deps.db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM relay_log
    WHERE user_id = ${actor.userId} AND outcome = 'delegate_failed'
      AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')`)
  if ((r.rows[0]?.n ?? 0) > 10) throw new ApiError("user_suspended", { detail: { resetsAt: nextUtcDay().toISOString() } })
  const charges = quotaCharges(actor, m)
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
  const family = f.tag === "budget" ? "budget" : (f.tag ?? "family:other").replace("family:", "")
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
    // 11. sponsor health
    const level = sponsorLevel(
      await mapRpc(relayerAvailable(deps.rpc, cfg.relayerAccountId)),
      cfg.relayerThresholds,
    )
    if (!sponsorAllows(level, m.rule === "R2" ? "create_pot" : "relay")) throw unavailable("sponsor_low", 60_000)
    // B-11: the hub sponsors create_pot (float + storage); refuse before it would panic ERR_HUB_LOW_BALANCE
    if (m.rule === "R2" && !(await hubAllowsCreate(deps.rpc, cfg))) throw unavailable("sponsor_low", 60_000, { account: "hub" })
    // 12. quotas (one transaction, all or nothing)
    await chargeOrThrow(deps, actor, m)
    if (chain.potView) await upsertPotRow(db, cfg.hubId, chain.potView).catch(() => undefined)
    if (m.rule === "R11" && m.vote!.action !== "VoteReject" && (m as PolicyMatch & { subjectKind?: string }).subjectKind === "close")
      await registerClosePayees(deps, m.vote!.kind)
  } catch (e) {
    if (e instanceof ApiError) await recordRejected(deps, actor, req, d, m, e)
    throw e
  }

  // 13. record
  const relayId = newRelayId()
  try {
    await db.insert(relayLog).values({
      id: relayId,
      requestId: req.requestId,
      userId: actor.userId,
      idempotencyKey: req.idempotencyKey,
      bodyHash: req.bodyHash,
      op: "relay",
      intent: m.intent,
      senderId: d.senderId,
      receiverId: d.receiverId,
      methods: m.methods,
      potId: m.potId,
      delegateHash: d.hash,
      delegatePublicKey: d.publicKey,
      delegateNonce: d.nonce.toString(),
      maxBlockHeight: Number(d.maxBlockHeight),
      status: "validated",
      estYocto: m.estYocto.toString(),
      result: { __match: snapshotMatch(m) },
    })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // a concurrent duplicate (same key or same bytes): return its result
    const other = (await findByKey(db, actor.userId, req.idempotencyKey)) ?? (await findByHash(db, d.hash))
    if (other) return replay(deps, other, req.requestId, other.idempotencyKey === req.idempotencyKey ? req.bodyHash : null)
    throw e
  }

  return submitAndClassify(deps, actor, req, d, m, relayId, chain?.potView ?? null)
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
    logError({ route: "/api/relay", relayId: x.relayId, reason: "feed_write", detail: { err: String(e).slice(0, 300) } }),
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
  // B-05 / D7: a relayed retry_payout whose payout failed again → sync (the hub said `approved` optimistically)
  if (c.outcome !== "delegate_failed" && m.rule === "R9" && m.retry && c.payoutFailed)
    tasks.push(serverSync(deps, m.potId!, m.retry.proposalId, x.relayId))
  // B-05: new money may cover an approved payout that failed for lack of balance → retry_payout
  if (c.outcome === "success" && m.rule === "R1" && m.potId) tasks.push(retryFailedPayouts(deps, m.potId, x.relayId))
  tasks.push(checkRelayerBalance(deps))
  // X-06: "money arrived", "needs your approval", "Pot closed" from this tx's trusted hub events
  if (c.outcome !== "delegate_failed" && deps.push) tasks.push(notifyFromEvents(notifyDeps(deps), c.rawEvents, x.txHash))
  await Promise.allSettled(tasks)
}

const notifyDeps = (deps: RelayDeps) => ({ db: deps.db, hub: deps.hub, cfg: deps.cfg, sender: deps.push ?? null })

/** A relayer-signed hub.sync (permissionless, idempotent); relay_log op `sync`. */
export function serverSync(deps: RelayDeps, pot: string, proposalId: number, cause: string): Promise<void> {
  return serverHubCall(deps, { op: "sync", method: "sync", pot, proposalId, gasTgas: 50n, cause })
}

/** A relayer-signed hub.retry_payout (the caller charges the ≤ 3/proposal/day finalize quota). */
export function serverRetryPayout(deps: RelayDeps, pot: string, proposalId: number, cause: string): Promise<void> {
  return serverHubCall(deps, { op: "retry_payout", method: "retry_payout", pot, proposalId, gasTgas: 100n, cause })
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
  x: { op: "sync" | "retry_payout"; method: string; pot: string; proposalId: number; gasTgas: bigint; cause: string },
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
    if (x.op === "retry_payout" && retryPayoutFailed(r.outcome, x.pot, cfg.usdcId)) await serverSync(deps, x.pot, x.proposalId, id)
  } catch (e) {
    await db.update(relayLog).set({ status: "failed", reason: e instanceof ApiError ? e.reason : "internal", finishedAt: new Date() }).where(eq(relayLog.id, id))
    await logError({ route: `after:${x.op}`, relayId: id, reason: `${x.op}_failed`, detail: { err: String(e).slice(0, 300) } })
  }
}

/**
 * rev4 M-5: before a close's deciding vote or a Finalize, register every payee that isn't registered on the
 * token (registration-only storage_deposit, once per account ever), so a payee who unregistered can't make
 * the atomic close fail and keep the Pot Closing.
 */
export async function registerClosePayees(deps: RelayDeps, kind: Record<string, unknown>): Promise<string[]> {
  const fc = (kind.FunctionCall ?? {}) as { receiver_id?: string; actions?: { method_name?: string; args?: string }[] }
  if (fc.receiver_id !== deps.cfg.usdcId) return []
  const payees = new Set<string>()
  for (const a of fc.actions ?? []) {
    if (a.method_name !== "ft_transfer" || !a.args) continue
    try {
      const args = JSON.parse(Buffer.from(a.args, "base64").toString("utf8")) as { receiver_id?: string }
      if (args.receiver_id) payees.add(args.receiver_id)
    } catch {
      // not a payout action
    }
  }
  const registered: string[] = []
  for (const p of [...payees].slice(0, 40)) {
    const bal = await deps.hub.storageBalanceOf(deps.cfg.usdcId, p).catch(() => ({}) as never)
    if (bal) continue
    const q = await chargeQuotas(deps.db, [{ subject: "global", action: "registrations", amount: 1n, limit: limit("global_registrations") }])
    if (!q.ok) break
    const r = await registerToken(deps, p).catch(() => ({ ok: false }))
    if (r.ok) registered.push(p)
  }
  return registered
}

async function checkRelayerBalance(deps: RelayDeps): Promise<void> {
  const available = await relayerAvailable(deps.rpc, deps.cfg.relayerAccountId, 60_000)
  const level = sponsorLevel(available, deps.cfg.relayerThresholds)
  if (level === "critical" || level === "empty") await sendAlert(deps.db, "relayer_critical", `relayer available ${available} yocto`)
  else if (level === "low") await sendAlert(deps.db, "relayer_low", `relayer available ${available} yocto`)
}

export { REASON_STATUS }
