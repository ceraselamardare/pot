// ChainViews (frontend-architecture §1.4): the interfaces the UI calls. One implementation over
// RPC (here), one in "@pot/sdk/testing" (MockChain). Every method returns the block height it read
// at (Viewed<T>), which the UI uses to settle optimistic ops (§3.5).

import type { SdkConfig } from "../config.ts"
import type { Micro } from "../money.ts"
import type { AccountId, DaoId, ProposalId, PublicKeyStr, Viewed } from "../types/ids.ts"
import type { ClosePreview, ConfigView, InviteView, MemberView, PotSummary, PotView, RequestView, RulesView, SpendPreview, SubjectView } from "../types/hub.ts"
import type { ActionsLogEntry, Policy, PolicySummary, Proposal, RawActionsLogEntry, RawProposal } from "../types/dao.ts"
import type { FtMetadata, RawStorageBalance, StorageBalance } from "../types/usdc.ts"
import type {
  RawClosePreview,
  RawConfigView,
  RawInviteView,
  RawMemberView,
  RawPotSummary,
  RawPotView,
  RawRequestView,
  RawRulesView,
  RawSpendPreview,
  RawSubjectView,
} from "../types/hub-raw.ts"
import { createRpcClient, RpcViewError, type Finality, type RpcClient, type RpcClientOptions } from "./rpc.ts"
import {
  parseActionsLogEntry,
  parseClosePreview,
  parseConfigView,
  parseInviteView,
  parseMemberView,
  parsePolicy,
  parsePotSummary,
  parsePotView,
  parseProposal,
  parseRequestView,
  parseRulesView,
  parseSpendPreview,
  parseStorageBalance,
  parseSubjectView,
} from "./parse.ts"
import { buildCall, type BuildOptions } from "../actions/build.ts"
import type { ActionIntent, CallSpec } from "../types/intents.ts"

export interface HubViews {
  getConfig(): Promise<Viewed<ConfigView>>
  getPot(pot: DaoId): Promise<Viewed<PotView | null>>
  getPotsOf(account: AccountId): Promise<Viewed<PotSummary[]>>
  /** `balance` = the client's usdc.ft_balance_of(dao); the hub can't read it in a view. */
  getMembers(pot: DaoId, balance?: Micro): Promise<Viewed<MemberView[]>>
  getRules(pot: DaoId): Promise<Viewed<RulesView | null>>
  previewSpend(pot: DaoId, account: AccountId, amount: Micro, receiver: AccountId, balance?: Micro): Promise<Viewed<SpendPreview>>
  previewClose(pot: DaoId, balance?: Micro): Promise<Viewed<ClosePreview>>
  /** ids ascending, refused ids absent; limit ≤ 50. Newest page: fromIndex = max(0, requestCount \u2212 limit). */
  getRequests(pot: DaoId, fromIndex: number, limit: number): Promise<Viewed<RequestView[]>>
  getRequest(pot: DaoId, requestId: number): Promise<Viewed<RequestView | null>>
  getInvite(pot: DaoId, invitePk: PublicKeyStr): Promise<Viewed<InviteView | null>>
  /** rev4: null = not created by the hub (show read-only, never relay a vote). */
  getProposalSubject(pot: DaoId, proposalId: ProposalId): Promise<Viewed<SubjectView | null>>
}

export interface DaoViews {
  getPolicy(dao: DaoId): Promise<Viewed<PolicySummary>>
  getProposals(dao: DaoId, fromIndex: number, limit: number): Promise<Viewed<Proposal[]>>
  /** null on ERR_NO_PROPOSAL (removed or unknown id). */
  getProposal(dao: DaoId, id: ProposalId): Promise<Viewed<Proposal | null>>
  /** = the next id to be issued. */
  getLastProposalId(dao: DaoId): Promise<Viewed<number>>
  /** Last 20 DAO-wide actions (278adc7 / v3.2 only); the cheap change detector. */
  getActionsLog(dao: DaoId): Promise<Viewed<ActionsLogEntry[]>>
}

export interface UsdcViews {
  balanceOf(account: AccountId): Promise<Viewed<Micro>>
  isRegistered(account: AccountId): Promise<Viewed<boolean>>
  storageBalanceOf(account: AccountId): Promise<Viewed<StorageBalance | null>>
  metadata(): Promise<Viewed<FtMetadata>>
}

export interface AccessKeyInfo {
  nonce: bigint
  fullAccess: boolean
}

export interface AccountViews {
  /** null when the key isn't on the account. Read at `optimistic` (signing, §4.7). */
  accessKey(account: AccountId, publicKey: PublicKeyStr): Promise<Viewed<AccessKeyInfo | null>>
  /** Latest block height (final unless asked otherwise). */
  head(finality?: Finality): Promise<Viewed<{ hash: string; timestampNs: bigint }>>
}

export interface ChainViews {
  hub: HubViews
  dao: DaoViews
  usdc: UsdcViews
  account: AccountViews
}

const microArg = (m: Micro | undefined): string | undefined => (m === undefined ? undefined : m.toString())
const defined = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

/** ChainViews over JSON-RPC (FastNEAR → dRPC). */
export function createChainViews(cfg: SdkConfig, rpc: RpcClient = createRpcClient({ urls: cfg.rpcUrls })): ChainViews {
  const hub = cfg.hubId
  const view = <T>(account: string, method: string, args: Record<string, unknown> = {}) => rpc.viewFunction<T>(account, method, defined(args))
  const map = async <R, T>(p: Promise<Viewed<R>>, f: (r: R) => T): Promise<Viewed<T>> => {
    const v = await p
    return { value: f(v.value), blockHeight: v.blockHeight }
  }

  return {
    hub: {
      getConfig: () => map(view<RawConfigView>(hub, "get_config"), parseConfigView),
      getPot: (pot) => map(view<RawPotView | null>(hub, "get_pot", { pot }), (r) => (r ? parsePotView(r) : null)),
      getPotsOf: (account) => map(view<RawPotSummary[]>(hub, "get_pots_of", { account_id: account }), (r) => r.map(parsePotSummary)),
      getMembers: (pot, balance) => map(view<RawMemberView[]>(hub, "get_members", { pot, balance: microArg(balance) }), (r) => r.map(parseMemberView)),
      getRules: (pot) => map(view<RawRulesView | null>(hub, "get_rules", { pot }), (r) => (r ? parseRulesView(r) : null)),
      previewSpend: (pot, account, amount, receiver, balance) =>
        map(
          view<RawSpendPreview>(hub, "preview_spend", { pot, account_id: account, amount: amount.toString(), receiver_id: receiver, balance: microArg(balance) }),
          parseSpendPreview,
        ),
      previewClose: (pot, balance) => map(view<RawClosePreview>(hub, "preview_close", { pot, balance: microArg(balance) }), parseClosePreview),
      getRequests: (pot, fromIndex, limit) =>
        map(view<RawRequestView[]>(hub, "get_requests", { pot, from_index: fromIndex, limit: Math.min(limit, 50) }), (r) => r.map((x) => parseRequestView(x))),
      getRequest: (pot, requestId) => map(view<RawRequestView | null>(hub, "get_request", { pot, request_id: requestId }), (r) => (r ? parseRequestView(r) : null)),
      getInvite: (pot, invitePk) => map(view<RawInviteView | null>(hub, "get_invite", { pot, invite_pk: invitePk }), (r) => (r ? parseInviteView(r) : null)),
      getProposalSubject: (pot, proposalId) =>
        map(view<RawSubjectView | null>(hub, "get_proposal_subject", { pot, proposal_id: proposalId }), (r) => (r ? parseSubjectView(r) : null)),
    },
    dao: {
      getPolicy: (dao) => map(view<Policy>(dao, "get_policy"), parsePolicy),
      getProposals: (dao, fromIndex, limit) => map(view<RawProposal[]>(dao, "get_proposals", { from_index: fromIndex, limit }), (r) => r.map(parseProposal)),
      async getProposal(dao, id) {
        try {
          return await map(view<RawProposal>(dao, "get_proposal", { id }), parseProposal)
        } catch (e) {
          if (e instanceof RpcViewError && e.errorCode === "ERR_NO_PROPOSAL") return { value: null, blockHeight: e.blockHeight ?? 0 }
          throw e
        }
      },
      getLastProposalId: (dao) => map(view<number>(dao, "get_last_proposal_id"), (r) => Number(r)),
      getActionsLog: (dao) => map(view<RawActionsLogEntry[]>(dao, "get_actions_log"), (r) => r.map(parseActionsLogEntry)),
    },
    usdc: {
      balanceOf: (account) => map(view<string>(cfg.usdcId, "ft_balance_of", { account_id: account }), (r) => BigInt(r)),
      isRegistered: (account) => map(view<RawStorageBalance | null>(cfg.usdcId, "storage_balance_of", { account_id: account }), (r) => r !== null),
      storageBalanceOf: (account) => map(view<RawStorageBalance | null>(cfg.usdcId, "storage_balance_of", { account_id: account }), parseStorageBalance),
      metadata: () => view<FtMetadata>(cfg.usdcId, "ft_metadata"),
    },
    account: {
      async accessKey(account, publicKey) {
        const v = await rpc.viewAccessKey(account, publicKey)
        return { value: v.value ? { nonce: v.value.nonce, fullAccess: v.value.permission === "FullAccess" } : null, blockHeight: v.blockHeight }
      },
      async head(finality = "final") {
        const h = await rpc.head(finality)
        return { value: { hash: h.hash, timestampNs: h.timestampNs }, blockHeight: h.height }
      },
    },
  }
}

export interface PotSdk extends ChainViews {
  cfg: SdkConfig
  rpc: RpcClient
  build: (i: ActionIntent, o?: BuildOptions) => CallSpec
}

/** The app's entry point: views over a failover RPC client plus the CallSpec builder. */
export function createPotSdk(cfg: SdkConfig, rpcOptions: Partial<RpcClientOptions> = {}): PotSdk {
  const rpc = createRpcClient({ urls: cfg.rpcUrls, ...rpcOptions })
  return { ...createChainViews(cfg, rpc), cfg, rpc, build: (i, o) => buildCall(i, cfg, o) }
}
