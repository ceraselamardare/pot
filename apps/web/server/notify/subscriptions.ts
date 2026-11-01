// X-06 push subscriptions (api-spec §2.6; data-model push_subscription). The server POSTs to the stored
// endpoint, so the host allowlist is an SSRF guard (architecture K-9): only the five push services, https only.
import "server-only"
import { and, asc, eq, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { pushSubscription } from "@/db/schema"
import { ApiError } from "../http/errors"
import type { SessionCtx } from "../session/store"

/** Exact hosts and `*.suffix` wildcards (api-spec §2.6). */
export const PUSH_HOSTS = ["fcm.googleapis.com", "*.push.apple.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "*.notify.windows.com"]

export function pushHostAllowed(endpoint: string, hosts: readonly string[] = PUSH_HOSTS): boolean {
  let u: URL
  try {
    u = new URL(endpoint)
  } catch {
    return false
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false
  const host = u.hostname.toLowerCase()
  return hosts.some((h) => (h.startsWith("*.") ? host.endsWith(h.slice(1)) && host.length > h.length - 1 : host === h))
}

const B64URL = /^[A-Za-z0-9_-]+$/

export interface PushSubInput {
  subscription: { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } }
  standalone: boolean
  platform?: "ios" | "android" | "desktop" | "other"
}

export const MAX_SUBSCRIPTIONS_PER_USER = 10

/**
 * POST /api/push/subscription. Session (not pending_device). Upsert by endpoint (a shared device moves to this
 * user); ≤ 10 per user, oldest out.
 */
export async function saveSubscription(
  db: Db,
  s: SessionCtx,
  input: PushSubInput,
): Promise<{ subscriptionId: string }> {
  if (s.pendingDevice) throw new ApiError("device_not_registered")
  const { endpoint, expirationTime, keys } = input.subscription
  if (endpoint.length > 1024 || !pushHostAllowed(endpoint)) throw new ApiError("args_invalid", { detail: { field: "subscription.endpoint" } })
  if (keys.p256dh.length !== 87 || !B64URL.test(keys.p256dh)) throw new ApiError("args_invalid", { detail: { field: "subscription.keys.p256dh" } })
  if (keys.auth.length !== 22 || !B64URL.test(keys.auth)) throw new ApiError("args_invalid", { detail: { field: "subscription.keys.auth" } })
  const values = {
    userId: s.user.id,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    expirationTime: expirationTime ? new Date(expirationTime) : null,
    standalone: input.standalone,
    platform: input.platform ?? null,
  }
  const [row] = await db
    .insert(pushSubscription)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { ...values, failCount: 0, createdAt: sql`now()` },
    })
    .returning({ id: pushSubscription.id })
  // at most 10 per user: evict the oldest
  const mine = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, s.user.id))
    .orderBy(asc(pushSubscription.createdAt))
  for (const old of mine.slice(0, Math.max(0, mine.length - MAX_SUBSCRIPTIONS_PER_USER)))
    await db.delete(pushSubscription).where(eq(pushSubscription.id, old.id))
  return { subscriptionId: row!.id }
}

/** DELETE /api/push/subscription: only the session user's own row; always 200 (no enumeration). */
export async function deleteSubscription(db: Db, s: SessionCtx, endpoint: string): Promise<void> {
  await db.delete(pushSubscription).where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, s.user.id)))
}
