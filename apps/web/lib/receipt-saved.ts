// Saved receipt details (isomorphic: the Spend sheet, the mock world, the server route and the details sheet).
// When a spend is sent after "Scan receipt", what the person confirmed from the reading (merchant, day, items, tax,
// tip, total, the original currency and the rate if it was converted, where it was read and when) is saved with the
// spend, never the photo (D-61). To make an edit later visible to anyone, the spend itself carries a fingerprint of
// those details: the first 16 hex chars of SHA-256 over their canonical JSON ride in the request's request_ref
// (`@pot/sdk` spendRef: OpKey + 16 hex = 32, the hub's own limit), so the hub keeps them on the request, in the group
// approval's description and in the spend_requested event. The server refuses a save whose fingerprint differs from
// the one the request carries, and the details sheet recomputes it from what it is shown.
// Canonical JSON: keys sorted at every level, no whitespace, money as integer cents, the rate as its decimal string,
// absent values as null (never omitted). A random `nonce` is part of it so the public fingerprint can't be used to
// confirm a guess of what was bought.
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { z } from "zod"
import {
  RECEIPT_MAX_CENTS,
  RECEIPT_MAX_ITEMS,
  cleanLine,
  convertCents,
  formatRate,
  normalizeDate,
  type ReceiptFx,
  type ReceiptItem,
  type ReceiptProof,
  type ReceiptRateSource,
  type ReceiptRead,
  type ReceiptReadRes,
} from "./receipt"

export const SAVED_RECEIPT_VERSION = 1
/** Hex chars of the fingerprint the spend carries (= @pot/sdk RECEIPT_FP_HEX). */
export const FINGERPRINT_HEX = 16
/** NEAR AI Cloud's public Verification Center (server/features/receipts/nearai.ts NEAR_AI_VERIFY_URL). */
export const RECEIPT_VERIFY_URL = "https://cloud.near.ai/verify"
/** The canonical JSON's cap (30 items of 60 characters + a proof link fit in well under half). */
export const SAVED_RECEIPT_MAX_BYTES = 16_384
/** The proof link's cap (the model + this reply's receipt in the #fragment). */
export const PROOF_URL_MAX = 4_096
const MERCHANT_MAX = 48
const ITEM_NAME_MAX = 60
/** A reading saved later than this after it was made is refused (the sheet is reset on every opening anyway). */
export const READ_AT_MAX_AGE_MS = 30 * 86_400_000
const READ_AT_SKEW_MS = 5 * 60_000

export interface SavedReceiptFx {
  /** ISO 4217 of the receipt (= `currency`) */
  from: string
  /** the printed total (= `totalCents`) */
  amountCents: number
  usdCents: number
  /** dollars per 1 unit, as used and shown ("1.0852") */
  rate: string
  rateDate: string
  source: ReceiptRateSource
}

export interface SavedReceiptProof {
  verifyUrl: string
  /** the link also checks this reading (its #receipt fragment), not only where it was read */
  reply: boolean
  model: string
}

export interface SavedReceipt {
  v: 1
  /** 32 hex chars, random per receipt */
  nonce: string
  merchant: string | null
  /** YYYY-MM-DD as printed */
  date: string | null
  /** ISO 4217 as printed; null when the receipt didn't say */
  currency: string | null
  totalCents: number
  taxCents: number | null
  tipCents: number | null
  items: ReceiptItem[]
  /** the conversion to dollars, when the receipt was in another currency and a rate was used */
  fx: SavedReceiptFx | null
  proof: SavedReceiptProof | null
  source: ReceiptReadRes["source"]
  /** ISO time of the reading (ms precision) */
  readAt: string
}

/** GET /api/pots/[pot]/requests/[id]/receipt → 200 body (besides ok/requestId). */
export interface SpendReceiptRes {
  pot: string
  hubRequestId: number
  receipt: SavedReceipt
  /** the full SHA-256 (hex) the server computed when it saved it */
  fingerprint: string
  savedAt: string
}

// ------------------------------------------------------------------------------------------------ schema

const cents = z.number().int().min(0).max(RECEIPT_MAX_CENTS)
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const code = z.string().regex(/^[A-Z]{3}$/)

/** Strict wire shape (no extra keys anywhere); the meaning is checked by `validateSavedReceipt`. */
export const savedReceiptSchema = z.strictObject({
  v: z.literal(SAVED_RECEIPT_VERSION),
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  merchant: z.string().min(1).max(MERCHANT_MAX * 4).nullable(),
  date: isoDay.nullable(),
  currency: code.nullable(),
  totalCents: cents.min(1),
  taxCents: cents.nullable(),
  tipCents: cents.nullable(),
  items: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(ITEM_NAME_MAX * 4),
        qty: z.number().positive().lt(1000).nullable(),
        amountCents: cents.nullable(),
      }),
    )
    .max(RECEIPT_MAX_ITEMS),
  fx: z
    .strictObject({
      from: code,
      amountCents: cents.min(1),
      usdCents: cents.min(1),
      rate: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,12})?$/),
      rateDate: isoDay,
      source: z.enum(["ecb", "er", "sample"]),
    })
    .nullable(),
  proof: z
    .strictObject({
      verifyUrl: z.string().min(1).max(PROOF_URL_MAX),
      reply: z.boolean(),
      model: z.string().regex(/^[A-Za-z0-9._:/-]{1,100}$/),
    })
    .nullable(),
  source: z.enum(["near-ai", "mock"]),
  readAt: z.string().min(20).max(30),
})

export type SavedReceiptCheck = { ok: true; value: SavedReceipt } | { ok: false; field: string; why: string }

const bad = (field: string, why: string): SavedReceiptCheck => ({ ok: false, field, why })

/** The proof link's model and what follows it: `?model=<m>` and, for a reply proof, `#receipt=<base64url>`. */
function proofOk(p: SavedReceiptProof): boolean {
  const base = `${RECEIPT_VERIFY_URL}?model=${encodeURIComponent(p.model)}`
  if (!p.verifyUrl.startsWith(base)) return false
  const rest = p.verifyUrl.slice(base.length)
  return p.reply ? /^#receipt=[A-Za-z0-9_-]{1,4000}$/.test(rest) : rest === ""
}

/**
 * Untrusted JSON → a saved receipt, or why not. Everything the reading's normalization guarantees is checked again
 * (cleaned strings, real days, the conversion's arithmetic), so a stored receipt always looks like one the Spend
 * sheet could have sent, and its canonical form is stable.
 */
export function validateSavedReceipt(raw: unknown, now = Date.now()): SavedReceiptCheck {
  const p = savedReceiptSchema.safeParse(raw)
  if (!p.success) {
    const issue = p.error.issues[0]
    return bad(issue?.path.join(".") || "receipt", issue?.code ?? "invalid")
  }
  const r = p.data as SavedReceipt
  if (r.merchant !== null && cleanLine(r.merchant, MERCHANT_MAX) !== r.merchant) return bad("merchant", "not_clean")
  for (const [i, it] of r.items.entries()) {
    if (cleanLine(it.name, ITEM_NAME_MAX) !== it.name) return bad(`items.${i}.name`, "not_clean")
    if (it.qty !== null && Number(it.qty.toFixed(3)) !== it.qty) return bad(`items.${i}.qty`, "precision")
  }
  if (r.date !== null && normalizeDate(r.date, now) !== r.date) return bad("date", "not_a_day")
  if (r.currency === "USD" && r.fx !== null) return bad("fx", "dollars")
  if (r.fx) {
    const fx = r.fx
    if (fx.from !== r.currency) return bad("fx.from", "currency")
    if (fx.amountCents !== r.totalCents) return bad("fx.amountCents", "total")
    const rate = Number(fx.rate)
    if (!(rate > 0) || formatRate(rate) !== fx.rate) return bad("fx.rate", "format")
    if (convertCents(fx.amountCents, rate) !== fx.usdCents) return bad("fx.usdCents", "arithmetic")
    if (normalizeDate(fx.rateDate, now) !== fx.rateDate) return bad("fx.rateDate", "not_a_day")
  }
  if (r.proof && !proofOk(r.proof)) return bad("proof.verifyUrl", "link")
  const at = Date.parse(r.readAt)
  if (!Number.isFinite(at) || new Date(at).toISOString() !== r.readAt) return bad("readAt", "format")
  if (at > now + READ_AT_SKEW_MS || at < now - READ_AT_MAX_AGE_MS) return bad("readAt", "range")
  if (new TextEncoder().encode(canonicalJson(r)).byteLength > SAVED_RECEIPT_MAX_BYTES) return bad("receipt", "too_large")
  return { ok: true, value: r }
}

// ------------------------------------------------------------------------------------------------ canonical form

/** JSON with every object's keys sorted, no whitespace; `undefined` is never written (use null). */
export function canonicalJson(v: unknown): string {
  if (v === null) return "null"
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`
  switch (typeof v) {
    case "number":
      if (!Number.isFinite(v)) throw new RangeError("canonicalJson: not a finite number")
      return JSON.stringify(v)
    case "string":
    case "boolean":
      return JSON.stringify(v)
    case "object": {
      const o = v as Record<string, unknown>
      return `{${Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
        .join(",")}}`
    }
    default:
      throw new TypeError(`canonicalJson: ${typeof v}`)
  }
}

/** SHA-256 (hex, 64 chars) of the receipt's canonical JSON (UTF-8). */
export function receiptFingerprint(r: SavedReceipt): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(r))))
}

/** The part the spend carries: the first 16 hex chars. */
export const shortFingerprint = (full: string): string => full.slice(0, FINGERPRINT_HEX)

export type FingerprintStatus = "match" | "mismatch" | "missing"

/** The saved details against the fingerprint the spend carries: equal, different, or the spend carries none. */
export function fingerprintStatus(r: SavedReceipt, onRequest: string | null | undefined): FingerprintStatus {
  if (!onRequest) return "missing"
  return shortFingerprint(receiptFingerprint(r)) === onRequest ? "match" : "mismatch"
}

// ------------------------------------------------------------------------------------------------ from a reading

/** 128 random bits as hex (the receipt's nonce). */
export function newReceiptNonce(): string {
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  return bytesToHex(b)
}

/** The model a proof link names (`?model=`), or null. */
export function modelOfVerifyUrl(url: string): string | null {
  try {
    const m = new URL(url).searchParams.get("model")
    return m && /^[A-Za-z0-9._:/-]{1,100}$/.test(m) ? m : null
  } catch {
    return null
  }
}

/**
 * What the Spend sheet saves from a reading the person kept: the reading as it was confirmed (never the photo), the
 * conversion it used (only one that matches the receipt's currency), the proof link and when it was read.
 */
export function savedReceiptOf(
  reading: { result: ReceiptRead; fx: ReceiptFx | null; proof: ReceiptProof | null; source: ReceiptReadRes["source"] },
  opts: { nonce: string; readAt: number },
): SavedReceipt | null {
  const r = reading.result
  if (r.totalCents === null || r.totalCents <= 0) return null
  const fx = reading.fx?.ok && reading.fx.from === r.currency && r.currency !== "USD" ? reading.fx : null
  const model = reading.proof ? modelOfVerifyUrl(reading.proof.verifyUrl) : null
  return {
    v: SAVED_RECEIPT_VERSION,
    nonce: opts.nonce,
    merchant: r.merchant,
    date: r.date,
    currency: r.currency,
    totalCents: r.totalCents,
    taxCents: r.taxCents,
    tipCents: r.tipCents,
    items: r.items.map((it) => ({ name: it.name, qty: it.qty, amountCents: it.amountCents })),
    fx: fx
      ? { from: fx.from, amountCents: fx.amountCents, usdCents: fx.usdCents, rate: formatRate(fx.rate), rateDate: fx.rateDate, source: fx.source }
      : null,
    proof: reading.proof && model ? { verifyUrl: reading.proof.verifyUrl, reply: reading.proof.reply, model } : null,
    source: reading.source,
    readAt: new Date(opts.readAt).toISOString(),
  }
}
