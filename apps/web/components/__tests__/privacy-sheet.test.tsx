// @vitest-environment jsdom
// "Who can see what" (?sheet=privacy; privacy audit 2026-11-02): two short lists (icon + words) and the line on
// invite and payment links, in plain words (the jargon lint covers en.json; this checks what renders). Calm: [Got it]
// is secondary, never marigold. Plus the record's visitor rows (visitorRow): no notes, no chosen names or pictures.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PrivacySheet } from "@/components/sheets/PrivacySheet"
import { findBanned } from "@/i18n/banned.mjs"
import { visitorRow, type RecordRow } from "@/lib/client/record"

afterEach(cleanup)

describe("PrivacySheet", () => {
  it("anyone vs only the Pot, each item an icon and words, then the links line", () => {
    const onClose = vi.fn()
    render(<PrivacySheet open onClose={onClose} />)
    const d = screen.getByRole("dialog", { name: "Who can see what" })
    const pub = within(d).getByRole("region", { name: "Anyone can see" })
    const mem = within(d).getByRole("region", { name: "Only people in this Pot can see" })
    const items = (el: HTMLElement) => within(el).getAllByRole("listitem").map((li) => li.textContent)
    expect(items(pub)).toEqual([
      "Money added and spent, and when",
      "The kind of each spend, like Groceries",
      "Which accounts are in the Pot",
      "The Pot's name and rules",
      "Who approved or declined each spend",
      "That a spend has a receipt",
      // gifts (hub 1.2.0, on in the mock build)
      "Money paid in from outside: how much, and which account sent it",
    ])
    expect(within(pub).getByText("It's on a public ledger that anyone can read.")).toBeTruthy()
    expect(items(mem)).toEqual([
      "The names and pictures people chose",
      "Notes on spends and reasons for a no",
      "Comments",
      "Receipts and their items",
      "Who a link to send money is for",
      "Your activity",
      "Asks for more money and why",
      "Notes on money paid in (on the public page only if they chose)",
    ])
    // every item has its icon (decorative), every heading too
    for (const li of d.querySelectorAll("li")) expect(li.querySelector("svg[aria-hidden='true']")).toBeTruthy()
    for (const h of d.querySelectorAll("h3")) expect(h.querySelector("svg[aria-hidden='true']")).toBeTruthy()
    expect(d.querySelector("[data-privacy-links]")!.textContent).toBe("Anyone with an invite or a link sees the Pot's name. A link to send money also shows who sent it and the amount.")
    expect(d.querySelector("[data-privacy-gifts]")!.textContent).toBe(
      "Money from outside: amounts and who sent it are public. Notes are seen by members, and on the public page only if the sender chose.",
    )
    // the optional first-run survey: the Pot team only (onboarding 2026-11-02)
    expect(d.querySelector("[data-privacy-survey]")!.textContent).toBe("Your answers to \u201cHelp us make Pot better\u201d are seen only by the Pot team, never by your groups.")
    // plain words only
    expect(findBanned(d.textContent ?? "")).toBeNull()
    const done = within(d).getByRole("button", { name: "Got it" })
    expect(done.className).not.toMatch(/bg-brand\b/)
    fireEvent.click(done)
    expect(onClose).toHaveBeenCalled()
  })

  it("closed: nothing rendered", () => {
    render(<PrivacySheet open={false} onClose={() => {}} />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("visitorRow (the record for someone not in the Pot)", () => {
  const person = (id: string, name: string) => ({ id, name, initials: name.slice(0, 1), joinIndex: 1, avatar: "pot-03" as const })
  const row: RecordRow = {
    id: 7,
    at: 1,
    person: person("maya.testnet", "Maya Chosen"),
    payee: person("u-7f3k2.users.pot.testnet", "Sam Chosen"),
    amount: 84_000_000n,
    category: "groceries",
    reason: "Surfboards for the beach day",
    approvedBy: "one_ok",
    okBy: person("leo.testnet", "Leo Chosen"),
    status: "paid",
    receipt: true,
  }
  const first = (a: string) => (a.startsWith("u-") ? null : a.charAt(0).toUpperCase() + a.slice(1, a.indexOf(".")))

  it("names from the account only (else 'A friend'), no pictures, the reason chip's word, the rest unchanged", () => {
    const v = visitorRow(row, first)
    expect(v.person).toEqual({ id: "maya.testnet", name: "Maya", initials: "M", joinIndex: 1, avatar: null })
    expect(v.payee).toMatchObject({ name: "A friend", avatar: null })
    expect(v.okBy).toMatchObject({ name: "Leo", avatar: null })
    expect(v.reason).toBe("groceries")
    expect(v).toMatchObject({ id: 7, amount: 84_000_000n, status: "paid", receipt: true, approvedBy: "one_ok" })
    expect(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x))).not.toMatch(/Chosen|Surfboards|pot-03/)
  })
})
