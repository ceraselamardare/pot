// "Your activity" mapping (lib/client/activity.ts) per event type, the server/chain merge, links and copy; the
// receipt links (lib/client/explorer.ts) only for real hashes; the mock's own Pot dollars (balance math + format).
import { describe, expect, it } from "vitest"
import { activityKey, type ActivityApiItem } from "@/lib/activity-api"
import { activityFromApi, activityHref, activityOfPerson, activityText, chipWord, groupByDay, hubStatusChip, mergeActivity, type ActivityItemVM } from "./activity"
import { explorerAccountUrl, explorerTxUrl, isTxHash } from "./explorer"
import { cents, formatUsd } from "./money"
import * as W from "./mock/world"
import { DAY, HOUR } from "./mock/fixtures"

const T0 = Date.UTC(2026, 10, 10, 12, 0, 0)
const HASH = "8tD1muMJ2AdDZsRc41MCJECrb77gv8ek9HXszTRsdw99"

/** Lisbon Trip: Maya's instant $84; Sam asks $300 and Leo $250; Maya approves Sam's (paid) and declines Leo's,
 *  Sam declines it too (declined); then Sam asks to close and Maya approves (closed, refunds paid). */
function story() {
  let w = W.seedWorld(T0 - 3 * DAY)
  const at = (h: number) => T0 + h * HOUR
  w = W.requestSpend(w, "lisbon-trip", "maya", { amountCents: 8_400, category: "groceries", receiver: "maya" }, at(1)).world
  const sam = W.requestSpend(w, "lisbon-trip", "sam", { amountCents: 30_000, category: "tickets", receiver: "sam" }, at(2))
  w = sam.world
  const leo = W.requestSpend(w, "lisbon-trip", "leo", { amountCents: 25_000, category: "stay", note: "Hostel", receiver: "leo" }, at(2.5))
  w = leo.world
  w = W.vote(w, "lisbon-trip", sam.request.id, "maya", "Approve", at(3)).world
  w = W.vote(w, "lisbon-trip", leo.request.id, "maya", "Reject", at(5)).world
  w = W.vote(w, "lisbon-trip", leo.request.id, "sam", "Reject", at(6)).world
  const close = W.proposeClose(w, "lisbon-trip", "sam", at(7))
  w = close.world
  w = W.voteClose(w, "lisbon-trip", "maya", "Approve", at(8)).world
  return { w, sam: sam.request.id, leo: leo.request.id, close: close.close.id, at }
}

describe("activityOfPerson: one Pot's view model → what that person did", () => {
  it("maps joined, added, asked (instant / sent to the group), approved, declined, close and refund", () => {
    const { w, sam, leo, close, at } = story()
    const pot = W.potView(w, "lisbon-trip", "maya", at(9))!
    const items = activityOfPerson(pot, "maya")
    const byKind = (k: string) => items.filter((i) => i.kind === k)
    expect(items.map((i) => i.at)).toEqual([...items.map((i) => i.at)].sort((a, b) => b - a))

    expect(byKind("created")).toHaveLength(1)
    expect(byKind("added")[0]).toMatchObject({ amount: cents(15_000), status: "sent" })
    expect(isTxHash(byKind("added")[0]!.txHash)).toBe(true)

    const asked = byKind("asked")[0]!
    expect(asked).toMatchObject({ key: activityKey.asked("lisbon-trip", asked.requestId!), path: "instant", amount: cents(8_400), status: "approved", reason: "groceries", at: at(1) })
    expect(activityText(asked, "maya")).toBe("You got $84 back for groceries")

    const votes = byKind("voted")
    const approve = votes.find((v) => v.requestId === sam)!
    expect(approve).toMatchObject({ vote: "Approve", status: "approved", at: at(3), about: { type: "spend", name: "Sam", amount: cents(30_000) }, key: activityKey.voted("lisbon-trip", sam, "maya") })
    expect(activityText(approve, "maya")).toBe("You approved Sam's $300")
    expect(approve.txHash).toBeUndefined() // the mock keeps no transaction for a vote: no receipt
    const decline = votes.find((v) => v.requestId === leo)!
    expect(decline).toMatchObject({ vote: "Reject", status: "declined", at: at(5) })
    expect(activityText(decline, "maya")).toBe("You declined Leo's $250")
    expect(chipWord(decline)).toBe("Declined")
    const closeVote = votes.find((v) => v.about?.type === "close")!
    expect(closeVote).toMatchObject({ vote: "Approve", proposalId: close, at: at(8) })
    expect(activityText(closeVote, "maya")).toBe("You approved closing the Pot")

    const refund = byKind("refund")[0]!
    expect(refund.status).toBe("sent")
    expect(refund.amount! > 0n).toBe(true)
    expect(activityText(refund, "maya")).toMatch(/^You got \$[\d.,]+ back when the Pot closed$/)
    expect(chipWord(refund)).toBe("Received")
    expect(activityHref(refund)).toBe("/p/lisbon-trip?sheet=close")

    // Sam's view of his own: asked (sent to the group, approved), asked to close; Leo's: asked (declined)
    const samItems = activityOfPerson(pot, "sam")
    const samAsked = samItems.find((i) => i.kind === "asked")!
    expect(samAsked).toMatchObject({ path: "vote", status: "approved" })
    expect(activityText(samAsked, "maya")).toBe("Sam asked for $300 for tickets")
    expect(activityHref(samAsked)).toBe(`/p/lisbon-trip?r=${sam}`)
    expect(samItems.find((i) => i.kind === "close_asked")).toMatchObject({ status: "approved" })
    expect(activityText(samItems.find((i) => i.kind === "close_asked")!, "sam")).toBe("You asked to close the Pot")
    expect(activityOfPerson(pot, "leo").find((i) => i.kind === "asked")).toMatchObject({ status: "declined", reason: "Hostel" })
    // the asker's own automatic approval is part of asking, never a separate row
    expect(samItems.filter((i) => i.kind === "voted" && i.requestId === sam)).toEqual([])
  })

  it("rules: asked (and approved by others), and a sole member's direct change", () => {
    let w = W.seedWorld(T0)
    w = W.proposeRules(w, "lisbon-trip", "leo", { instantCap: 5_000, memberBudget: 10_000, expiryDays: 7 }, T0 + HOUR).world
    w = W.voteRules(w, "lisbon-trip", "maya", "Approve", T0 + 2 * HOUR).world
    const pot = W.potView(w, "lisbon-trip", "maya", T0 + 3 * HOUR)!
    expect(activityOfPerson(pot, "leo").find((i) => i.kind === "rules_asked")).toMatchObject({ status: "approved" })
    const v = activityOfPerson(pot, "maya").find((i) => i.kind === "voted")!
    expect(activityText(v, "maya")).toBe("You approved a rule change")
    expect(activityHref(v)).toBe("/p/lisbon-trip?tab=rules")

    let solo = W.createPot(W.seedWorld(T0), "maya", { name: "Solo", emoji: "🎒", cover: 1, goalEachCents: null, invite: { pk: "ed25519:x", secret: "y" } }, T0, "ab12")
    solo = { ...solo, world: W.setRules(solo.world, solo.slug, "maya", { instantCap: 1_000, memberBudget: 2_000, expiryDays: 7 }, T0 + HOUR) }
    const changed = activityOfPerson(W.potView(solo.world, solo.slug, "maya", T0 + 2 * HOUR)!, "maya").find((i) => i.kind === "rules_changed")!
    expect(activityText(changed, "maya")).toBe("You changed a rule")
    expect(isTxHash(changed.txHash)).toBe(true)
  })
})

describe("activityFromApi: GET /api/me/activity rows → items", () => {
  const pot = { potId: "lisbon-trip.pots.x.testnet", slug: "lisbon-trip", name: "Lisbon Trip", emoji: "🇵🇹", gradient: "2" }
  const me = { id: "maya.testnet", name: "Maya" }
  const row = (r: Partial<ActivityApiItem> & Pick<ActivityApiItem, "kind" | "key">): ActivityApiItem => ({ pot, at: "2026-11-10T12:00:00.000Z", ...r })

  it("maps every kind with its status chip, amount (Micro), receipt and names", () => {
    const items = activityFromApi(
      [
        row({ kind: "added", key: activityKey.added(HASH), amount: "150000000", txHash: HASH }),
        row({ kind: "asked", key: "asked:lisbon-trip:1", amount: "84000000", path: "instant", status: "paid", category: "groceries", requestId: 1 }),
        row({ kind: "asked", key: "asked:lisbon-trip:2", amount: "300000000", path: "vote", category: "tickets", requestId: 2 }),
        row({ kind: "voted", key: "voted:lisbon-trip:3:maya.testnet", vote: "Reject", proposalId: 3, about: { type: "spend", actor: "sam-91c3.testnet", amount: "300000000", requestId: 2 } }),
        row({ kind: "refund", key: "refund:lisbon-trip:maya.testnet", amount: "22000000" }),
        row({ kind: "joined", key: "joined:lisbon-trip:maya.testnet" }),
        row({ kind: "rules_asked", key: "rules_asked:lisbon-trip:5", proposalId: 5 }),
        row({ kind: "close_asked", key: "close_asked:lisbon-trip:6", proposalId: 6 }),
        row({ kind: "created", key: "created:lisbon-trip" }),
        row({ kind: "rules_changed", key: "rules_changed:lisbon-trip:x" }),
      ],
      me,
      { "sam-91c3.testnet": { name: "Sammy" } },
    )
    expect(items.map((i) => [i.kind, i.status ?? null, activityText(i, me.id)])).toEqual([
      ["added", "sent", "You added $150"],
      ["asked", "approved", "You got $84 back for groceries"],
      ["asked", "needs", "You asked for $300 for tickets"],
      ["voted", "declined", "You declined Sammy's $300"],
      ["refund", "sent", "You got $22 back when the Pot closed"],
      ["joined", null, "You joined"],
      ["rules_asked", null, "You asked to change a rule"],
      ["close_asked", null, "You asked to close the Pot"],
      ["created", null, "You started the Pot"],
      ["rules_changed", null, "You changed a rule"],
    ])
    expect(items[0]).toMatchObject({ amount: 150_000_000n, txHash: HASH, potCover: 2, potEmoji: "🇵🇹", at: Date.parse("2026-11-10T12:00:00.000Z") })
    expect(items[3]).toMatchObject({ requestId: 2 })
    expect(activityHref(items[3]!)).toBe("/p/lisbon-trip?r=2")
    expect(activityHref(items[1]!)).toBe("/p/lisbon-trip")
    expect(activityHref(items[5]!)).toBe("/p/lisbon-trip?tab=members")
  })

  it("hub statuses → chips", () => {
    expect(hubStatusChip("payout_failed", "vote")).toBe("failed")
    expect(hubStatusChip("rejected", "vote")).toBe("declined")
    expect(hubStatusChip("withdrawn", "vote")).toBe("declined")
    expect(hubStatusChip("expired", "vote")).toBe("expired")
    expect(hubStatusChip("proposed", "vote")).toBe("needs")
    expect(hubStatusChip(undefined, "instant")).toBeUndefined()
  })
})

describe("mergeActivity", () => {
  const item = (key: string, at: number, extra: Partial<ActivityItemVM> = {}): ActivityItemVM => ({
    key,
    kind: "asked",
    at,
    slug: "s",
    potName: "S",
    potEmoji: "",
    potCover: 0,
    actorId: "me",
    actorName: "Me",
    ...extra,
  })
  it("one row per key: the chain's status, the server's time and receipt; newest first", () => {
    const server = [item("a", 300, { status: "needs", txHash: HASH }), item("b", 200)]
    const chain = [item("a", 250, { status: "approved", reason: "Hostel" }), item("c", 100)]
    const m = mergeActivity(server, chain)
    expect(m.map((i) => i.key)).toEqual(["a", "b", "c"])
    expect(m[0]).toMatchObject({ at: 300, status: "approved", txHash: HASH, reason: "Hostel" })
  })
  it("while the server has older pages, chain-only rows older than its last row wait", () => {
    const m = mergeActivity([item("a", 300), item("b", 200)], [item("c", 100), item("d", 250)], { until: 200 })
    expect(m.map((i) => i.key)).toEqual(["a", "d", "b"])
  })
  it("groups by day, newest day first", () => {
    const now = Date.UTC(2026, 10, 10, 15)
    const g = groupByDay([item("a", now - HOUR), item("b", now - DAY), item("c", now - DAY - HOUR)], now)
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 2],
    ])
  })
})

describe("receipt links: only for a real transaction hash", () => {
  it("accepts base58 32-byte hashes only", () => {
    expect(isTxHash(HASH)).toBe(true)
    expect(isTxHash(W.mockTxHash("x"))).toBe(true)
    expect(isTxHash(undefined)).toBe(false)
    expect(isTxHash("")).toBe(false)
    expect(isTxHash("op_01J9ABC")).toBe(false) // an optimistic op id
    expect(isTxHash(`${HASH}0`)).toBe(false) // 0 isn't base58
    expect(isTxHash(HASH.slice(0, 30))).toBe(false)
  })
  it("builds the explorer URLs (NEXT_PUBLIC_EXPLORER, testnet.nearblocks.io by default)", () => {
    expect(explorerTxUrl(HASH)).toMatch(new RegExp(`^https://testnet\\.nearblocks\\.io/txns/${HASH}$`))
    expect(explorerTxUrl("pending")).toBeNull()
    expect(explorerAccountUrl("lisbon-trip.pots.x.testnet")).toMatch(/\/address\/lisbon-trip\.pots\.x\.testnet$/)
  })
})

describe("your Pot dollars (mock): paid to you + refunds − what you added from them", () => {
  it("counts spends paid to you and close refunds, minus own-dollar adds; formats with cents", () => {
    let w = W.seedWorld(T0)
    expect(W.ownDollarsOf(w, "maya")).toBe(0)
    w = W.requestSpend(w, "lisbon-trip", "maya", { amountCents: 8_400, category: "groceries", receiver: "maya" }, T0 + HOUR).world
    expect(W.ownDollarsOf(w, "maya")).toBe(8_400)
    expect(formatUsd(cents(W.ownDollarsOf(w, "maya")))).toBe("$84.00")
    w = W.addMoney(w, "porto-weekend", "maya", 4_000, T0 + 2 * HOUR, "pot_dollars")
    expect(W.ownDollarsOf(w, "maya")).toBe(4_400)
    expect(() => W.addMoney(w, "porto-weekend", "maya", 5_000, T0 + 3 * HOUR, "pot_dollars")).toThrow("insufficient_own")
    // demo dollars don't touch it
    w = W.addMoney(w, "porto-weekend", "maya", 5_000, T0 + 3 * HOUR)
    expect(W.ownDollarsOf(w, "maya")).toBe(4_400)
    // a close pays everyone their part into their Pot account
    const before = W.ownDollarsOf(w, "sam")
    w = W.proposeClose(w, "porto-weekend", "maya", T0 + 4 * HOUR).world
    w = W.voteClose(w, "porto-weekend", "sam", "Approve", T0 + 5 * HOUR).world
    const refund = w.pots["porto-weekend"]!.close!.payouts.find((p) => p.account === "sam")!.amount
    expect(W.ownDollarsOf(w, "sam")).toBe(before + refund)
    expect(formatUsd(cents(123_450))).toBe("$1,234.50")
  })
})
