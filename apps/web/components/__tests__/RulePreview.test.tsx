// @vitest-environment jsdom
// RulePreview: the neutral sentence before the tap (ux-spec §4.9 table).
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RulePreview } from "@/components/sheets/SpendSheet"
import { potView, seedWorld } from "@/lib/client/mock/world"
import { dollars } from "@/lib/client/money"
import { previewSpend } from "@/lib/client/rules"

afterEach(() => cleanup())
const NOW = Date.UTC(2026, 10, 3, 12)
const pot = potView(seedWorld(NOW), "lisbon-trip", "maya", NOW)!
const preview = (amount: bigint) =>
  previewSpend({ amount, balance: pot.balance, rules: pot.rules, memberCount: 3, used: 0n, contributed: dollars(150), receiverIsMember: true })

describe("RulePreview", () => {
  it("$84: approved instantly", () => {
    render(<RulePreview preview={preview(dollars(84))} pot={pot} used={0n} />)
    expect(screen.getByText("This will be approved instantly")).toBeTruthy()
    expect(screen.getByText("Anyone can spend up to $100 without asking.")).toBeTruthy()
  })
  it("$300: needs 2 of 3", () => {
    render(<RulePreview preview={preview(dollars(300))} pot={pot} used={0n} />)
    expect(screen.getByText("This needs 2 of 3 approvals")).toBeTruthy()
    expect(screen.getByText("It's over the $100 instant limit.")).toBeTruthy()
  })
  it("over the balance: blocked", () => {
    const { container } = render(<RulePreview preview={preview(dollars(500))} pot={pot} used={0n} />)
    expect(screen.getByText("The Pot has $450.00")).toBeTruthy()
    expect(container.querySelector("[data-rule-preview='blocked'] svg")).not.toBeNull()
  })
})
