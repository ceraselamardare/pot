// GET /api/relay/[relayId] (B-09): the stored RelayOk/Err, the early `final: false` body until after() stores
// the final one, or — for a row in flight for more than 10 s — a tx_status poll of up to 20 s, then classify
// and store (architecture §4.1 timeout algorithm). Wave 3 (frontend request 2): a broadcast that never landed
// (final head past the delegate's max_block_height, key nonce unchanged) becomes 409 `expired` with
// `detail.cause: "lost_broadcast"` instead of `pending` forever (server/relay/reconcile.ts).
import "server-only"
import { and, eq } from "drizzle-orm"
import { relayLog } from "@/db/schema"
import { ApiError } from "../http/errors"
import type { RelayDeps, RelayResponse } from "./pipeline"
import { reconcileRelayRow } from "./reconcile"

const sleepDefault = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function getRelay(
  deps: RelayDeps,
  userId: string,
  relayId: string,
  requestId: string,
  opts: { pollMs?: number; budgetMs?: number } = {},
): Promise<RelayResponse> {
  const load = async () =>
    (await deps.db.select().from(relayLog).where(and(eq(relayLog.id, relayId), eq(relayLog.userId, userId))).limit(1))[0]
  const row = await load()
  if (!row || row.op !== "relay") throw new ApiError("not_found")
  const stored = row.response as Record<string, unknown> | null
  const finalStored = stored && !(stored.ok === true && stored.final === false)
  if (finalStored) return { status: row.httpStatus ?? 200, body: { ...stored, requestId } }

  // `validated` too: an instance that died between the record and the broadcast leaves the row there
  const inFlight = ["validated", "signed", "submitted", "pending"].includes(row.status)
  const age = Date.now() - (row.submittedAt ?? row.createdAt).getTime()
  const pendingBody = { ok: true, requestId, status: "pending", relayId, txHash: row.outerTxHash ?? "" }
  const settledEnough = row.status === "pending" || age >= 10_000
  if (!inFlight || !settledEnough || (row.status === "validated" && age < 30_000)) {
    if (stored) return { status: 200, body: { ...stored, requestId } }
    return { status: 202, body: pendingBody }
  }
  // poll the chain for the outer tx; the lost check runs on the first and the last pass
  const sleep = deps.sleep ?? sleepDefault
  const deadline = Date.now() + (opts.budgetMs ?? 20_000)
  for (let pass = 0; ; pass++) {
    const last = Date.now() + (opts.pollMs ?? 1_000) >= deadline
    const cur = pass === 0 ? row : await load()
    if (!cur) break
    const v = await reconcileRelayRow(deps, cur, { requestId, lostCheck: pass === 0 || last })
    if (v.kind === "completed" || v.kind === "lost") return { status: v.response.status, body: { ...v.response.body, requestId } }
    if (last || (!cur.outerTxHash && v.kind === "in_flight")) break
    await sleep(opts.pollMs ?? 1_000)
  }
  if (stored) return { status: 200, body: { ...stored, requestId } }
  return { status: 202, body: pendingBody }
}
