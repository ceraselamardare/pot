// @vitest-environment jsdom
// Create Pot step 2 "Pot rules": no templates; each editable rule is a sentence with an inline amount, the fixed
// rules are plain lines, and [Create Pot] sends exactly the rules on the form (createPot → preset "custom").
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createPot = vi.fn<(input: unknown) => Promise<string>>(async () => "ski-weekend-a1b2")
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock("@/lib/client/actions", () => ({ createPot: (i: unknown) => createPot(i) }))
vi.mock("@/lib/client/invite", () => ({ generateInvite: async () => ({ pk: "ed25519:x", secret: "s" }) }))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))

import { CreatePotSheet } from "@/components/sheets/CreatePotSheet"

afterEach(cleanup)
beforeEach(() => createPot.mockClear())

function toStep2() {
  render(<CreatePotSheet open onClose={() => {}} />)
  fireEvent.change(screen.getByRole("textbox", { name: /Pot name/ }), { target: { value: "Ski Weekend" } })
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  return screen.getByRole("dialog", { name: "Pot rules" })
}
const instant = () => screen.getByRole("textbox", { name: "Anyone can spend up to this much at a time without asking" })
const perPerson = () => screen.getByRole("textbox", { name: "Each person can spend up to this much in total without asking" })
const type = (el: HTMLElement, value: string) => {
  fireEvent.change(el, { target: { value } })
  fireEvent.blur(el)
}

describe("Create step 2: Pot rules", () => {
  it("shows the rules as sentences with their defaults, the fixed rules and no templates", () => {
    const d = toStep2()
    expect(within(d).getByText("Step 2 of 2")).toBeTruthy()
    expect(instant()).toHaveProperty("value", "100")
    expect(perPerson()).toHaveProperty("value", "200")
    expect(within(d).getByText("Anyone can spend up to")).toBeTruthy()
    expect(within(d).getByText("at a time without asking")).toBeTruthy()
    expect(within(d).getByRole("radio", { name: "Members only" })).toHaveProperty("checked", true)
    expect(within(d).getByRole("radio", { name: "Members and people I name" })).toHaveProperty("checked", false)
    expect(within(d).getByRole("switch", { name: "Everyone chips in (optional)" }).getAttribute("aria-checked")).toBe("true")
    const fixed = within(d).getByRole("region", { name: "Every Pot works like this" })
    expect(within(fixed).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Bigger spends need more than half the group",
      "Leftovers go back to everyone, in proportion to what they put in",
      "Requests expire after 7 days",
      "Up to 40 people",
    ])
    expect(within(d).getByText("The group can change these later together.")).toBeTruthy()
    for (const gone of [/Trip/, /Club/, /Team/, /Coming soon/]) expect(within(d).queryByText(gone)).toBeNull()
    // inputs are 16 px text with tabular figures
    expect(instant().className).toContain("text-body")
    expect(instant().className).toContain("tabular-nums")
    expect(instant().getAttribute("inputmode")).toBe("decimal")
  })

  it("explains a $0 instant limit and a per-person limit below it", () => {
    const d = toStep2()
    type(instant(), "0")
    expect(within(d).getByText("With $0, every spend needs more than half the group to approve.")).toBeTruthy()
    type(instant(), "100")
    fireEvent.change(perPerson(), { target: { value: "50" } })
    expect(within(d).getByText("Make this at least $100, the amount anyone can spend at a time.")).toBeTruthy()
    expect(perPerson().getAttribute("aria-invalid")).toBe("true")
  })

  it("blocks [Create Pot] until the rules are right, then sends them", async () => {
    const d = toStep2()
    fireEvent.change(perPerson(), { target: { value: "50" } })
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    expect(within(d).getByRole("alert").textContent).toContain("Check the rules above, then try again.")
    expect(createPot).not.toHaveBeenCalled()

    type(instant(), "25")
    type(perPerson(), "60")
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    await waitFor(() => expect(createPot).toHaveBeenCalledTimes(1))
    expect(createPot.mock.calls[0]![0]).toMatchObject({
      name: "Ski Weekend",
      goalEachCents: 15_000,
      rules: { instantCap: 25_000_000n, memberBudget: 60_000_000n, instantPayees: "members", payeeAllowlist: [] },
    })
  })

  it("named people: fields, validation and the limit of 10", async () => {
    const d = toStep2()
    fireEvent.click(within(d).getByRole("radio", { name: "Members and people I name" }))
    const first = within(d).getByRole("textbox", { name: "Person 1" })
    type(first, "Sam Near")
    expect(within(d).getByText("This doesn't look like a name. Names look like sam.near.")).toBeTruthy()
    type(first, "sam.near")
    fireEvent.click(within(d).getByRole("button", { name: "Add a person" }))
    type(within(d).getByRole("textbox", { name: "Person 2" }), "sam.near")
    expect(within(d).getByText("You've already added this person.")).toBeTruthy()
    type(within(d).getByRole("textbox", { name: "Person 2" }), "bakery.near")
    for (let i = 0; i < 8; i++) fireEvent.click(within(d).getByRole("button", { name: "Add a person" }))
    expect(within(d).getAllByRole("textbox", { name: /^Person \d+$/ })).toHaveLength(10)
    expect(within(d).queryByRole("button", { name: "Add a person" })).toBeNull()
    expect(within(d).getByText("That's 10 people, the most you can name.")).toBeTruthy()

    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    await waitFor(() => expect(createPot).toHaveBeenCalledTimes(1))
    expect(createPot.mock.calls[0]![0]).toMatchObject({
      rules: { instantCap: 100_000_000n, memberBudget: 200_000_000n, instantPayees: "members_and_allowlist", payeeAllowlist: ["sam.near", "bakery.near"] },
    })
  })

  it("members and people I name needs at least one person", () => {
    const d = toStep2()
    fireEvent.click(within(d).getByRole("radio", { name: "Members and people I name" }))
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    expect(within(d).getByText("Add at least one person, or choose Members only.")).toBeTruthy()
    expect(createPot).not.toHaveBeenCalled()
  })
})

describe("Create: Back", () => {
  it("step 2 [Back] (chevron + 'Back', not marigold) returns to step 1 with the name and the edited rules kept", () => {
    const d = toStep2()
    type(instant(), "40")
    const back = within(d).getByRole("button", { name: "Back" })
    expect(back.getAttribute("data-variant")).toBe("ghost")
    expect(back.querySelector("svg")).not.toBeNull()
    fireEvent.click(back)
    const step1 = screen.getByRole("dialog", { name: "Name your Pot" })
    expect(within(step1).getByRole("textbox", { name: /Pot name/ })).toHaveProperty("value", "Ski Weekend")
    expect(within(step1).queryByRole("button", { name: "Back" })).toBeNull()
    fireEvent.click(within(step1).getByRole("button", { name: "Next" }))
    expect(instant()).toHaveProperty("value", "40")
  })
})
