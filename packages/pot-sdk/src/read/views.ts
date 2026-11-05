// ChainViews (frontend-architecture §1.4): the interfaces the UI calls. One implementation over
// RPC (here), one in "@pot/sdk/testing" (MockChain). Every method returns the block height it read
// at (Viewed<T>), which the UI uses to settle optimistic ops (§3.5).

import type { SdkConfig } from "../config.ts"
import type { Micro } from "../money.ts"
import type { AccountId, DaoId, ProposalId, PublicKeyStr, Viewed } from "../types/ids.ts"
import type {
  ClosePreview,
  ConfigView,
  GiftsView,
  GoalView,
  InviteView,
  LinkView,
  MemberView,
  OkCheck,
  PotSummary,
  PotView,
  RecordEntry,
  RequestView,
  RulesView,
  SpendPreview,
  SubjectView,
  TrustView,
} from "../types/hub.ts"
import type { ActionsLogEntry, Policy, PolicySummary, Proposal, RawActionsLogEntry, RawProposal } from "../types/dao.ts"
import type { FtMetadata, RawStorageBalance, StorageBalance } from "../types/usdc.ts"
import type {
  RawClosePreview,
  RawConfigView,
  RawGiftsView,
  RawGoalView,
  RawOkCheck,
  RawInviteView,
  RawLinkView,
  RawRecordEntry,
  RawTrustView,
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
  parseGiftsView,
  parseGoalView,
  parseInviteView,
  parseLinkView,
  parseOkCheck,
  parseRecordEntry,
  parseTrustView,
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
  /** hub 1.1.0 `link`: preview a pay-by-link request (receiver = the hub id). */
  previewSpend(pot: DaoId, account: AccountId, amount: Micro, receiver: AccountId, balance?: Micro, link?: boolean): Promise<Viewed<SpendPreview>>
  previewClose(pot: DaoId, balance?: Micro): Promise<Viewed<ClosePreview>>
  /** ids ascending, refused ids absent; limit ≤ 50. Newest page: fromIndex = max(0, requestCount \u2212 limit). */
  getRequests(pot: DaoId, fromIndex: number, limit: number): Promise<Viewed<RequestView[]>>
  getRequest(pot: DaoId, requestId: number): Promise<Viewed<RequestView | null>>
  getInvite(pot: DaoId, invitePk: PublicKeyStr): Promise<Viewed<InviteView | null>>
  /** rev4: null = not created by the hub (show read-only, never relay a vote). */
  getProposalSubject(pot: DaoId, proposalId: ProposalId): Promise<Viewed<SubjectView | null>>
  // ---- hub 1.1.0 (wave 4). Optional so hand-written HubViews (mocks) keep compiling; the RPC
  // implementation and MockChain provide them. On a 1.0.0 hub they fail with MethodNotFound.
  /** One member's earned trust (null: not a member). */
  getTrust?(pot: DaoId, account: AccountId): Promise<Viewed<TrustView | null>>
  /** Every Active member's trust, join order. */
  getTrusts?(pot: DaoId): Promise<Viewed<TrustView[]>>
  /** null: the Pot has no goal. */
  getGoal?(pot: DaoId): Promise<Viewed<GoalView | null>>
  /** The claim page's view of a link (null: not a link request). */
  getLink?(pot: DaoId, requestId: number): Promise<Viewed<LinkView | null>>
  /** The public record; ids ascending, refused ids absent; limit ≤ 50. */
  getRecord?(pot: DaoId, fromIndex: number, limit: number): Promise<Viewed<RecordEntry[]>>
  // ---- hub 1.2.0 (gifts). Optional like the 1.1.0 views; MethodNotFound on an older hub.
  /** The Pot's gifts: on/off, totals, and whether a gift sent now would be accepted (null: unknown Pot). */
  getGifts?(pot: DaoId): Promise<Viewed<GiftsView | null>>
  // ---- hub 1.3.0 (security fixes). Optional; MethodNotFound on an older hub.
  /** W4-1: could `account` give the one OK on this request now (show the "OK it" button)? null: unknown request. */
  getOkCheck?(pot: DaoId, requestId: number, account: AccountId): Promise<Viewed<OkCheck | null>>
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
      previewSpend: (pot, account, amount, receiver, balance, link) =>
        map(
          view<RawSpendPreview>(hub, "preview_spend", { pot, account_id: account, amount: amount.toString(), receiver_id: receiver, balance: microArg(balance), link }),
          parseSpendPreview,
        ),
      previewClose: (pot, balance) => map(view<RawClosePreview>(hub, "preview_close", { pot, balance: microArg(balance) }), parseClosePreview),
      getRequests: (pot, fromIndex, limit) =>
        map(view<RawRequestView[]>(hub, "get_requests", { pot, from_index: fromIndex, limit: Math.min(limit, 50) }), (r) => r.map((x) => parseRequestView(x))),
      getRequest: (pot, requestId) => map(view<RawRequestView | null>(hub, "get_request", { pot, request_id: requestId }), (r) => (r ? parseRequestView(r) : null)),
      getInvite: (pot, invitePk) => map(view<RawInviteView | null>(hub, "get_invite", { pot, invite_pk: invitePk }), (r) => (r ? parseInviteView(r) : null)),
      getProposalSubject: (pot, proposalId) =>
        map(view<RawSubjectView | null>(hub, "get_proposal_subject", { pot, proposal_id: proposalId }), (r) => (r ? parseSubjectView(r) : null)),
      getTrust: (pot, account) => map(view<RawTrustView | null>(hub, "get_trust", { pot, account_id: account }), (r) => (r ? parseTrustView(r) : null)),
      getTrusts: (pot) => map(view<RawTrustView[]>(hub, "get_trusts", { pot }), (r) => r.map(parseTrustView)),
      getGoal: (pot) => map(view<RawGoalView | null>(hub, "get_goal", { pot }), (r) => (r ? parseGoalView(r) : null)),
      getLink: (pot, requestId) => map(view<RawLinkView | null>(hub, "get_link", { pot, request_id: requestId }), (r) => (r ? parseLinkView(r) : null)),
      getRecord: (pot, fromIndex, limit) =>
        map(view<RawRecordEntry[]>(hub, "get_record", { pot, from_index: fromIndex, limit: Math.min(limit, 50) }), (r) => r.map(parseRecordEntry)),
      getGifts: (pot) => map(view<RawGiftsView | null>(hub, "get_gifts", { pot }), (r) => (r ? parseGiftsView(r) : null)),
      getOkCheck: (pot, requestId, account) =>
        map(view<RawOkCheck | null>(hub, "get_ok_check", { pot, request_id: requestId, account_id: account }), (r) => (r ? parseOkCheck(r) : null)),
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
