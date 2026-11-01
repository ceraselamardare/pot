"use client"
// "Your activity" on testnet: GET /api/me/activity (paged, 30 a page) ⊕ the chain views of every Pot I'm in
// (the same bundles the Pots tab reads), merged by key in lib/client/activity.ts. The server row brings the
// time and the receipt; the chain brings the truth about statuses and fills in what the DB never saw
// (Pots seeded by script, or actions relayed elsewhere). Refreshed every 15 s while the tab is visible.
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { ActivityApiRes } from "@/lib/activity-api"
import { activityFromApi, activityOfPerson, mergeActivity, type ActivityItemVM } from "../activity"
import { api } from "./api"
import { useLivePots, useLivePotsOf } from "./queries"
import { useLiveSession } from "./session"
import { infoOf } from "../session"

export const PAGE = 30

export type ActivityState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; items: ActivityItemVM[]; hasMore: boolean; loadMore: () => void; loadingMore: boolean }

export const activityQueryKey = (me: string) => ["me", "activity", me] as const

export function useLiveActivity(): ActivityState {
  const session = useLiveSession()
  const me = session ? infoOf(session) : null
  const q = useInfiniteQuery({
    queryKey: activityQueryKey(me?.id ?? "-"),
    enabled: !!me,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: String(PAGE) })
      if (pageParam) qs.set("before", pageParam)
      return (await api<ActivityApiRes>("GET", `/api/me/activity?${qs}`)).data
    },
    getNextPageParam: (last) => last.nextCursor ?? null,
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
  const summaries = useLivePotsOf()
  const daos = useMemo(() => (summaries ?? []).map((s) => s.pot as string), [summaries])
  const pots = useLivePots(daos)
  const meId = me?.id ?? null
  const meName = me?.name ?? ""
  const chainItems = useMemo(() => {
    if (!pots || !meId) return null
    return pots.flatMap((p) => (p && p.me ? activityOfPerson(p, meId) : []))
  }, [pots, meId])
  const pages = q.data?.pages
  const serverItems = useMemo(
    () => (pages && meId ? pages.flatMap((p) => activityFromApi(p.items, { id: meId, name: meName }, p.profiles)) : null),
    [pages, meId, meName],
  )

  if (session === undefined) return { state: "loading" }
  if (!session) return { state: "ready", items: [], hasMore: false, loadMore: () => {}, loadingMore: false }
  const hasMore = !!q.hasNextPage
  if (serverItems) {
    const last = serverItems[serverItems.length - 1]
    const items = mergeActivity(serverItems, chainItems ?? [], { until: hasMore && last ? last.at : undefined })
    return { state: "ready", items, hasMore, loadMore: () => void q.fetchNextPage(), loadingMore: q.isFetchingNextPage }
  }
  // the DB is unreachable: the chain alone (no receipts, approximate times for approvals)
  if (q.isError) {
    if (chainItems && chainItems.length) return { state: "ready", items: mergeActivity([], chainItems), hasMore: false, loadMore: () => {}, loadingMore: false }
    if (chainItems || summaries === null) return { state: "error", retry: () => void q.refetch() }
  }
  return { state: "loading" }
}
