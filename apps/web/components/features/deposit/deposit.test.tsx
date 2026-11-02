// @vitest-environment jsdom
// F-21 / D-50: the mock deposit API (the server's simulator timeline in the browser) and the DepositStepper states:
// five steps, "Taking longer" at 5 min of converting, incomplete / refunded / failed / expired result blocks, and
// the one-tap "Add it to the Pot" at Arrived.
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { PotVM } from "@/lib/client/mock/types"
import type { DepositView } from "@/lib/deposit/types"
import { mockDeposits } from "@/lib/deposit/mock"

const addArrived = vi.fn(() => ({ id: "op", cancel: () => false, done: Promise.resolve("ok" as const) }))
vi.mock("@/lib/deposit", async () => {
  const types = await import("@/lib/deposit/types")
  return { ...types, addArrived, arrivedAmount: (d: DepositView) => BigInt(d.amountOut ?? d.amountIn) }
})
const { DepositStepper, missingOf } = await import("./DepositStepper")
const { tokenAmount, shortAddress, safeHref } = await import("./format")

beforeAll(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const pot = { slug: "lisbon-trip", name: "Lisbon Trip", balance: 300_000_000n } as unknown as PotVM

function view(over: Partial<DepositView>): DepositView {
  return {
    mode: "simulated",
    id: "dp_01jbqz5a6v000000000000000a",
    pot: "lisbon-trip.pots.potprev.testnet",
    chain: "base",
    status: "PENDING_DEPOSIT",
    step: 1,
    amountIn: "150000000",
    minAmountIn: "148500000",
    depositAddress: "SIMULATED-base-1a2b3c4d",
    qrText: "POT TESTNET DEMO - DO NOT SEND FUNDS",
    deadline: new Date(Date.now() + 7_200_000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    refundReason: null,
    ...over,
  }
}

const renderStepper = (d: DepositView, extra: Partial<Parameters<typeof DepositStepper>[0]> = {}) =>
  render(<DepositStepper d={d} pot={pot} actor="leo" onClose={() => {}} onNewAddress={() => {}} {...extra} />)

describe("format", () => {
  it("token amounts, short addresses, https-only links", () => {
    expect(tokenAmount(150_000_000n)).toBe("150")
    expect(tokenAmount(148_500_000n)).toBe("148.50")
    expect(tokenAmount(149_985_123n)).toBe("149.985123")
    expect(shortAddress("0x7a3F00000000000000000000000000000000091cE")).toEqual({ head: "0x7a", mid: "…", tail: "91cE" })
    expect(safeHref("javascript:alert(1)")).toBeUndefined()
    expect(safeHref("https://testnet.nearblocks.io/txns/x")).toBe("https://testnet.nearblocks.io/txns/x")
  })
})

describe("DepositStepper", () => {
  it("converting: steps 1-2 done, step 3 current with its time promise, the testnet pill, Close never cancels", () => {
    const onClose = vi.fn()
    renderStepper(view({ status: "PROCESSING", step: 3, processingSince: new Date().toISOString() }), { onClose })
    expect(document.querySelector("[data-status-word]")!.textContent).toBe("On its way")
    expect(screen.getByText("Testnet demo: simulated transfer, no real money")).toBeTruthy()
    const current = document.querySelector('[aria-current="step"]')!
    expect(current.textContent).toContain("Converting to Pot dollars")
    expect(current.textContent).toContain("Usually under a minute.")
    expect(screen.queryByText(/Taking longer than usual/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalled()
  })

  it('"Taking longer than usual" 5 min into converting', () => {
    renderStepper(view({ status: "PROCESSING", step: 3, processingSince: new Date(Date.now() - 5 * 60_000 - 1000).toISOString() }))
    expect(screen.getByText("Taking longer than usual")).toBeTruthy()
  })

  it("arrived: 'Your $149.98 arrived' and the one tap adds it", () => {
    renderStepper(view({ status: "SUCCESS", step: 4, amountOut: "149985000", destinationTxHash: "abc" }))
    expect(document.querySelector("[data-status-word]")!.textContent).toBe("Arrived")
    expect(screen.getByText("Your $149.98 arrived")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add it to the Pot" }))
    expect(addArrived).toHaveBeenCalledTimes(1)
  })

  it("added: all five steps done", () => {
    renderStepper(view({ status: "ADDED", step: 5, amountOut: "149985000" }))
    expect(document.querySelector("[data-status-word]")!.textContent).toBe("Added")
    expect(document.querySelector('[aria-current="step"]')).toBeNull()
    expect(screen.getByText("Lisbon Trip has it now.")).toBeTruthy()
  })

  it("incomplete: how much more, by when, and (simulator) the top-up", () => {
    const onTopUp = vi.fn()
    renderStepper(view({ status: "INCOMPLETE_DEPOSIT", step: 1, depositedAmount: "120000000" }), { onTopUp })
    expect(screen.getByText("You sent less than needed")).toBeTruthy()
    expect(screen.getByText(/Send 28.50 USDC more to the same address/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Simulate sending $28.50 more" }))
    expect(onTopUp).toHaveBeenCalledWith(28_500_000n)
  })

  it("incomplete with the rest already sent (not spotted yet): no second 'send more', it says the rest is on its way", () => {
    const onTopUp = vi.fn()
    renderStepper(view({ status: "INCOMPLETE_DEPOSIT", step: 1, depositedAmount: "120000000", simulated: { sent: true, sentAmount: "148500000" } }), { onTopUp })
    expect(screen.getByText("The rest is on its way")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Simulate sending/ })).toBeNull()
    expect(missingOf({ minAmountIn: "148500000", depositedAmount: "120000000", simulated: { sent: true, sentAmount: "130000000" } })).toBe(18_500_000n)
    expect(missingOf({ minAmountIn: "148500000", depositedAmount: "120000000" })).toBe(28_500_000n)
  })

  it("refunded / failed say whether money moved and offer support; expired offers a new address", () => {
    renderStepper(view({ status: "REFUNDED", step: 3, refundReason: "NO_LIQUIDITY" }))
    expect(screen.getByText("Your money is safe and wasn't added to the Pot.")).toBeTruthy()
    expect(screen.getByText("Contact support")).toBeTruthy()
    cleanup()
    renderStepper(view({ status: "FAILED", step: 3, correlationId: "corr-123" }))
    // Details open by default on a failure: the reference for support
    expect(screen.getByText("corr-123")).toBeTruthy()
    cleanup()
    const onNewAddress = vi.fn()
    renderStepper(view({ status: "EXPIRED", step: 1 }), { onNewAddress })
    fireEvent.click(screen.getByRole("button", { name: "Get a new address" }))
    expect(onNewAddress).toHaveBeenCalled()
  })
})

describe("mock deposit API (the server's simulator, in the browser)", () => {
  beforeEach(() => localStorage.clear())
  it("quote → simulate → waiting → converting → arrived → added", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] })
    const start = Date.now()
    const tick = async (ms: number) => {
      vi.setSystemTime(Date.now() + ms)
    }
    const p = mockDeposits.quote({ pot: "x.hub", chain: "arb", amount: "150000000", idempotencyKey: "k1" })
    await vi.advanceTimersByTimeAsync(300)
    const q = await p
    expect(q.qrText).toBe("POT TESTNET DEMO - DO NOT SEND FUNDS")
    expect(q.depositAddress).toMatch(/^SIMULATED-arb-/)
    const id = q.depositIntentId!
    const status = async () => {
      const s = mockDeposits.status(id)
      await vi.advanceTimersByTimeAsync(50)
      return s
    }
    expect((await status()).status).toBe("PENDING_DEPOSIT")
    const sim = mockDeposits.simulate({ depositIntentId: id, idempotencyKey: "s1" })
    await vi.advanceTimersByTimeAsync(200)
    const { profile } = await sim
    await tick(profile.pendingSec * 1000 + 500)
    expect((await status()).status).toBe("PROCESSING")
    await tick(profile.processingSec * 1000 + 500)
    const arrived = await status()
    expect(arrived).toMatchObject({ status: "SUCCESS", step: 4, amountOut: "149985000" })
    const listed = mockDeposits.list("x.hub")
    await vi.advanceTimersByTimeAsync(50)
    expect((await listed).deposits.map((d) => d.id)).toEqual([id])
    expect((await mockDeposits.markAdded(id)).status).toBe("ADDED")
    expect(Date.now()).toBeGreaterThan(start)
  })

  it("partial: 'send more' tapped twice before the top-up is spotted → one top-up, no error, then it arrives (2026-11-02)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] })
    const run = async <T,>(p: Promise<T>): Promise<T> => {
      await vi.advanceTimersByTimeAsync(300)
      return p
    }
    const q = await run(mockDeposits.quote({ pot: "x.hub", chain: "sol", amount: "5000000", idempotencyKey: "k2" }))
    const id = q.depositIntentId!
    const { profile } = await run(mockDeposits.simulate({ depositIntentId: id, scenario: "partial", idempotencyKey: "s1" }))
    vi.setSystemTime(Date.now() + profile.pendingSec * 1000 + 500)
    const inc = await run(mockDeposits.status(id))
    expect(inc).toMatchObject({ status: "INCOMPLETE_DEPOSIT", depositedAmount: "4000000", minAmountIn: "4950000" })
    await run(mockDeposits.simulate({ depositIntentId: id, amount: "950000", idempotencyKey: "s2" }))
    // the second tap: same label on screen, nothing more sent, no error
    await run(mockDeposits.simulate({ depositIntentId: id, amount: "950000", idempotencyKey: "s3" }))
    const still = await run(mockDeposits.status(id))
    expect(still).toMatchObject({ status: "INCOMPLETE_DEPOSIT", simulated: { sent: true, sentAmount: "4950000" } })
    vi.setSystemTime(Date.now() + (profile.pendingSec + profile.processingSec) * 1000 + 1000)
    expect(await run(mockDeposits.status(id))).toMatchObject({ status: "SUCCESS", amountOut: "4949505" })
  })
})
