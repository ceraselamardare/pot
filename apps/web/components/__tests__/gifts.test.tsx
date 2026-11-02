// @vitest-environment jsdom
// Gifts (hub 1.2.0) over the mock data source (the showcase seed: Leo's Birthday has three gifts, its public page on,
// an open and a $25 gift link): the members' feed row and details, the giver's pages (presets, the fixed amount, the
// note, inline sign-in, thank-you), the public page's opted-in givers, every blocked state, ••• → Gifts and the share
// sheet's Gift link tab.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GiftDetailsSheet } from "@/components/gifts/GiftDetailsSheet"
import { GiftRow } from "@/components/gifts/GiftRow"
import { GiftsSheet } from "@/components/gifts/GiftsSheet"
import { GiftLinkFlow, GiftPageFlow, blockedOf } from "@/components/gifts/GiveFlow"
import { ShareSheet } from "@/components/sheets/ShareSheet"
import { findBanned } from "@/i18n/banned.mjs"
import { BIRTHDAY_LINKS } from "@/lib/client/mock/gifts"
import * as store from "@/lib/client/mock/store"
import type { GiftVM, World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

// the share sheet reads its tab from the address (?kind=gift)
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push: () => {} }) }))

const world = (): World => JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as World
const pot = (slug: string, me = "maya") => W.potView(world(), slug, me, Date.now())!

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("pot.mock.seed", "showcase")
  store.resetWorld()
  store.setSession("alex")
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("the members' side", () => {
  it("a feed row: the giver, 'Sent a gift ☕', a Gift chip (icon + word), a note mark, + $10.00; its name says it all", () => {
    const g: GiftVM = { ref: "g1", from: { id: "ana", name: "Ana", initials: "A", joinIndex: null }, note: "Happy birthday", showPublic: true, amount: 10_000_000n, at: Date.now() - 60_000, linkId: null }
    render(
      <ul>
        <GiftRow gift={g} now={Date.now()} />
      </ul>,
    )
    const row = screen.getByRole("button", { name: /^Ana sent a gift of \$10\. Has a note\./ })
    expect(within(row).getByText("Sent a gift ☕")).toBeTruthy()
    const chip = row.querySelector("[data-status='gift']")!
    expect(chip.textContent).toBe("Gift")
    expect(chip.querySelector("svg")).toBeTruthy()
    expect(row.textContent).toMatch(/\+\s?\$10\.00/)
    expect(row.querySelector("[data-gift-note-mark]")).toBeTruthy()
  })

  it("the details: who, when, how, the note (members), 'Shown on the gift page', the group rule; no marigold", () => {
    const v = pot("leos-birthday")
    const ana = v.gifts!.items.find((g) => g.from.name === "Ana")!
    render(<GiftDetailsSheet pot={v} giftRef={ana.ref} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "Ana sent a gift" })
    expect(within(d).getByText("Happy birthday Leo! Coffee's on me ☕")).toBeTruthy()
    expect(within(d).getByText("Shown on the gift page")).toBeTruthy()
    expect(within(d).getByText("The public gift page")).toBeTruthy()
    expect(within(d).getByText(/Gifts belong to the whole group/)).toBeTruthy()
    expect(d.querySelector(".bg-brand")).toBeNull()
    expect(findBanned(d.textContent ?? "")).toBeNull()
  })

  it("an unknown gift says it isn't here", () => {
    render(<GiftDetailsSheet pot={pot("leos-birthday")} giftRef="gnope" open onClose={() => {}} />)
    expect(screen.getByText("This gift isn't here any more.")).toBeTruthy()
  })

  it("••• → Gifts: totals, 'Taking gifts' on, the page on with its line and Share; turning gifts off reaches the world", async () => {
    store.setSession("maya")
    const user = userEvent.setup()
    const { rerender } = render(<GiftsSheet pot={pot("leos-birthday")} open onClose={() => {}} />)
    expect(screen.getByText("$40 from 3 gifts")).toBeTruthy()
    const on = screen.getByRole("switch", { name: "Taking gifts" })
    expect(on.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("switch", { name: "Public gift page" }).getAttribute("aria-checked")).toBe("true")
    expect((screen.getByRole("textbox", { name: "A line for the page (optional)" }) as HTMLInputElement).value).toBe("Help us throw Leo the best birthday ☕")
    expect(screen.getByRole("button", { name: "Share gift page" })).toBeTruthy()
    await user.click(on)
    await waitFor(() => expect(world().pots["leos-birthday"]!.giftsOff).toBe(true), { timeout: 3_000 })
    rerender(<GiftsSheet pot={pot("leos-birthday")} open onClose={() => {}} />)
    expect(screen.getByRole("switch", { name: "Taking gifts" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText(/won't take gifts until someone in the Pot turns this back on/)).toBeTruthy()
  })

  it("the share sheet's Gift link tab: one tap makes a link (QR + Share); it's listed; Turn off ends it", async () => {
    store.setSession("maya")
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/p/lisbon-trip?sheet=share&kind=gift")
    render(<ShareSheet pot={pot("lisbon-trip")} open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "Gift link for Lisbon Trip" })
    expect(within(d).getByRole("tab", { name: "Gift link" }).getAttribute("aria-selected")).toBe("true")
    expect(within(d).getByRole("radio", { name: "Giver chooses" }).getAttribute("aria-checked")).toBe("true")
    await user.click(within(d).getByRole("button", { name: "Make gift link" }))
    await waitFor(() => expect(d.querySelector("[data-gift-tab='ready']")).toBeTruthy(), { timeout: 3_000 })
    const url = d.querySelector("[data-gift-url]")!.getAttribute("data-gift-url")!
    expect(url).toMatch(/\/g\/lisbon-trip\/[A-Za-z0-9_-]{22}$/)
    expect(within(d).getByRole("button", { name: "Share gift link" })).toBeTruthy()
    const links = world().giftLinks!.filter((l) => l.pot === "lisbon-trip")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ amount: null, reusable: true })
    await user.click(await within(d).findByRole("button", { name: "Turn off the Giver chooses gift link" }))
    await waitFor(() => expect(world().giftLinks!.find((l) => l.pot === "lisbon-trip")!.revokedAt).not.toBeNull(), { timeout: 3_000 })
  })
})

describe("the giver's page", () => {
  it("a gift link: the Pot, its people count, the group's note; presets; the note; Send → Thank you (the gift lands with its note)", async () => {
    const user = userEvent.setup()
    render(<GiftLinkFlow slug="leos-birthday" id={BIRTHDAY_LINKS.open} initial={null} />)
    expect(await screen.findByRole("heading", { level: 1, name: "Send Leo's Birthday a gift" })).toBeTruthy()
    expect(screen.getByText("2 people are in this Pot")).toBeTruthy()
    expect(screen.getByText("Leo turns 30 on Saturday 🎉")).toBeTruthy()
    expect(screen.getByRole("radio", { name: "$5, 1 coffee" }).getAttribute("aria-checked")).toBe("true")
    await user.click(screen.getByRole("radio", { name: "$10, 2 coffees" }))
    expect((screen.getByRole("textbox", { name: "Your name (optional)" }) as HTMLInputElement).value).toBe("Alex")
    await user.type(screen.getByRole("textbox", { name: "Note (optional)" }), "Cake money!")
    expect(screen.getByText("Giving as Alex")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Send $10 ☕" }))
    expect(await screen.findByRole("heading", { name: "Thank you!" }, { timeout: 3_000 })).toBeTruthy()
    expect(screen.getByText("$10 is on its way to Leo's Birthday.")).toBeTruthy()
    expect(screen.getByText("They'll see your note.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Start your own Pot" }).getAttribute("href")).toBe("/")
    const g = world().gifts!.at(-1)!
    expect(g).toMatchObject({ pot: "leos-birthday", from: "alex", name: "Alex", note: "Cake money!", amount: 1_000, linkId: BIRTHDAY_LINKS.open, showPublic: false })
  })

  it("another amount: prefilled $5, at least $1", async () => {
    const user = userEvent.setup()
    render(<GiftLinkFlow slug="leos-birthday" id={BIRTHDAY_LINKS.open} initial={null} />)
    await user.click(await screen.findByRole("radio", { name: "Other amount" }))
    const input = screen.getByRole("textbox", { name: "Gift amount in dollars" }) as HTMLInputElement
    expect(input.value).toBe("5")
    await user.clear(input)
    await user.type(input, "0.5")
    expect((screen.getByRole("button", { name: /Send/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("The smallest gift is $1.")).toBeTruthy()
    await user.clear(input)
    await user.type(input, "7.50")
    expect((screen.getByRole("button", { name: "Send $7.50 ☕" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("a fixed-amount link: one button 'Send $25 ☕'", async () => {
    render(<GiftLinkFlow slug="leos-birthday" id={BIRTHDAY_LINKS.fixed} initial={null} />)
    expect(await screen.findByText("This link is for a $25 gift.")).toBeTruthy()
    expect(screen.queryByRole("radio", { name: /coffee/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Send $25 ☕" })).toBeTruthy()
  })

  it("signed out: Send → sign in inline (the mock signs the guest in as Alex) → sent", async () => {
    store.setSession(null)
    const user = userEvent.setup()
    render(<GiftLinkFlow slug="leos-birthday" id={BIRTHDAY_LINKS.open} initial={null} />)
    await user.click(await screen.findByRole("button", { name: "Send $5 ☕" }))
    expect(screen.getByRole("heading", { name: "Sign in to send your $5 gift" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Continue with Google" }))
    expect(await screen.findByRole("heading", { name: "Thank you!" }, { timeout: 6_000 })).toBeTruthy()
    expect(world().gifts!.at(-1)).toMatchObject({ from: "alex", amount: 500 })
  }, 10_000)

  it("the public page: totals and only the givers who chose to be shown; 'show my name and note' is offered", async () => {
    render(<GiftPageFlow slug="leos-birthday" initial={null} />)
    expect(await screen.findByText("$40 from 3 gifts so far")).toBeTruthy()
    expect(screen.getByText("Help us throw Leo the best birthday ☕")).toBeTruthy()
    const givers = screen.getByRole("region", { name: "Thanks to" })
    expect(within(givers).getAllByRole("listitem").map((li) => li.getAttribute("data-give-giver"))).toEqual(["Ana"])
    expect(document.body.textContent).not.toContain("Tomás")
    expect(document.body.textContent).not.toContain("For the cake")
    expect(screen.getByRole("switch", { name: "Show my name and note on this page" }).getAttribute("aria-checked")).toBe("false")
  })

  it("every state that stops a gift has its own screen", async () => {
    // the public page is off until a member turns it on
    const { unmount } = render(<GiftPageFlow slug="lisbon-trip" initial={null} />)
    expect(await screen.findByRole("heading", { name: "This gift page isn't open" })).toBeTruthy()
    unmount()
    // gifts off
    store.setSession("maya")
    await act(() => store.setGiftsOn("leos-birthday", false))
    store.setSession("alex")
    const r2 = render(<GiftLinkFlow slug="leos-birthday" id={BIRTHDAY_LINKS.open} initial={null} />)
    expect(await screen.findByRole("heading", { name: "Leo's Birthday isn't taking gifts right now" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull()
    r2.unmount()
    // an unknown link
    render(<GiftLinkFlow slug="leos-birthday" id={"z".repeat(22)} initial={null} />)
    expect(await screen.findByRole("heading", { name: "This gift link doesn't exist" })).toBeTruthy()
    // the pure rule
    expect(blockedOf({ id: "x", amount: null, note: null, status: "revoked", expiresAt: 0 }, "yes")).toBe("revoked")
    expect(blockedOf(null, "goal", true)).toBe("goal")
    expect(blockedOf(null, "yes", false)).toBe("page_off")
    expect(blockedOf(null, "yes", true)).toBeNull()
  })
})

vi.setConfig({ testTimeout: 10_000 })
