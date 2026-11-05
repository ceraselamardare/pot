"use client"
// Live reads (F-05, frontend-architecture §3.2-3.5): TanStack Query over @pot/sdk ChainViews + the feed route.
//  - Heartbeat: ['pot', dao, 'view'] (hub get_pot, `seq` is the change counter) and ['pot', dao, 'balance']
//    (usdc.ft_balance_of(dao)) every 3 s on the Pot screen, 10 s on lists; only while the tab is visible
//    (refetchIntervalInBackground: false).
//  - Everything else is the per-Pot bundle (members, requests, the DAO proposals behind them, the feed route,
//    this device's invite): refetched when `seq` or the balance changes, and every 3 s while a vote is open
//    (votes land on the DAO, which the hub's `seq` only sees after the relayer's `sync`).
//  - Every chain value keeps its block height (Viewed<T>); actions settle when views reach their block (§3.5).
import type { Api, ClosePreview, GoalView, LinkView, Micro, MemberView, PotSummary, PotView, Proposal, RequestView, TrustView, Viewed } from "@pot/sdk"
import { useQueries, useQuery, type QueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { daoOf, sdkConfig } from "../config"
import { queryClient } from "../query"
import { useNow } from "../time"
import type { PotCardVM, PotVM, RequestVM } from "../mock/types"
import { chain, signingChain } from "./chain"
import { loadInvite } from "./invites"
import { refreshQuery } from "./refresh"
import { useLiveSession } from "./session"
import { DEFAULT_GOAL_EACH, liveCardVM, livePotVM, type LiveBundle, type LiveContext } from "./vm"
import { readGoal, readTrusts } from "./wave4"
import { readLinks } from "./vm-paylink"
import type { AvatarId } from "@/lib/avatars"

export const qk = {
  potsOf: (me: string) => ["potsOf", me] as const,
  pot: (dao: string) => ["pot", dao] as const,
  view: (dao: string) => ["pot", dao, "view"] as const,
  balance: (dao: string) => ["pot", dao, "balance"] as const,
  bundle: (dao: string) => ["pot", dao, "bundle"] as const,
  usdc: (account: string) => ["usdc", "balance", account] as const,
}

export interface Bundle {
  members: MemberView[]
  requests: RequestView[]
  /** DAO proposals behind the requests (+ the close), read by proposalsQuery */
  proposalIds: number[]
  feed: Api.FeedRes | null
  invite: LiveBundle["invite"]
  /** hub preview_close at the live balance (open Pots only) */
  closePreview: ClosePreview | null
  /** hub 1.1.0: every member's earned trust ([] on a 1.0.0 hub) */
  trusts?: TrustView[]
  /** hub 1.1.0: the goal with a date (null without one) */
  goal?: GoalView | null
  /** hub 1.1.0 pay by link: get_link per link request */
  links?: Record<number, LinkView>
  /** lowest block height among the chain reads in it */
  blockHeight: number
}

export const viewQuery = (dao: string, every: number | false = 3000) => ({
  queryKey: qk.view(dao),
  queryFn: (): Promise<Viewed<PotView | null>> => chain().hub.getPot(dao as never),
  staleTime: 0,
  refetchInterval: every,
})

export const balanceQuery = (dao: string, every: number | false = 3000) => ({
  queryKey: qk.balance(dao),
  queryFn: (): Promise<Viewed<Micro>> => chain().usdc.balanceOf(dao as never),
  staleTime: 0,
  refetchInterval: every,
})

async function fetchFeed(dao: string): Promise<Api.FeedRes | null> {
  try {
    const res = await fetch(`/api/pots/${encodeURIComponent(dao)}/feed?limit=100`, { credentials: "same-origin", cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as Api.FeedRes
  } catch {
    return null
  }
}

export async function fetchBundle(qc: QueryClient, dao: string): Promise<Bundle> {
  const c = chain()
  const [view, balance] = await Promise.all([qc.fetchQuery({ ...viewQuery(dao), staleTime: 1500 }), qc.fetchQuery({ ...balanceQuery(dao), staleTime: 1500 })])
  const pot = view.value
  if (!pot) return { members: [], requests: [], proposalIds: [], feed: null, invite: null, closePreview: null, blockHeight: view.blockHeight }
  const from = Math.max(0, pot.requestCount - 50)
  const [members, requests, feed, stored, closePreview, trusts, goal] = await Promise.all([
    c.hub.getMembers(dao as never, balance.value),
    pot.requestCount > 0 ? c.hub.getRequests(dao as never, from, 50) : Promise.resolve({ value: [] as RequestView[], blockHeight: view.blockHeight }),
    fetchFeed(dao),
    loadInvite(dao).catch(() => null),
    pot.status === "open"
      ? c.hub
          .previewClose(dao as never, balance.value)
          .then((v) => v.value)
          .catch(() => null)
      : Promise.resolve(null),
    // hub 1.1.0 views: only for Pots with trust on / a goal (a 1.0.0 hub reads as "everything off" and has no views)
    pot.extras?.trust ? readTrusts(dao, c) : Promise.resolve([] as TrustView[]),
    pot.extras?.goal ? readGoal(dao, c) : Promise.resolve(null),
  ])
  const ids = requests.value.map((r) => r.proposalId).filter((x): x is number => x !== null)
  if (pot.closeProposalId !== undefined && pot.closeProposalId !== null) ids.push(pot.closeProposalId)
  if (pot.openRulesProposal !== undefined && pot.openRulesProposal !== null) ids.push(pot.openRulesProposal)
  let invite: Bundle["invite"] = null
  if (stored) {
    const iv = await c.hub.getInvite(dao as never, stored.pk as never).catch(() => null)
    invite = { pk: stored.pk, secret: stored.secret, view: iv?.value ?? null }
  }
  return {
    members: members.value,
    requests: requests.value,
    proposalIds: [...new Set(ids)].sort((a, b) => a - b),
    feed,
    invite,
    closePreview,
    trusts,
    goal,
    links: await readLinks(dao, requests.value, c),
    blockHeight: Math.min(members.blockHeight, requests.blockHeight),
  }
}

const bundleQuery = (qc: QueryClient, dao: string) => ({
  queryKey: qk.bundle(dao),
  queryFn: () => fetchBundle(qc, dao),
  staleTime: 30_000,
})

export interface ProposalsData {
  byId: Record<number, Proposal>
  blockHeight: number
}
const NO_PROPOSALS: ProposalsData = { byId: {}, blockHeight: 0 }

/**
 * The DAO proposals behind a Pot's requests, polled every 3 s only while one is open: votes land on the DAO,
 * which the hub's `seq` only sees after the relayer's `sync` (one RPC call per tick).
 * Read through the unbudgeted client (QA 2026-10-22): the Pot screen holds its last ready state until this
 * query answers for a new request, and right after an action the tab's 100/min FIFO bucket is saturated by
 * the settle loops and bundle refetches, so a queued read here kept "Approvals · 1 of 2" off screen for > 30 s
 * (testnet E-d). It is at most one call per 3 s, only while a proposal is open.
 */
export const proposalsQuery = (dao: string, ids: number[]) => ({
  queryKey: [...qk.pot(dao), "proposals", ids.join(",")] as const,
  queryFn: async (): Promise<ProposalsData> => {
    if (!ids.length) return NO_PROPOSALS
    const lo = ids[0]!
    const hi = ids[ids.length - 1]!
    const ps = await signingChain().dao.getProposals(dao as never, lo, Math.min(100, hi - lo + 1))
    const byId: Record<number, Proposal> = {}
    for (const p of ps.value) byId[p.id] = p
    return { byId, blockHeight: ps.blockHeight }
  },
  staleTime: 2000,
  enabled: ids.length > 0,
  // a new request adds an id (a new key): keep showing the previous answer meanwhile, never back to loading
  placeholderData: <T,>(prev: T | undefined): T | undefined => prev,
  refetchInterval: (q: { state: { data?: ProposalsData } }) =>
    q.state.data && Object.values(q.state.data.byId).some((p) => p.status === "InProgress") ? 3000 : false,
})

/** Off-chain "$X each" goal: the creator's choice on this device, else Create's suggested $150 (D-61). */
/** Did the creator set "$X each" on this device? Other devices only have Create's default. */
export function goalEachChosenHere(slug: string): boolean {
  try {
    return /^[0-9]+$/.test(localStorage.getItem(`pot.goal.${slug}`) ?? "")
  } catch {
    return false
  }
}

export function goalEachOf(slug: string): Micro | null {
  try {
    const v = localStorage.getItem(`pot.goal.${slug}`)
    if (v === "off") return null
    if (v && /^[0-9]+$/.test(v)) return BigInt(v)
  } catch {}
  return DEFAULT_GOAL_EACH
}

/** Refresh the bundle when the heartbeat sees a change (seq, totals, balance); coalesced, never cancelling (refresh.ts). */
function useChangeDetector(dao: string, view: PotView | null | undefined, balance: Micro | undefined) {
  const sig = view
    ? `${view.seq}|${view.totalIn}|${view.memberCount}|${view.status}|${view.requestCount}|${view.openRulesProposal ?? ""}|${view.rulesVersion}|${balance ?? ""}`
    : null
  const prev = useRef<string | null>(null)
  useEffect(() => {
    if (sig === null) return
    if (prev.current !== null && prev.current !== sig) void refreshQuery(queryClient(), qk.bundle(dao))
    prev.current = sig
  }, [dao, sig])
}

function ctxOf(me: string | null, myName: string | undefined, now: number, slug: string, myAvatar?: AvatarId | null): LiveContext {
  return { me, myName, myAvatar, now, goalEach: goalEachOf(slug), goalEachChosen: goalEachChosenHere(slug) }
}

export type LivePotState =
  | { state: "loading" }
  | { state: "ready"; data: PotVM }
  | { state: "not_found" }
  | { state: "not_member"; name: string }

/** The Pot screen: 3 s heartbeat + bundle. */
export function useLivePot(slug: string, every: number | false = 3000): LivePotState {
  const session = useLiveSession()
  const now = useNow()
  const dao = daoOf(slug)
  const qc = queryClient()
  const view = useQuery(viewQuery(dao, every))
  const balance = useQuery(balanceQuery(dao, every))
  const pot = view.data?.value
  const bundle = useQuery({ ...bundleQuery(qc, dao), enabled: !!pot })
  const ids = bundle.data?.proposalIds ?? []
  const proposals = useQuery(proposalsQuery(dao, ids))
  useChangeDetector(dao, pot, balance.data?.value)
  const me = session ? session.accountId : null
  const myName = session?.displayName
  const myAvatar = session?.avatar ?? null
  const state = useMemo((): LivePotState & { why?: string } => {
    if (session === undefined || now === 0) return { state: "loading", why: "session" }
    if (view.isError && !view.data) return { state: "not_found" }
    if (!view.data || !balance.data) return { state: "loading", why: "heartbeat" }
    if (!pot) return { state: "not_found" }
    if (!bundle.data) return { state: "loading", why: "bundle" }
    if (bundle.data.proposalIds.length && !proposals.data) return { state: "loading", why: "proposals" }
    const vm = livePotVM(
      { dao, usdcId: sdkConfig().usdcId, hubId: sdkConfig().hubId, view: pot, balance: balance.data.value, ...bundle.data, proposals: proposals.data?.byId ?? {} },
      ctxOf(me, myName, now, slug, myAvatar),
    )
    if (!vm.me) return { state: "not_member", name: vm.name }
    return { state: "ready", data: vm }
  }, [session, now, view.isError, view.data, balance.data, pot, bundle.data, proposals.data, dao, me, myName, myAvatar, slug])
  // Once ready, a transient refetch never drops the screen back to its skeleton (that would unmount open
  // sheets mid-flow); the last ready view stays until fresh data arrives.
  const [last, setLast] = useState<{ slug: string; state: LivePotState } | null>(null)
  if (state.state === "ready" && last?.state !== state) setLast({ slug, state })
  if (state.state === "loading" && last?.slug === slug) return last.state
  return state
}

/** Several Pots at list cadence (Pots home, Requests): 10 s heartbeat, bundles on change. */
export function useLivePots(daos: string[]): (PotVM | null)[] | null {
  const session = useLiveSession()
  const now = useNow()
  const qc = queryClient()
  const views = useQueries({ queries: daos.map((d) => viewQuery(d, 10_000)) })
  const balances = useQueries({ queries: daos.map((d) => balanceQuery(d, 10_000)) })
  const bundles = useQueries({
    queries: daos.map((d, i) => ({ ...bundleQuery(qc, d), enabled: !!views[i]?.data?.value })),
  })
  const proposals = useQueries({ queries: daos.map((d, i) => proposalsQuery(d, bundles[i]?.data?.proposalIds ?? [])) })
  const sig = daos.map((d, i) => `${d}:${views[i]?.data?.value?.seq ?? ""}:${balances[i]?.data?.value ?? ""}`).join("|")
  const prev = useRef<string | null>(null)
  useEffect(() => {
    if (prev.current !== null && prev.current !== sig) {
      const before = new Map(prev.current.split("|").map((x) => [x.slice(0, x.indexOf(":")), x]))
      for (const part of sig.split("|")) {
        const d = part.slice(0, part.indexOf(":"))
        if (before.get(d) !== part) void refreshQuery(qc, qk.bundle(d))
      }
    }
    prev.current = sig
  }, [sig, qc])
  const me = session ? session.accountId : null
  const ready = session !== undefined && now !== 0 && views.every((v) => v.data || v.isError) && balances.every((b) => b.data || b.isError)
  if (!ready) return null
  return daos.map((dao, i) => {
    const view = views[i]?.data?.value
    const bal = balances[i]?.data?.value
    const b = bundles[i]?.data
    if (!view || bal === undefined || !b) return null
    const ps = proposals[i]?.data
    if (b.proposalIds.length && !ps) return null
    return livePotVM({ dao, usdcId: sdkConfig().usdcId, hubId: sdkConfig().hubId, view, balance: bal, ...b, proposals: ps?.byId ?? {} }, ctxOf(me, session?.displayName, now, view.slug, session?.avatar))
  })
}

/** hub.get_pots_of(me), newest first. */
export function useLivePotsOf(): PotSummary[] | null | undefined {
  const session = useLiveSession()
  const me = session?.accountId
  const q = useQuery({
    queryKey: qk.potsOf(me ?? "-"),
    queryFn: async () => (await chain().hub.getPotsOf(me as never)).value,
    enabled: !!me,
    staleTime: 10_000,
    refetchInterval: 10_000,
  })
  if (session === undefined) return undefined
  if (!session) return null
  return q.data ? [...q.data].sort((a, b) => b.createdAtMs - a.createdAtMs) : undefined
}

export function useLiveCards(): PotCardVM[] | null {
  const summaries = useLivePotsOf()
  const daos = useMemo(() => (summaries ?? []).map((s) => s.pot as string), [summaries])
  const pots = useLivePots(daos)
  return useMemo(() => {
    if (!summaries) return null
    if (!pots) return null
    return pots.filter((p): p is PotVM => !!p && !!p.me).map(liveCardVM)
  }, [summaries, pots])
}

export interface LiveRequests {
  waiting: RequestVM[]
  mine: RequestVM[]
  decided: RequestVM[]
}

export function useLiveRequests(): LiveRequests | null {
  const summaries = useLivePotsOf()
  const daos = useMemo(() => (summaries ?? []).map((s) => s.pot as string), [summaries])
  const pots = useLivePots(daos)
  const now = useNow()
  return useMemo(() => {
    if (!summaries || !pots) return null
    const all: RequestVM[] = []
    for (const p of pots) {
      if (!p?.me) continue
      for (const r of p.feed) if (r.kind === "request" && r.request.path === "vote") all.push(r.request)
    }
    all.sort((a, b) => b.createdAt - a.createdAt)
    return {
      waiting: all.filter((r) => r.status === "needs" && !r.myVote && !r.mine),
      mine: all.filter((r) => r.mine && r.status === "needs"),
      decided: all.filter((r) => r.status !== "needs" && now - (r.decidedAt ?? r.expiresAt) < 30 * 86_400_000),
    }
  }, [summaries, pots, now])
}

/** The signed-in person's own Pot dollars (usdc.ft_balance_of(me)); 10 s while the Add sheet is open. */
export function useLiveUsdcBalance(account: string | null, enabled: boolean): Micro | undefined {
  const q = useQuery({
    queryKey: qk.usdc(account ?? "-"),
    queryFn: async () => (await chain().usdc.balanceOf(account as never)).value,
    enabled: enabled && !!account,
    staleTime: 5000,
    refetchInterval: enabled ? 10_000 : false,
  })
  return q.data
}
