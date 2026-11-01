// Receipt details saved with a spend (GET/POST /api/pots/[pot]/requests/[id]/receipt; lib/receipt-saved.ts).
// Never the photo (D-61): only the fields the person confirmed from "Scan receipt". Rules:
//  - members only, both ways (hub.get_members, never the client's word); the details never reach a visitor;
//  - only the request's own requester saves, once (one row per Pot + hub request id; the same body again replays);
//  - the body is strict (savedReceiptSchema + validateSavedReceipt: cleaned strings, real days, the conversion's
//    arithmetic, the proof link's shape, ≤ 16 KB canonical) and the route reads at most 24 KB;
//  - the request must carry a fingerprint (its request_ref = OpKey + 16 hex) and the SHA-256 of the canonical JSON
//    must start with it: an edited receipt is refused (422 payload_mismatch, why receipt_mismatch / no_fingerprint),
//    so what members later see can be checked; another body for a saved one is 409 idempotency_conflict;
//  - writes are rate limited (per-person burst + a daily cap).
// Off-chain only: nothing here signs or sends a transaction.
import "server-only"
import type { Db } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { spendReceipt } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { receiptFingerprintOfRef } from "@pot/sdk"
import { receiptFingerprint, shortFingerprint, validateSavedReceipt, type SavedReceipt, type SpendReceiptRes } from "@/lib/receipt-saved"
import type { HubReader, RequestView } from "../../chain/hub"
import { RpcUnavailableError } from "../../chain/rpc"
import type { Config } from "../../config"
import { ApiError, unavailable } from "../../http/errors"
import { limit } from "../../quotas"
import type { SessionCtx } from "../../session/store"
import { parseRequestId } from "../comments"
import { resolvePotId } from "../feed"
import { ensurePot, isMember } from "../notes"

/** The POST body cap (the canonical receipt is ≤ 16 KB; the wrapper and whitespace get a little more). */
export const RECEIPT_SAVE_MAX_BODY = 24_576

/** POST body: `{receipt}` only (its own shape is checked by validateSavedReceipt). */
export const receiptSaveReq = z.strictObject({ receipt: z.unknown() })

export interface SavedReceiptDeps {
  db: Db
  hub: HubReader
  cfg: Config
  now?: () => number
}

type Row = typeof spendReceipt.$inferSelect

const shape = (r: Row): SpendReceiptRes => ({
  pot: r.potId,
  hubRequestId: r.requestId,
  receipt: r.data as SavedReceipt,
  fingerprint: r.fingerprint,
  savedAt: r.createdAt.toISOString(),
})

async function requireMember(hub: HubReader, potId: string, account: string): Promise<void> {
  if (!(await isMember(hub, potId, account))) throw new ApiError("not_a_member")
}

async function hubRequest(hub: HubReader, potId: string, requestId: number): Promise<RequestView | null> {
  try {
    const [r] = await hub.getRequests(potId, requestId, 1)
    return r && r.request_id === requestId ? r : null
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  }
}

async function rowOf(db: Db, potId: string, requestId: number): Promise<Row | undefined> {
  return (await db.select().from(spendReceipt).where(and(eq(spendReceipt.potId, potId), eq(spendReceipt.requestId, requestId))).limit(1))[0]
}

/** A member reads a spend's saved receipt (404 when there is none). */
export async function getSpendReceipt(deps: SavedReceiptDeps, s: SessionCtx, potParam: string, idParam: string): Promise<SpendReceiptRes> {
  const { db, hub, cfg } = deps
  const potId = resolvePotId(potParam, cfg.hubId)
  const requestId = parseRequestId(idParam)
  await requireMember(hub, potId, s.user.nearAccount)
  const row = await rowOf(db, potId, requestId)
  if (!row) throw new ApiError("not_found", { detail: { field: "receipt" } })
  return shape(row)
}

/** The requester saves the receipt details of their own spend, once. */
export async function saveSpendReceipt(
  deps: SavedReceiptDeps,
  s: SessionCtx,
  potParam: string,
  idParam: string,
  body: { receipt: unknown },
): Promise<{ res: SpendReceiptRes; replayed?: true; status: number }> {
  const { db, hub, cfg } = deps
  const now = deps.now?.() ?? Date.now()
  const potId = resolvePotId(potParam, cfg.hubId)
  const requestId = parseRequestId(idParam)
  const checked = validateSavedReceipt(body.receipt, now)
  if (!checked.ok) throw new ApiError("bad_request", { detail: { field: `receipt.${checked.field}`, why: checked.why } })
  const receipt = checked.value
  const fingerprint = receiptFingerprint(receipt)
  const author = s.user.nearAccount
  await ensurePot(db, hub, cfg, potId)
  await requireMember(hub, potId, author)

  const prior = await rowOf(db, potId, requestId)
  if (prior) {
    if (prior.requesterAccount === author && prior.fingerprint === fingerprint) return { res: shape(prior), replayed: true, status: 200 }
    throw new ApiError("idempotency_conflict", { detail: { field: "receipt", why: "already_saved" } })
  }

  const request = await hubRequest(hub, potId, requestId)
  if (!request) throw new ApiError("not_found", { detail: { field: "id" } })
  // only the person who asked attaches what they bought
  if (request.requester !== author) throw new ApiError("action_not_allowed", { detail: { field: "id", why: "not_requester" } })
  const onRequest = receiptFingerprintOfRef(request.request_ref)
  if (!onRequest) throw new ApiError("payload_mismatch", { detail: { field: "receipt", why: "no_fingerprint" } })
  if (shortFingerprint(fingerprint) !== onRequest) throw new ApiError("payload_mismatch", { detail: { field: "receipt", why: "receipt_mismatch" } })

  const q = await chargeQuotas(db, [
    { subject: `user:${s.user.id}`, action: "receipt_save_burst", amount: 1n, limit: limit("user_receipt_save_burst"), period: "minute", tag: "burst" },
    { subject: `user:${s.user.id}`, action: "receipt_saves", amount: 1n, limit: limit("user_receipt_saves"), tag: "family:receipt_saves" },
  ])
  if (!q.ok) {
    if (q.failed.tag === "burst") throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (Date.now() % 60_000), detail: { limit: Number(q.failed.limit) } })
    throw new ApiError("quota_exceeded", { detail: { family: "receipt_saves", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
  }

  const inserted = await db
    .insert(spendReceipt)
    .values({ potId, requestId, requesterAccount: author, data: receipt, fingerprint })
    .onConflictDoNothing()
    .returning()
  const row = inserted[0]
  if (row) return { res: shape(row), status: 201 }
  // a concurrent save of the same request won
  const raced = await rowOf(db, potId, requestId)
  if (raced && raced.requesterAccount === author && raced.fingerprint === fingerprint) return { res: shape(raced), replayed: true, status: 200 }
  throw new ApiError("idempotency_conflict", { detail: { field: "receipt", why: "already_saved" } })
}

/** Hub request ids (decimal strings) of the Pot's spends that have saved details (the feed's `receipts`). */
export async function receiptIds(db: Db, potId: string): Promise<string[]> {
  const rows = await db.select({ r: spendReceipt.requestId }).from(spendReceipt).where(eq(spendReceipt.potId, potId))
  return rows.map((x) => String(x.r)).sort((a, b) => Number(a) - Number(b))
}
