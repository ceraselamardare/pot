// @vitest-environment jsdom
// Comments on a request (components/comments/RequestComments.tsx) over the mock data source: the seeded thread, a
// labelled composer, optimistic send + the status announcement, retry after a failed send (same key, posted once),
// the author's own delete ("Comment removed"), the counter near 280, Enter to send, and the cards' count.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CommentCount, RequestComments } from "@/components/comments/RequestComments"
import * as store from "@/lib/client/mock/store"
import * as W from "@/lib/client/mock/world"

const SLUG = "porto-weekend"

function potAs(who: "maya" | "sam" | "leo") {
  const w = JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as ReturnType<typeof W.seedWorld>
  return W.potView(w, SLUG, who, Date.now())!
}

function storedComments() {
  return (JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as ReturnType<typeof W.seedWorld>).comments ?? []
}

beforeEach(() => {
  localStorage.clear()
  store.setSession("maya")
  store.resetWorld()
})
afterEach(() => cleanup())

describe("RequestComments", () => {
  it("shows the thread oldest first with names and times, and a labelled composer", () => {
    render(<RequestComments pot={potAs("maya")} r={{ id: 11, slug: SLUG }} />)
    const section = screen.getByRole("region", { name: "Comments · 2" })
    const items = within(section).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain("You")
    expect(items[0]!.textContent).toContain("cheaper on the day")
    expect(items[1]!.textContent).toContain("Sam")
    expect(items[1]!.querySelector("time")).not.toBeNull()
    const box = screen.getByRole("textbox", { name: "Write a comment" })
    expect(box.getAttribute("aria-describedby")).toBeTruthy()
    expect(screen.getByText("Everyone in Porto Weekend can read it.")).toBeTruthy()
    // Send is secondary (never the marigold) and disabled while empty
    const send = screen.getByRole("button", { name: "Send" })
    expect(send.getAttribute("data-variant")).toBe("secondary")
    expect(send.hasAttribute("disabled")).toBe(true)
    // only my own comment can be deleted
    expect(screen.getAllByRole("button", { name: /^Delete your comment/ })).toHaveLength(1)
  })

  it("an empty thread says so", async () => {
    const { id } = await store.requestSpend("lisbon-trip", { amountCents: 30_000, category: "tickets", receiver: "maya" })
    const w = JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as ReturnType<typeof W.seedWorld>
    render(<RequestComments pot={W.potView(w, "lisbon-trip", "maya", Date.now())!} r={{ id, slug: "lisbon-trip" }} />)
    expect(screen.getByRole("region", { name: "Comments" })).toBeTruthy()
    expect(screen.getByText("No comments yet. Ask a question or add a detail for the group.")).toBeTruthy()
  })

  it("sends optimistically (Sending…), then shows it and announces 'Comment sent.'", async () => {
    const user = userEvent.setup()
    render(<RequestComments pot={potAs("maya")} r={{ id: 11, slug: SLUG }} />)
    const box = screen.getByRole("textbox", { name: "Write a comment" })
    await user.type(box, "  Sounds good  ")
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect((box as HTMLTextAreaElement).value).toBe("")
    expect(document.activeElement).toBe(box)
    expect(screen.getByText("Sending…")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Comments · 3" })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Comment sent."))
    expect(screen.queryByText("Sending…")).toBeNull()
    expect(storedComments().at(-1)).toMatchObject({ author: "maya", body: "Sounds good", requestId: 11 })
  })

  it("Enter sends, Shift+Enter breaks the line", async () => {
    const user = userEvent.setup()
    render(<RequestComments pot={potAs("maya")} r={{ id: 11, slug: SLUG }} />)
    const box = screen.getByRole("textbox", { name: "Write a comment" })
    await user.type(box, "one{Shift>}{Enter}{/Shift}two{Enter}")
    await waitFor(() => expect(storedComments().at(-1)).toMatchObject({ body: "one\ntwo" }))
  })

  it("a failed send stays with 'Not sent.' and Try again; the retry posts it once", async () => {
    const user = userEvent.setup()
    render(<RequestComments pot={potAs("maya")} r={{ id: 11, slug: SLUG }} />)
    localStorage.setItem("pot.mock.fail", "comment")
    await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "Retry me")
    await user.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() => expect(screen.getByText("Not sent.")).toBeTruthy())
    expect(screen.getByRole("status").textContent).toBe("Your comment wasn't sent. Try again.")
    expect(storedComments().some((c) => c.body === "Retry me")).toBe(false)
    await user.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Comment sent."))
    expect(storedComments().filter((c) => c.body === "Retry me")).toHaveLength(1)
    expect(screen.queryByText("Not sent.")).toBeNull()
  })

  it("Discard drops a failed comment", async () => {
    const user = userEvent.setup()
    render(<RequestComments pot={potAs("maya")} r={{ id: 11, slug: SLUG }} />)
    localStorage.setItem("pot.mock.fail", "comment")
    await user.type(screen.getByRole("textbox", { name: "Write a comment" }), "Never mind")
    await user.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() => expect(screen.getByText("Not sent.")).toBeTruthy())
    await user.click(screen.getByRole("button", { name: "Discard" }))
    expect(screen.queryByText("Never mind")).toBeNull()
    expect(screen.getByRole("region", { name: "Comments · 2" })).toBeTruthy()
  })

  it("the author deletes their own: 'Comment removed', focus back in the composer, announced", async () => {
    const user = userEvent.setup()
    render(<RequestComments pot={potAs("maya")} r={{ id: 11, slug: SLUG }} />)
    await user.click(screen.getByRole("button", { name: /^Delete your comment/ }))
    await waitFor(() => expect(screen.getByText("Comment removed")).toBeTruthy())
    expect(screen.queryByText(/cheaper on the day/)).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("Comment deleted.")
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Write a comment" }))
    expect(screen.getByRole("region", { name: "Comments · 1" })).toBeTruthy()
    expect(screen.queryAllByRole("button", { name: /^Delete your comment/ })).toHaveLength(0)
  })

  it("Sam sees Maya's comment without a Delete button", () => {
    store.setSession("sam")
    render(<RequestComments pot={potAs("sam")} r={{ id: 11, slug: SLUG }} />)
    const items = screen.getAllByRole("listitem")
    expect(items[0]!.textContent).toContain("Maya")
    expect(within(items[0]!).queryByRole("button")).toBeNull()
    expect(within(items[1]!).getByRole("button", { name: /^Delete your comment/ })).toBeTruthy()
  })

  it("the counter shows near 280 and blocks sending past it", async () => {
    render(<RequestComments pot={potAs("maya")} r={{ id: 11, slug: SLUG }} />)
    const box = screen.getByRole("textbox", { name: "Write a comment" }) as HTMLTextAreaElement
    const set = async (v: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
        setter.call(box, v)
        box.dispatchEvent(new Event("input", { bubbles: true }))
      })
    }
    await set("x".repeat(200))
    expect(document.querySelector("[data-comment-counter]")).toBeNull()
    await set("x".repeat(250))
    expect(screen.getByText("30 characters left")).toBeTruthy()
    expect(box.getAttribute("aria-describedby")).toContain("counter")
    await set("x".repeat(281))
    expect(screen.getByText("1 character too many")).toBeTruthy()
    expect(box.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true)
    await set("🍷".repeat(280)) // an emoji counts once, like the server
    expect(screen.getByText("0 characters left")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(false)
  })
})

describe("CommentCount", () => {
  it("nothing at 0; the icon, the number and a spoken label otherwise", () => {
    const { container, rerender } = render(<CommentCount n={0} />)
    expect(container.textContent).toBe("")
    rerender(<CommentCount n={3} />)
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(container.textContent).toBe("33 comments")
    expect(screen.getByText("3 comments").className).toContain("sr-only")
    rerender(<CommentCount n={1} />)
    expect(screen.getByText("1 comment")).toBeTruthy()
  })
})
