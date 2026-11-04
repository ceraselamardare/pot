// @vitest-environment jsdom
// Money-in details (2026-11-04, ?sheet=deposit&d=<key>) over the mock showcase seed: Ski Chalet (Sam's $300 demo
// dollars; Leo's $300 from another app, ETH on Base, the testnet demo's simulated transfer) and Leo's Birthday (Maya's
// demo add, Sam's from his Pot dollars, three pay-ins). The mock mapping of every source kind (members only), the
// top-up ask an add answered, the sheet's anatomy per kind (source card, the timeline, receipts: only "on NEAR" for a
// simulated transfer; on the network + NEAR Intents for a real one, mapped from the API), and the rows that open it.
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }))

import { DepositDetailsSheet, sourceWords } from "@/components/deposits/DepositDetailsSheet"
import { GiftRow } from "@/components/gifts/GiftRow"
import { ActivityFeed } from "@/components/pot/Feed"
import { findBanned } from "@/i18n/banned.mjs"
import { detailsFromWire } from "@/lib/client/deposits/vm"
import { mockDepositDetails } from "@/lib/client/mock/deposits"
import * as store from "@/lib/client/mock/store"
import { askTopup } from "@/lib/client/mock/topups"
import type { PotVM, World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"
import type { DepositDetailsWire } from "@/lib/deposits-api"

const WORLD_KEY = "pot.mock.world.v1"
const world = () => JSON.parse(localStorage.getItem(WORLD_KEY)!) as World
const NOW = Date.now()
const DAY = 86_400_000
const view = (slug: string, me = "maya"): PotVM => W.potView(world(), slug, me, NOW)!
const addKey = (slug: string, eventId: string) => W.mockTxHash(`${slug}:${eventId}`)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("pot.mock.seed", "showcase")
  store.resetWorld()
  store.setSession("maya")
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("the mock mapping (members only)", () => {
  it("each source kind: demo dollars, Pot dollars, another app (ETH on Base, simulated), a pay-in through a $25 link", () => {
    const w = world()
    const demo = mockDepositDetails(w, "ski-chalet", addKey("ski-chalet", "s2"), "maya", NOW)!
    expect(demo).toMatchObject({ kind: "added", who: { id: "sam" }, amount: 300_000_000n, status: "added", source: { kind: "demo" }, topup: null })
    expect(mockDepositDetails(w, "leos-birthday", addKey("leos-birthday", "b4"), "maya", NOW)!.source).toEqual({ kind: "pot_dollars" })
    const xc = mockDepositDetails(w, "ski-chalet", addKey("ski-chalet", "s6"), "maya", NOW)!
    expect(xc.source).toMatchObject({ kind: "xc", simulated: true, chain: "base", network: "Base", coin: "ETH", sent: 129_300_000_000_000_000n, arrived: 300_000_000n, took: 58_000, originTx: null, intentsUrl: null })
    const tms = mockDepositDetails(w, "leos-birthday", "g0000000000000000000tms1", "maya", NOW)!
    expect(tms).toMatchObject({ kind: "payin", who: { name: "Tomás" }, amount: 25_000_000n, source: { kind: "payin", note: "For the cake. Don't tell him!", link: { by: { id: "sam" }, amount: 25_000_000n } } })
    expect(mockDepositDetails(w, "leos-birthday", "g0000000000000000000ana1", "maya", NOW)!.source).toMatchObject({ kind: "payin", link: null, showPublic: true })
  })

  it("nothing for someone outside the Pot, an unknown key or another Pot's key", () => {
    const w = world()
    expect(mockDepositDetails(w, "ski-chalet", addKey("ski-chalet", "s2"), "alex", NOW)).toBeNull()
    expect(mockDepositDetails(w, "ski-chalet", addKey("lisbon-trip", "e2"), "maya", NOW)).toBeNull()
    expect(mockDepositDetails(w, "ski-chalet", "e2", "maya", NOW)).toBeNull()
    expect(mockDepositDetails(w, "ski-chalet", "g0000000000000000000tms1", "maya", NOW)).toBeNull()
  })

  it("an add made while a top-up ask was open names it ('Sam's ask · $50 each'); one before the ask doesn't", () => {
    let w = world()
    w = askTopup(w, "ski-chalet", "sam", { mode: "each", amount: 5_000, dueAt: NOW + 3 * DAY }, NOW, "t1", W.nameOf).world
    w = W.addMoney(w, "ski-chalet", "maya", 5_000, NOW + 1_000)
    const d = mockDepositDetails(w, "ski-chalet", addKey("ski-chalet", `c-maya-${NOW + 1_000}`), "maya", NOW + 2_000)!
    expect(d.topup).toMatchObject({ id: "t1", by: { id: "sam" }, mine: false, perPerson: 50_000_000n })
    expect(mockDepositDetails(w, "ski-chalet", addKey("ski-chalet", "s4"), "maya", NOW + 2_000)!.topup).toBeNull()
  })
})

describe("the sheet", () => {
  const open = (slug: string, key: string) => {
    render(<DepositDetailsSheet pot={view(slug)} depositKey={key} meId="maya" open onClose={() => {}} />)
    return screen.getByRole("dialog")
  }

  it("from another app: 'Leo added $300', Added (icon + word), ETH on Base, sent / arrived / rate / took, the demo pill, five moments, only the NEAR receipt", () => {
    const d = open("ski-chalet", addKey("ski-chalet", "s6"))
    expect(d.getAttribute("aria-label") ?? within(d).getByRole("heading", { level: 2 }).textContent).toContain("Leo added $300")
    const chip = d.querySelector("[data-deposit-status='added'] [data-status='approved']")!
    expect(chip.textContent).toBe("Added")
    expect(chip.querySelector("svg")).toBeTruthy()
    const card = d.querySelector("[data-deposit-source='xc']")!
    expect(card.querySelector("[data-deposit-pair]")!.textContent).toBe("ETH on Base")
    expect(card.textContent).toContain("From another app")
    expect(card.textContent).toContain("0.1293 ETH → $300.00")
    expect(card.textContent).toContain("About $2,320.18 per ETH · 58 s")
    expect(card.querySelector("[data-deposit-sim]")!.textContent).toBe("TestTestnet demo: simulated transfer")
    const steps = within(d.querySelector("[data-deposit-timeline]") as HTMLElement).getAllByRole("listitem")
    expect(steps.map((s) => s.querySelector("span.text-ink")!.textContent)).toEqual(["Address shown", "Sent from Base", "Converted to Pot dollars", "Arrived", "Added to the Pot"])
    for (const s of steps) expect(s.textContent).toMatch(/\d{1,2}:\d{2}:\d{2} [AP]M$/)
    const receipts = [...d.querySelectorAll("[data-deposit-receipt]")].map((a) => a.getAttribute("data-deposit-receipt"))
    expect(receipts).toEqual(["near"])
    expect(d.querySelector("[data-deposit-receipt='near']")!.getAttribute("href")).toMatch(/\/txns\//)
    expect(d.querySelector(".bg-brand")).toBeNull()
    for (const svg of d.querySelectorAll("[data-deposit-source] svg, [data-deposit-timeline] svg.lucide")) expect(["2", "3"]).toContain(svg.getAttribute("stroke-width"))
  })

  it("demo dollars and Pot dollars: their card, one quiet Receipt ↗, no timeline; the main copy is free of jargon", () => {
    let d = open("ski-chalet", addKey("ski-chalet", "s2"))
    expect(d.querySelector("[data-deposit-source='demo']")!.textContent).toContain("Demo dollars")
    expect(d.querySelector("[data-deposit-timeline]")).toBeNull()
    expect(d.querySelectorAll("[data-receipt]")).toHaveLength(1)
    expect(findBanned(d.querySelector("[data-deposit-details]")!.textContent!.replace("Receipt", ""))).toBeNull()
    cleanup()
    d = open("leos-birthday", addKey("leos-birthday", "b4"))
    expect(d.querySelector("[data-deposit-source='pot_dollars']")!.textContent).toContain("Money a Pot already paid Sam.")
  })

  it("a pay-in: 'Tomás paid in…' / a gift, through Sam's pay-in link set to $25, the note, the group rule", () => {
    const d = open("leos-birthday", "g0000000000000000000tms1")
    expect(within(d).getByText("For the cake. Don't tell him!")).toBeTruthy()
    const card = d.querySelector("[data-deposit-source='payin']")!
    expect(card.textContent).toContain("Through Sam's pay-in link")
    expect(card.textContent).toContain("Set to $25")
    expect(within(d).getByText(/Money from outside belongs to the whole group/)).toBeTruthy()
  })

  it("the top-up ask it answered is a fact row: 'For · Sam's ask · $50 each'", async () => {
    store.setSession("sam")
    await store.askTopup("ski-chalet", { mode: "each", amount: 5_000, dueAt: Date.now() + 3 * DAY })
    store.setSession("maya")
    await store.addMoney("ski-chalet", 5_000)
    const pot = W.potView(world(), "ski-chalet", "maya", Date.now())!
    const item = pot.feed.find((f) => f.kind === "contribution" && f.actor.id === "maya" && f.amount === 50_000_000n)!
    render(<DepositDetailsSheet pot={pot} depositKey={item.txHash!} meId="maya" open onClose={() => {}} />)
    const d = screen.getByRole("dialog", { name: "You added $50" })
    const fact = d.querySelector("[data-deposit-topup]")!
    expect(fact.textContent).toBe("Sam's ask · $50 each")
    expect(fact.closest("div")!.querySelector("dt")!.textContent).toBe("For")
  }, 10_000)

  it("a real transfer (mapped from the API): the receipt on its network and NEAR Intents' page beside the NEAR one", () => {
    const wire: DepositDetailsWire = {
      key: "8KCez9cqCEv2DW5usNffsv3Bfy9j99kZgL9U2ifDNTDD",
      kind: "added",
      who: "maya",
      amount: "20000000",
      at: new Date(NOW).toISOString(),
      status: "added",
      txHash: "8KCez9cqCEv2DW5usNffsv3Bfy9j99kZgL9U2ifDNTDD",
      source: {
        kind: "xc",
        mode: "real",
        chain: "base",
        coin: "USDC",
        decimals: 6,
        stable: true,
        sent: "20000000",
        usdTarget: "20000000",
        arrived: "19998000",
        refunded: null,
        refundReason: null,
        timeline: ["address", "sent", "converting", "arrived", "added"].map((step, i) => ({ step: step as "address", at: new Date(NOW - (5 - i) * 10_000).toISOString() })),
        originTx: { hash: "0xabc123def4567890abc123", url: "https://basescan.org/tx/0xabc123def4567890abc123" },
        intentsUrl: "https://explorer.near-intents.org/transactions/0xDeposit",
      },
      topup: null,
    }
    const vm = detailsFromWire(wire, {}, view("ski-chalet"), "maya")
    expect(vm.who.name).toBe(view("ski-chalet").members.find((m) => m.person.id === "maya")!.person.name)
    expect(sourceWords(vm, "maya").lines.some((l) => l.startsWith("1 USDC = $1"))).toBe(true)
  })
})

describe("the rows that open it", () => {
  it("the feed's add is a button → ?sheet=deposit&d=<tx hash>; its name ends with the source and 'Details'", async () => {
    const user = userEvent.setup()
    const pot = view("ski-chalet")
    render(<ActivityFeed items={pot.feed} ops={[]} me={pot.me!.person} now={NOW} potName={pot.name} />)
    await user.click(screen.getByRole("button", { name: /^Leo added \$300\. From another app, ETH on Base\..*Details$/ }))
    const p = new URLSearchParams(window.location.search)
    expect(p.get("sheet")).toBe("deposit")
    expect(p.get("d")).toBe(addKey("ski-chalet", "s6"))
  })

  it("a pay-in row opens the same sheet with its ref", async () => {
    const user = userEvent.setup()
    const g = view("leos-birthday").gifts!.items.find((x) => x.from.name === "Tomás")!
    render(
      <ul>
        <GiftRow gift={g} now={NOW} />
      </ul>,
    )
    await user.click(screen.getByRole("button", { name: /^Tomás sent a gift of \$25\..*Details$/ }))
    const p = new URLSearchParams(window.location.search)
    expect([p.get("sheet"), p.get("d")]).toEqual(["deposit", g.ref])
  })

  it("an add without a settled transaction (the chain's catch-up row) stays a plain row", () => {
    const pot = view("ski-chalet")
    const item = { key: "contribution:chain:maya", kind: "contribution" as const, at: NOW, actor: pot.me!.person, amount: 1_000_000n }
    render(<ActivityFeed items={[item]} ops={[]} me={pot.me!.person} now={NOW} potName={pot.name} />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByRole("group", { name: /^You added \$1|^Maya added \$1/ })).toBeTruthy()
  })
})
