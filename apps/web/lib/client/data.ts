"use client"
// The UI's data hooks, one implementation per data source (lib/client/config.ts):
//  - mock: the persistent browser mock world (lib/client/mock/store.ts), memoised on (world, me, now);
//  - testnet: TanStack queries over @pot/sdk ChainViews + the feed route (lib/client/live/queries.ts), with the
//    3 s visible-only heartbeat. Both return the same view models, so components don't change.
// NEXT_PUBLIC_DATA_SOURCE is inlined at build time: each build runs one branch, so hook order is stable.
import { useMemo, useState } from "react"
import { IS_LIVE } from "./config"
import { useNow } from "./time"
import { useWorld } from "./mock/store"
import * as W from "./mock/world"
import type { PotCardVM, PotVM, RequestVM } from "./mock/types"
import { useLiveCards, useLivePot, useLiveRequests, useLiveUsdcBalance } from "./live/queries"
import { cents, type Micro } from "./money"
import { activityOfPerson, mergeActivity } from "./activity"
import { PAGE as ACTIVITY_PAGE, useLiveActivity, type ActivityState } from "./live/activity"
import { useMe } from "./session"
import { useInboxTopups } from "./topups/data"

export { useMe, useMeInfo } from "./session"
export type { ActivityState } from "./live/activity"

export type Loadable<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "not_found" }
  | { state: "not_member"; name: string }

function useMockPot(slug: string): Loadable<PotVM> {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo((): Loadable<PotVM> => {
    if (!world || me === undefined || now === 0) return { state: "loading" }
    const pot = W.potView(world, slug, me, now)
    if (!pot) return { state: "not_found" }
    if (!pot.me) return { state: "not_member", name: pot.name }
    return { state: "ready", data: pot }
  }, [world, me, now, slug])
}

function useMockPots(): PotCardVM[] | null {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo(() => (world && me && now ? W.potsOf(world, me, now) : null), [world, me, now])
}

function useMockRequests(): W.RequestsVM | null {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo(() => (world && me && now ? W.requestsOf(world, me, now) : null), [world, me, now])
}

function useMockRequest(slug: string, id: number | null): RequestVM | null | undefined {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo(() => {
    if (!world || me === undefined || !now) return undefined
    if (id === null) return null
    return W.requestView(world, slug, id, me, now)
  }, [world, me, now, slug, id])
}

function useLiveRequest(slug: string, id: number | null): RequestVM | null | undefined {
  const pot = useLivePot(slug)
  return useMemo(() => {
    if (id === null) return null
    if (pot.state === "loading") return undefined
    if (pot.state !== "ready") return null
    for (const f of pot.data.feed) if (f.kind === "request" && f.request.id === id) return f.request
    return null
  }, [pot, id])
}

/** One Pot with everything its screen needs. */
export const usePot: (slug: string) => Loadable<PotVM> = IS_LIVE ? useLivePot : useMockPot

/** Pots home cards (null while loading). */
export const usePots: () => PotCardVM[] | null = IS_LIVE ? useLiveCards : useMockPots

/** Requests tab across my Pots (null while loading). */
export const useRequests: () => W.RequestsVM | null = IS_LIVE ? useLiveRequests : useMockRequests

/** One request (undefined while loading, null when gone). */
export const useRequest: (slug: string, id: number | null) => RequestVM | null | undefined = IS_LIVE ? useLiveRequest : useMockRequest

export function useWaitingCount(): number {
  const r = useRequests()
  // "Ask for a top-up": an open ask I haven't added my part to waits on me too
  const topups = useInboxTopups()
  return (r?.waiting.length ?? 0) + (topups?.length ?? 0)
}

/** The mock's own Pot dollars: what Pots paid this person minus what they added from them (world.ownDollarsOf). */
function useMockOwnDollars(account: string | null): Micro | undefined {
  const world = useWorld()
  return useMemo(() => (world && account ? cents(W.ownDollarsOf(world, account)) : undefined), [world, account])
}
/** The signed-in person's own Pot dollars (usdc.ft_balance_of(me), 10 s heartbeat while `enabled`). */
export const useOwnDollars: (account: string | null, enabled: boolean) => Micro | undefined = IS_LIVE ? useLiveUsdcBalance : useMockOwnDollars

function useMockActivity(): ActivityState {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  const [shown, setShown] = useState(ACTIVITY_PAGE)
  const all = useMemo(() => {
    if (!world || !me || !now) return null
    const items = Object.values(world.pots)
      .filter((p) => W.isMember(p, me))
      .flatMap((p) => {
        const v = W.potView(world, p.slug, me, now)
        return v ? activityOfPerson(v, me) : []
      })
    return mergeActivity([], items)
  }, [world, me, now])
  if (me === undefined || (me && !all)) return { state: "loading" }
  const items = all ?? []
  return { state: "ready", items: items.slice(0, shown), hasMore: items.length > shown, loadMore: () => setShown((n) => n + ACTIVITY_PAGE), loadingMore: false }
}

/** "Your activity" on You: my own actions across my Pots, newest first (server history ⊕ chain on testnet). */
export const useMyActivity: () => ActivityState = IS_LIVE ? useLiveActivity : useMockActivity
