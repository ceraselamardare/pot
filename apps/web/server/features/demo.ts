// Demo mode (X-08; api-spec §2.8, §7; D-33; rev4 S-5 / review-security H-5):
//  - POST /api/demo/session: visitor cookie, reset, reuse the visitor's lease or lease a ready pool Pot with
//    FOR UPDATE SKIP LOCKED, fall back to the shared Pot; BotID and 10 new leases/day per IPv4 or IPv6 /64
//    only for NEW leases; a persona switch is a new demo session row for the same Pot.
//  - Demo intents in /api/relay: the reference Pot is refused first, the Pot must be the lease's, the shared
//    Pot can't be closed or have its rules changed; the server signs with DEMO_PERSONA_KEY under the
//    `demo_signer:{account}` lease, then the normal pipeline runs (serverSigned).
import "server-only"
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm"
import { buildCall, intentFromWire } from "@pot/sdk"
import type { ActionIntentWire } from "@pot/sdk"
import { toNearActions } from "@pot/sdk/sign"
import { buildDelegateAction, encodeSignedDelegate, KeyPairSigner, PublicKey, type Action } from "near-api-js"
import type { Db } from "@/db/client"
import { claimNamedLease, releaseLease, setLastNonce } from "@/db/lease"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { appUser, demoPot, PERSONAS } from "@/db/schema"
import type { HubReader } from "../chain/hub"
import type { PoolKey } from "../chain/keys"
import { block, viewAccessKey } from "../chain/near"
import type { RpcClient } from "../chain/rpc"
import type { Config } from "../config"
import { ApiError, unavailable } from "../http/errors"
import { limit } from "../quotas"
import { relay, type RelayDeps, type RelayResponse } from "../relay/pipeline"
import { visitorCookie, hintCookie, sessionCookie } from "../session/cookies"
import { createSession, hintFor, sessionInfo, type SessionCtx } from "../session/store"
import { b64url, hmacHex, random, safeEqual, sha256Hex } from "../util/crypto"

export type Persona = (typeof PERSONAS)[number]
const PERSONA_TINT = { maya: "peach", sam: "sage", leo: "mist" } as const
const PERSONA_NAME = { maya: "Maya", sam: "Sam", leo: "Leo" } as const
const LEASE_MS = 2 * 3600_000
/** How long a persona delegate waits for the persona's signer lease before 409 nonce_pending (B-19). */
const PERSONA_QUEUE_MS = 25_000
const LEASE_MAX_MS = 8 * 3600_000

// ---------------------------------------------------------------------------------------------
// visitor cookie: v1.<16 random bytes b64url>.<HMAC>

export function newVisitorId(secret: string): string {
  const id = b64url(random(16))
  return `v1.${id}.${hmacHex(secret, `visitor|${id}`).slice(0, 32)}`
}
export function verifyVisitorId(secret: string, value: string | null): string | null {
  if (!value) return null
  const [v, id, mac] = value.split(".")
  if (v !== "v1" || !id || !mac) return null
  const want = hmacHex(secret, `visitor|${id}`).slice(0, 32)
  return safeEqual(Buffer.from(want), Buffer.from(mac)) ? id : null
}
export const visitorHashOf = (secret: string, id: string) => hmacHex(secret, `visitor-hash|${id}`).slice(0, 32)

// ---------------------------------------------------------------------------------------------

export interface DemoSessionDeps {
  db: Db
  cfg: Config
  secret: string
  /** BotID verdict for a NEW lease; true = bot */
  isBot: () => Promise<boolean>
  /** start(refillDemoPool) when fewer than 3 are ready (B-12); optional */
  refill?: () => Promise<void>
}

export type DemoSessionResult =
  | { kind: "json"; status: number; body: Record<string, unknown>; cookies: string[] }
  | { kind: "redirect"; location: string; cookies: string[] }

type DemoPotRow = typeof demoPot.$inferSelect

export async function demoSession(
  deps: DemoSessionDeps,
  input: { persona?: Persona; reset?: boolean; form: boolean; visitorCookie: string | null; ipnetHash: string; userAgent: string | null },
): Promise<DemoSessionResult> {
  const { db, cfg, secret } = deps
  if (!cfg.flags.demo) throw new ApiError("not_found")
  const cookies: string[] = []
  let visitorId = verifyVisitorId(secret, input.visitorCookie)
  if (!visitorId) {
    const v = newVisitorId(secret)
    visitorId = v.split(".")[1]!
    cookies.push(visitorCookie(cfg, v))
  }
  const visitorHash = visitorHashOf(secret, visitorId)
  const readOnly = (status: number, reason: "bot_detected" | "quota_exceeded", detail?: Record<string, unknown>): DemoSessionResult => {
    if (input.form) return { kind: "redirect", location: "/demo/live?ro=1", cookies }
    throw new ApiError(reason, { status, detail })
  }

  if (input.reset) {
    const q = await chargeQuotas(db, [{ subject: `visitor:${visitorHash}`, action: "demo_reset", amount: 1n, limit: limit("visitor_reset") }])
    if (!q.ok) return readOnly(429, "quota_exceeded", { family: "lease", resetsAt: nextUtcDay().toISOString() })
    await db
      .update(demoPot)
      .set({ state: "retired", retiredAt: new Date() })
      .where(and(eq(demoPot.leasedTo, visitorHash), eq(demoPot.state, "leased"), eq(demoPot.kind, "pool")))
  }

  // reuse the visitor's active lease (persona switch: no BotID, no lease quota)
  let lease: DemoPotRow | undefined = (
    await db
      .select()
      .from(demoPot)
      .where(and(eq(demoPot.leasedTo, visitorHash), eq(demoPot.state, "leased"), gt(demoPot.leaseUntil, new Date())))
      .limit(1)
  )[0]
  let shared = false
  if (lease) {
    const ext = await db.execute<{ lease_until: Date }>(sql`
      UPDATE demo_pot SET lease_until = LEAST(leased_at + interval '8 hours', now() + interval '2 hours')
      WHERE id = ${lease.id} RETURNING lease_until`)
    lease = { ...lease, leaseUntil: new Date(ext.rows[0]?.lease_until ?? lease.leaseUntil!) }
  } else {
    if (await deps.isBot()) return readOnly(403, "bot_detected")
    const q = await chargeQuotas(db, [{ subject: `ipnet:${input.ipnetHash}`, action: "lease", amount: 1n, limit: limit("ipnet_lease") }])
    if (!q.ok) return readOnly(429, "quota_exceeded", { family: "lease", resetsAt: nextUtcDay().toISOString() })
    const res = await db.execute<DemoPotRow & Record<string, unknown>>(sql`
      UPDATE demo_pot
      SET state = 'leased', leased_to = ${visitorHash}, leased_at = now(), lease_until = now() + interval '2 hours'
      WHERE id = (SELECT id FROM demo_pot
                  WHERE kind = 'pool' AND state = 'ready'
                  ORDER BY seeded_at LIMIT 1
                  FOR UPDATE SKIP LOCKED)
      RETURNING id`)
    const id = res.rows[0]?.id as string | undefined
    if (id) lease = (await db.select().from(demoPot).where(eq(demoPot.id, id)).limit(1))[0]
    else {
      lease = (
        await db
          .select()
          .from(demoPot)
          .where(and(eq(demoPot.kind, "shared"), inArray(demoPot.state, ["ready", "leased"])))
          .orderBy(desc(demoPot.createdAt))
          .limit(1)
      )[0]
      shared = true
      if (!lease) throw unavailable("maintenance", 60_000, { why: "no_demo_pot" })
    }
    if (deps.refill) {
      const ready = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM demo_pot WHERE kind = 'pool' AND state = 'ready'`)
      if ((ready.rows[0]?.n ?? 0) < 3) await deps.refill().catch(() => undefined)
    }
  }
  if (!lease || !lease.potId) throw unavailable("maintenance", 60_000, { why: "demo_pot_not_ready" })
  shared = shared || lease.kind === "shared"

  const persona: Persona = input.persona ?? "maya"
  const personas = lease.personas as Partial<Record<Persona, string>>
  const account = personas[persona]
  if (!account) throw new ApiError("demo_forbidden", { detail: { persona } })
  const user = await ensurePersonaUser(db, account, persona)
  const expiresAt = shared ? new Date(Date.now() + LEASE_MS) : (lease.leaseUntil ?? new Date(Date.now() + LEASE_MS))
  const s = await createSession(db, {
    userId: user.id,
    kind: "demo",
    demoPotId: lease.id,
    visitorHash,
    userAgent: input.userAgent,
    expiresAt,
  })
  const info = sessionInfo({ kind: "demo", user, device: null, expiresAt, demo: lease })
  const maxAge = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  cookies.push(sessionCookie(cfg, s.cookieValue, maxAge), hintCookie(cfg, hintFor(info), maxAge))
  if (input.form) return { kind: "redirect", location: `/p/${lease.slug}`, cookies }
  return {
    kind: "json",
    status: 200,
    cookies,
    body: { session: info, lease: { potId: lease.potId, slug: lease.slug, expiresAt: expiresAt.toISOString(), shared } },
  }
}

export async function ensurePersonaUser(db: Db, account: string, persona: Persona) {
  const found = (await db.select().from(appUser).where(eq(appUser.nearAccount, account)).limit(1))[0]
  if (found) return found
  await db
    .insert(appUser)
    .values({
      kind: "demo",
      nearAccount: account,
      persona,
      displayName: PERSONA_NAME[persona],
      avatarTint: PERSONA_TINT[persona],
      usdcRegistered: true,
    })
    .onConflictDoNothing()
  return (await db.select().from(appUser).where(eq(appUser.nearAccount, account)).limit(1))[0]!
}

// ---------------------------------------------------------------------------------------------
// demo intents (B-08 scope; the reference-Pot refusal and shared-Pot rules are rev4 S-5).
// The body carries @pot/sdk's ActionIntentWire; the call is @pot/sdk's buildCall, so a demo relay is
// byte-for-byte the delegate the client would have signed.

export type DemoIntent = Exclude<ActionIntentWire, { type: "add_device_key" }>

/** ActionIntentWire → near-api-js actions for the persona's delegate. */
export function buildDemoCall(intent: DemoIntent, cfg: Config): { receiverId: string; actions: Action[]; intent: string; requestRef?: string } {
  let call
  try {
    call = buildCall(intentFromWire(intent as ActionIntentWire), { hubId: cfg.hubId as never, usdcId: cfg.usdcId as never })
  } catch {
    throw new ApiError("bad_request", { detail: { field: "demo.intent" } })
  }
  return {
    receiverId: call.receiverId,
    actions: toNearActions(call),
    intent: intent.type,
    ...(intent.type === "request_spend" ? { requestRef: intent.requestRef } : {}),
  }
}

/** api-spec §2.3 demo checks, in order (rev4): reference Pot first; the lease's Pot; shared-Pot limits. */
export async function checkDemoIntent(intent: DemoIntent, s: SessionCtx, cfg: Config, hub: HubReader): Promise<void> {
  const pot = "pot" in intent ? intent.pot : null
  if (pot && cfg.demoReferencePot && pot === cfg.demoReferencePot) throw new ApiError("demo_forbidden", { detail: { why: "reference_pot" } })
  if (!s.demo || !s.user.persona) throw new ApiError("demo_forbidden")
  if (pot && pot !== s.demo.potId) {
    // a Pot the persona created itself is allowed
    const v = await hub.getPot(pot).catch(() => null)
    if (!v || v.creator !== s.user.nearAccount) throw new ApiError("demo_forbidden", { detail: { why: "not_leased_pot" } })
  }
  if (s.demo.kind === "shared" && pot && pot === s.demo.potId) {
    if (intent.type === "propose_close" || intent.type === "propose_rules" || intent.type === "set_rules")
      throw new ApiError("demo_forbidden", { detail: { why: "shared_pot" } })
    if (intent.type === "vote") {
      const subj = await hub.getProposalSubject(pot, intent.proposalId).catch(() => null)
      if (subj && (subj.kind === "close" || subj.kind === "rules")) throw new ApiError("demo_forbidden", { detail: { why: "shared_pot" } })
    }
  }
}

export async function demoRelay(
  deps: RelayDeps & { personaKey: PoolKey | undefined; rpc: RpcClient },
  s: SessionCtx,
  body: { demo: { intent: DemoIntent }; idempotencyKey: string },
  meta: { requestId: string; ipnetHash: string; bodyHash: string },
): Promise<RelayResponse> {
  const { cfg, hub, db } = deps
  const intent = body.demo.intent
  await checkDemoIntent(intent, s, cfg, hub)
  // extend the lease on activity (up to 8 h after it started)
  if (s.demo?.kind === "pool")
    await db.execute(sql`
      UPDATE demo_pot SET lease_until = LEAST(leased_at + ${`${LEASE_MAX_MS / 1000} seconds`}::interval, now() + interval '2 hours')
      WHERE id = ${s.demo.id}`)
  return personaRelay(
    deps,
    {
      userId: s.user.id,
      accountId: s.user.nearAccount,
      visitorHash: s.visitorHash ?? sha256Hex(s.idHash).slice(0, 32),
      ipnetHash: meta.ipnetHash,
    },
    intent,
    { requestId: meta.requestId, idempotencyKey: body.idempotencyKey, bodyHash: meta.bodyHash },
  )
}

/**
 * Signs `intent` as a demo persona with DEMO_PERSONA_KEY (nonce serialized under the `demo_signer:{account}`
 * lease) and runs the relay pipeline from step 4 (serverSigned). Used by demo sessions and by the seeder
 * (B-08 seedDemoPot), so a seeded Pot goes through exactly the path a visitor's actions take.
 */
export async function personaRelay(
  deps: RelayDeps & { personaKey: PoolKey | undefined; rpc: RpcClient; personaQueueMs?: number },
  persona: { userId: string; accountId: string; visitorHash: string; ipnetHash: string },
  intent: DemoIntent,
  meta: { requestId: string; idempotencyKey: string; bodyHash: string },
): Promise<RelayResponse> {
  const { db, cfg } = deps
  if (!deps.personaKey) throw unavailable("maintenance", 60_000, { why: "no_persona_key" })
  const call = buildDemoCall(intent, cfg)
  const account = persona.accountId
  const leaseName = `demo_signer:${account}`
  const holder = meta.requestId
  // B-19 (wave 3): a persona's delegates are serialized (one nonce at a time). Several sessions on one lease
  // (persona switches, judges double-tapping) used to get 409 nonce_pending after 3 s; now they queue for up
  // to PERSONA_QUEUE_MS, and the lease is freed as soon as the chain shows this delegate's nonce (≈ 1 block
  // after inclusion), not when the whole relay (early answer or receipt tree) is done.
  let got = false
  const queueUntil = Date.now() + (deps.personaQueueMs ?? PERSONA_QUEUE_MS)
  for (let i = 0; !got; i++) {
    got = await claimNamedLease(db, leaseName, holder, 30)
    if (got) break
    if (Date.now() >= queueUntil) throw new ApiError("nonce_pending", { retryAfterMs: 2_000 })
    await (deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))))(Math.min(150 + i * 25, 400))
  }
  let held = true
  const free = async () => {
    if (!held) return
    held = false
    await releaseLease(db, leaseName, holder).catch(() => undefined)
  }
  try {
    const pk = deps.personaKey.publicKey
    const [ak, head, last] = await Promise.all([
      viewAccessKey(deps.rpc, account, pk, "optimistic"),
      block(deps.rpc, { finality: "final" }),
      db.execute<{ last: string | null }>(sql`SELECT meta->>'lastNonce' AS last FROM lease WHERE name = ${leaseName}`),
    ])
    if (!ak) throw new ApiError("key_not_found")
    // above both the chain's nonce and the last one this lease signed (RPC nodes behind one URL can lag)
    const lastSigned = last.rows[0]?.last && /^[0-9]+$/.test(last.rows[0].last) ? BigInt(last.rows[0].last) : 0n
    const nonce = (ak.nonce > lastSigned ? ak.nonce : lastSigned) + 1n
    await setLastNonce(db, leaseName, holder, nonce)
    const da = buildDelegateAction({
      senderId: account,
      receiverId: call.receiverId,
      actions: call.actions,
      nonce,
      maxBlockHeight: BigInt(head.height + 200),
      publicKey: PublicKey.from(pk),
    })
    const { signedDelegate } = await new KeyPairSigner(deps.personaKey.keyPair).signDelegateAction(da)
    const b64 = Buffer.from(encodeSignedDelegate(signedDelegate)).toString("base64")
    // watch the persona's key: once its nonce reaches ours the next delegate can be signed (real timers: the
    // watcher must never spin on a test's instant sleep)
    void (async () => {
      while (held) {
        await new Promise((r) => setTimeout(r, 400))
        if (!held) return
        const now = await viewAccessKey(deps.rpc, account, pk, "optimistic").catch(() => null)
        if (now && now.nonce >= nonce) return free()
      }
    })()
    return await relay(
      deps,
      {
        userId: persona.userId,
        accountId: account,
        kind: "demo",
        device: null,
        demo: { visitorHash: persona.visitorHash, ipnetHash: persona.ipnetHash },
      },
      {
        requestId: meta.requestId,
        signedDelegate: b64,
        idempotencyKey: meta.idempotencyKey,
        intent: call.intent,
        requestRef: call.requestRef,
        bodyHash: meta.bodyHash,
        serverSigned: true,
      },
    )
  } finally {
    await free()
  }
}
