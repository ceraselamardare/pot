// Live exchange rates for "Snap the receipt": a receipt in euros (or any other currency) becomes dollars on the
// server, with the rate, its day and its source, so the Spend sheet shows "€42.50 ≈ $46.12 · rate 1.0852 from Oct 30".
// Sources (free, no key; checked 2026-11-01):
//  1. Frankfurter, the European Central Bank's daily reference rates: GET https://api.frankfurter.dev/v1/latest →
//     {"amount":1.0,"base":"EUR","date":"2026-10-30","rates":{"USD":1.1172,"GBP":0.8338,…}} (~30 currencies, working
//     days only: on a weekend the date is Friday's). api.frankfurter.app now 301s here.
//  2. Fallback, ExchangeRate-API's open endpoint: GET https://open.er-api.com/v6/latest/USD →
//     {"result":"success","time_last_update_unix":…,"base_code":"USD","rates":{"EUR":0.8951,…}} (~160 currencies,
//     daily; its terms ask for attribution, which the sheet's source line gives).
// One table per source, cached in memory for an hour (a failure for a minute, so a dead source can't add 3 s to every
// reading); each fetch has a 3 s timeout. If neither source has a rate, the reading still comes back: the sheet then
// asks for the amount in dollars, as before. Rates are reference rates, not what a card charged: the sheet says so.
import "server-only"
import { logLine } from "../log"
import { conversionOf, isoDayUtc, mockFx, needsConversion, type ReceiptFx, type ReceiptRateSource, type ReceiptResult } from "@/lib/receipt"

export const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
export const ER_API_URL = "https://open.er-api.com/v6/latest/USD"
export const FX_TTL_MS = 60 * 60_000
export const FX_FAIL_TTL_MS = 60_000
export const FX_TIMEOUT_MS = 3_000

/** Dollars per 1 unit of each currency, for one day, from one source. */
export interface RateTable {
  usdPer: Readonly<Record<string, number>>
  date: string
  source: Exclude<ReceiptRateSource, "sample">
}

export type FxMode = "live" | "mock" | "off"

export interface FxConverter {
  /** The dollars for a reading in another currency; null when there's nothing to convert. Never throws. */
  convert(r: ReceiptResult): Promise<ReceiptFx | null>
}

type Fetch = typeof fetch

const CODE = /^[A-Z]{3}$/
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0

/** Frankfurter's EUR table → dollars per unit (USD/EUR ÷ X/EUR; EUR itself is USD/EUR). null if the shape is off. */
export function parseFrankfurter(body: unknown): RateTable | null {
  const b = body as { base?: unknown; date?: unknown; rates?: Record<string, unknown> } | null
  if (!b || b.base !== "EUR" || typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.rates) return null
  const usd = b.rates.USD
  if (!positive(usd)) return null
  const usdPer: Record<string, number> = { EUR: usd }
  for (const [code, perEur] of Object.entries(b.rates)) if (CODE.test(code) && code !== "USD" && positive(perEur)) usdPer[code] = usd / perEur
  return { usdPer, date: b.date, source: "ecb" }
}

/** open.er-api's USD table → dollars per unit (1 ÷ X/USD). null if the shape is off. */
export function parseErApi(body: unknown): RateTable | null {
  const b = body as { result?: unknown; base_code?: unknown; time_last_update_unix?: unknown; rates?: Record<string, unknown> } | null
  if (!b || b.result !== "success" || b.base_code !== "USD" || !positive(b.time_last_update_unix) || !b.rates) return null
  const usdPer: Record<string, number> = {}
  for (const [code, perUsd] of Object.entries(b.rates)) if (CODE.test(code) && code !== "USD" && positive(perUsd)) usdPer[code] = 1 / perUsd
  if (Object.keys(usdPer).length === 0) return null
  return { usdPer, date: isoDayUtc(b.time_last_update_unix * 1000), source: "er" }
}

interface Slot {
  table: RateTable | null
  until: number
  inflight: Promise<RateTable | null> | null
}

export interface LiveFxOptions {
  fetch?: Fetch
  now?: () => number
  ttlMs?: number
  failTtlMs?: number
  timeoutMs?: number
  /** called once per failed fetch (a short reason, never a body): the route logs it */
  onError?: (source: RateTable["source"], why: string) => void
}

export function createLiveFx(o: LiveFxOptions = {}): FxConverter & { usdRate(code: string): Promise<{ rate: number; date: string; source: RateTable["source"] } | "unsupported" | "unavailable"> } {
  const doFetch: Fetch = o.fetch ?? ((...a) => fetch(...a))
  const now = o.now ?? Date.now
  const ttl = o.ttlMs ?? FX_TTL_MS
  const failTtl = o.failTtlMs ?? FX_FAIL_TTL_MS
  const timeout = o.timeoutMs ?? FX_TIMEOUT_MS
  const sources: [RateTable["source"], string, (b: unknown) => RateTable | null][] = [
    ["ecb", FRANKFURTER_URL, parseFrankfurter],
    ["er", ER_API_URL, parseErApi],
  ]
  const slots = new Map<RateTable["source"], Slot>()

  async function load(source: RateTable["source"], url: string, parse: (b: unknown) => RateTable | null): Promise<RateTable | null> {
    try {
      const res = await doFetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeout), cache: "no-store" })
      if (!res.ok) {
        o.onError?.(source, `http ${res.status}`)
        return null
      }
      const table = parse(await res.json())
      if (!table) o.onError?.(source, "shape")
      return table
    } catch (e) {
      o.onError?.(source, e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network")
      return null
    }
  }

  /** One source's table: cached (an hour, a failure a minute), one fetch in flight at a time. */
  function table(source: RateTable["source"], url: string, parse: (b: unknown) => RateTable | null): Promise<RateTable | null> {
    const slot = slots.get(source)
    if (slot?.inflight) return slot.inflight
    if (slot && now() < slot.until) return Promise.resolve(slot.table)
    const inflight = load(source, url, parse).then((t) => {
      slots.set(source, { table: t, until: now() + (t ? ttl : failTtl), inflight: null })
      return t
    })
    slots.set(source, { table: slot?.table ?? null, until: 0, inflight })
    return inflight
  }

  async function usdRate(code: string) {
    let reached = false
    for (const [source, url, parse] of sources) {
      const t = await table(source, url, parse)
      if (!t) continue
      reached = true
      const rate = t.usdPer[code]
      if (rate !== undefined) return { rate, date: t.date, source: t.source }
    }
    return reached ? ("unsupported" as const) : ("unavailable" as const)
  }

  return {
    usdRate,
    async convert(r) {
      if (!needsConversion(r)) return null
      try {
        const got = await usdRate(r.currency)
        if (typeof got === "string") return { ok: false, from: r.currency, why: got }
        return conversionOf(r.currency, r.totalCents, got.rate, got.date, got.source) ?? { ok: false, from: r.currency, why: "unsupported" }
      } catch {
        return { ok: false, from: r.currency, why: "unavailable" }
      }
    },
  }
}

/** The mock's fixed table (e2e, the server's MOCK receipts mode): EUR 1.0852 dated today, source "sample". */
export function createMockFx(now: () => number = Date.now): FxConverter {
  return { convert: async (r) => mockFx(r, now()) }
}

/** No lookups (POT_FX_MODE=off): another currency is never converted; the sheet asks for dollars. */
export const offFx: FxConverter = {
  async convert(r) {
    return needsConversion(r) ? { ok: false, from: r.currency, why: "unavailable" } : null
  },
}

/** POT_FX_MODE=live|mock|off; unset: mock when the receipts reader is the mock, else live. Production is never mock. */
export function fxMode(receiptsMode: "live" | "mock" | "off", env: Record<string, string | undefined> = process.env): FxMode {
  const forced = env.POT_FX_MODE?.trim().toLowerCase()
  const production = env.VERCEL_ENV === "production"
  if (forced === "off") return "off"
  if (forced === "live") return "live"
  if (forced === "mock") return production ? "live" : "mock"
  return receiptsMode === "mock" ? "mock" : "live"
}

let shared: FxConverter | null = null
/** The process-wide converter for a mode (the live one keeps its hour-long cache across requests on a warm instance). */
export function fxFor(mode: FxMode): FxConverter {
  if (mode === "off") return offFx
  if (mode === "mock") return createMockFx()
  shared ??= createLiveFx({ onError: (source, why) => logLine({ msg: "fx_source_failed", source, why }) })
  return shared
}
