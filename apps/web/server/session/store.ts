// Session rows (api-spec §4.2; data-model §2.1): the cookie is 32 random bytes, the DB keeps sha256 only.
// near-auth / wallet / dev: 30 days absolute, 14 days idle (last_seen bumped at most every 15 min).
// demo: the lease's end. A near-auth or dev session whose device is not active is `pending_device`.
import "server-only"
import { and, eq, isNull, sql } from "drizzle-orm"
import type { DbOrTx } from "@/db/client"
import { appUser, demoPot, device, session } from "@/db/schema"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import { b64url, random, sha256Hex } from "../util/crypto"
import { readCookie, sessionCookieName, type SessionHint, emailHint } from "./cookies"

export type SessionKind = (typeof session.$inferSelect)["kind"]
export type AppUser = typeof appUser.$inferSelect
export type Device = typeof device.$inferSelect
export type DemoPotRow = typeof demoPot.$inferSelect

export interface SessionCtx {
  idHash: string
  kind: SessionKind
  expiresAt: Date
  user: AppUser
  device: Device | null
  /** near-auth/dev session whose device isn't active on chain yet (rev4 M-1) */
  pendingDevice: boolean
  visitorHash: string | null
  demo: DemoPotRow | null
}

const DAY = 86_400_000

export async function createSession(
  db: DbOrTx,
  opts: {
    userId: string
    kind: SessionKind
    deviceId?: string | null
    demoPotId?: string | null
    visitorHash?: string | null
    ipHash?: string | null
    userAgent?: string | null
    expiresAt?: Date
  },
): Promise<{ cookieValue: string; idHash: string; expiresAt: Date }> {
  const cookieValue = b64url(random(32))
  const idHash = sha256Hex(cookieValue)
  const now = Date.now()
  const expiresAt = opts.expiresAt ?? new Date(now + 30 * DAY)
  await db.insert(session).values({
    idHash,
    userId: opts.userId,
    kind: opts.kind,
    deviceId: opts.deviceId ?? null,
    demoPotId: opts.demoPotId ?? null,
    visitorHash: opts.visitorHash ?? null,
    ipHash: opts.ipHash ?? null,
    userAgent: opts.userAgent?.slice(0, 300) ?? null,
    expiresAt,
    idleExpiresAt: opts.kind === "demo" ? expiresAt : new Date(now + 14 * DAY),
  })
  return { cookieValue, idHash, expiresAt }
}

export async function loadSession(db: DbOrTx, req: Request, cfg: Config): Promise<SessionCtx | null> {
  const value = readCookie(req, sessionCookieName(cfg)) ?? readCookie(req, "pot_session")
  if (!value || value.length > 100) return null
  const idHash = sha256Hex(value)
  const rows = await db
    .select({ s: session, u: appUser, d: device, p: demoPot })
    .from(session)
    .innerJoin(appUser, eq(appUser.id, session.userId))
    .leftJoin(device, eq(device.id, session.deviceId))
    .leftJoin(demoPot, eq(demoPot.id, session.demoPotId))
    .where(and(eq(session.idHash, idHash), isNull(session.revokedAt)))
    .limit(1)
  const r = rows[0]
  if (!r) return null
  const now = Date.now()
  if (r.s.expiresAt.getTime() <= now || r.s.idleExpiresAt.getTime() <= now) return null
  if (r.s.kind === "demo") {
    // a pool lease must still be held; the shared Pot is never leased exclusively (api-spec §2.8)
    const p = r.p
    const live =
      !!p &&
      (p.kind === "shared"
        ? p.state === "ready" || p.state === "leased"
        : p.kind === "pool" && p.state === "leased" && (!p.leaseUntil || p.leaseUntil.getTime() > now))
    if (!live) return null
  }
  if (r.s.kind !== "demo" && now - r.s.lastSeenAt.getTime() > 15 * 60_000) {
    await db
      .update(session)
      .set({ lastSeenAt: new Date(now), idleExpiresAt: new Date(now + 14 * DAY) })
      .where(eq(session.idHash, idHash))
  }
  const deviceBound = r.s.kind === "near-auth" || r.s.kind === "dev"
  return {
    idHash,
    kind: r.s.kind,
    expiresAt: r.s.expiresAt,
    user: r.u,
    device: r.d,
    pendingDevice: deviceBound && (!r.d || r.d.status !== "active"),
    visitorHash: r.s.visitorHash,
    demo: r.p,
  }
}

export interface RequireOpts {
  kinds?: SessionKind[]
  notDemo?: boolean
  /** rev4: pending_device sessions may only read, add their device and log out */
  activeDevice?: boolean
}

export async function requireSession(db: DbOrTx, req: Request, cfg: Config, opts: RequireOpts = {}): Promise<SessionCtx> {
  const s = await loadSession(db, req, cfg)
  if (!s) throw new ApiError("not_signed_in")
  if (opts.notDemo && s.kind === "demo") throw new ApiError("demo_forbidden")
  if (opts.kinds && !opts.kinds.includes(s.kind)) throw new ApiError("demo_forbidden")
  if (opts.activeDevice && s.pendingDevice) {
    if (s.device?.status === "revoked") throw new ApiError("device_revoked")
    throw new ApiError("device_not_registered", { status: 403 })
  }
  return s
}

export async function revokeSession(db: DbOrTx, idHash: string): Promise<void> {
  await db.update(session).set({ revokedAt: new Date() }).where(eq(session.idHash, idHash))
}

export interface SessionInfo {
  kind: SessionKind
  accountId: string
  displayName: string
  avatarTint: AppUser["avatarTint"]
  emailHint?: string
  expiresAt: string
  usdcRegistered: boolean
  device?: { publicKey: string; status: "active" | "pending" }
  mpcPublicKey?: string
  demo?: { persona: string; potId: string; slug: string; leaseExpiresAt: string; shared: boolean }
}

export function sessionInfo(s: {
  kind: SessionKind
  user: AppUser
  device: Device | null
  expiresAt: Date
  demo?: DemoPotRow | null
}): SessionInfo {
  const info: SessionInfo = {
    kind: s.kind,
    accountId: s.user.nearAccount,
    displayName: s.user.displayName,
    avatarTint: s.user.avatarTint,
    expiresAt: s.expiresAt.toISOString(),
    usdcRegistered: s.user.usdcRegistered,
  }
  const hint = emailHint(s.user.email)
  if (hint) info.emailHint = hint
  if (s.device && (s.kind === "near-auth" || s.kind === "dev"))
    info.device = { publicKey: s.device.publicKey, status: s.device.status === "active" ? "active" : "pending" }
  if (s.kind === "near-auth" && s.user.mpcPublicKey) info.mpcPublicKey = s.user.mpcPublicKey
  if (s.kind === "demo" && s.demo && s.user.persona)
    info.demo = {
      persona: s.user.persona,
      potId: s.demo.potId ?? "",
      slug: s.demo.slug,
      leaseExpiresAt: (s.demo.leaseUntil ?? s.expiresAt).toISOString(),
      shared: s.demo.kind === "shared",
    }
  return info
}

export function hintFor(info: SessionInfo): SessionHint {
  return {
    accountId: info.accountId,
    kind: info.kind,
    displayName: info.displayName,
    ...(info.emailHint ? { emailHint: info.emailHint } : {}),
    ...(info.demo ? { persona: info.demo.persona, leasedPot: info.demo.potId } : {}),
    ...(info.device ? { devicePublicKey: info.device.publicKey } : {}),
  }
}

/** Devices bound to `userId` that are still pending but now on chain become active. */
export async function activateDevice(db: DbOrTx, deviceId: string): Promise<void> {
  await db
    .update(device)
    .set({ status: "active", activatedAt: sql`coalesce(${device.activatedAt}, now())` })
    .where(eq(device.id, deviceId))
}
