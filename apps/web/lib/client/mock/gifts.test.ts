// Gifts in the mock world (hub 1.2.0 twin + our server's rules): links, giving, the switches, the public page, the
// members' view, my gifts, and the close with gifts (pro-rata shares them; equal split when nobody added money).
import { describe, expect, it } from "vitest"
import { GIFT_LINK_TTL_MS } from "@/lib/gifts"
import { cents } from "../money"
import * as G from "./gifts"
import { seedWorld } from "./world"
import * as W from "./world"
import type { World } from "./types"

const NOW = Date.UTC(2026, 10, 2, 12)
const fresh = (): World => G.withGiftShowcase(seedWorld(NOW), NOW)
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as G.GiftWorldError).code
  }
  return "ok"
}

describe("gift links", () => {
  it("members make them (giver chooses by default, reusable, 14 days); outsiders can't", () => {
    const { world, link } = G.createGiftLink(fresh(), "lisbon-trip", "maya", { amount: null }, NOW, "linkLisbon000000000001")
    expect(link).toMatchObject({ amount: null, reusable: true, uses: 0, expiresAt: NOW + GIFT_LINK_TTL_MS, revokedAt: null, createdBy: "maya" })
    expect(G.activeGiftLinks(world, "lisbon-trip", "sam", NOW)!.map((l) => l.id)).toEqual(["linkLisbon000000000001"])
    expect(G.activeGiftLinks(world, "lisbon-trip", "alex", NOW)).toBeNull()
    expect(code(() => G.createGiftLink(fresh(), "lisbon-trip", "alex", { amount: null }, NOW, "x".repeat(22)))).toBe("not_member")
  })

  it("a fixed amount must be $1-$10,000; the note is cleaned and ≤ 140", () => {
    expect(code(() => G.createGiftLink(fresh(), "lisbon-trip", "maya", { amount: 50 }, NOW, "a".repeat(22)))).toBe("too_low")
    expect(code(() => G.createGiftLink(fresh(), "lisbon-trip", "maya", { amount: 1_000_001 }, NOW, "a".repeat(22)))).toBe("too_high")
    expect(code(() => G.createGiftLink(fresh(), "lisbon-trip", "maya", { amount: null, note: "x".repeat(141) }, NOW, "a".repeat(22)))).toBe("invalid")
    const { link } = G.createGiftLink(fresh(), "lisbon-trip", "maya", { amount: 2_500, note: "  For   the  flat\n" }, NOW, "a".repeat(22))
    expect(link.note).toBe("For the flat")
  })

  it("revoke (any member, idempotent) and expiry end a link", () => {
    let w = G.createGiftLink(fresh(), "lisbon-trip", "maya", { amount: null }, NOW, "b".repeat(22)).world
    w = G.revokeGiftLink(w, "lisbon-trip", "sam", "b".repeat(22), NOW + 1)
    expect(G.revokeGiftLink(w, "lisbon-trip", "sam", "b".repeat(22), NOW + 2)).toBe(w)
    expect(G.giftLandingOf(w, "lisbon-trip", "b".repeat(22), NOW)!.link.status).toBe("revoked")
    const w2 = G.createGiftLink(fresh(), "lisbon-trip", "maya", { amount: null }, NOW, "c".repeat(22)).world
    expect(G.giftLandingOf(w2, "lisbon-trip", "c".repeat(22), NOW + GIFT_LINK_TTL_MS)!.link.status).toBe("expired")
    expect(code(() => G.revokeGiftLink(w2, "lisbon-trip", "alex", "c".repeat(22), NOW))).toBe("not_member")
  })
})

describe("giving", () => {
  const link = (w: World, input: G.GiftLinkInput, id = "d".repeat(22)) => G.createGiftLink(w, "lisbon-trip", "maya", input, NOW, id).world

  it("a gift adds to the Pot's money, never to anyone's 'put in'; members see it in the feed with its note", () => {
    const w0 = link(fresh(), { amount: null })
    const { world, gift } = G.giveGift(w0, { slug: "lisbon-trip", linkId: "d".repeat(22), who: "alex", amount: 1_000, name: "Alex", note: "Have fun ☕" }, NOW + 5, "g".padEnd(24, "1"))
    expect(world.pots["lisbon-trip"]!.balance).toBe(46_000)
    expect(world.pots["lisbon-trip"]!.members.map((m) => m.contributed)).toEqual([15_000, 15_000, 15_000])
    expect(world.giftLinks!.find((l) => l.id === "d".repeat(22))!.uses).toBe(1)
    expect(gift).toMatchObject({ from: "alex", name: "Alex", note: "Have fun ☕", showPublic: false, amount: 1_000 })
    const v = W.potView(world, "lisbon-trip", "maya", NOW + 10)!
    expect(v.gifts).toMatchObject({ on: true, total: cents(1_000), count: 1, page: { on: false, line: null } })
    const row = v.feed.find((f) => f.kind === "gift")
    expect(row && row.kind === "gift" && row.gift).toMatchObject({ note: "Have fun ☕", from: { name: "Alex" }, amount: cents(1_000) })
    expect(v.totalIn).toBe(cents(45_000))
  })

  it("a fixed-amount link takes only its amount; a one-time link only one gift", () => {
    const w0 = link(fresh(), { amount: 2_500, reusable: false })
    expect(code(() => G.giveGift(w0, { slug: "lisbon-trip", linkId: "d".repeat(22), who: "alex", amount: 1_000 }, NOW, "g".padEnd(24, "2")))).toBe("fixed_amount")
    const w1 = G.giveGift(w0, { slug: "lisbon-trip", linkId: "d".repeat(22), who: "alex", amount: 2_500 }, NOW, "g".padEnd(24, "2")).world
    expect(code(() => G.giveGift(w1, { slug: "lisbon-trip", linkId: "d".repeat(22), who: "alex", amount: 2_500 }, NOW, "g".padEnd(24, "3")))).toBe("used")
    expect(G.giftLandingOf(w1, "lisbon-trip", "d".repeat(22), NOW)!.link.status).toBe("used")
  })

  it("$1 at least; refused while gifts are off, while an all-or-nothing goal collects, and once the Pot isn't open", () => {
    const w0 = link(fresh(), { amount: null })
    const give = (w: World) => G.giveGift(w, { slug: "lisbon-trip", linkId: "d".repeat(22), who: "alex", amount: 500 }, NOW, "g".padEnd(24, "4"))
    expect(code(() => G.giveGift(w0, { slug: "lisbon-trip", linkId: "d".repeat(22), who: "alex", amount: 99 }, NOW, "g".padEnd(24, "4")))).toBe("too_low")
    const off = G.setGiftsOn(w0, "lisbon-trip", "sam", false)
    expect(G.giftTakingOf(off.pots["lisbon-trip"]!)).toBe("off")
    expect(code(() => give(off))).toBe("off")
    expect(code(() => give(G.setGiftsOn(off, "lisbon-trip", "leo", true)))).toBe("ok")
    const goal = structuredClone(w0)
    goal.pots["lisbon-trip"]!.extras = { trust: false, oneOkCap: 0, links: false, goal: { amount: 100_000, deadline: NOW + 86_400_000, allOrNothing: true } }
    expect(code(() => give(goal))).toBe("goal")
    const closed = structuredClone(w0)
    closed.pots["lisbon-trip"]!.status = "closed"
    expect(code(() => give(closed))).toBe("closed")
    expect(code(() => G.setGiftsOn(w0, "lisbon-trip", "alex", false))).toBe("not_member")
  })

  it("the public page: off until a member turns it on; then anyone; only opted-in givers are listed", () => {
    const w0 = fresh()
    expect(G.giftPageOf(w0, "lisbon-trip")).toMatchObject({ on: false, line: null })
    expect(G.giftPageOf(w0, "lisbon-trip")!.givers).toBeUndefined()
    expect(code(() => G.giveGift(w0, { slug: "lisbon-trip", linkId: null, who: "alex", amount: 500 }, NOW, "g".padEnd(24, "5")))).toBe("page_off")
    let w = G.setGiftPage(w0, "lisbon-trip", "maya", { on: true, line: "Thanks for helping ☕" })
    w = G.giveGift(w, { slug: "lisbon-trip", linkId: null, who: "alex", amount: 500, name: "Alex", note: "Shown", showPublic: true }, NOW + 1, "g".padEnd(24, "5")).world
    w = G.giveGift(w, { slug: "lisbon-trip", linkId: null, who: "alex", amount: 700, name: "Alex B", note: "Private" }, NOW + 2, "g".padEnd(24, "6")).world
    const p = G.giftPageOf(w, "lisbon-trip")!
    expect(p).toMatchObject({ on: true, line: "Thanks for helping ☕", taking: "yes", total: cents(1_200), count: 2 })
    expect(p.givers!.map((g) => [g.name, g.note])).toEqual([["Alex", "Shown"]])
    expect(JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("Private")
    // the line can be kept (undefined) or removed (null)
    expect(G.setGiftPage(w, "lisbon-trip", "sam", { on: false }).pots["lisbon-trip"]!.giftPage).toEqual({ on: false, line: "Thanks for helping ☕" })
    expect(G.setGiftPage(w, "lisbon-trip", "sam", { on: true, line: null }).pots["lisbon-trip"]!.giftPage).toEqual({ on: true, line: null })
  })

  it("show my name only on the public page; the giver edits their own gift only", () => {
    const w0 = link(fresh(), { amount: null })
    const w1 = G.giveGift(w0, { slug: "lisbon-trip", linkId: "d".repeat(22), who: "alex", amount: 500, showPublic: true }, NOW, "g".padEnd(24, "7")).world
    expect(w1.gifts!.at(-1)!.showPublic).toBe(false)
    expect(code(() => G.editGift(w1, "g".padEnd(24, "7"), "maya", { note: "hi" }))).toBe("not_giver")
    const w2 = G.editGift(w1, "g".padEnd(24, "7"), "alex", { name: "Al", note: "Later note" })
    expect(w2.gifts!.at(-1)).toMatchObject({ name: "Al", note: "Later note" })
  })

  it("my gifts: newest first, across Pots, with the Pot's name", () => {
    const mine = G.myGiftsOf(fresh(), "alex")
    expect(mine.map((g) => [g.slug, g.potName, g.amount])).toEqual([["leos-birthday", "Leo's Birthday", cents(500)]])
    expect(G.myGiftsOf(fresh(), "maya")).toEqual([])
  })
})

describe("the showcase", () => {
  it("Leo's Birthday: $100 put in + $40 in gifts, the page on with a line, an open and a $25 link", () => {
    const w = fresh()
    const v = W.potView(w, "leos-birthday", "maya", NOW)!
    expect(v.balance).toBe(cents(14_000))
    expect(v.gifts).toMatchObject({ total: cents(4_000), count: 3, page: { on: true, line: "Help us throw Leo the best birthday ☕" } })
    expect(G.giftLandingOf(w, "leos-birthday", G.BIRTHDAY_LINKS.fixed, NOW)!.link.amount).toBe(cents(2_500))
    expect(G.giftPageOf(w, "leos-birthday")!.givers!.map((g) => g.name)).toEqual(["Ana"])
  })
})

describe("a gift from the giver's own Pot dollars", () => {
  it("is recorded with its source and comes out of their Pot dollars (never below zero)", () => {
    // Maya has Pot dollars once a Pot paid her (an instant $84 to herself)
    const w0 = W.requestSpend(fresh(), "lisbon-trip", "maya", { amountCents: 8_400, category: "groceries", receiver: "maya" }, NOW).world
    const before = W.ownDollarsOf(w0, "maya")
    expect(before).toBeGreaterThan(500)
    const { world, gift } = G.giveGift(w0, { slug: "leos-birthday", linkId: G.BIRTHDAY_LINKS.open, who: "maya", amount: 500, source: "pot_dollars" }, NOW, "g".padEnd(24, "7"))
    expect(gift.source).toBe("pot_dollars")
    expect(W.ownDollarsOf(world, "maya")).toBe(before - 500)
    // demo dollars don't touch them
    const demo = G.giveGift(world, { slug: "leos-birthday", linkId: G.BIRTHDAY_LINKS.open, who: "maya", amount: 500 }, NOW, "g".padEnd(24, "6"))
    expect(demo.gift.source).toBeUndefined()
    expect(W.ownDollarsOf(demo.world, "maya")).toBe(before - 500)
  })
})

describe("the close with gifts (hub 1.2.0)", () => {
  it("pro-rata over the real balance shares the gifts by what each person put in", () => {
    const w = fresh()
    const pot = w.pots["leos-birthday"]!
    // $140 in the Pot, Maya and Sam each put in $50 → $70 each
    expect(W.closeMath(pot).payouts).toEqual([
      { account: "maya", amount: 7_000 },
      { account: "sam", amount: 7_000 },
    ])
  })

  it("nobody added money: split equally, the remainder to the last member; and the close is allowed", () => {
    let w = fresh()
    w = G.setGiftPage(w, "porto-weekend", "maya", { on: true })
    const pot = w.pots["porto-weekend"]!
    pot.members.forEach((m) => (m.contributed = 0))
    pot.balance = 0
    pot.requests = []
    w = G.giveGift(w, { slug: "porto-weekend", linkId: null, who: "alex", amount: 1_001 }, NOW, "g".padEnd(24, "8")).world
    const math = W.closeMath(w.pots["porto-weekend"]!)
    expect(math.payouts).toEqual([
      { account: "maya", amount: 500 },
      { account: "sam", amount: 501 },
    ])
    expect(math.dustTo).toBe("sam")
    const { close } = W.proposeClose(w, "porto-weekend", "maya", NOW + 1)
    expect(close.payouts.reduce((s, p) => s + p.amount, 0)).toBe(1_001)
  })

  it("no money and no gifts: still ERR_NO_CONTRIBUTIONS", () => {
    const w = fresh()
    const pot = w.pots["porto-weekend"]!
    pot.members.forEach((m) => (m.contributed = 0))
    pot.balance = 0
    expect(() => W.proposeClose(w, "porto-weekend", "maya", NOW)).toThrow("ERR_NO_CONTRIBUTIONS")
  })
})
