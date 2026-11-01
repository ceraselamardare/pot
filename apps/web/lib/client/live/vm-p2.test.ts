// F-20 / F-22 on the live view models: "Gets back" from hub preview_close, the open rules request decoded from
// its DAO proposal (never the UI's guess), the close payouts decoded from the close proposal's ft_transfers.
import { describe, expect, it } from "vitest"
import { closeKind, rulesKind, type AccountId, type Api, type ClosePreview, type MemberView, type PotView, type Proposal, type RequestView } from "@pot/sdk"
import { livePotVM, type LiveBundle } from "./vm"

const HUB = "pots.x.testnet"
const USDC = "usdc.x.testnet"
const NOW = 1_800_000_000_000
const D = "trip-ab12.pots.x.testnet"
const ana = "u-aaaaaaaa.users.x.testnet" as AccountId
const ben = "u-bbbbbbbb.users.x.testnet" as AccountId
const usd = (n: number) => BigInt(n) * 1_000_000n

const view = (o: Partial<PotView> = {}): PotView =>
  ({
    pot: D,
    slug: "trip-ab12",
    name: "Trip",
    emoji: "🎿",
    preset: "trip",
    creator: ana,
    status: "open",
    rules: { instantCap: usd(100), memberBudget: usd(200), instantPayees: "members", payeeAllowlist: [] },
    rulesVersion: 1,
    totalIn: usd(250),
    memberCount: 2,
    joiningCount: 0,
    approvalsNeeded: 2,
    createdAtMs: NOW - 3_600_000,
    seq: 9,
    proposalPeriodMs: 7 * 86_400_000,
    spentInstant: usd(20),
    spentVote: 0n,
    reserved: 0n,
    balanceEstimate: usd(230),
    requestCount: 2,
    openRequests: 1,
    activeInvites: 1,
    unpaidApproved: 0,
    float: 0n,
    usdc: "usdc.x.testnet",
    closingInFlight: false,
    ...o,
  }) as PotView

const member = (account: string, joinIndex: number, contributed: number, back: number): MemberView =>
  ({
    account,
    joinIndex,
    status: "active",
    joinedAtMs: NOW - 3_000_000 + joinIndex,
    contributed: usd(contributed),
    spent: 0n,
    instantUsed: 0n,
    budgetLeft: usd(200),
    wouldGetBack: usd(back),
    shareOfSpending: 0n,
    isLastContributor: false,
    balanceSource: "argument",
  }) as MemberView

const req = (id: number, o: Partial<RequestView>): RequestView =>
  ({
    id,
    pot: D,
    requester: ben,
    receiver: ben,
    amount: usd(20),
    category: "groceries",
    requestRef: `ref${id}`,
    path: "instant",
    reason: "within_rules",
    status: "approved",
    hubStatus: "approved",
    proposalId: id,
    createdAtMs: NOW - 60_000,
    updatedAtMs: NOW - 59_000,
    expiresAtMs: NOW + 86_400_000,
    ...o,
  }) as RequestView

const proposal = (id: number, status: Proposal["status"], votes: Record<string, "Approve" | "Reject">): Proposal =>
  ({ id, proposer: "pots.x.testnet", description: "", kind: { Transfer: { token_id: "usdc.x.testnet", receiver_id: ana, amount: "120000000" } }, status, voteCounts: {}, votes, submissionTimeNs: BigInt(NOW - 30_000) * 1_000_000n }) as unknown as Proposal

const feed = (o: Partial<Api.FeedRes> = {}): Api.FeedRes => ({
  ok: true,
  requestId: "req_1",
  pot: { potId: D, slug: "trip-ab12", name: "Trip", gradient: "3" },
  items: [{ key: "contribution:tx1", type: "contribution", actor: ben, at: new Date(NOW - 120_000).toISOString(), amount: "150000000", txHash: "tx1" }],
  profiles: { [ana]: { name: "Ana", tint: "peach" }, [ben]: { name: "Ben", tint: "sage" } },
  memos: { ref2: "ferry" },
  syncedAt: new Date(NOW).toISOString(),
  ...o,
})

const bundle = (o: Partial<LiveBundle> = {}): LiveBundle => ({
  dao: D,
  view: view(),
  balance: usd(230),
  members: [member(ana, 0, 100, 92), member(ben, 1, 150, 138)],
  requests: [req(1, {}), req(2, { requester: ana, receiver: ana, amount: usd(120), path: "vote", reason: "over_cap", status: "proposed", hubStatus: "pending", category: "tickets" })],
  proposals: { 1: proposal(1, "Approved", {}), 2: proposal(2, "InProgress", { [ana]: "Approve" }) },
  feed: feed(),
  invite: null,
  ...o,
})


const kindProposal = (id: number, kind: unknown, votes: Record<string, "Approve" | "Reject">, status: Proposal["status"] = "InProgress"): Proposal =>
  ({ id, proposer: HUB, description: "", kind, status, voteCounts: {}, votes, submissionTimeNs: BigInt(NOW - 60_000) * 1_000_000n }) as unknown as Proposal

describe("live P2 view models", () => {
  it("Members' Gets back comes from preview_close (pro-rata + dust), not the local estimate", () => {
    const closePreview: ClosePreview = {
      pot: D as never,
      balance: usd(230),
      balanceSource: "argument",
      totalIn: usd(250),
      approvalsNeeded: 2,
      openRequests: 1,
      payouts: [
        { account: ana, contributed: usd(100), amount: 92_000_001n },
        { account: ben, contributed: usd(150), amount: 137_999_999n },
      ],
      dust: 1n,
      dustTo: ana,
      canPropose: true,
      blockedReason: null,
    } as unknown as ClosePreview
    const vm = livePotVM(bundle({ closePreview }), { me: ben, now: NOW, goalEach: null })
    expect(vm.members.find((m) => m.person.id === ana)?.getsBack).toBe(92_000_001n)
    expect(vm.me?.getsBack).toBe(137_999_999n)
    expect(vm.closePreview).toMatchObject({ canPropose: true, openRequests: 1, dust: 1n })
    expect(vm.closePreview?.dustTo?.name).toBe("Ana")
  })

  it("decodes the open rules request from its proposal; the proposer's approval is counted", () => {
    const to = { instantCap: usd(50), memberBudget: usd(200), instantPayees: "members" as const, payeeAllowlist: [] }
    const p = kindProposal(7, rulesKind(HUB, D, to), { [ana]: "Approve" })
    const vm = livePotVM(
      bundle({ hubId: HUB, view: view({ openRulesProposal: 7 }), proposals: { ...bundle().proposals, 7: p } }),
      { me: ben, now: NOW, goalEach: null },
    )
    expect(vm.rulesPending).toBe(true)
    expect(vm.rulesChange).toMatchObject({ proposalId: 7, status: "needs", k: 2, n: 2, mine: false, myVote: null })
    expect(vm.rulesChange?.proposer.name).toBe("Ana")
    expect(vm.rulesChange?.from.instantCap).toBe(usd(100))
    expect(vm.rulesChange?.to.instantCap).toBe(usd(50))
    expect(vm.rulesChange?.pending.map((x) => x.id)).toEqual([ben])
    expect(vm.feed.some((f) => f.kind === "rules_requested")).toBe(true)
  })

  it("a rules proposal for another Pot (or not set_rules) is not shown as this Pot's change", () => {
    const other = kindProposal(7, rulesKind(HUB, "other.pots.x.testnet", { instantCap: usd(1), memberBudget: usd(1), instantPayees: "members", payeeAllowlist: [] }), {})
    const vm = livePotVM(bundle({ hubId: HUB, view: view({ openRulesProposal: 7 }), proposals: { 7: other } }), { me: ben, now: NOW, goalEach: null })
    expect(vm.rulesChange).toBeNull()
    expect(vm.rulesPending).toBe(true) // the hub still says one is open: the button stays held
  })

  it("the close request's payouts are decoded from its ft_transfers; closing in flight is passed through", () => {
    const k = closeKind(USDC, [
      { account: ana, amount: usd(92) },
      { account: ben, amount: usd(138) },
    ])
    const vm = livePotVM(
      bundle({ usdcId: USDC, view: view({ status: "closing", closeProposalId: 9, closingInFlight: true }), proposals: { ...bundle().proposals, 9: kindProposal(9, k, { [ana]: "Approve" }) } }),
      { me: ben, now: NOW, goalEach: null },
    )
    expect(vm.closingInFlight).toBe(true)
    expect(vm.close?.payouts.map((x) => [x.person.name, x.amount])).toEqual([
      ["Ana", usd(92)],
      ["Ben", usd(138)],
    ])
    expect(vm.close).toMatchObject({ status: "needs", mine: false, myVote: null })
    expect(vm.close?.pending?.map((x) => x.id)).toEqual([ben])
    expect(vm.closePreview).toBeNull() // only open Pots preview a close
  })
})
