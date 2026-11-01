// Receipt details saved with a spend in the mock world (the server's spend_receipt twin): the fingerprint rides in the
// request's ref, only the requester saves, once, details that match it; members read them, others don't; the view
// models carry `fingerprint` and `hasReceipt`; the showcase seeds one (Ski Chalet, request 103) that checks out; the
// record and a person's activity mark it and every spend opens its details.
import { describe, expect, it } from "vitest"
import { isValidRequestRef } from "@pot/sdk"
import { MOCK_RECEIPTS, mockFx, type ReceiptRead } from "@/lib/receipt"
import { fingerprintStatus, receiptFingerprint, savedReceiptOf, shortFingerprint, type SavedReceipt } from "@/lib/receipt-saved"
import { activityHref, activityOfPerson } from "../activity"
import { rowsFromRequests } from "../record"
import type { World } from "./types"
import { potView, requestSpend, requestView, ReceiptWorldError, saveReceipt, savedReceiptFor, seedWorld } from "./world"
import { showcaseReceipt, withShowcase } from "./wave4"

const NOW = Date.parse("2026-10-30T12:00:00.000Z")
const cafe = MOCK_RECEIPTS["cafe-eur"] as ReceiptRead
const receipt = (): SavedReceipt => savedReceiptOf({ result: cafe, fx: mockFx(cafe, NOW), proof: null, source: "mock" }, { nonce: "a".repeat(32), readAt: NOW - 60_000 })!

/** Maya spends $46.12 (instant, Lisbon Trip) with the euro receipt's fingerprint in its ref. */
function withSpend(r = receipt()): { w: World; id: number } {
  const out = requestSpend(seedWorld(NOW), "lisbon-trip", "maya", { amountCents: 4_612, category: "food", receiver: "maya", fingerprint: receiptFingerprint(r) }, NOW)
  return { w: out.world, id: out.request.id }
}

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof ReceiptWorldError ? e.code : String(e)
  }
  return "ok"
}

describe("mock world: receipt details", () => {
  it("the request's ref is OpKey + the fingerprint (a valid hub request_ref); the view carries it", () => {
    const r = receipt()
    const { w, id } = withSpend(r)
    const rec = w.pots["lisbon-trip"]!.requests.find((x) => x.id === id)!
    expect(rec.ref).toHaveLength(32)
    expect(isValidRequestRef(rec.ref!)).toBe(true)
    const vm = requestView(w, "lisbon-trip", id, "maya", NOW)!
    expect(vm.fingerprint).toBe(shortFingerprint(receiptFingerprint(r)))
    expect(vm.hasReceipt).toBe(false)
    // a spend without a receipt carries none
    const plain = requestSpend(w, "lisbon-trip", "maya", { amountCents: 500, category: "food", receiver: "maya" }, NOW)
    expect(requestView(plain.world, "lisbon-trip", plain.request.id, "maya", NOW)!.fingerprint).toBeNull()
  })

  it("the requester saves it once; members read it and the fingerprint matches; others read nothing", () => {
    const r = receipt()
    const { w, id } = withSpend(r)
    const saved = saveReceipt(w, "lisbon-trip", id, "maya", r, NOW)
    expect(savedReceiptFor(saved, "lisbon-trip", id, "sam")).toEqual(r)
    expect(savedReceiptFor(saved, "lisbon-trip", id, "alex")).toBeNull() // not a member
    expect(savedReceiptFor(saved, "lisbon-trip", id, null)).toBeNull()
    const vm = requestView(saved, "lisbon-trip", id, "sam", NOW)!
    expect(vm.hasReceipt).toBe(true)
    expect(fingerprintStatus(savedReceiptFor(saved, "lisbon-trip", id, "sam")!, vm.fingerprint)).toBe("match")
    // the same details again: nothing changes; other details: refused
    expect(saveReceipt(saved, "lisbon-trip", id, "maya", r, NOW)).toBe(saved)
    expect(code(() => saveReceipt(saved, "lisbon-trip", id, "maya", { ...r, merchant: "Elsewhere" }, NOW))).toBe("already_saved")
  })

  it("refuses edits, other people, spends without a fingerprint, outsiders and bad shapes", () => {
    const r = receipt()
    const { w, id } = withSpend(r)
    expect(code(() => saveReceipt(w, "lisbon-trip", id, "maya", { ...r, tipCents: 500 }, NOW))).toBe("mismatch")
    expect(code(() => saveReceipt(w, "lisbon-trip", id, "sam", r, NOW))).toBe("not_requester")
    expect(code(() => saveReceipt(w, "lisbon-trip", id, "alex", r, NOW))).toBe("not_member")
    expect(code(() => saveReceipt(w, "lisbon-trip", 9_999, "maya", r, NOW))).toBe("not_found")
    expect(code(() => saveReceipt(w, "lisbon-trip", id, "maya", { ...r, image: "AAAA" }, NOW))).toBe("invalid")
    const plain = requestSpend(w, "lisbon-trip", "maya", { amountCents: 500, category: "food", receiver: "maya" }, NOW)
    expect(code(() => saveReceipt(plain.world, "lisbon-trip", plain.request.id, "maya", r, NOW))).toBe("no_fingerprint")
  })

  it("an edit after saving shows as a mismatch against the request's own fingerprint", () => {
    const r = receipt()
    const { w, id } = withSpend(r)
    const saved = saveReceipt(w, "lisbon-trip", id, "maya", r, NOW)
    const tampered: World = { ...saved, receipts: { ...saved.receipts, [`lisbon-trip:${id}`]: { ...r, merchant: "Taberna Nova" } } }
    const vm = requestView(tampered, "lisbon-trip", id, "maya", NOW)!
    expect(fingerprintStatus(savedReceiptFor(tampered, "lisbon-trip", id, "maya")!, vm.fingerprint)).toBe("mismatch")
  })

  it("the record and a person's activity mark it; every spend (instant too) opens its details", () => {
    const r = receipt()
    const { w, id } = withSpend(r)
    const saved = saveReceipt(w, "lisbon-trip", id, "maya", r, NOW)
    const pot = potView(saved, "lisbon-trip", "maya", NOW)!
    const rows = rowsFromRequests(pot.feed.flatMap((f) => (f.kind === "request" ? [f.request] : [])))
    expect(rows.find((x) => x.id === id)).toMatchObject({ receipt: true, approvedBy: "rules", status: "paid" })
    expect(rows.filter((x) => x.receipt)).toHaveLength(1)
    const asked = activityOfPerson(pot, "maya").find((i) => i.kind === "asked" && i.requestId === id)!
    expect(asked).toMatchObject({ path: "instant", hasReceipt: true })
    expect(activityHref(asked)).toBe(`/p/lisbon-trip?r=${id}`)
  })

  it("the showcase seeds Maya's €32.25 café receipt on Ski Chalet's $35 spend, and it checks out", () => {
    const w = withShowcase(seedWorld(NOW), NOW)
    const vm = requestView(w, "ski-chalet", 103, "sam", NOW)!
    expect(vm).toMatchObject({ status: "instant", hasReceipt: true })
    const saved = savedReceiptFor(w, "ski-chalet", 103, "sam")!
    expect(saved).toEqual(showcaseReceipt(NOW))
    expect(saved.fx).toMatchObject({ amountCents: 3_225, usdCents: 3_500, rate: "1.0852" })
    expect(fingerprintStatus(saved, vm.fingerprint)).toBe("match")
    // nothing else in the showcase has one
    expect(requestView(w, "ski-chalet", 101, "sam", NOW)!).toMatchObject({ hasReceipt: false, fingerprint: null })
  })
})
