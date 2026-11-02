// @vitest-environment jsdom
// Create Pot, lean (notes/gifts-plan.md "Lean create flow"): one screen (cover preview + picker, name, "$150 each"
// inline, one rules summary line + [Change], [Create Pot]) whose defaults are exactly the full form's. [Change] opens
// the "Pot rules" step: no templates; each editable rule is a sentence with an inline amount, the fixed rules are
// plain lines, and [Create Pot] sends exactly the rules on the form (createPot → preset "custom").
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

function main() {
  render(<CreatePotSheet open onClose={() => {}} />)
  return screen.getByRole("dialog", { name: "Start a Pot" })
}
/** The drawer focuses its title on open on a timer; let that land before testing where focus goes next. */
const opened = () => waitFor(() => expect(document.activeElement?.tagName).toBe("H2"))
function toStep2() {
  const d = main()
  fireEvent.change(within(d).getByRole("textbox", { name: /Pot name/ }), { target: { value: "Ski Weekend" } })
  fireEvent.click(within(d).getByRole("button", { name: "Change the rules" }))
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
    expect(within(d).queryByText(/Step \d of \d/)).toBeNull()
    expect(instant()).toHaveProperty("value", "100")
    expect(perPerson()).toHaveProperty("value", "200")
    expect(within(d).getByText("Anyone can spend up to")).toBeTruthy()
    expect(within(d).getByText("at a time without asking")).toBeTruthy()
    expect(within(d).getByRole("radio", { name: "Members only" })).toHaveProperty("checked", true)
    expect(within(d).getByRole("radio", { name: "Members and people I name" })).toHaveProperty("checked", false)
    // "$X each" moved to the main screen; trust, one OK and the goal stay here
    expect(within(d).queryByRole("switch", { name: "Everyone chips in (optional)" })).toBeNull()
    expect(within(d).getByRole("switch", { name: "Trust grows" }).getAttribute("aria-checked")).toBe("true")
    expect(within(d).getByRole("switch", { name: "Set a goal (optional)" }).getAttribute("aria-checked")).toBe("false")
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
  it("rules [Back] (chevron + 'Back', not marigold) returns to the main screen with the name and the edited rules kept", () => {
    const d = toStep2()
    type(instant(), "40")
    const back = within(d).getByRole("button", { name: "Back" })
    expect(back.getAttribute("data-variant")).toBe("ghost")
    expect(back.querySelector("svg")).not.toBeNull()
    fireEvent.click(back)
    const step1 = screen.getByRole("dialog", { name: "Start a Pot" })
    expect(within(step1).getByRole("textbox", { name: /Pot name/ })).toHaveProperty("value", "Ski Weekend")
    expect(within(step1).queryByRole("button", { name: "Back" })).toBeNull()
    // the summary follows the edited rules
    expect(within(step1).getByText("Small spends up to $40 go through on their own; bigger ones go to the group")).toBeTruthy()
    fireEvent.click(within(step1).getByRole("button", { name: "Change the rules" }))
    expect(instant()).toHaveProperty("value", "40")
  })
})

describe("Create: one screen", () => {
  it("shows the cover preview, the name, '$150 each' inline, one rules line with [Change] and one [Create Pot]", () => {
    const d = main()
    expect(within(d).getByText("Lisbon Trip")).toBeTruthy() // the preview's placeholder name
    expect(within(d).getByRole("textbox", { name: /Pot name/ })).toBeTruthy()
    const each = within(d).getByRole("switch", { name: "Everyone chips in (optional)" })
    expect(each.getAttribute("aria-checked")).toBe("true")
    expect(within(d).getByRole("textbox", { name: "Amount each person chips in" })).toHaveProperty("value", "150")
    expect(within(d).getByText("Everyone chips in")).toBeTruthy()
    expect(within(d).getByText("each")).toBeTruthy()
    const summary = within(d).getByText("Small spends up to $100 go through on their own; bigger ones go to the group")
    expect(summary.className).toContain("tabular-nums")
    const change = within(d).getByRole("button", { name: "Change the rules" })
    expect(change.textContent).toBe("Change")
    expect(change.getAttribute("data-variant")).toBe("secondary")
    expect(within(d).getAllByRole("button", { name: "Create Pot" })).toHaveLength(1)
    expect(within(d).getByRole("button", { name: "Create Pot" }).getAttribute("data-variant")).toBe("primary")
    // no steps, no Next, no rule fields, and the emoji/colour picker stays closed until the cover is tapped
    for (const gone of [/Step \d of \d/]) expect(within(d).queryByText(gone)).toBeNull()
    expect(within(d).queryByRole("button", { name: "Next" })).toBeNull()
    expect(within(d).queryByRole("radiogroup")).toBeNull()
    expect(within(d).queryByRole("textbox", { name: /without asking/ })).toBeNull()
  })

  it("the default path (name → Create Pot) sends exactly the full form's defaults", async () => {
    const d = main()
    fireEvent.change(within(d).getByRole("textbox", { name: /Pot name/ }), { target: { value: "Ski Weekend" } })
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    await waitFor(() => expect(createPot).toHaveBeenCalledTimes(1))
    expect(createPot.mock.calls[0]![0]).toMatchObject({
      name: "Ski Weekend",
      emoji: "✈️",
      cover: 0,
      goalEachCents: 15_000,
      rules: { instantCap: 100_000_000n, memberBudget: 200_000_000n, instantPayees: "members", payeeAllowlist: [] },
      extras: { trust: true, oneOkCap: 300_000_000n, links: true, goal: null },
    })
  })

  it("Enter in the name field creates the Pot", async () => {
    const d = main()
    const name = within(d).getByRole("textbox", { name: /Pot name/ })
    fireEvent.change(name, { target: { value: "Ski Weekend" } })
    fireEvent.keyDown(name, { key: "Enter" })
    await waitFor(() => expect(createPot).toHaveBeenCalledTimes(1))
  })

  it("tapping the cover opens the emoji and colour picker; [Done] closes it and returns focus", async () => {
    const d = main()
    const cover = within(d).getByRole("button", { name: "Change the emoji and colour" })
    expect(cover.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(cover)
    expect(cover.getAttribute("aria-expanded")).toBe("true")
    expect(cover.getAttribute("aria-controls")).toBe("create-picker")
    fireEvent.click(within(d).getByRole("radio", { name: "🎿" }))
    fireEvent.click(within(d).getByRole("radio", { name: "Colour 3" }))
    expect(within(d).getByRole("radio", { name: "🎿" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(d).getByRole("button", { name: "Done" }))
    expect(within(d).queryByRole("radiogroup")).toBeNull()
    expect(document.activeElement).toBe(cover)
    expect(cover.textContent).toContain("🎿")
    fireEvent.change(within(d).getByRole("textbox", { name: /Pot name/ }), { target: { value: "Ski Weekend" } })
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    await waitFor(() => expect(createPot).toHaveBeenCalledTimes(1))
    expect(createPot.mock.calls[0]![0]).toMatchObject({ emoji: "🎿", cover: 2 })
  })

  it("a bad name: the error under the field, focus on it, nothing sent", async () => {
    const d = main()
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    expect(within(d).getByText("Use 2–40 letters, numbers or spaces.")).toBeTruthy()
    const name = within(d).getByRole("textbox", { name: /Pot name/ })
    expect(name.getAttribute("aria-invalid")).toBe("true")
    await waitFor(() => expect(document.activeElement).toBe(name))
    expect(createPot).not.toHaveBeenCalled()
  })

  it("'$X each': off sends none; $0 is refused inline", async () => {
    const d = main()
    fireEvent.change(within(d).getByRole("textbox", { name: /Pot name/ }), { target: { value: "Ski Weekend" } })
    fireEvent.change(within(d).getByRole("textbox", { name: "Amount each person chips in" }), { target: { value: "0" } })
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    expect(within(d).getByText("Enter an amount more than $0, or turn this off.")).toBeTruthy()
    expect(createPot).not.toHaveBeenCalled()
    fireEvent.click(within(d).getByRole("switch", { name: "Everyone chips in (optional)" }))
    expect(within(d).queryByRole("textbox", { name: "Amount each person chips in" })).toBeNull()
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    await waitFor(() => expect(createPot).toHaveBeenCalledTimes(1))
    expect(createPot.mock.calls[0]![0]).toMatchObject({ goalEachCents: null })
  })

  it("the summary follows the rules ($0, something to fix); [Create Pot] with a rule to fix opens the rules", async () => {
    let d = toStep2()
    await opened()
    type(instant(), "0")
    fireEvent.click(within(d).getByRole("button", { name: "Back" }))
    d = screen.getByRole("dialog", { name: "Start a Pot" })
    expect(within(d).getByText("Every spend goes to the group")).toBeTruthy()
    fireEvent.click(within(d).getByRole("button", { name: "Change the rules" }))
    type(instant(), "")
    fireEvent.click(within(screen.getByRole("dialog", { name: "Pot rules" })).getByRole("button", { name: "Back" }))
    d = screen.getByRole("dialog", { name: "Start a Pot" })
    expect(within(d).getByText("Some rules need a fix")).toBeTruthy()
    fireEvent.click(within(d).getByRole("button", { name: "Create Pot" }))
    const rules = screen.getByRole("dialog", { name: "Pot rules" })
    expect(within(rules).getByRole("alert").textContent).toContain("Check the rules above, then try again.")
    await waitFor(() => expect(document.activeElement).toBe(instant()))
    expect(createPot).not.toHaveBeenCalled()
  })

  it("a bad name found from the rules step returns to the main screen with the name error", async () => {
    main()
    await opened()
    fireEvent.click(screen.getByRole("button", { name: "Change the rules" }))
    fireEvent.click(within(screen.getByRole("dialog", { name: "Pot rules" })).getByRole("button", { name: "Create Pot" }))
    const d = screen.getByRole("dialog", { name: "Start a Pot" })
    expect(within(d).getByText("Use 2–40 letters, numbers or spaces.")).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(within(d).getByRole("textbox", { name: /Pot name/ })))
    expect(createPot).not.toHaveBeenCalled()
  })
})
