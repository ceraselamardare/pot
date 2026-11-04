// @vitest-environment jsdom
// Any coin (2026-11-04), the member's Add flow on the mock data source: network (all curated networks, slow ones
// flagged, high-minimum ones explained) → coin ("Which coin are you sending?", the live quote for a coin whose price
// moves) → the address, never without the network and the coin ("Send only USDC on Optimism" right under it).
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  const subscribe = (cb: () => void) => {
    window.addEventListener("test:url", cb)
    window.addEventListener("popstate", cb)
    return () => {
      window.removeEventListener("test:url", cb)
      window.removeEventListener("popstate", cb)
    }
  }
  return {
    useRouter: () => ({ replace: () => {}, push: () => {} }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  }
})
vi.mock("@/lib/client/actions", () => ({ addMoney: vi.fn(() => null) }))
vi.mock("@/lib/client/data", () => ({ useOwnDollars: () => 0n }))

import { AddFlow } from "@/components/sheets/AddFlow"
import { queryClient } from "@/lib/client/query"
import { potView, seedWorld } from "@/lib/client/mock/world"

const NOW = Date.UTC(2026, 10, 4, 12)
const pot = potView(seedWorld(NOW), "lisbon-trip", "maya", NOW)!

beforeAll(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = window.history[m].bind(window.history)
    window.history[m] = (...a: Parameters<History["pushState"]>) => {
      orig(...a)
      window.dispatchEvent(new Event("test:url"))
    }
  }
})
afterEach(() => {
  cleanup()
  queryClient().clear()
  localStorage.clear()
  window.history.replaceState(null, "", "/")
})

function open(amount = "20") {
  window.history.replaceState(null, "", `/p/lisbon-trip?sheet=add&src=xc&amount=${amount}`)
  render(
    <QueryClientProvider client={queryClient()}>
      <AddFlow pot={pot} actor="maya" />
    </QueryClientProvider>,
  )
}

const radio = (name: RegExp) => screen.findByRole("radio", { name })

describe("network → coin → address (mock data source)", () => {
  it("lists every network with its coins and speed; slow ones say how slow; Tron explains its $101 minimum", async () => {
    open("20")
    expect(await screen.findByRole("dialog", { name: "Add from another app or exchange" })).toBeTruthy()
    const group = await screen.findByRole("radiogroup", { name: "Which network are you sending from?" })
    await radio(/^Base/)
    const names = within(group)
      .getAllByRole("radio")
      .map((r) => r.getAttribute("data-network"))
    expect(names).toEqual(["base", "arb", "sol", "eth", "pol", "op", "avax", "sui", "aptos", "ton", "tron", "xrp", "btc", "doge", "zec"])
    expect((await radio(/^Base/)).textContent).toContain("USDC, ETH")
    expect((await radio(/^Base/)).textContent).toContain("Usually under a minute")
    expect((await radio(/^Ethereum/)).textContent).toContain("Slower: about 1 to 2 minutes")
    expect((await radio(/^Bitcoin/)).textContent).toContain("Slow: about 20 minutes")
    const tron = await radio(/^Tron/)
    expect(tron.getAttribute("aria-disabled")).toBe("true")
    expect(tron.textContent).toContain("From $101")
    // the first open network is picked; [Continue] is the step's one primary
    expect((await radio(/^Base/)).getAttribute("aria-checked")).toBe("true")
  })

  it("Optimism → USDC: no quote needed (1:1), the address says the coin and the network everywhere", async () => {
    open("20")
    fireEvent.click(await radio(/^Optimism/))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => expect(window.location.search).toContain("net=op"))
    const coins = await screen.findByRole("radiogroup", { name: "Which coin are you sending?" })
    expect(within(coins).getAllByRole("radio").map((r) => r.getAttribute("data-coin"))).toEqual(["USDC", "USDT", "ETH"])
    expect(screen.getByText("On Optimism")).toBeTruthy()
    expect((await radio(/^USDC/)).getAttribute("aria-checked")).toBe("true")
    expect((await radio(/^USDC/)).textContent).toContain("send 20 USDC")
    expect(document.querySelector("[data-live-quote]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Get address" }))
    await waitFor(() => expect(window.location.search).toMatch(/[?&]d=dp_/))
    expect(await screen.findByText("Send 20 USDC on Optimism")).toBeTruthy()
    expect(screen.getByText("We'll accept 19.80 USDC or more.")).toBeTruthy()
    const only = document.querySelector("[data-send-only]")!
    expect(only.textContent).toContain("Send only USDC on Optimism")
    expect(only.textContent).toContain("One coin per address")
    expect(document.querySelector("[data-network-chip]")!.textContent).toContain("Optimism · USDC")
    // the "Send only" box sits right under the address
    expect(document.querySelector("[data-address]")!.closest("div")!.parentElement!.querySelector("[data-send-only]")).toBe(only)
    expect(screen.getByRole("button", { name: "Simulate sending $20" })).toBeTruthy()
  })

  it("Base → ETH: the live quote ('Send about 0.008625 ETH · About $20.00 arrives'), then the address in ETH", async () => {
    open("20")
    await radio(/^Base/)
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    fireEvent.click(await radio(/^ETH/))
    const quote = await waitFor(() => {
      const q = document.querySelector("[data-quote-send]")
      expect(q).toBeTruthy()
      return q!
    })
    expect(quote.textContent).toBe("Send about 0.008625 ETH")
    expect(document.querySelector("[data-quote-arrives]")!.textContent).toMatch(/^About \$20\.0\d arrives$/)
    expect(document.querySelector("[data-live-quote]")!.textContent).toContain("more than 3%")
    expect(document.querySelector("[data-quote-time]")!.textContent).toMatch(/Live price · updated/)
    fireEvent.click(screen.getByRole("button", { name: "Get address" }))
    expect(await screen.findByText("Send 0.008625 ETH on Base")).toBeTruthy()
    expect(document.querySelector("[data-address-arrives]")!.textContent).toMatch(/^About \$20\.0\d arrives/)
    expect(document.querySelector("[data-send-only]")!.textContent).toContain("Send only ETH on Base")
    expect(screen.getByText(/We'll accept 0\.0083\d* ETH or more\./)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Simulate sending 0.008625 ETH" })).toBeTruthy()
    expect(screen.getByText("Testnet demo: simulated transfer, no real money")).toBeTruthy()
  })

  it("Bitcoin: flagged slow on the address with the real time, and that the demo is sped up", async () => {
    open("20")
    fireEvent.click(await radio(/^Bitcoin/))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect((await radio(/^BTC/)).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Get address" }))
    expect(await screen.findByText(/^Send 0\.000\d+ BTC on Bitcoin$/)).toBeTruthy()
    expect(document.querySelector("[data-slow-network]")!.textContent).toBe("Bitcoin is slow: it usually takes about 20 minutes after you send.")
    expect(screen.getByText("In this demo it arrives in under 30 seconds.")).toBeTruthy()
  })

  it("a coin marked unavailable can't be picked; the network's next coin is", async () => {
    localStorage.setItem("pot.mock.xcUnavailable", "sol:USDC")
    open("20")
    fireEvent.click(await radio(/^Solana/))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    const usdc = await radio(/^USDC/)
    expect(usdc.getAttribute("aria-disabled")).toBe("true")
    expect(usdc.textContent).toContain("Not available right now")
    expect((await radio(/^USDT/)).getAttribute("aria-checked")).toBe("true")
  })
})
