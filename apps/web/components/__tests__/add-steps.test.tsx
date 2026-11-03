// @vitest-environment jsdom
// The Add money sheet in two steps (2026-11-03, like Spend): 1 "How much?" = the amount, the keypad, the Pot's
// suggestion chips, the $10,000 limit, [Next] (the one marigold); 2 "How do you want to add it?" (&step=source, its own
// history entry) = the amount (+ Change), the source list (Demo dollars · Pot dollars + Use all · Another app or
// exchange), "Pot will have" + "you'd get back" pinned over [Add $X] / [Continue], [Back]. A linked amount opens
// straight on step 2; a cold &step=source with nothing to add is corrected to step 1.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

// a URL the sheet can watch: push/replace/popstate re-render it, like Next's useSearchParams
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  const subscribe = (cb: () => void) => {
    window.addEventListener("test:url", cb)
    window.addEventListener("popstate", cb)
    return () => {
      window.removeEventListener("test:url", cb)
      window.removeEventListener("popstate", cb)
    }
  }
  return {
    useRouter: () => ({ replace: () => {}, push: () => {} }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  }
})
const addMoney = vi.hoisted(() => vi.fn(() => "h"))
vi.mock("@/lib/client/actions", () => ({ addMoney }))
const own = vi.hoisted(() => ({ value: 0n as bigint }))
vi.mock("@/lib/client/data", () => ({ useOwnDollars: () => own.value }))

import { AddMoneySheet } from "@/components/sheets/AddMoneySheet"
import type { AddSource } from "@/lib/client/machines/add-flow"
import type { PotVM } from "@/lib/client/mock/types"
import { potView, seedWorld } from "@/lib/client/mock/world"

const NOW = Date.UTC(2026, 10, 3, 12)
const pot = potView(seedWorld(NOW), "lisbon-trip", "maya", NOW)!

beforeAll(() => {
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = window.history[m].bind(window.history)
    window.history[m] = (...a: Parameters<History["pushState"]>) => {
      orig(...a)
      window.dispatchEvent(new Event("test:url"))
    }
  }
})
afterEach(() => {
  cleanup()
  addMoney.mockClear()
  own.value = 0n
  window.history.replaceState(null, "", "/")
})

function Harness({ p, onClose }: { p: PotVM; onClose: () => void }) {
  const [typed, setTyped] = useState<string | null>(null)
  const [source, setSource] = useState<AddSource>("demo")
  const prefill = new URLSearchParams(window.location.search).get("amount")
  return <AddMoneySheet pot={p} open onClose={onClose} prefill={prefill} typed={typed} onTyped={setTyped} source={source} onSource={setSource} />
}
/** Open the sheet at `url` (pushed like openSheet, depth 1). */
function open(url = "/p/lisbon-trip?sheet=add", p: PotVM = pot, onClose = () => {}) {
  window.history.pushState({ potSheet: 1 }, "", url)
  render(<Harness p={p} onClose={onClose} />)
  return screen.getByRole("dialog", { name: `Add money to ${p.name}` })
}
const key = (d: HTMLElement, k: string) => fireEvent.click(within(d).getByRole("button", { name: k === "." ? "decimal point" : k, exact: true } as never))
const type = (d: HTMLElement, s: string) => [...s].forEach((c) => key(d, c))
const step = (d: HTMLElement) => Number(d.querySelector("[data-add-body]")!.getAttribute("data-add-body"))
const marigolds = (d: HTMLElement) => [...d.querySelectorAll("button")].filter((b) => /(^|\s)bg-brand(\s|$)/.test(b.className) && !(b as HTMLButtonElement).disabled)
const search = () => new URLSearchParams(window.location.search)

describe("Add money: step 1, How much?", () => {
  it("the amount, the keypad and the suggestions; Next is the one marigold and waits for an amount", () => {
    const d = open()
    expect(step(d)).toBe(1)
    expect(within(d).getByText("How much?")).toBeTruthy()
    expect(d.querySelector("[data-keypad]")).not.toBeNull()
    expect(within(d).queryByRole("radiogroup")).toBeNull() // the source is step 2
    expect(d.querySelector("[data-add-after]")).toBeNull()
    const chips = within(d).getByRole("group", { name: "Amount in dollars" })
    expect(within(chips).getByRole("button", { name: "$50" })).toBeTruthy()
    const next = within(d).getByRole("button", { name: "Next" }) as HTMLButtonElement
    if (d.querySelector("[data-amount-display]")!.textContent === "$0") expect(next.disabled).toBe(true)
    fireEvent.click(within(chips).getByRole("button", { name: "$50" }))
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$50")
    expect(next.disabled).toBe(false)
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Next"])
  })

  it("Enter on the keypad goes on to step 2", () => {
    const d = open()
    type(d, "20")
    fireEvent.keyDown(window, { key: "Enter" })
    expect(step(d)).toBe(2)
  })
})

describe("Add money: step 2, How do you want to add it?", () => {
  it("Next pushes &step=source; its heading takes focus; the outcome sits over the ask; Back keeps the amount", async () => {
    const d = open()
    const depth = window.history.length
    type(d, "40")
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    expect(step(d)).toBe(2)
    expect(search().get("step")).toBe("source")
    expect(window.history.length).toBe(depth + 1) // its own history entry
    await waitFor(() => expect(document.activeElement?.textContent).toBe("How do you want to add it?"))
    expect(d.querySelector("[data-step-live]")!.textContent).toBe("How do you want to add it?")
    expect(d.querySelector("[data-add-amount]")!.textContent).toBe("How much? $40")
    expect(d.querySelector("[data-keypad]")).toBeNull()
    const group = within(d).getByRole("radiogroup", { name: "How do you want to add it?" })
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"])
    expect(d.querySelector("[data-add-after]")!.textContent).toBe("Lisbon Trip will have $490.00.")
    expect(d.querySelector("[data-add-refund]")!.textContent).toMatch(/^After this, you'd get back \$[\d,]+ if the Pot closed\.$/)
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Add $40"])
    expect(within(d).getByRole("button", { name: "Back" }).getAttribute("data-variant")).toBe("ghost")

    // the in-sheet Back is the browser's Back: one entry back, the amount kept, then Next again
    fireEvent.click(within(d).getByRole("button", { name: "Back" }))
    await waitFor(() => expect(step(d)).toBe(1))
    expect(search().get("step")).toBeNull()
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$40")
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    expect(step(d)).toBe(2)
    await act(async () => {})
  })

  it("Add $X adds demo dollars and closes", () => {
    const onClose = vi.fn()
    const d = open("/p/lisbon-trip?sheet=add", pot, onClose)
    type(d, "25")
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    fireEvent.click(within(d).getByRole("button", { name: "Add $25" }))
    expect(addMoney).toHaveBeenCalledWith(pot, 25_000_000n, "maya", { source: "demo" })
    expect(onClose).toHaveBeenCalled()
  })

  it("Pot dollars: Use all fills every last bit; more than you have says so and the ask waits", () => {
    own.value = 84_000_000n
    const d = open()
    type(d, "100")
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    fireEvent.click(within(d).getByRole("radio", { name: /^Pot dollars you have · \$84\.00/ }))
    expect(within(d).getByRole("alert").textContent).toBe("You have $84.00 in Pot dollars. Add up to $84.00, or choose another way.")
    expect((within(d).getByRole("button", { name: "Add $100" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(d).getByRole("button", { name: "Use all $84.00" }))
    expect(d.querySelector("[data-add-amount]")!.textContent).toBe("How much? $84.00")
    expect(within(d).queryByRole("alert")).toBeNull()
    fireEvent.click(within(d).getByRole("button", { name: "Add $84" }))
    expect(addMoney).toHaveBeenCalledWith(pot, 84_000_000n, "maya", { source: "pot_dollars" })
  })

  it("none of your own: that source can't be picked", () => {
    const d = open()
    type(d, "10")
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    const row = within(d).getByRole("radio", { name: /^Pot dollars you have · \$0\.00/ })
    expect(row.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(row)
    expect(row.getAttribute("aria-checked")).toBe("false")
  })

  it("Another app or exchange: [Continue] (the one marigold) goes on to the network step with the amount", () => {
    const d = open()
    type(d, "100")
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    fireEvent.click(within(d).getByRole("radio", { name: /Another app or exchange/ }))
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Continue"])
    expect(within(d).queryByRole("button", { name: "Add $100" })).toBeNull()
    fireEvent.click(within(d).getByRole("button", { name: "Continue" }))
    expect(search().get("src")).toBe("xc")
    expect(search().get("amount")).toBe("100")
    expect(search().get("step")).toBe("source") // the network's Back returns to this step
    expect(addMoney).not.toHaveBeenCalled()
  })
})

describe("Add money: links", () => {
  it("?amount=150 (Add my $150 share, a top-up's Add) opens on step 2, in the same history entry; Change reaches step 1", async () => {
    const before = window.history.length
    const d = open("/p/lisbon-trip?sheet=add&amount=150")
    expect(step(d)).toBe(2)
    await waitFor(() => expect(search().get("step")).toBe("source"))
    expect(window.history.length).toBe(before + 1) // replaced, not pushed: the browser's Back still leaves the sheet
    expect(d.querySelector("[data-add-amount]")!.textContent).toBe("How much? $150")
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Add $150"])
    fireEvent.click(within(d).getByRole("button", { name: "Change the amount" }))
    await waitFor(() => expect(step(d)).toBe(1))
    expect(search().get("step")).toBeNull()
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$150")
  })

  it("a cold &step=source with nothing to add opens on step 1 and the URL says so", async () => {
    const d = open("/p/lisbon-trip?sheet=add&step=source")
    expect(step(d)).toBe(1)
    await waitFor(() => expect(search().get("step")).toBeNull())
    cleanup()
    const bad = open("/p/lisbon-trip?sheet=add&amount=abc&step=source")
    expect(step(bad)).toBe(1)
  })
})
