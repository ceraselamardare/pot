import { describe, expect, it } from "vitest"
import { dollars } from "./money"
import { approvalsNeeded, getsBack, previewSpend, DEFAULT_RULES, type PreviewInput } from "./rules"

describe("approvalsNeeded (majority, quorum 1)", () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [40, 21],
  ])("n=%i → k=%i", (n, k) => expect(approvalsNeeded(n)).toBe(k))
})

describe("previewSpend (frontend-architecture §3.7)", () => {
  const base: PreviewInput = {
    amount: dollars(84),
    balance: dollars(450),
    rules: DEFAULT_RULES,
    memberCount: 3,
    used: 0n,
    contributed: dollars(150),
    receiverIsMember: true,
  }
  it.each<[string, Partial<PreviewInput>, string, string]>([
    ["$84 groceries", {}, "instant", "ok"],
    ["$0", { amount: 0n }, "empty", "empty"],
    ["$300 boat", { amount: dollars(300) }, "vote", "over_cap"],
    ["over the per-person limit", { used: dollars(150) }, "vote", "over_budget"],
    ["outside payee", { receiverIsMember: false }, "vote", "recipient"],
    ["new member (rev4)", { contributed: 0n }, "vote", "new_member"],
    ["more than the Pot has", { amount: dollars(500) }, "blocked", "balance"],
  ])("%s", (_, patch, path, reason) => {
    const p = previewSpend({ ...base, ...patch })
    expect(p.path).toBe(path)
    expect(p.reason).toBe(reason)
    expect([p.k, p.n]).toEqual([2, 3])
  })
})

describe("getsBack (D-09 pro-rata, floored)", () => {
  it("splits $66 by contribution", () => {
    expect(getsBack(dollars(66), dollars(150), dollars(450))).toBe(dollars(22))
    expect(getsBack(dollars(66), dollars(200), dollars(450))).toBe(29_330_000n)
    expect(getsBack(dollars(66), dollars(100), dollars(450))).toBe(14_660_000n)
  })
})

// hub 1.3.0 (W4-1 a, c; HUB-2): the local preview goes through the sdk's decideSpend with the requester's stake and
// lifetime one-OK allowance, so it shows the same tier the hub will pick.
describe("previewSpend: hub 1.3.0 one-OK tier", () => {
  const base: PreviewInput = {
    amount: dollars(250),
    balance: dollars(900),
    rules: DEFAULT_RULES,
    memberCount: 3,
    used: 0n,
    contributed: dollars(150),
    receiverIsMember: true,
    extras: { trust: false, oneOkCap: dollars(300) },
  }
  it("one OK while the allowance covers it; the group once it's used up", () => {
    expect(previewSpend(base).tier).toBe("one_ok")
    expect(previewSpend({ ...base, oneOkUsed: dollars(50) }).tier).toBe("one_ok")
    expect(previewSpend({ ...base, oneOkUsed: dollars(60) }).tier).toBe("group")
  })
  it("less than $1 added: no instant spend and no one OK", () => {
    expect(previewSpend({ ...base, contributed: 999_999n }).tier).toBe("group")
    expect(previewSpend({ ...base, amount: dollars(20), contributed: 999_999n })).toMatchObject({ path: "vote", reason: "new_member" })
  })
})
