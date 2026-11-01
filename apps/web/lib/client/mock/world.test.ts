// The mock world plays the D-61 demo story with the hub's rules, so the UI beats and copy match testnet.
import { describe, expect, it } from "vitest"
import { dollars } from "../money"
import { addMoney, createPot, joinPot, potView, requestSpend, requestsOf, seedWorld, slugify, vote } from "./world"

const NOW = Date.UTC(2026, 10, 3, 12)

describe("D-61 story", () => {
  it("Leo joins Porto Weekend from the invite and adds $150 → $450 of $450", () => {
    let w = seedWorld(NOW)
    const j = joinPot(w, "porto-weekend", "leo", NOW)
    expect(j.result).toBe("joined")
    w = addMoney(j.world, "porto-weekend", "leo", 15_000, NOW + 1)
    const v = potView(w, "porto-weekend", "leo", NOW + 2)!
    expect(v.balance).toBe(dollars(450))
    expect(v.totalIn).toBe(v.goal)
    expect(v.members.map((m) => [m.person.name, m.person.joinIndex])).toContainEqual(["Leo", 2])
    expect(joinPot(w, "porto-weekend", "leo", NOW).result).toBe("already_member")
  })

  it("$84 groceries are approved by Pot rules at once → $366", () => {
    const r = requestSpend(seedWorld(NOW), "lisbon-trip", "maya", { amountCents: 8400, category: "groceries", receiver: "maya" }, NOW)
    expect(r.request).toMatchObject({ path: "instant", status: "paid" })
    expect(potView(r.world, "lisbon-trip", "maya", NOW)!.balance).toBe(dollars(366))
  })

  it("$300 boat needs 2 of 3; Maya's approval counts; Leo's completes it → $66, $22 each back", () => {
    let w = seedWorld(NOW)
    w = requestSpend(w, "lisbon-trip", "maya", { amountCents: 8400, category: "groceries", receiver: "maya" }, NOW).world
    const r = requestSpend(w, "lisbon-trip", "maya", { amountCents: 30000, category: "tickets", receiver: "maya", note: "the boat" }, NOW)
    expect(r.request).toMatchObject({ path: "vote", reason: "over_cap", status: "proposed" })
    const leoView = requestsOf(r.world, "leo", NOW)
    expect(leoView.waiting).toHaveLength(1)
    expect(leoView.waiting[0]).toMatchObject({ k: 2, n: 3 })
    expect(leoView.waiting[0]!.approvals.map((p) => p.name)).toEqual(["Maya"])
    expect(requestsOf(r.world, "maya", NOW).mine).toHaveLength(1)
    const v = vote(r.world, "lisbon-trip", r.request.id, "leo", "Approve", NOW + 1)
    expect(v.result).toBe("approved")
    const pot = potView(v.world, "lisbon-trip", "leo", NOW + 2)!
    expect(pot.balance).toBe(dollars(66))
    expect(pot.members.map((m) => m.getsBack)).toEqual([dollars(22), dollars(22), dollars(22)])
    expect(vote(v.world, "lisbon-trip", r.request.id, "leo", "Approve", NOW).result).toBe("already")
    expect(vote(v.world, "lisbon-trip", r.request.id, "sam", "Approve", NOW).result).toBe("decided")
  })

  it("two declines out of three reject it; nothing leaves the Pot", () => {
    const r = requestSpend(seedWorld(NOW), "lisbon-trip", "maya", { amountCents: 30000, category: "tickets", receiver: "maya" }, NOW)
    let w = vote(r.world, "lisbon-trip", r.request.id, "sam", "Reject", NOW).world
    const v = vote(w, "lisbon-trip", r.request.id, "leo", "Reject", NOW)
    expect(v.result).toBe("declined")
    w = v.world
    expect(potView(w, "lisbon-trip", "maya", NOW)!.balance).toBe(dollars(450))
  })

  it("requests expire after 7 days (computed on the client)", () => {
    const r = requestSpend(seedWorld(NOW), "lisbon-trip", "maya", { amountCents: 30000, category: "tickets", receiver: "maya" }, NOW)
    const later = NOW + 8 * 86_400_000
    expect(requestsOf(r.world, "leo", later).decided[0]?.status).toBe("expired")
    expect(vote(r.world, "lisbon-trip", r.request.id, "leo", "Approve", later).result).toBe("expired")
  })

  it("a member who hasn't put money in asks the group (rev4 new_member)", () => {
    const j = joinPot(seedWorld(NOW), "porto-weekend", "leo", NOW)
    const r = requestSpend(j.world, "porto-weekend", "leo", { amountCents: 5000, category: "food", receiver: "leo" }, NOW)
    expect(r.request).toMatchObject({ path: "vote", reason: "new_member" })
  })
})

describe("createPot", () => {
  it("kebab slug ≤ 24 + 4-char suffix, creator is the only member, 7-day 10-use invite", () => {
    const r = createPot(seedWorld(NOW), "maya", { name: "Ski Weekend in the Alps 2027!", emoji: "🎿", cover: 2, goalEachCents: 15000, invite: { pk: "ed25519:x", secret: "s" } }, NOW, "a1b2")
    expect(r.slug).toBe("ski-weekend-in-the-alps-a1b2")
    const v = potView(r.world, r.slug, "maya", NOW)!
    expect(v.members).toHaveLength(1)
    expect(v.invite!.usesLeft).toBe(10)
    expect(v.invite!.expiresAt - NOW).toBe(7 * 86_400_000)
  })
  it("slugify", () => expect(slugify("Café & Co")).toBe("cafe-co"))
})
