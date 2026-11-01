// @vitest-environment jsdom
// F-20 / F-22 / F-23 component tests: the RefundTable is a real table ("You" first, a total row), the close and
// rules error copy, changed-rule detection, and the push deep-link resolver (?pid=).
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RefundTable } from "@/components/pot/RefundTable"
import { closeErrorKey } from "@/components/sheets/CloseSheet"
import { changedFields, rulesErrorKey } from "@/components/sheets/RulesSheet"
import { ActionError } from "@/lib/client/errors"
import { cents } from "@/lib/client/money"
import { resolveProposalParam } from "@/lib/client/sheet"

afterEach(cleanup)

const P = (id: string, name: string, joinIndex: number) => ({ id, name, initials: name[0]!, joinIndex })

describe("RefundTable", () => {
  it("is a real table with row headers, You first, and a total row", () => {
    render(
      <RefundTable
        me="leo"
        caption="Who gets what back"
        rows={[
          { person: P("maya", "Maya", 0), putIn: cents(20_000), back: cents(2_933) },
          { person: P("sam", "Sam", 1), putIn: cents(15_000), back: cents(2_200) },
          { person: P("leo", "Leo", 2), putIn: cents(10_000), back: cents(1_467) },
        ]}
      />,
    )
    const table = screen.getByRole("table", { name: "Who gets what back" })
    const rows = within(table).getAllByRole("row")
    expect(rows).toHaveLength(5) // header + 3 + total
    within(rows[1]!).getByRole("rowheader", { name: "Leo (you)" }) // the avatar's initials are aria-hidden
    within(rows[2]!).getByRole("rowheader", { name: "Maya" })
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Person", "Put in", "Gets back"])
    expect(within(rows[4]!).getByRole("rowheader").textContent).toBe("Total")
    expect(rows[4]!.textContent).toContain("$66.00")
    expect(rows[4]!.textContent).toContain("$450.00")
  })
})

describe("error copy", () => {
  it("close: busy, in flight, cooldown, payouts pending, generic", () => {
    expect(closeErrorKey(new ActionError("specific", "ERR_POT_BUSY"))).toBe("close.busy")
    expect(closeErrorKey(new ActionError("specific", "ERR_CLOSE_IN_PROGRESS"))).toBe("close.in_flight")
    expect(closeErrorKey(new ActionError("specific", "ERR_CLOSE_COOLDOWN"))).toBe("close.cooldown")
    expect(closeErrorKey(new ActionError("specific", "ERR_PAYOUTS_PENDING"))).toBe("close.payouts_pending")
    expect(closeErrorKey(new ActionError("rate_limited", "rate_limited"))).toBe("relayer.cap")
    expect(closeErrorKey(new Error("boom"))).toBe("close.error")
  })
  it("rules: one open request per Pot, closing, generic", () => {
    expect(rulesErrorKey(new ActionError("specific", "ERR_RULES_PENDING"))).toBe("rules.change.in_flight")
    expect(rulesErrorKey(new ActionError("specific", "ERR_POT_NOT_OPEN"))).toBe("rules.change.closing")
    expect(rulesErrorKey(new Error("x"))).toBe("rules.change.error")
  })
  it("detects which rule changed", () => {
    const a = { instantCap: cents(10_000), memberBudget: cents(20_000) }
    expect(changedFields(a, { ...a, instantCap: cents(5_000) })).toEqual(["instantCap"])
    expect(changedFields(a, a)).toEqual([])
  })
})

describe("?pid= (a push names a proposal)", () => {
  const known = { close: 20, rules: 21, requests: [[12, 12] as const, [14, 13] as const] }
  it("opens the request, the close or the rules sheet behind the proposal", () => {
    window.history.replaceState(null, "", "/p/lisbon-trip?pid=14")
    expect(resolveProposalParam(14, known)).toBe("request")
    expect(window.location.search).toBe("?r=13")
    window.history.replaceState(null, "", "/p/lisbon-trip?pid=20")
    expect(resolveProposalParam(20, known)).toBe("close")
    expect(window.location.search).toBe("?sheet=close")
    window.history.replaceState(null, "", "/p/lisbon-trip?pid=21&tab=rules")
    expect(resolveProposalParam(21, known)).toBe("rules")
    expect(window.location.search).toBe("?tab=rules&sheet=rules")
    window.history.replaceState(null, "", "/p/lisbon-trip?pid=99")
    expect(resolveProposalParam(99, known)).toBeNull()
  })
})
