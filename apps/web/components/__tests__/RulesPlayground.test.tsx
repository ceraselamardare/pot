// @vitest-environment jsdom
// RulesPlayground (landing "Try the rules"): local state only, on the rules a Pot made today starts with ($100 at a
// time, $200 per person, trust on, one OK up to $300, the group's majority above that). Its three roads: inside the
// rules (the 1.2 s beat, "Approved by Pot rules" + the one burst), one OK for the $300 ("OK $300 as Leo", the app's
// words, no burst) and the group for the $400 ("Approve as Leo", 2 of 3, no burst); earned trust as the hub counts it
// (one line when it grows); the $200 per-person total, the balance floor, reduced motion and the single live region;
// and the round-2 motion contract (detail audit C1-C4): the result carries its own rolling "In the Pot" line,
// timer-driven states never change the layout (every state is reserved at the tap), Leo's road ends on the approval
// (no red ✕, focus on the result), focus moves never scroll, double taps are safe.
// Every state of a box is stacked in the DOM (RulesParts Layers): "shown" text is text outside aria-hidden layers.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { RulesPlayground, settleTrust } from "@/components/landing/home/RulesPlayground"
import { dollars } from "@/lib/client/money"

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
const TRUSTED = "Trust grows: you can now spend up to $200 at a time without asking."
const VERY_TRUSTED = "Trust grows: you can now spend up to $300 at a time without asking."

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
    /** the rules the list highlights (the deciding ones) */
    active: () => [...view.container.querySelectorAll("[data-rule][data-active]")].map((l) => l.getAttribute("data-rule")),
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

/** $300 → Spend → (1.2 s) → waiting for one OK. */
function askForOneOk(ui: UI) {
  ui.pick("$300")
  fireEvent.click(ui.spend())
  advance(1200)
}

describe("RulesPlayground", () => {
  it("server-renders the complete first state, with a new Pot's rules", () => {
    const html = renderToString(<RulesPlayground />)
    const text = html.replace(/<[^>]+>/g, "")
    for (const s of [
      "Lisbon Trip",
      "$450.00",
      "Groceries 🛒",
      "Boat trip ⛵",
      "$300",
      "$400",
      "This will be approved instantly",
      "Spend $84",
      "Anyone can spend up to $100 without asking.",
      "Spends up to $300 need just one OK from someone else who has added money.",
      "Bigger spends need 2 of 3 approvals.",
      "Each person can spend up to $200 in total without asking.",
    ])
      expect(text).toContain(s)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('data-try-stage="preview"')
  })

  it("within the rules: checking (1.2 s) → Approved by Pot rules + burst → $84 sent → $366.00", () => {
    const ui = setup()
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("instant")
    expect(ui.active()).toEqual(["instant"])
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

  it("one OK ($300): the app's one-OK words, the button becomes OK $300 as Leo → Approved by Leo's OK → $150.00, no burst", () => {
    const ui = setup()
    ui.pick("$300")
    expect(ui.preview().getAttribute("data-tier")).toBe("one_ok")
    expect(ui.shown("This needs one OK from someone else who has added money")).toBe(true)
    expect(ui.shown("It's over your $100 instant limit.")).toBe(true)
    expect(ui.active()).toEqual(["oneok"])
    fireEvent.click(ui.spend())
    advance(1200)
    expect(ui.burst()).toBeNull()
    expect(ui.shown("Sent")).toBe(true)
    expect(ui.shown("One OK from someone else who has added money and it's paid.")).toBe(true)
    expect(ui.shown("Needs one OK")).toBe(true)
    expect(ui.shown("Leo gets a notification: Maya needs one OK.")).toBe(true)
    expect(ui.live()).toBe("Sent. It's over your $100 instant limit. Waiting for one OK. Anyone else in the group who has added money can OK it.")
    // one request at a time: the action button is now Leo's, and nothing can be spent meanwhile
    expect(screen.queryByRole("button", { name: /^Spend/ })).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "$20" }))
    expect(screen.getByRole("radio", { name: "$300" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "OK $300 as Leo" }))
    expect(ui.shown("Approved by Leo's OK")).toBe(true)
    expect(ui.shown("$300 was sent to Maya.")).toBe(true)
    expect(ui.shown("One OK")).toBe(true)
    expect(ui.shown("Leo · gave the OK")).toBe(true)
    expect(ui.shown("Needs one OK")).toBe(false)
    expect(ui.burst()).toBeNull() // an OK never bursts
    expect(ui.live()).toBe("Approved by Leo's OK. $300 was sent to Maya.")
    advance(600)
    expect(ui.balance()).toBe("$150.00")
  })

  it("the group ($400): Sent to the group + why, 1 of 2 → Approve as Leo → 2 of 2 → $50.00, no burst", () => {
    const ui = setup()
    ui.pick("$400")
    expect(ui.preview().getAttribute("data-tier")).toBe("group")
    expect(ui.shown("This needs 2 of 3 approvals")).toBe(true)
    expect(ui.shown("It's over the $100 instant limit.")).toBe(true)
    expect(ui.active()).toEqual(["group"])
    fireEvent.click(ui.spend())
    advance(1200)
    expect(ui.burst()).toBeNull()
    expect(ui.shown("Sent to the group")).toBe(true)
    expect(ui.shown("It's over the $100 instant limit.")).toBe(true) // the why stays in the result
    expect(ui.shown("1 of 2 approvals")).toBe(true)
    expect(ui.shown("Leo gets a notification: Maya needs your OK.")).toBe(true)
    expect(ui.live()).toBe("Sent to the group. It's over the $100 instant limit. Your approval is counted. Waiting for 1 more.")
    expect(screen.queryByRole("button", { name: /^Spend/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^OK/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Approve as Leo" }))
    expect(ui.shown("Approved! $400 is on its way to Maya.")).toBe(true)
    expect(ui.shown("2 of 2 approvals")).toBe(true)
    expect(ui.shown("Approved by Maya and Leo")).toBe(true)
    expect(ui.shown("1 of 2 approvals")).toBe(false)
    expect(ui.burst()).toBeNull() // group approvals never burst
    expect(ui.live()).toBe("Approved! $400 is on its way to Maya.")
    advance(600)
    expect(ui.balance()).toBe("$50.00")
  })

  it("respects the $200 each person can spend without asking: a third $84 needs one OK", () => {
    const ui = setup()
    spendInstantly(ui)
    spendInstantly(ui)
    expect(ui.balance()).toBe("$282.00")
    expect(ui.shown("You've used $168 of it.")).toBe(true) // the rule list keeps count
    // a third $84 is under the $100 limit but would take Maya to $252: one OK, and the per-person rule says why
    // (touching the picker brings the preview back in place of the finished result)
    ui.pick("$84")
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("vote")
    expect(ui.preview().getAttribute("data-tier")).toBe("one_ok")
    expect(ui.shown("It would take you over the $200 you can spend without asking ($168 used).")).toBe(true)
    expect(ui.active()).toEqual(["oneok", "person"])
    expect(screen.getByRole("radio", { name: "$84" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(ui.spend())
    advance(1200)
    expect(ui.burst()).toBeNull()
    expect(ui.shown("Needs one OK")).toBe(true)
    expect(ui.live()).toContain("It would take you over the $200 you can spend without asking ($168 used).")
    fireEvent.click(screen.getByRole("button", { name: "OK $84 as Leo" }))
    advance(600)
    expect(ui.balance()).toBe("$198.00")
    // spends someone OK'd don't count toward the $200 (D-07), so the next $84 still needs one
    expect(ui.shown("You've used $168 of it.")).toBe(true)
    expect(ui.preview().getAttribute("data-tier")).toBe("one_ok")
  })

  it("trust grows as the hub counts it: the 3rd paid spend (a one-OK one counts too) raises Maya's limit, in one line", () => {
    const ui = setup()
    spendInstantly(ui) // $84
    askForOneOk(ui) // $300
    fireEvent.click(screen.getByRole("button", { name: "OK $300 as Leo" }))
    advance(600)
    expect(screen.queryAllByText(/^Trust grows/)).toHaveLength(0) // only the spend that raises it has the line
    expect(ui.live()).toBe("Approved by Leo's OK. $300 was sent to Maya.")
    // the third paid spend: its line is reserved (hidden) from the tap and shows once the money moved
    ui.pick("$20")
    fireEvent.click(ui.spend())
    expect(screen.queryAllByText(TRUSTED)).toHaveLength(1)
    expect(ui.shown(TRUSTED)).toBe(false)
    advance(1200)
    expect(ui.shown(TRUSTED)).toBe(false)
    advance(600)
    expect(ui.shown(TRUSTED)).toBe(true)
    expect(ui.live()).toBe(`Approved by Pot rules. $20 sent to you. ${TRUSTED}`)
    advance(600)
    expect(ui.balance()).toBe("$46.00")
  })

  it("trust: the app's words for Maya's bigger limit, up to $300; the $200 she can spend without asking still caps it", () => {
    const ui = setup()
    ui.pick("$20")
    for (let i = 0; i < 3; i++) spendInstantly(ui)
    expect(ui.shown(TRUSTED)).toBe(true)
    ui.pick("$300")
    expect(ui.shown("It's over your $200 instant limit.")).toBe(true)
    ui.pick("$84")
    expect(ui.shown("You can spend up to $200 without asking.")).toBe(true)
    ui.pick("$20")
    for (let i = 0; i < 3; i++) spendInstantly(ui)
    expect(ui.shown(VERY_TRUSTED)).toBe(true)
    expect(ui.balance()).toBe("$330.00")
    // $300 at a time now, but she has used $120 of her $200: a $300 still needs one OK, for that reason
    ui.pick("$300")
    expect(ui.preview().getAttribute("data-tier")).toBe("one_ok")
    expect(ui.shown("It would take you over the $200 you can spend without asking ($120 used).")).toBe(true)
    expect(ui.active()).toEqual(["oneok", "person"])
    // the most trust a Pot gives: a 7th paid spend has no line; Start over starts Maya again
    ui.pick("$20")
    spendInstantly(ui)
    expect(screen.queryAllByText(/^Trust grows/)).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Start over" }))
    ui.pick("$300")
    expect(ui.shown("It's over your $100 instant limit.")).toBe(true)
  })

  it("settleTrust: a paid spend of a tenth of the instant limit or more counts; every 3rd raises a level, up to 2", () => {
    let tr = { level: 0, streak: 0 }
    expect(settleTrust(tr, dollars(9))).toEqual(tr) // under $10: not counted
    for (const level of [0, 0, 1, 1, 1, 2, 2, 2, 2]) {
      tr = settleTrust(tr, dollars(10))
      expect(tr.level).toBe(level)
    }
    expect(tr.streak).toBe(3) // saturates at the top
  })

  it("never spends more than the Pot holds; tapping the blocked Spend shows why; Start over resets", () => {
    const ui = setup()
    askForOneOk(ui)
    fireEvent.click(screen.getByRole("button", { name: "OK $300 as Leo" }))
    advance(600)
    expect(ui.balance()).toBe("$150.00")
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("blocked")
    expect(ui.spend().getAttribute("aria-disabled")).toBe("true")
    // the result stays (no red ✕ next to "Approved by Leo's OK") until the visitor asks: then the preview says why
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
    // the group's $400 only fits a Pot that still holds it
    spendInstantly(ui)
    ui.pick("$400")
    expect(ui.preview().getAttribute("data-rule-preview")).toBe("blocked")
    expect(ui.shown("The Pot has $366.00")).toBe(true)
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
    // Leo's button is described by Leo's line
    advance(1200)
    advance(600)
    advance(600)
    askForOneOk(ui)
    const leo = screen.getByRole("button", { name: "OK $300 as Leo" })
    expect(document.getElementById(leo.getAttribute("aria-describedby")!)!.textContent).toContain("Leo gets a notification: Maya needs one OK.")
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
    expect(idle.split(",")).toEqual(
      expect.arrayContaining(["p:instant", "p:one_ok:over_cap", "p:one_ok:over_budget", "p:group", "p:balance", "sizer"]),
    )
    ui.pick("$300")
    ui.pick("$400")
    ui.pick("$20")
    expect(ui.layers()).toBe(idle)
    // instant road: what is mounted at the tap is what stays through approved and sent
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
    // one-OK and group roads: the same, through asked
    for (const amount of ["$300", "$400"]) {
      fireEvent.click(screen.getByRole("radio", { name: amount }))
      fireEvent.click(fresh.spend())
      const askedAtTap = fresh.layers()
      advance(1200)
      expect(fresh.layers(), amount).toBe(askedAtTap)
      fireEvent.click(screen.getByRole("button", { name: amount === "$300" ? "OK $300 as Leo" : "Approve as Leo" }))
      advance(600)
      fireEvent.click(screen.getByRole("button", { name: "Start over" }))
      advance(300)
    }
    // the spend that raises trust: its line is mounted at the tap and stays through sent
    fresh.pick("$20")
    spendInstantly(fresh)
    spendInstantly(fresh)
    fireEvent.click(fresh.spend())
    const trustAtTap = fresh.layers()
    expect(trustAtTap.split(",")).toContain("trust")
    advance(1200)
    advance(600)
    expect(fresh.layers()).toBe(trustAtTap)
  })

  it("C3/C4: Leo's road ends on the approval, with focus on the result, never on a disabled button, and no scroll", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    const ui = setup()
    askForOneOk(ui)
    const ok = screen.getByRole("button", { name: "OK $300 as Leo" })
    ok.focus() // a keyboard user
    fireEvent.click(ok)
    expect(ui.shown("Approved by Leo's OK")).toBe(true)
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
    askForOneOk(ui)
    fireEvent.click(screen.getByRole("button", { name: "OK $300 as Leo" }))
    fireEvent.click(ui.action()) // lands on the button's next job (Spend $300, blocked) within 400 ms: ignored
    expect(ui.stage().getAttribute("data-try-stage")).toBe("result")
    expect(ui.shown("Approved by Leo's OK")).toBe(true)
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
    expect(ui.shown("This needs one OK from someone else who has added money")).toBe(true)
    expect(ui.shown("$84 sent to you")).toBe(false)
    advance(300)
    expect(ui.stage().getAttribute("data-try-stage")).toBe("preview")
    fireEvent.click(screen.getByRole("button", { name: "Start over" }))
    expect(ui.balance()).toBe("$450.00")
    expect(screen.getByRole("radio", { name: "$84" }).getAttribute("aria-checked")).toBe("true")
    expect(ui.shown("This will be approved instantly")).toBe(true)
  })
})
