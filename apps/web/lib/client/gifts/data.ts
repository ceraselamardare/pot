"use client"
// The gifts data hooks, one implementation per data source (lib/client/config.ts), same view models:
//  - mock: the browser mock world (lib/client/mock/gifts.ts) through the store's useWorld;
//  - testnet: our gifts API (lib/gifts-api.ts) with TanStack Query (+ the hub's gifts view when the sdk has it).
// Pages outside the app shell (/g, /give) pass the server's first read as `initial`, so nothing flashes.
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { GiftLandingRes, GiftLinkWire, GiftPageRes, GiftsRes, MyGiftWire } from "@/lib/gifts-api"
import { giftsFromWire, landingFromWire, linkFromWire, myGiftFromWire, pageFromWire, type GiftLinkVM } from "./wire"
import { daoOf, IS_LIVE } from "../config"
import { api } from "../live/api"
import { useWorld } from "../mock/store"
import { activeGiftLinks, giftFeedItems, giftLandingOf, giftPageOf, myGiftsOf, type GiftLandingVM, type GiftPageVM, type MyGiftVM } from "../mock/gifts"
import type { PotVM } from "../mock/types"
import { cents, type Micro } from "../money"
import { useMe } from "../session"
import { useNow } from "../time"
import { GIFTS_ON } from "./flag"
import { toneOf } from "@/lib/gifts"
import { readGiftsView } from "./chain"

export type { GiftLandingVM, GiftPageVM, MyGiftVM } from "../mock/gifts"

export type { GiftLinkVM } from "./wire"

export const giftKeys = {
  links: (slug: string) => ["gifts", "links", slug] as const,
  pot: (slug: string) => ["gifts", "pot", slug] as const,
  landing: (id: string) => ["gifts", "landing", id] as const,
  page: (slug: string) => ["gifts", "page", slug] as const,
  mine: (me: string) => ["gifts", "mine", me] as const,
}

// ------------------------------------------------------------------------------------------------- the Pot (members)

/** The Pot with its gifts in it (the feed rows, the totals for the goal): mock potView has them; testnet adds them here. */
function useLiveWithGifts(pot: PotVM): PotVM {
  const q = useQuery({
    queryKey: giftKeys.pot(pot.slug),
    enabled: GIFTS_ON,
    queryFn: async () => {
      const [res, view] = await Promise.all([api<GiftsRes>("GET", `/api/pots/${pot.slug}/gifts`).then((r) => r.data), readGiftsView(daoOf(pot.slug))])
      return giftsFromWire(res, view)
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
  const gifts = q.data
  return useMemo(() => {
    if (!gifts) return pot
    const feed = [...pot.feed.filter((f) => f.kind !== "gift"), ...giftFeedItems(gifts)].sort((a, b) => b.at - a.at)
    return countGiftsInGoal({ ...pot, gifts, feed })
  }, [pot, gifts])
}

/** Gifts count toward a normal goal (an all-or-nothing one refuses them while it collects). */
export function countGiftsInGoal(pot: PotVM): PotVM {
  const g = pot.goalDetail
  if (!g || g.allOrNothing || !pot.gifts?.total) return pot
  return { ...pot, goalDetail: { ...g, totalIn: g.totalIn + pot.gifts.total } }
}

function useMockWithGifts(pot: PotVM): PotVM {
  return useMemo(() => countGiftsInGoal(pot), [pot])
}
/** Gifts off in this build: the Pot as it is, minus any gift rows. */
function withoutGifts(pot: PotVM): PotVM {
  return pot.gifts ? { ...pot, gifts: undefined, feed: pot.feed.filter((f) => f.kind !== "gift") } : pot
}

export const useWithGifts: (pot: PotVM) => PotVM = !GIFTS_ON ? withoutGifts : IS_LIVE ? useLiveWithGifts : useMockWithGifts

/** What the goal counts: money members put in + gifts (gifts count toward a normal goal). */
export const collectedOf = (pot: PotVM): Micro => pot.totalIn + (pot.gifts?.total ?? 0n)

// ------------------------------------------------------------------------------------------------- gift links (members)

function useMockGiftLinks(slug: string): GiftLinkVM[] | null | undefined {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo(() => {
    if (!world || me === undefined || !now) return undefined
    const list = activeGiftLinks(world, slug, me, now)
    return list ? list.map((l) => ({ id: l.id, amount: l.amount === null ? null : cents(l.amount), note: l.note ?? null, tone: toneOf(l.tone), reusable: l.reusable, uses: l.uses, expiresAt: l.expiresAt, createdBy: l.createdBy })) : null
  }, [world, me, now, slug])
}

function useLiveGiftLinks(slug: string): GiftLinkVM[] | null | undefined {
  const q = useQuery({
    queryKey: giftKeys.links(slug),
    queryFn: async () => (await api<{ links: GiftLinkWire[] }>("GET", `/api/pots/${slug}/gift-links`)).data.links.map(linkFromWire),
    staleTime: 5_000,
  })
  return q.isError ? null : q.data
}

/** The Pot's working gift links, newest first (undefined while loading, null when not allowed). */
export const useGiftLinks: (slug: string) => GiftLinkVM[] | null | undefined = IS_LIVE ? useLiveGiftLinks : useMockGiftLinks

// ------------------------------------------------------------------------------------------------- the giver's pages

function useMockLanding(slug: string, id: string, initial: GiftLandingVM | null): GiftLandingVM | null | undefined {
  const world = useWorld()
  const now = useNow()
  return useMemo(() => (world && now ? giftLandingOf(world, slug, id, now) : (initial ?? undefined)), [world, now, slug, id, initial])
}

function useLiveLanding(slug: string, id: string, initial: GiftLandingVM | null): GiftLandingVM | null | undefined {
  const q = useQuery({
    queryKey: giftKeys.landing(id),
    queryFn: async () => {
      try {
        const r = landingFromWire((await api<GiftLandingRes>("GET", `/api/gift-links/${id}`)).data)
        return r.pot.slug === slug ? r : null
      } catch (e) {
        if ((e as { reason?: string }).reason === "not_found") return null
        throw e
      }
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
  return q.data === undefined ? (initial ?? undefined) : q.data
}

/** /g/<slug>/<id>: the gift link's landing (undefined while loading, null when there's no such link). */
export const useGiftLanding: (slug: string, id: string, initial: GiftLandingVM | null) => GiftLandingVM | null | undefined = IS_LIVE ? useLiveLanding : useMockLanding

function useMockGiftPage(slug: string, initial: GiftPageVM | null): GiftPageVM | null | undefined {
  const world = useWorld()
  return useMemo(() => (world ? giftPageOf(world, slug) : (initial ?? undefined)), [world, slug, initial])
}

function useLiveGiftPage(slug: string, initial: GiftPageVM | null): GiftPageVM | null | undefined {
  const q = useQuery({
    queryKey: giftKeys.page(slug),
    queryFn: async () => {
      try {
        return pageFromWire((await api<GiftPageRes>("GET", `/api/give/${slug}`)).data)
      } catch (e) {
        if ((e as { reason?: string }).reason === "not_found") return null
        throw e
      }
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
  return q.data === undefined ? (initial ?? undefined) : q.data
}

/** /give/<slug>: the public gift page (off = only the Pot's name). */
export const useGiftPage: (slug: string, initial: GiftPageVM | null) => GiftPageVM | null | undefined = IS_LIVE ? useLiveGiftPage : useMockGiftPage

// ------------------------------------------------------------------------------------------------- my gifts (You)

function useMockMyGifts(): MyGiftVM[] | undefined {
  const world = useWorld()
  const me = useMe()
  return useMemo(() => (!GIFTS_ON ? [] : world && me ? myGiftsOf(world, me) : me === null ? [] : undefined), [world, me])
}

function useLiveMyGifts(): MyGiftVM[] | undefined {
  const me = useMe()
  const q = useQuery({
    queryKey: giftKeys.mine(me ?? "-"),
    enabled: GIFTS_ON && !!me,
    queryFn: async () => (await api<{ gifts: MyGiftWire[] }>("GET", "/api/me/gifts")).data.gifts.filter((g) => g.status === "received").map(myGiftFromWire),
    staleTime: 10_000,
  })
  if (!GIFTS_ON || me === null) return []
  return q.isError ? [] : q.data
}

/** The gifts I sent (You → Your activity), newest first. */
export const useMyGifts: () => MyGiftVM[] | undefined = IS_LIVE ? useLiveMyGifts : useMockMyGifts
