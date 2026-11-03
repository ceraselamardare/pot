// @vitest-environment jsdom
// "Ask for a top-up" components over the mock data source: the ask sheet (defaults first, each / total and the split,
// the reason's count, the due chips, validation, one marigold, the sent ask), the card (asker / member / done, Add
// prefilled and marked, Nudge, Cancel with a confirm), the feed row (chip icon + word, its name), the hero's [Ask] and
// the Add sheet's "For Maya's ask" line. Plain words only.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AskSheet } from "@/components/payin/AskSheet"
import { PotActions } from "@/components/pot/PotActions"
import { AddMoneySheet } from "@/components/sheets/AddMoneySheet"
import { TopupCard } from "@/components/topups/TopupCard"
import { TopupRow } from "@/components/topups/TopupRow"
import { TopupSheet } from "@/components/topups/TopupSheet"
import { findBanned } from "@/i18n/banned.mjs"
import * as store from "@/lib/client/mock/store"
import type { World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push: () => {} }) }))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

const world = (): World => JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as World
const pot = (me = "maya") => W.potView(world(), "lisbon-trip", me, Date.now())!
const DAY = 86_400_000

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("pot.mock.seed", "classic")
  store.resetWorld()
  store.setSession("maya")
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

async function asked(opts: { mode?: "each" | "total"; amount?: number; reason?: string | null } = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const p = store.askTopup("lisbon-trip", { mode: opts.mode ?? "each", amount: opts.amount ?? 5_000, reason: opts.reason === undefined ? "Hotel went up" : opts.reason, dueAt: Date.now() + 3 * DAY })
  await vi.advanceTimersByTimeAsync(1_000)
  vi.useRealTimers()
  return p
}

describe("the ask sheet", () => {
  it("defaults first: the Pot's $150 each, a week; total splits equally; the reason counts; one marigold", async () => {
    const user = userEvent.setup()
    render(<TopupSheet pot={pot()} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "Ask the group" })
    const amount = within(d).getByRole("textbox", { name: "How much from each person?" }) as HTMLInputElement
    expect(amount.value).toBe("150")
    expect(d.querySelector("[data-topup-split]")!.textContent).toBe("$450 in total from 3 people")
    expect(within(d).getByRole("radio", { name: "In a week" }).getAttribute("aria-checked")).toBe("true")
    await user.click(within(d).getByRole("radio", { name: "In total" }))
    expect((within(d).getByRole("textbox", { name: "How much in total?" }) as HTMLInputElement).value).toBe("450")
    expect(d.querySelector("[data-topup-split]")!.textContent).toBe("$150 each from 3 people")
    await user.clear(within(d).getByRole("textbox", { name: "How much in total?" }))
    await user.type(within(d).getByRole("textbox", { name: "How much in total?" }), "100")
    expect(d.querySelector("[data-topup-split]")!.textContent).toBe("$33.34 each from 3 people")
    expect(within(d).getByRole("button", { name: "Ask for $100 in total" })).toBeTruthy()
    await user.type(within(d).getByRole("textbox", { name: "Why? (optional)" }), "Hotel went up")
    expect(within(d).getByText("13 of 80")).toBeTruthy()
    const marigold = [...d.querySelectorAll("button")].filter((b) => b.getAttribute("data-variant") === "primary")
    expect(marigold).toHaveLength(1)
    expect(findBanned(d.textContent ?? "")).toBeNull()
  })

  it("too little or too much each: the button waits and the line says why", async () => {
    render(<TopupSheet pot={pot()} open onClose={() => {}} />)
    const d = screen.getByRole("dialog")
    const amount = within(d).getByRole("textbox", { name: "How much from each person?" })
    // set the value directly: the sheet's focus-on-open can land mid-typing in a fast run
    fireEvent.change(amount, { target: { value: "0.5" } })
    expect(d.querySelector("[data-topup-split]")!.textContent).toBe("Ask for at least $1 from each person.")
    expect((within(d).getByRole("button", { name: "Ask everyone" }) as HTMLButtonElement).disabled).toBe(true)
    expect(amount.getAttribute("aria-invalid")).toBe("true")
    fireEvent.change(amount, { target: { value: "10001" } })
    expect(d.querySelector("[data-topup-split]")!.textContent).toBe("Ask for up to $10,000 from each person.")
  })

  it("sends: the ask is saved with the reason and the date chosen; the sheet closes", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TopupSheet pot={pot()} open onClose={onClose} />)
    const d = screen.getByRole("dialog")
    const amount = within(d).getByRole("textbox", { name: "How much from each person?" })
    await user.clear(amount)
    await user.type(amount, "50")
    await user.type(within(d).getByRole("textbox", { name: "Why? (optional)" }), "  Hotel went up ")
    await user.click(within(d).getByRole("radio", { name: "In 2 weeks" }))
    await user.click(within(d).getByRole("button", { name: "Ask for $50 each" }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 3_000 })
    const rec = world().topups![0]!
    expect(rec).toMatchObject({ by: "maya", mode: "each", perPerson: 5_000, total: 15_000, reason: "Hotel went up" })
    expect(Math.round((rec.dueAt - rec.createdAt) / DAY)).toBe(14)
  })

  it("a second open ask: the sheet says why", async () => {
    await asked()
    store.setSession("sam")
    const user = userEvent.setup()
    render(<TopupSheet pot={pot("sam")} open onClose={() => {}} />)
    await user.click(screen.getByRole("button", { name: "Ask for $150 each" }))
    expect((await screen.findByRole("alert", undefined, { timeout: 3_000 })).textContent).toBe("There's already an open ask in this Pot. It has to end first.")
  })
})

describe("the card", () => {
  it("the asker: 'You asked…', the reason, Asking + 0 of 3, who's waiting, Add her own part, Cancel with a confirm", async () => {
    await asked()
    const user = userEvent.setup()
    const v = pot().topup!
    render(<TopupCard v={v} me="maya" />)
    const c = screen.getByRole("article", { name: "You asked for $50 each" })
    expect(c.querySelector("[data-topup-reason]")!.textContent).toBe("“Hotel went up”")
    const chip = c.querySelector("[data-status='needs']")!
    expect(chip.textContent).toBe("Asking")
    expect(chip.querySelector("svg")).toBeTruthy()
    expect(c.querySelector("[data-topup-progress]")!.textContent).toBe("0 of 3 added")
    expect(c.querySelector("[data-topup-waiting]")!.textContent).toBe("Waiting for Sam and Leo")
    expect(within(c).getByRole("button", { name: "Nudge Sam and Leo" })).toBeTruthy()
    // Add: the existing Add sheet, prefilled and marked for this ask
    await user.click(within(c).getByRole("button", { name: "Add $50" }))
    expect(window.location.search).toBe(`?sheet=add&amount=50&topup=${v.id}`)
    // no marigold on the card
    expect([...c.querySelectorAll("button")].some((b) => b.getAttribute("data-variant") === "primary")).toBe(false)
    // cancel: an icon in the card's corner; a small sheet asks first
    await user.click(within(c).getByRole("button", { name: "Cancel ask" }))
    const ask = await screen.findByRole("dialog", { name: "Cancel this ask?" })
    expect(ask.querySelector("[data-topup-confirm]")!.textContent).toContain("Money already added stays in the Pot")
    await user.click(within(ask).getByRole("button", { name: "Keep it" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cancel this ask?" })).toBeNull())
    await user.click(within(c).getByRole("button", { name: "Cancel ask" }))
    await user.click(within(await screen.findByRole("dialog", { name: "Cancel this ask?" })).getByRole("button", { name: "Yes, cancel" }))
    await waitFor(() => expect(world().topups![0]!.cancelledAt).toBeTruthy(), { timeout: 3_000 })
    expect(findBanned(c.textContent ?? "")).toBeNull()
  })

  it("a member who added: 'You added your $50', no Add; Nudge reaches the others once, then 'Nudged today'", async () => {
    await asked()
    store.setSession("sam")
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const added = store.addMoney("lisbon-trip", 5_000)
    await vi.advanceTimersByTimeAsync(1_000)
    await added
    vi.useRealTimers()
    const { rerender } = render(<TopupCard v={pot("sam").topup!} me="sam" />)
    const c = screen.getByRole("article", { name: "Maya asks for $50 each" })
    expect(c.querySelector("[data-topup-you-done]")!.textContent).toBe("You added $50")
    expect(within(c).queryByRole("button", { name: /^Add/ })).toBeNull()
    expect(within(c).queryByRole("button", { name: "Cancel ask" })).toBeNull()
    expect(c.querySelector("[data-topup-progress]")!.textContent).toBe("1 of 3 added")
    await userEvent.setup().click(within(c).getByRole("button", { name: "Nudge Maya and Leo" }))
    await waitFor(() => expect(world().nudges).toHaveLength(2), { timeout: 3_000 })
    rerender(<TopupCard v={pot("sam").topup!} me="sam" />)
    expect(screen.getByRole("article").querySelector("[data-topup-nudged]")!.textContent).toContain("Nudged today")
    expect(within(screen.getByRole("article")).queryByRole("button", { name: /^Nudge/ })).toBeNull()
  })

  it("in Requests (with the Pot's name) the Add is a link to the Pot's Add sheet", async () => {
    await asked({ mode: "total", amount: 9_000 })
    render(<TopupCard v={pot("leo").topup!} me="leo" showPot />)
    const c = screen.getByRole("article")
    expect(c.textContent).toContain("Lisbon Trip")
    expect(c.textContent).toContain("$90 total")
    expect(within(c).getByRole("link", { name: "Add $30" }).getAttribute("href")).toMatch(/^\/p\/lisbon-trip\?sheet=add&amount=30&topup=/)
  })
})

describe("the row, the hero's Ask, the Add sheet", () => {
  it("a feed row: who + 'Asked for $50 each', the chip (icon + word), progress, no amount; its name says it all", async () => {
    await asked()
    const v = pot().topup!
    for (const [status, word] of [["open", "Asking"], ["done", "Done"], ["ended", "Ended"], ["cancelled", "Cancelled"]] as const) {
      const { unmount } = render(
        <ul>
          <TopupRow v={{ ...v, status }} now={Date.now()} />
        </ul>,
      )
      const row = screen.getByRole("group")
      expect(row.getAttribute("aria-label")).toMatch(new RegExp(`^Maya asked everyone for \\$50 more\\. Hotel went up\\. 0 of 3 added\\. ${word}\\.`))
      const chip = row.querySelector("[data-status]")!
      expect([chip.textContent, !!chip.querySelector("svg")]).toEqual([word, true])
      expect(row.querySelector("[data-money]")).toBeNull()
      unmount()
    }
  })

  it("the hero's [Ask] → 'Ask the group' opens the sheet; with an open ask that row is off and says whose", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PotActions pot={pot()} />)
    await user.click(screen.getByRole("button", { name: "Ask for money" }))
    expect(window.location.search).toBe("?sheet=ask")
    unmount()
    window.history.replaceState({ potSheet: 1 }, "", "/?sheet=ask")
    const chooser = render(<AskSheet pot={pot()} open onClose={() => {}} />)
    await user.click(screen.getByRole("button", { name: /^Ask the group/ }))
    expect(window.location.search).toBe("?sheet=topup")
    chooser.unmount()
    window.history.replaceState(null, "", "/")
    await asked()
    render(<AskSheet pot={pot("sam")} open onClose={() => {}} />)
    const off = screen.getByRole("button", { name: /^Ask the group/ })
    expect(off.getAttribute("aria-disabled")).toBe("true")
    expect(off.textContent).toContain("Maya's ask is still open")
    await user.click(off)
    expect(window.location.search).toBe("")
  })

  it("the Add sheet marks an add made for the ask", async () => {
    await asked()
    const v = pot("sam")
    render(<AddMoneySheet pot={v} open onClose={() => {}} prefill="50" topupId={v.topup!.id} typed={null} onTyped={() => {}} source="demo" onSource={() => {}} />)
    expect(screen.getByRole("dialog").querySelector("[data-add-topup]")!.textContent).toBe("For Maya's ask: $50 each.")
    expect(screen.getByRole("button", { name: "Add $50" })).toBeTruthy()
  })
})
