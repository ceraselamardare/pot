// POST /api/notes (X-05; api-spec §2.5): off-chain memos and decline reasons (D-07: never on chain).
// Members only; natural key (pot, kind, ref, author): the same text → 200 replayed, another text → 409.
import "server-only"
import { and, eq } from "drizzle-orm"
import type { Db } from "@/db/client"
import { chargeQuotas, nextUtcDay } from "@/db/quota"
import { note, pot } from "@/db/schema"
import type { HubReader } from "../chain/hub"
import { RpcUnavailableError } from "../chain/rpc"
import type { Config } from "../config"
import { ApiError, unavailable } from "../http/errors"
import { limit } from "../quotas"
import { upsertPotRow } from "../relay/effects"
import type { SessionCtx } from "../session/store"
import { daoSlug, OPKEY_RE } from "../util/ids"
import { cleanNote } from "../util/text"

export interface NoteBody {
  kind: "memo" | "decline_reason"
  pot: string
  ref: string
  text: string
  idempotencyKey?: string
}

export async function isMember(hub: HubReader, potId: string, account: string): Promise<boolean> {
  try {
    const members = await hub.getMembers(potId)
    return members.some((m) => m.account_id === account && m.status === "active")
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  }
}

/** The pot cache row (notes and feed rows reference it); pot_unknown when the hub doesn't know it. */
export async function ensurePot(db: Db, hub: HubReader, cfg: Config, potId: string) {
  const row = (await db.select().from(pot).where(eq(pot.daoId, potId)).limit(1))[0]
  if (row) return row
  let v
  try {
    v = await hub.getPot(potId)
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw unavailable("rpc", 3_000)
    throw e
  }
  if (!v) throw new ApiError("pot_unknown")
  await upsertPotRow(db, cfg.hubId, v)
  return (await db.select().from(pot).where(eq(pot.daoId, potId)).limit(1))[0]!
}

export async function postNote(
  deps: { db: Db; hub: HubReader; cfg: Config },
  s: SessionCtx,
  body: NoteBody,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { db, hub, cfg } = deps
  if (!daoSlug(body.pot, cfg.hubId)) throw new ApiError("bad_request", { detail: { field: "pot" } })
  if (body.kind === "memo" ? !OPKEY_RE.test(body.ref) : !/^(0|[1-9][0-9]{0,18})$/.test(body.ref))
    throw new ApiError("bad_request", { detail: { field: "ref" } })
  const text = cleanNote(body.text)
  if (!text.ok) throw new ApiError("bad_request", { detail: { field: "text", why: text.why } })
  const author = s.user.nearAccount
  await ensurePot(db, hub, cfg, body.pot)
  if (!(await isMember(hub, body.pot, author))) throw new ApiError("not_a_member")

  const existing = (
    await db
      .select()
      .from(note)
      .where(and(eq(note.potId, body.pot), eq(note.kind, body.kind), eq(note.ref, body.ref), eq(note.authorAccount, author)))
      .limit(1)
  )[0]
  const shape = (n: typeof note.$inferSelect) => ({ kind: n.kind, pot: n.potId, ref: n.ref, createdAt: n.createdAt.toISOString() })
  if (existing) {
    if (existing.text !== text.value) throw new ApiError("note_exists")
    return { status: 200, body: { replayed: true, note: shape(existing) } }
  }
  const q = await chargeQuotas(db, [{ subject: `user:${s.user.id}`, action: "notes", amount: 1n, limit: limit("user_notes") }])
  if (!q.ok) throw new ApiError("quota_exceeded", { detail: { family: "notes", resetsAt: nextUtcDay().toISOString() } })
  const inserted = await db
    .insert(note)
    .values({ potId: body.pot, kind: body.kind, ref: body.ref, authorAccount: author, text: text.value })
    .onConflictDoNothing()
    .returning()
  if (inserted[0]) return { status: 200, body: { note: shape(inserted[0]) } }
  // a concurrent insert of the same natural key
  return postNote(deps, s, body)
}
