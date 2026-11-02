"use client"
// The public Pot record's data (/p/<slug>/record), one implementation per data source:
//  - mock: the browser mock world's Pot (every request), readable signed out too; a visitor gets what the live
//    record gives one (visitorRow: no notes, no chosen names or pictures);
//  - testnet: hub get_record (hub 1.1.0, every page; get_requests on a 1.0.0 hub) read by anyone over public RPC, plus
//    the feed route when the visitor is a member (names from the group, notes, receipts). A visitor sees only what's
//    public on chain: amounts, reasons, account-derived first names.
import type { Api, RecordEntry, RequestView } from "@pot/sdk"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { t } from "@/i18n/t"
import { avatarOrNull } from "@/lib/avatars"
import { IS_LIVE, daoOf } from "./config"
import { chain } from "./live/chain"
import { coverOf, nameFromAccount } from "./live/vm"
import { readRecord } from "./live/wave4"
import { useWorld } from "./mock/store"
import type { PersonVM } from "./mock/types"
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
    return { state: "ready", slug, potName: pot.name, emoji: pot.emoji, cover: pot.cover, rows: member ? rows : rows.map((r) => visitorRow(r, nameFromAccount)), member }
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
  return { potName: pot.name, emoji: pot.emoji ?? "", slug: pot.slug, entries, feed: await fetchFeed(dao) }
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
    return { state: "ready", slug, potName: q.data.potName, emoji: q.data.emoji, cover: coverOf(slug, feed?.pot.gradient), rows, member: !!feed && feed.memos !== undefined }
  }, [q.isError, q.data, slug])
}

/** The Pot record (every spend) for /p/<slug>/record. */
export const useRecord: (slug: string) => RecordState = IS_LIVE ? useLiveRecord : useMockRecord
