// @vitest-environment jsdom
// Every spend opens its details (the request sheet, 2026-11-02) over the mock data source, showcase seed: an instant
// spend says how it was approved (the Pot's rules), its status, and shows the receipt details saved with it: merchant
// · day, the total, "Converted from €32.25 at 1.0852 (…)", the items behind a toggle with tax and tip, "Read privately ·
// Check it yourself ↗", and "Receipt fingerprint matches" (icon + word) with "How does this work?". Edited details
// show the warning. A one-OK spend says who gave the OK. The feed's instant row is a button with "Receipt attached".
// Comments are there for every spend. Only the decision (or Done) can be marigold; this sheet adds none.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

import { RequestRow } from "@/components/pot/Feed"
import { ApproveSheet } from "@/components/sheets/ApproveSheet"
import * as store from "@/lib/client/mock/store"
import type { World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"
import { receiptDay } from "@/lib/receipt"

const WORLD_KEY = "pot.mock.world.v1"
const world = () => JSON.parse(localStorage.getItem(WORLD_KEY)!) as World
const potAs = (who: string) => W.potView(world(), "ski-chalet", who, Date.now())!

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("pot.mock.seed", "showcase")
  store.setSession("sam")
  store.resetWorld()
})
afterEach(() => cleanup())

function open(id: number, who = "sam") {
  render(<ApproveSheet pot={potAs(who)} requestId={id} onClose={() => {}} />)
  return screen.getByRole("dialog")
}
const marigolds = (d: HTMLElement) => [...d.querySelectorAll("button, a")].filter((b) => /(^|\s)bg-brand(\s|$)/.test(b.className))

describe("an instant spend's details", () => {
  it("how it was approved, its status, and no approval list (the Pot's rules approved it)", () => {
    const d = open(103)
    expect(screen.getByRole("dialog", { name: "Maya asked for $35" })).toBe(d)
    const status = d.querySelector<HTMLElement>("[data-approve-status]")!
    expect(status.textContent).toContain("Approved by Pot rules")
    expect(status.textContent).toContain("$35 was sent to Maya.")
    const facts = d.querySelector<HTMLElement>("[data-details-facts]")!
    expect(within(facts).getByText("Status")).toBeTruthy()
    expect(within(facts).getByText("Paid")).toBeTruthy()
    expect(facts.querySelector("[data-details-approved]")!.textContent).toBe("By the Pot's rules")
    expect(within(facts).queryByText("Pot after this")).toBeNull() // only while it's waiting
    expect(within(d).queryByRole("region", { name: /approvals/ })).toBeNull()
    // the explorer receipt and the comments are there for every spend
    expect(d.querySelector("[data-receipt]")).not.toBeNull()
    expect(within(d).getByRole("region", { name: /^Comments/ })).toBeTruthy()
    expect(marigolds(d)).toHaveLength(0)
  })

  it("the saved receipt: merchant · day, total, the conversion, the items behind a toggle, read privately + check link", () => {
    const d = open(103)
    const saved = W.savedReceiptFor(world(), "ski-chalet", 103, "sam")!
    const card = within(d).getByRole("region", { name: "Receipt" })
    expect(card.querySelector("[data-saved-receipt-title]")!.textContent).toBe(`Café du Col · ${receiptDay(saved.date!)}`)
    expect(card.querySelector("[data-saved-receipt-total]")!.textContent).toBe("€32.25")
    expect(card.querySelector("[data-saved-receipt-fx]")!.textContent).toBe(`Converted from €32.25 at 1.0852 (${receiptDay(saved.fx!.rateDate)})`)
    const list = card.querySelector<HTMLElement>("[data-saved-receipt-items]")!
    expect(list.hidden).toBe(true)
    const toggle = within(card).getByRole("button", { name: "Show 3 items" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(toggle)
    expect(list.hidden).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(toggle.textContent).toBe("Hide items")
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent)
    expect(items).toEqual(["Raclette for two€19.50", "Hot chocolate× 2€6.50", "Apple strudel€3.75", "Tax€2.70", "Tip€2.50"])
    const check = within(card).getByRole("link", { name: "Check where your receipt was read. Opens a new page." })
    expect(check.getAttribute("href")).toBe("https://cloud.near.ai/verify?model=z-ai%2Fglm-5.3-flash")
    expect(check.getAttribute("target")).toBe("_blank")
    expect(card.textContent).toContain("Read privately")
    expect(card.textContent).toContain(`Read on ${receiptDay(saved.readAt.slice(0, 10))}`)
    // never a photo
    expect(card.querySelector("img")).toBeNull()
  })

  it("the fingerprint matches (icon + word), and 'How does this work?' explains it in plain words", () => {
    const d = open(103)
    const fp = d.querySelector<HTMLElement>("[data-fingerprint]")!
    expect(fp.getAttribute("data-fingerprint")).toBe("match")
    expect(fp.textContent).toContain("Receipt fingerprint matches")
    expect(fp.querySelector("svg")).not.toBeNull()
    const how = within(fp).getByRole("button", { name: "How does this work?" })
    const panel = document.getElementById(how.getAttribute("aria-controls")!)!
    expect(panel.hidden).toBe(true)
    fireEvent.click(how)
    expect(panel.hidden).toBe(false)
    expect(panel.textContent).toContain("saved it with the spend itself, where nobody can change it")
    expect(panel.textContent).not.toMatch(/hash|SHA|chain|transaction/i)
  })

  it("edited details don't match the spend's fingerprint: a warning, not a check", () => {
    const d = open(103)
    expect(d.querySelector("[data-fingerprint]")!.getAttribute("data-fingerprint")).toBe("match")
    // someone edits the stored details (another tab writes the world)
    const w = world()
    w.receipts!["ski-chalet:103"] = { ...w.receipts!["ski-chalet:103"]!, merchant: "Café du Lac" }
    act(() => {
      localStorage.setItem(WORLD_KEY, JSON.stringify(w))
      window.dispatchEvent(new StorageEvent("storage", { key: WORLD_KEY }))
    })
    expect(d.querySelector("[data-saved-receipt-title]")!.textContent).toContain("Café du Lac")
    const fp = d.querySelector<HTMLElement>("[data-fingerprint]")!
    expect(fp.getAttribute("data-fingerprint")).toBe("mismatch")
    expect(fp.textContent).toContain("Receipt details changed")
    expect(fp.textContent).toContain("may have been edited")
  })
})

describe("other spends' details", () => {
  it("a one-OK spend says who gave the OK; no receipt card without saved details", () => {
    const d = open(104)
    expect(screen.getByRole("dialog", { name: "Leo asked for $180" })).toBe(d)
    expect(d.querySelector("[data-details-approved]")!.textContent).toBe("One OK by Sam")
    expect(d.querySelector("[data-saved-receipt]")).toBeNull()
    expect(within(d).getByRole("region", { name: /^Comments/ })).toBeTruthy()
  })

  it("a waiting request keeps the decision (Pot after this, Expires) and says Waiting / Not yet", () => {
    const d = open(105, "maya")
    const facts = d.querySelector<HTMLElement>("[data-details-facts]")!
    expect(within(facts).getByText("Waiting")).toBeTruthy()
    expect(facts.querySelector("[data-details-approved]")!.textContent).toBe("Not yet")
    expect(within(facts).getByText("Pot after this")).toBeTruthy()
    expect(within(facts).getByText("Expires")).toBeTruthy()
  })
})

describe("feed rows", () => {
  it("an instant spend's row is a button that opens its details, with 'Receipt attached'", () => {
    const pot = potAs("sam")
    const r = pot.feed.flatMap((f) => (f.kind === "request" ? [f.request] : [])).find((x) => x.id === 103)!
    render(
      <ul>
        <RequestRow r={r} now={Date.now()} />
      </ul>,
    )
    const button = screen.getByRole("button", { name: /Maya got \$35 back/ })
    expect(within(button).getByText("Receipt attached")).toBeTruthy()
    expect(button.querySelector("[data-receipt-indicator] svg")).not.toBeNull()
    // a spend without saved details has no mark
    cleanup()
    const plain = pot.feed.flatMap((f) => (f.kind === "request" ? [f.request] : [])).find((x) => x.id === 101)!
    render(
      <ul>
        <RequestRow r={plain} now={Date.now()} />
      </ul>,
    )
    expect(screen.getByRole("button", { name: /Maya got \$40 back/ }).querySelector("[data-receipt-indicator]")).toBeNull()
  })
})
