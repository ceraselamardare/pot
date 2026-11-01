// getDemoSnapshot (frontend-architecture §2.6): the reference Pot for the /demo HTML, read through the sdk's
// ChainViews interface:
//  - mock data source: @pot/sdk/testing's MockChain at the D-61 "seeded" state;
//  - testnet (F-15): createChainViews over DEMO_REFERENCE_POT (lisbon-trip.<hub>), read-only forever.
// 'use cache' (30 s) and try/catch → "Snapshot unavailable", so a chain hiccup never fails the build.
import "server-only"
import { cacheLife } from "next/cache"
import type { ChainViews } from "@pot/sdk"
import { IS_LIVE } from "@/lib/client/config"
import { nameFromAccount } from "@/lib/client/live/vm"

export interface DemoSnapshot {
  name: string
  emoji: string
  /** MicroStr: usdc.ft_balance_of(dao), never balanceEstimate (it ignores close payouts) */
  balance: string
  totalIn: string
  members: { name: string; contributed: string; joinIndex: number }[]
  dao: string
}

const nameOf = (account: string) => nameFromAccount(account) ?? account.split(".")[0] ?? account

async function source(): Promise<{ views: ChainViews; dao: string }> {
  if (IS_LIVE) {
    const { serverChain, serverSdkConfig } = await import("@/app/_lib/chain")
    const dao = process.env.DEMO_REFERENCE_POT || `lisbon-trip.${serverSdkConfig().hubId}`
    return { views: serverChain(), dao }
  }
  const { lisbonTrip } = await import("@pot/sdk/testing")
  const fx = await lisbonTrip("seeded")
  return { views: fx.chain, dao: fx.ids.dao }
}

export async function getDemoSnapshot(): Promise<DemoSnapshot | null> {
  "use cache"
  cacheLife({ stale: 30, revalidate: 30, expire: 600 })
  try {
    const { views, dao } = await source()
    const pot = (await views.hub.getPot(dao as never)).value
    if (!pot) return null
    const balance = (await views.usdc.balanceOf(dao as never)).value
    const members = (await views.hub.getMembers(dao as never, balance)).value
    return {
      name: pot.name,
      emoji: pot.emoji ?? "🇵🇹",
      balance: balance.toString(),
      totalIn: pot.totalIn.toString(),
      members: members
        .filter((m) => m.status === "active")
        .sort((a, b) => a.joinIndex - b.joinIndex)
        .map((m) => ({ name: nameOf(m.account), contributed: m.contributed.toString(), joinIndex: m.joinIndex })),
      dao,
    }
  } catch {
    return null
  }
}
