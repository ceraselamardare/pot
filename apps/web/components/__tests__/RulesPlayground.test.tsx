// @vitest-environment jsdom
// RulesPlayground (landing "Try the rules"): local state only. The 1.2 s beat, "Approved by Pot rules" + the one
// burst, the group path with "Approve as Leo" (no burst), the $200 per-person total, the balance floor, reduced
// motion and the single live region; and the round-2 motion contract (detail audit C1-C4): the result carries its
// own rolling "In the Pot" line, timer-driven states never change the layout (every state is reserved at the tap),
// the group path ends on the approval (no red ✕, focus on the result), focus moves never scroll, double taps are safe.
// Every state of a box is stacked in the DOM (RulesParts Layers): "shown" text is text outside aria-hidden layers.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { RulesPlayground } from "@/components/landing/home/RulesPlayground"

let reduced = false
beforeAll(() => {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes("reduced-motion") ? reduced : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
beforeEach(() => {
  reduced = false
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const hidden = (el: Element) => !!el.closest('[aria-hidden="true"]')

function setup() {
  const view = render(<RulesPlayground />)
  const q = <T extends Element>(sel: string) => view.container.querySelector<T>(sel)!
  /** elements with exactly this text that a person can see (not in an inactive, aria-hidden state) */
  const shownAll = (text: string) => screen.queryAllByText(text).filter((el) => !hidden(el))
  return {
    ...view,
    q,
    action: () => q<HTMLButtonElement>("[data-try-spend]"),
    spend: () => q<HTMLButtonElement>("[data-try-spend]"),
    balance: () => q("[data-try-balance]").textContent,
    stageBalance: () => view.container.querySelector("[data-try-stage-balance] [data-money]")?.textContent ?? null,
    live: () => q("[data-try-live]").textContent,
    preview: () => q("[data-rule-preview]"),
    capsule: () => q<HTMLElement>("[data-capsule]"),
    stage: () => q<HTMLElement>("[data-try-stage]"),
    layers: () => [...view.container.querySelectorAll("[data-try-stage] [data-layer]")].map((l) => l.getAttribute("data-layer")).join(","),
    burst: () => view.container.querySelector("[data-celebration]"),
    pick: (name: string) => fireEvent.click(screen.getByRole("radio", { name })),
    shown: (text: string) => shownAll(text).length > 0,
    reset: () => screen.queryByRole("button", { name: "Start over" }),
  }
}
type UI = ReturnType<typeof setup>

/** One instant spend, through the whole beat (1.2 s checking + 600 ms approved + the 500 ms count). */
function spendInstantly(ui: UI) {
  fireEvent.click(ui.spend())
  advance(1200)
  advance(600)
  advance(600)
}

/** $300 → Spend → (1.2 s) → Sent to the group. */
function askTheGroup(ui: UI) {
  ui.pick("$300")
  fireEvent.click(ui.spend())
  advance(1200)
}

describe("RulesPlayground", () => {
  it("server-renders the complete first state", () => {
    const html = renderToString(<RulesPlayground />)
    const text = html.replace(/<[^>]+>/g, "")
    for (const s of ["Lisbon Trip", "$450.00", "Groceries 🛒", "Boat trip ⛵", "$300", "This will be approved instantly", "Spend $84"])
      expect(text).toContain(s)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('data-try-stage="preview"')
  })

  it("within the rules: checking (1.2 s) → Approved by Pot rules + burst → $84 sent → $366.00", () => {
    const ui = setup()
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("instant")
    fireEvent.click(ui.spend())
    // the preview becomes the result in the same box
    expect(ui.stage().getAttribute("data-try-stage")).toBe("result")
    expect(ui.shown("Checking Pot rules…")).toBe(true)
    expect(ui.shown("This will be approved instantly")).toBe(false)
    advance(1199)
    expect(ui.shown("Approved by Pot rules")).toBe(false) // the beat is never cut short
    advance(1)
    expect(ui.shown("Approved by Pot rules")).toBe(true)
    expect(ui.shown("Under the $100 instant limit")).toBe(true)
    expect(ui.shown("Checking Pot rules…")).toBe(false)
    expect(ui.burst()).not.toBeNull()
    expect(ui.burst()!.getAttribute("aria-hidden")).toBe("true")
    expect(ui.live()).toBe("") // nothing is announced until the outcome
    advance(600)
    expect(ui.burst()).toBeNull() // once
    expect(ui.shown("$84 sent to you")).toBe(true)
    expect(ui.live()).toBe("Approved by Pot rules. $84 sent to you.")
    advance(600)
    expect(ui.balance()).toBe("$366.00")
    expect(ui.container.querySelector("[data-try-balance] [data-money]")!.className).toContain("tabular-nums")
  })

  it("over the limit: Sent to the group + why, 1 of 2 → the button becomes Approve as Leo → $150.00, no burst", () => {
    const ui = setup()
    ui.pick("$300")
    expect(ui.shown("This needs 2 of 3 approvals")).toBe(true)
    expect(ui.shown("It's over the $100 instant limit.")).toBe(true)
    fireEvent.click(ui.spend())
    advance(1200)
    expect(ui.burst()).toBeNull()
    expect(ui.shown("Sent to the group")).toBe(true)
    expect(ui.shown("It's over the $100 instant limit.")).toBe(true) // the why stays in the result
    expect(ui.shown("1 of 2 approvals")).toBe(true)
    expect(ui.shown("Leo gets a notification: Maya needs your OK.")).toBe(true)
    expect(ui.live()).toBe("Sent to the group. It's over the $100 instant limit. Your approval is counted. Waiting for 1 more.")
    // one request at a time: the action button is now Leo's, and nothing can be spent meanwhile
    expect(screen.queryByRole("button", { name: /^Spend/ })).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "$20" }))
    expect(screen.getByRole("radio", { name: "$300" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Approve as Leo" }))
    expect(ui.shown("Approved! $300 is on its way to Maya.")).toBe(true)
    expect(ui.shown("2 of 2 approvals")).toBe(true)
    expect(ui.shown("Approved by Maya and Leo")).toBe(true)
    expect(ui.shown("1 of 2 approvals")).toBe(false)
    expect(ui.burst()).toBeNull() // group approvals never burst
    expect(ui.live()).toBe("Approved! $300 is on its way to Maya.")
    advance(600)
    expect(ui.balance()).toBe("$150.00")
  })

  it("respects the $200 each person can spend without asking", () => {
    const ui = setup()
    spendInstantly(ui)
    spendInstantly(ui)
    expect(ui.balance()).toBe("$282.00")
    expect(ui.shown("You've used $168 of it.")).toBe(true) // the rule list keeps count
    // a third $84 is under the $100 limit but would take Maya to $252
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("vote")
    expect(screen.getByRole("radio", { name: "$84" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(ui.spend())
    advance(1200)
    expect(ui.burst()).toBeNull()
    expect(ui.shown("Sent to the group")).toBe(true)
    expect(ui.shown("It would take you over the $200 you can spend without asking ($168 used).")).toBe(true)
    expect(ui.live()).toContain("It would take you over the $200 you can spend without asking ($168 used).")
    fireEvent.click(screen.getByRole("button", { name: "Approve as Leo" }))
    advance(600)
    expect(ui.balance()).toBe("$198.00")
    // group-approved spends don't count toward the $200
    expect(ui.shown("You've used $168 of it.")).toBe(true)
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("vote")
  })

  it("never spends more than the Pot holds; tapping the blocked Spend shows why; Start over resets", () => {
    const ui = setup()
    askTheGroup(ui)
    fireEvent.click(screen.getByRole("button", { name: "Approve as Leo" }))
    advance(600)
    expect(ui.balance()).toBe("$150.00")
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("blocked")
    expect(ui.spend().getAttribute("aria-disabled")).toBe("true")
    // the result stays (no red ✕ next to "Approved!") until the visitor asks: then the preview says why
    expect(ui.shown("The Pot has $150.00")).toBe(false)
    fireEvent.click(ui.spend())
    expect(ui.stage().getAttribute("data-try-stage")).toBe("result") // still closing for one glide…
    expect(ui.shown("The Pot has $150.00")).toBe(true)
    expect(ui.shown("You can ask for up to $150.00.")).toBe(true)
    advance(300)
    expect(ui.stage().getAttribute("data-try-stage")).toBe("preview") // …then gone
    fireEvent.click(ui.spend())
    advance(2000)
    expect(ui.balance()).toBe("$150.00")
    fireEvent.click(screen.getByRole("button", { name: "Start over" }))
    expect(ui.balance()).toBe("$450.00") // snaps back, no count
    expect(ui.reset()).toBeNull() // hidden (and inert) until something changes again
    expect(screen.getByRole("radio", { name: "$84" }).getAttribute("aria-checked")).toBe("true")
    expect(ui.live()).toBe("")
  })

  it("reduced motion: no burst and the balance swaps instantly; the 1.2 s beat stays", () => {
    reduced = true
    const ui = setup()
    fireEvent.click(ui.spend())
    advance(1199)
    expect(ui.shown("Checking Pot rules…")).toBe(true)
    advance(1)
    expect(ui.shown("Approved by Pot rules")).toBe(true)
    expect(ui.burst()).toBeNull()
    advance(600)
    expect(ui.balance()).toBe("$366.00") // no roll
    expect(ui.stageBalance()).toBe("$366.00")
  })

  it("has one live region, real toggle buttons and a described Spend button", () => {
    const ui = setup()
    expect(ui.container.querySelectorAll("[aria-live]")).toHaveLength(1)
    const groceries = screen.getByRole("button", { name: "Groceries 🛒" })
    expect(groceries.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Boat trip ⛵" }))
    expect(groceries.getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByRole("radiogroup", { name: "How much?" })).toBeTruthy()
    const describedBy = ui.spend().getAttribute("aria-describedby")!
    expect(document.getElementById(describedBy)!.textContent).toContain("This will be approved instantly")
    // the picker is locked while the rules decide, and Spend stays described by the next spend's preview
    fireEvent.click(ui.spend())
    fireEvent.click(screen.getByRole("radio", { name: "$300" }))
    expect(ui.spend().textContent).toBe("Spend $84")
    expect(document.getElementById(ui.spend().getAttribute("aria-describedby")!)!.textContent).toContain("This will be approved instantly")
  })

  // --- round 2: motion contract (design-direction 04 §4, detail audit C1-C4) ---------------------------------

  it("C1: the result carries its own rolling In the Pot line (the top balance is often off-screen on a phone)", () => {
    const ui = setup()
    expect(ui.stageBalance()).toBeNull() // the preview has none
    fireEvent.click(ui.spend())
    expect(ui.stageBalance()).toBe("$450.00") // from the tap, so the change is seen where it happens
    advance(1200)
    advance(600)
    advance(600)
    expect(ui.stageBalance()).toBe("$366.00")
    // the e2e smoke test reads the top balance: it stays the only [data-try-balance]
    expect(ui.container.querySelectorAll("[data-try-balance] [data-money]")).toHaveLength(1)
  })

  it("C2: timer-driven states never change the layout: every state is reserved at the tap", () => {
    const ui = setup()
    // the preview box holds every preview variant (and the longest), so switching amounts never moves Spend
    const idle = ui.layers()
    expect(idle.split(",")).toEqual(expect.arrayContaining(["p:ok", "p:over_cap", "p:over_budget", "p:balance", "sizer"]))
    ui.pick("$300")
    ui.pick("$20")
    expect(ui.layers()).toBe(idle)
    // instant path: what is mounted at the tap is what stays through approved and sent
    ui.pick("$84")
    fireEvent.click(ui.spend())
    const atTap = ui.layers()
    advance(1200)
    expect(ui.layers()).toBe(atTap)
    advance(600)
    expect(ui.layers()).toBe(atTap)
    // the rule list's "You've used … of it." line exists from the start (invisible), so the card never moves
    // when it appears
    cleanup()
    const fresh = setup()
    const usedLine = fresh.container.querySelector("[data-rule='person'] p + p")!
    expect(usedLine).not.toBeNull()
    expect(usedLine.getAttribute("aria-hidden")).toBe("true")
    // group path: the same, through asked
    fireEvent.click(screen.getByRole("radio", { name: "$300" }))
    fireEvent.click(fresh.spend())
    const groupAtTap = fresh.layers()
    advance(1200)
    expect(fresh.layers()).toBe(groupAtTap)
  })

  it("C3/C4: the group path ends on the approval, with focus on the result, never on a disabled button, and no scroll", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    const ui = setup()
    askTheGroup(ui)
    const approve = screen.getByRole("button", { name: "Approve as Leo" })
    approve.focus() // a keyboard user
    fireEvent.click(approve)
    expect(ui.shown("Approved! $300 is on its way to Maya.")).toBe(true)
    expect(ui.shown("The Pot has $150.00")).toBe(false) // no red ✕ contradicting it
    expect(ui.spend().getAttribute("aria-disabled")).toBe("true") // $300 no longer fits
    expect(document.activeElement).toBe(ui.capsule())
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
    // Start over: its button goes away, so focus moves to Spend, again without scrolling
    const reset = screen.getByRole("button", { name: "Start over" })
    reset.focus()
    fireEvent.click(reset)
    expect(document.activeElement).toBe(ui.spend())
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  })

  it("is safe with double taps: one spend per double tap, and Leo's double tap keeps the result", () => {
    const ui = setup()
    fireEvent.click(ui.spend())
    fireEvent.click(ui.spend()) // the second tap of a double tap, while the rules check
    advance(1200)
    advance(600)
    advance(600)
    expect(ui.balance()).toBe("$366.00") // one $84, not two
    askTheGroup(ui)
    fireEvent.click(screen.getByRole("button", { name: "Approve as Leo" }))
    fireEvent.click(ui.action()) // lands on the button's next job (Spend $300, blocked) within 400 ms: ignored
    expect(ui.stage().getAttribute("data-try-stage")).toBe("result")
    expect(ui.shown("Approved! $300 is on its way to Maya.")).toBe(true)
    advance(600)
    expect(ui.balance()).toBe("$66.00")
  })

  it("Start over closes the result and resets the picker; a picker change after a result shows the new preview", () => {
    const ui = setup()
    expect(ui.reset()).toBeNull()
    spendInstantly(ui)
    expect(ui.reset()).not.toBeNull()
    expect(ui.stage().getAttribute("data-try-stage")).toBe("result")
    ui.pick("$300")
    expect(ui.shown("This needs 2 of 3 approvals")).toBe(true)
    expect(ui.shown("$84 sent to you")).toBe(false)
    advance(300)
    expect(ui.stage().getAttribute("data-try-stage")).toBe("preview")
    fireEvent.click(screen.getByRole("button", { name: "Start over" }))
    expect(ui.balance()).toBe("$450.00")
    expect(screen.getByRole("radio", { name: "$84" }).getAttribute("aria-checked")).toBe("true")
    expect(ui.shown("This will be approved instantly")).toBe(true)
  })
})
