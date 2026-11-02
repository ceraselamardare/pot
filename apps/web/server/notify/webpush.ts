// X-06 Web Push sender (api-spec §6.1; kb/notifications.md N2). `web-push` 3.6.7 encrypts (aes128gcm,
// RFC 8291) and builds the request; we send it with fetch (timeout via AbortSignal) so the outcome handling
// stays here. The VAPID `Authorization` header is cached per push-service origin for 1 hour (Apple: don't
// refresh the JWT more often; the JWT itself lives 12 h). Keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY (the client
// subscribes with it), VAPID_PRIVATE_KEY (Secret), VAPID_SUBJECT (a real mailto:/https: URL). Never rotate.
import "server-only"
import webpush from "web-push"
import { errText } from "../util/errtext"

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushOptions {
  /** seconds; always set (the library default is 28 days) */
  ttl: number
  urgency: "very-low" | "low" | "normal" | "high"
  topic?: string
}

export interface PushResult {
  status: number
  retryAfterMs?: number
  error?: string
}

export interface PushSender {
  send(target: PushTarget, json: string, opts: PushOptions): Promise<PushResult>
}

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export function vapidFromEnv(env: Record<string, string | undefined> = process.env): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? env.VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const subject = env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return null
  if (!/^(mailto:|https:\/\/)/.test(subject)) throw new Error("VAPID_SUBJECT must be a mailto: or https: URL (Apple refuses others)")
  return { publicKey, privateKey, subject }
}

const HOUR = 3_600_000

export function createWebPushSender(
  vapid: VapidConfig,
  opts: { fetch?: typeof fetch; timeoutMs?: number; now?: () => number } = {},
): PushSender {
  const doFetch = opts.fetch ?? fetch
  const now = opts.now ?? Date.now
  const auth = new Map<string, { header: string; until: number }>()
  const authFor = (endpoint: string): string => {
    const origin = new URL(endpoint).origin
    const hit = auth.get(origin)
    if (hit && hit.until > now()) return hit.header
    const exp = Math.floor(now() / 1000) + 12 * 3600
    const h = webpush.getVapidHeaders(origin, vapid.subject, vapid.publicKey, vapid.privateKey, "aes128gcm", exp)
    auth.set(origin, { header: h.Authorization, until: now() + HOUR })
    return h.Authorization
  }
  return {
    async send(target, json, o) {
      const details = webpush.generateRequestDetails(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        json,
        {
          vapidDetails: null,
          headers: { Authorization: authFor(target.endpoint) },
          TTL: o.ttl,
          urgency: o.urgency,
          ...(o.topic ? { topic: o.topic } : {}),
          contentEncoding: "aes128gcm",
        } as unknown as webpush.RequestOptions,
      )
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(details.headers)) if (k.toLowerCase() !== "content-length") headers[k] = String(v)
      try {
        const res = await doFetch(details.endpoint, {
          method: details.method,
          headers,
          body: details.body ? new Uint8Array(details.body as Buffer) : undefined,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
        })
        const ra = res.headers.get("retry-after")
        const retryAfterMs = ra ? (/^\d+$/.test(ra) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now())) : undefined
        await res.arrayBuffer().catch(() => undefined)
        return { status: res.status, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
      } catch (e) {
        return { status: 0, error: (e as Error).name === "TimeoutError" ? "timeout" : errText(e, 120) }
      }
    },
  }
}

let cached: PushSender | null | undefined
/** The process-wide sender, or null when VAPID isn't configured (push off). */
export function getPushSender(): PushSender | null {
  if (cached === undefined) {
    try {
      const v = vapidFromEnv()
      cached = v ? createWebPushSender(v) : null
    } catch (e) {
      console.error(JSON.stringify({ level: "error", where: "vapid", err: errText(e, 200) }))
      cached = null
    }
  }
  return cached
}
export function setPushSenderForTests(s: PushSender | null | undefined): void {
  cached = s
}
