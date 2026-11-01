// hub 1.1.0 in the mock world: earned trust (level up after 3 qualifying paid spends, $1 doesn't count, a decline
// drops a level), the one-OK tier (requester can't OK, an objection hands it to the group, a short Pot = not sent),
// the goal with a date (spends wait, reached, money refused after a missed date, the two-step refund), the showcase
// seed and the rules change carrying extras. Mirrors contracts/tests/tests/t_wave4.rs W1 / W4.
import { describe, expect, it } from "vitest"
import { cents } from "../money"
import type { ExtrasRec, PotRec, World } from "./types"
import { addMoney, createPot, HubError, joinPot, okRequest, potView, potsOf, proposeRules, requestSpend, requestView, seedWorld, setRules, vote, voteRules } from "./world"
import {
  canOk,
  checkGoalReached,
  defaultExtrasRec,
  goalStateOf,
  REFUND_PHASE_MS,
  refundDue,
  seedShowcase,
  trustDecline,
  trustSettle,
  trustVM,
  withShowcase,
} from "./wave4"

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const INVITE = { pk: "ed25519:x", secret: "s" }
const RULES = { instantCap: 100_000_000n, memberBudget: 1_000_000_000n, instantPayees: "members" as const, payeeAllowlist: [] }

/** A 1.1.0 Pot (defaults: trust on, one OK up to $300) with Maya, Sam and Leo who each put in $500. */
function threePot(extras?: ExtrasRec): { w: World; slug: string } {
  let w: World = { v: 1, pots: {}, nextRequestId: 1 }
  const c = createPot(w, "maya", { name: "Trust Test", emoji: "🎿", cover: 0, goalEachCents: null, rules: RULES, invite: INVITE, extras }, NOW, "abcd")
  w = c.world
  w = joinPot(w, c.slug, "sam", NOW).world
  w = joinPot(w, c.slug, "leo", NOW).world
  for (const p of ["maya", "sam", "leo"]) w = addMoney(w, c.slug, p, 50_000, NOW)
  return { w, slug: c.slug }
}

const spend = (w: World, slug: string, who: string, dollars: number, at = NOW) =>
  requestSpend(w, slug, who, { amountCents: Math.round(dollars * 100), category: "food", receiver: who }, at)

describe("earned trust", () => {
  it("3 qualifying paid spends → Trusted (2× limit); 3 more → Very trusted (3×); the top stays", () => {
    const t3 = threePot()
    let w = t3.w
    const slug = t3.slug
    let maya = potView(w, slug, "maya", NOW)!.me!
    expect(maya.trust).toMatchObject({ enabled: true, level: 0, nextLevelIn: 3, effectiveCap: cents(10_000), nextCap: cents(20_000) })
    for (let i = 0; i < 3; i++) w = spend(w, slug, "maya", 40).world
    maya = potView(w, slug, "maya", NOW)!.me!
    expect(maya.trust).toMatchObject({ level: 1, nextLevelIn: 3, effectiveCap: cents(20_000), settled: 3, nextCap: cents(30_000) })
    // $150 is now instant for Maya (over the Pot's $100, under her $200)
    const r = spend(w, slug, "maya", 150)
    expect(r.request).toMatchObject({ path: "instant", status: "paid", tier: "instant" })
    w = r.world
    for (let i = 0; i < 2; i++) w = spend(w, slug, "maya", 20).world
    maya = potView(w, slug, "maya", NOW)!.me!
    expect(maya.trust).toMatchObject({ level: 2, nextLevelIn: 0, effectiveCap: cents(30_000), nextCap: null })
  })

  it("a spend under a tenth of the instant limit is paid but doesn't count toward a level", () => {
    const t3 = threePot()
    let w = t3.w
    const slug = t3.slug
    for (let i = 0; i < 3; i++) w = spend(w, slug, "sam", 9.99).world
    expect(potView(w, slug, "sam", NOW)!.me!.trust).toMatchObject({ level: 0, nextLevelIn: 3, settled: 3 })
    w = spend(w, slug, "sam", 10).world
    expect(potView(w, slug, "sam", NOW)!.me!.trust).toMatchObject({ level: 0, nextLevelIn: 2 })
  })

  it("a declined request drops a level and restarts the streak", () => {
    const pot = { rules: { instantCap: 10_000, memberBudget: 20_000, expiryDays: 7 }, trust: { maya: { level: 1, streak: 2, settled: 5, settledAmount: 0, declined: 0 } }, extras: defaultExtrasRec({ instantCap: 10_000 }) } as unknown as PotRec
    const change = trustDecline(pot, { requester: "maya" } as never, NOW)
    expect(change).toEqual({ member: "maya", from: 1, to: 0 })
    expect(pot.trust!.maya).toMatchObject({ level: 0, streak: 0, declined: 1, lastDeclinedAt: NOW })
    expect(trustDecline(pot, { requester: "maya" } as never, NOW)).toBeNull() // already at 0
    expect(trustSettle(pot, { requester: "maya", amount: 5_000 } as never)).toBeNull()
  })

  it("a group decline through the votes lowers the requester's level", () => {
    const t3 = threePot({ trust: true, oneOkCap: 0, links: true, goal: null })
    let w = t3.w
    const slug = t3.slug
    for (let i = 0; i < 3; i++) w = spend(w, slug, "leo", 50).world
    const r = spend(w, slug, "leo", 400)
    expect(r.request.tier).toBe("group")
    w = vote(r.world, slug, r.request.id, "maya", "Reject", NOW).world
    w = vote(w, slug, r.request.id, "sam", "Reject", NOW).world
    expect(potView(w, slug, "leo", NOW)!.me!.trust).toMatchObject({ level: 0, declined: 1 })
  })

  it("trust off: the limit never grows (the record still counts)", () => {
    const t3 = threePot({ trust: false, oneOkCap: 30_000, links: true, goal: null })
    let w = t3.w
    const slug = t3.slug
    for (let i = 0; i < 3; i++) w = spend(w, slug, "maya", 50).world
    const maya = potView(w, slug, "maya", NOW)!.me!
    expect(maya.trust).toMatchObject({ enabled: false, level: 1, effectiveCap: cents(10_000), nextCap: null, nextLevelIn: 0 })
    expect(spend(w, slug, "maya", 150).request.tier).toBe("one_ok")
  })

  it("instantUpTo is capped by what's left of the per-person limit", () => {
    const pot = { rules: { instantCap: 10_000, memberBudget: 25_000, expiryDays: 7 }, extras: defaultExtrasRec({ instantCap: 10_000 }), trust: { maya: { level: 2, streak: 0, settled: 6, settledAmount: 0, declined: 0 } } } as unknown as PotRec
    expect(trustVM(pot, { id: "maya", spentInstant: 20_000 })).toMatchObject({ effectiveCap: cents(30_000), instantUpTo: cents(5_000) })
  })
})

describe("the one-OK tier", () => {
  it("over the instant limit and ≤ $300 → one OK; Sam's OK pays it; the requester can't OK their own", () => {
    const { w, slug } = threePot()
    const r = spend(w, slug, "maya", 180)
    expect(r.request).toMatchObject({ path: "vote", tier: "one_ok", status: "proposed", votes: { maya: "Approve" } })
    expect(okRequest(r.world, slug, r.request.id, "maya", NOW).result).toBe("self")
    const ok = okRequest(r.world, slug, r.request.id, "sam", NOW + 1)
    expect(ok.result).toBe("approved")
    const vm = requestView(ok.world, slug, r.request.id, "leo", NOW + 1)!
    expect(vm).toMatchObject({ status: "approved", tier: "one_ok" })
    expect(vm.okBy?.id).toBe("sam")
    expect(potView(ok.world, slug, "maya", NOW + 1)!.balance).toBe(cents(150_000 - 18_000))
    // decided now
    expect(okRequest(ok.world, slug, r.request.id, "leo", NOW + 2).result).toBe("decided")
  })

  it("over the one-OK ceiling → the group; a one-OK request after a no → the group decides (objection)", () => {
    const { w, slug } = threePot()
    expect(spend(w, slug, "maya", 301).request.tier).toBe("group")
    const r = spend(w, slug, "maya", 200)
    const no = vote(r.world, slug, r.request.id, "leo", "Reject", NOW)
    expect(canOk(no.world.pots[slug]!.requests.at(-1)!, "sam")).toBe(false)
    expect(okRequest(no.world, slug, r.request.id, "sam", NOW).result).toBe("objection")
    // the majority still works
    expect(vote(no.world, slug, r.request.id, "sam", "Approve", NOW).result).toBe("approved")
  })

  it("not a one-OK request → refused; a sole member's Pot has no one-OK tier", () => {
    const { w, slug } = threePot()
    const r = spend(w, slug, "maya", 400)
    expect(okRequest(r.world, slug, r.request.id, "sam", NOW).result).toBe("not_one_ok")
    let solo: World = { v: 1, pots: {}, nextRequestId: 1 }
    const c = createPot(solo, "maya", { name: "Solo", emoji: "🎿", cover: 0, goalEachCents: null, rules: RULES, invite: INVITE }, NOW, "zzzz")
    solo = addMoney(c.world, c.slug, "maya", 50_000, NOW)
    expect(spend(solo, c.slug, "maya", 150).request.tier).toBe("group")
  })

  it("the OK on a Pot that's short: approved but not sent (payout_failed)", () => {
    const { w, slug } = threePot()
    const r = spend(w, slug, "maya", 250)
    const short = structuredClone(r.world)
    short.pots[slug]!.balance = 10_000
    const ok = okRequest(short, slug, r.request.id, "sam", NOW)
    expect(ok.result).toBe("failed")
    expect(requestView(ok.world, slug, r.request.id, "sam", NOW)!.status).toBe("failed")
  })

  it("a 1.0.0 Pot (no extras) keeps instant / the group only", () => {
    const w = seedWorld(NOW)
    const r = spend(w, "lisbon-trip", "maya", 150)
    expect(r.request.tier).toBeUndefined()
    expect(potView(w, "lisbon-trip", "maya", NOW)!.extras).toBeUndefined()
    expect(potView(w, "lisbon-trip", "maya", NOW)!.me!.trust).toBeUndefined()
  })
})

describe("the goal with a date (all or nothing)", () => {
  const goalPot = (aon = true, deadline = NOW + 3 * DAY) => {
    let w: World = { v: 1, pots: {}, nextRequestId: 1 }
    const c = createPot(
      w,
      "leo",
      { name: "Festival", emoji: "🎸", cover: 0, goalEachCents: null, rules: RULES, invite: INVITE, extras: { trust: true, oneOkCap: 30_000, links: true, goal: { amount: 120_000, deadline, allOrNothing: aon } } },
      NOW,
      "fest",
    )
    w = joinPot(c.world, c.slug, "maya", NOW).world
    return { w, slug: c.slug }
  }

  it("collecting: spends wait (ERR_GOAL_NOT_REACHED), the goal bar shows the on-chain goal; reaching it opens spending", () => {
    const gp = goalPot()
    let w = gp.w
    const slug = gp.slug
    expect(w.pots[slug]!.policyVersion).toBe(2)
    w = addMoney(w, slug, "leo", 30_000, NOW)
    let v = potView(w, slug, "leo", NOW)!
    expect(v.goal).toBe(cents(120_000))
    expect(v.goalDetail).toMatchObject({ state: "collecting", spendsBlocked: true, totalIn: cents(30_000), allOrNothing: true })
    expect(() => spend(w, slug, "leo", 10)).toThrow(HubError)
    w = addMoney(w, slug, "maya", 90_000, NOW + DAY)
    v = potView(w, slug, "leo", NOW + DAY)!
    expect(v.goalDetail).toMatchObject({ state: "reached", spendsBlocked: false, reachedAt: NOW + DAY })
    expect(v.feed.some((f) => f.kind === "goal" && f.state === "reached")).toBe(true)
    expect(spend(w, slug, "leo", 10).request.status).toBe("paid")
  })

  it("missed: money in is refused; the mock cron refunds in two steps; everyone gets back what they put in", () => {
    const gp = goalPot()
    let w = gp.w
    const slug = gp.slug
    w = addMoney(w, slug, "leo", 30_000, NOW)
    w = addMoney(w, slug, "maya", 15_000, NOW)
    const after = NOW + 3 * DAY + 1
    expect(goalStateOf(w.pots[slug]!, after)).toBe("refundable")
    expect(() => addMoney(w, slug, "leo", 1_000, after)).toThrow(HubError)
    w = refundDue(w, after)!
    expect(potView(w, slug, "leo", after)!.goalDetail!.state).toBe("refunding")
    expect(w.pots[slug]!.status).toBe("closing")
    expect(refundDue(w, after + 1)).toBeNull() // not yet
    w = refundDue(w, after + REFUND_PHASE_MS)!
    const v = potView(w, slug, "maya", after + REFUND_PHASE_MS)!
    expect(v.status).toBe("closed")
    expect(v.goalDetail!.state).toBe("refunded")
    expect(v.me!.getsBack).toBe(cents(15_000))
    expect(v.members.find((m) => m.person.id === "leo")!.getsBack).toBe(cents(30_000))
    expect(v.feed.some((f) => f.kind === "close_requested")).toBe(false) // nobody asked: the hub did
    expect(v.feed.filter((f) => f.kind === "goal").map((f) => (f.kind === "goal" ? f.state : ""))).toEqual(["refunded"])
    expect(refundDue(w, after + 2 * REFUND_PHASE_MS)).toBeNull()
  })

  it("a soft goal: the date passes, nothing is refunded and spending never waited", () => {
    const gp = goalPot(false)
    let w = gp.w
    const slug = gp.slug
    expect(w.pots[slug]!.policyVersion).toBe(1)
    w = addMoney(w, slug, "leo", 30_000, NOW)
    expect(spend(w, slug, "leo", 10).request.status).toBe("paid")
    expect(goalStateOf(w.pots[slug]!, NOW + 4 * DAY)).toBe("missed")
    expect(refundDue(w, NOW + 4 * DAY)).toBeNull()
    expect(() => addMoney(w, slug, "leo", 1_000, NOW + 4 * DAY)).not.toThrow()
  })

  it("an all-or-nothing goal reached after its date doesn't count", () => {
    const pot = { members: [{ contributed: 200_000 }], extras: { goal: { amount: 100_000, deadline: NOW, allOrNothing: true } } } as unknown as PotRec
    expect(checkGoalReached(pot, NOW + 1)).toBe(false)
    expect(checkGoalReached(pot, NOW - 1)).toBe(true)
  })
})

describe("rules changes carry extras", () => {
  it("the group turns trust off and the one-OK limit up; a sole member applies them at once", () => {
    const t3 = threePot()
    let w = t3.w
    const slug = t3.slug
    const extras = { trust: false, oneOkCap: 50_000, links: true, goal: null }
    const p = proposeRules(w, slug, "maya", { ...w.pots[slug]!.rules }, NOW, extras)
    let v = potView(p.world, slug, "sam", NOW)!
    expect(v.rulesChange?.toExtras).toMatchObject({ trust: false, oneOkCap: cents(50_000) })
    expect(v.rulesChange?.fromExtras).toMatchObject({ trust: true, oneOkCap: cents(30_000) })
    w = voteRules(p.world, slug, "sam", "Approve", NOW).world
    v = potView(w, slug, "sam", NOW)!
    expect(v.extras).toEqual({ trust: false, oneOkCap: cents(50_000), links: true })
    // a sole member
    let solo: World = { v: 1, pots: {}, nextRequestId: 1 }
    const c = createPot(solo, "maya", { name: "Solo", emoji: "🎿", cover: 0, goalEachCents: null, rules: RULES, invite: INVITE }, NOW, "zzzz")
    solo = setRules(c.world, c.slug, "maya", { ...c.world.pots[c.slug]!.rules }, NOW, extras)
    expect(solo.pots[c.slug]!.extras).toEqual(extras)
  })
})

describe("the showcase seed", () => {
  it("Ski Chalet: Maya Trusted, Leo's spend approved by Sam's OK, Sam's waits for one OK; Festival Fund collecting", () => {
    const w = withShowcase(seedWorld(NOW), NOW)
    const ski = potView(w, "ski-chalet", "leo", NOW)!
    expect(ski.members.find((m) => m.person.id === "maya")!.trust).toMatchObject({ level: 1, effectiveCap: cents(20_000) })
    // the seeded balance is what went in minus what was paid
    const paid = w.pots["ski-chalet"]!.requests.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0)
    expect(w.pots["ski-chalet"]!.balance).toBe(90_000 - paid)
    const leo = ski.feed.find((f) => f.kind === "request" && f.request.id === 104)
    expect(leo?.kind === "request" && leo.request.okBy?.id).toBe("sam")
    expect(ski.waitingOnMe.map((r) => [r.id, r.tier])).toEqual([[105, "one_ok"]])
    const fest = potView(w, "festival-fund", "maya", NOW)!
    expect(fest.goalDetail).toMatchObject({ state: "collecting", amount: cents(120_000), totalIn: cents(30_000), spendsBlocked: true })
    expect(potsOf(w, "maya", NOW).map((p) => p.slug)).toEqual(expect.arrayContaining(["ski-chalet", "festival-fund"]))
    expect(Object.keys(seedShowcase(NOW))).toEqual(["ski-chalet", "festival-fund"])
    expect(w.nextRequestId).toBeGreaterThan(105)
  })
})
