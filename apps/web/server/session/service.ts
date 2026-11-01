// Session flows (api-spec §2.1): NEAR Auth login with first-login account creation (B-07), device-key
// re-login (K-2), logout. (Wallet sessions: features/wallet/service.ts.) Route handlers stay thin: they parse, call
// these, and set the cookies returned here.
import "server-only"
import { and, eq, sql } from "drizzle-orm"
import type { JWTVerifyGetKey } from "jose"
import type { Db } from "@/db/client"
import { chargeQuotas, nextUtcDay, type QuotaCharge } from "@/db/quota"
import { appUser, device, pushSubscription, TINTS } from "@/db/schema"
import { relayerAvailable, sponsorAllows, sponsorLevel } from "../chain/balance"
import { viewAccessKey, viewAccount, viewFunction } from "../chain/near"
import type { RpcClient } from "../chain/rpc"
import type { Submitter } from "../chain/submitter"
import type { Config } from "../config"
import { ApiError, unavailable } from "../http/errors"
import { limit } from "../quotas"
import { hmacSecret } from "../secrets"
import { cleanDisplayName, defaultDisplayName } from "../util/text"
import { sha256Hex } from "../util/crypto"
import { clearCookie, hintCookie, sessionCookie, sessionCookieName } from "./cookies"
import { checkChallenge, nonceFor, verifyIdToken } from "./idtoken"
import { createAccount, drawAccountId, registerToken } from "./onboard"
import { popMessages, spendProof, verifyPop, type Pop } from "./pop"
import { createSession, hintFor, revokeSession, sessionInfo, type AppUser, type Device, type SessionCtx, type SessionInfo } from "./store"

export interface SessionDeps {
  db: Db
  rpc: RpcClient
  submitter: Submitter
  cfg: Config
  defer: (fn: () => Promise<void>) => void
  jwks?: JWTVerifyGetKey
  /** BotID verdict for new accounts; true = bot */
  isBot?: () => Promise<boolean>
  sleep?: (ms: number) => Promise<void>
}

export interface SessionResult {
  status: number
  body: Record<string, unknown>
  cookies: string[]
}

type KeyKind = "webcrypto" | "fallback"
const sleepDefault = (ms: number) => new Promise((r) => setTimeout(r, ms))

const tintFor = (account: string) => TINTS[parseInt(sha256Hex(account).slice(0, 8), 16) % TINTS.length]!

function cookiesFor(cfg: Config, cookieValue: string, info: SessionInfo, maxAgeSec?: number): string[] {
  return [sessionCookie(cfg, cookieValue, maxAgeSec), hintCookie(cfg, hintFor(info), maxAgeSec)]
}

async function chargeOrQuota(db: Db, charges: QuotaCharge[], family: string) {
  const r = await chargeQuotas(db, charges)
  if (!r.ok)
    throw new ApiError("quota_exceeded", { detail: { family, limit: r.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
}

async function heavyOpAllowed(deps: SessionDeps) {
  const level = sponsorLevel(await relayerAvailable(deps.rpc, deps.cfg.relayerAccountId), deps.cfg.relayerThresholds)
  if (!sponsorAllows(level, "create_account")) throw unavailable("sponsor_low", 60_000)
}

/** Insert the device row, or reuse this user's row for the same key (keys are unique across users). */
async function upsertDevice(db: Db, userId: string, publicKey: string, keyKind: KeyKind, status: "active" | "pending", userAgent: string | null) {
  const existing = (await db.select().from(device).where(eq(device.publicKey, publicKey)).limit(1))[0]
  if (existing) {
    if (existing.userId !== userId) throw new ApiError("bad_request", { detail: { field: "devicePublicKey", why: "in_use" } })
    if (existing.status === "revoked") throw new ApiError("device_revoked")
    if (status === "active" && existing.status !== "active")
      await db.update(device).set({ status: "active", activatedAt: new Date() }).where(eq(device.id, existing.id))
    return { ...existing, status: status === "active" ? "active" : existing.status } as Device
  }
  const [row] = await db
    .insert(device)
    .values({
      userId,
      publicKey,
      keyKind,
      status,
      addedVia: "onboarding",
      userAgent: userAgent?.slice(0, 300) ?? null,
      activatedAt: status === "active" ? new Date() : null,
    })
    .returning()
  return row!
}

// ---------------------------------------------------------------------------------------------
// POST /api/session: NEAR Auth login (D-21), first login creates the account

export interface NearAuthReq {
  idToken: string
  devicePublicKey: string
  keyKind: KeyKind
  challenge?: string
  pop: Pop
  displayName?: string
}

export async function deriveMpcKey(rpc: RpcClient, cfg: Config, sub: string): Promise<string> {
  const path = `jwt#${cfg.nearAuth.issuer}#${sub}`
  const pk = await viewFunction<string>(rpc, cfg.mpc.contract, "derived_public_key", {
    path,
    predecessor: cfg.mpc.predecessor,
    domain_id: cfg.mpc.domainId,
  })
  if (typeof pk !== "string" || !pk.startsWith("ed25519:")) throw unavailable("rpc", 3_000, { why: "mpc_derive" })
  return pk
}

export async function nearAuthLogin(
  deps: SessionDeps,
  body: NearAuthReq,
  meta: { ipHash: string; userAgent: string | null },
): Promise<SessionResult> {
  const { db, cfg } = deps
  // 2. ID token (+ rev4 nonce binding)
  const claims = await verifyIdToken(body.idToken, cfg, { jwks: deps.jwks })
  if (body.challenge || cfg.nearAuth.requireNonce) {
    if (!body.challenge) throw new ApiError("id_token_invalid", { detail: { cause: "nonce" } })
    const bytes = checkChallenge(hmacSecret(), body.challenge)
    if (claims.nonce !== nonceFor(body.devicePublicKey, bytes)) throw new ApiError("id_token_invalid", { detail: { cause: "nonce" } })
    if (!(await spendProof(db, "auth_challenge", sha256Hex(body.challenge))))
      throw new ApiError("id_token_invalid", { detail: { cause: "nonce" } })
  }
  // 3. device PoP
  await verifyPop(db, {
    purpose: "session",
    message: popMessages.session(body.idToken, body.pop.ts),
    publicKey: body.devicePublicKey,
    pop: body.pop,
  })
  let name: string | undefined
  if (body.displayName !== undefined) {
    const n = cleanDisplayName(body.displayName)
    if (!n.ok) throw new ApiError("bad_request", { detail: { field: "displayName", why: n.why } })
    name = n.value
  }

  // 4. returning or new
  let user = (await db.select().from(appUser).where(eq(appUser.authSub, claims.sub)).limit(1))[0]
  if (user && user.onboardState === "ready") return returningLogin(deps, user, body, meta)

  let holdsLease = false
  if (!user) {
    await chargeOrQuota(
      db,
      [
        { subject: `ip:${meta.ipHash}`, action: "accounts_created", amount: 1n, limit: limit("ip_accounts_created") },
        { subject: "global", action: "accounts_created", amount: 1n, limit: limit("global_accounts_created") },
      ],
      "accounts",
    )
    if (deps.isBot && (await deps.isBot())) throw new ApiError("bot_detected")
    await heavyOpAllowed(deps)
    const mpcPk = await deriveMpcKey(deps.rpc, cfg, claims.sub)
    const accountId = await drawAccountId(deps)
    const inserted = await db
      .insert(appUser)
      .values({
        kind: "near-auth",
        authSub: claims.sub,
        nearAccount: accountId,
        mpcPublicKey: mpcPk,
        email: claims.email ?? null,
        emailVerified: claims.emailVerified,
        emailHash: claims.email && claims.emailVerified ? sha256Hex(claims.email.toLowerCase()) : null,
        displayName: name ?? defaultDisplayName(claims.givenName, claims.name),
        avatarTint: tintFor(accountId),
        onboardState: "creating",
        onboardLeaseUntil: sql`now() + interval '30 seconds'` as unknown as Date,
      })
      .onConflictDoNothing({ target: appUser.authSub })
      .returning()
    if (inserted[0]) {
      user = inserted[0]
      holdsLease = true
    } else user = (await db.select().from(appUser).where(eq(appUser.authSub, claims.sub)).limit(1))[0]!
  }
  if (!holdsLease) {
    const claimed = await db.execute(sql`
      UPDATE app_user SET onboard_lease_until = now() + interval '30 seconds'
      WHERE id = ${user!.id} AND onboard_state <> 'ready'
        AND (onboard_lease_until IS NULL OR onboard_lease_until < now())
      RETURNING id`)
    if (claimed.rows.length === 0) {
      // another request is creating this account: wait ≤ 10 s for it
      const sleep = deps.sleep ?? sleepDefault
      for (let i = 0; i < 20; i++) {
        await sleep(500)
        const cur = (await db.select().from(appUser).where(eq(appUser.id, user!.id)).limit(1))[0]
        if (cur?.onboardState === "ready") return returningLogin(deps, cur, body, meta)
      }
      throw new ApiError("onboarding_in_progress", { retryAfterMs: 2_000 })
    }
  }
  return finishOnboarding(deps, user!, body, meta)
}

async function finishOnboarding(deps: SessionDeps, user: AppUser, body: NearAuthReq, meta: { userAgent: string | null }): Promise<SessionResult> {
  const { db, cfg, rpc } = deps
  const accountId = user.nearAccount
  const mpcPk = user.mpcPublicKey ?? (await deriveMpcKey(rpc, cfg, user.authSub!))
  try {
    // resume rules (architecture 3.1): existing account → skip creation; registered → skip registration
    const exists = await viewAccount(rpc, accountId, "optimistic")
    const regP = (async () => {
      if (!cfg.usdcId) return false
      const bal = await viewFunction<unknown>(rpc, cfg.usdcId, "storage_balance_of", { account_id: accountId }).catch(() => null)
      if (bal) return true
      return (await registerToken(deps, accountId)).ok
    })()
    let createTxHash: string | undefined
    if (!exists) createTxHash = await createAccount(deps, accountId, [mpcPk, body.devicePublicKey])
    const deviceOnChain = exists ? !!(await viewAccessKey(rpc, accountId, body.devicePublicKey, "optimistic")) : true
    // registration may finish in after() when it is slower than the creation
    const registered = await Promise.race([regP, new Promise<null>((r) => setTimeout(() => r(null), 3_000))]).catch(() => false)
    if (registered === null)
      deps.defer(async () => {
        const ok = await regP.catch(() => false)
        if (ok) await db.update(appUser).set({ usdcRegistered: true }).where(eq(appUser.id, user.id))
      })
    const [ready] = await db
      .update(appUser)
      .set({ onboardState: "ready", onboardLeaseUntil: null, mpcPublicKey: mpcPk, usdcRegistered: registered === true, updatedAt: new Date() })
      .where(eq(appUser.id, user.id))
      .returning()
    const dev = await upsertDevice(db, user.id, body.devicePublicKey, body.keyKind, deviceOnChain ? "active" : "pending", meta.userAgent)
    const s = await createSession(db, { userId: user.id, kind: "near-auth", deviceId: dev.id, userAgent: meta.userAgent })
    const info = sessionInfo({ kind: "near-auth", user: ready!, device: dev, expiresAt: s.expiresAt })
    return {
      status: 200,
      cookies: cookiesFor(cfg, s.cookieValue, info),
      body: {
        accountId,
        isNew: true,
        deviceOnChain,
        usdcRegistered: ready!.usdcRegistered,
        mpcPublicKey: mpcPk,
        session: info,
        ...(createTxHash ? { createTxHash } : {}),
      },
    }
  } catch (e) {
    await db.update(appUser).set({ onboardState: "failed", onboardLeaseUntil: null }).where(eq(appUser.id, user.id))
    throw e
  }
}

async function returningLogin(deps: SessionDeps, user: AppUser, body: NearAuthReq, meta: { userAgent: string | null }): Promise<SessionResult> {
  const { db, cfg, rpc } = deps
  const ak = await viewAccessKey(rpc, user.nearAccount, body.devicePublicKey, "optimistic")
  const deviceOnChain = !!ak && ak.permission === "FullAccess"
  const dev = await upsertDevice(db, user.id, body.devicePublicKey, body.keyKind, deviceOnChain ? "active" : "pending", meta.userAgent)
  const s = await createSession(db, { userId: user.id, kind: "near-auth", deviceId: dev.id, userAgent: meta.userAgent })
  const info = sessionInfo({ kind: "near-auth", user, device: dev, expiresAt: s.expiresAt })
  return {
    status: 200,
    cookies: cookiesFor(cfg, s.cookieValue, info),
    body: {
      accountId: user.nearAccount,
      isNew: false,
      deviceOnChain,
      usdcRegistered: user.usdcRegistered,
      mpcPublicKey: user.mpcPublicKey,
      session: info,
    },
  }
}

// ---------------------------------------------------------------------------------------------
// POST /api/session/device: device-key re-login (K-2)

export async function deviceLogin(
  deps: SessionDeps,
  body: { accountId: string; devicePublicKey: string; pop: Pop },
  meta: { userAgent: string | null },
): Promise<SessionResult> {
  const { db, cfg, rpc } = deps
  await verifyPop(db, {
    purpose: "device_login",
    message: popMessages.device_login(body.accountId, body.pop.ts),
    publicKey: body.devicePublicKey,
    pop: body.pop,
  })
  const rows = await db
    .select({ d: device, u: appUser })
    .from(device)
    .innerJoin(appUser, eq(appUser.id, device.userId))
    .where(and(eq(device.publicKey, body.devicePublicKey), eq(appUser.nearAccount, body.accountId)))
    .limit(1)
  const r = rows[0]
  if (!r || r.u.kind !== "near-auth") throw new ApiError("device_not_registered")
  if (r.d.status === "revoked") throw new ApiError("device_revoked")
  if (r.d.status !== "active") throw new ApiError("device_not_registered")
  const ak = await viewAccessKey(rpc, body.accountId, body.devicePublicKey, "optimistic")
  if (!ak || ak.permission !== "FullAccess") {
    await db.update(device).set({ status: "revoked", revokedAt: new Date() }).where(eq(device.id, r.d.id))
    throw new ApiError("device_not_registered")
  }
  const s = await createSession(db, { userId: r.u.id, kind: "near-auth", deviceId: r.d.id, userAgent: meta.userAgent })
  const info = sessionInfo({ kind: "near-auth", user: r.u, device: r.d, expiresAt: s.expiresAt })
  return { status: 200, cookies: cookiesFor(cfg, s.cookieValue, info), body: { session: info } }
}

// ---------------------------------------------------------------------------------------------
// DELETE /api/session

export async function logout(
  db: Db,
  cfg: Config,
  s: SessionCtx,
  body: { pushEndpoint?: string; forgetDevice?: boolean },
): Promise<string[]> {
  await revokeSession(db, s.idHash)
  if (body.pushEndpoint)
    await db
      .delete(pushSubscription)
      .where(and(eq(pushSubscription.endpoint, body.pushEndpoint), eq(pushSubscription.userId, s.user.id)))
  if (body.forgetDevice && s.device)
    await db.update(device).set({ status: "revoked", revokedAt: new Date() }).where(eq(device.id, s.device.id))
  return [clearCookie(cfg, sessionCookieName(cfg)), clearCookie(cfg, "pot_hint")]
}
