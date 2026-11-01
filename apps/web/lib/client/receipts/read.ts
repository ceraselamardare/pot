"use client"
// "Snap the receipt": one facade over both data sources.
//  - mock (the default build, e2e, design): the photo is still prepared (decode + downscale), then a deterministic
//    sample is picked by its file name (lib/receipt.ts MOCK_RECEIPTS). Nothing leaves the browser. Fault hooks:
//    localStorage['pot.mock.fail'] = 'receipt' (reading unavailable) | 'receipt_timeout' (took too long) |
//    'receipt_rate' (no exchange rate: the sheet asks for dollars). Another currency converts at the mock's fixed
//    rates (lib/receipt.ts MOCK_USD_RATES: EUR 1.0852), dated today.
//  - testnet: POST /api/receipts/read (members only, same-origin), shown only when GET /api/health says
//    features.receipts (the server has a NEAR AI key). The client gives up after 30 s and the person types it in.
// The photo is never stored: it exists in this call's memory and the request body only.
import { useQuery } from "@tanstack/react-query"
import { mockFx, mockReceipt, type ReceiptFx, type ReceiptReadRes } from "@/lib/receipt"
import { IS_LIVE, daoOf } from "../config"
import { prepareReceiptImage, ReceiptImageError } from "./image"

/** The server gives the provider 25 s (+ ≤ 2.5 s for the proof); past this the sheet falls back to typing. */
export const RECEIPT_CLIENT_TIMEOUT_MS = 30_000
/** The mock "reading" beat, so the state is visible in the design build. */
export const MOCK_RECEIPT_MS = 900

export type ReceiptFailure = "unreadable" | "timeout" | "open" | "too_large" | "busy" | "unavailable" | "offline"

export class ReceiptReadError extends Error {
  constructor(readonly kind: ReceiptFailure) {
    super(`receipt: ${kind}`)
  }
}

const FAIL_KEY = "pot.mock.fail"

function takeMockFailure(): "receipt" | "receipt_timeout" | "receipt_rate" | null {
  try {
    const v = localStorage.getItem(FAIL_KEY)
    if (v === "receipt" || v === "receipt_timeout" || v === "receipt_rate") {
      localStorage.removeItem(FAIL_KEY)
      return v
    }
  } catch {
    /* no storage */
  }
  return null
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(new DOMException("aborted", "AbortError"))
      },
      { once: true },
    )
  })

async function readMock(file: File, signal?: AbortSignal): Promise<ReceiptReadRes> {
  await prepareReceiptImage(file)
  const fail = takeMockFailure()
  await wait(MOCK_RECEIPT_MS, signal)
  if (fail === "receipt") throw new ReceiptReadError("unavailable")
  if (fail === "receipt_timeout") throw new ReceiptReadError("timeout")
  const result = mockReceipt(file.name)
  const fx = mockFx(result)
  return { result, proof: null, source: "mock", fx: fail === "receipt_rate" && fx ? { ok: false, from: fx.from, why: "unavailable" } : fx }
}

/** HTTP status + the error envelope → what the sheet says. */
export function failureOf(status: number, body: { reason?: string; detail?: { cause?: string; field?: string } } | null): ReceiptFailure {
  const cause = body?.detail?.cause
  if (status === 504 || cause === "receipts_timeout") return "timeout"
  if (status === 413 || cause === "too_large") return "too_large"
  if (body?.reason === "bad_request" && body.detail?.field === "image") return "open"
  if (status === 429 || cause === "receipts_busy" || cause === "global_cap") return "busy"
  return "unavailable"
}

async function readLive(slug: string, file: File, signal?: AbortSignal): Promise<ReceiptReadRes> {
  const img = await prepareReceiptImage(file)
  const timeout = AbortSignal.timeout(RECEIPT_CLIENT_TIMEOUT_MS)
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch("/api/receipts/read", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ pot: daoOf(slug), mime: img.mime, image: img.base64 }),
      signal: both,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    if (timeout.aborted) throw new ReceiptReadError("timeout")
    throw new ReceiptReadError(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "unavailable")
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* an HTML error page */
  }
  if (!res.ok) throw new ReceiptReadError(failureOf(res.status, body as Parameters<typeof failureOf>[1]))
  const data = body as Partial<ReceiptReadRes> | null
  if (!data?.result) throw new ReceiptReadError("unavailable")
  return { result: data.result, proof: data.proof ?? null, source: data.source === "near-ai" ? "near-ai" : "mock", fx: fxOf(data.fx) }
}

/** The server's conversion, checked (an older server sends none; anything malformed reads as "no rate"). */
export function fxOf(v: unknown): ReceiptFx | null {
  if (!v || typeof v !== "object") return null
  const f = v as Partial<Record<keyof ReceiptFx | "amountCents" | "usdCents" | "rate" | "rateDate" | "source" | "why", unknown>>
  if (typeof f.from !== "string") return null
  if (f.ok === true) {
    const ok =
      Number.isInteger(f.amountCents) && Number.isInteger(f.usdCents) && (f.usdCents as number) > 0 &&
      typeof f.rate === "number" && f.rate > 0 && typeof f.rateDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.rateDate) &&
      (f.source === "ecb" || f.source === "er" || f.source === "sample")
    return ok ? (v as ReceiptFx) : { ok: false, from: f.from, why: "unavailable" }
  }
  return { ok: false, from: f.from, why: f.why === "unsupported" ? "unsupported" : "unavailable" }
}

/**
 * Read one receipt photo. Resolves with the reading (which may be `readable: false`); rejects with a
 * ReceiptReadError, or an AbortError when the person cancelled.
 */
export async function readReceiptPhoto(slug: string, file: File, signal?: AbortSignal): Promise<ReceiptReadRes> {
  try {
    return IS_LIVE ? await readLive(slug, file, signal) : await readMock(file, signal)
  } catch (e) {
    if (e instanceof ReceiptImageError) throw new ReceiptReadError(e.kind)
    throw e
  }
}

interface HealthFeatures {
  features?: { receipts?: boolean }
}

function useLiveReceiptsEnabled(): boolean {
  const q = useQuery({
    queryKey: ["health", "features"] as const,
    queryFn: async () => {
      const res = await fetch("/api/health", { headers: { accept: "application/json" } })
      if (!res.ok) throw new Error(`health ${res.status}`)
      return (await res.json()) as HealthFeatures
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  return q.data?.features?.receipts === true
}

const useMockReceiptsEnabled = () => true

/** Show "Snap the receipt"? Mock: always. Testnet: only when the server can read receipts. */
export const useReceiptsEnabled: () => boolean = IS_LIVE ? useLiveReceiptsEnabled : useMockReceiptsEnabled
