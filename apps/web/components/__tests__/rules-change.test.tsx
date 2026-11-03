// @vitest-environment jsdom
// Settings → Rules and the rules change sheet over the mock data source (classic seed: Lisbon Trip is a Pot made before
// hub 1.1.0, so its extras are all off).
//  - Rules: "Send by link" is said on or off; the section ends with one "Changing the rules" card with one secondary
//    button and the "enforces itself" footnote; the record + explorer are quiet ink rows in Settings → Record.
//  - Change sheet: prefilled from the Pot's real extras (all off, not the new-Pot defaults); turning "Send by link"
//    on is enough to ask; the payload carries the extras whole; the review strikes "…by link to people outside: off."
//    through above "…: on."; once approved, the Spend sheet's "Someone else" works.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PayLinkFields } from "@/components/paylink/PayLinkFields"
import { SettingsTab } from "@/components/pot/SettingsTab"
import { RulesSheet } from "@/components/sheets/RulesSheet"
import * as store from "@/lib/client/mock/store"
import type { PotVM, World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push: () => {}, replace: () => {} }) }))

const world = (): World => JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as World
const pot = (me = "maya"): PotVM => W.potView(world(), "lisbon-trip", me, Date.now())!

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

describe("Settings → Rules", () => {
  it("says pay by link is off for a Pot from before links", () => {
    expect(pot().extras).toBeUndefined()
    render(<SettingsTab pot={pot()} />)
    const list = document.querySelector("[data-rules-list]") as HTMLElement
    expect(within(list).getByText("Sending money by link to people outside: off.")).toBeTruthy()
  })

  it("ends calmly: a footnote, one change card with one button; the record rows are quiet and ink", () => {
    render(<SettingsTab pot={pot()} />)
    const foot = document.querySelector("[data-rules-footnote]")!
    expect(foot.textContent).toBe("The Pot enforces these rules itself. No one, including Maya, can skip them.")
    expect(foot.querySelector("svg")).toBeTruthy()
    const card = screen.getByRole("region", { name: "Changing the rules" })
    expect(within(card).getByText("Changes apply once 2 of 3 approve.")).toBeTruthy()
    const buttons = within(card).getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Ask the group to change a rule"])
    expect(buttons[0]!.getAttribute("data-variant")).toBe("secondary")
    const more = screen.getByRole("region", { name: "Record" })
    const links = within(more).getAllByRole("link")
    expect(links.map((a) => a.textContent)).toEqual(["See every spend", "On the explorer"])
    expect(links[0]!.getAttribute("href")).toBe("/p/lisbon-trip/record")
    expect(links[1]!.getAttribute("aria-label")).toBe("View Lisbon Trip on the explorer, opens in a new tab")
    expect(links[1]!.getAttribute("target")).toBe("_blank")
    // quiet rows: ink, never the link token's gold or marigold; icons are Lucide at stroke 2
    for (const a of links) {
      expect(a.className).toContain("text-ink")
      expect(a.className).not.toMatch(/text-link|text-brand/)
      a.querySelectorAll("svg").forEach((svg) => expect(svg.getAttribute("stroke-width")).toBe("2"))
    }
  })

  it("a sole member: the card says changes apply at once", () => {
    const p = pot()
    render(<SettingsTab pot={{ ...p, n: 1, k: 1 }} />)
    const card = screen.getByRole("region", { name: "Changing the rules" })
    expect(within(card).getByText("You're the only one here, so changes apply right away.")).toBeTruthy()
    expect(within(card).getByRole("button", { name: "Change rules" })).toBeTruthy()
  })
})

describe("turning pay by link on in an old Pot", () => {
  it("prefills reality, asks with extras, the review shows the change in words, and approval turns links on", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<RulesSheet pot={pot()} open onClose={() => {}} />)
    const dialog = await screen.findByRole("dialog")
    // prefilled from what the Pot has: all off (not trust on / $300 / links on)
    const links = within(dialog).getByRole("switch", { name: "Send by link" })
    const trust = within(dialog).getByRole("switch", { name: "Trust grows" })
    expect(links.getAttribute("aria-checked")).toBe("false")
    expect(trust.getAttribute("aria-checked")).toBe("false")
    expect(within(dialog).getByRole("radio", { name: "Change the One OK up to, now Off" })).toBeTruthy()
    const ask = within(dialog).getByRole("button", { name: "Ask the group" }) as HTMLButtonElement
    expect(ask.disabled).toBe(true)
    expect(within(dialog).getByText("Change a rule to ask the group.")).toBeTruthy()

    await user.click(links)
    expect(links.getAttribute("aria-checked")).toBe("true")
    const line = dialog.querySelector('[data-rules-preview="links"]')!
    expect(line.textContent).toBe("Sending money by link to people outside: on.")
    expect(line.className).toContain("font-semibold")
    expect(ask.disabled).toBe(false)
    expect(within(dialog).getByText("This needs 2 of 3 approvals.")).toBeTruthy()

    await user.click(ask)
    await screen.findByText("Sent to the group. Your approval is counted. It needs 1 more.", undefined, { timeout: 3000 })
    // what was asked: the rules as they are, the extras whole (trust and one OK stay off, no goal), links on
    const asked = world().pots["lisbon-trip"]!.rulesProposal!
    expect(asked.rules.instantCap).toBe(10_000)
    expect(asked.extras).toEqual({ trust: false, oneOkCap: 0, links: true, goal: null })
    expect(asked.fromExtras).toEqual({ trust: false, oneOkCap: 0, links: false, goal: null })
    unmount()

    // Sam reviews: the old sentence struck through above the new one
    store.setSession("sam")
    render(<RulesSheet pot={pot("sam")} open onClose={() => {}} />)
    const review = await screen.findByRole("dialog", { name: "Maya wants to change a rule" })
    const diff = review.querySelector('[data-rules-diff-extra="links"]')!
    expect(diff.querySelector(".line-through")!.textContent).toBe("Sending money by link to people outside: off.")
    expect(diff.textContent).toContain("Sending money by link to people outside: on.")
    // only what changed: the amounts aren't in the diff
    expect(review.querySelectorAll("[data-rules-diff] > div")).toHaveLength(1)
    await user.click(within(review).getByRole("button", { name: "Approve the change" }))
    await screen.findByText("Approved. The new rules apply from now on.", undefined, { timeout: 3000 })
    cleanup()

    // applied: the tab says on, and the Spend sheet's "Someone else" offers the link fields
    expect(pot().extras).toEqual({ trust: false, oneOkCap: 0n, links: true })
    render(<SettingsTab pot={pot()} />)
    expect(screen.getByText("Sending money by link to people outside: on.")).toBeTruthy()
    cleanup()
    render(<PayLinkFields pot={pot()} label="" onLabel={() => {}} />)
    expect(document.querySelector("[data-paylink-fields]")).toBeTruthy()
    expect(document.querySelector("[data-paylink-off]")).toBeNull()
  })

  it("a sole member applies it at once (set_rules with the extras)", async () => {
    const user = userEvent.setup()
    const p = pot()
    render(<RulesSheet pot={{ ...p, n: 1, k: 1 }} open onClose={() => {}} />)
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("switch", { name: "Send by link" }))
    // the mock hub refuses set_rules in a Pot of 3, so assert the payload through the store's call
    const spy = vi.spyOn(store, "setRules").mockResolvedValue(undefined)
    await user.click(within(dialog).getByRole("button", { name: "Change rules" }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0]![2]).toEqual({ trust: false, oneOkCap: 0, links: true, goal: null })
    spy.mockRestore()
  })
})

describe("the Spend sheet when links are off", () => {
  it("points to the rule by name and swaps to the rules sheet with that switch in view", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/p/lisbon-trip?sheet=spend&step=details")
    render(<PayLinkFields pot={pot()} label="" onLabel={() => {}} />)
    const off = document.querySelector("[data-paylink-off]") as HTMLElement
    expect(off.textContent).toContain("Turn on “Send by link” in the rules.")
    await user.click(within(off).getByRole("button", { name: "Change the rules" }))
    const url = new URL(window.location.href)
    expect(url.searchParams.get("sheet")).toBe("rules")
    expect(url.searchParams.get("rule")).toBe("links")
    expect(url.searchParams.get("step")).toBeNull()
    cleanup()
    // the rules sheet opened that way scrolls the switch into view
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(<RulesSheet pot={pot()} open onClose={() => {}} />)
    await screen.findByRole("dialog")
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))))
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect((scroll.mock.contexts[0] as HTMLElement).getAttribute("data-rules-switch")).toBe("links")
  })
})
