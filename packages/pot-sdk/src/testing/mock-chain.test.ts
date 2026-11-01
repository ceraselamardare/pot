// MockChain flows (F-03): the D-61 fixtures, instant vs vote, votes + auto-sync, invites, close,
// rules, payout failure + retry, expiry, and the real error codes / relayer rejections.
import { describe, expect, it } from "vitest"
import type { Err, RelayOk } from "../types/api.ts"
import type { AccountId, Slug } from "../types/ids.ts"
import type { ActionIntent } from "../types/intents.ts"
import { closeKind, transferKind } from "../actions/kinds.ts"
import { buildCall } from "../actions/build.ts"
import { formatUsd } from "../money.ts"
import { signJoinWebCrypto, generateInviteSeed, webCryptoInviteKey } from "../invite.ts"
import { LISBON, LISBON_EXPECTED, LISBON_STATES, lisbonTrip } from "./fixtures.ts"
import { MockChain } from "./mock-chain.ts"
import { MockSigner } from "./mock-signer.ts"

const L = LISBON
const ok = (r: RelayOk | Err): RelayOk => {
  if (!r.ok) throw new Error(`relay rejected: ${r.reason}`)
  return r
}
const rejected = (r: RelayOk | Err): string => (r.ok ? `ok:${r.outcome}` : r.reason)
const code = (r: RelayOk | Err): string | undefined => (r.ok ? r.errorCode : `rejected:${r.reason}`)
const events = (r: RelayOk | Err): string[] => (r.ok ? r.events.filter((e) => e.standard === "pot").map((e) => e.event) : [])
async function kindOf(chain: MockChain, id: number) {
  const p = (await chain.dao.getProposal(L.dao, id)).value
  if (!p) throw new Error("no proposal")
  return p.kind
}
const vote = async (chain: MockChain, who: AccountId, id: number, action: "VoteApprove" | "VoteReject" | "Finalize" = "VoteApprove") =>
  chain.relayIntent(who, { type: "vote", pot: L.dao, proposalId: id, kind: await kindOf(chain, id), action })

describe("Lisbon Trip fixtures at every D-61 state", () => {
  for (const s of LISBON_STATES) {
    it(`${s}: balance, totals, members, status`, async () => {
      const { chain } = await lisbonTrip(s)
      const exp = LISBON_EXPECTED[s]
      const pot = (await chain.hub.getPot(L.dao)).value
      expect((await chain.usdc.balanceOf(L.dao)).value).toBe(exp.balance)
      expect(pot).toMatchObject({ totalIn: exp.totalIn, memberCount: exp.members, status: exp.status, name: "Lisbon Trip", emoji: L.emoji, preset: "trip" })
      // the contract's ledger estimate ignores close payouts: a closed Pot still reports $66 (read ft_balance_of)
      expect(pot?.balanceEstimate).toBe(s === "closed" ? 66_000_000n : exp.balance)
      expect((await chain.dao.getPolicy(L.dao)).value.members).toHaveLength(exp.members)
    })
  }

  it("seeded = the README / demo-pool state: $450, Maya, Sam, Leo, no spends, an active invite", async () => {
    const { chain, invite } = await lisbonTrip("seeded")
    const members = (await chain.hub.getMembers(L.dao)).value
    expect(members.map((m) => [m.account, m.joinIndex, m.contributed])).toEqual([
      [L.maya, 0, 150_000_000n],
      [L.sam, 1, 150_000_000n],
      [L.leo, 2, 150_000_000n],
    ])
    expect((await chain.hub.getRequests(L.dao, 0, 50)).value).toEqual([])
    const inv = (await chain.hub.getInvite(L.dao, invite.publicKey)).value
    expect(inv).toMatchObject({ createdBy: L.maya, maxUses: 10, uses: 2, status: "active" })
    expect(inv?.expiresAtMs).toBe((inv?.createdAtMs ?? 0) + 7 * 86_400_000)
    expect((await chain.hub.getPotsOf(L.leo)).value.map((p) => [p.slug, p.myContribution])).toEqual([["lisbon-trip", 150_000_000n]])
  })

  it("after_instant: $84 approved by Pot rules, Maya's budget used", async () => {
    const { chain, proposals } = await lisbonTrip("after_instant")
    const [r] = (await chain.hub.getRequests(L.dao, 0, 50)).value
    expect(r).toMatchObject({ amount: 84_000_000n, path: "instant", reason: "within_rules", status: "approved", category: "groceries", requestRef: L.refs.groceries })
    const p = (await chain.dao.getProposal(L.dao, proposals.groceries as number)).value
    expect(p?.status).toBe("Approved")
    expect(p?.votes).toEqual({ [L.hub]: "Approve" })
    expect(p?.description).toBe(`Pot request #0: groceries (ref ${L.refs.groceries})`)
    const maya = (await chain.hub.getMembers(L.dao)).value[0]
    expect(maya).toMatchObject({ instantUsed: 84_000_000n, budgetLeft: 116_000_000n, spent: 84_000_000n })
  })

  it("vote_pending: $300 needs 2 of 3, Maya's own approval cast (1 of 2)", async () => {
    const { chain, proposals } = await lisbonTrip("vote_pending")
    const req = (await chain.hub.getRequest(L.dao, 1)).value
    expect(req).toMatchObject({ amount: 300_000_000n, path: "vote", reason: "over_cap", status: "proposed", hubStatus: "pending", proposalId: proposals.boat })
    const p = (await chain.dao.getProposal(L.dao, proposals.boat as number)).value
    expect(p?.status).toBe("InProgress")
    expect(p?.voteCounts.member).toEqual([1, 0, 0])
    expect((await chain.hub.getPot(L.dao)).value?.approvalsNeeded).toBe(2)
    expect((await chain.hub.getProposalSubject(L.dao, proposals.boat as number)).value).toMatchObject({ kind: "spend", requestId: 1, live: true })
  })

  it("vote_approved: $300 paid to Maya, $66 left, preview_close = $22.00 each", async () => {
    const { chain } = await lisbonTrip("vote_approved")
    const pot = (await chain.hub.getPot(L.dao)).value
    expect(pot).toMatchObject({ spentVote: 300_000_000n, spentInstant: 84_000_000n, openRequests: 0 })
    expect((await chain.hub.getRequest(L.dao, 1)).value?.hubStatus).toBe("approved")
    const cp = (await chain.hub.previewClose(L.dao, 66_000_000n)).value
    expect(cp.payouts.map((p) => formatUsd(p.amount))).toEqual(["$22.00", "$22.00", "$22.00"])
    expect(cp).toMatchObject({ canPropose: true, dust: 0n, dustTo: L.leo })
    const leo = (await chain.hub.getMembers(L.dao, 66_000_000n)).value[2]
    expect(leo).toMatchObject({ wouldGetBack: 22_000_000n, shareOfSpending: 128_000_000n }) // ux-spec §4.5 row
  })

  it("close_proposed → closed: everyone gets $22.00 back, the Pot is read-only", async () => {
    const proposed = await lisbonTrip("close_proposed")
    expect((await proposed.chain.hub.getPot(L.dao)).value).toMatchObject({ status: "closing", closeProposalId: proposed.proposals.close })
    expect((await proposed.chain.hub.previewClose(L.dao)).value).toMatchObject({ balanceSource: "close_record", blockedReason: "close_in_progress" })
    const { chain } = await lisbonTrip("closed")
    expect((await chain.hub.getPot(L.dao)).value?.status).toBe("closed")
    expect(chain.balanceOf(L.maya)).toBe(84_000_000n + 300_000_000n + 22_000_000n)
    expect(chain.balanceOf(L.sam)).toBe(22_000_000n)
    expect(chain.balanceOf(L.leo)).toBe(22_000_000n)
    expect(chain.eventLog.filter((e) => e.event === "pot_closed")).toHaveLength(1)
    expect(rejected(await chain.relayIntent(L.leo, { type: "add_money", pot: L.dao, amount: 1_000_000n }))).toBe("pot_closed")
  })

  it("fixtures are independent clones", async () => {
    const a = await lisbonTrip("seeded")
    const b = await lisbonTrip("seeded")
    a.chain.fund(L.sam, 1n)
    expect(b.chain.balanceOf(L.sam)).toBe(0n)
  })
})

describe("spend flows", () => {
  it("instant spend: events, result, budget", async () => {
    const { chain } = await lisbonTrip("seeded")
    const r = ok(await chain.relayIntent(L.sam, { type: "request_spend", pot: L.dao, amount: 40_000_000n, receiverId: L.sam, category: "food", requestRef: "s1s1s1s1s1s1s1s1" }))
    expect(r.outcome).toBe("success")
    expect(events(r)).toEqual(["spend_requested", "spend_auto_approved"])
    expect(r.result).toMatchObject({ type: "spend", path: "instant", payout: "sent", approvalsNeeded: 2 })
    expect(r.events.some((e) => e.standard === "nep141")).toBe(true)
    expect(r.executedAtBlock).toBe(chain.height())
    expect(chain.balanceOf(L.sam)).toBe(40_000_000n)
  })

  it("budget: $84 + $100 instant, then $20 is over budget, $16 is exactly the limit (T-22)", async () => {
    const { chain } = await lisbonTrip("after_instant")
    const spend = (amount: bigint, ref: string) => chain.relayIntent(L.maya, { type: "request_spend", pot: L.dao, amount, receiverId: L.maya, category: "food", requestRef: ref })
    expect(ok(await spend(100_000_000n, "a1a1a1a1a1a1a1a1")).result).toMatchObject({ path: "instant" })
    expect((await chain.hub.previewSpend(L.dao, L.maya, 20_000_000n, L.maya)).value).toMatchObject({ path: "vote", reason: "over_budget" })
    expect(ok(await spend(20_000_000n, "a2a2a2a2a2a2a2a2")).result).toMatchObject({ path: "vote" })
    expect(ok(await spend(16_000_000n, "a3a3a3a3a3a3a3a3")).result).toMatchObject({ path: "instant" })
  })

  it("new member (rev4): Leo before putting money in → vote, reason new_member", async () => {
    const chain = new MockChain({ cfg: L.cfg })
    for (const a of [L.maya, L.leo]) chain.createAccount(a)
    chain.fund(L.maya, 100_000_000n)
    const seed = generateInviteSeed()
    const key = await webCryptoInviteKey(seed)
    ok(await chain.relayIntent(L.maya, { type: "create_pot", slug: L.slug, name: L.name, preset: "trip", rules: null, invitePk: key.publicKey }))
    ok(await chain.relayIntent(L.maya, { type: "add_money", pot: L.dao, amount: 100_000_000n }))
    const sig = await signJoinWebCrypto(seed, L.dao, L.leo)
    expect(ok(await chain.relayIntent(L.leo, { type: "join", pot: L.dao, ...sig })).result).toEqual({ type: "join", member: L.leo, status: "active" })
    expect((await chain.hub.previewSpend(L.dao, L.leo, 50_000_000n, L.leo)).value).toMatchObject({ path: "vote", reason: "new_member" })
    const r = ok(await chain.relayIntent(L.leo, { type: "request_spend", pot: L.dao, amount: 50_000_000n, receiverId: L.leo, category: "food", requestRef: "n1n1n1n1n1n1n1n1" }))
    expect(r.result).toMatchObject({ path: "vote" })
    expect((await chain.hub.getRequest(L.dao, 0)).value?.reason).toBe("new_member")
  })

  it("refusals come back as inner_failed with REFUSED_* codes and leave no record", async () => {
    const { chain } = await lisbonTrip("seeded")
    chain.unregisterUsdc(L.sam)
    const r = await chain.relayIntent(L.maya, { type: "request_spend", pot: L.dao, amount: 20_000_000n, receiverId: L.sam, category: "food", requestRef: "r1r1r1r1r1r1r1r1" })
    expect(code(r)).toBe("REFUSED_PAYEE_NOT_REGISTERED")
    expect(ok(r).result).toMatchObject({ type: "spend", proposalId: null })
    expect((await chain.hub.getPot(L.dao)).value).toMatchObject({ requestCount: 1, reserved: 0n })
    expect((await chain.hub.getRequest(L.dao, 0)).value).toBeNull()
    const big = await chain.relayIntent(L.maya, { type: "request_spend", pot: L.dao, amount: 500_000_000n, receiverId: L.maya, category: "stay", requestRef: "r2r2r2r2r2r2r2r2" })
    expect(code(big)).toBe("REFUSED_INSUFFICIENT_BALANCE")
  })

  it("hub panics carry the contract's ERR_ codes", async () => {
    const { chain } = await lisbonTrip("seeded")
    const outsider = "eve.testnet" as AccountId
    chain.createAccount(outsider)
    const r = await chain.relayIntent(outsider, { type: "request_spend", pot: L.dao, amount: 1_000_000n, receiverId: outsider, category: "other", requestRef: "e1e1e1e1e1e1e1e1" })
    expect(code(r)).toBe("ERR_NOT_MEMBER")
    expect(ok(r).error).toContain("ERR_NOT_MEMBER")
    expect(code(await chain.relayIntent(L.maya, { type: "request_spend", pot: L.dao, amount: 1_000_000n, receiverId: L.dao, category: "other", requestRef: "e2e2e2e2e2e2e2e2" }))).toBe("ERR_BAD_RECEIVER")
    expect(code(await chain.relayIntent(L.maya, { type: "create_pot", slug: "demo" as Slug, name: "X", preset: "trip", rules: null }))).toBe("ERR_SLUG_RESERVED")
    expect(code(await chain.relayIntent(L.maya, { type: "create_pot", slug: "ok-slug" as Slug, name: "evil‮name", preset: "trip", rules: null }))).toBe("ERR_NAME_INVALID")
    expect(rejected(await chain.relayIntent(L.maya, { type: "create_pot", slug: L.slug, name: "Again", preset: "trip", rules: null }))).toBe("slug_taken")
    chain.fund(L.sam, 1_000_000n)
    ok(await chain.relayIntent(L.sam, { type: "add_money", pot: L.dao, amount: 1_000_000n }))
    expect(code(await chain.relayIntent(L.maya, { type: "propose_close", pot: L.dao }))).toBe("ERR_POT_BUSY") // a contribution < 60 s ago
    expect((await chain.hub.previewClose(L.dao)).value.blockedReason).toBe("busy")
    // a failed call changes nothing
    expect((await chain.hub.getPot(L.dao)).value?.status).toBe("open")
  })

  it("contributions: wallet without funds, non-member refund", async () => {
    const { chain } = await lisbonTrip("seeded")
    expect(code(await chain.relayIntent(L.sam, { type: "add_money", pot: L.dao, amount: 1_000_000n }))).toBe("INSUFFICIENT_FUNDS")
    chain.createAccount("eve.testnet")
    chain.fund("eve.testnet", 5_000_000n)
    const r = ok(await chain.relayIntent("eve.testnet", { type: "add_money", pot: L.dao, amount: 5_000_000n }))
    expect(r).toMatchObject({ outcome: "inner_failed", errorCode: "ERR_NOT_MEMBER" })
    expect(r.result).toEqual({ type: "contribution", recorded: false, amount: "5000000", usedAmount: "0" })
    expect(chain.balanceOf("eve.testnet")).toBe(5_000_000n) // refunded
    chain.fund(L.sam, 10_000_000n)
    const good = ok(await chain.relayIntent(L.sam, { type: "add_money", pot: L.dao, amount: 10_000_000n }))
    expect(good.result).toEqual({ type: "contribution", recorded: true, amount: "10000000", usedAmount: "10000000" })
    expect(events(good)).toEqual(["contribution"])
    expect((await chain.hub.getPot(L.dao)).value?.lastContributor).toBe(L.sam)
  })
})

describe("votes, sync, retry, expiry", () => {
  it("the relayer refuses double votes, wrong kinds, wrong gas and deposits (R11, general rules)", async () => {
    const { chain, proposals } = await lisbonTrip("vote_pending")
    const id = proposals.boat as number
    expect(rejected(await vote(chain, L.maya, id))).toBe("already_voted")
    expect(rejected(await chain.relayIntent(L.sam, { type: "vote", pot: L.dao, proposalId: id, kind: transferKind(L.usdc, L.sam, 300_000_000n), action: "VoteApprove" }))).toBe("args_invalid")
    const c = buildCall({ type: "vote", pot: L.dao, proposalId: id, kind: await kindOf(chain, id), action: "VoteApprove" }, L.cfg)
    const a = c.actions[0] as Extract<(typeof c.actions)[number], { type: "FunctionCall" }>
    expect(rejected(await chain.relay(L.sam, { ...c, actions: [{ ...a, gas: a.gas * 3n }] }))).toBe("gas_cap")
    expect(rejected(await chain.relay(L.sam, { ...c, actions: [{ ...a, deposit: 1n }] }))).toBe("deposit_cap")
    expect(rejected(await chain.relay("eve.testnet", c))).toBe("not_a_member")
    expect(rejected(await chain.relay(L.sam, { receiverId: "random.testnet", actions: [a] }))).toBe("receiver_not_allowed")
    expect(rejected(await chain.relay(L.sam, { receiverId: L.usdc, actions: [{ ...a, method: "ft_transfer", args: {}, deposit: 1n }] }))).toBe("method_not_allowed")
  })

  it("without the relayer's pre-flight, the DAO itself panics with Sputnik codes", async () => {
    const { chain, proposals } = await lisbonTrip("vote_pending")
    const loose = chain.clone()
    loose.setRelayPolicy(false)
    const id = proposals.boat as number
    expect(code(await vote(loose, L.maya, id))).toBe("ERR_ALREADY_VOTED")
    expect(code(await loose.relayIntent(L.sam, { type: "vote", pot: L.dao, proposalId: id, kind: transferKind(L.usdc, L.sam, 1n), action: "VoteApprove" }))).toBe("ERR_WRONG_KIND")
    expect(code(await vote(loose, "eve.testnet" as AccountId, id))).toBe("ERR_PERMISSION_DENIED")
  })

  it("Leo's approval executes the payout; the relayer's sync updates the hub (A8)", async () => {
    const { chain, proposals } = await lisbonTrip("vote_pending")
    const r = ok(await vote(chain, L.leo, proposals.boat as number))
    expect(r.result).toEqual({ type: "vote", proposalId: proposals.boat, action: "VoteApprove", proposalStatus: "Approved", payout: "sent" })
    expect(events(r)).toEqual([]) // the DAO emits no NEP-297 events; sync runs as its own tx
    const sync = chain.txLog.at(-1)
    expect(sync?.methods).toEqual(["sync"])
    expect(sync?.events.map((e) => e.event)).toEqual(["proposal_synced"])
    expect((await chain.hub.getRequest(L.dao, 1)).value?.hubStatus).toBe("approved")
  })

  it("rejection by the majority → rejected after sync", async () => {
    const { chain, proposals } = await lisbonTrip("vote_pending")
    ok(await vote(chain, L.sam, proposals.boat as number, "VoteReject"))
    const r = ok(await vote(chain, L.leo, proposals.boat as number, "VoteReject"))
    expect(r.result).toMatchObject({ proposalStatus: "Rejected" })
    expect((await chain.hub.getRequest(L.dao, 1)).value).toMatchObject({ status: "rejected" })
    expect((await chain.hub.getPot(L.dao)).value?.openRequests).toBe(0)
  })

  it("expiry: after 7 days the relayer refuses the vote and sync marks it expired", async () => {
    const { chain, proposals } = await lisbonTrip("vote_pending")
    chain.advanceTime(8 * 86_400_000)
    const id = proposals.boat as number
    expect(rejected(await vote(chain, L.leo, id))).toBe("proposal_not_open")
    expect(code(await chain.relay(L.relayer, buildCall({ type: "retry_payout", pot: L.dao, proposalId: id }, L.cfg)))).toBe("ERR_NOT_RETRYABLE")
    const s = ok(await chain.relay(L.sam, { receiverId: L.hub, actions: [{ type: "FunctionCall", method: "sync", args: { pot: L.dao, proposal_id: id }, gas: 50n * 10n ** 12n, deposit: 0n }] }))
    expect(s.outcome).toBe("success")
    expect((await chain.hub.getRequest(L.dao, 1)).value?.status).toBe("expired")
  })

  it("payout failure → payout_failed (sync) → register → retry_payout → approved", async () => {
    const { chain, proposals } = await lisbonTrip("vote_pending")
    chain.unregisterUsdc(L.maya) // e.g. storage_unregister after asking
    const r = ok(await vote(chain, L.leo, proposals.boat as number))
    expect(r.result).toMatchObject({ proposalStatus: "Failed", payout: "failed" })
    expect((await chain.hub.getRequest(L.dao, 1)).value?.status).toBe("payout_failed")
    expect(chain.eventLog.some((e) => e.event === "spend_payout_failed")).toBe(true)
    expect((await chain.hub.previewClose(L.dao)).value.blockedReason).toBe("payouts_pending")
    expect(code(await chain.relayIntent(L.maya, { type: "propose_close", pot: L.dao }))).toBe("ERR_PAYOUTS_PENDING")
    chain.registerUsdc(L.maya)
    const retry = ok(await chain.relayIntent(L.sam, { type: "retry_payout", pot: L.dao, proposalId: proposals.boat as number }))
    expect(retry.result).toMatchObject({ type: "maintenance", proposalStatus: "Approved" })
    expect((await chain.hub.getRequest(L.dao, 1)).value?.status).toBe("approved")
    expect(code(await chain.relayIntent(L.sam, { type: "retry_payout", pot: L.dao, proposalId: proposals.boat as number }))).toBe("ERR_NOT_RETRYABLE")
  })
})

describe("invites and joins", () => {
  it("join errors: bad signature, wrong joiner, already member, revoked, used up, expired", async () => {
    const { chain, invite } = await lisbonTrip("pre_leo")
    const seed = LISBON.inviteSeed
    const forSam = await signJoinWebCrypto(seed, L.dao, L.sam)
    expect(code(await chain.relayIntent(L.leo, { type: "join", pot: L.dao, ...forSam }))).toBe("ERR_BAD_SIGNATURE") // a stolen signature is useless
    expect(code(await chain.relayIntent(L.sam, { type: "join", pot: L.dao, ...forSam }))).toBe("ERR_ALREADY_MEMBER")
    const forLeo = await signJoinWebCrypto(seed, L.dao, L.leo)
    const later = chain.clone()
    later.advanceTime(8 * 86_400_000)
    expect(code(await later.relayIntent(L.leo, { type: "join", pot: L.dao, ...forLeo }))).toBe("ERR_INVITE_EXPIRED")
    const revoked = chain.clone()
    expect(events(ok(await revoked.relayIntent(L.maya, { type: "revoke_invite", pot: L.dao, invitePk: invite.publicKey })))).toEqual(["invite_revoked"])
    expect(code(await revoked.relayIntent(L.leo, { type: "join", pot: L.dao, ...forLeo }))).toBe("ERR_INVITE_REVOKED")
    expect((await revoked.hub.getInvite(L.dao, invite.publicKey)).value?.status).toBe("revoked")
    // a one-use link
    const seed1 = generateInviteSeed()
    const k1 = await webCryptoInviteKey(seed1)
    expect(ok(await chain.relayIntent(L.sam, { type: "add_invite", pot: L.dao, invitePk: k1.publicKey, maxUses: 1 })).result).toEqual({ type: "invite", added: k1.publicKey })
    ok(await chain.relayIntent(L.leo, { type: "join", pot: L.dao, ...(await signJoinWebCrypto(seed1, L.dao, L.leo)) }))
    chain.createAccount("ana.users.potapp.testnet")
    expect(code(await chain.relayIntent("ana.users.potapp.testnet", { type: "join", pot: L.dao, ...(await signJoinWebCrypto(seed1, L.dao, "ana.users.potapp.testnet")) }))).toBe("ERR_INVITE_USED_UP")
    expect(code(await chain.relayIntent(L.sam, { type: "add_invite", pot: L.dao, invitePk: k1.publicKey }))).toBe("ERR_INVITE_EXISTS")
    expect(code(await chain.relayIntent(L.sam, { type: "add_invite", pot: L.dao, invitePk: (await webCryptoInviteKey(generateInviteSeed())).publicKey, maxUses: 41 }))).toBe("ERR_INVITE_MAX_USES_INVALID")
  })

  it("rotate_invite is one delegate: revoke the old link, add a new one", async () => {
    const { chain, invite } = await lisbonTrip("seeded")
    const k = await webCryptoInviteKey(generateInviteSeed())
    const r = ok(await chain.relayIntent(L.leo, { type: "rotate_invite", pot: L.dao, oldPk: invite.publicKey, newPk: k.publicKey }))
    expect(events(r)).toEqual(["invite_revoked", "invite_added"])
    expect(r.result).toEqual({ type: "invite", revoked: invite.publicKey, added: k.publicKey })
  })

  it("joining moves the threshold for open requests (3 → 4 members needs 3)", async () => {
    const { chain } = await lisbonTrip("vote_pending")
    const ana = "ana.users.potapp.testnet"
    chain.createAccount(ana)
    ok(await chain.relayIntent(ana, { type: "join", pot: L.dao, ...(await signJoinWebCrypto(L.inviteSeed, L.dao, ana)) }))
    expect((await chain.hub.getPot(L.dao)).value?.approvalsNeeded).toBe(3)
  })
})

describe("rules and close", () => {
  it("propose_rules → the group approves at 300 Tgas → set_rules applied by the DAO", async () => {
    const { chain } = await lisbonTrip("seeded")
    const rules = { instantCap: 50_000_000n, memberBudget: 150_000_000n, instantPayees: "members" as const, payeeAllowlist: [] }
    const r = ok(await chain.relayIntent(L.sam, { type: "propose_rules", pot: L.dao, rules }))
    expect(events(r)).toEqual(["rules_change_proposed"])
    const pid = (r.result as { proposalId: number }).proposalId
    expect(code(await chain.relayIntent(L.leo, { type: "propose_rules", pot: L.dao, rules }))).toBe("ERR_RULES_PENDING")
    expect(code(await chain.relayIntent(L.sam, { type: "set_rules", pot: L.dao, rules }))).toBe("ERR_USE_PROPOSE_RULES")
    ok(await vote(chain, L.sam, pid))
    const done = ok(await vote(chain, L.leo, pid))
    expect(done.result).toMatchObject({ proposalStatus: "Approved" })
    expect((await chain.hub.getRules(L.dao)).value).toMatchObject({ rules, rulesVersion: 2 })
    expect((await chain.hub.getPot(L.dao)).value?.openRulesProposal).toBeUndefined()
    expect(chain.eventLog.filter((e) => e.event === "rules_changed").map((e) => (e.data as { by: string }).by)).toEqual(["group"])
  })

  it("a sole member changes rules directly", async () => {
    const chain = new MockChain({ cfg: L.cfg })
    chain.createAccount(L.maya)
    ok(await chain.relayIntent(L.maya, { type: "create_pot", slug: "solo" as Slug, name: "Solo", preset: "trip", rules: null }))
    const dao = "solo.pots.potapp.testnet" as typeof L.dao
    const r = ok(await chain.relayIntent(L.maya, { type: "set_rules", pot: dao, rules: { instantCap: 1n, memberBudget: 2n, instantPayees: "members", payeeAllowlist: [] } }))
    expect(r.result).toEqual({ type: "rules", applied: true })
    expect(chain.eventLog.at(-1)?.data).toMatchObject({ by: "sole_member" })
  })

  it("close: one open proposal, contributions blocked, unequal split with dust (V2)", async () => {
    const chain = new MockChain({ cfg: L.cfg })
    const seed = generateInviteSeed()
    const key = await webCryptoInviteKey(seed)
    for (const a of [L.maya, L.sam, L.leo]) chain.createAccount(a)
    chain.fund(L.maya, 200_000_000n)
    chain.fund(L.sam, 150_000_000n)
    chain.fund(L.leo, 100_000_000n)
    ok(await chain.relayIntent(L.maya, { type: "create_pot", slug: L.slug, name: L.name, preset: "trip", rules: null, invitePk: key.publicKey }))
    for (const who of [L.sam, L.leo]) ok(await chain.relayIntent(who, { type: "join", pot: L.dao, ...(await signJoinWebCrypto(seed, L.dao, who)) }))
    const amounts: [AccountId, bigint][] = [[L.maya, 200_000_000n], [L.sam, 150_000_000n], [L.leo, 100_000_000n]]
    for (const [who, amt] of amounts) ok(await chain.relayIntent(who, { type: "add_money", pot: L.dao, amount: amt }))
    // spend $384 via one instant + one voted request to land on $66
    ok(await chain.relayIntent(L.maya, { type: "request_spend", pot: L.dao, amount: 84_000_000n, receiverId: L.maya, category: "groceries", requestRef: "v2v2v2v2v2v2v2v1" }))
    const boat = ok(await chain.relayIntent(L.maya, { type: "request_spend", pot: L.dao, amount: 300_000_000n, receiverId: L.maya, category: "tickets", requestRef: "v2v2v2v2v2v2v2v2" }))
    const bid = (boat.result as { proposalId: number }).proposalId
    ok(await vote(chain, L.maya, bid))
    ok(await vote(chain, L.sam, bid))
    chain.advanceTime(120_000)
    const close = ok(await chain.relayIntent(L.leo, { type: "propose_close", pot: L.dao }))
    expect(events(close)).toEqual(["close_proposed"])
    const cid = (close.result as { proposalId: number }).proposalId
    const k = await kindOf(chain, cid)
    expect(k).toEqual(closeKind(L.usdc, [{ account: L.maya, amount: 29_333_333n }, { account: L.sam, amount: 22_000_000n }, { account: L.leo, amount: 14_666_667n }]))
    expect(code(await chain.relayIntent(L.maya, { type: "propose_close", pot: L.dao }))).toBe("rejected:pot_closed")
    expect(rejected(await chain.relayIntent(L.sam, { type: "request_spend", pot: L.dao, amount: 1n, receiverId: L.sam, category: "food", requestRef: "v2v2v2v2v2v2v2v3" }))).toBe("pot_closed")
    expect(buildCall({ type: "vote", pot: L.dao, proposalId: cid, kind: k, action: "VoteApprove" }, L.cfg).actions[0]).toMatchObject({ gas: 300n * 10n ** 12n })
    ok(await vote(chain, L.leo, cid))
    const fin = ok(await vote(chain, L.maya, cid))
    expect(fin.result).toMatchObject({ proposalStatus: "Approved", payout: "sent" })
    expect(fin.events.filter((e) => e.standard === "nep141")).toHaveLength(3)
    expect((await chain.hub.getPot(L.dao)).value?.status).toBe("closed")
    expect((await chain.usdc.balanceOf(L.dao)).value).toBe(0n)
    expect(chain.balanceOf(L.leo)).toBe(14_666_667n) // the dust cent goes to the last contributor
  })
})

describe("MockSigner (frontend wiring before testnet)", () => {
  it("prepare → sign → handleRelayBody runs a demo relay body", async () => {
    const { chain } = await lisbonTrip("seeded")
    const sam = new MockSigner(chain, L.sam)
    expect(await sam.readiness()).toBe("ready")
    const intent: ActionIntent = { type: "request_spend", pot: L.dao, amount: 30_000_000n, receiverId: L.sam, category: "transport", requestRef: "m0m0m0m0m0m0m0m0" }
    const signed = await sam.sign(await sam.prepare(intent))
    expect(signed).toMatchObject({ via: "relay", body: { idempotencyKey: "m0m0m0m0m0m0m0m0", demo: { intent: { amount: "30000000" } } } })
    const r = ok(await sam.send({ ...intent, requestRef: "m1m1m1m1m1m1m1m1" }))
    expect(r.result).toMatchObject({ path: "instant", payout: "sent" })
  })
})
