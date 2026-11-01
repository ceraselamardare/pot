// The mock world's comments (the stand-in for request_comment): the seeded thread, members only, the author's own
// delete (soft), and the count every request view carries for the cards.
import { describe, expect, it } from "vitest"
import { addComment, commentsOf, CommentWorldError, joinPot, potView, removeComment, requestSpend, requestsOf, requestView, seedWorld } from "./world"

const NOW = Date.UTC(2026, 10, 3, 12)

describe("mock comments", () => {
  it("the seed has a declined Porto ask with a two-comment thread; the balance is unchanged", () => {
    const w = seedWorld(NOW)
    const r = requestView(w, "porto-weekend", 11, "maya", NOW)!
    expect(r).toMatchObject({ status: "declined", comments: 2, requester: { name: "Sam" } })
    expect(potView(w, "porto-weekend", "maya", NOW)!.balance).toBe(300_000_000n)
    const thread = commentsOf(w, "porto-weekend", 11, "maya")!
    expect(thread.map((c) => [c.author.name, c.mine])).toEqual([
      ["Maya", true],
      ["Sam", false],
    ])
    expect(requestsOf(w, "sam", NOW).decided.map((x) => x.id)).toEqual([11])
  })

  it("members only: Leo (not in Porto yet) can't read or write; after joining he can", () => {
    let w = seedWorld(NOW)
    expect(commentsOf(w, "porto-weekend", 11, "leo")).toBeNull()
    expect(() => addComment(w, "porto-weekend", 11, "leo", "hi", NOW, "x")).toThrow(CommentWorldError)
    w = joinPot(w, "porto-weekend", "leo", NOW).world
    w = addComment(w, "porto-weekend", 11, "leo", "Count me in next time", NOW + 1, "x")
    expect(commentsOf(w, "porto-weekend", 11, "leo")!.at(-1)).toMatchObject({ body: "Count me in next time", mine: true })
    expect(requestView(w, "porto-weekend", 11, "leo", NOW)!.comments).toBe(3)
  })

  it("a missing request is not_found; the author's delete is soft and idempotent, nobody else's", () => {
    let w = seedWorld(NOW)
    expect(() => addComment(w, "lisbon-trip", 99, "maya", "hi", NOW, "y")).toThrow("not_found")
    expect(() => removeComment(w, "porto-weekend", 11, "c2", "maya", NOW)).toThrow("not_author")
    w = removeComment(w, "porto-weekend", 11, "c1", "maya", NOW)
    expect(removeComment(w, "porto-weekend", 11, "c1", "maya", NOW + 5)).toBe(w)
    const thread = commentsOf(w, "porto-weekend", 11, "sam")!
    expect(thread[0]).toMatchObject({ deleted: true, body: null })
    expect(requestView(w, "porto-weekend", 11, "sam", NOW)!.comments).toBe(1)
  })

  it("a new request starts with no comments", () => {
    const r = requestSpend(seedWorld(NOW), "lisbon-trip", "maya", { amountCents: 30_000, category: "tickets", receiver: "maya" }, NOW)
    expect(requestView(r.world, "lisbon-trip", r.request.id, "sam", NOW)!.comments).toBe(0)
  })
})
