"use client"
// The public Pot record's data (/p/<slug>/record), one implementation per data source:
//  - mock: the browser mock world's Pot (every request), readable signed out too; a visitor gets what the live
//    record gives one (visitorRow: no notes, no chosen names or pictures);
//  - testnet: hub get_record (hub 1.1.0, every page; get_requests on a 1.0.0 hub) read by anyone over public RPC, plus
//    the feed route when the visitor is a member (names from the group, notes, receipts). A visitor sees only what's
//    public on chain: amounts, reasons, account-derived first names.
//  - gifts (hub 1.2.0): members see every gift's name and note; visitors only givers who chose to be shown.
import type { Api, RecordEntry, RequestView } from "@pot/sdk"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { t } from "@/i18n/t"
import { avatarOrNull } from "@/lib/avatars"
import type { GiftPageRes, GiftsRes, GiftWire, PublicGiftWire } from "@/lib/gifts-api"
import { IS_LIVE, daoOf } from "./config"
import { chain } from "./live/chain"
import { coverOf, nameFromAccount } from "./live/vm"
import { readRecord } from "./live/wave4"
import { useWorld } from "./mock/store"
import type { PersonVM } from "./mock/types"
import type { Micro } from "./money"
import { cents } from "./money"
import { GIFTS_ON } from "./gifts/flag"
import * as W from "./mock/world"
import { rowsFromEntries, rowsFromRequests, visitorRow, type RecordRow } from "./record"
import { useMe } from "./session"
import { useNow } from "./time"

export type RecordState =
  | { state: "loading" }
  | { state: "not_found" }
  | {
      state: "ready"
      slug: string
      potName: string
      emoji: string
      cover: number
      rows: RecordRow[]
      /** the visitor is a member (back to the Pot; names and notes shown) */
      member: boolean
      /** hub 1.2.0 gifts, newest first: amount + "Gift" for everyone; a name and note only where the giver chose */
      gifts?: RecordGiftRow[]
    }

/**
 * A gift on the record. Visitors: the amount and that it's a gift, the name/note only with the giver's "show me".
 * Members (signed in, in the Pot): every gift's name and note (members-only data, like the feed's).
 */
export interface RecordGiftRow {
  key: string
  at: number
  amount: Micro
  /** shown on the page: members get every giver's name; visitors only a name the giver chose to show */
  name: string | null
  note: string | null
  /** the name the giver chose to show publicly (the CSV uses only this one, whoever downloads it) */
  publicName: string | null
  txHash?: string
}

function useMockRecord(slug: string): RecordState {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo((): RecordState => {
    if (!world || me === undefined || now === 0) return { state: "loading" }
    const pot = W.potView(world, slug, me, now)
    if (!pot) return { state: "not_found" }
    const reqs = pot.feed.flatMap((f) => (f.kind === "request" ? [f.request] : []))
    const member = !!pot.me
    const rows = rowsFromRequests(reqs)
    // members see every gift's name and note (pot.gifts: the members' view); visitors only what the giver chose to show
    const byRef = new Map((pot.gifts?.items ?? []).map((g) => [g.ref, g]))
    const gifts: RecordGiftRow[] = GIFTS_ON
      ? (world.gifts ?? [])
          .filter((g) => g.pot === slug)
          .sort((a, b) => b.at - a.at)
          .map((g) => {
            const publicName = g.showPublic ? g.name : null
            const vm = member ? byRef.get(g.ref) : undefined
            return {
              key: g.ref,
              at: g.at,
              amount: cents(g.amount),
              name: member ? (vm?.from.name ?? g.name) : publicName,
              note: member ? (g.note ?? null) : g.showPublic ? (g.note ?? null) : null,
              publicName,
              txHash: W.mockTxHash(`${slug}:gift:${g.ref}`),
            }
          })
      : []
    return { state: "ready", slug, potName: pot.name, emoji: pot.emoji, cover: pot.cover, rows: member ? rows : rows.map((r) => visitorRow(r, nameFromAccount)), member, gifts }
  }, [world, me, now, slug])
}

const MONEY_OF: Partial<Record<RequestView["hubStatus"], RecordEntry["money"]>> = {
  approved: "paid",
  pending: "awaiting_approval",
  payout_failed: "failed",
  rejected: "declined",
  expired: "expired",
  removed: "withdrawn",
}

/** A 1.0.0 hub has no get_record: the same rows from get_requests (instant = the rules, else the group). */
export function entryOfRequest(r: RequestView): RecordEntry {
  const approved = r.hubStatus === "approved" || r.hubStatus === "payout_failed"
  return {
    requestId: r.id,
    proposalId: r.proposalId,
    requester: r.requester,
    payee: r.receiver,
    link: false,
    amount: r.amount,
    category: r.category,
    requestRef: r.requestRef,
    tier: r.tier ?? (r.path === "instant" ? "instant" : "group"),
    approvedBy: approved ? (r.path === "instant" ? "rules" : r.okBy ? "one_ok" : "group") : null,
    okBy: r.okBy ?? null,
    hubStatus: r.hubStatus,
    money: MONEY_OF[r.hubStatus] ?? "processing",
    linkStatus: r.linkStatus ?? null,
    createdAtMs: r.createdAtMs,
    updatedAtMs: r.updatedAtMs,
  }
}

async function fetchFeed(dao: string): Promise<Api.FeedRes | null> {
  try {
    const res = await fetch(`/api/pots/${encodeURIComponent(dao)}/feed?limit=100`, { credentials: "same-origin", cache: "no-store" })
    return res.ok ? ((await res.json()) as Api.FeedRes) : null
  } catch {
    return null
  }
}

interface LiveRecord {
  potName: string
  emoji: string
  slug: string
  entries: RecordEntry[]
  feed: Api.FeedRes | null
  /** hub 1.2.0: the members' gift list (403 for anyone else), else the public page's opted-in givers */
  gifts: { members: GiftWire[] } | { page: PublicGiftWire[] } | null
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { credentials: "same-origin", cache: "no-store" })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Members get every received gift with names and notes; anyone else, the public page's givers (only those who opted in). */
export async function fetchRecordGifts(slug: string): Promise<LiveRecord["gifts"]> {
  if (!GIFTS_ON) return null
  const mine = await getJson<GiftsRes>(`/api/pots/${encodeURIComponent(slug)}/gifts`)
  if (mine) return { members: mine.gifts.filter((g) => g.status === "received") }
  const page = await getJson<GiftPageRes>(`/api/give/${encodeURIComponent(slug)}`)
  return page?.page.on && page.givers ? { page: page.givers } : null
}

/** The live record's gift rows, newest first (members: every name and note; visitors: opted-in givers only). */
export function liveGiftRows(g: LiveRecord["gifts"], nameOf: (account: string) => string): RecordGiftRow[] {
  if (!g) return []
  const rows: RecordGiftRow[] =
    "members" in g
      ? g.members.map((x) => ({
          key: x.ref,
          at: Date.parse(x.at),
          amount: BigInt(x.amount),
          name: x.name ?? nameOf(x.from),
          note: x.note,
          publicName: x.showPublic ? x.name : null,
          ...(x.txHash ? { txHash: x.txHash } : {}),
        }))
      : g.page.map((x, i) => ({ key: `page:${i}:${x.at}`, at: Date.parse(x.at), amount: BigInt(x.amount), name: x.name, note: x.note, publicName: x.name }))
  return rows.sort((a, b) => b.at - a.at)
}

async function loadLiveRecord(slug: string): Promise<LiveRecord | null> {
  const c = chain()
  const dao = daoOf(slug)
  const pot = (await c.hub.getPot(dao as never)).value
  if (!pot) return null
  let entries = await readRecord(dao, c)
  if (entries === null) {
    entries = []
    for (let from = 0; from < pot.requestCount; from += 50) entries.push(...(await c.hub.getRequests(dao as never, from, 50)).value.map(entryOfRequest))
  }
  const [feed, gifts] = await Promise.all([fetchFeed(dao), fetchRecordGifts(pot.slug)])
  return { potName: pot.name, emoji: pot.emoji ?? "", slug: pot.slug, entries, feed, gifts }
}

function useLiveRecord(slug: string): RecordState {
  const q = useQuery({ queryKey: ["record", slug], queryFn: () => loadLiveRecord(slug), staleTime: 30_000, refetchInterval: 30_000 })
  return useMemo((): RecordState => {
    if (q.isError) return { state: "not_found" }
    if (q.data === undefined) return { state: "loading" }
    if (q.data === null) return { state: "not_found" }
    const { feed, entries } = q.data
    const profiles = feed?.profiles ?? {}
    const cache = new Map<string, PersonVM>()
    const person = (a: string): PersonVM => {
      const hit = cache.get(a)
      if (hit) return hit
      const name = profiles[a]?.name ?? nameFromAccount(a) ?? t("person.fallback")
      const p: PersonVM = { id: a, name, initials: W.initialsOf(name) || "•", joinIndex: null, avatar: avatarOrNull(profiles[a]?.avatar) }
      cache.set(a, p)
      return p
    }
    const txByRef: Record<string, string> = {}
    for (const it of feed?.items ?? []) if (it.type === "request" && it.requestRef && it.txHash) txByRef[it.requestRef] = it.txHash
    const rows = rowsFromEntries(entries, person, { notes: feed?.memos ?? {}, txByRef, receipts: feed?.receipts ?? [] })
    // the feed answers everyone; only members get its memos (M-7), so that's what says the visitor is one
    // hub 1.2.0 gifts: members' rows come from GET /api/pots/[pot]/gifts (received ones, rows the relayer marked via
    // onGiftReceived); visitors get the public page's opted-in givers only (an anonymous gift's amount isn't listed)
    const gifts = liveGiftRows(q.data.gifts, (a) => person(a).name)
    return { state: "ready", slug, potName: q.data.potName, emoji: q.data.emoji, cover: coverOf(slug, feed?.pot.gradient), rows, member: !!feed && feed.memos !== undefined, gifts }
  }, [q.isError, q.data, slug])
}

/** The Pot record (every spend) for /p/<slug>/record. */
export const useRecord: (slug: string) => RecordState = IS_LIVE ? useLiveRecord : useMockRecord
