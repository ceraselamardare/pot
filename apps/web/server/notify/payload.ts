// X-06 Declarative Web Push payload (api-spec §6.2; D-42, D-51; kb/notifications.md N2). One JSON for every
// browser: Safari 18.4+ shows it without the service worker; Chrome/Firefox run the SW's `push` handler on the
// same JSON. `JSON.stringify(payload)` must be ≤ 2,500 bytes (Firefox Android's FCM bridge caps the plaintext
// at 2,641 B, and web-push does not check). Bodies never carry Pot balances, account ids or tx hashes (Q-5).
import type * as Api from "@pot/sdk/api"
import { createHash } from "node:crypto"

export const MAX_PAYLOAD_BYTES = 2_500

export type PushPayload = Api.PushPayload
export type NotificationType = Api.NotificationType

/** `topic(pot, x)` = "r" + base64url(sha256(pot + ":" + x))[0..20]: 21 URL-safe chars (Apple's limit is 32). */
export function topic(pot: string, x: string | number): string {
  return `r${createHash("sha256").update(`${pot}:${x}`).digest("base64url").slice(0, 20)}`
}

export interface PayloadInput {
  type: NotificationType
  title: string
  body?: string
  /** absolute URL on the app's origin (https in every hosted env) */
  navigate: string
  tag?: string
  /** open approvals; sent only with approval_needed / request_resolved (both places: WebKit moved it top level) */
  badge?: number
  data?: Record<string, unknown>
}

const bytes = (s: string) => Buffer.byteLength(s, "utf8")

/** Cut to `max` UTF-8 bytes on a code-point boundary, with an ellipsis. */
function cut(s: string, max: number): string {
  if (bytes(s) <= max) return s
  let out = ""
  for (const ch of s) {
    if (bytes(out + ch) > max - 3) break
    out += ch
  }
  return `${out}…`
}

/**
 * Build the payload JSON (≤ 2,500 B). Over budget: the body is shortened first, then `data` is reduced to
 * its type/pot/proposalId, then the title is shortened. Throws only if even that can't fit (a bug).
 */
export function buildPayload(p: PayloadInput): { json: string; payload: PushPayload } {
  if (!p.title.trim()) throw new Error("push title must be non-empty")
  if (!/^https?:\/\//.test(p.navigate)) throw new Error("push navigate must be an absolute URL")
  const withBadge = (p.type === "approval_needed" || p.type === "request_resolved") && p.badge !== undefined
  const make = (title: string, body: string | undefined, data: Record<string, unknown>): PushPayload => ({
    web_push: 8030,
    notification: {
      title,
      ...(body ? { body } : {}),
      navigate: p.navigate,
      lang: "en-US",
      dir: "ltr",
      ...(p.tag ? { tag: p.tag } : {}),
      silent: false,
      ...(withBadge ? { app_badge: p.badge } : {}),
      data: { type: p.type, url: p.navigate, ...data } as NonNullable<PushPayload["notification"]["data"]>,
    },
    ...(withBadge ? { app_badge: p.badge } : {}),
    mutable: false,
  })
  let title = p.title
  let body = p.body
  let data = p.data ?? {}
  let payload = make(title, body, data)
  let json = JSON.stringify(payload)
  if (bytes(json) > MAX_PAYLOAD_BYTES && body) {
    body = cut(body, Math.max(16, bytes(body) - (bytes(json) - MAX_PAYLOAD_BYTES)))
    payload = make(title, body, data)
    json = JSON.stringify(payload)
  }
  if (bytes(json) > MAX_PAYLOAD_BYTES) {
    data = Object.fromEntries(Object.entries(data).filter(([k]) => k === "pot" || k === "proposalId"))
    payload = make(title, body, data)
    json = JSON.stringify(payload)
  }
  if (bytes(json) > MAX_PAYLOAD_BYTES) {
    title = cut(title, Math.max(16, bytes(title) - (bytes(json) - MAX_PAYLOAD_BYTES)))
    payload = make(title, body, data)
    json = JSON.stringify(payload)
  }
  if (bytes(json) > MAX_PAYLOAD_BYTES) throw new Error(`push payload ${bytes(json)} B > ${MAX_PAYLOAD_BYTES} B`)
  return { json, payload }
}
