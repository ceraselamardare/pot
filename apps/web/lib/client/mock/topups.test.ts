// "Ask for a top-up" in the mock world (lib/client/mock/topups.ts): the server's twin. Asking (each / total, the
// one-open rule, validation), progress from baselines through real adds, done / ended / cancelled, nudges once per
// 24 h, the push stub, and how the Pot view, Requests and Your activity show it.
import { describe, expect, it } from "vitest"
import { activityOfPerson } from "../activity"
import { cents } from "../money"
import { askTopup, cancelTopup, nudgeTopup, TopupWorldError } from "./topups"
import { addMoney, inboxTopupsOf, joinPot, myTopupAsksOf, nameOf, potView, seedWorld } from "./world"
import type { World } from "./types"

const NOW = Date.UTC(2026, 10, 3, 9)
const DAY = 86_400_000
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof TopupWorldError) return e.code
    throw e
  }
  return null
}
/** Lisbon Trip with a 4th member (Alex joins) so "each" and "total" differ. */
function world(): World {
  return joinPot(seedWorld(NOW), "lisbon-trip", "alex", NOW).world
}
const ask = (w: World, who = "maya", over: Partial<Parameters<typeof askTopup>[3]> = {}) =>
  askTopup(w, "lisbon-trip", who, { mode: "each", amount: 5_000, reason: "Hotel went up", dueAt: NOW + 7 * DAY, ...over }, NOW, "t1", nameOf)

describe("mock: asking", () => {
  it("asks everyone (the asker too) with their baselines; pushes the others with the reason", () => {
    const { world: w, rec } = ask(world())
    expect(rec).toMatchObject({ by: "maya", mode: "each", perPerson: 5_000, total: 20_000, reason: "Hotel went up" })
    expect(rec.baselines).toEqual([
      { id: "maya", c: 15_000 },
      { id: "sam", c: 15_000 },
      { id: "leo", c: 15_000 },
      { id: "alex", c: 0 },
    ])
    expect(w.pushes!.map((p) => [p.to, p.title, p.body, p.url])).toEqual(
      ["sam", "leo", "alex"].map((to) => [to, "Maya asks everyone for $50 more", "Hotel went up · Lisbon Trip", "/p/lisbon-trip"]),
    )
  })

  it("$X in total splits equally (rounded up to the cent)", () => {
    expect(ask(world(), "sam", { mode: "total", amount: 10_000 }).rec).toMatchObject({ perPerson: 2_500, total: 10_000 })
    expect(ask(seedWorld(NOW), "sam", { mode: "total", amount: 10_000 }).rec).toMatchObject({ perPerson: 3_334 })
  })

  it("refuses: not a member, a closed Pot, under $1 / over $10,000 each, a long reason, a bad date, a second open ask", () => {
    const w = world()
    expect(code(() => askTopup(w, "porto-weekend", "leo", { mode: "each", amount: 5_000, dueAt: NOW + DAY }, NOW, "x", nameOf))).toBe("not_member")
    expect(code(() => ask(w, "maya", { amount: 50 }))).toBe("too_low")
    expect(code(() => ask(w, "maya", { mode: "total", amount: 300 }))).toBe("too_low")
    expect(code(() => ask(w, "maya", { amount: 1_000_001 }))).toBe("too_high")
    expect(code(() => ask(w, "maya", { reason: "x".repeat(81) }))).toBe("invalid")
    expect(code(() => ask(w, "maya", { dueAt: NOW + 60_000 }))).toBe("invalid")
    const open = ask(w).world
    expect(code(() => askTopup(open, "lisbon-trip", "sam", { mode: "each", amount: 1_000, dueAt: NOW + DAY }, NOW, "t2", nameOf))).toBe("open")
    const closed: World = { ...w, pots: { ...w.pots, "lisbon-trip": { ...w.pots["lisbon-trip"]!, status: "closed" } } }
    expect(code(() => ask(closed))).toBe("closed")
  })
})

describe("mock: progress and the end", () => {
  it("adds after the ask count; done when everyone added; the Pot view, Requests and activity follow", () => {
    let w = ask(world()).world
    let v = potView(w, "lisbon-trip", "sam", NOW)!
    expect(v.topup).toMatchObject({ id: "t1", status: "open", doneCount: 0, mine: false, me: { done: false } })
    expect(v.feed.find((f) => f.kind === "topup")).toMatchObject({ key: "topup:t1", at: NOW })
    expect(inboxTopupsOf(w, "sam", NOW).map((x) => x.id)).toEqual(["t1"])
    w = addMoney(w, "lisbon-trip", "sam", 5_000, NOW + 1)
    v = potView(w, "lisbon-trip", "sam", NOW + 2)!
    expect(v.topup).toMatchObject({ doneCount: 1, me: { done: true, added: cents(5_000) } })
    expect(inboxTopupsOf(w, "sam", NOW + 2)).toEqual([])
    for (const who of ["maya", "leo"]) w = addMoney(w, "lisbon-trip", who, 5_000, NOW + 3)
    w = addMoney(w, "lisbon-trip", "alex", 2_000, NOW + 3)
    expect(potView(w, "lisbon-trip", "maya", NOW + 4)!.topup).toMatchObject({ doneCount: 3, status: "open" })
    w = addMoney(w, "lisbon-trip", "alex", 3_000, NOW + 5)
    v = potView(w, "lisbon-trip", "maya", NOW + 6)!
    expect(v.topup).toBeNull()
    const row = v.feed.find((f) => f.kind === "topup")
    expect(row && row.kind === "topup" && row.topup.status).toBe("done")
    // Maya's own activity has the ask; You → activity lists it too
    expect(activityOfPerson(v, "maya").find((i) => i.kind === "topup")).toMatchObject({ key: "topup:lisbon-trip:t1", status: "approved", topup: { status: "done" } })
    expect(myTopupAsksOf(w, "maya", NOW + 6).map((x) => [x.id, x.status])).toEqual([["t1", "done"]])
    // a new ask is fine now
    expect(askTopup(w, "lisbon-trip", "sam", { mode: "each", amount: 1_000, dueAt: NOW + 3 * DAY }, NOW + 7, "t2", nameOf).rec.id).toBe("t2")
  })

  it("ends at its date; the asker cancels (only the asker, once; progress frozen)", () => {
    let w = ask(world()).world
    expect(potView(w, "lisbon-trip", "maya", NOW + 7 * DAY)!.topup).toBeNull()
    expect(code(() => cancelTopup(w, "lisbon-trip", "sam", "t1", NOW))).toBe("not_asker")
    w = addMoney(w, "lisbon-trip", "leo", 5_000, NOW + 1)
    w = cancelTopup(w, "lisbon-trip", "maya", "t1", NOW + 2)
    expect(cancelTopup(w, "lisbon-trip", "maya", "t1", NOW + 3)).toBe(w)
    w = addMoney(w, "lisbon-trip", "sam", 5_000, NOW + 4)
    const v = potView(w, "lisbon-trip", "maya", NOW + 5)!
    expect(v.topup).toBeNull()
    const row = v.feed.find((f) => f.kind === "topup")
    expect(row && row.kind === "topup" && [row.topup.status, row.topup.doneCount]).toEqual(["cancelled", 1])
  })

  it("someone outside the Pot sees no ask, no row", () => {
    const w = ask(world()).world
    // Alex is in Lisbon now; Porto has no ask, and a non-member view of Lisbon has none
    const outsider = potView(w, "lisbon-trip", "nobody", NOW)!
    expect(outsider.topup).toBeNull()
    expect(outsider.feed.some((f) => f.kind === "topup")).toBe(false)
  })
})

describe("mock: nudges", () => {
  it("nudges people who haven't added, once per 24 h whoever sends it; pushes their part left", () => {
    let w = ask(world()).world
    w = addMoney(w, "lisbon-trip", "leo", 2_000, NOW + 1)
    const r = nudgeTopup(w, "lisbon-trip", "maya", "t1", ["sam", "leo", "maya"], NOW + 2, nameOf)
    expect(r.nudged).toEqual(["sam", "leo"])
    expect(r.world.pushes!.slice(-2).map((p) => [p.to, p.title, p.body, p.url])).toEqual([
      ["sam", "Maya nudged you", "Add your $50 share to Lisbon Trip.", "/p/lisbon-trip?sheet=add&amount=50&topup=t1"],
      ["leo", "Maya nudged you", "Add your $30 share to Lisbon Trip.", "/p/lisbon-trip?sheet=add&amount=30&topup=t1"],
    ])
    w = r.world
    expect(code(() => nudgeTopup(w, "lisbon-trip", "alex", "t1", ["sam", "leo"], NOW + 3, nameOf))).toBe("too_soon")
    expect(potView(w, "lisbon-trip", "maya", NOW + 3)!.topup!.members.find((m) => m.person.id === "sam")!.nudgedAt).toBe(NOW + 2)
    expect(nudgeTopup(w, "lisbon-trip", "alex", "t1", ["sam"], NOW + 2 + DAY, nameOf).nudged).toEqual(["sam"])
    w = addMoney(w, "lisbon-trip", "alex", 5_000, NOW + 4)
    expect(code(() => nudgeTopup(w, "lisbon-trip", "maya", "t1", ["alex"], NOW + 5, nameOf))).toBe("nothing")
  })
})
