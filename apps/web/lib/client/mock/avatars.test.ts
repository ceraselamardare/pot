// Brand avatars in the mock world (the stand-in for app_user.avatar): a pick reaches every PersonVM of that person
// (seats, feed, Members, requests) and null goes back to initials. Nobody else changes.
import { describe, expect, it } from "vitest"
import { avatarOf, potView, potsOf, requestsOf, seedWorld, setAvatar } from "./world"

const NOW = 1_800_000_000_000

describe("mock world avatars", () => {
  it("a new world has no pictures: everyone is initials", () => {
    const w = seedWorld(NOW)
    expect(avatarOf(w, "maya")).toBeNull()
    const v = potView(w, "lisbon-trip", "maya", NOW)!
    for (const m of v.members) expect(m.person.avatar ?? null).toBeNull()
  })

  it("Maya's pick shows on her seat, feed items, cards and requests, and only hers", () => {
    const w = setAvatar(seedWorld(NOW), "maya", "pot-03")
    expect(avatarOf(w, "maya")).toBe("pot-03")
    const v = potView(w, "lisbon-trip", "sam", NOW)!
    expect(v.members.find((m) => m.person.id === "maya")!.person.avatar).toBe("pot-03")
    expect(v.members.filter((m) => m.person.id !== "maya").every((m) => !m.person.avatar)).toBe(true)
    const mine = v.feed.filter((f) => "actor" in f && f.actor && f.actor.id === "maya")
    expect(mine.length).toBeGreaterThan(0)
    for (const f of mine) expect("actor" in f && f.actor?.avatar).toBe("pot-03")
    const card = potsOf(w, "sam", NOW).find((c) => c.slug === "lisbon-trip")!
    expect(card.members.find((p) => p.id === "maya")!.avatar).toBe("pot-03")
    const reqs = requestsOf(w, "sam", NOW)
    for (const r of [...reqs.waiting, ...reqs.mine, ...reqs.decided]) if (r.requester.id === "maya") expect(r.requester.avatar).toBe("pot-03")
  })

  it("null resets to initials without touching anyone else", () => {
    let w = setAvatar(seedWorld(NOW), "maya", "pot-03")
    w = setAvatar(w, "sam", "pot-10")
    w = setAvatar(w, "maya", null)
    expect(avatarOf(w, "maya")).toBeNull()
    expect(avatarOf(w, "sam")).toBe("pot-10")
  })
})
