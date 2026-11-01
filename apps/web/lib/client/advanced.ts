"use client"
// You → Advanced (ux-spec §10; D-52 testnet form): per Pot, the contract ids, explorer links and the
// "On-chain rules" panel, read live from the DAO policy (get_policy) and the hub (get_rules, get_pot).
// The mock build derives the same shape from the mock world and says so.
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { IS_LIVE, daoOf, sdkConfig } from "./config"
import { chain } from "./live/chain"
import { PEOPLE, type PersonaId } from "./mock/fixtures"
import { useWorld } from "./mock/store"
import { approvalsNeeded } from "./rules"
import type { Micro } from "./money"
import { cents } from "./money"

export interface OnChainRules {
  dao: string
  hub: string
  members: string[]
  rulebot: string[]
  threshold: [number, number]
  quorum: number
  periodDays: number
  instantCap: Micro
  memberBudget: Micro
  payees: string
  version: number
  openRules: number | null
  /** k of n with the live member count */
  k: number
  mock: boolean
}

export type Loaded<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T }

export const explorerAccount = (account: string): string => `${sdkConfig().explorerUrl.replace(/\/$/, "")}/address/${account}`

function useLiveOnChain(slug: string, enabled: boolean): Loaded<OnChainRules> {
  const dao = daoOf(slug)
  const q = useQuery({
    queryKey: ["pot", dao, "onchain"],
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<OnChainRules> => {
      const c = chain()
      const [policy, rules, pot] = await Promise.all([c.dao.getPolicy(dao as never), c.hub.getRules(dao as never), c.hub.getPot(dao as never)])
      const r = rules.value
      return {
        dao,
        hub: sdkConfig().hubId,
        members: policy.value.members as string[],
        rulebot: policy.value.rulebot as string[],
        threshold: policy.value.threshold,
        quorum: policy.value.quorum,
        periodDays: Math.round(Number(policy.value.proposalPeriodNs / 1_000_000n) / 86_400_000),
        instantCap: r?.rules.instantCap ?? 0n,
        memberBudget: r?.rules.memberBudget ?? 0n,
        payees: r?.rules.instantPayees ?? "members",
        version: r?.rulesVersion ?? 0,
        openRules: pot.value?.openRulesProposal ?? null,
        k: r?.approvalsNeeded ?? 1,
        mock: false,
      }
    },
  })
  if (q.data) return { state: "ready", data: q.data }
  return q.isError ? { state: "error" } : { state: "loading" }
}

function useMockOnChain(slug: string): Loaded<OnChainRules> {
  // (the mock world is already in memory: nothing to gate)
  const world = useWorld()
  return useMemo((): Loaded<OnChainRules> => {
    const p = world?.pots[slug]
    if (!world) return { state: "loading" }
    if (!p) return { state: "error" }
    const acct = (id: string) => PEOPLE[id as PersonaId]?.account ?? id
    return {
      state: "ready",
      data: {
        dao: `${slug}.pots.testnet`,
        hub: "pots.testnet",
        members: p.members.map((m) => acct(m.id)),
        rulebot: ["pots.testnet"],
        threshold: [1, 2],
        quorum: 1,
        periodDays: p.rules.expiryDays,
        instantCap: cents(p.rules.instantCap),
        memberBudget: cents(p.rules.memberBudget),
        payees: "members",
        version: 1 + (p.ruleChanges?.length ?? 0),
        openRules: p.rulesProposal?.status === "proposed" ? p.rulesProposal.id : null,
        k: approvalsNeeded(p.members.length),
        mock: true,
      },
    }
  }, [world, slug])
}

/** The panel's data (testnet: only fetched once the panel is opened). */
export const useOnChainRules: (slug: string, enabled: boolean) => Loaded<OnChainRules> = IS_LIVE ? useLiveOnChain : useMockOnChain
