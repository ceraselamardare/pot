// @vitest-environment jsdom
// The Add sheet stops at $10,000 (the relayer's R1 cap, server/relay/policy.ts MAX_CONTRIBUTION). Before this, a
// keypad append on top of the "your share" prefill ("150" + "150" = $150,150) sent a delegate the relayer refused with
// 422 args_invalid amount/range and the money never moved (testnet paylink spec, 2026-11-01).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
const addMoney = vi.hoisted(() => vi.fn(() => "h"))
vi.mock("@/lib/client/actions", () => ({ addMoney }))
vi.mock("@/lib/client/data", () => ({ useOwnDollars: () => 0n }))

import { AddMoneySheet } from "@/components/sheets/AddMoneySheet"
import type { AddSource } from "@/lib/client/machines/add-flow"
import { MAX_ADD } from "@/lib/client/money"
import { potView, seedWorld } from "@/lib/client/mock/world"
import { MAX_CONTRIBUTION } from "@/server/relay/policy"

const NOW = Date.UTC(2026, 10, 3, 12)
const pot = potView(seedWorld(NOW), "lisbon-trip", "maya", NOW)!

afterEach(() => {
  cleanup()
  addMoney.mockClear()
  window.history.replaceState(null, "", "/")
})

function Harness({ prefill }: { prefill: string | null }) {
  const [typed, setTyped] = useState<string | null>(null)
  const [source, setSource] = useState<AddSource>("demo")
  return (
    <AddMoneySheet pot={pot} open onClose={() => {}} prefill={prefill} typed={typed} onTyped={setTyped} source={source} onSource={setSource} />
  )
}
const open = (prefill: string | null = null) => {
  render(<Harness prefill={prefill} />)
  return screen.getByRole("dialog", { name: `Add money to ${pot.name}` })
}
const key = (d: HTMLElement, k: string) => fireEvent.click(within(d).getByRole("button", { name: k, exact: true } as never))
const type = (d: HTMLElement, s: string) => [...s].forEach((c) => key(d, c))

describe("Add money: at most $10,000 at a time", () => {
  it("matches the relayer's R1 cap", () => {
    expect(MAX_ADD).toBe(MAX_CONTRIBUTION)
  })

  it("$10,000 is fine; one more dollar says the limit and Next stays off (step 1)", () => {
    const d = open()
    type(d, "10000")
    const next = within(d).getByRole("button", { name: "Next", exact: true } as never) as HTMLButtonElement
    expect(next.disabled).toBe(false)
    expect(d.querySelector("[data-add-max]")).toBeNull()
    key(d, "delete")
    key(d, "1")
    expect(next.disabled).toBe(true)
    expect(within(d).getByRole("alert").textContent).toBe("You can add up to $10,000 at a time.")
    fireEvent.click(next)
    fireEvent.keyDown(window, { key: "Enter" })
    expect(d.querySelector("[data-add-body='1']")).not.toBeNull() // still on step 1
    expect(addMoney).not.toHaveBeenCalled()
  })

  it("typing on top of the $150 prefill can't send $150,150", () => {
    const d = open("150")
    // a linked amount opens on step 2; Change goes back to the keypad with $150 there
    fireEvent.click(within(d).getByRole("button", { name: "Change the amount" }))
    expect(d.querySelector("[data-amount-display]")!.textContent).toBe("$150")
    type(d, "150")
    expect((within(d).getByRole("button", { name: "Next", exact: true } as never) as HTMLButtonElement).disabled).toBe(true)
    expect(d.querySelector("[data-add-max]")).not.toBeNull()
  })

  it("a link over the limit opens on step 1 and says so", () => {
    const d = open("20000")
    expect(d.querySelector("[data-add-body='1']")).not.toBeNull()
    expect(d.querySelector("[data-add-max]")).not.toBeNull()
  })
})
