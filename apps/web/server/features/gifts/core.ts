// Gifts (notes/gifts-plan.md, approved 2026-11-02): the shared pieces of server/features/gifts: the FLAG_GIFTS switch,
// the dependencies, the gifts' own quota table, Pot info for pages outside the Pot, "is it taking gifts?" and the row →
// wire shapes. Off-chain only: no transactions are signed here (the giver signs ft_transfer_call through the relayer).
import "server-only"
import { and, eq, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { chargeQuotas, nextUtcDay, type QuotaCharge } from "@/db/quota"
import { gift, giftLink, giftPage, pot } from "@/db/schema"
import { giftLinkStatus, type GiftTaking } from "@/lib/gifts"
import type { GiftLinkWire, GiftPageWire, GiftPotWire, GiftTotalsWire, GiftWire, MyGiftWire } from "@/lib/gifts-api"
import type { HubReader } from "../../chain/hub"
import { RpcUnavailableError } from "../../chain/rpc"
import type { Config } from "../../config"
import { ApiError, unavailable } from "../../http/errors"
import { isMember } from "../notes"
import type { GiftChain } from "./chain"

export interface GiftDeps {
  db: Db
  hub: HubReader
  cfg: Config
  chain: GiftChain
  /** ms; tests pin the clock */
  now?: () => number
}

export const nowOf = (deps: { now?: () => number }) => (deps.now ?? Date.now)()

/** A pending gift younger than this holds a one-time link (the giver is signing). */
export const RESERVATION_MS = 10 * 60_000
/** Pending gifts older than this are ignored by everything (never received, never failed). */
export const PENDING_TTL_MS = 86_400_000

// ---------------------------------------------------------------------------------------------
// the flag

/** FLAG_GIFTS = "true" / "1" → on; unset (or anything else) → off. Read per call (tests flip it). */
export function giftsEnabled(): boolean {
  const v = (process.env.FLAG_GIFTS ?? "").trim().toLowerCase()
  return v === "true" || v === "1"
}

/** Every gifts route answers 404 while the flag is off. */
export function assertGiftsOn(): void {
  if (!giftsEnabled()) throw new ApiError("not_found", { detail: { cause: "gifts_off_flag" } })
}

// ---------------------------------------------------------------------------------------------
// quotas: the gifts' own table (server/quotas.ts style: QUOTA_<NAME> overrides; prod vs preview by cfg.quotaScale)

/** name → [prod, preview] */
const GIFT_QUOTAS: Record<string, [bigint, bigint]> = {
  gifts_user_link: [20n, 20n], // gift links created per member per UTC day
  gifts_user_link_burst: [10n, 10n], // per minute
  gifts_user_start: [20n, 20n], // gifts started per person per day
  gifts_user_start_burst: [10n, 10n], // per minute
  gifts_ip_start: [60n, 60n], // gifts started per IP per day
  gifts_pot_start: [200n, 200n], // gifts started to one Pot per day
  gifts_user_patch: [30n, 30n], // name/note edits per day
  gifts_user_page: [30n, 30n], // gift page changes per day
  gifts_ip_read: [120n, 120n], // public landing / gift page reads per IP per minute
}

export function giftLimit(name: keyof typeof GIFT_QUOTAS | string, cfg: Pick<Config, "quotaScale">): bigint {
  const env = process.env[`QUOTA_${name.toUpperCase()}`]
  if (env && /^[0-9]+$/.test(env)) return BigInt(env)
  const d = GIFT_QUOTAS[name]
  if (!d) throw new Error(`unknown gift quota ${name}`)
  return cfg.quotaScale === "prod" ? d[0] : d[1]
}

/** Charge all or none; a per-minute counter → 429 rate_limited (+ retryAfterMs), a daily one → 429 quota_exceeded. */
export async function chargeGiftQuotas(db: Db, charges: QuotaCharge[]): Promise<void> {
  const q = await chargeQuotas(db, charges)
  if (q.ok) return
  if (q.failed.period === "minute")
    throw new ApiError("rate_limited", { retryAfterMs: 60_000 - (Date.now() % 60_000), detail: { limit: Number(q.failed.limit) } })
  throw new ApiError("quota_exceeded", { detail: { family: "gifts", limit: q.failed.limit.toString(), resetsAt: nextUtcDay().toISOString() } })
}

/** The public reads (landing, gift page): 120/min per IP (`ipHash` from server/http/context.ts). */
export async function chargePublicRead(deps: Pick<GiftDeps, "db" | "cfg">, ip: string): Promise<void> {
  await chargeGiftQuotas(deps.db, [{ subject: `ip:${ip}`, action: "gift_read", amount: 1n, limit: giftLimit("gifts_ip_read", deps.cfg), period: "minute" }])
}

// ---------------------------------------------------------------------------------------------
// membership, Pot info, taking

/** Members only: hub.get_members (active), on every call, before any gift row is read. */
export async function requireGiftMember(hub: HubReader, potId: string, account: string): Promise<void> {
  if (!(await isMember(hub, potId, account))) throw new ApiError("not_a_member")
}

export interface PotInfo {
  wire: GiftPotWire
}

/**
 * What a page outside the Pot may show (all on the ledger): name, emoji, status, how many people are in it.
 * The hub first (cached 10 s), the pot cache row when the RPC is down; null when the hub doesn't know the Pot.
 */
export async function potInfo(deps: Pick<GiftDeps, "db" | "hub">, potId: string): Promise<GiftPotWire | null> {
  const { db, hub } = deps
  let pv: Awaited<ReturnType<HubReader["getPot"]>> | undefined
  try {
    pv = await hub.getPot(potId)
  } catch (e) {
    if (!(e instanceof RpcUnavailableError)) throw e
  }
  if (pv === null) return null
  if (pv === undefined) {
    const row = (await db.select().from(pot).where(eq(pot.daoId, potId)).limit(1))[0]
    if (!row) throw unavailable("rpc", 3_000)
    return { pot: row.daoId, slug: row.slug, name: row.name, emoji: row.emoji ?? "", members: 0, status: row.status }
  }
  let members = pv.member_count
  try {
    members = (await hub.getMembers(potId)).filter((m) => m.status === "active").length
  } catch {
    // the Pot view's own count
  }
  return { pot: pv.pot, slug: pv.slug, name: pv.name, emoji: pv.emoji ?? "", members, status: pv.status }
}

/** closed (not open) · off (a member turned gifts off) · goal (an all-or-nothing goal is collecting) · yes. */
export async function takingOf(chain: GiftChain, potId: string, status: GiftPotWire["status"]): Promise<GiftTaking> {
  if (status !== "open") return "closed"
  const [g, goal] = await Promise.all([chain.giftsOf(potId), chain.goalCollecting(potId)])
  // null = unknown (a 1.1.0 hub, or the RPC is down): treated as on; the hub checks again when the money arrives
  // (and the relayer refuses a gift to a 1.1.0 hub: 409 gifts_unavailable {why: hub_not_ready})
  if (g?.refusal === "pot_not_open") return "closed"
  if (g && !g.on) return "off"
  if (goal || g?.refusal === "goal_collecting" || g?.refusal === "goal_missed") return "goal"
  return "yes"
}

/** Totals: the hub's own count when it has one (hub 1.2.0 gifts_total / gifts_count), else our received rows. */
export async function totalsOf(deps: Pick<GiftDeps, "db" | "chain">, potId: string): Promise<GiftTotalsWire> {
  const g = await deps.chain.giftsOf(potId)
  if (g) return { amount: g.total.toString(), count: g.count }
  const [r] = await deps.db
    .select({ s: sql<string>`coalesce(sum(${gift.amount}), 0)::text`, n: sql<number>`count(*)::int` })
    .from(gift)
    .where(and(eq(gift.potId, potId), eq(gift.status, "received")))
  return { amount: r?.s ?? "0", count: Number(r?.n ?? 0) }
}

export async function pageOf(db: Db, potId: string): Promise<GiftPageWire> {
  const row = (await db.select().from(giftPage).where(eq(giftPage.potId, potId)).limit(1))[0]
  return { on: !!row?.on, line: row?.line ?? null }
}

// ---------------------------------------------------------------------------------------------
// shapes

type LinkRow = typeof giftLink.$inferSelect
type GiftRow = typeof gift.$inferSelect

export const linkStatusOf = (r: LinkRow, now: number) =>
  giftLinkStatus({ revokedAt: r.revokedAt ? r.revokedAt.getTime() : null, expiresAt: r.expiresAt.getTime(), reusable: r.reusable, uses: r.uses }, now)

export const linkShape = (r: LinkRow, slug: string, now: number): GiftLinkWire => ({
  id: r.id,
  pot: r.potId,
  slug,
  createdBy: r.createdBy,
  amount: r.amount,
  note: r.note,
  reusable: r.reusable,
  uses: r.uses,
  expiresAt: r.expiresAt.toISOString(),
  revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
  status: linkStatusOf(r, now),
})

const giftAt = (r: GiftRow) => (r.receivedAt ?? r.createdAt).toISOString()

export const giftShape = (r: GiftRow): GiftWire => ({
  ref: r.ref,
  from: r.giverAccount,
  name: r.displayName,
  note: r.note,
  showPublic: r.showPublic,
  amount: r.amount,
  at: giftAt(r),
  status: r.status,
  txHash: r.txHash,
  linkId: r.linkId,
})

export const myGiftShape = (r: GiftRow, p: { slug: string; name: string; emoji: string | null }): MyGiftWire => ({
  ref: r.ref,
  pot: r.potId,
  slug: p.slug,
  potName: p.name,
  potEmoji: p.emoji ?? "",
  amount: r.amount,
  name: r.displayName,
  note: r.note,
  showPublic: r.showPublic,
  status: r.status,
  at: giftAt(r),
  txHash: r.txHash,
})
