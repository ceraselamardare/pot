// U-04 k of n, U-05 expiry, the spend decision twin, U-10 / PR-02 pro-rata (shared vectors V1-V7,
// fast-check properties, the 500-case parity file).
import { existsSync, readFileSync } from "node:fs"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { approvalsNeeded, tallyStatus } from "./approvals.ts"
import { effectiveStatus, expiresAtMs, isExpired, msUntilExpiry } from "./expiry.ts"
import { decideSpend, previewSpendDecision, type DecideInput } from "./decide.ts"
import { prorata, shareOf, type Contribution } from "./prorata.ts"
import { PRESET_RULES } from "../types/hub.ts"
import { generate } from "../../scripts/gen-prorata-vectors.ts"

describe("k of n (U-04)", () => {
  it("majority [1,2] with quorum 1 matches Sputnik's to_weight", () => {
    const table: [number, number][] = [[1, 1], [2, 2], [3, 2], [4, 3], [5, 3], [6, 4], [30, 16], [40, 21]]
    for (const [n, k] of table) expect(approvalsNeeded(n)).toBe(k)
    expect(approvalsNeeded(1, [1, 1])).toBe(1)
    expect(approvalsNeeded(2, [1, 1])).toBe(2) // a 2nd rulebot would need both
    expect(approvalsNeeded(0, [1, 2], 1)).toBe(1) // quorum "1" blocks the empty-role bypass
    expect(approvalsNeeded(5, 2)).toBe(2)
  })
  it("tally", () => {
    expect(tallyStatus({ approve: 2, reject: 0 }, 3)).toBe("Approved")
    expect(tallyStatus({ approve: 1, reject: 2 }, 3)).toBe("Rejected")
    expect(tallyStatus({ approve: 3, reject: 3 }, 6)).toBe("InProgress") // ties never resolve
  })
})

describe("expiry (U-05)", () => {
  const sub = 1_793_002_001_000_000_000n
  const period = 604_800_000_000_000n
  it("submission_time + period, lazy on chain", () => {
    expect(expiresAtMs(sub, period)).toBe(1_793_002_001_000 + 604_800_000)
    expect(msUntilExpiry(sub, period, 1_793_002_001_000)).toBe(604_800_000)
    const end = 1_793_002_001_000 + 604_800_000
    expect(isExpired(sub, period, end)).toBe(false) // strict <, like Sputnik
    expect(isExpired(sub, period, end + 1)).toBe(true)
    expect(effectiveStatus("InProgress", sub, period, end + 1)).toBe("Expired")
    expect(effectiveStatus("Approved", sub, period, end + 1)).toBe("Approved")
  })
})

describe("spend decision (twin of PotHub::decide)", () => {
  const base: DecideInput = {
    paused: false,
    potOpen: true,
    hubId: "pots.potapp.testnet",
    daoId: "lisbon-trip.pots.potapp.testnet",
    usdcId: "usdc.potapp.testnet",
    rules: PRESET_RULES.trip,
    requestCount: 0,
    maxRequestsPerPot: 1000,
    maxPendingPerMember: 10,
    requester: { instantUsed: 0n, contributed: 150_000_000n, pendingVotes: 0 },
    receiverIsMember: true,
    receiverId: "maya.users.potapp.testnet",
    amount: 84_000_000n,
  }
  it("D-61: $84 instant, $300 over cap, budget, payee, new member", () => {
    expect(decideSpend(base)).toEqual({ ok: true, path: "instant", reason: "within_rules", tier: "instant" })
    expect(decideSpend({ ...base, amount: 100_000_000n })).toMatchObject({ path: "instant" }) // inclusive cap (T-21)
    expect(decideSpend({ ...base, amount: 101_000_000n })).toMatchObject({ path: "vote", reason: "over_cap" })
    expect(decideSpend({ ...base, amount: 300_000_000n })).toMatchObject({ path: "vote", reason: "over_cap" })
    const used184 = { ...base, requester: { instantUsed: 184_000_000n, contributed: 150_000_000n, pendingVotes: 0 } }
    expect(decideSpend({ ...used184, amount: 20_000_000n })).toMatchObject({ path: "vote", reason: "over_budget" }) // T-22
    expect(decideSpend({ ...used184, amount: 16_000_000n })).toMatchObject({ path: "instant" }) // exactly 200
    expect(decideSpend({ ...base, receiverIsMember: false, receiverId: "shop.testnet" })).toMatchObject({ path: "vote", reason: "payee_not_allowed" })
    expect(decideSpend({ ...base, requester: { instantUsed: 0n, contributed: 0n, pendingVotes: 0 } })).toMatchObject({ path: "vote", reason: "new_member" })
    const allow = { ...base, rules: { ...PRESET_RULES.team, payeeAllowlist: ["shop.testnet"] }, receiverIsMember: false, receiverId: "shop.testnet" } as DecideInput
    expect(decideSpend(allow)).toMatchObject({ path: "instant" })
  })
  it("panics in the contract's order", () => {
    expect(decideSpend({ ...base, paused: true })).toMatchObject({ ok: false, code: "ERR_PAUSED" })
    expect(decideSpend({ ...base, potOpen: false })).toMatchObject({ ok: false, code: "ERR_POT_NOT_OPEN", previewReason: "pot_not_open" })
    expect(decideSpend({ ...base, requester: null })).toMatchObject({ ok: false, code: "ERR_NOT_MEMBER" })
    expect(decideSpend({ ...base, amount: 0n })).toMatchObject({ ok: false, code: "ERR_BAD_AMOUNT" })
    expect(decideSpend({ ...base, receiverId: base.daoId })).toMatchObject({ ok: false, code: "ERR_BAD_RECEIVER" })
    expect(decideSpend({ ...base, requestRef: "NOPE" })).toMatchObject({ ok: false, code: "ERR_BAD_REQUEST_REF" })
    expect(decideSpend({ ...base, requestCount: 1000 })).toMatchObject({ ok: false, code: "ERR_TOO_MANY_REQUESTS" })
    expect(decideSpend({ ...base, amount: 300_000_000n, requester: { instantUsed: 0n, contributed: 1n, pendingVotes: 10 } })).toMatchObject({ ok: false, code: "ERR_TOO_MANY_PENDING" })
  })
  it("preview: insufficient balance net of other reservations", () => {
    expect(previewSpendDecision({ ...base, balance: 366_000_000n, reserved: 0n })).toEqual({ path: "instant", reason: "within_rules" })
    expect(previewSpendDecision({ ...base, amount: 400_000_000n, balance: 366_000_000n, reserved: 0n })).toEqual({ path: "blocked", reason: "insufficient_balance" })
    expect(previewSpendDecision({ ...base, balance: 100_000_000n, reserved: 50_000_000n })).toEqual({ path: "blocked", reason: "insufficient_balance" })
  })
})

interface VectorFile {
  vectors: {
    id: string
    balance: string
    contributions: { account_id: string; contributed: string }[]
    last_contributor: string
    expected: { payouts?: { account_id: string; amount: string }[]; dust?: string; dust_to?: string; nothing_to_refund?: boolean }
  }[]
}
const loadVectors = (rel: string): VectorFile => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as VectorFile

function check(file: VectorFile): void {
  for (const v of file.vectors) {
    const r = prorata(
      BigInt(v.balance),
      v.contributions.map((c) => ({ account: c.account_id, contributed: BigInt(c.contributed) })),
      v.last_contributor,
    )
    if (v.expected.nothing_to_refund) {
      expect(r, v.id).toBeNull()
      continue
    }
    expect(r, v.id).not.toBeNull()
    expect(r?.payouts.map((p) => ({ account_id: p.account, amount: p.amount.toString() })), v.id).toEqual(v.expected.payouts)
    expect(r?.dust.toString(), v.id).toBe(v.expected.dust)
    expect(r?.dustTo, v.id).toBe(v.expected.dust_to)
  }
}

describe("pro-rata (D-09 twin; U-10, PR-02)", () => {
  it("shared vectors V1-V7 (src/math/vectors/prorata.json)", () => {
    const f = loadVectors("./vectors/prorata.json")
    expect(f.vectors.map((v) => v.id)).toEqual(["V1", "V2", "V3", "V4", "V5", "V6", "V7"])
    check(f)
  })

  it("parity with the contract's copy (contracts/tests/vectors/prorata.json), when present", () => {
    const url = new URL("../../../../contracts/tests/vectors/prorata.json", import.meta.url)
    if (!existsSync(url)) return
    const theirs = JSON.parse(readFileSync(url, "utf8")) as VectorFile
    expect(theirs.vectors).toEqual(loadVectors("./vectors/prorata.json").vectors)
    check(theirs)
  })

  it("the 500-case PR-02 parity file is up to date with the implementation", () => {
    const committed = loadVectors("./vectors/prorata-random.json")
    expect(committed.vectors).toHaveLength(500)
    expect(JSON.parse(JSON.stringify(generate()))).toEqual(committed)
    check(committed)
  })

  const arbCase = fc
    .tuple(
      fc.array(fc.bigInt({ min: 0n, max: 1_000_000_000_000n }), { minLength: 1, maxLength: 40 }),
      fc.bigInt({ min: 0n, max: 1_000_000_000_000_000n }),
      fc.nat(),
    )
    .filter(([cs]) => cs.some((c) => c > 0n))
    .map(([cs, balance, pick]) => {
      const contributions: Contribution[] = cs.map((c, i) => ({ account: `m${i}.near`, contributed: c }))
      const nonZero = contributions.filter((c) => c.contributed > 0n)
      const last = (nonZero[pick % nonZero.length] as Contribution).account
      return { contributions, balance, last }
    })

  it("PR-02: Σ payouts = balance; non-last payouts ≤ the exact pro-rata share; dust < n to the last contributor", () => {
    fc.assert(
      fc.property(arbCase, ({ contributions, balance, last }) => {
        const r = prorata(balance, contributions, last)
        if (balance === 0n) {
          expect(r).toBeNull()
          return
        }
        expect(r).not.toBeNull()
        const res = r as NonNullable<typeof r>
        const total = contributions.reduce((t, c) => t + c.contributed, 0n)
        expect(res.payouts.reduce((t, p) => t + p.amount, 0n)).toBe(balance)
        expect(res.dustTo).toBe(last)
        expect(res.dust).toBeGreaterThanOrEqual(0n)
        expect(res.dust).toBeLessThan(BigInt(contributions.length))
        for (const c of contributions) {
          const paid = res.payouts.find((p) => p.account === c.account)?.amount ?? 0n
          const floor = (balance * c.contributed) / total
          if (c.account === last) expect(paid).toBe(floor + res.dust)
          else {
            expect(paid).toBe(floor)
            expect(paid * total).toBeLessThanOrEqual(balance * c.contributed) // ≤ the exact share
          }
          if (c.contributed === 0n) expect(paid).toBe(0n)
        }
        expect(res.payouts.every((p) => p.amount > 0n)).toBe(true)
        // join order preserved
        const order = res.payouts.map((p) => contributions.findIndex((c) => c.account === p.account))
        expect([...order].sort((a, b) => a - b)).toEqual(order)
      }),
      { numRuns: 2000 },
    )
  })

  it("PR-02: deterministic (same input → same output) and no overflow at the maxima", () => {
    fc.assert(
      fc.property(arbCase, ({ contributions, balance, last }) => {
        expect(prorata(balance, contributions, last)).toEqual(prorata(balance, contributions.map((c) => ({ ...c })), last))
      }),
      { numRuns: 2000 },
    )
    const max = Array.from({ length: 40 }, (_, i) => ({ account: `m${i}`, contributed: 1_000_000_000_000_000n }))
    expect(prorata(1_000_000_000_000_000n, max, "m39")?.payouts.reduce((t, p) => t + p.amount, 0n)).toBe(1_000_000_000_000_000n)
  })

  it("edge cases", () => {
    expect(prorata(0n, [{ account: "a", contributed: 5n }], "a")).toBeNull() // V6 nothing_to_refund
    expect(prorata(5n, [{ account: "a", contributed: 0n }], "a")).toBeNull()
    expect(prorata(10n, [{ account: "a", contributed: 1n }, { account: "b", contributed: 1n }], "zzz")?.dustTo).toBe("b")
    expect(() => prorata(-1n, [], null)).toThrow()
    expect(shareOf(366_000_000n, 150_000_000n, 450_000_000n)).toBe(122_000_000n)
    expect(shareOf(1n, 1n, 0n)).toBe(0n)
  })
})
