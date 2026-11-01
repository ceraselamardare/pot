// ChainViews over a fake RpcClient: exact view args, snake → camel mapping (U-09), Sputnik
// normalization (U-02). Payloads are the contracts-spec §4 examples (D-61 state after the $84 spend).
import { describe, expect, it } from "vitest"
import { testnetConfig } from "../config.ts"
import type { RawPotView, RawMemberView, RawSpendPreview, RawClosePreview, RawRequestView, RawInviteView, RawSubjectView } from "../types/hub-raw.ts"
import type { AccountId, DaoId, PublicKeyStr } from "../types/ids.ts"
import { createChainViews } from "./views.ts"
import { RpcViewError, type RpcClient } from "./rpc.ts"
import { mapRequestStatus, parsePolicy } from "./parse.ts"
import { toSpendPreviewReason } from "../math/decide.ts"

const cfg = testnetConfig("potapp")
const DAO = "lisbon-trip.pots.potapp.testnet" as DaoId
const MAYA = "maya.users.potapp.testnet" as AccountId
const LEO = "leo.users.potapp.testnet" as AccountId

const potView: RawPotView = {
  pot: DAO, slug: "lisbon-trip", name: "Lisbon Trip", emoji: "\u{1F1F5}\u{1F1F9}", preset: "trip", seq: 17,
  rules: { instant_cap: "100000000", member_budget: "200000000", instant_payees: "members", payee_allowlist: [] },
  rules_version: 1, status: "open", close_proposal_id: null, creator: MAYA, created_at_ms: 1793001234567, closed_at_ms: null,
  member_count: 3, joining_count: 0, approvals_needed: 2, proposal_period_ms: 604800000, total_contributed: "450000000",
  spent_instant: "84000000", spent_vote: "0", reserved: "0", balance_estimate: "366000000", last_contributor: LEO,
  request_count: 1, open_requests: 0, active_invites: 1, unpaid_approved: 0, float: "50000000000000000000000",
  usdc: "usdc.potapp.testnet", open_rules_proposal: null, closing_in_flight: false,
}
const member: RawMemberView = {
  account_id: LEO, join_index: 2, status: "active", joined_at_ms: 1793001300000, contributed: "150000000", spent: "0",
  instant_used: "0", budget_left: "200000000", would_get_back: "122000000", share_of_spending: "28000000",
  is_last_contributor: true, balance_source: "argument",
}
const spendPreview: RawSpendPreview = {
  path: "vote", reason: "over_cap", approvals_needed: 2, member_count: 3, instant_cap: "100000000", member_budget: "200000000",
  budget_used: "84000000", budget_left: "116000000", balance_checked: "366000000", client_must_check: ["payee_registered", "dao_membership"],
}
const closePreview: RawClosePreview = {
  pot: DAO, balance: "66000000", balance_source: "argument", total_contributed: "450000000", approvals_needed: 2, open_requests: 0,
  payouts: [MAYA, "sam.users.potapp.testnet", LEO].map((a) => ({ account_id: a, contributed: "150000000", amount: "22000000" })),
  dust: "0", dust_to: LEO, can_propose: true, blocked_reason: null,
}
const request: RawRequestView = {
  request_id: 1, pot: DAO, requester: MAYA, receiver_id: MAYA, amount: "300000000", category: "tickets", request_ref: "p8w2m4q6z1x3r5t7",
  path: "vote", reason: "over_cap", status: "pending", proposal_id: 3, created_at_ms: 1793002000000, updated_at_ms: 1793002004100, expires_at_ms: 1793606800000,
}
const invite: RawInviteView = {
  pot: DAO, invite_pk: "ed25519:8qEjY9rV1bKk4M1xGdrgWW3T2Zy4kq6WY7uHUnF1hW1m", created_by: MAYA, created_at_ms: 1793001234567,
  expires_at_ms: 1793606034567, max_uses: 10, uses: 2, revoked: false, status: "active",
}
const subject: RawSubjectView = { pot: DAO, proposal_id: 3, kind: "spend", request_id: 1, member: null, rules_version: null, live: true }
const policy = {
  roles: [
    { name: "member", kind: { Group: [MAYA, "sam.users.potapp.testnet", LEO] }, permissions: ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"], vote_policy: {} },
    { name: "rulebot", kind: { Group: [cfg.hubId] }, permissions: ["transfer:AddProposal"], vote_policy: { transfer: { weight_kind: "RoleWeight", quorum: "1", threshold: [1, 1] } } },
  ],
  default_vote_policy: { weight_kind: "RoleWeight", quorum: "1", threshold: [1, 2] },
  proposal_bond: "0", proposal_period: "604800000000000", bounty_bond: "0", bounty_forgiveness_period: "86400000000000",
}
const proposal = {
  id: 3, proposer: cfg.hubId, description: "Pot request #1: tickets (ref p8w2m4q6z1x3r5t7)",
  kind: { Transfer: { token_id: cfg.usdcId, receiver_id: MAYA, amount: "300000000", msg: null } },
  status: "InProgress", vote_counts: { member: ["1", "0", "0"] }, votes: { [MAYA]: "Approve" }, submission_time: "1793002001000000000",
  last_actions_log: [{ block_height: "274092626" }],
}

function fakeRpc(answers: Record<string, unknown>) {
  const calls: { account: string; method: string; args: Record<string, unknown> }[] = []
  const rpc: RpcClient = {
    urls: [],
    call: async () => {
      throw new Error("unused")
    },
    async viewFunction<T>(account: string, method: string, args: Record<string, unknown> = {}) {
      calls.push({ account, method, args })
      const a = answers[`${account}:${method}`]
      if (a instanceof Error) throw a
      return { value: a as T, blockHeight: 4242 }
    },
    viewAccessKey: async () => ({ value: { nonce: 7n, permission: "FullAccess" as const }, blockHeight: 4243 }),
    head: async () => ({ height: 4244, hash: "h", timestampNs: 1n }),
    stats: () => ({ requests: 0, failovers: 0, activeUrl: "", queued: 0 }),
  }
  return { rpc, calls }
}

describe("ChainViews over RPC", () => {
  const H = cfg.hubId
  const { rpc, calls } = fakeRpc({
    [`${H}:get_pot`]: potView,
    [`${H}:get_members`]: [member],
    [`${H}:preview_spend`]: spendPreview,
    [`${H}:preview_close`]: closePreview,
    [`${H}:get_requests`]: [request],
    [`${H}:get_request`]: null,
    [`${H}:get_invite`]: invite,
    [`${H}:get_proposal_subject`]: subject,
    [`${H}:get_pots_of`]: [],
    [`${DAO}:get_policy`]: policy,
    [`${DAO}:get_proposal`]: proposal,
    [`${DAO}:get_last_proposal_id`]: 4,
    [`${DAO}:get_actions_log`]: [{ account_id: MAYA, proposal_id: "3", action: "VoteApprove", block_height: "274092676" }],
    [`${cfg.usdcId}:ft_balance_of`]: "366000000",
    [`${cfg.usdcId}:storage_balance_of`]: null,
  })
  const views = createChainViews(cfg, rpc)

  it("get_pot → PotView (contracts-spec §11 names) with the block height", async () => {
    const v = await views.hub.getPot(DAO)
    expect(v.blockHeight).toBe(4242)
    expect(v.value).toMatchObject({
      pot: DAO, slug: "lisbon-trip", emoji: "\u{1F1F5}\u{1F1F9}", totalIn: 450_000_000n, memberCount: 3, approvalsNeeded: 2, seq: 17,
      balanceEstimate: 366_000_000n, spentInstant: 84_000_000n, lastContributor: LEO, closingInFlight: false, createdAtMs: 1793001234567,
      rules: { instantCap: 100_000_000n, memberBudget: 200_000_000n, instantPayees: "members", payeeAllowlist: [] },
    })
    expect(v.value?.closeProposalId).toBeUndefined()
    expect(calls.at(-1)).toEqual({ account: H, method: "get_pot", args: { pot: DAO } })
  })

  it("views pass `balance` only when given, as a U128 string", async () => {
    await views.hub.getMembers(DAO)
    expect(calls.at(-1)?.args).toEqual({ pot: DAO })
    const m = await views.hub.getMembers(DAO, 66_000_000n)
    expect(calls.at(-1)?.args).toEqual({ pot: DAO, balance: "66000000" })
    expect(m.value[0]).toMatchObject({ account: LEO, wouldGetBack: 122_000_000n, shareOfSpending: 28_000_000n, isLastContributor: true })
  })

  it("preview_spend maps reasons (U-09) and keeps the hub reason", async () => {
    const p = await views.hub.previewSpend(DAO, MAYA, 300_000_000n, MAYA, 366_000_000n)
    expect(calls.at(-1)?.args).toEqual({ pot: DAO, account_id: MAYA, amount: "300000000", receiver_id: MAYA, balance: "366000000" })
    expect(p.value).toMatchObject({ path: "vote", reason: "over_cap", hubReason: "over_cap", budgetLeft: 116_000_000n, balanceChecked: 366_000_000n })
    expect(toSpendPreviewReason("within_rules")).toBe("ok")
    expect(toSpendPreviewReason("payee_not_allowed")).toBe("recipient")
    expect(toSpendPreviewReason("insufficient_balance")).toBe("balance")
    expect(toSpendPreviewReason("pot_not_open")).toBe("not_open")
    expect(toSpendPreviewReason("new_member")).toBe("new_member")
    expect(toSpendPreviewReason("too_many_pending")).toBe("blocked")
    expect(toSpendPreviewReason("not_member")).toBe("blocked")
  })

  it("preview_close, requests (status mapping U-09), invites, subjects", async () => {
    const c = await views.hub.previewClose(DAO, 66_000_000n)
    expect(c.value.payouts.map((p) => p.amount)).toEqual([22_000_000n, 22_000_000n, 22_000_000n])
    expect(c.value).toMatchObject({ dustTo: LEO, canPropose: true, totalIn: 450_000_000n })
    const r = await views.hub.getRequests(DAO, 0, 80)
    expect(calls.at(-1)?.args).toEqual({ pot: DAO, from_index: 0, limit: 50 })
    expect(r.value[0]).toMatchObject({ id: 1, receiver: MAYA, amount: 300_000_000n, status: "proposed", hubStatus: "pending", proposalId: 3, requestRef: "p8w2m4q6z1x3r5t7" })
    expect((await views.hub.getRequest(DAO, 9)).value).toBeNull()
    const i = await views.hub.getInvite(DAO, invite.invite_pk as PublicKeyStr)
    expect(i.value).toMatchObject({ invitePk: invite.invite_pk, maxUses: 10, uses: 2, revoked: false, status: "active" })
    expect((await views.hub.getProposalSubject(DAO, 3)).value).toEqual({ pot: DAO, proposalId: 3, kind: "spend", requestId: 1, member: null, rulesVersion: null, live: true })
    expect(mapRequestStatus("checking")).toBe("proposed")
    expect(mapRequestStatus("approving")).toBe("proposed")
    expect(mapRequestStatus("approved")).toBe("approved")
    expect(mapRequestStatus("approved", { payoutSeen: true })).toBe("paid")
    expect(mapRequestStatus("removed")).toBe("withdrawn")
    expect(mapRequestStatus("payout_failed")).toBe("payout_failed")
  })

  it("DAO views: vote_counts strings → numbers, submission_time → bigint, kind kept verbatim (U-02)", async () => {
    const p = (await views.dao.getProposal(DAO, 3)).value
    expect(p?.voteCounts).toEqual({ member: [1, 0, 0] })
    expect(p?.submissionTimeNs).toBe(1793002001000000000n)
    expect(p?.kind).toEqual(proposal.kind)
    const pol = (await views.dao.getPolicy(DAO)).value
    expect(pol).toMatchObject({ members: [MAYA, "sam.users.potapp.testnet", LEO], rulebot: [H], threshold: [1, 2], quorum: 1, proposalPeriodNs: 604800000000000n })
    expect((await views.dao.getLastProposalId(DAO)).value).toBe(4)
    expect((await views.dao.getActionsLog(DAO)).value[0]).toEqual({ account: MAYA, proposalId: 3, action: "VoteApprove", blockHeight: 274092676 })
    expect(parsePolicy({ ...policy, default_vote_policy: { weight_kind: "RoleWeight", quorum: "1", threshold: "2" } } as never).threshold).toEqual([1, 2])
  })

  it("get_proposal → null on ERR_NO_PROPOSAL", async () => {
    const { rpc: r2 } = fakeRpc({ [`${DAO}:get_proposal`]: new RpcViewError("CONTRACT_PANIC", "ERR_NO_PROPOSAL", { errorCode: "ERR_NO_PROPOSAL", blockHeight: 9 }) })
    expect(await createChainViews(cfg, r2).dao.getProposal(DAO, 99)).toEqual({ value: null, blockHeight: 9 })
  })

  it("USDC and account views", async () => {
    expect((await views.usdc.balanceOf(DAO)).value).toBe(366_000_000n)
    expect((await views.usdc.isRegistered(MAYA)).value).toBe(false)
    expect((await views.account.accessKey(MAYA, "ed25519:x" as PublicKeyStr)).value).toEqual({ nonce: 7n, fullAccess: true })
    expect((await views.account.head()).blockHeight).toBe(4244)
  })
})
