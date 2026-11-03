// @vitest-environment jsdom
// "Pay in" (notes/frontend.md 2026-11-03) over the mock data source: the row's Ask chooser (Ask the group · Ask anyone
// by link), Ask anyone (the only place a pay-in link is made; a payment by default, a gift as a tone), the outsider's
// page in the payment tone, the members' feed row ("Paid in · by link" + From outside), the Settings tab's sections
// (who decides; Money from outside drills into Public page and Pay-in links), and the Share sheet being invites only.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GiftLinkFlow } from "@/components/gifts/GiveFlow"
import { GiftRow } from "@/components/gifts/GiftRow"
import { AskSheet } from "@/components/payin/AskSheet"
import { PayInLinksSheet } from "@/components/payin/PayInLinksSheet"
import { PayInSheet } from "@/components/payin/PayInSheet"
import { PublicPageSheet } from "@/components/payin/PublicPageSheet"
import { SettingsTab } from "@/components/pot/SettingsTab"
import { ShareSheet } from "@/components/sheets/ShareSheet"
import { findBanned } from "@/i18n/banned.mjs"
import * as store from "@/lib/client/mock/store"
import type { GiftVM, PotVM, World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push: () => {}, replace: () => {} }) }))

const world = (): World => JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as World
const pot = (slug = "lisbon-trip", me = "maya"): PotVM => W.potView(world(), slug, me, Date.now())!

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("pot.mock.seed", "showcase")
  store.resetWorld()
  store.setSession("maya")
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

vi.setConfig({ testTimeout: 10_000 })

describe("Ask", () => {
  it("two rows named by who pays; picking one swaps the sheet in place; no marigold", async () => {
    const user = userEvent.setup()
    window.history.pushState({ potSheet: 1 }, "", "/p/lisbon-trip?sheet=ask")
    const depth = window.history.length
    render(<AskSheet pot={pot()} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "Ask for money" })
    const rows = [...d.querySelectorAll("[data-more]")]
    expect(rows.map((r) => r.getAttribute("data-more"))).toEqual(["ask-group", "ask-anyone"])
    expect(rows[0]!.textContent).toBe("Ask the groupEveryone adds a little more")
    expect(rows[1]!.textContent).toBe("Ask anyone by linkAnyone can pay into Lisbon Trip. They don't join.")
    expect(d.querySelector(".bg-brand")).toBeNull()
    expect(findBanned(d.textContent ?? "")).toBeNull()
    await user.click(within(d).getByRole("button", { name: /Ask anyone by link/ }))
    expect(window.location.search).toBe("?sheet=payin")
    expect(window.history.length).toBe(depth)
    window.history.replaceState({ potSheet: 1 }, "", "/p/lisbon-trip?sheet=ask")
    await user.click(within(d).getByRole("button", { name: /Ask the group/ }))
    expect(window.location.search).toBe("?sheet=topup")
  })

  it("a Pot of one: Ask the group waits ('Once someone else joins'); Ask anyone works", async () => {
    const user = userEvent.setup()
    const p = pot()
    render(<AskSheet pot={{ ...p, members: p.members.slice(0, 1) }} open onClose={() => {}} />)
    const group = screen.getByRole("button", { name: /Ask the group/ })
    expect(group.getAttribute("aria-disabled")).toBe("true")
    expect(group.textContent).toContain("Once someone else joins")
    await user.click(group)
    expect(window.location.search).toBe("")
    const anyone = screen.getByRole("button", { name: /Ask anyone by link/ })
    expect(anyone.getAttribute("aria-disabled")).toBeNull()
  })
})

describe("Ask anyone", () => {
  it("defaults: a payment, they choose; one tap makes the link; QR first, Share is the one marigold", async () => {
    const user = userEvent.setup()
    render(<PayInSheet pot={pot()} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "Ask anyone to pay in" })
    expect(within(d).getByRole("radio", { name: "A payment" }).getAttribute("aria-checked")).toBe("true")
    expect(within(d).getByRole("radio", { name: "They choose" }).getAttribute("aria-checked")).toBe("true")
    expect(within(d).getByText(/Works for 14 days, until/)).toBeTruthy()
    expect(d.querySelectorAll(".bg-brand")).toHaveLength(1)
    await user.click(within(d).getByRole("button", { name: "Make pay-in link" }))
    await waitFor(() => expect(d.querySelector("[data-payin='ready']")).toBeTruthy(), { timeout: 3_000 })
    expect(within(d).getByText("Your pay-in link is ready")).toBeTruthy()
    expect(d.querySelector("[data-payin-url]")!.getAttribute("data-payin-url")).toMatch(/\/g\/lisbon-trip\/[A-Za-z0-9_-]{22}$/)
    expect(within(d).getByRole("button", { name: "Share link" })).toBeTruthy()
    expect(within(d).getByRole("button", { name: "Copy link" })).toBeTruthy()
    expect(d.querySelectorAll(".bg-brand")).toHaveLength(1)
    expect(world().giftLinks!.filter((l) => l.pot === "lisbon-trip")).toEqual([expect.objectContaining({ amount: null, reusable: true, tone: "payment" })])
    expect(findBanned(d.textContent ?? "")).toBeNull()
  })

  it("fixed: $25 for a payment, $10 once it's a gift (until typed over); the tone is saved on the link", async () => {
    const user = userEvent.setup()
    render(<PayInSheet pot={pot()} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "Ask anyone to pay in" })
    await user.click(within(d).getByRole("radio", { name: "Fixed" }))
    const input = within(d).getByRole("textbox", { name: "Amount in dollars" }) as HTMLInputElement
    expect(input.value).toBe("25")
    await user.click(within(d).getByRole("radio", { name: "A gift ☕" }))
    expect(input.value).toBe("10")
    await user.clear(input)
    await user.type(input, "12")
    await user.click(within(d).getByRole("radio", { name: "A payment" }))
    expect(input.value).toBe("12")
    await user.click(within(d).getByRole("radio", { name: "A gift ☕" }))
    await user.click(within(d).getByRole("button", { name: "Make pay-in link" }))
    await waitFor(() => expect(d.querySelector("[data-payin='ready']")).toBeTruthy(), { timeout: 3_000 })
    expect(within(d).getByText(/Gift ☕ · \$12/)).toBeTruthy()
    expect(world().giftLinks!.find((l) => l.pot === "lisbon-trip")).toMatchObject({ amount: 1_200, tone: "gift" })
  })

  it("taking money from outside off: one calm line and [Turn it back on] (any member, right away)", async () => {
    const user = userEvent.setup()
    await act(() => store.setGiftsOn("lisbon-trip", false))
    const { rerender } = render(<PayInSheet pot={pot()} open onClose={() => {}} />)
    expect(screen.getByText("Lisbon Trip isn't taking money from outside right now. Anyone in the Pot can turn it back on.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Make pay-in link" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Turn it back on" }))
    await waitFor(() => expect(world().pots["lisbon-trip"]!.giftsOff).toBe(false), { timeout: 3_000 })
    rerender(<PayInSheet pot={pot()} open onClose={() => {}} />)
    expect(screen.getByRole("button", { name: "Make pay-in link" })).toBeTruthy()
  })
})

describe("the outsider's page, payment tone", () => {
  const makeLink = async (amount: number | null) => {
    const id = await store.createGiftLink("lisbon-trip", { amount, tone: "payment" })
    store.setSession("alex")
    return id
  }

  it("'Pay Lisbon Trip', presets $10 / $25 / $50 (the middle one picked), [Pay $25] → thank you", async () => {
    const user = userEvent.setup()
    const id = await makeLink(null)
    render(<GiftLinkFlow slug="lisbon-trip" id={id} initial={null} />)
    expect(await screen.findByRole("heading", { level: 1, name: "Pay Lisbon Trip" })).toBeTruthy()
    expect(screen.getByText("3 people are in this Pot")).toBeTruthy()
    const amounts = screen.getByRole("radiogroup", { name: "How much?" })
    expect(within(amounts).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["$10", "$25", "$50", "Other amount"])
    expect(screen.getByRole("radio", { name: "$25" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.queryByText(/☕/)).toBeNull()
    expect(screen.getByText("Goes to the whole group. Can't be taken back.")).toBeTruthy()
    expect(document.querySelectorAll(".bg-brand")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Pay $25" }))
    expect(await screen.findByRole("heading", { name: "Thank you!" }, { timeout: 3_000 })).toBeTruthy()
    expect(screen.getByText("$25 is on its way to Lisbon Trip.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Pay again" })).toBeTruthy()
    expect(world().gifts!.at(-1)).toMatchObject({ pot: "lisbon-trip", amount: 2_500, tone: "payment", linkId: id })
    expect(findBanned(document.body.textContent ?? "")).toBeNull()
  })

  it("a fixed link: 'This link is for $25.' and one button [Pay $25]; turned off: 'not taking payments right now'", async () => {
    const id = await makeLink(2_500)
    const r = render(<GiftLinkFlow slug="lisbon-trip" id={id} initial={null} />)
    expect(await screen.findByText("This link is for $25.")).toBeTruthy()
    expect(screen.queryByRole("radiogroup", { name: "How much?" })).toBeNull()
    expect(screen.getByRole("button", { name: "Pay $25" })).toBeTruthy()
    r.unmount()
    store.setSession("maya")
    await act(() => store.setGiftsOn("lisbon-trip", false))
    store.setSession("alex")
    render(<GiftLinkFlow slug="lisbon-trip" id={id} initial={null} />)
    expect(await screen.findByRole("heading", { name: "Lisbon Trip isn't taking payments right now" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull()
  })
})

describe("the members' feed", () => {
  const g = (o: Partial<GiftVM>): GiftVM => ({ ref: "g1", from: { id: "alex", name: "Alex", initials: "A", joinIndex: null }, note: null, showPublic: false, amount: 25_000_000n, at: Date.now() - 60_000, linkId: "l1", tone: "payment", ...o })
  it("a payment: 'Alex · Paid in · by link' with a From outside chip (icon + word); on the page: '· on the page'", () => {
    render(
      <ul>
        <GiftRow gift={g({})} now={Date.now()} />
        <GiftRow gift={g({ ref: "g2", linkId: null, from: { id: "bo", name: "Bo", initials: "B", joinIndex: null } })} now={Date.now()} />
      </ul>,
    )
    const row = screen.getByRole("button", { name: /^Alex paid in \$25 · by link\./ })
    expect(row.querySelector("[data-row-title]")!.textContent).toBe("Alex · Paid in · by link")
    const chip = row.querySelector("[data-status='outside']")!
    expect(chip.textContent).toBe("From outside")
    expect(chip.querySelector("svg")!.getAttribute("stroke-width")).toBe("2.25")
    expect(screen.getByRole("button", { name: /^Bo paid in \$25 · on the page\./ })).toBeTruthy()
  })
})

describe("Settings", () => {
  it("sections in order, each saying who decides; rows open the same sheets as More; no marigold", async () => {
    const user = userEvent.setup()
    render(<SettingsTab pot={pot()} />)
    const heads = [...document.querySelectorAll("[data-settings-section] > h2")].map((h) => h.textContent)
    expect(heads).toEqual([
      "Rules · the group decides",
      "Money from outside · anyone, right away",
      "Paying people outside · the group decides",
      "People",
      "Record",
      "Close Pot · the group decides",
    ])
    // the rules first, open, then the change card
    expect(document.querySelector("[data-settings-section='rules'] [data-rules-list]")).toBeTruthy()
    expect(document.querySelector("[data-settings-section='rules'] [data-rules-change]")).toBeTruthy()
    expect(document.querySelector(".bg-brand")).toBeNull()
    for (const svg of document.querySelectorAll("[data-settings] svg")) expect(["2", "2.25"]).toContain(svg.getAttribute("stroke-width"))
    expect(screen.getByRole("link", { name: "See every spend" }).getAttribute("href")).toBe("/p/lisbon-trip/record")
    expect(screen.getByRole("link", { name: /on the explorer, opens in a new tab/ }).getAttribute("target")).toBe("_blank")
    for (const [name, search] of [
      [/^Send by link: (On|Off)$/, "?sheet=rules&rule=links"],
      [/^Invite link/, "?sheet=share"],
      [/^Who can see what$/, "?sheet=privacy"],
      [/^Public page: Off$/, "?sheet=publicpage"],
      [/^Pay-in links/, "?sheet=payinlinks"],
      [/^Make a pay-in link$/, "?sheet=payin"],
      [/^Close Pot and share out$/, "?sheet=close"],
    ] as const) {
      await user.click(screen.getByRole("button", { name }))
      expect(window.location.search).toBe(search)
      window.history.replaceState(null, "", "/")
    }
    expect(findBanned(document.body.textContent ?? "")).toBeNull()
  })

  it("Money from outside: one member turns it off at once (the safety note says so); the world follows", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SettingsTab pot={pot()} />)
    expect(screen.getByText("Anyone in the Pot can turn this off at once.")).toBeTruthy()
    const sw = screen.getByRole("switch", { name: "Taking money from outside" })
    expect(sw.getAttribute("aria-checked")).toBe("true")
    await user.click(sw)
    await waitFor(() => expect(world().pots["lisbon-trip"]!.giftsOff).toBe(true), { timeout: 3_000 })
    rerender(<SettingsTab pot={pot()} />)
    expect(screen.getByRole("switch", { name: "Taking money from outside" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText(/won't take money until someone in the Pot turns this back on/)).toBeTruthy()
    // nothing to make while it's off
    expect(screen.queryByRole("button", { name: "Make a pay-in link" })).toBeNull()
  })

  it("Pay-in links: the empty state, then a link with Show / Turn off; Public page: on, its tone and line, Share", async () => {
    const user = userEvent.setup()
    const r = render(<PayInLinksSheet pot={pot()} open onClose={() => {}} />)
    expect(screen.getByText("No pay-ins yet. Share a link to get the first one.")).toBeTruthy()
    expect(await screen.findByText("No active links right now.")).toBeTruthy()
    r.unmount()
    await act(async () => void (await store.createGiftLink("lisbon-trip", { amount: 2_500, tone: "payment" })))
    render(<PayInLinksSheet pot={pot()} open onClose={() => {}} />)
    await user.click(await screen.findByRole("button", { name: "Show the Payment · $25 link" }))
    expect(document.querySelector("[data-payin-url]")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Share link" })).toBeTruthy()
    cleanup()
    render(<PayInLinksSheet pot={pot()} open onClose={() => {}} />)
    await user.click(await screen.findByRole("button", { name: "Turn off the Payment · $25 link" }))
    await waitFor(() => expect(world().giftLinks!.find((l) => l.pot === "lisbon-trip")!.revokedAt).not.toBeNull(), { timeout: 3_000 })
    cleanup()

    const page = render(<PublicPageSheet pot={pot()} open onClose={() => {}} />)
    await user.click(screen.getByRole("switch", { name: "Public page" }))
    await waitFor(() => expect(world().pots["lisbon-trip"]!.giftPage).toMatchObject({ on: true, tone: "payment" }), { timeout: 3_000 })
    page.rerender(<PublicPageSheet pot={pot()} open onClose={() => {}} />)
    await user.click(screen.getByRole("radio", { name: "A gift ☕" }))
    await waitFor(() => expect(world().pots["lisbon-trip"]!.giftPage!.tone).toBe("gift"), { timeout: 3_000 })
    page.rerender(<PublicPageSheet pot={pot()} open onClose={() => {}} />)
    expect(screen.getByRole("button", { name: "Share page" })).toBeTruthy()
    expect(document.querySelector("[data-page-url]")!.getAttribute("data-page-url")).toMatch(/\/give\/lisbon-trip$/)
  })
})

describe("the Share sheet", () => {
  it("is invites only: no tabs, no pay-in link", () => {
    render(<ShareSheet pot={pot()} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: /Invite friends to Lisbon Trip/ })
    expect(within(d).queryByRole("tab")).toBeNull()
    expect(d.textContent).not.toMatch(/pay-in|gift/i)
  })
})
