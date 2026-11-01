// DB side effects of a classified relay (api-spec §2.3 "Side effects"): feed_event rows from trusted hub
// events, the `pot` cache (pot_created, close_proposed, pot_closed), invite_meta (invite_added, invite_revoked).
import "server-only"
import { sql } from "drizzle-orm"
import type { DbOrTx } from "@/db/client"
import { feedEvent, inviteMeta, pot } from "@/db/schema"
import type { RawEvent } from "../chain/outcome"
import { FEED_KINDS } from "@/db/schema"
import type { PotView } from "../chain/hub"

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {})
const str = (v: unknown) => (v === undefined || v === null ? null : String(v))
const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v))

/** Ensure the `pot` cache row exists (feed_event and note reference it). */
export async function upsertPotRow(db: DbOrTx, hubId: string, v: PotView): Promise<void> {
  await db
    .insert(pot)
    .values({
      daoId: v.pot,
      slug: v.slug,
      hubId,
      name: v.name,
      emoji: v.emoji ?? null,
      preset: v.preset,
      creatorAccount: v.creator,
      status: v.status,
      lastActivityAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pot.daoId,
      set: { name: v.name, emoji: v.emoji ?? null, status: v.status, lastActivityAt: new Date() },
    })
}

export function feedKey(e: RawEvent, txHash: string): string {
  const d = obj(e.data)
  switch (e.event) {
    case "contribution":
      return `contribution:${txHash}`
    case "spend_requested":
    case "spend_auto_approved":
    case "spend_payout_failed":
    case "spend_withdrawn":
      return `request:${str(d.proposal_id) ?? `r${str(d.request_id)}`}`
    case "member_joined":
      return `join:${str(d.member)}`
    case "rules_changed":
    case "rules_change_proposed":
      return `rules:${txHash}`
    case "close_proposed":
      return `close:${str(d.proposal_id)}`
    case "pot_closed":
      return `closed:${str(d.pot)}`
    case "pot_created":
      return `created:${str(d.pot)}`
    case "invite_added":
    case "invite_revoked":
      return `invite:${str(d.invite_pk)}`
    default:
      return `${e.event}:${str(d.proposal_id) ?? txHash}`
  }
}

/**
 * Apply hub events. `blockTimes` maps block hash → {height, ms}. Idempotent: feed rows are unique on
 * (receipt_id, event_index), so a relay and a reconcile can't double-insert.
 */
export async function applyHubEvents(
  db: DbOrTx,
  opts: {
    hubId: string
    txHash: string
    events: RawEvent[]
    blockTimes: Map<string, { height: number; ms: number }>
    source?: "relay" | "reconcile" | "report"
  },
): Promise<number> {
  let inserted = 0
  for (const e of opts.events) {
    if (e.standard !== "pot") continue
    const d = obj(e.data)
    const potId = str(d.pot)
    if (!potId) continue
    const when = opts.blockTimes.get(e.blockHash)
    const at = when ? new Date(when.ms) : new Date()

    if (e.event === "pot_created") {
      await db
        .insert(pot)
        .values({
          daoId: potId,
          slug: String(d.slug ?? potId.split(".")[0]),
          hubId: opts.hubId,
          name: String(d.name ?? ""),
          emoji: str(d.emoji),
          preset: (["trip", "club", "team", "custom"].includes(String(d.preset)) ? d.preset : "custom") as
            | "trip"
            | "club"
            | "team"
            | "custom",
          creatorAccount: String(d.creator ?? ""),
          status: "open",
          createdTxHash: opts.txHash,
          lastActivityAt: at,
        })
        .onConflictDoNothing()
    } else {
      // feed rows need the pot row; create a minimal one if the Pot predates this DB
      await db
        .insert(pot)
        .values({
          daoId: potId,
          slug: potId.split(".")[0] ?? potId,
          hubId: opts.hubId,
          name: potId.split(".")[0] ?? potId,
          preset: "custom",
          creatorAccount: "",
          status: "open",
        })
        .onConflictDoNothing()
    }
    if (e.event === "close_proposed") await db.update(pot).set({ status: "closing" }).where(sql`${pot.daoId} = ${potId}`)
    if (e.event === "pot_closed")
      await db.update(pot).set({ status: "closed", closedAt: at }).where(sql`${pot.daoId} = ${potId}`)
    if (e.event === "invite_added") {
      await db
        .insert(inviteMeta)
        .values({
          potId,
          invitePk: String(d.invite_pk),
          createdBy: String(d.by ?? ""),
          expiresAtMs: num(d.expires_at_ms),
          maxUses: num(d.max_uses),
          createdTxHash: opts.txHash,
        })
        .onConflictDoNothing()
    }
    if (e.event === "invite_revoked")
      await db
        .update(inviteMeta)
        .set({ revokedAt: at })
        .where(sql`${inviteMeta.potId} = ${potId} AND ${inviteMeta.invitePk} = ${String(d.invite_pk)}`)
    await db.update(pot).set({ lastActivityAt: at }).where(sql`${pot.daoId} = ${potId}`)

    if (!(FEED_KINDS as readonly string[]).includes(e.event)) continue
    // rules_changed: `by` is how it was applied (a mode string), `actor` the member; elsewhere `by` is the account
    const actor =
      e.event === "rules_changed"
        ? (str(d.actor) ?? null)
        : (str(d.member) ?? str(d.requester) ?? str(d.by) ?? str(d.actor) ?? str(d.creator) ?? null)
    const res = await db
      .insert(feedEvent)
      .values({
        potId,
        kind: e.event as (typeof FEED_KINDS)[number],
        key: feedKey(e, opts.txHash),
        actor,
        subject: str(d.receiver_id) ?? str(d.member) ?? null,
        amount: str(d.amount),
        proposalId: num(d.proposal_id),
        requestRef: str(d.request_ref),
        category: str(d.category),
        path: d.path === "instant" || d.path === "vote" ? d.path : null,
        status: str(d.hub_status) ?? str(d.dao_status),
        txHash: opts.txHash,
        receiptId: e.receiptId,
        eventIndex: e.index,
        blockHeight: when?.height ?? null,
        at,
        data: e.data ?? {},
        source: opts.source ?? "relay",
      })
      .onConflictDoNothing()
      .returning({ id: feedEvent.id })
    inserted += res.length
  }
  return inserted
}
