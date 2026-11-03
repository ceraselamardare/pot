// @vitest-environment jsdom
// Pay by link components over the mock data source (the Surf Camp showcase): the Share card (the link with its
// #secret, Copy → "Link copied", the QR replacing the card), feed rows ("Link sent", "Claimed", "Returned"; the
// row's name "… Claimed by Alex", "… Returned to the Pot"), the Spend sheet's link fields (on / off), and the claim page island end to end (wrong
// secret, ready → claimed into the guest's Pot dollars).
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ClaimFlow } from "@/components/paylink/ClaimFlow"
import { LinkShareActions, LinkShareBody, useLinkShare } from "@/components/paylink/LinkShare"
import { LinkRow } from "@/components/paylink/LinkRow"
import { PayLinkFields } from "@/components/paylink/PayLinkFields"
import { SURF_LINKS } from "@/lib/client/mock/fixtures"
import { withLinkShowcase } from "@/lib/client/mock/links"
import * as store from "@/lib/client/mock/store"
import * as W from "@/lib/client/mock/world"
import type { World } from "@/lib/client/mock/types"

const NOW = Date.now()

function seedShowcase() {
  localStorage.setItem("pot.mock.world.v1", JSON.stringify(withLinkShowcase(W.seedWorld(NOW), NOW)))
}
const world = (): World => JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as World
const req = (id: number, me = "maya") => W.requestView(world(), "surf-camp", id, me, Date.now())!

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  seedShowcase()
  store.setSession("maya")
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

function Share() {
  const s = useLinkShare({ slug: "surf-camp", requestId: 113, secret: SURF_LINKS.open.secret, amount: 30_000_000n, potName: "Surf Camp", from: "Maya", label: "Surf school", expiresAt: NOW + 86_400_000 })
  return (
    <>
      <LinkShareBody s={s} />
      <LinkShareActions s={s} />
    </>
  )
}

describe("the Share card", () => {
  it("QR first: the QR carries the link with its #secret (never shown raw), who it's for, the warnings; Copy → 'Link copied'", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    render(<Share />)
    const link = document.querySelector("[data-paylink-url]")!
    expect(link.getAttribute("data-paylink-url")).toBe(`${window.location.origin}/c/surf-camp/113#${SURF_LINKS.open.secret}`)
    expect(screen.getByText("For Surf school")).toBeTruthy()
    expect(screen.getByText(/Anyone who has this link can take the money/)).toBeTruthy()
    expect(screen.getByText(/saved only on this device/)).toBeTruthy()
    expect(screen.getByRole("img", { name: "QR code for the link to send $30" })).toBeTruthy()
    expect((link as HTMLElement).hidden).toBe(true)
    expect(screen.queryByRole("button", { name: /QR code/ })).toBeNull()
    // Share is the marigold, Copy is secondary
    expect(screen.getByRole("button", { name: "Share link" }).getAttribute("data-variant")).toBe("primary")
    await user.click(screen.getByRole("button", { name: "Copy link" }))
    expect(writeText).toHaveBeenCalledWith(link.getAttribute("data-paylink-url"))
    expect(await screen.findByRole("button", { name: "Link copied" })).toBeTruthy()
  })
})

describe("feed rows", () => {
  it("say where each link is, with the status as icon + word", () => {
    render(
      <ul>
        <LinkRow r={req(113)} />
        <LinkRow r={req(111)} />
        <LinkRow r={req(112)} />
      </ul>,
    )
    const rows = screen.getAllByRole("listitem")
    // the row's name says it all; the row shows the short form ("Maya · Tickets" + "Link sent")
    const [open, claimed, returned] = screen.getAllByRole("button")
    expect(open!.getAttribute("aria-label")).toMatch(/^Maya sent Surf school \$30 by link for Surf lessons\. Link sent · waiting to be claimed/)
    expect(rows[0]!.querySelector("[data-row-title]")!.textContent).toBe("Maya · Tickets")
    expect(rows[0]!.querySelector("[data-status='link-ready']")!.textContent).toBe("Link sent")
    expect(rows[0]!.querySelector("[data-status='link-ready'] svg")).not.toBeNull()
    expect(claimed!.getAttribute("aria-label")).toContain("Claimed by Alex")
    expect(rows[1]!.querySelector("[data-status='link-claimed']")!.textContent).toBe("Claimed")
    expect(returned!.getAttribute("aria-label")).toContain("Nobody took it in time · Returned to the Pot")
    expect(rows[2]!.querySelector("[data-status='link-returned']")!.textContent).toBe("Returned")
    // money back in the Pot: struck through, never "−"
    expect(rows[2]!.querySelector("[data-money]")!.className).toContain("line-through")
    expect(rows[0]!.querySelector("[data-money]")!.textContent).toContain("−")
  })
})

describe("the Spend sheet's link fields", () => {
  it("offer an optional label only members see; a Pot from before links says they're off", () => {
    const surf = W.potView(world(), "surf-camp", "maya", NOW)!
    const { unmount } = render(<PayLinkFields pot={surf} label="" onLabel={() => {}} />)
    expect(screen.getByRole("textbox", { name: "Who's it for? (optional)" }).getAttribute("maxlength")).toBe("40")
    expect(screen.getByText("Only people in Surf Camp see this.")).toBeTruthy()
    unmount()
    const lisbon = W.potView(world(), "lisbon-trip", "maya", NOW)!
    render(<PayLinkFields pot={lisbon} label="" onLabel={() => {}} />)
    expect(screen.getByText(/Sending money by link is off here/)).toBeTruthy()
  })
})

describe("the claim page island", () => {
  const initial = () => store.claimLinkView(world(), "surf-camp", 113, Date.now())

  it("refuses another link's secret", async () => {
    window.history.replaceState(null, "", `/c/surf-camp/113#${SURF_LINKS.claimed.secret}`)
    render(<ClaimFlow slug="surf-camp" id={113} initial={initial()} />)
    expect(await screen.findByText("This link doesn't match")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Get $30" })).toBeNull()
  })

  it("a guest: Get $30 → '$30 is yours' with their Pot dollars; the secret leaves the address bar", async () => {
    const user = userEvent.setup()
    store.setSession("alex")
    window.history.replaceState(null, "", `/c/surf-camp/113#${SURF_LINKS.open.secret}`)
    render(<ClaimFlow slug="surf-camp" id={113} initial={initial()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Maya sent you $30 from Surf Camp" })).toBeTruthy()
    const get = await screen.findByRole("button", { name: "Get $30" })
    expect(get.getAttribute("data-variant")).toBe("primary")
    await user.click(get)
    await waitFor(() => expect(screen.getByRole("heading", { name: "$30 is yours" })).toBeTruthy(), { timeout: 5_000 })
    expect(document.querySelector("[data-claim-balance]")!.textContent).toBe("$90.00")
    await waitFor(() => expect(window.location.hash).toBe(""))
    expect(world().pots["surf-camp"]!.requests.find((r) => r.id === 113)!.link).toMatchObject({ status: "claimed", claimer: "alex" })
    await act(async () => {})
  })
})
