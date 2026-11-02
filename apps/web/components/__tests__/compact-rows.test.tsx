// @vitest-environment jsdom
// The compact list row (2026-11-02, "rows got crowded"): line 1 "Maya · Food" + the signed amount, line 2 a status
// chip (icon + one word), an icon-only receipt mark, a comment count and the time. The explanations ("Under the $100
// instant limit", who approved) and the explorer receipt left the row for the details sheet; the row is one button
// whose name says everything in words. Mock showcase seed (Ski Chalet) + the classic Porto decline with comments.
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

import { ActivityFeed, RequestRow } from "@/components/pot/Feed"
import { rowLabel, rowWhen } from "@/components/pot/CompactRow"
import * as store from "@/lib/client/mock/store"
import type { World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

const WORLD_KEY = "pot.mock.world.v1"
const world = () => JSON.parse(localStorage.getItem(WORLD_KEY)!) as World
const NOW = Date.now()

function withComments(n: number, slug: string, requestId: number) {
  const w = world()
  w.comments = [...(w.comments ?? []), ...Array.from({ length: n }, (_, i) => ({ id: `t${slug}${requestId}${i}`, pot: slug, requestId, author: "sam", body: "hi", createdAt: NOW - 1000 }))]
  localStorage.setItem(WORLD_KEY, JSON.stringify(w))
}
const req = (slug: string, id: number, me = "leo") => W.requestView(world(), slug, id, me, NOW)!

function row(slug: string, id: number, props: { sentKey?: boolean; showPot?: boolean } = {}) {
  const { container } = render(
    <ul>
      <RequestRow r={req(slug, id)} now={NOW} {...props} />
    </ul>,
  )
  const li = container.querySelector("li")!
  return { li, button: within(li).getByRole("button") }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("pot.mock.seed", "showcase")
  store.setSession("leo")
  store.resetWorld()
})
afterEach(() => cleanup())

describe("a spend row", () => {
  it("instant + receipt + comments: short line 1, Instant chip, icon marks, and the whole story in its name", () => {
    withComments(2, "ski-chalet", 103)
    const r = req("ski-chalet", 103)
    const { li, button } = row("ski-chalet", 103)
    expect(li.querySelector("[data-row-title]")!.textContent).toBe("Maya · Food")
    const chip = li.querySelector("[data-status='instant']")!
    expect(chip.textContent).toBe("Instant")
    expect(chip.querySelector("svg")).not.toBeNull() // icon + word, never colour alone
    expect(li.querySelector("[data-receipt-indicator]")).not.toBeNull()
    expect(li.querySelector("[data-comment-count='2']")).not.toBeNull()
    expect(li.querySelector("[data-money]")!.textContent).toBe("− $35.00")
    expect(li.querySelector("[data-money]")!.className).toContain("tabular-nums")
    // the explanation and the explorer link live in the details sheet now
    expect(li.textContent).not.toContain("instant limit")
    expect(li.querySelector("[data-receipt]")).toBeNull()
    expect(button.getAttribute("aria-label")).toBe(
      `Maya got $35 back for food. Approved instantly by Pot rules. Receipt attached. 2 comments. ${rowWhen(r.decidedAt ?? r.createdAt, NOW).long}`,
    )
    // instant rows sit on the same surface as every row; the "Instant" chip says it
    expect(li.firstElementChild!.className).toContain("bg-surface")
    expect(li.firstElementChild!.className).not.toContain("bg-brand-soft")
  })

  it("no receipt, no comments: no marks", () => {
    const { li, button } = row("ski-chalet", 101)
    expect(li.querySelector("[data-row-title]")!.textContent).toBe("Maya · Groceries")
    expect(li.querySelector("[data-receipt-indicator]")).toBeNull()
    expect(li.querySelector("[data-comment-count]")).toBeNull()
    expect(button.getAttribute("aria-label")).not.toContain("Receipt attached")
    expect(button.getAttribute("aria-label")).not.toContain("comment")
  })

  it("approved by one OK: \"One OK\", and who gave it in the name", () => {
    const { li, button } = row("ski-chalet", 104)
    expect(li.querySelector("[data-row-title]")!.textContent).toBe("Leo · Stay")
    expect(li.querySelector("[data-status='approved']")!.textContent).toBe("One OK")
    expect(button.getAttribute("aria-label")).toMatch(/^\$180 sent to Leo for Chalet deposit\. Approved by Sam's OK\./)
  })

  it("waiting for one OK: the waiting chip, the plain amount, the expiry in the name", () => {
    const { li, button } = row("ski-chalet", 105)
    expect(li.querySelector("[data-status='needs']")!.textContent).toBe("Needs one OK")
    expect(li.querySelector("[data-money]")!.textContent).toBe("$250.00")
    expect(button.getAttribute("aria-label")).toMatch(/^Sam asks for \$250 for Lift passes\. Needs one OK\. Expires in 7 days\./)
  })

  it("declined: Declined chip, struck amount with \"Not sent\" in place of the time", () => {
    const { li, button } = row("porto-weekend", 11)
    expect(li.querySelector("[data-row-title]")!.textContent).toBe("Sam · Food")
    expect(li.querySelector("[data-status='declined']")!.textContent).toBe("Declined")
    expect(li.querySelector("[data-money]")!.className).toContain("line-through")
    expect(li.querySelector("[data-row-meta]")!.textContent).toContain("Not sent")
    expect(li.querySelector("[data-comment-count='2']")).not.toBeNull()
    expect(button.getAttribute("aria-label")).toMatch(/^Sam's request for \$120 wasn't approved\. Declined by Maya\. Not sent\. 2 comments\./)
  })

  it("just sent: the chip says Sent", () => {
    const { li } = row("ski-chalet", 101, { sentKey: true })
    expect(li.querySelector("[data-status='sent']")!.textContent).toBe("Sent")
  })

  it("across Pots: the reason, then the Pot (no name: they're all mine)", () => {
    const { li, button } = row("ski-chalet", 103, { showPot: true })
    expect(li.querySelector("[data-row-title]")!.textContent).toBe("Food · 🎿 Ski Chalet")
    expect(button.getAttribute("aria-label")).toContain("Ski Chalet")
  })
})

describe("the feed", () => {
  it("money in: a group named by its sentence, with its explorer receipt kept on the row", () => {
    const pot = W.potView(world(), "ski-chalet", "leo", NOW)!
    render(<ActivityFeed items={pot.feed} ops={[]} me={pot.me!.person} now={NOW} potName={pot.name} />)
    const added = screen.getAllByRole("group", { name: /^Leo added \$300/ })[0]!
    expect(added.querySelector("[data-row-title]")!.textContent).toBe("Leo · Added money")
    expect(added.querySelector("[data-money]")!.textContent).toBe("+ $300.00")
    expect(added.querySelector("[data-receipt]")).not.toBeNull()
    // system events stay quiet centred lines
    expect(screen.getByText("Leo joined")).toBeTruthy()
  })
})

describe("rowLabel", () => {
  it("joins the parts as short sentences and drops empty ones", () => {
    expect(rowLabel(["Maya got $35 back for food.", false, "Receipt attached", undefined, " ", "2 comments"])).toBe("Maya got $35 back for food. Receipt attached. 2 comments")
  })
})
