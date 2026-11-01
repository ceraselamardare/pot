// F-20 / F-22 on the mock world: close (pro-rata + dust, majority, read-only after), rules changes (one open
// request, the proposer's approval counted, applied on majority, sole member applies directly).
import { describe, expect, it } from "vitest"
import { cents } from "../money"
import { addMoney, createPot, HubError, joinPot, potView, proposeClose, proposeRules, requestSpend, seedWorld, setRules, vote, voteClose, voteRules } from "./world"

const NOW = 1_800_000_000_000
const RULES50 = { instantCap: 5_000, memberBudget: 20_000, expiryDays: 7 }

describe("close (P-9)", () => {
  it("D-61: $84 instant + $300 vote → $66 left → $22 each; Maya asks, Sam approves, Pot closed and read-only", () => {
    let w = seedWorld(NOW)
    w = requestSpend(w, "lisbon-trip", "maya", { amountCents: 8_400, category: "groceries", receiver: "maya" }, NOW).world
    const r = requestSpend(w, "lisbon-trip", "maya", { amountCents: 30_000, category: "tickets", receiver: "maya" }, NOW)
    w = vote(r.world, "lisbon-trip", r.request.id, "leo", "Approve", NOW).world
    let v = potView(w, "lisbon-trip", "leo", NOW)!
    expect(v.balance).toBe(cents(6_600))
    expect(v.closePreview?.payouts.map((p) => p.amount)).toEqual([cents(2_200), cents(2_200), cents(2_200)])
    expect(v.members.every((m) => m.getsBack === cents(2_200))).toBe(true)

    const c = proposeClose(w, "lisbon-trip", "maya", NOW + 1)
    w = c.world
    v = potView(w, "lisbon-trip", "sam", NOW + 1)!
    expect(v.status).toBe("closing")
    expect(v.close).toMatchObject({ status: "needs", k: 2, n: 3, mine: false, myVote: null })
    expect(v.close!.approvals.map((p) => p.id)).toEqual(["maya"])
    expect(v.close!.payouts.reduce((s, p) => s + p.amount, 0n)).toBe(cents(6_600))
    expect(() => addMoney(w, "lisbon-trip", "leo", 1_000, NOW + 2)).toThrow()
    expect(() => proposeClose(w, "lisbon-trip", "leo", NOW + 2)).toThrow(HubError)

    const sam = voteClose(w, "lisbon-trip", "sam", "Approve", NOW + 3)
    expect(sam.result).toBe("approved")
    v = potView(sam.world, "lisbon-trip", "leo", NOW + 3)!
    expect(v.status).toBe("closed")
    expect(v.balance).toBe(0n)
    expect(v.closedAt).toBe(NOW + 3)
    expect(v.me?.getsBack).toBe(cents(2_200)) // what the close paid, not the (now zero) balance
    expect(v.feed.some((f) => f.kind === "closed")).toBe(true)
    expect(voteClose(sam.world, "lisbon-trip", "leo", "Approve", NOW + 4).result).toBe("decided")
  })

  it("unequal example: Maya 200, Sam 150, Leo 100, $66 left → the remainder goes to whoever added last", () => {
    let w = seedWorld(NOW)
    const p = w.pots["lisbon-trip"]!
    p.members[0]!.contributed = 20_000
    p.members[2]!.contributed = 10_000
    p.balance = 6_600
    p.lastContributor = "leo"
    const v = potView(w, "lisbon-trip", "maya", NOW)!
    const byId = Object.fromEntries(v.closePreview!.payouts.map((x) => [x.person.id, x.amount]))
    expect(byId).toEqual({ maya: cents(2_933), sam: cents(2_200), leo: cents(1_467) })
    expect(v.closePreview!.dust).toBe(cents(1))
    expect(v.closePreview!.dustTo?.id).toBe("leo")
    w = proposeClose(w, "lisbon-trip", "maya", NOW).world
    expect(w.pots["lisbon-trip"]!.close!.payouts.reduce((s, x) => s + x.amount, 0)).toBe(6_600)
  })

  it("the group says no: the Pot reopens", () => {
    let w = seedWorld(NOW)
    w = proposeClose(w, "lisbon-trip", "maya", NOW).world
    w = voteClose(w, "lisbon-trip", "sam", "Reject", NOW).world
    const r = voteClose(w, "lisbon-trip", "leo", "Reject", NOW)
    expect(r.result).toBe("declined")
    expect(potView(r.world, "lisbon-trip", "leo", NOW)!.status).toBe("open")
  })

  it("a sole member's close applies at once (k = 1)", () => {
    let w = createPot(seedWorld(NOW), "maya", { name: "Solo", emoji: "🎈", cover: 1, goalEachCents: null, invite: { pk: "ed25519:x", secret: "s" } }, NOW, "ab12").world
    w = addMoney(w, "solo-ab12", "maya", 5_000, NOW)
    const c = proposeClose(w, "solo-ab12", "maya", NOW)
    expect(c.close.status).toBe("approved")
    expect(potView(c.world, "solo-ab12", "maya", NOW)!.status).toBe("closed")
  })
})

describe("rules (P-8)", () => {
  it("Maya asks for a $50 instant limit: her approval counts, Sam's applies it, new spends follow it", () => {
    let w = seedWorld(NOW)
    const pr = proposeRules(w, "lisbon-trip", "maya", RULES50, NOW)
    w = pr.world
    let v = potView(w, "lisbon-trip", "sam", NOW)!
    expect(v.rulesPending).toBe(true)
    expect(v.rulesChange).toMatchObject({ status: "needs", k: 2, n: 3, mine: false })
    expect(v.rulesChange!.from.instantCap).toBe(cents(10_000))
    expect(v.rulesChange!.to.instantCap).toBe(cents(5_000))
    expect(v.rules.instantCap).toBe(cents(10_000)) // not applied yet
    expect(v.feed.some((f) => f.kind === "rules_requested")).toBe(true)
    expect(() => proposeRules(w, "lisbon-trip", "leo", RULES50, NOW)).toThrow("ERR_RULES_PENDING")

    const r = voteRules(w, "lisbon-trip", "sam", "Approve", NOW + 1)
    expect(r.result).toBe("approved")
    v = potView(r.world, "lisbon-trip", "leo", NOW + 1)!
    expect(v.rules.instantCap).toBe(cents(5_000))
    expect(v.rulesPending).toBe(false)
    // $60 is now over the instant limit → the group decides
    const s = requestSpend(r.world, "lisbon-trip", "leo", { amountCents: 6_000, category: "food", receiver: "leo" }, NOW + 2)
    expect(s.request.path).toBe("vote")
    expect(s.request.reason).toBe("over_cap")
  })

  it("a sole member changes the rules directly; a bigger Pot must ask the group", () => {
    let w = createPot(seedWorld(NOW), "maya", { name: "Solo", emoji: "🎈", cover: 1, goalEachCents: null, invite: { pk: "ed25519:x", secret: "s" } }, NOW, "ab12").world
    w = setRules(w, "solo-ab12", "maya", RULES50, NOW)
    expect(potView(w, "solo-ab12", "maya", NOW)!.rules.instantCap).toBe(cents(5_000))
    expect(() => setRules(w, "lisbon-trip", "maya", RULES50, NOW)).toThrow("ERR_USE_PROPOSE_RULES")
    expect(joinPot(w, "solo-ab12", "sam", NOW).result).toBe("joined")
  })
})
