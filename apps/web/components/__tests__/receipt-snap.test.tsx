// @vitest-environment jsdom
// "Scan receipt" in the two-step Spend sheet: on step 1 (by the amount) a reading pre-fills the amount, the reason
// chip and a short note and moves on to step 2 ("What's it for?"), where the receipt is one row (merchant · total;
// details, items and "Read privately" behind its ⌄) and is announced. Another currency comes converted at a live
// rate ("€42.50 ≈ $46.12 · rate 1.0852 from today"); with no rate it stays on step 1 and offers "Use 42.50 as
// dollars". Failures say what to do and the keypad keeps working; Cancel and Remove give the form back.
// Only Next / Get money back is marigold.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mockReceipt, type ReceiptFx, type ReceiptReadRes } from "@/lib/receipt"

const box = vi.hoisted(() => ({ enabled: true }))
const readPhoto = vi.hoisted(() => vi.fn<(slug: string, file: File, signal?: AbortSignal) => Promise<ReceiptReadRes>>())
vi.mock("@/lib/client/receipts/read", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/receipts/read")>()),
  readReceiptPhoto: (slug: string, file: File, signal?: AbortSignal) => readPhoto(slug, file, signal),
  useReceiptsEnabled: () => box.enabled,
}))
const spend = vi.hoisted(() => vi.fn())
vi.mock("@/lib/client/actions", () => ({ requestSpend: spend }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

import { SpendSheet } from "@/components/sheets/SpendSheet"
import { ReceiptReadError } from "@/lib/client/receipts/read"
import { potView, seedWorld } from "@/lib/client/mock/world"

const NOW = Date.UTC(2026, 10, 3, 12)
const pot = potView(seedWorld(NOW), "lisbon-trip", "maya", NOW)!

afterEach(cleanup)
beforeEach(() => {
  box.enabled = true
  readPhoto.mockReset()
  spend.mockReset()
})

const res = (name = "receipt.jpg", over: Partial<ReceiptReadRes> = {}): ReceiptReadRes => ({ result: mockReceipt(name), proof: null, source: "mock", fx: null, ...over })
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const EUR_FX: ReceiptFx = { ok: true, from: "EUR", amountCents: 4250, usdCents: 4612, rate: 1.0852, rateDate: localDay(), source: "ecb" }

function open() {
  render(<SpendSheet pot={pot} open onClose={() => {}} />)
  return screen.getByRole("dialog", { name: "Spend from Lisbon Trip" })
}
function snap(d: HTMLElement, name = "receipt.jpg") {
  const input = d.querySelector<HTMLInputElement>("[data-receipt-input='camera']")!
  expect(input.accept).toBe("image/*")
  expect(input.getAttribute("capture")).toBe("environment")
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" })
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  fireEvent.change(input)
}
/** the amount on either step: the big display (step 1) or the summary at the top of step 2 */
const amount = (d: HTMLElement) => (d.querySelector("[data-amount-display]") ?? d.querySelector("[data-spend-amount]"))!.textContent!.replace("How much? ", "")
const step = (d: HTMLElement) => Number(d.querySelector("[data-spend-body]")!.getAttribute("data-spend-body"))
const details = (d: HTMLElement) => fireEvent.click(within(d).getByRole("button", { name: "Receipt details" }))
const live = (d: HTMLElement) => d.querySelector("[data-receipt-live]")!.textContent
const chip = (d: HTMLElement, name: RegExp) => within(d).getByRole("button", { name })
const marigolds = (d: HTMLElement) => [...d.querySelectorAll("button")].filter((b) => /(^|\s)bg-brand(\s|$)/.test(b.className))

describe("Scan receipt", () => {
  it("a dollar receipt on step 1: fills amount, reason and note, announces it, moves on to step 2 with a one-row summary", async () => {
    let resolve!: (r: ReceiptReadRes) => void
    readPhoto.mockImplementation(() => new Promise((r) => (resolve = r)))
    const d = open()
    expect(step(d)).toBe(1)
    const button = within(d).getByRole("button", { name: "Scan receipt" })
    expect(button.getAttribute("data-variant")).toBe("secondary")
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe("We fill in the amount, reason and note. You check them before you ask.")
    snap(d)
    expect(readPhoto).toHaveBeenCalledWith("lisbon-trip", expect.any(File), expect.any(AbortSignal))
    expect(d.querySelector("[data-receipt='reading']")!.textContent).toContain("Reading your receipt…")
    expect(live(d)).toBe("Reading your receipt…")
    await act(async () => resolve(res()))

    // step 2, everything filled; its heading has focus
    expect(step(d)).toBe(2)
    await waitFor(() => expect(document.activeElement?.textContent).toBe("What's it for?"))
    expect(amount(d)).toBe("$84.2")
    expect(chip(d, /Groceries/).getAttribute("aria-pressed")).toBe("true")
    expect(within(d).getByRole("button", { name: "Pingo Doce · Oct 28" })).toBeTruthy() // the note
    expect(live(d)).toBe("Receipt read: $84.20 at Pingo Doce")
    const summary = d.querySelector<HTMLElement>("[data-receipt-summary]")!
    expect(within(summary).getByRole("heading", { name: "Pingo Doce" })).toBeTruthy()
    expect(summary.querySelector("[data-receipt-total]")!.textContent).toBe("$84.20")
    expect(summary.querySelector("[data-receipt-total]")!.className).toContain("tabular-nums")
    // one row: the details (notice, items, Read privately) wait behind the ⌄
    const more = summary.querySelector<HTMLElement>("[data-receipt-more]")!
    expect(more.hidden).toBe(true)
    details(d)
    expect(within(summary).getByRole("button", { name: "Receipt details" }).getAttribute("aria-expanded")).toBe("true")
    expect(more.hidden).toBe(false)
    expect(within(more).getByText("We filled in the amount, reason and note. Check them before you ask.")).toBeTruthy()
    const list = summary.querySelector<HTMLElement>("[data-receipt-items]")!
    expect(within(list).getAllByRole("listitem")).toHaveLength(8)
    expect(within(list).getByText("Vinho Verde")).toBeTruthy()
    expect(within(list).getByText("× 3")).toBeTruthy()
    expect(within(list).getByText("Tax")).toBeTruthy()
    // the decision follows the filled amount; still one marigold: the sheet's own ask
    expect(within(d).getByText("This will be approved instantly")).toBeTruthy()
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Get $84.20 back"])
  })

  it("Read privately (inside the details): plain words; the sample says the photo stayed; a live reading links to the check", async () => {
    readPhoto.mockResolvedValueOnce(res())
    const d = open()
    snap(d)
    await waitFor(() => expect(d.querySelector("[data-receipt-summary]")).not.toBeNull())
    details(d)
    const badge = within(d).getByRole("button", { name: "Read privately: what this means" })
    expect(badge.textContent).toContain("Read privately")
    expect(badge.querySelector("svg")).not.toBeNull()
    fireEvent.click(badge)
    expect(badge.getAttribute("aria-expanded")).toBe("true")
    expect(within(d).getByText(/goes to a sealed computer that reads it/)).toBeTruthy()
    expect(within(d).getByText(/Pot doesn't keep the photo/)).toBeTruthy()
    expect(within(d).getByText("This is a sample reading, not one of your photo. Your photo stays on your device.")).toBeTruthy()
    expect(d.querySelector("[data-receipt-verify]")).toBeNull()
    cleanup()

    readPhoto.mockResolvedValueOnce(res("receipt.jpg", { source: "near-ai", proof: { verifyUrl: "https://cloud.near.ai/verify?model=Qwen%2FQwen3-VL-30B-A3B-Instruct#receipt=abc", reply: true } }))
    const d2 = open()
    snap(d2)
    await waitFor(() => expect(d2.querySelector("[data-receipt-summary]")).not.toBeNull())
    details(d2)
    fireEvent.click(within(d2).getByRole("button", { name: "Read privately: what this means" }))
    const link = within(d2).getByRole("link", { name: "Check where your receipt was read. Opens a new page." })
    expect(link.getAttribute("href")).toBe("https://cloud.near.ai/verify?model=Qwen%2FQwen3-VL-30B-A3B-Instruct#receipt=abc")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
    expect(within(d2).getByText(/How do we know\?/)).toBeTruthy()
    expect(within(d2).getByText("The check also covers this reading of your receipt.")).toBeTruthy()
  })

  it("another currency at a live rate: '€42.50 ≈ $46.12 · rate 1.0852 from today', the dollars filled, the source named", async () => {
    readPhoto.mockResolvedValueOnce(res("receipt-cafe-eur.jpg", { fx: EUR_FX }))
    const d = open()
    snap(d, "receipt-cafe-eur.jpg")
    await waitFor(() => expect(d.querySelector("[data-receipt-summary]")).not.toBeNull())
    expect(step(d)).toBe(2)
    expect(amount(d)).toBe("$46.12")
    const summary = d.querySelector<HTMLElement>("[data-receipt-summary]")!
    expect(summary.querySelector("[data-receipt-total]")!.textContent).toBe("€42.50")
    const line = summary.querySelector<HTMLElement>("[data-receipt-fx]")!
    expect(line.textContent).toBe("€42.50 ≈ $46.12 · rate 1.0852 from today")
    expect(line.className).toContain("tabular-nums")
    expect(chip(d, /Food/).getAttribute("aria-pressed")).toBe("true")
    expect(live(d)).toBe("Receipt read: €42.50 at Taberna da Rua. That's about $46.12.")
    details(d)
    expect(within(summary).getByText("Rate from the European Central Bank")).toBeTruthy()
    expect(within(summary).getByText(/Your bank's rate may differ a little/)).toBeTruthy()
    expect(marigolds(d).map((b) => b.textContent)).toEqual(["Get $46.12 back"])
    cleanup()

    // a rate from an earlier working day says its day; the fallback source names itself
    readPhoto.mockResolvedValueOnce(res("receipt-cafe-eur.jpg", { fx: { ...EUR_FX, rateDate: "2026-10-30", source: "er" } }))
    const d2 = open()
    snap(d2, "receipt-cafe-eur.jpg")
    await waitFor(() => expect(d2.querySelector("[data-receipt-fx]")).not.toBeNull())
    expect(d2.querySelector("[data-receipt-fx]")!.textContent).toBe("€42.50 ≈ $46.12 · rate 1.0852 from Oct 30")
    details(d2)
    expect(within(d2).getByText("Rate from exchangerate-api.com")).toBeTruthy()
  })

  it.each([
    ["unavailable", null, "This receipt is in EUR (€42.50). We couldn't get today's rate, so type the amount in dollars."],
    ["unsupported", null, "This receipt is in EUR (€42.50). We don't have a rate for it, so type the amount in dollars."],
    ["older server", undefined, "This receipt is in EUR (€42.50). Pot counts in dollars, so type the amount in dollars."],
  ] as const)("no rate (%s): stays on step 1, says so, the amount waits for 'Use 42.50 as dollars'", async (why, _x, text) => {
    const fx: ReceiptFx | null = why === "older server" ? null : { ok: false, from: "EUR", why }
    readPhoto.mockResolvedValueOnce(res("receipt-cafe-eur.jpg", { fx }))
    const d = open()
    snap(d, "receipt-cafe-eur.jpg")
    await waitFor(() => expect(d.querySelector("[data-receipt-summary]")).not.toBeNull())
    expect(step(d)).toBe(1)
    expect(amount(d)).toBe("$0")
    expect(within(d).getByText(text)).toBeTruthy()
    expect(d.querySelector("[data-receipt-fx]")).toBeNull()
    expect(within(d).getByRole("heading", { name: "Taberna da Rua" })).toBe(document.activeElement)
    expect(live(d)).toBe("Receipt read: €42.50 at Taberna da Rua")
    fireEvent.click(within(d).getByRole("button", { name: "Use 42.50 as dollars" }))
    expect(amount(d)).toBe("$42.5")
    expect(within(d).queryByRole("button", { name: "Use 42.50 as dollars" })).toBeNull()
    // Next: the reason the receipt picked is there
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    expect(chip(d, /Food/).getAttribute("aria-pressed")).toBe("true")
  })

  it.each([
    ["unreadable", "We couldn't read that one", "Try again in good light, with the whole receipt in the photo. Or type it in."],
    ["timeout", "Reading took too long", "Type the amount in instead, or try again."],
    ["unavailable", "We can't read receipts right now", "Type it in instead."],
    ["open", "We couldn't open that photo", "Try another photo of the receipt."],
  ] as const)("%s: friendly copy, Try again, and the keypad keeps working", async (kind, title, body) => {
    if (kind === "unreadable") readPhoto.mockResolvedValueOnce(res("receipt-blurry.jpg"))
    else readPhoto.mockRejectedValueOnce(new ReceiptReadError(kind))
    const d = open()
    snap(d)
    await waitFor(() => expect(d.querySelector(`[data-receipt-failure='${kind}']`)).not.toBeNull())
    await waitFor(() => expect(within(d).getByText(title)).toBe(document.activeElement))
    expect(within(d).getByText(body)).toBeTruthy()
    expect(live(d)).toBe(`${title}. ${body}`)
    expect(within(d).getByRole("button", { name: "Try again" })).toBeTruthy()
    // nothing was filled; typing still works
    expect(amount(d)).toBe("$0")
    fireEvent.click(within(d).getByRole("button", { name: "8", exact: true } as never))
    expect(amount(d)).toBe("$8")
  })

  it("Cancel while reading gives the form back and ignores a late answer", async () => {
    let resolve!: (r: ReceiptReadRes) => void
    readPhoto.mockImplementation((_s, _f, signal) => new Promise((r) => ((resolve = r), signal?.addEventListener("abort", () => undefined))))
    const d = open()
    snap(d)
    fireEvent.click(within(d).getByRole("button", { name: "Type it in instead" }))
    expect(within(d).getByRole("button", { name: "Scan receipt" })).toBeTruthy()
    await act(async () => resolve(res()))
    expect(amount(d)).toBe("$0")
    expect(step(d)).toBe(1)
    expect(d.querySelector("[data-receipt-summary]")).toBeNull()
  })

  it("Remove takes back what the reading filled (back to the keypad), but keeps what the person changed", async () => {
    readPhoto.mockResolvedValueOnce(res())
    const d = open()
    snap(d)
    await waitFor(() => expect(d.querySelector("[data-receipt-summary]")).not.toBeNull())
    fireEvent.click(chip(d, /Food/)) // the person picks another reason
    details(d)
    fireEvent.click(within(d).getByRole("button", { name: "Remove" }))
    expect(live(d)).toBe("Receipt removed.")
    expect(step(d)).toBe(1) // the amount it filled is gone: nothing to ask for yet
    expect(amount(d)).toBe("$0")
    fireEvent.click(within(d).getByRole("button", { name: "5", exact: true } as never))
    fireEvent.click(within(d).getByRole("button", { name: "Next" }))
    expect(within(d).queryByRole("button", { name: "Pingo Doce · Oct 28" })).toBeNull()
    expect(chip(d, /Food/).getAttribute("aria-pressed")).toBe("true")
  })

  it("asking sends the kept reading's details with the spend (never the photo); after Remove, nothing", async () => {
    spend.mockResolvedValue({ id: 9, path: "instant", payout: "sent", final: Promise.resolve("sent") })
    // the result card's celebration asks about reduced motion
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
    readPhoto.mockResolvedValueOnce(res("receipt-cafe-eur.jpg", { fx: EUR_FX }))
    const d = open()
    snap(d, "receipt-cafe-eur.jpg")
    await waitFor(() => expect(step(d)).toBe(2))
    fireEvent.click(within(d).getByRole("button", { name: "Get $46.12 back" }))
    await waitFor(() => expect(spend).toHaveBeenCalledTimes(1))
    const input = spend.mock.calls[0]![1] as { receipt: Record<string, unknown> }
    expect(input.receipt).toMatchObject({
      v: 1,
      merchant: "Taberna da Rua",
      currency: "EUR",
      totalCents: 4250,
      fx: { from: "EUR", amountCents: 4250, usdCents: 4612, rate: "1.0852", source: "ecb" },
      proof: null,
      source: "mock",
    })
    expect(input.receipt.nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(Date.parse(input.receipt.readAt as string)).toBeGreaterThan(Date.now() - 60_000)
    expect(JSON.stringify(input.receipt)).not.toMatch(/image|base64|data:/)
    cleanup()

    readPhoto.mockResolvedValueOnce(res())
    const d2 = open()
    snap(d2)
    await waitFor(() => expect(d2.querySelector("[data-receipt-summary]")).not.toBeNull())
    details(d2)
    fireEvent.click(within(d2).getByRole("button", { name: "Remove" }))
    fireEvent.click(within(d2).getByRole("button", { name: "5", exact: true } as never))
    fireEvent.click(within(d2).getByRole("button", { name: "Next" }))
    fireEvent.click(within(d2).getByRole("button", { name: "Get $5 back" }))
    await waitFor(() => expect(spend).toHaveBeenCalledTimes(2))
    expect(spend.mock.calls[1]![1]).not.toHaveProperty("receipt")
  })

  it("hidden when the server can't read receipts", () => {
    box.enabled = false
    const d = open()
    expect(within(d).queryByRole("button", { name: "Scan receipt" })).toBeNull()
    expect(within(d).queryByText("Read privately")).toBeNull()
  })
})
