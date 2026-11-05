// @vitest-environment jsdom
// The client fixes from the security audit of 2026-11-04 (notes/security-audit-2026-11-04.md), on the mock data source:
//  - CLI-3: the Approve sheet says who gets the money before anyone approves: a member by name ("In this Pot"), anyone
//    else by a Pot-account hint with "Not in this Pot" (icon + word) and a line that the money leaves the group; two
//    people with the same name get the hint under the name;
//  - CLI-4: public pages carry "Made by people who use Pot, not by Pot." and "Report this page"; a Pot with an
//    official-looking name can't turn its public page on (the switch is off-limits and says why).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

import { PublicPageSheet } from "@/components/payin/PublicPageSheet"
import { PublicNotice } from "@/components/public/PublicNotice"
import { ApproveReceiver } from "@/components/sheets/ApproveReceiver"
import { ApproveSheet } from "@/components/sheets/ApproveSheet"
import * as store from "@/lib/client/mock/store"
import type { PersonVM, World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"
import { accountHint, receiverInfo, sameNameKey } from "@/lib/client/receiver"

const WORLD_KEY = "pot.mock.world.v1"
const world = () => JSON.parse(localStorage.getItem(WORLD_KEY)!) as World
/** Write the world as another tab would; the store drops its copy on the storage event (needs a subscriber). */
function writeWorld(w: World) {
  act(() => {
    localStorage.setItem(WORLD_KEY, JSON.stringify(w))
    window.dispatchEvent(new StorageEvent("storage", { key: WORLD_KEY }))
  })
}
/** Something subscribed to the store (as any open screen is). */
function Subscriber() {
  store.useWorld()
  return null
}
const potAs = (slug: string, who: string) => W.potView(world(), slug, who, Date.now())!
const person = (id: string, name: string, joinIndex: number | null = 0): PersonVM => ({ id, name, initials: name.slice(0, 1), joinIndex })
const marigolds = (d: HTMLElement) => [...d.querySelectorAll("button, a")].filter((b) => /(^|\s)bg-brand(\s|$)/.test(b.className))

/** A waiting request in Porto Weekend (Maya + Sam) asked by Sam, paying `receiver`. */
function addRequest(receiver: string, id = 99) {
  const w = world()
  const now = Date.now()
  w.pots["porto-weekend"]!.requests.push({
    id,
    requester: "sam",
    receiver,
    amount: 20_000,
    category: "other",
    note: "Deposit",
    path: "vote",
    reason: "recipient",
    status: "proposed",
    votes: { sam: "Approve" },
    voteAt: { sam: now },
    createdAt: now,
  })
  render(<Subscriber />)
  writeWorld(w)
}

beforeEach(() => {
  localStorage.clear()
  store.setSession("maya")
  store.resetWorld()
})
afterEach(() => cleanup())

describe("CLI-3: who gets the money (lib/client/receiver.ts)", () => {
  const pot = {
    members: [{ person: person("maya", "Maya") }, { person: person("sam", "Sam") }, { person: person("sam2", "ｓａｍ​") }],
  } as never

  it("a member by name; anyone else by the account hint, never their chosen name", () => {
    expect(receiverInfo(pot, { receiver: person("maya", "Maya"), requester: person("sam", "Sam") }, "sam")).toMatchObject({
      kind: "member",
      label: "Maya",
      sameName: false,
      isMe: false,
    })
    expect(receiverInfo(pot, { receiver: person("maya-4f2a.evil.testnet", "Maya"), requester: person("sam", "Sam") }, "maya")).toEqual({
      kind: "outsider",
      label: "maya-4f2a.evil.testnet",
      hint: "maya-4f2a.evil.testnet",
      sameName: false,
      isMe: false,
    })
    expect(receiverInfo(pot, { receiver: person("@link", "someone with the link"), requester: person("sam", "Sam") }, "maya").kind).toBe(
      "link",
    )
  })

  it("the same name (case, width and invisible characters folded) is flagged for both people", () => {
    const r = receiverInfo(pot, { receiver: person("sam", "Sam"), requester: person("maya", "Maya") }, "maya")
    expect(r).toMatchObject({ kind: "member", label: "Sam", sameName: true })
    expect(sameNameKey("ｓａｍ​")).toBe(sameNameKey("Sam"))
  })

  it("account hints: our own sign-ups lose the shared tail, long ones keep both ends", () => {
    const own = ".users.potprev.testnet"
    expect(accountHint("maya-4f2a.users.potprev.testnet", own)).toBe("maya-4f2a")
    expect(accountHint("maya-4f2a.users.potprev.testnet.evil.testnet", own)).toBe("maya-4f2a.use…il.testnet")
    expect(accountHint("x.maya-4f2a.users.potprev.testnet", own)).toBe("x.maya-4f2a.u…ev.testnet")
    expect(accountHint("a".repeat(64), own)).toBe("aaaaaa…aaaa")
    expect(accountHint("bob.testnet", own)).toBe("bob.testnet")
  })
})

describe("CLI-3: the Approve sheet shows the receiver before the decision", () => {
  it("an outsider: the hint, 'Not in this Pot' (icon + word) and the warning, above the one marigold", () => {
    addRequest("maya-4f2a.evil.testnet")
    render(<ApproveSheet pot={potAs("porto-weekend", "maya")} requestId={99} onClose={() => {}} />)
    const d = screen.getByRole("dialog")
    const who = within(d).getByRole("region", { name: "Goes to" })
    expect(who.getAttribute("data-receiver")).toBe("outsider")
    expect(who.querySelector("[data-receiver-name]")!.textContent).toBe("maya-4f2a.evil.testnet")
    const badge = who.querySelector<HTMLElement>("[data-receiver-badge]")!
    expect(badge.textContent).toBe("Not in this Pot")
    expect(badge.querySelector("svg")).not.toBeNull()
    expect(badge.className).toContain("text-declined")
    expect(who.textContent).toContain("This money would leave the group.")
    // it comes before the decision buttons and the sheet keeps exactly one marigold
    const approve = within(d).getByRole("button", { name: /^Approve \$200/ })
    expect(who.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(marigolds(d)).toHaveLength(1)
  })

  it("a member: their name and 'In this Pot', no hint when the name is unique", () => {
    addRequest("sam")
    render(<ApproveSheet pot={potAs("porto-weekend", "maya")} requestId={99} onClose={() => {}} />)
    const who = within(screen.getByRole("dialog")).getByRole("region", { name: "Goes to" })
    expect(who.getAttribute("data-receiver")).toBe("member")
    expect(who.querySelector("[data-receiver-name]")!.textContent).toBe("Sam")
    expect(who.querySelector("[data-receiver-badge]")!.textContent).toBe("In this Pot")
    expect(who.querySelector("[data-receiver-hint]")).toBeNull()
  })

  it("two members with the same name: the hint under the name and a line saying so", () => {
    const pot = {
      members: [
        { person: person("maya", "Maya") },
        { person: person("sam", "Sam", 1) },
        { person: person("sam-9z9z.users.pots.testnet", "Sam", 2) },
      ],
    } as never
    render(
      <ApproveReceiver
        pot={pot}
        r={{ id: 5, receiver: person("sam-9z9z.users.pots.testnet", "Sam", 2), requester: person("maya", "Maya") }}
        me="maya"
      />,
    )
    const who = screen.getByRole("region", { name: "Goes to" })
    expect(who.getAttribute("data-receiver-same-name")).toBe("true")
    expect(who.querySelector("[data-receiver-hint]")!.textContent).toBe("Pot account sam-9z9z")
    expect(who.textContent).toContain("Someone else here is also called Sam.")
  })

  it("a pay-by-link request has no receiver block (its link panel says who it's for)", () => {
    const { container } = render(
      <ApproveReceiver
        pot={{ members: [] } as never}
        r={{ id: 6, receiver: person("@link", "someone with the link"), requester: person("maya", "Maya") }}
        me="maya"
      />,
    )
    expect(container.innerHTML).toBe("")
  })
})

describe("CLI-4: public pages", () => {
  it("say who made them and can be reported in two taps", async () => {
    vi.useFakeTimers()
    render(<PublicNotice page="give" slug="lisbon-trip" />)
    const aside = screen.getByRole("complementary", { name: "About this page" })
    expect(aside.textContent).toContain("Made by people who use Pot, not by Pot.")
    fireEvent.click(within(aside).getByRole("button", { name: "Report this page" }))
    expect(within(aside).getByRole("group", { name: "What's wrong with it?" })).toBeTruthy()
    // the reasons are secondary buttons: the page's own marigold stays the only one
    expect(marigolds(aside)).toHaveLength(0)
    fireEvent.click(within(aside).getByRole("button", { name: "It pretends to be someone else" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(within(aside).getByRole("status").textContent).toBe("Thanks. We'll take a look.")
    vi.useRealTimers()
  })

  it("a Pot with an official-looking name can't turn its public page on, and the sheet says why", () => {
    const w = world()
    w.pots["lisbon-trip"]!.name = "NEAR Foundation"
    localStorage.setItem(WORLD_KEY, JSON.stringify(w))
    render(<PublicPageSheet pot={potAs("lisbon-trip", "maya")} open onClose={() => {}} />)
    const d = screen.getByRole("dialog")
    expect(
      within(d).getByRole("switch").hasAttribute("disabled") || within(d).getByRole("switch").getAttribute("aria-disabled") === "true",
    ).toBe(true)
    const why = d.querySelector<HTMLElement>("[data-page-reserved='name']")!
    expect(why.getAttribute("role")).toBe("alert")
    expect(why.textContent).toContain("Not for this name")
    expect(why.querySelector("svg")).not.toBeNull()
  })

  it("the mock world refuses it too, with our server's refusal (400 bad_request, why: reserved_name)", async () => {
    render(<Subscriber />)
    const w = world()
    w.pots["lisbon-trip"]!.name = "Official Red Cross"
    writeWorld(w)
    await expect(store.setGiftPage("lisbon-trip", { on: true })).rejects.toMatchObject({
      reason: "bad_request",
      detail: { why: "reserved_name" },
    })
    await expect(store.createGiftLink("lisbon-trip", { amount: null, note: null, reusable: true, tone: "payment" })).rejects.toMatchObject({
      detail: { why: "reserved_name" },
    })
    // turning it off is always allowed
    await expect(store.setGiftPage("lisbon-trip", { on: false })).resolves.toBeUndefined()
  })
})
