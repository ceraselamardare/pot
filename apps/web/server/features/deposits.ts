// GET /api/pots/[pot]/deposits/[key] (2026-11-04): the details of one money-in row, for the Pot's members only.
// `key` is what the feed row already has:
//  - a member's add: its NEAR transaction hash (feed_event `contribution:<txHash>`). The source comes from, in order:
//    the deposit_intent the relay ADDED (deposit_intent.added_relay_id → relay_log.id, whose outer_tx_hash is the
//    key), the deposit named in the relay's context (feed_event.data.depositIntentId, written by POST /api/relay), the
//    source the Add sheet sent (feed_event.data.potSource: demo / pot_dollars), a faucet claim by the same person in
//    the 10 minutes before (demo dollars, adds from before sources were recorded), else "from their balance".
//  - a pay-in: its ref (gift.ref): the payer's chosen name and note (members only, as everywhere), the link or the
//    public page it came through.
// An add made while a top-up ask was open, by someone it asked, names that ask (lib/deposits.ts topupFor).
// Privacy: a signed-in member of the Pot (hub.get_members, active) or 404, the same 404 whether the key exists or
// not, so a non-member (or someone who left) learns nothing. Nothing here is written.
import "server-only"
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { appUser, depositIntent, feedEvent, gift, giftLink, relayLog, topupRequest } from "@/db/schema"
import type { DepositDetailsWire, DepositSourceWire } from "@/lib/deposits-api"
import { depositKeyKind, intentsExplorerUrl, originTxUrl, topupFor, xcTimeline } from "@/lib/deposits"
import type { HubReader } from "../chain/hub"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import type { SessionCtx } from "../session/store"
import { resolvePotId } from "./feed"
import { isMember } from "./notes"
import { originOf, simOf, trailOf, usdTargetOf, type DepositIntentRow } from "./oneclick/service"
import { simStatus } from "./oneclick/sim"

export interface DepositDetailsDeps {
  db: Db
  hub: HubReader
  cfg: Config
}

/** A faucet claim this close before an add means the add spent demo dollars (adds from before sources were recorded). */
export const FAUCET_WINDOW_MS = 10 * 60_000

const notFound = () => new ApiError("not_found")
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : NaN)

/** An add from another app, as the details show it (pure: the deposit_intent row). */
export function xcSourceOf(row: DepositIntentRow, addedAt: Date | null): Extract<DepositSourceWire, { kind: "xc" }> {
  const o = originOf(row)
  const trail = trailOf(row)
  const seen = trail?.seen ?? {}
  let sentAt: number | null = null
  let arrivedAt: number | null = Number.isFinite(ms(seen.SUCCESS)) ? ms(seen.SUCCESS) : null
  let convertingAt: number | null = row.processingSince?.getTime() ?? (Number.isFinite(ms(seen.PROCESSING)) ? ms(seen.PROCESSING) : null)
  if (row.mode === "simulated") {
    // the simulator's own timeline (deterministic from its sends), so the moments are exact
    const sim = simOf(row)
    const first = sim?.sends[0]
    if (first) sentAt = first.at
    if (sim && first) {
      const o = {
        chain: row.chain,
        required: BigInt(row.minAmountIn ?? row.amountIn),
        quoted: BigInt(row.amountIn),
        quotedOut: row.amountOutQuoted ? BigInt(row.amountOutQuoted) : undefined,
        deadlineMs: row.deadline.getTime(),
        createdAt: row.createdAt.getTime(),
      }
      const v = simStatus(sim, o, (addedAt ?? row.updatedAt).getTime())
      if (v.status === "SUCCESS") {
        arrivedAt = arrivedAt ?? v.updatedAt
        // converting started where the status was still PROCESSING, a moment before it arrived
        const before = simStatus(sim, o, v.updatedAt - 1)
        if (before.processingSince) convertingAt = before.processingSince
      } else if (v.processingSince) convertingAt = v.processingSince
    }
  } else {
    const spotted = ms(seen.KNOWN_DEPOSIT_TX)
    sentAt = Number.isFinite(spotted) ? spotted : convertingAt
  }
  const addedMs = row.addedAt?.getTime() ?? addedAt?.getTime() ?? null
  const real = row.mode === "real"
  const originHash = real ? (trail?.originTx?.[0] ?? null) : null
  return {
    kind: "xc",
    mode: row.mode,
    chain: row.chain,
    coin: o.coin,
    decimals: o.decimals,
    stable: o.stable,
    sent: row.depositedAmount ?? row.amountIn,
    usdTarget: usdTargetOf(row),
    arrived: row.amountOut ?? null,
    refunded: row.refundedAmount && BigInt(row.refundedAmount) > 0n ? row.refundedAmount : null,
    refundReason: row.refundReason ?? null,
    timeline: xcTimeline({ address: row.createdAt.getTime(), sent: sentAt, converting: convertingAt, arrived: arrivedAt, added: addedMs }).map((x) => ({
      step: x.step,
      at: x.at === null ? null : new Date(x.at).toISOString(),
    })),
    // a testnet demo transfer is simulated: no transaction on the origin network, no NEAR Intents page
    originTx: originHash ? { hash: originHash, url: originTxUrl(row.chain, originHash) } : null,
    intentsUrl: real ? intentsExplorerUrl(row.depositAddress) : null,
  }
}

type FeedRow = typeof feedEvent.$inferSelect
type RelayRow = typeof relayLog.$inferSelect

/** The add's source (see the header for the order). */
async function sourceOfAdd(db: Db, potId: string, fe: FeedRow | null, relay: RelayRow | null, at: Date): Promise<DepositSourceWire> {
  const data = (fe?.data ?? {}) as { depositIntentId?: unknown; potSource?: unknown }
  let intent: DepositIntentRow | undefined
  if (relay) intent = (await db.select().from(depositIntent).where(and(eq(depositIntent.addedRelayId, relay.id), eq(depositIntent.potId, potId))).limit(1))[0]
  if (!intent && typeof data.depositIntentId === "string" && relay?.userId)
    intent = (
      await db
        .select()
        .from(depositIntent)
        .where(and(eq(depositIntent.id, data.depositIntentId), eq(depositIntent.potId, potId), eq(depositIntent.userId, relay.userId)))
        .limit(1)
    )[0]
  if (intent) return xcSourceOf(intent, at)
  if (data.potSource === "demo" || data.potSource === "pot_dollars") return { kind: data.potSource }
  if (relay?.userId) {
    const claim = (
      await db
        .select({ id: relayLog.id })
        .from(relayLog)
        .where(
          and(
            eq(relayLog.userId, relay.userId),
            eq(relayLog.op, "faucet"),
            inArray(relayLog.status, ["executed", "pending", "submitted", "signed"]),
            gte(relayLog.createdAt, new Date(relay.createdAt.getTime() - FAUCET_WINDOW_MS)),
            lte(relayLog.createdAt, relay.createdAt),
          ),
        )
        .limit(1)
    )[0]
    if (claim) return { kind: "demo" }
  }
  return { kind: "balance" }
}

/** The top-up ask this add counted toward (if any). */
async function topupOf(db: Db, potId: string, who: string, at: Date): Promise<DepositDetailsWire["topup"]> {
  const rows = await db
    .select()
    .from(topupRequest)
    .where(and(eq(topupRequest.potId, potId), lte(topupRequest.createdAt, at), sql`${topupRequest.baselines} @> ${JSON.stringify([{ a: who }])}::jsonb`))
    .orderBy(desc(topupRequest.createdAt))
    .limit(10)
  const asks = rows.map((r) => ({
    id: String(r.id),
    by: r.createdBy,
    createdAt: r.createdAt.getTime(),
    endedAt: (r.cancelledAt ?? r.closedAt)?.getTime() ?? null,
    dueAt: r.dueAt.getTime(),
    asked: (Array.isArray(r.baselines) ? (r.baselines as { a: string }[]) : []).map((b) => b.a),
    perPerson: r.perPerson,
    mode: r.mode === "total" ? ("total" as const) : ("each" as const),
  }))
  const a = topupFor(asks, who, at.getTime())
  return a ? { id: a.id, by: a.by, perPerson: a.perPerson, mode: a.mode } : null
}

async function addDetails(db: Db, potId: string, key: string): Promise<DepositDetailsWire> {
  const fe =
    (
      await db
        .select()
        .from(feedEvent)
        .where(and(eq(feedEvent.potId, potId), eq(feedEvent.kind, "contribution"), eq(feedEvent.txHash, key)))
        .limit(1)
    )[0] ?? null
  const relay = (await db.select().from(relayLog).where(and(eq(relayLog.outerTxHash, key), eq(relayLog.op, "relay"))).limit(1))[0] ?? null
  // the feed row is the truth; the relay row alone (the feed not written yet) only when it is this Pot's add
  const result = relay?.result as { type?: string; recorded?: boolean; amount?: string } | null | undefined
  const relayAdd = relay && relay.potId === potId && relay.intent === "add_money" && result?.type === "contribution" && result.recorded === true
  if (!fe && !relayAdd) throw notFound()
  const who = fe?.actor ?? relay?.senderId ?? ""
  const amount = fe?.amount ?? result?.amount ?? null
  if (!who || !amount) throw notFound()
  const at = fe?.at ?? relay?.finishedAt ?? relay?.createdAt ?? new Date()
  const [source, topup] = await Promise.all([sourceOfAdd(db, potId, fe, relay && relay.potId === potId ? relay : null, at), topupOf(db, potId, who, at)])
  return { key, kind: "added", who, amount, at: at.toISOString(), status: "added", txHash: key, source, topup }
}

async function payinDetails(db: Db, potId: string, ref: string): Promise<DepositDetailsWire> {
  const g = (await db.select().from(gift).where(and(eq(gift.ref, ref), eq(gift.potId, potId))).limit(1))[0]
  if (!g) throw notFound()
  const link = g.linkId ? (await db.select().from(giftLink).where(eq(giftLink.id, g.linkId)).limit(1))[0] : undefined
  const at = g.receivedAt ?? g.createdAt
  return {
    key: ref,
    kind: "payin",
    who: g.giverAccount,
    amount: g.amount,
    at: at.toISOString(),
    status: g.status === "received" ? "added" : g.status === "failed" ? "failed" : "pending",
    txHash: g.txHash ?? null,
    source: {
      kind: "payin",
      tone: g.tone,
      from: g.giverAccount,
      name: g.displayName,
      note: g.note,
      showPublic: g.showPublic,
      link: link ? { id: link.id, createdBy: link.createdBy, amount: link.amount, createdAt: link.createdAt.toISOString() } : null,
    },
    topup: null,
  }
}

export async function getDepositDetails(
  deps: DepositDetailsDeps,
  s: SessionCtx,
  potParam: string,
  key: string,
): Promise<{ deposit: DepositDetailsWire; profiles: Record<string, { name: string }> }> {
  const { db, hub, cfg } = deps
  let potId: string
  try {
    potId = resolvePotId(potParam, cfg.hubId)
  } catch {
    throw notFound()
  }
  // members only, checked before anything about the key is read: the same 404 for a stranger, someone who left, a
  // key that doesn't exist and one from another Pot
  if (!(await isMember(hub, potId, s.user.nearAccount))) throw notFound()
  const kind = depositKeyKind(key)
  if (!kind) throw notFound()
  const deposit = kind === "payin" ? await payinDetails(db, potId, key) : await addDetails(db, potId, key)
  const accounts = [
    ...new Set([deposit.who, deposit.topup?.by, deposit.source.kind === "payin" ? deposit.source.link?.createdBy : undefined].filter((a): a is string => !!a)),
  ]
  const users = accounts.length
    ? await db.select({ a: appUser.nearAccount, n: appUser.displayName }).from(appUser).where(inArray(appUser.nearAccount, accounts))
    : []
  const profiles = Object.fromEntries(users.filter((u) => u.a && u.n).map((u) => [u.a!, { name: u.n! }]))
  return { deposit, profiles }
}

/**
 * POST /api/relay, after an add: keep where the money came from on the add's feed row (feed_event.data, no
 * migration), so the details can say it. `source` is the Add sheet's choice; a deposit id is kept only when it is
 * this person's deposit for this Pot. Best effort: never fails the relay.
 */
export async function noteAddSource(
  db: Db,
  o: { userId: string; relayId: string; txHash: string; source?: "demo" | "pot_dollars"; depositIntentId?: string },
): Promise<void> {
  if (!o.source && !o.depositIntentId) return
  const relay = (await db.select({ potId: relayLog.potId, userId: relayLog.userId }).from(relayLog).where(eq(relayLog.id, o.relayId)).limit(1))[0]
  if (!relay?.potId || relay.userId !== o.userId) return
  const potId = relay.potId
  const extra: Record<string, string> = {}
  if (o.source) extra.potSource = o.source
  if (o.depositIntentId) {
    const own = (
      await db
        .select({ id: depositIntent.id })
        .from(depositIntent)
        .where(and(eq(depositIntent.id, o.depositIntentId), eq(depositIntent.userId, o.userId), eq(depositIntent.potId, potId)))
        .limit(1)
    )[0]
    if (own) extra.depositIntentId = own.id
  }
  if (!Object.keys(extra).length) return
  await db
    .update(feedEvent)
    .set({ data: sql`${feedEvent.data} || ${JSON.stringify(extra)}::jsonb` })
    .where(and(eq(feedEvent.potId, potId), eq(feedEvent.kind, "contribution"), eq(feedEvent.txHash, o.txHash)))
}
