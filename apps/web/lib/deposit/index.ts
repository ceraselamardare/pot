"use client"
// Any-chain deposits for components (D-50; frontend-architecture §5.6): the data source switch, TanStack hooks that
// poll every 3 s while a deposit moves (only while visible), and the one-tap "add it to the Pot" (a relayed
// contribution of the arrived dollars, then ADDED on the server).
import { useQuery } from "@tanstack/react-query"
import { newOpKey } from "@pot/sdk"
import { addMoney } from "@/lib/client/actions"
import { IS_LIVE, daoOf } from "@/lib/client/config"
import type { PotVM } from "@/lib/client/mock/types"
import type { Micro } from "@/lib/client/money"
import type { OpHandle } from "@/lib/client/ops/store"
import { queryClient } from "@/lib/client/query"
import { liveDeposits } from "./live"
import { mockDeposits } from "./mock"
import { isMoving, type ChainsRes, type DepositApi, type DepositView } from "./types"

export * from "./types"

export const deposits: DepositApi = IS_LIVE ? liveDeposits : mockDeposits

export const xcKeys = {
  chains: ["xc", "chains"] as const,
  one: (id: string) => ["xc", "deposit", id] as const,
  pot: (dao: string) => ["xc", "pot", dao] as const,
}

export const potKey = (slug: string): string => daoOf(slug)

export function useXcChains(enabled: boolean) {
  return useQuery<ChainsRes>({ queryKey: xcKeys.chains, queryFn: () => deposits.chains(), staleTime: 60_000, enabled })
}

/** One deposit, polled every 3 s while it still moves (the server advances the simulator on each poll). */
export function useDeposit(id: string | null) {
  return useQuery<DepositView>({
    queryKey: xcKeys.one(id ?? ""),
    queryFn: () => deposits.status(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && !isMoving(q.state.data) ? false : 3_000),
    staleTime: 1_000,
  })
}

/** The Pot screen's deposit card: in-progress deposits, and arrived ones that still wait for the one tap. */
export function usePotDeposits(slug: string, enabled = true) {
  const dao = potKey(slug)
  return useQuery<{ deposits: DepositView[] }>({
    queryKey: xcKeys.pot(dao),
    queryFn: () => deposits.list(dao),
    enabled,
    refetchInterval: (q) => (q.state.data?.deposits.some(isMoving) ? 4_000 : 30_000),
    staleTime: 2_000,
  })
}

export function invalidateDeposits(slug: string, id?: string) {
  const qc = queryClient()
  void qc.invalidateQueries({ queryKey: xcKeys.pot(potKey(slug)) })
  if (id) void qc.invalidateQueries({ queryKey: xcKeys.one(id) })
}

export const arrivedAmount = (d: DepositView): Micro => BigInt(d.amountOut ?? d.depositedAmount ?? d.amountIn)

/**
 * "Your $X arrived, add it to the Pot": one tap = the person's own relayed `ft_transfer_call` of the arrived dollars
 * (source: their Pot dollars; the relay carries `context.depositIntentId`), then the deposit is marked ADDED.
 */
export function addArrived(pot: Pick<PotVM, "slug" | "name" | "balance">, d: DepositView, actor: string): OpHandle | null {
  const amount = arrivedAmount(d)
  let relayId: string | null = null
  const h = addMoney(pot, amount, actor, {
    source: "pot_dollars",
    context: { depositIntentId: d.id },
    onRelayed: (r) => {
      relayId = r.relayId
    },
  })
  if (!h) return null
  void h.done.then(async (res) => {
    if (res !== "ok") return
    try {
      if (IS_LIVE) {
        if (relayId) await liveDeposits.status(d.id, relayId)
      } else await mockDeposits.markAdded(d.id)
    } finally {
      invalidateDeposits(pot.slug, d.id)
    }
  })
  return h
}

export const newDepositKey = () => newOpKey()
