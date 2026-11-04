"use client"
// The money-in details hook, one implementation per data source (lib/client/config.ts), same view model:
//  - mock: the browser mock world (lib/client/mock/deposits.ts);
//  - testnet: GET /api/pots/[pot]/deposits/[key] (members only) with TanStack Query.
// undefined while loading, null when there is nothing to show (unknown key, not a member, an error).
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { DepositDetailsRes } from "@/lib/deposits-api"
import { depositKeyKind } from "@/lib/deposits"
import { IS_LIVE } from "../config"
import { api } from "../live/api"
import { mockDepositDetails } from "../mock/deposits"
import { useWorld } from "../mock/store"
import type { PotVM } from "../mock/types"
import { useMe } from "../session"
import { useNow } from "../time"
import { detailsFromWire, type DepositDetailsVM } from "./vm"

export type { DepositDetailsVM, DepositSourceVM } from "./vm"

export const depositKeys = { one: (slug: string, key: string) => ["deposits", "details", slug, key] as const }

function useLiveDepositDetails(pot: PotVM, key: string | null): DepositDetailsVM | null | undefined {
  const me = useMe()
  const valid = !!key && depositKeyKind(key) !== null
  const q = useQuery({
    queryKey: depositKeys.one(pot.slug, key ?? ""),
    enabled: valid,
    queryFn: async () => (await api<DepositDetailsRes>("GET", `/api/pots/${encodeURIComponent(pot.slug)}/deposits/${encodeURIComponent(key!)}`)).data,
    staleTime: 30_000,
    retry: (n, e) => n < 1 && !(e instanceof Error && /not_found|not_signed_in/.test(String((e as { reason?: string }).reason ?? ""))),
  })
  return useMemo(() => {
    if (!valid) return null
    if (q.isPending) return undefined
    if (!q.data) return null
    return detailsFromWire(q.data.deposit, q.data.profiles ?? {}, pot, me ?? null)
  }, [valid, q.isPending, q.data, pot, me])
}

function useMockDepositDetails(pot: PotVM, key: string | null): DepositDetailsVM | null | undefined {
  const world = useWorld()
  const me = useMe()
  const now = useNow()
  return useMemo(() => {
    if (!key) return null
    if (!world || me === undefined || !now) return undefined
    return mockDepositDetails(world, pot.slug, key, me, now)
  }, [world, me, now, pot.slug, key])
}

/** One money-in row's details (members only). */
export const useDepositDetails: (pot: PotVM, key: string | null) => DepositDetailsVM | null | undefined = IS_LIVE ? useLiveDepositDetails : useMockDepositDetails
