"use client"
// "Ask for a top-up" data hooks, one implementation per data source (lib/client/config.ts), same view models:
//  - mock: the browser mock world (potView already carries `topup` and the feed rows; lib/client/mock/topups.ts);
//  - testnet: our API (lib/topups-api.ts) with TanStack Query, polled every 10 s on the Pot (progress is read from the
//    hub by the server) and 15 s for Requests / You.
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { MyTopupsRes, TopupsRes } from "@/lib/topups-api"
import { IS_LIVE } from "../config"
import { api } from "../live/api"
import { useWorld } from "../mock/store"
import type { PotVM, TopupVM } from "../mock/types"
import { inboxTopupsOf, myTopupAsksOf } from "../mock/world"
import { useMe } from "../session"
import { useNow } from "../time"
import { personResolver, topupFromWire, withTopupList } from "./vm"

export const topupKeys = {
  all: ["topups"] as const,
  pot: (slug: string) => ["topups", "pot", slug] as const,
  mine: (me: string) => ["topups", "mine", me] as const,
}

/** How often the Pot screen reads its asks again (testnet). */
export const TOPUPS_POLL_MS = 10_000

function useLiveWithTopups(pot: PotVM): PotVM {
  const me = pot.me?.person.id ?? null
  const q = useQuery({
    queryKey: topupKeys.pot(pot.slug),
    enabled: !!me,
    queryFn: async () => (await api<TopupsRes>("GET", `/api/pots/${encodeURIComponent(pot.slug)}/topups`)).data.topups,
    staleTime: 5_000,
    refetchInterval: TOPUPS_POLL_MS,
  })
  const wire = q.data
  return useMemo(() => {
    if (!wire) return pot
    const personOf = personResolver(pot.members.map((m) => m.person))
    return withTopupList(
      pot,
      wire.map((w) => topupFromWire(w, personOf, me)),
    )
  }, [pot, wire, me])
}

/** The mock's potView already has them. */
const useMockWithTopups = (pot: PotVM): PotVM => pot

/** The Pot with its asks: `pot.topup` (the open one, null when none) and the feed rows. */
export const useWithTopups: (pot: PotVM) => PotVM = IS_LIVE ? useLiveWithTopups : useMockWithTopups

function useLiveMine(): { open: TopupVM[]; mine: TopupVM[] } | null | undefined {
  const me = useMe()
  const q = useQuery({
    queryKey: topupKeys.mine(me ?? "-"),
    enabled: !!me,
    queryFn: async () => (await api<MyTopupsRes>("GET", "/api/me/topups")).data,
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
  const data = q.data
  return useMemo(() => {
    if (me === null) return { open: [], mine: [] }
    if (q.isError) return null
    if (!data || !me) return undefined
    const personOf = personResolver([], data.profiles)
    return { open: data.open.map((w) => topupFromWire(w, personOf, me)), mine: data.mine.map((w) => topupFromWire(w, personOf, me)) }
  }, [data, me, q.isError])
}

function useLiveInboxTopups(): TopupVM[] | null {
  return useLiveMine()?.open ?? null
}

function useLiveMyTopupAsks(): TopupVM[] | undefined {
  const r = useLiveMine()
  return r === null ? [] : r?.mine
}

function useMockInboxTopups(): TopupVM[] | null {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo(() => (world && me && now ? inboxTopupsOf(world, me, now) : me === null ? [] : null), [world, me, now])
}

function useMockMyTopupAsks(): TopupVM[] | undefined {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo(() => (world && me && now ? myTopupAsksOf(world, me, now) : me === null ? [] : undefined), [world, me, now])
}

/** Requests: open asks in my Pots where I haven't added my part (null while loading or unreadable). */
export const useInboxTopups: () => TopupVM[] | null = IS_LIVE ? useLiveInboxTopups : useMockInboxTopups

/** You → Your activity: the asks I made, newest first (undefined while loading). */
export const useMyTopupAsks: () => TopupVM[] | undefined = IS_LIVE ? useLiveMyTopupAsks : useMockMyTopupAsks
