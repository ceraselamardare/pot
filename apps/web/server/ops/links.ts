// Pay by link (hub 1.1.0): the daily job sends expired, unclaimed links back to their Pots (reclaim_link: anyone may
// once a link's date has passed; notes/contracts-wave4.md D4-6). A step of GET /api/cron/reconcile.
//  - Which: Pots with activity in the last 45 days (a link lives ≤ 30 days), their last 50 requests whose link is
//    funded, or approved but never funded (the escrow payment bounced); get_link for the date; selectReclaimable
//    (lib/client/paylink/link.ts) keeps the expired ones, oldest first, ≤ `max` per run.
//  - How: a relayer-signed hub.reclaim_link (50 Tgas, no deposit), one relay_log row per (Pot, request, run cause): a
//    second run the same day can't send it twice, and a returned link is never selected again. The hub events it
//    emits (link_returned) go to the feed and to the members' pushes, like the server's sync calls.
// Server-side signing uses the relayer key pool already loaded by the submitter (RELAYER_KEYS); keys are never logged.
import "server-only"
import { and, eq, gt, inArray, sql } from "drizzle-orm"
import { actions as nearActions } from "near-api-js"
import { pot, relayLog } from "@/db/schema"
import { selectReclaimable, type HubLinkStatus } from "@/lib/client/paylink/link"
import { viewFunction } from "../chain/near"
import { burnt, trustedEvents } from "../chain/outcome"
import { logError } from "../log"
import { notifyFromEvents } from "../notify/notify"
import { blockTimes, type RelayDeps } from "../relay/pipeline"
import { applyHubEvents } from "../relay/effects"
import { TGAS } from "../relay/policy"
import { newRelayId } from "../util/crypto"

const RECLAIM_TGAS = 50n

export interface ReclaimReport {
  scanned: number
  candidates: number
  reclaimed: number
  failed: number
}

export interface LinkCandidate {
  pot: string
  requestId: number
  linkStatus: HubLinkStatus
  requestStatus: string
  expiresAtMs: number
}

interface RawLink {
  status: HubLinkStatus
  request_status: string
  expires_at_ms: number
}

const isUniqueViolation = (e: unknown) => {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
  return code === "23505"
}

/** The links of one Pot the hub would let anyone return now (reads only). */
export async function expiredLinksOf(deps: Pick<RelayDeps, "hub" | "rpc" | "cfg">, daoId: string, now: number): Promise<LinkCandidate[]> {
  const v = await deps.hub.getPot(daoId, { fresh: true }).catch(() => null)
  if (!v || v.status === "closed") return []
  const reqs = await deps.hub.getRequests(daoId, Math.max(0, v.request_count - 50), 50).catch(() => [])
  const open = reqs.filter((r) => r.link_status === "funded" || (r.link_status === "awaiting_funds" && r.status === "approved"))
  const out: LinkCandidate[] = []
  for (const r of open) {
    const l = await viewFunction<RawLink | null>(deps.rpc, deps.cfg.hubId, "get_link", { pot: daoId, request_id: r.request_id }, "final").catch(() => null)
    if (!l) continue
    out.push({ pot: daoId, requestId: r.request_id, linkStatus: l.status, requestStatus: l.request_status, expiresAtMs: l.expires_at_ms })
  }
  return selectReclaimable(out, now, out.length)
}

/** Cron step: return every expired link (≤ `max` per run, the longest-expired first). Never throws for one link. */
export async function reclaimExpiredLinks(deps: RelayDeps, cause: string, opts: { max?: number; now?: number } = {}): Promise<ReclaimReport> {
  const max = opts.max ?? 10
  const now = opts.now ?? Date.now()
  const report: ReclaimReport = { scanned: 0, candidates: 0, reclaimed: 0, failed: 0 }
  const pots = await deps.db
    .select({ daoId: pot.daoId })
    .from(pot)
    .where(and(inArray(pot.status, ["open", "closing"]), gt(pot.lastActivityAt, sql`now() - interval '45 days'`)))
    .limit(200)
  const all: LinkCandidate[] = []
  for (const { daoId } of pots) {
    report.scanned++
    all.push(...(await expiredLinksOf(deps, daoId, now)))
  }
  report.candidates = all.length
  for (const c of selectReclaimable(all, now, max)) {
    const ok = await serverReclaimLink(deps, c.pot, c.requestId, cause)
    if (ok === "sent") report.reclaimed++
    else if (ok === "failed") report.failed++
  }
  return report
}

/** One relayer-signed reclaim_link; idempotent per (Pot, request, cause). */
export async function serverReclaimLink(deps: RelayDeps, daoId: string, requestId: number, cause: string): Promise<"sent" | "failed" | "skipped"> {
  const { db, cfg } = deps
  const id = newRelayId()
  try {
    await db.insert(relayLog).values({
      id,
      requestId: cause,
      op: "reclaim_link",
      idempotencyKey: `reclaim_link:${daoId}:${requestId}:${cause}`,
      senderId: cfg.relayerAccountId,
      receiverId: cfg.hubId,
      methods: ["reclaim_link"],
      potId: daoId,
      status: "validated",
    })
  } catch (e) {
    if (isUniqueViolation(e)) return "skipped"
    throw e
  }
  try {
    const r = await deps.submitter.submit(
      {
        signerId: cfg.relayerAccountId,
        receiverId: cfg.hubId,
        actions: [nearActions.functionCall("reclaim_link", { pot: daoId, request_id: requestId }, RECLAIM_TGAS * TGAS, 0n)],
      },
      {
        pool: cfg.relayerPool,
        holder: id,
        budgetMs: 25_000,
        onSigned: async ({ txHash, publicKey }) => {
          await db.update(relayLog).set({ status: "signed", outerTxHash: txHash, relayerKey: publicKey, submittedAt: new Date() }).where(eq(relayLog.id, id))
        },
      },
    )
    if (r.kind === "pending") {
      await db.update(relayLog).set({ status: "pending" }).where(eq(relayLog.id, id))
      return "sent"
    }
    const failed = r.outcome.receipts_outcome.some((o) => typeof o.outcome.status === "object" && o.outcome.status && "Failure" in o.outcome.status)
    const times = await blockTimes(deps.rpc, [...new Set(r.outcome.receipts_outcome.map((o) => o.block_hash))])
    const events = trustedEvents(r.outcome, cfg.hubId, cfg.usdcId)
    await db
      .update(relayLog)
      .set({
        status: failed ? "failed" : "executed",
        outcome: failed ? "inner_failed" : "success",
        costYocto: burnt(r.outcome).yocto.toString(),
        events: events.map((e) => ({ standard: e.standard, version: e.version, event: e.event, data: e.data, executor: e.executor, receiptId: e.receiptId })),
        finishedAt: new Date(),
      })
      .where(eq(relayLog.id, id))
    await applyHubEvents(db, { hubId: cfg.hubId, txHash: r.txHash, events, blockTimes: times, source: "reconcile" })
    deps.hub.invalidate(daoId)
    // "$45 is back in Surf Camp" to every member
    if (deps.push) await notifyFromEvents({ db, hub: deps.hub, cfg, sender: deps.push }, events, r.txHash).catch(() => undefined)
    return failed ? "failed" : "sent"
  } catch (e) {
    await db.update(relayLog).set({ status: "failed", reason: "internal", finishedAt: new Date() }).where(eq(relayLog.id, id))
    await logError({ route: "cron:reclaim_link", relayId: id, reason: "reclaim_link_failed", detail: { err: String(e).slice(0, 300) } })
    return "failed"
  }
}
