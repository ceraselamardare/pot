// @vitest-environment jsdom
// The refund explainer (?sheet=refund, R-33 M-6): put in − your part of the spending = gets back, the plain "how" line,
// and the variants the mock e2e doesn't reach (nothing put in yet, closing, closed). No marigold: [Got it] is secondary.
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RefundSheet } from "@/components/sheets/RefundSheet"
import * as W from "@/lib/client/mock/world"
import type { PotVM } from "@/lib/client/mock/types"

afterEach(cleanup)

const NOW = 1_800_000_000_000
const spent = () => W.requestSpend(W.seedWorld(NOW), "lisbon-trip", "maya", { amountCents: 8_400, category: "groceries", receiver: "maya" }, NOW + 1).world
const sheet = (pot: PotVM) => {
  render(<RefundSheet pot={pot} open onClose={() => {}} />)
  return screen.getByRole("dialog", { name: "What you'd get back from Lisbon Trip" })
}
const rows = (d: HTMLElement) => [...d.querySelectorAll("dl > div")].map((r) => r.textContent)

describe("RefundSheet", () => {
  it("open Pot: what you'd get back now, and how it's worked out", () => {
    const d = sheet(W.potView(spent(), "lisbon-trip", "sam", NOW + 2)!)
    expect(within(d).getByText("If the Pot closed now, you'd get back")).toBeTruthy()
    expect(rows(d)).toEqual(["You put in$150.00", "Your part of the spending$28.00", "You'd get back$122.00"])
    expect(d.querySelector("[data-refund-how]")!.textContent).toBe(
      "Everything left is split by how much each person put in. You put in $150 of the $450 everyone put in, so you get that part of the $366 left.",
    )
    for (const m of d.querySelectorAll("[data-money]")) expect(m.className).toContain("tabular-nums")
    const done = within(d).getByRole("button", { name: "Got it" })
    expect(done.className).not.toMatch(/bg-brand\b/)
  })

  it("nothing put in yet: nothing would come back, said in words", () => {
    let w = W.joinPot(W.seedWorld(NOW), "porto-weekend", "leo", NOW + 1).world
    w = W.requestSpend(w, "porto-weekend", "maya", { amountCents: 1_000, category: "food", receiver: "maya" }, NOW + 2).world
    const pot = W.potView(w, "porto-weekend", "leo", NOW + 3)!
    render(<RefundSheet pot={pot} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "What you'd get back from Porto Weekend" })
    expect(rows(d)).toEqual(["You put in$0.00", "Your part of the spending$0.00", "You'd get back$0.00"])
    expect(d.querySelector("[data-refund-how]")!.textContent).toMatch(/^You haven't put money in yet/)
  })

  it("closing and closed Pots say so", () => {
    const pot = W.potView(spent(), "lisbon-trip", "sam", NOW + 2)!
    const d = sheet({ ...pot, status: "closing" })
    expect(within(d).getByText("If the group agrees to close, you'd get back")).toBeTruthy()
    cleanup()
    const c = sheet({ ...pot, status: "closed", closedAt: NOW + 3 })
    expect(within(c).getByText("When the Pot closed, you got back")).toBeTruthy()
    expect(rows(c)[2]).toBe("You got back$122.00")
    expect(c.querySelector("[data-refund-how]")!.textContent).toBe("What was left was split by how much each person put in.")
  })
})
