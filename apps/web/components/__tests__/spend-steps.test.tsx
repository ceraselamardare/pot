// @vitest-environment jsdom
// The Spend sheet in two steps (2026-11-01 declutter): 1 "How much?" = amount + keypad + [Scan receipt] + the
// decision in one line (the why behind ⓘ: the rule, trust, what you'd get back); [Next] (the one marigold) is off at
// $0 and over the balance. 2 "What's it for?" = reason chips, who gets paid, note, the decision pinned over the ask,
// [Back] (ghost) keeps everything. A goal lock shows on step 1 before anyone types. A link can prefill the amount
// (?sheet=spend&amount=84) and open on step 2 (&step=details).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => nav.params }))
vi.mock("@/lib/client/receipts/read", async (orig) => ({ ...(await orig<typeof import("@/lib/client/receipts/read")>()), useReceiptsEnabled: () => true }))
vi.mock("@/lib/client/actions", () => ({ requestSpend: vi.fn() }))

import { SpendSheet } from "@/components/sheets/SpendSheet"
import { potView, seedWorld } from "@/lib/client/mock/world"
import type { PotVM } from "@/lib/client/mock/types"

const NOW = Date.UTC(2026, 10, 3, 12)
const pot = potView(seedWorld(NOW), "lisbon-trip", "maya", NOW)!

afterEach(cleanup)
beforeEach(() => {
  nav.params = new URLSearchParams()
})

function open(p: PotVM = pot) {
  render(<SpendSheet pot={p} open onClose={() => {}} />)
  return screen.getByRole("dialog", { name: `Spend from ${p.name}` })
}
const key = (d: HTMLElement, k: string) => fireEvent.click(within(d).getByRole("button", { name: k === "." ? "decimal point" : k, exact: true } as never))
const type = (d: HTMLElement, s: string) => [...s].forEach((c) => key(d, c))
const step = (d: HTMLElement) => Number(d.querySelector("[data-spend-body]")!.getAttribute("data-spend-body"))
const marigolds = (d: HTMLElement) => [...d.querySelectorAll("button")].filter((b) => /(^|\s)bg-brand(\s|$)/.test(b.className) && !(b as HTMLButtonElement).disabled)

describe("Spend: step 1, How much?", () => {
  it("amount, keypad, Scan receipt and the decision in one line; Next is the one marigold and waits for an amount", () => {
    const d = open()
    expect(step(d)).toBe(1)
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$0")
    expect(d.querySelector("[data-keypad]")).not.toBeNull()
    expect(within(d).getByRole("button", { name: "Scan receipt" })).toBeTruthy()
    expect(within(d).queryByRole("group", { name: "What's it for?" })).toBeNull() // that's step 2
    const next = within(d).getByRole("button", { name: "Next" }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(d.querySelector("[data-rule-preview='empty']")!.textContent).toContain("Anyone can spend up to $100 without asking.")

    type(d, "84")
    expect(next.disabled).toBe(false)
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Next"])
    const line = d.querySelector<HTMLElement>("[data-rule-preview='instant']")!
    expect(within(line).getByText("This will be approved instantly")).toBeTruthy()
    // the why is behind the ⓘ: the rule and what you'd get back
    const why = line.querySelector<HTMLElement>("[data-decision-why]")!
    expect(why.hidden).toBe(true)
    const more = within(line).getByRole("button", { name: "Why: more about this" })
    expect(more.querySelector("svg")).not.toBeNull()
    fireEvent.click(more)
    expect(more.getAttribute("aria-expanded")).toBe("true")
    expect(why.hidden).toBe(false)
    expect(within(why).getByText("Anyone can spend up to $100 without asking.")).toBeTruthy()
    expect(why.querySelector("[data-spend-refund]")!.textContent).toMatch(/^Once it's paid, you'd get back \$\d+ if the Pot closed\./)
  })

  it("over the instant limit says who decides; over the balance can't go on and says why", () => {
    const d = open()
    type(d, "300")
    expect(within(d).getByText("This needs 2 of 3 approvals")).toBeTruthy()
    type(d, "000")
    const blocked = d.querySelector<HTMLElement>("[data-rule-preview='blocked']")!
    expect(blocked.textContent).toContain("The Pot has $450.00")
    expect(blocked.textContent).toContain("You can ask for up to $450.00.") // the reason is shown, not hidden
    expect((within(d).getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("a goal that holds spending shows the lock up front: no Scan, the keypad off, Next says why", () => {
    const goal = { ...pot, goalDetail: { state: "collecting", spendsBlocked: true, amount: 1_200_000_000n, totalIn: 300_000_000n } } as unknown as PotVM
    const d = open(goal)
    const lock = d.querySelector<HTMLElement>("[data-rule-preview='blocked']")!
    expect(lock.textContent).toContain("Spending opens once the goal is reached")
    expect(lock.textContent).toContain("$300 of $1,200 collected so far.")
    expect(within(d).queryByRole("button", { name: "Scan receipt" })).toBeNull()
    expect((within(d).getByRole("button", { name: "8", exact: true } as never) as HTMLButtonElement).disabled).toBe(true)
    expect((within(d).getByRole("button", { name: "Spending opens once the goal is reached." }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("Spend: step 2, What's it for?", () => {
  it("Next → reason, who gets paid, note and the decision over the ask; its heading takes focus; Back keeps everything", async () => {
    const d = open()
    type(d, "84")
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    expect(step(d)).toBe(2)
    await waitFor(() => expect(document.activeElement?.textContent).toBe("What's it for?"))
    expect(d.querySelector("[data-step-live]")!.textContent).toBe("What's it for?")
    expect(d.querySelector("[data-spend-amount]")!.textContent).toBe("How much? $84")
    expect(d.querySelector("[data-keypad]")).toBeNull()
    expect(within(d).getByRole("radiogroup", { name: "Who gets paid?" })).toBeTruthy()
    expect(within(d).getByText("This will be approved instantly")).toBeTruthy()
    fireEvent.click(within(d).getByRole("button", { name: /Groceries/ }))
    fireEvent.click(within(d).getByRole("radio", { name: "A member" }))
    expect(within(d).getByRole("radiogroup", { name: "Who gets the money?" })).toBeTruthy()
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Send $84 to Sam"])
    const back = within(d).getByRole("button", { name: "Back" })
    expect(back.getAttribute("data-variant")).toBe("ghost")
    fireEvent.click(back)
    expect(step(d)).toBe(1)
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$84")
    fireEvent.click(within(d).getByRole("button", { name: "delete" }))
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    expect(within(d).getByRole("button", { name: /Groceries/ }).getAttribute("aria-pressed")).toBe("true")
    expect(within(d).getByRole("radio", { name: "A member" }).getAttribute("aria-checked")).toBe("true")
    expect(within(d).getByRole("button", { name: "Send $8 to Sam" })).toBeTruthy()
    await act(async () => {})
  })

  it("Enter on the keypad goes on to step 2", () => {
    const d = open()
    type(d, "20")
    fireEvent.keyDown(window, { key: "Enter" })
    expect(step(d)).toBe(2)
  })
})

describe("Spend: links", () => {
  it("?sheet=spend&amount=84 opens with $84 typed", () => {
    nav.params = new URLSearchParams("sheet=spend&amount=84")
    const d = open()
    expect(step(d)).toBe(1)
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$84")
  })

  it("&step=details with an amount opens on step 2; without one (or a bad one) on step 1", () => {
    nav.params = new URLSearchParams("sheet=spend&amount=12.5&step=details")
    let d = open()
    expect(step(d)).toBe(2)
    expect(within(d).getByRole("button", { name: "Get $12.50 back" })).toBeTruthy()
    cleanup()
    nav.params = new URLSearchParams("sheet=spend&amount=abc&step=details")
    d = open()
    expect(step(d)).toBe(1)
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$0")
  })
})
