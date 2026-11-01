// Pay by link (hub 1.1.0) on the server: what the feed route adds for members, and the daily job that sends expired
// links back to their Pots.
//  - linkEnrichment: `linkLabels` (request_ref → who it's for, the requester's own note; only when the note's author
//    is the on-chain requester, like memos) and `linkClaimers` (request id → the claimer's display name, only when the
//    claimer uses Pot; anyone else stays "someone"). Members only (M-7), never account ids.
import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import type { Db } from "@/db/client"
import { appUser, feedEvent, note } from "@/db/schema"

type FeedRow = typeof feedEvent.$inferSelect

export interface LinkEnrichment {
  linkLabels: Record<string, string>
  linkClaimers: Record<string, string>
}

export async function linkEnrichment(db: Db, potId: string, page: readonly FeedRow[]): Promise<LinkEnrichment> {
  const out: LinkEnrichment = { linkLabels: {}, linkClaimers: {} }
  // labels: request_ref → text, only from the requester of that request
  const requesterByRef = new Map(page.filter((r) => r.kind === "spend_requested" && r.requestRef).map((r) => [r.requestRef!, r.actor ?? ""]))
  if (requesterByRef.size) {
    const ns = await db
      .select()
      .from(note)
      .where(and(eq(note.potId, potId), eq(note.kind, "link_label"), inArray(note.ref, [...requesterByRef.keys()])))
    for (const n of ns) if (requesterByRef.get(n.ref) === n.authorAccount) out.linkLabels[n.ref] = n.text
  }
  // claimers: every link_claimed of this Pot (a handful per Pot), display names for Pot users only
  const claims = await db
    .select({ subject: feedEvent.subject, data: feedEvent.data })
    .from(feedEvent)
    .where(and(eq(feedEvent.potId, potId), eq(feedEvent.kind, "link_claimed")))
    .limit(200)
  const byAccount = new Map<string, string[]>()
  for (const c of claims) {
    const id = (c.data as { request_id?: unknown } | null)?.request_id
    if (!c.subject || (typeof id !== "number" && typeof id !== "string")) continue
    byAccount.set(c.subject, [...(byAccount.get(c.subject) ?? []), String(id)])
  }
  if (byAccount.size) {
    const users = await db
      .select({ a: appUser.nearAccount, n: appUser.displayName })
      .from(appUser)
      .where(inArray(appUser.nearAccount, [...byAccount.keys()]))
    for (const u of users) for (const id of byAccount.get(u.a) ?? []) out.linkClaimers[id] = u.n
  }
  return out
}
