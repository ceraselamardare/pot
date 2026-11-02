// @vitest-environment jsdom
// Receipt links render only with a real hash (quiet text link, new tab, rel=noopener, a named purpose) and the
// activity rows carry them beside (never inside) the row's link.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ActivityList } from "@/components/activity/ActivityList"
import { YourActivity } from "@/components/activity/YourActivity"
import type { ActivityState } from "@/lib/client/data"
import { ExplorerAccountLink, ReceiptLink } from "@/components/receipt/ReceiptLink"
import type { ActivityItemVM } from "@/lib/client/activity"

afterEach(cleanup)

const state: { current: ActivityState } = { current: { state: "loading" } }
vi.mock("@/lib/client/data", () => ({ useMyActivity: () => state.current, useMeInfo: () => null }))
// gifts (hub 1.2.0): YourActivity merges the gifts I sent; none here
vi.mock("@/lib/client/gifts/data", () => ({ useMyGifts: () => [] }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

const HASH = "8tD1muMJ2AdDZsRc41MCJECrb77gv8ek9HXszTRsdw99"

describe("ReceiptLink", () => {
  it("links to the explorer in a new tab with an accessible name, never showing the hash", () => {
    render(<ReceiptLink txHash={HASH} what="Alex added $150" />)
    const a = screen.getByRole("link", { name: "Receipt for Alex added $150, opens the explorer" })
    expect(a.getAttribute("href")).toBe(`https://testnet.nearblocks.io/txns/${HASH}`)
    expect(a.getAttribute("target")).toBe("_blank")
    expect(a.getAttribute("rel")).toContain("noopener")
    expect(a.textContent).toBe("Receipt")
    expect(a.className).toContain("text-ink-muted")
    expect(a.className).not.toMatch(/bg-brand|text-brand/)
  })
  it("renders nothing without a real hash (optimistic / pending items)", () => {
    const { container } = render(
      <>
        <ReceiptLink txHash={undefined} what="x" />
        <ReceiptLink txHash="" what="x" />
        <ReceiptLink txHash="op_01J9ZZZ" what="x" />
      </>,
    )
    expect(container.querySelectorAll("a")).toHaveLength(0)
  })
  it("the Pot's explorer link points at its account", () => {
    render(<ExplorerAccountLink account="lisbon-trip.pots.x.testnet" label="View Lisbon Trip on the explorer, opens in a new tab" />)
    const a = screen.getByRole("link", { name: "View Lisbon Trip on the explorer, opens in a new tab" })
    expect(a.getAttribute("href")).toBe("https://testnet.nearblocks.io/address/lisbon-trip.pots.x.testnet")
    expect(a.textContent).toBe("View on explorer")
  })
})

describe("ActivityList", () => {
  const base = { slug: "lisbon-trip", potName: "Lisbon Trip", potEmoji: "🇵🇹", potCover: 0, actorId: "maya", actorName: "Maya" }
  const now = Date.UTC(2026, 10, 10, 15)
  it("rows link to the Pot at the item; the receipt sits beside the link, only where a hash exists", () => {
    const items: ActivityItemVM[] = [
      { ...base, key: "added:x", kind: "added", at: now - 60_000, amount: 150_000_000n, status: "sent", txHash: HASH },
      { ...base, key: "asked:lisbon-trip:4", kind: "asked", at: now - 120_000, amount: 300_000_000n, path: "vote", status: "needs", reason: "Tickets", requestId: 4 },
    ]
    render(<ActivityList items={items} meId="maya" now={now} linked />)
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy()
    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    const added = within(rows[0]!).getAllByRole("link")
    expect(added.map((l) => l.getAttribute("href"))).toEqual(["/p/lisbon-trip", `https://testnet.nearblocks.io/txns/${HASH}`])
    expect(added[0]!.contains(added[1]!)).toBe(false)
    expect(added[1]!.getAttribute("aria-label")).toBe("Receipt for You added $150, opens the explorer")
    expect(rows[0]!.textContent).toContain("Added money")
    // the row's name is the whole sentence; line 1 is short
    expect(added[0]!.getAttribute("aria-label")).toBe("You added $150. Lisbon Trip. 1 min ago")
    const asked = within(rows[1]!).getAllByRole("link")
    expect(asked.map((l) => l.getAttribute("href"))).toEqual(["/p/lisbon-trip?r=4"])
    expect(asked[0]!.getAttribute("aria-label")).toBe("You asked for $300 for Tickets. Waiting. Lisbon Trip. 2 min ago")
    expect(rows[1]!.querySelector("[data-row-title]")!.textContent).toBe("Tickets · Lisbon Trip")
    expect(rows[1]!.querySelector('[data-status="needs"]')!.textContent).toBe("Waiting")
    // a spend's receipt link is in its details sheet, not on the row
    expect(rows[1]!.querySelector("[data-receipt]")).toBeNull()
  })
})

describe("YourActivity states", () => {
  it("loading: a skeleton only after 150 ms", async () => {
    vi.useFakeTimers()
    try {
      state.current = { state: "loading" }
      const { container } = render(<YourActivity meId="maya" />)
      expect(container.querySelector("[data-activity-skeleton]")).toBeNull()
      await act(async () => {
        vi.advanceTimersByTime(200)
      })
      expect(container.querySelector("[data-activity-skeleton]")).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
  it("error: says so and offers Try again", () => {
    const retry = vi.fn()
    state.current = { state: "error", retry }
    render(<YourActivity meId="maya" />)
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your activity.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalled()
  })
  it("empty: what will show up here", () => {
    state.current = { state: "ready", items: [], hasMore: false, loadMore: () => {}, loadingMore: false }
    render(<YourActivity meId="maya" />)
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeTruthy()
  })
  it("more pages: Show more loads the next one", () => {
    const loadMore = vi.fn()
    const now = Date.now()
    state.current = {
      state: "ready",
      items: [{ key: "joined:a:maya", kind: "joined", at: now, slug: "a", potName: "A", potEmoji: "", potCover: 0, actorId: "maya", actorName: "Maya" }],
      hasMore: true,
      loadMore,
      loadingMore: false,
    }
    render(<YourActivity meId="maya" />)
    expect(screen.getByRole("link", { name: /^You joined/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    expect(loadMore).toHaveBeenCalled()
  })
})
