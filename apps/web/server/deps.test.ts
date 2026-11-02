// server/deps.ts relayDeps(): the relayer's gift hooks (hub 1.2.0, notes/contracts-gifts.md §8) are the gifts server
// module's validateGiftRef / onGiftReceived / markGiftFailed, called with this instance's DB, hub, config and push.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({
  db: { tag: "db" },
  hub: { tag: "hub" },
  cfg: { tag: "cfg", hubId: "pots.test", relayerPool: "relayer", treasuryPool: "treasury", rpcUrls: ["https://rpc.test"] },
  push: { tag: "push" },
  validator: vi.fn(async () => ({ ok: true as const, linkId: null })),
  giftRefValidator: vi.fn(),
  markGiftFailed: vi.fn(async () => true),
  onGiftReceived: vi.fn(async () => ({ marked: true, push: null })),
}))
vi.mock("next/server", () => ({ after: vi.fn() }))
vi.mock("@/db/client", () => ({ getDb: () => h.db }))
vi.mock("./config", () => ({ getConfig: () => h.cfg }))
vi.mock("./chain/rpc", () => ({ createRpc: () => ({ tag: "rpc" }) }))
vi.mock("./chain/hub", () => ({ createHubReader: () => h.hub }))
vi.mock("./chain/keys", () => ({ loadKeys: () => [] }))
vi.mock("./chain/submitter", () => ({ createSubmitter: () => ({ tag: "submitter" }) }))
vi.mock("./notify/webpush", () => ({ getPushSender: () => h.push }))
vi.mock("./features/gifts/validate", () => ({ giftRefValidator: h.giftRefValidator, markGiftFailed: h.markGiftFailed }))
vi.mock("./features/gifts/received", () => ({ onGiftReceived: h.onGiftReceived }))
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { relayDeps } from "./deps"

const DAO = "lisbon-trip.pots.test"
const REF = "g0123456789abcdefghjkmnp"

describe("relayDeps().gifts (hub 1.2.0 relay hooks)", () => {
  const flag = process.env.FLAG_GIFTS
  beforeEach(() => {
    vi.clearAllMocks()
    h.giftRefValidator.mockReturnValue(h.validator)
  })
  afterEach(() => {
    if (flag === undefined) delete process.env.FLAG_GIFTS
    else process.env.FLAG_GIFTS = flag
  })

  it("validateGiftRef is giftRefValidator(db): called with the Pot, ref, amount and sender", async () => {
    const d = relayDeps()
    expect(h.giftRefValidator).toHaveBeenCalledWith(h.db)
    await expect(d.gifts!.validateGiftRef!(DAO, REF, 10_000_000n, "eve.testnet")).resolves.toEqual({ ok: true, linkId: null })
    expect(h.validator).toHaveBeenCalledWith(DAO, REF, 10_000_000n, "eve.testnet")
  })

  it("onGiftReceived gets the DB, hub, config and the push sender, and the event as the relayer saw it", async () => {
    const d = relayDeps()
    const ev = { pot: DAO, from: "eve.testnet", amount: "10000000", ref: REF, txHash: "TX" }
    await d.gifts!.onGiftReceived!(ev)
    expect(h.onGiftReceived).toHaveBeenCalledWith({ db: h.db, hub: h.hub, cfg: h.cfg, sender: h.push }, ev)
  })

  it("onGiftFailed marks the gift failed", async () => {
    await relayDeps().gifts!.onGiftFailed!(REF)
    expect(h.markGiftFailed).toHaveBeenCalledWith(h.db, REF)
  })

  it("enabled follows FLAG_GIFTS per call", () => {
    const d = relayDeps()
    delete process.env.FLAG_GIFTS
    expect(d.gifts!.enabled!()).toBe(false)
    process.env.FLAG_GIFTS = "true"
    expect(d.gifts!.enabled!()).toBe(true)
    process.env.FLAG_GIFTS = "1"
    expect(d.gifts!.enabled!()).toBe(true)
  })

  it("the rest of relayDeps is unchanged", () => {
    const d = relayDeps()
    expect(d).toMatchObject({ db: h.db, hub: h.hub, cfg: h.cfg, push: h.push, submitter: { tag: "submitter" }, rpc: { tag: "rpc" } })
    expect(typeof d.defer).toBe("function")
  })
})
