// Hub, DAO and token views the server needs (contracts-spec §4), with short per-instance caches
// (api-spec §3.1: get_proposal_subject 60 s, get_members 3 s (APP-9; was 10 s); get_pot 10 s; unknown Pots 60 s).
// View JSON types are @pot/sdk's snake_case `Raw*` twins of the contract (types/hub-raw.ts, dao.ts).
import type { RawMemberView, RawPotView, RawProposal, RawRequestView, RawSubjectView } from "@pot/sdk"
import { viewFunction, type Finality } from "./near"
import { RpcError, type RpcClient } from "./rpc"

export type PotView = RawPotView
export type MemberView = RawMemberView
export type SubjectView = RawSubjectView
export type RequestView = RawRequestView
export type DaoProposal = RawProposal

export interface HubReader {
  getPot(pot: string, opts?: { fresh?: boolean }): Promise<PotView | null>
  getMembers(pot: string, opts?: { fresh?: boolean }): Promise<MemberView[]>
  getProposalSubject(pot: string, proposalId: number): Promise<SubjectView | null>
  getProposal(dao: string, proposalId: number, finality?: Finality): Promise<DaoProposal | null>
  getRequests(pot: string, fromIndex: number, limit: number): Promise<RequestView[]>
  storageBalanceOf(token: string, account: string): Promise<{ total: string; available: string } | null>
  ftBalanceOf(token: string, account: string): Promise<bigint>
  invalidate(pot: string): void
}

class TtlCache<V> {
  private m = new Map<string, { v: V; until: number }>()
  get(k: string): V | undefined {
    const hit = this.m.get(k)
    if (!hit) return undefined
    if (hit.until < Date.now()) {
      this.m.delete(k)
      return undefined
    }
    return hit.v
  }
  set(k: string, v: V, ttlMs: number) {
    if (this.m.size > 5_000) this.m.clear()
    this.m.set(k, { v, until: Date.now() + ttlMs })
  }
  delete(k: string) {
    this.m.delete(k)
  }
}

const isPanic = (e: unknown) =>
  e instanceof RpcError && (e.type === "CONTRACT_EXECUTION_ERROR" || e.type === "QUERY_ERROR" || /panicked|ERR_/.test(e.message))

/** get_members cache per instance (APP-9, security audit 2026-11-04). */
export const MEMBERS_TTL_MS = 3_000

export function createHubReader(rpc: RpcClient, hubId: string): HubReader {
  const pots = new TtlCache<PotView | null>()
  const members = new TtlCache<MemberView[]>()
  const subjects = new TtlCache<SubjectView | null>()

  return {
    async getPot(pot, opts = {}) {
      if (!opts.fresh) {
        const hit = pots.get(pot)
        if (hit !== undefined) return hit
      }
      const v = await viewFunction<PotView | null>(rpc, hubId, "get_pot", { pot }, "optimistic")
      pots.set(pot, v, v ? 10_000 : 60_000)
      return v
    },
    async getMembers(pot, opts = {}) {
      if (!opts.fresh) {
        const hit = members.get(pot)
        if (hit) return hit
      }
      const v = (await viewFunction<MemberView[] | null>(rpc, hubId, "get_members", { pot }, "optimistic")) ?? []
      // APP-9: 10 s → 3 s, so someone who leaves loses access to members-only data within seconds (isMember also
      // re-reads before saying no, so a fresh joiner is never refused by a stale list)
      members.set(pot, v, MEMBERS_TTL_MS)
      return v
    },
    async getProposalSubject(pot, proposalId) {
      const k = `${pot}#${proposalId}`
      const hit = subjects.get(k)
      if (hit !== undefined) return hit
      const v = await viewFunction<SubjectView | null>(
        rpc,
        hubId,
        "get_proposal_subject",
        { pot, proposal_id: proposalId },
        "optimistic",
      )
      subjects.set(k, v, 60_000)
      return v
    },
    async getProposal(dao, proposalId, finality = "optimistic") {
      try {
        return await viewFunction<DaoProposal>(rpc, dao, "get_proposal", { id: proposalId }, finality)
      } catch (e) {
        if (isPanic(e)) return null
        throw e
      }
    },
    async getRequests(pot, fromIndex, limit) {
      return (
        (await viewFunction<RequestView[] | null>(rpc, hubId, "get_requests", { pot, from_index: fromIndex, limit }, "optimistic")) ??
        []
      )
    },
    async storageBalanceOf(token, account) {
      return viewFunction<{ total: string; available: string } | null>(
        rpc,
        token,
        "storage_balance_of",
        { account_id: account },
        "optimistic",
      )
    },
    async ftBalanceOf(token, account) {
      const v = await viewFunction<string>(rpc, token, "ft_balance_of", { account_id: account }, "optimistic")
      return BigInt(v ?? "0")
    },
    invalidate(pot) {
      pots.delete(pot)
      members.delete(pot)
    },
  }
}
