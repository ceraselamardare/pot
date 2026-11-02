// @vitest-environment jsdom
// 2026-11-02 (usepot.xyz): adding money from a wallet session failed with "That didn't go through" and no way to
// tell why. A known refusal now gets its own words, and the wallet path checks what it can before asking to sign.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ActionError, classOfReason } from "./errors"

const near = vi.hoisted(() => ({
  connected: null as null | { accounts: { accountId: string }[] },
  connectCalls: 0,
  reconnectWorks: true,
  signed: [] as unknown[],
  sign: (() => ({ signedDelegateActions: ["AAAA"] })) as () => unknown,
}))

vi.mock("@hot-labs/near-connect", () => {
  const wallet = {
    manifest: { id: "meteor-wallet", features: { signDelegateActions: true } },
    async signDelegateActions(p: unknown) {
      near.signed.push(p)
      return near.sign()
    },
  }
  class NearConnector {
    async getConnectedWallet() {
      if (!near.connected) throw new Error("No wallet selected")
      return { wallet, accounts: near.connected.accounts }
    }
    async connect() {
      near.connectCalls++
      if (!near.reconnectWorks) throw new Error("User rejected")
      near.connected = { accounts: [{ accountId: "me.testnet" }] }
      return wallet
    }
  }
  return { NearConnector }
})
const postRelay = vi.fn(async () => ({ ok: true, relayId: "rl_1", txHash: "h", outcome: "success", events: [], result: { type: "contribution", recorded: true } }))
vi.mock("@/lib/client/live/relay", () => ({ postRelay }))

const { walletSend } = await import("@/lib/signing/near-connect/wallet")
const { addErrorKey } = await import("./actions")

const intent = { type: "add_money", pot: "trip.pots.potprev.testnet", amount: 3_000_000n } as never

beforeEach(() => {
  near.connected = { accounts: [{ accountId: "me.testnet" }] }
  near.connectCalls = 0
  near.reconnectWorks = true
  near.signed = []
  near.sign = () => ({ signedDelegateActions: ["AAAA"] })
  postRelay.mockClear()
})

describe("walletSend (a NEAR wallet session's add money)", () => {
  it("signs and relays when the wallet is on the Pot account", async () => {
    await walletSend(intent, { accountId: "me.testnet" })
    expect(near.signed).toHaveLength(1)
    expect(postRelay).toHaveBeenCalledOnce()
  })

  it("refuses before any prompt when the wallet is on another account", async () => {
    near.connected = { accounts: [{ accountId: "other.testnet" }] }
    await expect(walletSend(intent, { accountId: "me.testnet" })).rejects.toMatchObject({ cls: "needs_device", reason: "wallet_account_mismatch" })
    expect(near.signed).toHaveLength(0)
    expect(postRelay).not.toHaveBeenCalled()
  })

  it("a lost wallet connection is reconnected once, then the action goes on", async () => {
    near.connected = null
    await walletSend(intent, { accountId: "me.testnet" })
    expect(near.connectCalls).toBe(1)
    expect(postRelay).toHaveBeenCalledOnce()
    near.connected = null
    near.reconnectWorks = false
    await expect(walletSend(intent, { accountId: "me.testnet" })).rejects.toMatchObject({ reason: "reconnect_wallet" })
  })

  it("closed or declined in the wallet → nothing was signed (wallet_declined), never the relayer copy", async () => {
    near.sign = () => {
      throw new Error("User closed the window")
    }
    const e = await walletSend(intent, { accountId: "me.testnet" }).catch((x: unknown) => x)
    expect(e).toMatchObject({ cls: "failed", reason: "wallet_declined" })
    expect(addErrorKey(e)).toBe("add.error.not_approved")
  })
})

describe("addErrorKey", () => {
  const err = (reason: string, status?: number) => new ActionError(classOfReason(reason, status), reason)
  it.each([
    ["wallet_account_mismatch", "add.error.other_account"],
    ["sender_mismatch", "add.error.other_account"],
    ["reconnect_wallet", "add.error.sign_in_again"],
    ["key_not_found", "add.error.sign_in_again"],
    ["nonce_pending", "add.error.busy"],
    ["ttl_too_long", "add.error.busy"],
    ["pot_closed", "add.error.closed"],
    ["not_a_member", "add.error.not_member"],
    ["quota_exceeded", "relayer.cap"],
    ["service_unavailable", "add.error.relayer"],
    ["not_recorded", "add.error.generic"],
  ])("%s → %s", (reason, key) => {
    const e = reason === "wallet_account_mismatch" || reason === "reconnect_wallet" ? new ActionError("needs_device", reason) : err(reason)
    expect(addErrorKey(e)).toBe(key)
  })
  it("ttl_too_long is re-signed once like an expired delegate (api-spec §1.2)", () => {
    expect(classOfReason("ttl_too_long")).toBe("retryable")
  })
})
