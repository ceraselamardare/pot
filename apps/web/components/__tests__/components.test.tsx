// @vitest-environment jsdom
// Component tests (Testing Library): money, status, goal bar, keypad, rule preview, motion under reduced motion.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Celebration } from "@/components/money/Celebration"
import { AmountDisplay, Keypad } from "@/components/money/Keypad"
import { MoneyText } from "@/components/money/MoneyText"
import { Avatar } from "@/components/pot/Avatar"
import { GoalBar } from "@/components/pot/GoalBar"
import { StatusChip } from "@/components/pot/StatusChip"
import { TypingDots } from "@/components/feedback/TypingDots"
import { dollars, MINUS } from "@/lib/client/money"

let reduced = false
beforeAll(() => {
  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes("reduced-motion") ? reduced : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => cleanup())

describe("MoneyText", () => {
  it("always has tabular figures and data-money", () => {
    render(<MoneyText micro={dollars(450)} variant="hero" />)
    const el = screen.getByText("$450.00")
    expect(el.dataset.money).toBeDefined()
    expect(el.className).toContain("tabular-nums")
    expect(el.className).toContain("text-balance-hero")
  })
  it("keeps the hero size next to a colour class", () => {
    render(<MoneyText micro={dollars(1)} variant="hero" className="text-ink" />)
    expect(screen.getByText("$1.00").className).toMatch(/text-balance-hero.*text-ink|text-ink.*text-balance-hero/)
  })
  it("writes money out with U+2212", () => {
    render(<MoneyText micro={dollars(84)} sign="out" />)
    expect(screen.getByText(`${MINUS} $84.00`)).toBeTruthy()
  })
})

describe("StatusChip", () => {
  it.each([
    ["approved", "Approved"],
    ["needs", "Needs approval"],
    ["declined", "Not approved"],
    ["sending", "Sending…"],
    ["expired", "Expired"],
  ] as const)("%s = icon + word", (status, word) => {
    const { container } = render(<StatusChip status={status} />)
    expect(screen.getByText(word)).toBeTruthy()
    expect(container.querySelector("svg")).not.toBeNull()
  })
  it("takes a more specific word", () => {
    render(<StatusChip status="needs">1 of 2 approvals</StatusChip>)
    expect(screen.getByText("1 of 2 approvals")).toBeTruthy()
  })
})

describe("GoalBar", () => {
  it("never ships without its text twin, and the bar is decorative", () => {
    const { container } = render(<GoalBar collected={dollars(300)} goal={dollars(450)} />)
    expect(screen.getByText("$300 of $450 collected")).toBeTruthy()
    expect(container.querySelector("[aria-hidden]")).not.toBeNull()
  })
})

describe("Keypad", () => {
  it("has labelled keys and updates the value", () => {
    const onChange = vi.fn()
    render(<Keypad value="8" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "4" }))
    expect(onChange).toHaveBeenLastCalledWith("84")
    fireEvent.click(screen.getByRole("button", { name: "delete" }))
    expect(onChange).toHaveBeenLastCalledWith("")
    expect(screen.getByRole("button", { name: "decimal point" })).toBeTruthy()
  })
  it("accepts physical keys and Enter submits", () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    render(<Keypad value="3" onChange={onChange} onSubmit={onSubmit} />)
    fireEvent.keyDown(window, { key: "0" })
    expect(onChange).toHaveBeenLastCalledWith("30")
    fireEvent.keyDown(window, { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledOnce()
  })
  it("the display is a status region", () => {
    render(<AmountDisplay value="84" label="How much?" />)
    expect(screen.getByRole("status").textContent).toBe("$84")
  })
})

describe("Avatar", () => {
  it("colours by join order, eggplant initials", () => {
    const { container } = render(<Avatar person={{ name: "Leo", initials: "L", joinIndex: 2 }} />)
    expect(container.firstElementChild!.className).toContain("bg-member-3")
    expect(container.firstElementChild!.className).toContain("text-on-brand")
  })
})

describe("motion", () => {
  it("the burst renders 12 aria-hidden particles once", () => {
    reduced = false
    const { container } = render(
      <div className="relative">
        <Celebration play />
      </div>,
    )
    const burst = container.querySelector("[data-celebration]")!
    expect(burst.getAttribute("aria-hidden")).toBe("true")
    expect(burst.querySelectorAll(".pot-particle")).toHaveLength(12)
  })
  it("no burst under prefers-reduced-motion", () => {
    reduced = true
    const { container } = render(<Celebration play />)
    expect(container.querySelector("[data-celebration]")).toBeNull()
    reduced = false
  })
  it("typing dots are decorative and can rest", () => {
    const { container } = render(<TypingDots still />)
    expect(container.firstElementChild!.getAttribute("aria-hidden")).toBe("true")
    expect(container.firstElementChild!.className).toContain("pot-dots-still")
  })
})

it("act is available (React 19 test env)", () => {
  act(() => {})
})
