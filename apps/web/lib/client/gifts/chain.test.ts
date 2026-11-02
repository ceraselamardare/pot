// The gifts chain adapter (hub 1.2.0): the sdk's send_gift / set_gifts intents through send() (the relayer path Add
// money uses), and the hub's get_gifts through chain().hub.getGifts. The sdk's buildCall turns each intent into the
// exact call the relayer's R16 / R17 accept (checked here too).
import { vi } from "vitest"
const h = vi.hoisted(() => ({
  send: vi.fn(),
  hub: { getGifts: undefined as undefined | ((pot: string) => Promise<{ value: unknown }>) },
}))
vi.mock("../live/signing", () => ({ send: h.send }))
vi.mock("../live/chain", () => ({ chain: () => ({ hub: h.hub }) }))
import { buildCall, giftMsg, type ActionIntent, type GiftsView } from "@pot/sdk"
import { beforeEach, describe, expect, it } from "vitest"
import { ActionError } from "../errors"
import { readGiftsView, sendGiftTransfer, setGiftsOnChain } from "./chain"

const DAO = "lisbon-trip.pots.potprev.testnet"
const REF = "g0123456789abcdefghjkmnp"
const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, relayId: "rl_1", txHash: "TX", outcome: "success", events: [], executedAtBlock: 1, final: true, result: null, ...extra })

beforeEach(() => {
  h.send.mockReset()
  h.hub.getGifts = undefined
})

describe("sendGiftTransfer", () => {
  it("sends the sdk's send_gift intent (pot, amount, giftRef) and returns the relay answer", async () => {
    h.send.mockResolvedValue(ok({ result: { type: "gift", recorded: true, amount: "10000000", usedAmount: "10000000", giftRef: REF } }))
    const r = await sendGiftTransfer({ dao: DAO, amount: 10_000_000n, ref: REF })
    expect(r.txHash).toBe("TX")
    expect(h.send).toHaveBeenCalledWith({ type: "send_gift", pot: DAO, amount: 10_000_000n, giftRef: REF })
    // what the relayer's R16 sees: usdc.ft_transfer_call(hub, amount, msg = {"pot","gift"}), 1 yocto, 100 Tgas
    const intent = h.send.mock.calls[0]![0] as ActionIntent
    const call = buildCall(intent, { hubId: "pots.potprev.testnet", usdcId: "usdc.potprev.testnet" } as never)
    expect(call.receiverId).toBe("usdc.potprev.testnet")
    const a = call.actions[0]!
    expect(a.type === "FunctionCall" && a.method).toBe("ft_transfer_call")
    if (a.type === "FunctionCall") {
      expect(a.args).toMatchObject({ receiver_id: "pots.potprev.testnet", amount: "10000000", msg: giftMsg(DAO as never, REF) })
      expect(a.deposit).toBe(1n)
      expect(a.gas).toBe(100_000_000_000_000n)
    }
  })

  it("an inner failure throws the hub's code; a bounced gift throws GIFT_REFUNDED", async () => {
    h.send.mockResolvedValue(ok({ outcome: "inner_failed", errorCode: "ERR_GIFTS_OFF" }))
    await expect(sendGiftTransfer({ dao: DAO, amount: 5_000_000n, ref: REF })).rejects.toMatchObject({ reason: "ERR_GIFTS_OFF", txHash: "TX" })
    h.send.mockResolvedValue(ok({ result: { type: "gift", recorded: false, amount: "5000000", usedAmount: "0", giftRef: REF } }))
    const e = await sendGiftTransfer({ dao: DAO, amount: 5_000_000n, ref: REF }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ActionError)
    expect((e as ActionError).reason).toBe("GIFT_REFUNDED")
  })

  it("a self-paid wallet send (no relay result) is accepted when its receipts succeeded", async () => {
    h.send.mockResolvedValue(ok({ result: null }))
    await expect(sendGiftTransfer({ dao: DAO, amount: 5_000_000n, ref: REF })).resolves.toMatchObject({ txHash: "TX" })
  })
})

describe("setGiftsOnChain", () => {
  it("sends the sdk's set_gifts intent", async () => {
    h.send.mockResolvedValue(ok({ result: { type: "gifts", on: false, changed: true } }))
    await setGiftsOnChain(DAO, false)
    expect(h.send).toHaveBeenCalledWith({ type: "set_gifts", pot: DAO, on: false })
    const call = buildCall(h.send.mock.calls[0]![0] as ActionIntent, { hubId: "pots.potprev.testnet", usdcId: "usdc.potprev.testnet" } as never)
    expect(call.receiverId).toBe("pots.potprev.testnet")
    expect(call.actions[0]).toMatchObject({ type: "FunctionCall", method: "set_gifts", args: { pot: DAO, on: false }, deposit: 0n })
  })

  it("a non-member's refusal throws", async () => {
    h.send.mockResolvedValue(ok({ outcome: "inner_failed", errorCode: "ERR_NOT_MEMBER" }))
    await expect(setGiftsOnChain(DAO, true)).rejects.toMatchObject({ reason: "ERR_NOT_MEMBER" })
  })
})

describe("readGiftsView", () => {
  const view: GiftsView = { pot: DAO as never, on: true, total: 40_000_000n, count: 3, lastGiftMs: 1, inFlight: false, accepting: false, refusal: "goal_collecting", minAmount: 1_000_000n }
  it("reads chain().hub.getGifts(pot)", async () => {
    const getGifts = vi.fn(async () => ({ value: view }))
    h.hub.getGifts = getGifts
    await expect(readGiftsView(DAO)).resolves.toEqual({ on: true, total: 40_000_000n, count: 3, accepting: false, refusal: "goal_collecting" })
    expect(getGifts).toHaveBeenCalledWith(DAO)
  })
  it("null: no getGifts, an unknown Pot, or a failed read (a 1.1.0 hub has no get_gifts)", async () => {
    await expect(readGiftsView(DAO)).resolves.toBeNull()
    h.hub.getGifts = async () => ({ value: null })
    await expect(readGiftsView(DAO)).resolves.toBeNull()
    h.hub.getGifts = async () => {
      throw new Error("MethodNotFound")
    }
    await expect(readGiftsView(DAO)).resolves.toBeNull()
  })
})
