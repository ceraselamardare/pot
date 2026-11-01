// server/features/fx.ts with a mocked fetch (never the network): Frankfurter's ECB table first, open.er-api as the
// fallback, an hour's cache (a failure for a minute), one fetch in flight, the 3 s timeout, both failing, a currency
// neither has, dollars passing through, the conversion rounded half up to a cent; the mock's fixed table; the mode.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { mockReceipt, type ReceiptRead } from "@/lib/receipt"
import { createLiveFx, createMockFx, ER_API_URL, FRANKFURTER_URL, fxMode, offFx, parseErApi, parseFrankfurter } from "./fx"

const ECB = { amount: 1.0, base: "EUR", date: "2026-10-30", rates: { USD: 1.0852, GBP: 0.8338, JPY: 175.68 } }
const ER = { result: "success", base_code: "USD", time_last_update_unix: 1793491351, rates: { USD: 1, EUR: 0.9, VND: 25_000, AED: 3.6725 } }
const eur = (cents = 4250): ReceiptRead => ({ ...(mockReceipt("receipt-cafe-eur.jpg") as ReceiptRead), totalCents: cents })
const inCurrency = (currency: string, cents = 10_000): ReceiptRead => ({ ...eur(cents), currency })

type Route = Record<string, () => Promise<Response> | Response>
function fakeFetch(routes: Route) {
  const calls: string[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push(u)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const r = routes[u]
    if (!r) throw new TypeError("fetch failed")
    return r()
  })
  return { fn: fn as unknown as typeof fetch, calls }
}
const json = (b: unknown, status = 200) => () => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } })

describe("live rates", () => {
  it("ECB first: €42.50 at 1.0852 → $46.12, dated the rate's day, source ecb", async () => {
    const f = fakeFetch({ [FRANKFURTER_URL]: json(ECB) })
    const fx = createLiveFx({ fetch: f.fn })
    expect(await fx.convert(eur())).toEqual({ ok: true, from: "EUR", amountCents: 4250, usdCents: 4612, rate: 1.0852, rateDate: "2026-10-30", source: "ecb" })
    expect(f.calls).toEqual([FRANKFURTER_URL])
  })

  it("cross rates through the euro (GBP: 1.0852 / 0.8338), 6 significant digits, used as shown", async () => {
    const fx = createLiveFx({ fetch: fakeFetch({ [FRANKFURTER_URL]: json(ECB) }).fn })
    const r = await fx.convert(inCurrency("GBP", 10_000))
    expect(r).toMatchObject({ ok: true, rate: 1.30151, usdCents: 13015, source: "ecb" })
    // JPY: tiny rates keep their digits
    expect(await fx.convert(inCurrency("JPY", 500_000))).toMatchObject({ ok: true, rate: 0.00617714, usdCents: 3089 })
  })

  it("rounds half up to the cent (no float error at the half)", async () => {
    const fx = createLiveFx({ fetch: fakeFetch({ [FRANKFURTER_URL]: json({ ...ECB, rates: { USD: 1.005 } }) }).fn })
    // in cents: 50 × 1.005 = 50.25, 2 × 1.005 = 2.01, 100 × 1.005 = 100.5 (a float would say 100.49999…), 300 × 1.005 = 301.5
    expect(await fx.convert(eur(50))).toMatchObject({ usdCents: 50 }) // 50.25 → 50
    expect(await fx.convert(eur(2))).toMatchObject({ usdCents: 2 }) // 2.01 → 2
    expect(await fx.convert(eur(100))).toMatchObject({ usdCents: 101 }) // 100.5 → 101 (half up)
    expect(await fx.convert(eur(300))).toMatchObject({ usdCents: 302 }) // 301.5 → 302
  })

  it("caches the table for an hour: one fetch for many readings; refetches after", async () => {
    let now = 1_000_000
    const f = fakeFetch({ [FRANKFURTER_URL]: json(ECB) })
    const fx = createLiveFx({ fetch: f.fn, now: () => now })
    await Promise.all([fx.convert(eur()), fx.convert(eur(100)), fx.convert(inCurrency("GBP"))]) // one in flight
    await fx.convert(eur())
    expect(f.calls).toHaveLength(1)
    now += 59 * 60_000
    await fx.convert(eur())
    expect(f.calls).toHaveLength(1)
    now += 2 * 60_000
    await fx.convert(eur())
    expect(f.calls).toHaveLength(2)
  })

  it("falls back to open.er-api when Frankfurter fails (status, bad shape or network)", async () => {
    for (const bad of [json({ error: "x" }, 503), json({ base: "USD", rates: {} }), () => Promise.reject(new TypeError("fetch failed"))]) {
      const errors: string[] = []
      const f = fakeFetch({ [FRANKFURTER_URL]: bad, [ER_API_URL]: json(ER) })
      const fx = createLiveFx({ fetch: f.fn, onError: (s, why) => errors.push(`${s}:${why}`) })
      expect(await fx.convert(eur())).toEqual({ ok: true, from: "EUR", amountCents: 4250, usdCents: 4722, rate: 1.11111, rateDate: "2026-11-01", source: "er" })
      expect(f.calls).toEqual([FRANKFURTER_URL, ER_API_URL])
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/^ecb:(http 503|shape|network)$/)
    }
  })

  it("a currency the ECB doesn't publish comes from the fallback", async () => {
    const f = fakeFetch({ [FRANKFURTER_URL]: json(ECB), [ER_API_URL]: json(ER) })
    const fx = createLiveFx({ fetch: f.fn })
    expect(await fx.convert(inCurrency("AED", 10_000))).toMatchObject({ ok: true, from: "AED", rate: 0.272294, usdCents: 2723, source: "er" })
  })

  it("both fail → unavailable (the sheet asks for dollars); a failure is remembered for a minute", async () => {
    let now = 0
    const f = fakeFetch({})
    const fx = createLiveFx({ fetch: f.fn, now: () => now })
    expect(await fx.convert(eur())).toEqual({ ok: false, from: "EUR", why: "unavailable" })
    expect(f.calls).toEqual([FRANKFURTER_URL, ER_API_URL])
    await fx.convert(eur())
    expect(f.calls).toHaveLength(2)
    now += 61_000
    await fx.convert(eur())
    expect(f.calls).toHaveLength(4)
  })

  it("a currency nobody has → unsupported", async () => {
    const fx = createLiveFx({ fetch: fakeFetch({ [FRANKFURTER_URL]: json(ECB), [ER_API_URL]: json(ER) }).fn })
    expect(await fx.convert(inCurrency("XYZ"))).toEqual({ ok: false, from: "XYZ", why: "unsupported" })
  })

  it("times out after 3 s per source", async () => {
    const hang = (url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))
    const errors: string[] = []
    const fx = createLiveFx({ fetch: hang as typeof fetch, timeoutMs: 30, onError: (s, why) => errors.push(`${s}:${why}`) })
    const t0 = Date.now()
    expect(await fx.convert(eur())).toEqual({ ok: false, from: "EUR", why: "unavailable" })
    expect(Date.now() - t0).toBeLessThan(1_000)
    expect(errors).toEqual(["ecb:timeout", "er:timeout"])
  })

  it("dollars, no currency, no total, unreadable: nothing to convert, no fetch", async () => {
    const f = fakeFetch({})
    const fx = createLiveFx({ fetch: f.fn })
    expect(await fx.convert(mockReceipt())).toBeNull() // USD
    expect(await fx.convert({ ...eur(), currency: null })).toBeNull()
    expect(await fx.convert({ ...eur(), totalCents: null })).toBeNull()
    expect(await fx.convert({ readable: false })).toBeNull()
    expect(f.calls).toEqual([])
  })

  it("parsers reject what isn't the documented shape", () => {
    expect(parseFrankfurter(ECB)?.usdPer.EUR).toBe(1.0852)
    expect(parseFrankfurter({ ...ECB, rates: { GBP: 0.8 } })).toBeNull() // no USD
    expect(parseFrankfurter({ ...ECB, date: "yesterday" })).toBeNull()
    expect(parseErApi(ER)?.date).toBe("2026-11-01")
    expect(parseErApi({ ...ER, result: "error" })).toBeNull()
    expect(parseErApi({ ...ER, base_code: "EUR" })).toBeNull()
  })
})

describe("mock and off", () => {
  it("mock: the fixed EUR 1.0852 dated today; unknown currencies unsupported", async () => {
    const now = Date.UTC(2026, 10, 1, 12)
    const fx = createMockFx(() => now)
    expect(await fx.convert(eur())).toEqual({ ok: true, from: "EUR", amountCents: 4250, usdCents: 4612, rate: 1.0852, rateDate: "2026-11-01", source: "sample" })
    expect(await fx.convert(inCurrency("XYZ"))).toMatchObject({ ok: false, why: "unsupported" })
    expect(await fx.convert(mockReceipt())).toBeNull()
  })

  it("off: another currency is never converted", async () => {
    expect(await offFx.convert(eur())).toEqual({ ok: false, from: "EUR", why: "unavailable" })
  })

  it("mode: POT_FX_MODE wins; else mock with the mock reader, live otherwise; production is never mock", () => {
    expect(fxMode("live", {})).toBe("live")
    expect(fxMode("mock", {})).toBe("mock")
    expect(fxMode("live", { POT_FX_MODE: "off" })).toBe("off")
    expect(fxMode("live", { POT_FX_MODE: "mock" })).toBe("mock")
    expect(fxMode("live", { POT_FX_MODE: "mock", VERCEL_ENV: "production" })).toBe("live")
  })
})
