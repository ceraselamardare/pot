// @vitest-environment jsdom
// Saving the receipt details with a spend, end to end over the mock data source (lib/client/actions.ts requestSpend →
// the mock world, lib/client/receipts/saved.ts): the fingerprint rides in the request, the details are kept on this
// device until saved, then saved with the request id the spend got; a save that fails stays pending and is tried again
// from the spend's details; edited details are refused and not kept.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import { requestSpend } from "@/lib/client/actions"
import { cents } from "@/lib/client/money"
import * as store from "@/lib/client/mock/store"
import type { World } from "@/lib/client/mock/types"
import * as W from "@/lib/client/mock/world"
import { MOCK_RECEIPTS, mockFx, type ReceiptRead } from "@/lib/receipt"
import { receiptFingerprint, savedReceiptOf, shortFingerprint } from "@/lib/receipt-saved"
import { attachReceipt, pendingReceiptFor, retryPendingReceipt } from "./saved"

const world = () => JSON.parse(localStorage.getItem("pot.mock.world.v1")!) as World
const cafe = MOCK_RECEIPTS["cafe-eur"] as ReceiptRead
const receipt = () => savedReceiptOf({ result: cafe, fx: mockFx(cafe), proof: null, source: "mock" }, { nonce: "b".repeat(32), readAt: Date.now() - 1_000 })!

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("pot.mock.seed", "classic")
  store.setSession("maya")
  store.resetWorld()
  toast.mockClear()
})
afterEach(() => vi.useRealTimers())

describe("a spend with a scanned receipt", () => {
  it("carries the fingerprint, then the details are saved with the request id it got", async () => {
    const r = receipt()
    const res = await requestSpend("lisbon-trip", { amount: cents(4_612), category: "food", receiver: "maya", receipt: r })
    expect(res.path).toBe("instant")
    const fp = shortFingerprint(receiptFingerprint(r))
    expect(W.requestView(world(), "lisbon-trip", res.id, "maya", Date.now())!.fingerprint).toBe(fp)
    // kept on this device until the save lands
    expect(pendingReceiptFor("lisbon-trip", fp)?.receipt).toEqual(r)
    await vi.waitFor(() => expect(W.savedReceiptFor(world(), "lisbon-trip", res.id, "sam")).toEqual(r), { timeout: 3_000 })
    await vi.waitFor(() => expect(pendingReceiptFor("lisbon-trip", fp)).toBeNull())
    expect(W.requestView(world(), "lisbon-trip", res.id, "sam", Date.now())!.hasReceipt).toBe(true)
    expect(toast).not.toHaveBeenCalled()
  })

  it("a failed save stays pending (a quiet toast) and the details sheet's retry saves it", async () => {
    localStorage.setItem("pot.mock.fail", "receipt_save")
    const r = receipt()
    const res = await requestSpend("lisbon-trip", { amount: cents(4_612), category: "food", receiver: "maya", receipt: r })
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("The spend went through, but the receipt details weren't saved yet. Open the spend to try again."), { timeout: 3_000 })
    const vm = W.requestView(world(), "lisbon-trip", res.id, "maya", Date.now())!
    expect(vm.hasReceipt).toBe(false)
    expect(pendingReceiptFor("lisbon-trip", vm.fingerprint)).not.toBeNull()
    // someone else's details sheet doesn't try; mine does
    expect(await retryPendingReceipt("lisbon-trip", { ...vm, mine: false })).toBe(false)
    expect(await retryPendingReceipt("lisbon-trip", vm)).toBe(true)
    expect(W.savedReceiptFor(world(), "lisbon-trip", res.id, "maya")).toEqual(r)
    expect(pendingReceiptFor("lisbon-trip", vm.fingerprint)).toBeNull()
  })

  it("details that don't match the spend are refused and not kept", async () => {
    const r = receipt()
    const res = await requestSpend("lisbon-trip", { amount: cents(4_612), category: "food", receiver: "maya", receipt: r })
    await vi.waitFor(() => expect(W.savedReceiptFor(world(), "lisbon-trip", res.id, "maya")).not.toBeNull(), { timeout: 3_000 })
    const other = await requestSpend("lisbon-trip", { amount: cents(500), category: "food", receiver: "maya" })
    expect(await attachReceipt("lisbon-trip", other.id, { ...r, merchant: "Somewhere" })).toBe(false)
    expect(W.savedReceiptFor(world(), "lisbon-trip", other.id, "maya")).toBeNull()
  })
})
