// The browser mock world must tell the same D-61 story as @pot/sdk/testing's MockChain (the hub + Sputnik twin):
// same balances at each state, same k of n, same pro-rata refunds, same invite link format.
import { approvalsNeeded as sdkApprovals, buildInviteLink, invitePkFromParam, parseInviteLink, type PublicKeyStr } from "@pot/sdk"
import { LISBON_EXPECTED, lisbonTrip } from "@pot/sdk/testing"
import { describe, expect, it } from "vitest"
import { inviteLink } from "../invite"
import { previewSpend, DEFAULT_RULES } from "../rules"
import { dollars } from "../money"
import { PORTO_INVITE } from "./fixtures"
import { potView, requestSpend, seedWorld, vote } from "./world"

const NOW = Date.UTC(2026, 10, 3, 12)

describe("mock world ≡ @pot/sdk/testing (D-61)", () => {
  it("seeded → after_instant → vote_approved balances match LISBON_EXPECTED", async () => {
    let w = seedWorld(NOW)
    expect(potView(w, "lisbon-trip", "maya", NOW)!.balance).toBe(LISBON_EXPECTED.seeded.balance)
    w = requestSpend(w, "lisbon-trip", "maya", { amountCents: 8400, category: "groceries", receiver: "maya" }, NOW).world
    expect(potView(w, "lisbon-trip", "maya", NOW)!.balance).toBe(LISBON_EXPECTED.after_instant.balance)
    const r = requestSpend(w, "lisbon-trip", "maya", { amountCents: 30000, category: "tickets", receiver: "maya" }, NOW)
    w = vote(r.world, "lisbon-trip", r.request.id, "leo", "Approve", NOW).world
    const v = potView(w, "lisbon-trip", "maya", NOW)!
    expect(v.balance).toBe(LISBON_EXPECTED.vote_approved.balance)
    expect(v.totalIn).toBe(LISBON_EXPECTED.vote_approved.totalIn)

    // the sdk's MockChain at the same state
    const fx = await lisbonTrip("vote_approved")
    const bal = await fx.chain.usdc.balanceOf(fx.ids.dao)
    expect(bal.value).toBe(v.balance)
    const members = await fx.chain.hub.getMembers(fx.ids.dao, bal.value)
    expect(members.value.map((m) => m.wouldGetBack).sort()).toEqual(v.members.map((m) => m.getsBack).sort())
  })

  it("k of n and the instant/vote split agree with the hub's decide()", () => {
    for (const n of [1, 2, 3, 4, 5, 10]) expect(previewSpend({ amount: 1n, balance: 1n, rules: DEFAULT_RULES, memberCount: n, used: 0n, contributed: 1n, receiverIsMember: true }).k).toBe(sdkApprovals(n))
    const base = { balance: dollars(450), rules: DEFAULT_RULES, memberCount: 3, used: 0n, contributed: dollars(150), receiverIsMember: true }
    expect(previewSpend({ ...base, amount: dollars(84) }).path).toBe("instant")
    expect(previewSpend({ ...base, amount: dollars(300) }).reason).toBe("over_cap")
  })

  it("invite links use the sdk format and parse back", () => {
    const link = inviteLink("https://pot.example", "porto-weekend", PORTO_INVITE)
    expect(link).toBe(buildInviteLink({ origin: "https://pot.example", slug: "porto-weekend", invitePk: PORTO_INVITE.pk as PublicKeyStr, secret: PORTO_INVITE.secret }))
    const parsed = parseInviteLink(link)!
    expect(parsed.slug).toBe("porto-weekend")
    expect(invitePkFromParam(new URL(link).searchParams.get("i")!)).toBe(PORTO_INVITE.pk)
  })
})
