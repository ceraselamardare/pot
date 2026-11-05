// F-05 / F-16: chain views + the feed route → the same view models the mock produces (frontend-architecture
// §3.6-3.7). DAO status wins over the hub's (which moves only after `sync`); contributions the feed route never
// saw are filled in from the chain; names come from the feed's profiles, else the account.
import { describe, expect, it } from "vitest"
import type { AccountId, Api, MemberView, PotView, Proposal, RequestView } from "@pot/sdk"
import { coverOf, livePotVM, nameFromAccount, type LiveBundle } from "./vm"

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

describe("livePotVM", () => {
  it("maps the Pot, members and the money from chain views", () => {
    const vm = livePotVM(bundle(), { me: ben, now: NOW, goalEach: usd(150) })
    expect(vm.balance).toBe(usd(230))
    expect(vm.totalIn).toBe(usd(250))
    expect(vm.cover).toBe(3)
    expect(vm.k).toBe(2)
    expect(vm.me?.person).toMatchObject({ id: ben, name: "Ben", joinIndex: 1 })
    expect(vm.myShare).toBe(usd(138))
    expect(vm.goal).toBeNull() // "$150 each" stays per person, never a made-up total
    expect(vm.goalEach).toBe(usd(150))
    expect(vm.goalEachChosen).toBe(false) // not set on this device: Create's default, never shown as a fact
    expect(vm.invite).toBeNull()
  })

  it("an instant request reads 'instant'; an open vote with my pending approval waits on me", () => {
    const vm = livePotVM(bundle(), { me: ben, now: NOW, goalEach: usd(150) })
    const items = vm.feed.filter((f) => f.kind === "request").map((f) => (f.kind === "request" ? f.request : null)!)
    expect(items.find((r) => r.id === 1)!.status).toBe("instant")
    const vote = items.find((r) => r.id === 2)!
    expect(vote).toMatchObject({ status: "needs", proposalId: 2, note: "ferry", k: 2, n: 2 })
    expect(vote.approvals.map((p) => p.name)).toEqual(["Ana"])
    expect(vm.waitingOnMe.map((r) => r.id)).toEqual([2])
  })

  it("DAO truth beats the hub's lagging status (Approved before `sync`)", () => {
    const b = bundle({ proposals: { 1: proposal(1, "Approved", {}), 2: proposal(2, "Approved", { [ana]: "Approve", [ben]: "Approve" }) } })
    const vm = livePotVM(b, { me: ben, now: NOW, goalEach: null })
    const r = vm.feed.find((f) => f.kind === "request" && f.request.id === 2)
    expect(r?.kind === "request" && r.request.status).toBe("approved")
    expect(vm.waitingOnMe).toEqual([])
  })

  it("fills in contributions the feed route never saw, from the chain", () => {
    const vm = livePotVM(bundle(), { me: ana, now: NOW, goalEach: usd(150) })
    const ins = vm.feed.filter((f) => f.kind === "contribution").map((f) => (f.kind === "contribution" ? [f.actor.name, f.amount] : null))
    expect(ins).toEqual(expect.arrayContaining([["Ben", usd(150)], ["Ana", usd(100)]]))
    expect(ins).toHaveLength(2)
  })

  it("expires an open vote past its period, client-side (Sputnik sets it lazily)", () => {
    const vm = livePotVM(bundle(), { me: ben, now: NOW + 8 * 86_400_000, goalEach: null })
    const r = vm.feed.find((f) => f.kind === "request" && f.request.id === 2)
    expect(r?.kind === "request" && r.request.status).toBe("expired")
  })

  it("decodes an open close proposal into a CloseVM", () => {
    const transfer = (to: string, amount: string) => ({
      method_name: "ft_transfer",
      args: btoa(JSON.stringify({ receiver_id: to, amount })),
      deposit: "1",
      gas: "10000000000000",
    })
    const close = { ...proposal(7, "InProgress", { [ana]: "Approve" }), kind: { FunctionCall: { receiver_id: "usdc.x.testnet", actions: [transfer(ana, "92000000"), transfer(ben, "138000000")] } } } as Proposal
    const b = bundle({ view: view({ status: "closing", closeProposalId: 7 }), proposals: { ...bundle().proposals, 7: close } })
    const vm = livePotVM({ ...b, usdcId: "usdc.x.testnet" }, { me: ben, now: NOW, goalEach: null })
    expect(vm.close).toMatchObject({ proposalId: 7, status: "needs", myVote: null, mine: false, k: 2 })
    expect(vm.close!.payouts.map((p) => [p.person.name, p.amount])).toEqual([["Ana", usd(92)], ["Ben", usd(138)]])
    expect(vm.feed.some((f) => f.kind === "close_requested")).toBe(true)
  })
})

describe("names and covers", () => {
  it("reads first names from named accounts (the reference Pot's members), nothing from u-<8> ids", () => {
    expect(nameFromAccount("maya-qg6e.users.potprev.testnet")).toBe("Maya")
    expect(nameFromAccount("leo.users.potprev.testnet")).toBe("Leo")
    expect(nameFromAccount("u-z7wm7129.users.potprev.testnet")).toBeNull()
  })
  it("the group's \"$X each\" comes from the server for every member, else this browser's own, else only a prefill", () => {
    const fromServer = livePotVM(bundle({ feed: feed({ pot: { potId: D as never, slug: "trip-ab12", name: "Trip", goalEach: "50000000" } }) }), { me: ben, now: NOW, goalEach: usd(150) })
    expect([fromServer.goalEach, fromServer.goalEachChosen]).toEqual([usd(50), true])
    const localOnly = livePotVM(bundle(), { me: ben, now: NOW, goalEach: usd(40), goalEachChosen: true })
    expect([localOnly.goalEach, localOnly.goalEachChosen]).toEqual([usd(40), true])
    const neither = livePotVM(bundle(), { me: ben, now: NOW, goalEach: usd(150) })
    expect([neither.goalEach, neither.goalEachChosen, neither.goal]).toEqual([usd(150), false, null])
  })

  it("cover from the stored gradient, else stable from the slug", () => {
    expect(coverOf("x", "5")).toBe(5)
    expect(coverOf("lisbon-trip")).toBe(coverOf("lisbon-trip"))
    expect(coverOf("lisbon-trip")).toBeGreaterThanOrEqual(0)
  })
})

describe("brand avatars (feed profiles → every PersonVM)", () => {
  it("members' chosen avatars reach seats, feed items and requests; no choice = initials (null)", () => {
    const b = bundle({ feed: feed({ profiles: { [ana]: { name: "Ana", tint: "peach", avatar: "pot-03" }, [ben]: { name: "Ben", tint: "sage", avatar: null } } }) })
    const vm = livePotVM(b, { me: ben, now: NOW, goalEach: null })
    expect(vm.members.find((m) => m.person.id === ana)!.person.avatar).toBe("pot-03")
    expect(vm.members.find((m) => m.person.id === ben)!.person.avatar).toBeNull()
    const vote = vm.feed.find((f) => f.kind === "request" && f.request.id === 2)
    expect(vote?.kind === "request" && vote.request.requester.avatar).toBe("pot-03")
  })

  it("my own seat follows the session at once (before the feed refetches); unknown ids fall back to initials", () => {
    const b = bundle({ feed: feed({ profiles: { [ana]: { name: "Ana", tint: "peach", avatar: "pot-99" as never }, [ben]: { name: "Ben", tint: "sage", avatar: "pot-01" } } }) })
    const vm = livePotVM(b, { me: ben, myAvatar: "pot-08", now: NOW, goalEach: null })
    expect(vm.me?.person.avatar).toBe("pot-08")
    expect(vm.members.find((m) => m.person.id === ana)!.person.avatar).toBeNull()
  })
})
