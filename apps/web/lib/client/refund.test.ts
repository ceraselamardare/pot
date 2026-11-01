// Refund preview math (lib/client/refund.ts) against the hub's close-out formula (contracts/pot-hub/src/prorata.rs):
// share_i = floor(B × c_i / C), the remainder to the last contributor, zero shares omitted. Covers the shared contract
// vectors, the edge cases (no spends, last contributor, rounding to micro / to cents, zero contribution, empty Pot),
// and that the Add / Spend previews predict exactly what the mock world and the live view model then show.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AccountId, MemberView, PotView } from "@pot/sdk"
import { livePotVM, type LiveBundle } from "./live/vm"
import * as W from "./mock/world"
import { refundAfterAdd, refundAfterSpend, refundBasis, refundBreakdown, refundOf, refunds, withAdd, withSpend, type RefundBasis } from "./refund"

const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n
const basis = (balance: bigint, cs: [string, bigint][], last: string | null = null, unit = 1n): RefundBasis => ({
  balance,
  members: cs.map(([id, contributed]) => ({ id, contributed })),
  lastContributor: last,
  unit,
})
const asObj = (m: Map<string, bigint>) => Object.fromEntries([...m].map(([k, v]) => [k, v.toString()]))

describe("refunds: the hub's close-out formula", () => {
  it("matches every shared contract vector (contracts/tests/vectors/prorata.json, V1-V7)", () => {
    const file = new URL("../../../../contracts/tests/vectors/prorata.json", import.meta.url)
    const { vectors } = JSON.parse(readFileSync(file, "utf8")) as {
      vectors: {
        id: string
        balance: string
        contributions: { account_id: string; contributed: string }[]
        last_contributor: string | null
        expected: { nothing_to_refund?: boolean; payouts?: { account_id: string; amount: string }[] }
      }[]
    }
    expect(vectors.length).toBe(7)
    for (const v of vectors) {
      const got = refunds(basis(BigInt(v.balance), v.contributions.map((c) => [c.account_id, BigInt(c.contributed)]), v.last_contributor))
      const want = v.expected.nothing_to_refund ? {} : Object.fromEntries(v.expected.payouts!.map((p) => [p.account_id, p.amount]))
      expect(asObj(got), v.id).toEqual(want)
    }
  })

  it("no spends: everyone gets back exactly what they put in", () => {
    const b = basis(usd(450), [["maya", usd(150)], ["sam", usd(200)], ["leo", usd(100)]], "leo")
    expect(asObj(refunds(b))).toEqual({ maya: "150000000", sam: "200000000", leo: "100000000" })
  })

  it("after spending: floor(B × c / C) each (the README's $66 left of $450)", () => {
    const b = basis(usd(66), [["maya", usd(150)], ["sam", usd(150)], ["leo", usd(150)]], "leo")
    expect(refundOf(b, "maya")).toBe(usd(22))
    // unequal: $100 left of 50 / 100 / 150 → 16.666666, 33.333333, 50 (+ the 1-micro remainder to the last contributor)
    const u = basis(usd(100), [["a", usd(50)], ["b", usd(100)], ["c", usd(150)]], "a")
    expect(asObj(refunds(u))).toEqual({ a: "16666667", b: "33333333", c: "50000000" })
  })

  it("rounds down to the micro; the remainder (< n micro) goes to the last contributor", () => {
    const b = basis(100n, [["a", 1n], ["b", 1n], ["c", 1n]], "b")
    expect(asObj(refunds(b))).toEqual({ a: "33", b: "34", c: "33" })
    const total = [...refunds(b).values()].reduce((s, x) => s + x, 0n)
    expect(total).toBe(100n) // Σ refunds == what's in the Pot
  })

  it("no last contributor known: the remainder goes to the last person in join order who put money in", () => {
    const b = basis(100n, [["a", 1n], ["b", 1n], ["c", 1n], ["d", 0n]])
    expect(asObj(refunds(b))).toEqual({ a: "33", b: "33", c: "34" })
  })

  it("a member who put in nothing gets nothing back", () => {
    const b = basis(usd(300), [["a", usd(150)], ["new", 0n], ["b", usd(150)]], "b")
    expect(refundOf(b, "new")).toBe(0n)
    expect(refunds(b).has("new")).toBe(false)
    expect(refundOf(b, "a")).toBe(usd(150))
  })

  it("an empty Pot (or nobody put money in) gives nothing back", () => {
    expect(refunds(basis(0n, [["a", usd(150)]], "a")).size).toBe(0)
    expect(refunds(basis(usd(10), [["a", 0n], ["b", 0n]])).size).toBe(0)
    expect(refunds(basis(usd(10), [])).size).toBe(0)
  })

  it("unit = cents (the mock world): the same formula over whole cents", () => {
    const micro = basis(usd(1), [["a", usd(1)], ["b", usd(1)], ["c", usd(1)]], "c")
    expect(asObj(refunds(micro))).toEqual({ a: "333333", b: "333333", c: "333334" })
    const cents = { ...micro, unit: 10_000n }
    expect(asObj(refunds(cents))).toEqual({ a: "330000", b: "330000", c: "340000" })
  })
})

describe("what an action would change", () => {
  const b = basis(usd(366), [["maya", usd(150)], ["sam", usd(150)], ["leo", usd(150)]], "leo")

  it("Add: more in the Pot, more put in, and you become the last contributor", () => {
    const after = withAdd(b, "sam", usd(50))
    expect(after.balance).toBe(usd(416))
    expect(after.lastContributor).toBe("sam")
    expect(after.members.find((m) => m.id === "sam")!.contributed).toBe(usd(200))
    // 416 × 200 / 500 = 166.40; the others 416 × 150 / 500 = 124.80
    expect(refundOf(after, "sam")).toBe(usd(166.4))
    expect(refundOf(after, "maya")).toBe(usd(124.8))
    expect(withAdd(b, "sam", 0n)).toBe(b)
  })

  it("Add as a new member who put in nothing yet", () => {
    const n = basis(usd(300), [["a", usd(150)], ["b", usd(150)], ["new", 0n]], "b")
    // 350 × 50 / 350 = 50: the first dollars in come back whole when nothing has been spent
    expect(refundOf(withAdd(n, "new", usd(50)), "new")).toBe(usd(50))
  })

  it("Spend: the Pot shrinks, everyone's part shrinks by what they put in", () => {
    expect(refundOf(withSpend(b, usd(84)), "maya")).toBe(usd(94)) // 282 / 3
    expect(withSpend(b, usd(1000)).balance).toBe(0n)
    expect(refundOf(withSpend(b, usd(366)), "maya")).toBe(0n)
  })
})

describe("parity with the data sources", () => {
  const NOW = 1_800_000_000_000

  it("mock: the preview equals each member's Gets back, and predicts the world after Add and Spend exactly", () => {
    let w = W.seedWorld(NOW)
    // make it uneven: Maya's instant $84, then Leo adds $10.01
    w = W.requestSpend(w, "lisbon-trip", "maya", { amountCents: 8_400, category: "groceries", receiver: "maya" }, NOW + 1).world
    w = W.addMoney(w, "lisbon-trip", "leo", 1_001, NOW + 2)
    for (const me of ["maya", "sam", "leo"]) {
      const pot = W.potView(w, "lisbon-trip", me, NOW + 3)!
      const b = refundBasis(pot)!
      expect(b.unit).toBe(10_000n)
      for (const m of pot.members) expect(refundOf(b, m.person.id), `${me} sees ${m.person.id}`).toBe(m.getsBack)
      expect(refundOf(b, me)).toBe(pot.myShare)

      // Add $33.33: predicted before == what the world shows after
      const predicted = refundAfterAdd(pot, usd(33.33))
      const after = W.potView(W.addMoney(w, "lisbon-trip", me, 3_333, NOW + 4), "lisbon-trip", me, NOW + 5)!
      expect(predicted, `add as ${me}`).toBe(after.myShare)
      for (const m of after.members) expect(refundOf(withAdd(b, me, usd(33.33)), m.person.id)).toBe(m.getsBack)

      // an instant spend of $7.77 to me
      const spent = W.requestSpend(w, "lisbon-trip", me, { amountCents: 777, category: "food", receiver: me }, NOW + 4)
      expect(spent.request.status).toBe("paid")
      expect(refundAfterSpend(pot, usd(7.77)), `spend as ${me}`).toBe(W.potView(spent.world, "lisbon-trip", me, NOW + 5)!.myShare)
    }
  })

  it("mock: the breakdown is put in = part of the spending + gets back", () => {
    const w = W.requestSpend(W.seedWorld(NOW), "lisbon-trip", "maya", { amountCents: 8_400, category: "groceries", receiver: "maya" }, NOW + 1).world
    const pot = W.potView(w, "lisbon-trip", "sam", NOW + 2)!
    expect(refundBreakdown(pot)).toEqual({ putIn: usd(150), partOfSpending: usd(28), getsBack: usd(122), totalIn: usd(450), left: usd(366) })
  })

  it("live: the view model's Gets back (hub preview_close) equals the same math at unit 1 micro", () => {
    const D = "trip-ab12.pots.x.testnet"
    const a = "ana.users.x.testnet" as AccountId
    const b2 = "ben.users.x.testnet" as AccountId
    const c = "cy.users.x.testnet" as AccountId
    // $100.000001 left of 50 / 100 / 150 (Ben added last): floor shares + 2 micro to Ben
    const balance = 100_000_001n
    const mv = (account: AccountId, joinIndex: number, contributed: bigint): MemberView =>
      ({ account, joinIndex, status: "active", joinedAtMs: NOW, contributed, spent: 0n, instantUsed: 0n, budgetLeft: 0n, wouldGetBack: 0n, shareOfSpending: 0n, isLastContributor: account === b2, balanceSource: "argument" }) as MemberView
    const payouts = [
      { account: a, contributed: usd(50), amount: 16_666_667n - 1n }, // floor(100000001 × 50 / 300) = 16666666
      { account: b2, contributed: usd(100), amount: 33_333_333n + 2n },
      { account: c, contributed: usd(150), amount: 50_000_000n },
    ]
    const bundle: LiveBundle = {
      dao: D,
      view: { pot: D, slug: "trip-ab12", name: "Trip", creator: a, status: "open", rules: { instantCap: usd(100), memberBudget: usd(200), instantPayees: "members", payeeAllowlist: [] }, totalIn: usd(300), memberCount: 3, approvalsNeeded: 2, createdAtMs: NOW, proposalPeriodMs: 7 * 86_400_000, spentInstant: usd(200), spentVote: 0n, lastContributor: b2, closingInFlight: false } as unknown as PotView,
      balance,
      members: [mv(a, 0, usd(50)), mv(b2, 1, usd(100)), mv(c, 2, usd(150))],
      requests: [],
      proposals: {},
      feed: null,
      invite: null,
      closePreview: { pot: D, balance, balanceSource: "argument", totalIn: usd(300), approvalsNeeded: 2, openRequests: 0, payouts, dust: 2n, dustTo: b2, canPropose: true, blockedReason: null } as never,
    }
    const pot = livePotVM(bundle, { me: a, now: NOW, goalEach: null })
    const b = refundBasis(pot)!
    expect(b.unit).toBe(1n)
    expect(asObj(refunds(b))).toEqual(Object.fromEntries(payouts.map((p) => [p.account, p.amount.toString()])))
    expect(refundOf(b, a)).toBe(pot.myShare)
    // Ana adds $0.01: she becomes the last contributor, so the remainder moves to her
    // B' = 100 010 001, C' = 300 010 000: floor(B' × 50 010 000 / C') = 16 671 111, + the 2-micro remainder
    expect(refundAfterAdd(pot, usd(0.01))).toBe(16_671_113n)
  })

  it("no preview once the Pot is closing or closed", () => {
    const w = W.seedWorld(NOW)
    const pot = { ...W.potView(w, "lisbon-trip", "maya", NOW)!, status: "closing" as const }
    expect(refundBasis(pot)).toBeNull()
    expect(refundAfterAdd(pot, usd(10))).toBeNull()
    expect(refundAfterSpend(pot, usd(10))).toBeNull()
  })
})
