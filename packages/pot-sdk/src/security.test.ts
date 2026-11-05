// hub 1.3.0 security fixes: the client twins (decide, who may give the one OK, policy versions, parse of the
// new view fields) must match contracts/pot-hub (unit_security.rs, t_security.rs). Names start with the audit ID.
import { describe, expect, it } from "vitest"
import { decideSpend, type DecideInput } from "./math/decide.ts"
import { parseMemberView, parseOkCheck, parsePotView } from "./read/parse.ts"
import { validateExtras } from "./rules.ts"
import { HUB_1_3, okGiverRefusal, policyApprovesGoalRefund, policyMembersPropose } from "./security.ts"
import { HUB_ERROR_CODES } from "./types/errors.ts"
import type { RawMemberView, RawPotView } from "./types/hub-raw.ts"
import { PRESET_RULES, type RuleExtras } from "./types/hub.ts"
import type { DaoId } from "./types/ids.ts"

const HUB = "pots.potprev.testnet"
const USDC = "usdc.potprev.testnet"
const DAO = "trip.pots.potprev.testnet" as DaoId
const trip = PRESET_RULES.trip // $100 instant, $200 budget
const ON: RuleExtras = {
  trust: true,
  oneOkCap: 300_000_000n,
  links: true,
  goal: null,
}
const USD = 1_000_000n

const base: DecideInput = {
  paused: false,
  potOpen: true,
  hubId: HUB,
  daoId: DAO,
  usdcId: USDC,
  rules: trip,
  requestCount: 0,
  maxRequestsPerPot: 1000,
  maxPendingPerMember: 10,
  requester: { instantUsed: 0n, contributed: 100n * USD, pendingVotes: 0 },
  receiverIsMember: true,
  receiverId: "eve.testnet",
  amount: 50n * USD,
  extras: ON,
  trustLevel: 0,
  memberCount: 3,
}

describe("hub 1.3.0 decide twin", () => {
  it("HUB-2: a 1-unit contribution is not a stake (new member, the group decides)", () => {
    const one = { ...base.requester!, contributed: 1n }
    expect(decideSpend({ ...base, requester: one })).toMatchObject({
      path: "vote",
      reason: "new_member",
      tier: "group",
    })
    expect(
      decideSpend({
        ...base,
        requester: { ...one, contributed: HUB_1_3.minStake - 1n },
      }),
    ).toMatchObject({ reason: "new_member" })
    expect(
      decideSpend({
        ...base,
        requester: { ...one, contributed: HUB_1_3.minStake },
      }),
    ).toMatchObject({ path: "instant" })
    expect(decideSpend({ ...base, amount: 150n * USD, requester: one })).toMatchObject({ reason: "over_cap", tier: "group" })
  })
  it("W4-1: one-OK spends are charged to a lifetime allowance = the one-OK ceiling ($300), separate from the budget", () => {
    const used = (oneOkUsed: bigint) => ({ ...base.requester!, oneOkUsed })
    expect(decideSpend({ ...base, amount: 300n * USD })).toMatchObject({ reason: "over_cap", tier: "one_ok" })
    expect(decideSpend({ ...base, amount: 150n * USD, requester: used(150n * USD) })).toMatchObject({ tier: "one_ok" })
    expect(decideSpend({ ...base, amount: 151n * USD, requester: used(150n * USD) })).toMatchObject({ reason: "over_cap", tier: "group" })
    expect(decideSpend({ ...base, amount: 101n * USD, requester: used(300n * USD) })).toMatchObject({ tier: "group" })
    // the instant budget is separate: a used-up allowance doesn't touch instant spends
    expect(decideSpend({ ...base, amount: 100n * USD, requester: used(300n * USD) })).toMatchObject({ path: "instant" })
    // over the budget but within the allowance: still one OK
    const spent = { ...used(0n), instantUsed: 200n * USD }
    expect(decideSpend({ ...base, amount: 50n * USD, requester: spent })).toMatchObject({ reason: "over_budget", tier: "one_ok" })
  })
  it("W4-8: no link under $1", () => {
    const link = {
      ...base,
      isLink: true,
      receiverId: HUB,
      receiverIsMember: false,
    }
    expect(decideSpend({ ...link, amount: HUB_1_3.minLinkAmount - 1n })).toMatchObject({
      ok: false,
      code: "ERR_LINK_TOO_SMALL",
      previewReason: "link_too_small",
    })
    expect(decideSpend({ ...link, amount: HUB_1_3.minLinkAmount })).toMatchObject({ ok: true, path: "instant" })
  })
})

describe("W4-1: who may give the one OK (the hub's ok_giver_rules)", () => {
  const req = {
    requester: "maya.testnet",
    receiver: "sam.testnet",
    requestCreatedAtMs: 1_000,
  }
  const member = { joinedAtMs: 500, contributed: USD }
  it("not the requester, a member, not the payee, joined before the request, has added ≥ $1", () => {
    expect(okGiverRefusal({ ...req, by: "maya.testnet", member })).toBe("self")
    expect(okGiverRefusal({ ...req, by: "x.testnet", member: null })).toBe("not_member")
    expect(okGiverRefusal({ ...req, by: "sam.testnet", member })).toBe("receiver")
    expect(
      okGiverRefusal({
        ...req,
        by: "leo.testnet",
        member: { ...member, joinedAtMs: 1_000 },
      }),
    ).toBe("joined_after")
    expect(
      okGiverRefusal({
        ...req,
        by: "leo.testnet",
        member: { ...member, contributed: USD - 1n },
      }),
    ).toBe("no_stake")
    expect(okGiverRefusal({ ...req, by: "leo.testnet", member })).toBeNull()
  })
})

describe("HUB-1: policy versions", () => {
  it("v3 / v4 members only vote; v2 / v4 let the hub approve the goal refund", () => {
    expect([1, 2, 3, 4].map(policyMembersPropose)).toEqual([true, true, false, false])
    expect([1, 2, 3, 4].map(policyApprovesGoalRefund)).toEqual([false, true, false, true])
    const now = 1_800_000_000_000
    const aon = {
      ...ON,
      goal: { amount: USD, deadlineMs: now + 3_600_000, allOrNothing: true },
    }
    const cur = (policyVersion: number) => ({
      extras: ON,
      policyVersion,
      goalLocked: false,
    })
    expect(validateExtras(trip, aon, now, cur(3))).toBe("ERR_GOAL_UNSUPPORTED")
    expect(validateExtras(trip, aon, now, cur(4))).toBeNull()
  })
  it("the new error codes are mirrored", () => {
    expect(HUB_ERROR_CODES).toContain("ERR_OK_NOT_ELIGIBLE")
    expect(HUB_ERROR_CODES).toContain("ERR_LINK_TOO_SMALL")
  })
})

describe("hub 1.3.0 view fields", () => {
  it("parse: close_settling, one_ok_used, get_ok_check (absent on older hubs)", () => {
    const m: RawMemberView = {
      account_id: "maya.testnet",
      join_index: 0,
      status: "active",
      joined_at_ms: 1,
      contributed: "100000000",
      spent: "0",
      instant_used: "50000000",
      budget_left: "0",
      would_get_back: "0",
      share_of_spending: "0",
      is_last_contributor: false,
      balance_source: "ledger",
    }
    expect(parseMemberView(m).oneOkUsed).toBeUndefined()
    expect(parseMemberView({ ...m, one_ok_used: "150000000", one_ok_left: "150000000" })).toMatchObject({
      oneOkUsed: 150_000_000n,
      oneOkLeft: 150_000_000n,
    })
    const rawPot = {
      pot: DAO,
      slug: "trip",
      name: "Trip",
      emoji: null,
      preset: "trip",
      seq: 3,
      rules: {
        instant_cap: "100000000",
        member_budget: "200000000",
        instant_payees: "members",
        payee_allowlist: [],
      },
      rules_version: 1,
      status: "closing",
      close_proposal_id: 9,
      creator: "maya.testnet",
      created_at_ms: 1,
      closed_at_ms: null,
      member_count: 3,
      joining_count: 0,
      approvals_needed: 2,
      proposal_period_ms: 604_800_000,
      total_contributed: "0",
      spent_instant: "0",
      spent_vote: "0",
      reserved: "0",
      balance_estimate: "0",
      last_contributor: null,
      request_count: 0,
      open_requests: 0,
      active_invites: 0,
      unpaid_approved: 0,
      float: "1",
      usdc: USDC,
    } as RawPotView
    expect(parsePotView(rawPot).closeSettling).toBeUndefined()
    expect(parsePotView({ ...rawPot, close_settling: true, policy_version: 3 })).toMatchObject({ closeSettling: true, policyVersion: 3 })
    expect(
      parseOkCheck({
        pot: DAO,
        request_id: 3,
        account_id: "leo.testnet",
        can_ok: false,
        reason: "joined_after",
      }),
    ).toEqual({
      pot: DAO,
      requestId: 3,
      account: "leo.testnet",
      canOk: false,
      reason: "joined_after",
    })
  })
})
