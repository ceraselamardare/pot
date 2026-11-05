// @vitest-environment jsdom
// hub 1.3.0 (HUB-4): a close the group approved stays "settling" until the money has left (PotView.close_settling).
// The Pot screen says so with an icon and words, without the Review button, and the menus say "Approved, sending
// everyone's share" instead of "Waiting for the group".
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

import { PotStateCard } from "@/components/pot/PotScreen"
import type { PotVM } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

afterEach(() => cleanup())
const pot = (over: Partial<PotVM>) => ({ ...W.potView(W.seedWorld(Date.now()), "lisbon-trip", "maya", Date.now())!, ...over })

describe("the close while it settles (HUB-4)", () => {
  it("approved, money on its way: icon + words, no Review", () => {
    const { container } = render(<PotStateCard pot={pot({ status: "closing", closeSettling: true })} />)
    const card = container.querySelector<HTMLElement>("[data-pot-closing='settling']")!
    expect(card.getAttribute("role")).toBe("status")
    expect(card.textContent).toContain("Everyone's share is on its way back")
    expect(card.querySelector("svg")).not.toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })
  it("still waiting for the group: the old card with Review", () => {
    const { container } = render(<PotStateCard pot={pot({ status: "closing" })} />)
    expect(container.querySelector("[data-pot-closing]")!.getAttribute("data-pot-closing")).not.toBe("settling")
    expect(container.textContent).toContain("This Pot is closing.")
  })
})
