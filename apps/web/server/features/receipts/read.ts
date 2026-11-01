// POST /api/receipts/read: "Snap the receipt" in the Spend sheet. Signed-in members of the Pot only (hub.get_members,
// never the client's word), same-origin JSON, a 2 MB body cap read as a stream, rate limited per person and globally.
// The photo (a client-downscaled JPEG, ≤ 1.5 MB) is decoded in memory, checked by its magic bytes, handed to the
// reader and dropped: D-61 (no uploads) — never stored in the DB, never logged, never written to disk. Only the
// extracted fields go back to the Spend sheet, where the person checks them before asking. A receipt in another
// currency also comes back in dollars (server/features/fx.ts: a live reference rate, its day and its source); when no
// rate can be had, the reading still comes back and the sheet asks for the amount in dollars.
import "server-only"
import { z } from "zod"
import type { Db } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import type { ReceiptReadRes } from "@/lib/receipt"
import type { HubReader } from "../../chain/hub"
import type { Config } from "../../config"
import { parseWith } from "../../http/context"
import { ApiError } from "../../http/errors"
import { limit } from "../../quotas"
import type { SessionCtx } from "../../session/store"
import { resolvePotId } from "../feed"
import { offFx, type FxConverter } from "../fx"
import { isMember } from "../notes"
import { ReceiptProviderError, type ReceiptReader, type ReceiptsConfig } from "./nearai"

/** Decoded photo cap: a 1600 px JPEG is ~150-500 KB; anything near this is not what our client sends. */
export const RECEIPT_MAX_IMAGE_BYTES = 1_500_000
/** Request body cap: base64 (4/3) of the photo + a little JSON. */
export const RECEIPT_MAX_BODY = 2_048_000

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/

export const receiptReadReq = z.strictObject({
  pot: z.string().min(2).max(64),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  image: z.string().min(16).max(Math.ceil((RECEIPT_MAX_IMAGE_BYTES * 4) / 3) + 4),
})
export type ReceiptReadBody = z.infer<typeof receiptReadReq>

const tooLarge = (field: string) => new ApiError("bad_request", { status: 413, detail: { field, cause: "too_large" } })

/** The body as a stream with a hard cap (a missing or lying content-length can't make us buffer more). */
export async function readCappedJson<T>(req: Request, schema: z.ZodType<T>, max = RECEIPT_MAX_BODY): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? "0")
  if (declared > max) throw tooLarge("body")
  const reader = req.body?.getReader()
  if (!reader) throw new ApiError("bad_request", { detail: { field: "body", cause: "empty" } })
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge("body")
    }
    chunks.push(value)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new ApiError("bad_request", { detail: { field: "body", cause: "json" } })
  }
  return parseWith(schema, parsed)
}

/** base64 → bytes, checked: real base64, ≤ the cap, and the bytes are the image type the client said. */
export function decodeImage(b64: string, mime: ReceiptReadBody["mime"]): Uint8Array {
  if (b64.length % 4 !== 0 || !B64_RE.test(b64)) throw new ApiError("bad_request", { detail: { field: "image", cause: "encoding" } })
  const bytes = new Uint8Array(Buffer.from(b64, "base64"))
  if (bytes.byteLength > RECEIPT_MAX_IMAGE_BYTES) throw tooLarge("image")
  if (!hasMagic(bytes, mime)) throw new ApiError("bad_request", { detail: { field: "image", cause: "type" } })
  return bytes
}

function hasMagic(b: Uint8Array, mime: ReceiptReadBody["mime"]): boolean {
  if (mime === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (mime === "image/png") return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  // RIFF....WEBP
  return b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"
}

export interface ReceiptDeps {
  db: Db
  hub: HubReader
  cfg: Config
  rcfg: ReceiptsConfig
  reader: ReceiptReader
  /** dollars for another currency (default: none, the sheet asks) */
  fx?: FxConverter
}

export async function readReceipt(deps: ReceiptDeps, s: SessionCtx, body: ReceiptReadBody, signal?: AbortSignal): Promise<ReceiptReadRes> {
  const { db, hub, cfg, rcfg, reader } = deps
  const potId = resolvePotId(body.pot, cfg.hubId)
  if (!(await isMember(hub, potId, s.user.nearAccount))) throw new ApiError("not_a_member")
  // before the (paid) provider call; the photo is decoded only after the person may spend a reading
  const q = await chargeQuotas(db, [
    { subject: `user:${s.user.id}`, action: "receipt_burst", amount: 1n, limit: limit("user_receipt_burst"), period: "minute", tag: "burst" },
    { subject: `user:${s.user.id}`, action: "receipts", amount: 1n, limit: limit("user_receipts"), tag: "family:receipts" },
    { subject: "global", action: "receipts", amount: 1n, limit: limit("global_receipts"), tag: "global" },
  ])
  if (!q.ok) {
    if (q.failed.tag === "burst") throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (Date.now() % 60_000), detail: { limit: Number(q.failed.limit) } })
    if (q.failed.tag === "global") throw new ApiError("service_unavailable", { detail: { cause: "global_cap", family: "receipts" }, retryAfterMs: 60_000 })
    throw new ApiError("quota_exceeded", { detail: { family: "receipts", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
  }
  const image = decodeImage(body.image, body.mime)
  try {
    const out = await reader({ image, mime: body.mime, signal })
    // never fails the reading: no rate = the sheet asks for dollars
    const fx = await (deps.fx ?? offFx).convert(out.result).catch(() => null)
    return { result: out.result, proof: out.proof, source: rcfg.mode === "live" ? "near-ai" : "mock", fx }
  } catch (e) {
    if (e instanceof ReceiptProviderError) {
      if (e.kind === "timeout") throw new ApiError("service_unavailable", { status: 504, detail: { cause: "receipts_timeout" } })
      if (e.kind === "busy") throw new ApiError("service_unavailable", { detail: { cause: "receipts_busy" }, retryAfterMs: 5_000 })
      if (e.kind === "aborted") throw new ApiError("bad_request", { detail: { cause: "aborted" } })
      // auth (bad or out-of-credit key) / provider: a server-side problem, not the person's photo
      throw new ApiError("service_unavailable", { status: 502, detail: { cause: "receipts_provider", status: e.status ?? null } })
    }
    throw e
  }
}
