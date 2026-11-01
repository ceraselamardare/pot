// Pay by link in the mock world (lib/client/mock/links.ts + world.ts): the hub 1.1.0 lifecycle end to end on the
// "Surf Camp" showcase Pot (Maya + Sam, links on): instant link → funded → claimed by a guest (their Pot dollars);
// the group's path (waiting → approved → funded; declined → void); cancel by the requester (money back) vs anyone
// before the date (refused); the daily job after the date; closing blocked while links are open; links off.
import { describe, expect, it } from "vitest"
import { SURF_LINKS } from "./fixtures"
import { claimLink, claimView, linkDollarsOf, openLinks, reclaimLink, SWEEPER, sweepExpiredLinks, withLinkShowcase } from "./links"
import { HubError, nameOf, ownDollarsOf, potView, proposeClose, requestSpend, requestStatusOf, requestView, seedWorld, vote } from "./world"
import type { World } from "./types"

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const SLUG = "surf-camp"
const world = (): World => withLinkShowcase(seedWorld(NOW), NOW)
const link = (pk = "ed25519:NEWKEY", expiresAt = NOW + 14 * DAY, label?: string) => ({ pk, expiresAt, ...(label ? { label } : {}) })
const view = (w: World, id: number, now = NOW) => claimView(w, SLUG, id, now, nameOf, (r) => requestStatusOf(w.pots[SLUG]!, r, now))

describe("the Surf Camp showcase", () => {
  it("is consistent: $600 in, $60 claimed by Alex, $30 open, $45 came back → $510", () => {
    const w = world()
    const pot = potView(w, SLUG, "maya", NOW)!
    expect(pot.balance).toBe(510_000_000n)
    expect(pot.extras?.links).toBe(true)
    const byId = (id: number) => requestView(w, SLUG, id, "maya", NOW)!
    expect(byId(111).link).toMatchObject({ status: "claimed", label: "Beach bar", claimer: { name: "Alex" } })
    expect(byId(112).link).toMatchObject({ status: "returned", returnedOnExpiry: true })
    expect(byId(113).link).toMatchObject({ status: "ready", label: "Surf school" })
    expect(byId(113).receiver.name).toBe("Surf school")
    expect(ownDollarsOf(w, "alex")).toBe(6_000)
    expect(linkDollarsOf(w, "alex")).toBe(6_000)
    expect(openLinks(w.pots[SLUG]!)).toBe(1)
    // the claim page: who sent how much, never the label
    expect(view(w, 113)).toMatchObject({ requesterName: "Maya", amount: "30000000", status: "ready", claimPk: SURF_LINKS.open.pk, potName: "Surf Camp" })
    expect(view(w, 999)).toBeNull()
  })
})

describe("an instant link", () => {
  it("is paid to the link (money leaves the Pot), then a guest claims it into their Pot dollars, once", () => {
    let w = world()
    const r = requestSpend(w, SLUG, "maya", { amountCents: 5_000, category: "stay", receiver: "@link", link: link("ed25519:K1", NOW + 14 * DAY, "Casa Lisboa host") }, NOW)
    w = r.world
    expect(r.request).toMatchObject({ path: "instant", status: "paid", receiver: "@link" })
    const id = r.request.id
    expect(potView(w, SLUG, "maya", NOW)!.balance).toBe(460_000_000n)
    expect(requestView(w, SLUG, id, "maya", NOW)!.link).toMatchObject({ status: "ready", label: "Casa Lisboa host", claimer: null })
    expect(view(w, id)!.status).toBe("ready")

    expect(claimLink(w, SLUG, id, "alex", "ed25519:WRONG", NOW).result).toBe("wrong_secret")
    const c = claimLink(w, SLUG, id, "alex", "ed25519:K1", NOW + 1000)
    expect(c.result).toBe("claimed")
    w = c.world
    expect(requestView(w, SLUG, id, "maya", NOW)!.link).toMatchObject({ status: "claimed", claimer: { id: "alex", name: "Alex" }, doneAt: NOW + 1000 })
    expect(ownDollarsOf(w, "alex")).toBe(6_000 + 5_000)
    expect(claimLink(w, SLUG, id, "sam", "ed25519:K1", NOW).result).toBe("already_claimed")
    // the Pot's balance doesn't move again on the claim
    expect(potView(w, SLUG, "maya", NOW)!.balance).toBe(460_000_000n)
    // claimed by a member: fine, it's their own Pot dollars
    expect(view(w, id)).toMatchObject({ status: "claimed", receiver: "alex" })
  })

  it("can't be claimed after its date, and the daily job sends it back", () => {
    let w = requestSpend(world(), SLUG, "maya", { amountCents: 2_000, category: "food", receiver: "@link", link: link("ed25519:K2", NOW + DAY) }, NOW).world
    const id = w.nextRequestId - 1
    expect(claimLink(w, SLUG, id, "alex", "ed25519:K2", NOW + DAY).result).toBe("expired")
    expect(requestView(w, SLUG, id, "maya", NOW + DAY)!.link!.status).toBe("expired")
    w = sweepExpiredLinks(w, NOW + DAY)
    const r = requestView(w, SLUG, id, "maya", NOW + DAY)!
    expect(r.link).toMatchObject({ status: "returned", returnedOnExpiry: true })
    expect(w.pots[SLUG]!.requests.find((x) => x.id === id)!.link!.returnedBy).toBe(SWEEPER)
    expect(potView(w, SLUG, "maya", NOW + DAY)!.balance).toBe(510_000_000n)
    expect(sweepExpiredLinks(w, NOW + 2 * DAY)).toBe(w) // nothing left to send back
  })
})

describe("cancel (reclaim_link)", () => {
  it("the requester any time (money back, not their instant budget); anyone else only after the date", () => {
    let w = requestSpend(world(), SLUG, "maya", { amountCents: 4_000, category: "tickets", receiver: "@link", link: link("ed25519:K3") }, NOW).world
    const id = w.nextRequestId - 1
    expect(reclaimLink(w, SLUG, id, "sam", NOW).result).toBe("not_allowed")
    const r = reclaimLink(w, SLUG, id, "maya", NOW + 10)
    expect(r.result).toBe("returned")
    w = r.world
    expect(potView(w, SLUG, "maya", NOW)!.balance).toBe(510_000_000n)
    expect(requestView(w, SLUG, id, "maya", NOW)!.link).toMatchObject({ status: "returned", returnedOnExpiry: false })
    expect(w.pots[SLUG]!.members.find((m) => m.id === "maya")!.spentInstant).toBe(9_000 + 4_000) // counters stay (INV-06)
    expect(reclaimLink(w, SLUG, id, "maya", NOW).result).toBe("done")
    expect(claimLink(w, SLUG, id, "alex", "ed25519:K3", NOW).result).toBe("returned")
  })
})

describe("a link the group decides", () => {
  it("waits for the OK (no money moves), then is funded when approved", () => {
    let w = requestSpend(world(), SLUG, "maya", { amountCents: 15_000, category: "stay", receiver: "@link", link: link("ed25519:K4") }, NOW).world
    const id = w.nextRequestId - 1
    expect(requestView(w, SLUG, id, "maya", NOW)!).toMatchObject({ path: "vote", status: "needs", link: { status: "waiting" } })
    expect(potView(w, SLUG, "maya", NOW)!.balance).toBe(510_000_000n)
    expect(claimLink(w, SLUG, id, "alex", "ed25519:K4", NOW).result).toBe("not_funded")
    expect(view(w, id)!.status).toBe("waiting")
    w = vote(w, SLUG, id, "sam", "Approve", NOW + 5).world
    expect(requestView(w, SLUG, id, "maya", NOW)!.link!.status).toBe("ready")
    expect(potView(w, SLUG, "maya", NOW)!.balance).toBe(360_000_000n)
    expect(claimLink(w, SLUG, id, "alex", "ed25519:K4", NOW + 6).result).toBe("claimed")
  })

  it("declined → the link is void and never paid", () => {
    let w = requestSpend(world(), SLUG, "maya", { amountCents: 15_000, category: "stay", receiver: "@link", link: link("ed25519:K5") }, NOW).world
    const id = w.nextRequestId - 1
    w = vote(w, SLUG, id, "sam", "Reject", NOW + 5).world
    expect(requestView(w, SLUG, id, "maya", NOW)!.link!.status).toBe("void")
    expect(view(w, id)!.status).toBe("void")
    expect(potView(w, SLUG, "maya", NOW)!.balance).toBe(510_000_000n)
  })
})

describe("closing and links", () => {
  it("open links block a close (ERR_LINKS_PENDING); the preview says why", () => {
    const w = world()
    expect(potView(w, SLUG, "maya", NOW)!.closePreview?.blockedReason).toBe("links_pending")
    expect(() => proposeClose(w, SLUG, "maya", NOW)).toThrow(HubError)
    const back = reclaimLink(w, SLUG, 113, "maya", NOW).world
    expect(openLinks(back.pots[SLUG]!)).toBe(0)
    expect(proposeClose(back, SLUG, "maya", NOW).close.status).toBe("proposed")
  })
})

describe("links off", () => {
  it("a Pot from before hub 1.1.0 (no extras) refuses a link (ERR_LINKS_OFF)", () => {
    const w = seedWorld(NOW)
    expect(() => requestSpend(w, "lisbon-trip", "maya", { amountCents: 5_000, category: "stay", receiver: "@link", link: link() }, NOW)).toThrow("ERR_LINKS_OFF")
  })
})
