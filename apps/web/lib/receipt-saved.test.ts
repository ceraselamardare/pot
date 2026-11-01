// lib/receipt-saved.ts: the canonical JSON (sorted keys, integer cents, the rate as a string), its SHA-256 and the
// 16-hex fingerprint a spend carries, stable across key orders and runs; the strict schema and its meaning checks;
// building the saved details from a reading (never the photo).
import { describe, expect, it } from "vitest"
import { isValidRequestRef, receiptFingerprintOfRef, spendRef } from "@pot/sdk"
import { MOCK_RECEIPTS, mockFx, type ReceiptRead } from "./receipt"
import {
  FINGERPRINT_HEX,
  RECEIPT_VERIFY_URL,
  SAVED_RECEIPT_MAX_BYTES,
  canonicalJson,
  fingerprintStatus,
  modelOfVerifyUrl,
  newReceiptNonce,
  receiptFingerprint,
  savedReceiptOf,
  shortFingerprint,
  validateSavedReceipt,
  type SavedReceipt,
} from "./receipt-saved"

const NOW = Date.parse("2026-10-30T12:00:00.000Z")
const NONCE = "00112233445566778899aabbccddeeff"
const cafe = MOCK_RECEIPTS["cafe-eur"] as ReceiptRead
const pingo = MOCK_RECEIPTS["pingo-doce"] as ReceiptRead

const euro = (): SavedReceipt =>
  savedReceiptOf(
    {
      result: cafe,
      fx: { ok: true, from: "EUR", amountCents: 4250, usdCents: 4612, rate: 1.0852, rateDate: "2026-10-29", source: "ecb" },
      proof: { verifyUrl: `${RECEIPT_VERIFY_URL}?model=z-ai%2Fglm-5.3-flash`, reply: false },
      source: "near-ai",
    },
    { nonce: NONCE, readAt: NOW - 60_000 },
  )!

describe("canonical JSON", () => {
  it("sorts keys at every level, no whitespace, nulls kept, integers as integers", () => {
    expect(canonicalJson({ b: 1, a: { d: null, c: [3, { z: true, y: "x" }] } })).toBe('{"a":{"c":[3,{"y":"x","z":true}],"d":null},"b":1}')
    expect(canonicalJson({ a: undefined, b: 2 })).toBe('{"b":2}')
    expect(canonicalJson("é \"q\"")).toBe('"é \\"q\\""')
    expect(() => canonicalJson({ x: Number.NaN })).toThrow()
    expect(() => canonicalJson({ x: 1n })).toThrow()
  })

  it("the same receipt gives the same fingerprint whatever the key order; any change gives another", () => {
    const r = euro()
    const fp = receiptFingerprint(r)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
    const reversed = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(r).reverse()))) as SavedReceipt
    expect(receiptFingerprint(reversed)).toBe(fp)
    expect(receiptFingerprint(structuredClone(r))).toBe(fp)
    expect(receiptFingerprint({ ...r, merchant: "Taberna da Rua " })).not.toBe(fp)
    expect(receiptFingerprint({ ...r, tipCents: 401 })).not.toBe(fp)
    expect(receiptFingerprint({ ...r, nonce: "f".repeat(32) })).not.toBe(fp)
  })

  it("is pinned: a known receipt has a known fingerprint (the server and the browser must agree forever)", () => {
    const r = euro()
    expect(canonicalJson(r)).toBe(
      '{"currency":"EUR","date":"2026-10-27","fx":{"amountCents":4250,"from":"EUR","rate":"1.0852","rateDate":"2026-10-29","source":"ecb","usdCents":4612},' +
        '"items":[{"amountCents":2600,"name":"Bacalhau à Brás","qty":2},{"amountCents":450,"name":"Caldo verde","qty":1},{"amountCents":800,"name":"Imperial","qty":2}],' +
        '"merchant":"Taberna da Rua","nonce":"00112233445566778899aabbccddeeff","proof":{"model":"z-ai/glm-5.3-flash","reply":false,"verifyUrl":"https://cloud.near.ai/verify?model=z-ai%2Fglm-5.3-flash"},' +
        '"readAt":"2026-10-30T11:59:00.000Z","source":"near-ai","taxCents":795,"tipCents":400,"totalCents":4250,"v":1}',
    )
    expect(receiptFingerprint(r)).toBe(PINNED)
  })

  it("the short form fits the spend's request_ref: OpKey + 16 hex = 32, the hub's own rule", () => {
    const fp = receiptFingerprint(euro())
    expect(shortFingerprint(fp)).toHaveLength(FINGERPRINT_HEX)
    const ref = spendRef("k3d9x1a2b4c6m7n8", fp)
    expect(isValidRequestRef(ref)).toBe(true)
    expect(receiptFingerprintOfRef(ref)).toBe(shortFingerprint(fp))
  })

  it("fingerprintStatus: match, mismatch after an edit, missing when the spend carries none", () => {
    const r = euro()
    const on = shortFingerprint(receiptFingerprint(r))
    expect(fingerprintStatus(r, on)).toBe("match")
    expect(fingerprintStatus({ ...r, merchant: "Edited" }, on)).toBe("mismatch")
    expect(fingerprintStatus(r, null)).toBe("missing")
  })
})

// sha256 of the canonical JSON above, computed independently (node:crypto), so a change to the canonical form fails
const PINNED = "022ec775633c544722ffcbb67c88a00aa1e24c77b1ef2c89f177626d9b96336d"

describe("from a reading", () => {
  it("keeps what was read and confirmed, the conversion it used, the proof's model and when; never an image", () => {
    const r = euro()
    expect(r).toMatchObject({
      v: 1,
      merchant: "Taberna da Rua",
      currency: "EUR",
      totalCents: 4250,
      fx: { from: "EUR", amountCents: 4250, usdCents: 4612, rate: "1.0852", rateDate: "2026-10-29", source: "ecb" },
      proof: { reply: false, model: "z-ai/glm-5.3-flash" },
      readAt: "2026-10-30T11:59:00.000Z",
    })
    expect(Object.keys(r).sort()).toEqual(["currency", "date", "fx", "items", "merchant", "nonce", "proof", "readAt", "source", "taxCents", "tipCents", "totalCents", "v"])
    expect(validateSavedReceipt(r, NOW)).toEqual({ ok: true, value: r })
  })

  it("a dollar receipt has no conversion; a conversion for another currency is dropped; the mock has no proof", () => {
    const usd = savedReceiptOf({ result: pingo, fx: null, proof: null, source: "mock" }, { nonce: NONCE, readAt: NOW })!
    expect(usd).toMatchObject({ currency: "USD", fx: null, proof: null, source: "mock", totalCents: 8420 })
    expect(validateSavedReceipt(usd, NOW).ok).toBe(true)
    const wrongFx = savedReceiptOf({ result: cafe, fx: { ok: true, from: "GBP", amountCents: 4250, usdCents: 5378, rate: 1.2655, rateDate: "2026-10-29", source: "ecb" }, proof: null, source: "near-ai" }, { nonce: NONCE, readAt: NOW })!
    expect(wrongFx.fx).toBeNull()
    const sample = savedReceiptOf({ result: cafe, fx: mockFx(cafe, NOW), proof: null, source: "mock" }, { nonce: NONCE, readAt: NOW })!
    expect(sample.fx).toMatchObject({ rate: "1.0852", usdCents: 4612, source: "sample" })
    expect(validateSavedReceipt(sample, NOW).ok).toBe(true)
  })

  it("a reply proof keeps its #receipt fragment; the model comes from the link", () => {
    const url = `${RECEIPT_VERIFY_URL}?model=z-ai%2Fglm-5.3-flash#receipt=eyJjaGF0X2lkIjoiYyJ9`
    expect(modelOfVerifyUrl(url)).toBe("z-ai/glm-5.3-flash")
    const r = savedReceiptOf({ result: pingo, fx: null, proof: { verifyUrl: url, reply: true }, source: "near-ai" }, { nonce: NONCE, readAt: NOW })!
    expect(r.proof).toEqual({ verifyUrl: url, reply: true, model: "z-ai/glm-5.3-flash" })
    expect(validateSavedReceipt(r, NOW).ok).toBe(true)
    expect(modelOfVerifyUrl("not a url")).toBeNull()
  })

  it("no total → nothing to save; nonces are 32 hex chars and differ", () => {
    expect(savedReceiptOf({ result: { ...pingo, totalCents: null }, fx: null, proof: null, source: "mock" }, { nonce: NONCE, readAt: NOW })).toBeNull()
    const a = newReceiptNonce()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newReceiptNonce()).not.toBe(a)
  })
})

describe("validation (the server's and the mock's)", () => {
  const ok = euro()
  it.each([
    ["extra keys (an image)", { ...ok, image: "AAAA" }, "receipt"],
    ["cents as floats", { ...ok, taxCents: 7.95 }, "taxCents"],
    ["negative cents", { ...ok, tipCents: -1 }, "tipCents"],
    ["a zero total", { ...ok, totalCents: 0, fx: null }, "totalCents"],
    ["a lower-case currency", { ...ok, currency: "eur" }, "currency"],
    ["an uncleaned merchant", { ...ok, merchant: "  Taberna  " }, "merchant"],
    ["a merchant over 48 characters", { ...ok, merchant: "x".repeat(49) }, "merchant"],
    ["an item name with a control char", { ...ok, items: [{ name: "a\u0000b", qty: 1, amountCents: 1 }] }, "items.0.name"],
    ["a qty with 4 decimals", { ...ok, items: [{ name: "Cheese", qty: 0.1234, amountCents: 1 }] }, "items.0.qty"],
    ["a qty of 1000", { ...ok, items: [{ name: "Cheese", qty: 1000, amountCents: 1 }] }, "items.0.qty"],
    ["Feb 30", { ...ok, date: "2026-02-30" }, "date"],
    ["a receipt from the future", { ...ok, date: "2026-11-05" }, "date"],
    ["a conversion from another currency", { ...ok, fx: { ...ok.fx!, from: "GBP" } }, "fx.from"],
    ["a conversion of another amount", { ...ok, fx: { ...ok.fx!, amountCents: 4000 } }, "fx.amountCents"],
    ["a rate not as shown", { ...ok, fx: { ...ok.fx!, rate: "1.08520" } }, "fx.rate"],
    ["dollars that don't add up", { ...ok, fx: { ...ok.fx!, usdCents: 4613 } }, "fx.usdCents"],
    ["dollars converted to dollars", { ...ok, currency: "USD" }, "fx"],
    ["a proof elsewhere", { ...ok, proof: { ...ok.proof!, verifyUrl: "https://example.com/verify?model=z-ai%2Fglm-5.3-flash" } }, "proof.verifyUrl"],
    ["a proof for another model", { ...ok, proof: { ...ok.proof!, model: "other/model" } }, "proof.verifyUrl"],
    ["a reply flag without the reply's receipt", { ...ok, proof: { ...ok.proof!, reply: true } }, "proof.verifyUrl"],
    ["a proof link over 4 KB", { ...ok, proof: { ...ok.proof!, reply: true, verifyUrl: `${ok.proof!.verifyUrl}#receipt=${"a".repeat(4100)}` } }, "proof.verifyUrl"],
    ["readAt not ISO", { ...ok, readAt: "Thu Oct 30 2026 12:00:00" }, "readAt"],
    ["a reading from 31 days ago", { ...ok, readAt: new Date(NOW - 31 * 86_400_000).toISOString() }, "readAt"],
    ["a bad nonce", { ...ok, nonce: "xyz" }, "nonce"],
    ["version 2", { ...ok, v: 2 }, "v"],
  ])("refuses %s", (_name, raw, field) => {
    const r = validateSavedReceipt(raw, NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.field).toBe(field)
  })

  it("caps the size: 30 items of 60 characters is fine and well under the cap", () => {
    const many = { ...ok, items: Array.from({ length: 30 }, (_, i) => ({ name: `${"Item ".repeat(11)}${String(i).padStart(4, "0")}`.slice(0, 60), qty: 999.999, amountCents: 99_999_999 })) }
    const r = validateSavedReceipt(many, NOW)
    expect(r.ok).toBe(true)
    expect(new TextEncoder().encode(canonicalJson(many)).byteLength).toBeLessThan(SAVED_RECEIPT_MAX_BYTES / 2)
  })
})
