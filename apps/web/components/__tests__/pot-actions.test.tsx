// @vitest-environment jsdom
// The Pot's action row (components/pot/PotActions): four round buttons with a label under each. Add money is the one
// marigold (neutral while an arrived deposit holds it); Spend, Ask (the chooser: Ask the group · Ask anyone, also in a
// Pot of one), More. An action that can't run says why (aria-disabled + description + a tap toasts it): closing, the
// goal lock. More opens ?sheet=more (Invite friends, Settings, Pot record, Who can see what, Close Pot), a list that
// swaps itself for the sheet picked. A closed Pot has no row; its header's ••• opens the list.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PotActions, PotMoreSheet } from "@/components/pot/PotActions"
import { PotHeader } from "@/components/pot/PotParts"
import * as store from "@/lib/client/mock/store"
import type { PotVM, World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

const replace = vi.fn()
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push: () => {}, replace }) }))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const world = (): World => JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as World
const pot = (me = "maya"): PotVM => W.potView(world(), "lisbon-trip", me, Date.now())!
const alone = (): PotVM => {
  const p = pot()
  return { ...p, members: p.members.slice(0, 1) }
}
const row = () => screen.getByRole("group", { name: "What you can do" })
const names = () => within(row()).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)
const why = (b: HTMLElement) => document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("pot.mock.seed", "classic")
  store.resetWorld()
  store.setSession("maya")
  vi.mocked(toast).mockClear()
  replace.mockClear()
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("the row", () => {
  it("Add money · Spend · Ask · More; Add money alone is marigold (eggplant icon), labels under circles", () => {
    render(<PotActions pot={pot()} />)
    expect(names()).toEqual(["Add money", "Spend", "Ask for money", "More options for Lisbon Trip"])
    const circles = [...row().querySelectorAll("[data-circle]")]
    expect(circles.map((c) => c.className.includes("bg-brand"))).toEqual([true, false, false, false])
    expect(circles[0]!.className).toContain("text-on-brand")
    // the visible labels; each accessible name starts with its label (WCAG 2.5.3)
    const labels = within(row()).getAllByRole("button").map((b) => b.querySelector("[data-circle] + span")!.textContent!)
    expect(labels).toEqual(["Add money", "Spend", "Ask", "More"])
    names().forEach((n, i) => expect(n!.startsWith(labels[i]!)).toBe(true))
    // icons: Lucide at stroke 2, hidden from the name
    for (const svg of row().querySelectorAll("svg")) expect(svg.getAttribute("stroke-width")).toBe("2")
    expect(row().querySelectorAll("[data-circle][aria-hidden='true']")).toHaveLength(4)
  })

  it("each opens its sheet (URL state)", async () => {
    const user = userEvent.setup()
    render(<PotActions pot={pot()} />)
    for (const [name, sheet] of [
      ["Add money", "add"],
      ["Spend", "spend"],
      ["Ask for money", "ask"],
      ["More options for Lisbon Trip", "more"],
    ] as const) {
      await user.click(screen.getByRole("button", { name }))
      expect(window.location.search).toBe(`?sheet=${sheet}`)
      window.history.replaceState(null, "", "/")
    }
  })

  it("while an arrived deposit holds the marigold, Add money is neutral: no marigold in the row", () => {
    render(<PotActions pot={pot()} addVariant="secondary" />)
    expect(row().querySelectorAll("[data-circle].bg-brand")).toHaveLength(0)
  })

  it("a Pot of one: slot 3 is still Ask (the row never reshuffles); Invite friends is More's first row", async () => {
    const user = userEvent.setup()
    render(<PotActions pot={alone()} />)
    expect(names()).toEqual(["Add money", "Spend", "Ask for money", "More options for Lisbon Trip"])
    await user.click(screen.getByRole("button", { name: "Ask for money" }))
    expect(window.location.search).toBe("?sheet=ask")
    cleanup()
    render(<PotMoreSheet pot={alone()} open onClose={() => {}} />)
    const sheet = screen.getByRole("dialog", { name: "More options" })
    expect(sheet.querySelector("[data-more]")!.getAttribute("data-more")).toBe("invite")
  })

  it("the goal lock: Spend is off, says why and toasts it; nothing opens", async () => {
    const user = userEvent.setup()
    render(<PotActions pot={pot()} spendBlocked="Spending opens once the goal is reached." />)
    const spend = screen.getByRole("button", { name: "Spend" })
    expect(spend.getAttribute("aria-disabled")).toBe("true")
    expect(spend.getAttribute("data-spend-blocked")).toBe("goal")
    expect(why(spend)).toBe("Spending opens once the goal is reached.")
    await user.click(spend)
    expect(toast).toHaveBeenCalledWith("Spending opens once the goal is reached.")
    expect(window.location.search).toBe("")
    // Add money still works
    expect(screen.getByRole("button", { name: "Add money" }).getAttribute("aria-disabled")).toBeNull()
  })

  it("closing: Add money, Spend and Ask are off with the closing line; More still opens", async () => {
    const user = userEvent.setup()
    render(<PotActions pot={{ ...pot(), status: "closing" }} />)
    for (const name of ["Add money", "Spend", "Ask for money"]) {
      const b = screen.getByRole("button", { name })
      expect(b.getAttribute("aria-disabled")).toBe("true")
      expect(why(b)).toBe("This Pot is closing. Adding money and spending are paused.")
    }
    await user.click(screen.getByRole("button", { name: "Add money" }))
    expect(toast).toHaveBeenCalledWith("This Pot is closing. Adding money and spending are paused.")
    await user.click(screen.getByRole("button", { name: "More options for Lisbon Trip" }))
    expect(window.location.search).toBe("?sheet=more")
  })

  it("keyboard: Tab reaches each action in order, Enter opens it", async () => {
    const user = userEvent.setup()
    render(<PotActions pot={pot()} />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add money" }))
    await user.tab()
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More options for Lisbon Trip" }))
    await user.keyboard("{Enter}")
    expect(window.location.search).toBe("?sheet=more")
  })
})

describe("More", () => {
  it("the list: Invite friends, Settings, Pot record, Who can see what, Close Pot; no marigold, no Gifts, no Ask", () => {
    render(<PotMoreSheet pot={pot()} open onClose={() => {}} />)
    const sheet = screen.getByRole("dialog", { name: "More options" })
    const items = [...sheet.querySelectorAll("[data-more]")].map((b) => b.getAttribute("data-more"))
    expect(items).toEqual(["invite", "settings", "record", "privacy", "close"])
    expect(within(sheet).getByRole("button", { name: /Close Pot/ }).textContent).toContain("Ask the group to end it and share out what's left")
    expect(within(sheet).getByRole("button", { name: /Settings/ }).textContent).toContain("Rules, money from outside, people")
    expect(sheet.querySelector(".bg-brand")).toBeNull()
    expect(within(sheet).queryByRole("button", { name: /^(Gifts|Ask)/ })).toBeNull()
  })

  it("Settings closes the sheet onto the Settings tab (no sheet left in the address)", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/p/lisbon-trip?sheet=more")
    render(<PotMoreSheet pot={pot()} open onClose={() => {}} />)
    await user.click(screen.getByRole("button", { name: /Settings/ }))
    expect(window.location.search).toBe("?tab=settings")
  })

  it("picking a sheet swaps it in the same history entry; the record replaces it", async () => {
    const user = userEvent.setup()
    window.history.pushState({ potSheet: 1 }, "", "/p/lisbon-trip?sheet=more")
    const depth = window.history.length
    render(<PotMoreSheet pot={pot()} open onClose={() => {}} />)
    await user.click(screen.getByRole("button", { name: /Invite friends/ }))
    expect(window.location.search).toBe("?sheet=share")
    expect(window.history.length).toBe(depth)
    expect((window.history.state as { potSheet?: number }).potSheet).toBe(1)
    await user.click(screen.getByRole("button", { name: /Pot record/ }))
    expect(replace).toHaveBeenCalledWith("/p/lisbon-trip/record")
  })

  it("a closed Pot: no row; the header's ••• opens the same list, with 'See who got what'", async () => {
    const user = userEvent.setup()
    const closed: PotVM = { ...pot(), status: "closed" }
    render(<PotHeader pot={closed} />)
    await user.click(screen.getByRole("button", { name: "More options for Lisbon Trip" }))
    expect(window.location.search).toBe("?sheet=more")
    cleanup()
    render(<PotMoreSheet pot={closed} open onClose={() => {}} />)
    expect(screen.getByRole("button", { name: "See who got what" })).toBeTruthy()
    cleanup()
    // an open Pot's header has no ••• (it's in the row)
    render(<PotHeader pot={pot()} />)
    await waitFor(() => expect(screen.queryByRole("button", { name: /More options/ })).toBeNull())
  })
})
