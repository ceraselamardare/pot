// @vitest-environment jsdom
// Gifts (hub 1.2.0) over the mock data source (the showcase seed: Leo's Birthday has three gifts, its public page on,
// an open and a $25 gift link, all from before the "pay in" tone, so they read as gifts): the members' feed row and
// details, the giver's pages in the gift tone (presets, the fixed amount, the note, inline sign-in, thank-you), the
// public page's opted-in givers and every blocked state. The payment tone, Ask, Ask anyone and the Settings tab's
// "Money from outside" are in payin.test.tsx.
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DepositDetailsSheet } from "@/components/deposits/DepositDetailsSheet"
import { GiftRow } from "@/components/gifts/GiftRow"
import { GiftLinkFlow, GiftPageFlow, blockedOf } from "@/components/gifts/GiveFlow"
import { findBanned } from "@/i18n/banned.mjs"
import { BIRTHDAY_LINKS } from "@/lib/client/mock/gifts"
import * as store from "@/lib/client/mock/store"
import type { GiftVM, World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"

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
    const g: GiftVM = { ref: "g1", from: { id: "ana", name: "Ana", initials: "A", joinIndex: null }, note: "Happy birthday", showPublic: true, amount: 10_000_000n, at: Date.now() - 60_000, linkId: null, tone: "gift" }
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

  it("the details (the money-in sheet): who, how much, the page, the note (members), 'Shown on the public page', the group rule; no marigold", () => {
    store.setSession("maya")
    const v = pot("leos-birthday")
    const ana = v.gifts!.items.find((g) => g.from.name === "Ana")!
    render(<DepositDetailsSheet pot={v} depositKey={ana.ref} meId="maya" open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "Ana sent a $10 gift" })
    expect(within(d).getByText("Happy birthday Leo! Coffee's on me ☕")).toBeTruthy()
    expect(within(d).getByText("Shown on the public page")).toBeTruthy()
    expect(within(d).getByText("A gift from outside")).toBeTruthy()
    expect(within(d).getByText("On the public page")).toBeTruthy()
    expect(within(d).getByText(/Money from outside belongs to the whole group/)).toBeTruthy()
    expect(d.querySelector("[data-deposit-status='added'] [data-status]")!.textContent).toBe("Added")
    expect(d.querySelector(".bg-brand")).toBeNull()
    expect(findBanned(d.textContent ?? "")).toBeNull()
  })

  it("an unknown gift says it isn't here", () => {
    store.setSession("maya")
    render(<DepositDetailsSheet pot={pot("leos-birthday")} depositKey="g00000000000000000000nope" meId="maya" open onClose={() => {}} />)
    expect(screen.getByText("We can't show this one. It may not be here any more.")).toBeTruthy()
  })
})

describe("the giver's page", () => {
  it("a gift link: the Pot, its people count, the group's note; presets; the note; Send → Thank you (the gift lands with its note)", async () => {
    const user = userEvent.setup()
    render(<GiftLinkFlow slug="leos-birthday" id={BIRTHDAY_LINKS.open} initial={null} />)
    expect(await screen.findByRole("heading", { level: 1, name: "Send Leo's Birthday a gift" })).toBeTruthy()
    expect(screen.getByText("2 people are in this Pot")).toBeTruthy()
    expect(screen.getByText("Leo turns 30 on Saturday 🎉")).toBeTruthy()
    // the middle preset is picked to start with
    expect(screen.getByRole("radio", { name: "$10, 2 coffees" }).getAttribute("aria-checked")).toBe("true")
    await user.click(screen.getByRole("radio", { name: "$5, 1 coffee" }))
    await user.click(screen.getByRole("radio", { name: "$10, 2 coffees" }))
    expect((screen.getByRole("textbox", { name: "Your name (optional)" }) as HTMLInputElement).value).toBe("Alex")
    await user.type(screen.getByRole("textbox", { name: "Note (optional)" }), "Cake money!")
    expect(screen.getByText("Signed in as Alex")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Send $10 ☕" }))
    expect(await screen.findByRole("heading", { name: "Thank you!" }, { timeout: 3_000 })).toBeTruthy()
    expect(screen.getByText("$10 is on its way to Leo's Birthday.")).toBeTruthy()
    expect(screen.getByText("They'll see your note.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Start your own Pot" }).getAttribute("href")).toBe("/")
    const g = world().gifts!.at(-1)!
    expect(g).toMatchObject({ pot: "leos-birthday", from: "alex", name: "Alex", note: "Cake money!", amount: 1_000, linkId: BIRTHDAY_LINKS.open, showPublic: false })
  })

  it("another amount: prefilled with the middle preset ($10), at least $1", async () => {
    const user = userEvent.setup()
    render(<GiftLinkFlow slug="leos-birthday" id={BIRTHDAY_LINKS.open} initial={null} />)
    await user.click(await screen.findByRole("radio", { name: "Other amount" }))
    const input = screen.getByRole("textbox", { name: "Amount in dollars" }) as HTMLInputElement
    expect(input.value).toBe("10")
    await user.clear(input)
    await user.type(input, "0.5")
    expect((screen.getByRole("button", { name: /Send/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("The smallest amount is $1.")).toBeTruthy()
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
    await user.click(await screen.findByRole("button", { name: "Send $10 ☕" }))
    expect(screen.getByRole("heading", { name: "Sign in to send your $10 gift" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Continue with Google" }))
    expect(await screen.findByRole("heading", { name: "Thank you!" }, { timeout: 6_000 })).toBeTruthy()
    expect(world().gifts!.at(-1)).toMatchObject({ from: "alex", amount: 1_000, tone: "gift" })
  }, 10_000)

  it("the public page: totals and only the givers who chose to be shown; 'Show my name on this page' is offered", async () => {
    render(<GiftPageFlow slug="leos-birthday" initial={null} />)
    expect(await screen.findByText("$40 from 3 gifts so far")).toBeTruthy()
    expect(screen.getByText("Help us throw Leo the best birthday ☕")).toBeTruthy()
    const givers = screen.getByRole("region", { name: "Thanks to" })
    expect(within(givers).getAllByRole("listitem").map((li) => li.getAttribute("data-give-giver"))).toEqual(["Ana"])
    expect(document.body.textContent).not.toContain("Tomás")
    expect(document.body.textContent).not.toContain("For the cake")
    expect(screen.getByText("— from the group")).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Show my name on this page" }).getAttribute("aria-checked")).toBe("false")
  })

  it("every state that stops a gift has its own screen", async () => {
    // the public page is off until a member turns it on
    const { unmount } = render(<GiftPageFlow slug="lisbon-trip" initial={null} />)
    expect(await screen.findByRole("heading", { name: "This page isn't open" })).toBeTruthy()
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
    expect(await screen.findByRole("heading", { name: "This link doesn't exist" })).toBeTruthy()
    // the pure rule
    expect(blockedOf({ id: "x", amount: null, note: null, status: "revoked", expiresAt: 0, tone: "gift" }, "yes")).toBe("revoked")
    expect(blockedOf(null, "goal", true)).toBe("goal")
    expect(blockedOf(null, "yes", false)).toBe("page_off")
    expect(blockedOf(null, "yes", true)).toBeNull()
  })
})

vi.setConfig({ testTimeout: 10_000 })
