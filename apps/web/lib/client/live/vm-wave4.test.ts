// hub 1.1.0 on testnet: get_trusts / get_goal / PotView.extras → the same view models the mock produces, the request
// tier and okBy through livePotVM, the on-chain goal winning over the device's "$X each", and ok_request's outcomes.
import { LEGACY_EXTRAS, type GoalView, type PotView, type RequestView, type TrustView } from "@pot/sdk"
import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/client/live/signing", () => ({ send: vi.fn() }))
import { livePotVM, type LiveBundle } from "./vm"
import { goalFeedOf, goalVMOf, trustVMOf } from "./vm-wave4"
import { okResultOf } from "./wave4"

const NOW = 1_800_000_000_000
const DAO = "ski-ab12.pots.potprev.testnet"
const A = "maya-ab12.users.pots.potprev.testnet"
const B = "sam-cd34.users.pots.potprev.testnet"

const trust = (o: Partial<TrustView> = {}): TrustView => ({
  pot: DAO as never,
  account: A as never,
  enabled: true,
  level: 1,
  maxLevel: 2,
  streak: 1,
  step: 3,
  nextLevelIn: 2,
  minQualifying: 10_000_000n,
  settled: 4,
  settledAmount: 200_000_000n,
  declined: 0,
  lastDeclinedMs: null,
  baseCap: 100_000_000n,
  multiplier: 2,
  effectiveCap: 200_000_000n,
  budgetLeft: 150_000_000n,
  instantUpTo: 150_000_000n,
  oneOkCap: 300_000_000n,
  ...o,
})

const view = (o: Partial<PotView> = {}): PotView =>
  ({
    pot: DAO,
    slug: "ski-ab12",
    name: "Ski Chalet",
    preset: "custom",
    creator: A,
    status: "open",
    rules: { instantCap: 100_000_000n, memberBudget: 300_000_000n, instantPayees: "members", payeeAllowlist: [] },
    rulesVersion: 1,
    totalIn: 400_000_000n,
    memberCount: 2,
    joiningCount: 0,
    approvalsNeeded: 2,
    createdAtMs: NOW - 86_400_000,
    seq: 9,
    proposalPeriodMs: 604_800_000,
    spentInstant: 0n,
    spentVote: 180_000_000n,
    reserved: 0n,
    balanceEstimate: 220_000_000n,
    requestCount: 1,
    openRequests: 0,
    activeInvites: 0,
    unpaidApproved: 0,
    float: 0n,
    usdc: "usdc.potprev.testnet",
    closingInFlight: false,
    extras: { trust: true, oneOkCap: 300_000_000n, links: true, goal: null },
    policyVersion: 1,
    goalState: "none",
    ...o,
  }) as PotView

const member = (account: string, joinIndex: number) => ({
  account,
  joinIndex,
  status: "active",
  joinedAtMs: NOW - 86_400_000,
  contributed: 200_000_000n,
  spent: 0n,
  instantUsed: 50_000_000n,
  budgetLeft: 250_000_000n,
  wouldGetBack: 110_000_000n,
  shareOfSpending: 90_000_000n,
  isLastContributor: false,
  balanceSource: "argument",
})

const request = (o: Partial<RequestView> = {}): RequestView =>
  ({
    id: 0,
    pot: DAO,
    requester: B,
    receiver: B,
    amount: 180_000_000n,
    category: "stay",
    requestRef: "ref00001",
    path: "vote",
    reason: "over_cap",
    status: "paid",
    hubStatus: "approved",
    proposalId: 3,
    createdAtMs: NOW - 3_600_000,
    updatedAtMs: NOW - 3_000_000,
    expiresAtMs: NOW + 6 * 86_400_000,
    tier: "one_ok",
    okBy: A,
    linkStatus: null,
    ...o,
  }) as RequestView

const goal = (o: Partial<GoalView> = {}): GoalView => ({
  pot: DAO as never,
  amount: 1_200_000_000n,
  deadlineMs: NOW + 3 * 86_400_000,
  allOrNothing: true,
  totalIn: 300_000_000n,
  state: "collecting",
  reachedAtMs: null,
  refundProposalId: null,
  canRefund: false,
  spendsBlocked: true,
  ...o,
})

const bundle = (o: Partial<LiveBundle> = {}): LiveBundle => ({
  dao: DAO,
  view: view(),
  balance: 220_000_000n,
  members: [member(A, 0), member(B, 1)] as never,
  requests: [request()],
  proposals: {},
  feed: null,
  invite: null,
  trusts: [trust(), trust({ account: B as never, level: 0, nextLevelIn: 3, effectiveCap: 100_000_000n, instantUpTo: 100_000_000n, settled: 1 })],
  ...o,
})

describe("live view models (hub 1.1.0)", () => {
  it("trust per member, extras, the request's tier and whose OK approved it", () => {
    const vm = livePotVM(bundle(), { me: A, now: NOW, goalEach: 150_000_000n })
    expect(vm.me!.trust).toMatchObject({ level: 1, effectiveCap: 200_000_000n, instantUpTo: 150_000_000n, nextCap: 300_000_000n, nextLevelIn: 2 })
    expect(vm.members.find((m) => m.person.id === B)!.trust).toMatchObject({ level: 0, nextCap: 200_000_000n })
    expect(vm.extras).toEqual({ trust: true, oneOkCap: 300_000_000n, links: true })
    const r = vm.feed.find((f) => f.kind === "request")
    expect(r?.kind === "request" && [r.request.tier, r.request.okBy?.id]).toEqual(["one_ok", A])
    expect(vm.goalDetail).toBeNull()
    expect(vm.goal).toBeNull() // no on-chain goal: no total (the device's "$X each" stays per person)
  })

  it("the on-chain goal wins over the device's estimate; a 1.0.0 Pot reads as everything off", () => {
    const vm = livePotVM(bundle({ view: view({ extras: { ...LEGACY_EXTRAS, goal: { amount: 1_200_000_000n, deadlineMs: NOW + 1, allOrNothing: true } } }), goal: goal() }), { me: A, now: NOW, goalEach: 150_000_000n })
    expect(vm.goal).toBe(1_200_000_000n)
    expect(vm.goalDetail).toMatchObject({ state: "collecting", spendsBlocked: true, totalIn: 300_000_000n })
    const legacy = livePotVM(bundle({ view: view({ extras: LEGACY_EXTRAS }), trusts: [] }), { me: A, now: NOW, goalEach: null })
    expect(legacy.extras).toEqual({ trust: false, oneOkCap: 0n, links: false })
    expect(legacy.me!.trust).toBeUndefined()
  })

  it("trust view → VM: the next limit, none at the top or with trust off", () => {
    expect(trustVMOf(trust({ level: 2, nextLevelIn: 0 })).nextCap).toBeNull()
    expect(trustVMOf(trust({ enabled: false })).nextCap).toBeNull()
  })

  it("goal: get_goal when there; extras.goal + goal_state otherwise; feed lines for reached / refunded", () => {
    const v = view({ extras: { ...LEGACY_EXTRAS, trust: true, goal: { amount: 9n, deadlineMs: NOW - 1, allOrNothing: true } }, goalState: "refunding" })
    expect(goalVMOf(v, null, NOW)).toMatchObject({ amount: 9n, state: "refunding", spendsBlocked: true })
    expect(goalVMOf(view({ extras: { ...LEGACY_EXTRAS, goal: { amount: 9n, deadlineMs: NOW + 5, allOrNothing: false } }, goalState: "none" }), null, NOW)).toMatchObject({ state: "collecting", spendsBlocked: false })
    expect(goalVMOf(view(), null, NOW)).toBeNull()
    const reached = goalFeedOf(DAO, view(), goal({ state: "reached", reachedAtMs: NOW - 10, spendsBlocked: false }), NOW)
    expect(reached).toEqual([{ key: `goal:reached:${DAO}`, kind: "goal", at: NOW - 10, state: "reached", amount: 1_200_000_000n }])
    const refunded = goalFeedOf(DAO, view({ closedAtMs: NOW - 5 }), goal({ state: "refunded" }), NOW)
    expect(refunded.map((f) => f.kind === "goal" && f.state)).toEqual(["refunded"])
  })

  it("ok_request outcomes → what the Approve sheet says", () => {
    expect(okResultOf(null, true, false)).toBe("approved")
    expect(okResultOf(null, true, true)).toBe("failed")
    expect(okResultOf("ERR_OK_SELF", false, false)).toBe("self")
    expect(okResultOf("OK_OBJECTION", false, false)).toBe("objection")
    expect(okResultOf("ERR_NOT_ONE_OK", false, false)).toBe("not_one_ok")
    expect(okResultOf("OK_NOT_PENDING", false, false)).toBe("decided")
    expect(okResultOf("OK_NOT_IN_DAO_GROUP", false, false)).toBe("not_member")
    expect(() => okResultOf("ERR_OK_IN_FLIGHT", false, false)).toThrow()
  })
})
