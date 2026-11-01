// @vitest-environment jsdom
// The browser side of "Snap the receipt": the downscale math, the error mapping the sheet relies on, and the mock
// reader (no network: a sample picked by file name; fault hooks for "unavailable" and "took too long").
import { afterEach, describe, expect, it, vi } from "vitest"

const prepare = vi.hoisted(() => vi.fn(async () => ({ base64: "AAAA", mime: "image/jpeg" as const, bytes: 3, width: 10, height: 10 })))
vi.mock("./image", async (orig) => ({ ...(await orig<typeof import("./image")>()), prepareReceiptImage: prepare }))

import { fitWithin, ReceiptImageError } from "./image"
import { failureOf, readReceiptPhoto, ReceiptReadError } from "./read"

afterEach(() => {
  localStorage.clear()
  prepare.mockClear()
  vi.useRealTimers()
})

const photo = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" })

describe("fitWithin", () => {
  it("scales the long edge to 1600 px, keeps the shape, never upscales", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(10_000, 3)).toEqual({ width: 1600, height: 1 })
  })
})

describe("failureOf (server answer → what the sheet says)", () => {
  it.each([
    [504, { reason: "service_unavailable", detail: { cause: "receipts_timeout" } }, "timeout"],
    [413, { reason: "bad_request", detail: { field: "body", cause: "too_large" } }, "too_large"],
    [400, { reason: "bad_request", detail: { field: "image", cause: "type" } }, "open"],
    [429, { reason: "rate_limited" }, "busy"],
    [503, { reason: "service_unavailable", detail: { cause: "receipts_busy" } }, "busy"],
    [503, { reason: "service_unavailable", detail: { cause: "global_cap" } }, "busy"],
    [502, { reason: "service_unavailable", detail: { cause: "receipts_provider" } }, "unavailable"],
    [404, { reason: "not_found", detail: { cause: "receipts_off" } }, "unavailable"],
    [403, { reason: "not_a_member" }, "unavailable"],
    [500, null, "unavailable"],
  ] as const)("%s %j → %s", (status, body, kind) => expect(failureOf(status, body)).toBe(kind))
})

describe("fxOf (the server's conversion, checked)", () => {
  it("passes a well-formed one, reads anything else as no rate, and an older server's absence as null", async () => {
    const { fxOf } = await import("./read")
    const ok = { ok: true, from: "EUR", amountCents: 4250, usdCents: 4612, rate: 1.0852, rateDate: "2026-10-30", source: "ecb" }
    expect(fxOf(ok)).toEqual(ok)
    expect(fxOf({ ...ok, usdCents: -1 })).toEqual({ ok: false, from: "EUR", why: "unavailable" })
    expect(fxOf({ ...ok, source: "elsewhere" })).toEqual({ ok: false, from: "EUR", why: "unavailable" })
    expect(fxOf({ ok: false, from: "XYZ", why: "unsupported" })).toEqual({ ok: false, from: "XYZ", why: "unsupported" })
    expect(fxOf(undefined)).toBeNull()
    expect(fxOf({ ok: true })).toBeNull()
  })
})

describe("mock reader", () => {
  it("prepares the photo, then reads the sample for its file name", async () => {
    const r = await readReceiptPhoto("lisbon-trip", photo("receipt-cafe-eur.jpg"))
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ source: "mock", proof: null, result: { readable: true, currency: "EUR", totalCents: 4250 } })
    // the mock's fixed rate, dated today: €42.50 ≈ $46.12
    expect(r.fx).toMatchObject({ ok: true, from: "EUR", usdCents: 4612, rate: 1.0852, source: "sample" })
    expect((await readReceiptPhoto("lisbon-trip", photo("IMG_1.jpg"))).fx).toBeNull()
    expect((await readReceiptPhoto("lisbon-trip", photo("IMG_1.jpg"))).result).toMatchObject({ merchant: "Pingo Doce", totalCents: 8420 })
    expect((await readReceiptPhoto("lisbon-trip", photo("receipt-blurry.jpg"))).result).toEqual({ readable: false })
  })

  it("fault hooks (consumed once): unavailable, then took too long", async () => {
    localStorage.setItem("pot.mock.fail", "receipt")
    await expect(readReceiptPhoto("lisbon-trip", photo("a.jpg"))).rejects.toMatchObject({ kind: "unavailable" })
    expect(localStorage.getItem("pot.mock.fail")).toBeNull()
    localStorage.setItem("pot.mock.fail", "receipt_timeout")
    await expect(readReceiptPhoto("lisbon-trip", photo("a.jpg"))).rejects.toMatchObject({ kind: "timeout" })
    // no rate today: the reading comes back, the conversion says why
    localStorage.setItem("pot.mock.fail", "receipt_rate")
    expect((await readReceiptPhoto("lisbon-trip", photo("receipt-cafe-eur.jpg"))).fx).toEqual({ ok: false, from: "EUR", why: "unavailable" })
    // other hooks belong to other flows
    localStorage.setItem("pot.mock.fail", "spend")
    await readReceiptPhoto("lisbon-trip", photo("a.jpg"))
    expect(localStorage.getItem("pot.mock.fail")).toBe("spend")
  })

  it("a photo the browser can't open → open; cancelling aborts", async () => {
    prepare.mockRejectedValueOnce(new ReceiptImageError("open"))
    const e = await readReceiptPhoto("lisbon-trip", photo("a.jpg")).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ReceiptReadError)
    expect((e as ReceiptReadError).kind).toBe("open")
    const ctrl = new AbortController()
    const p = readReceiptPhoto("lisbon-trip", photo("a.jpg"), ctrl.signal)
    await Promise.resolve()
    await Promise.resolve()
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: "AbortError" })
  })
})
