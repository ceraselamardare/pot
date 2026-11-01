// The real 1Click API (kb/intents-1click.md; api-spec §2.7). Anonymous by default (no JWT needed for tokens,
// dry quotes and status); `ONECLICK_API_KEY` is optional and, on a 401, is dropped for one retry. HTTP 201 is
// success for POST /v0/quote. Quotes are verified against 1Click's signing key before use (the SDK's
// `verifyQuoteSignature`, re-implemented with @noble so no extra dependency ships). Shield status is an
// undocumented public JSON, cached 60 s and failing open.
//
// On testnet only DRY quotes are ever sent (read-only, mainnet API): the simulator borrows their numbers.
import "server-only"
import { sha256 } from "@noble/hashes/sha2.js"
import { base58 } from "@scure/base"
import { ApiError } from "../../http/errors"
import { ed25519Verify } from "../../util/crypto"
import {
  DEADLINE_MS,
  NEAR_USDC_ASSET,
  ONECLICK_MANAGER_PK,
  ONECLICK_URL,
  ORIGIN_ASSET,
  SHIELD_SCOPE,
  SHIELD_STATUS_URL,
  SLIPPAGE_BPS,
  type XcChain,
} from "./assets"

export type Fetch = typeof fetch

export interface QuoteRequestBody {
  dry: boolean
  swapType: "FLEX_INPUT"
  slippageTolerance: number
  originAsset: string
  depositType: "ORIGIN_CHAIN"
  destinationAsset: string
  amount: string
  recipient: string
  recipientType: "DESTINATION_CHAIN"
  refundTo: string
  refundType: "INTENTS"
  deadline: string
  referral: "pot"
}

export interface OneClickQuote {
  amountIn: string
  amountInFormatted?: string
  amountInUsd?: string
  minAmountIn: string
  amountOut: string
  amountOutFormatted?: string
  amountOutUsd?: string
  minAmountOut: string
  timeEstimate?: number
  refundFee?: string
  withdrawFee?: string
  depositAddress?: string
  depositMemo?: string
  deadline?: string
  timeWhenInactive?: string
}

export interface QuoteResponse {
  correlationId?: string
  timestamp: string
  signature: string
  quoteRequest: Record<string, unknown>
  quote: OneClickQuote
}

export interface StatusResponse {
  correlationId?: string
  status: string
  updatedAt?: string
  swapDetails?: {
    depositedAmount?: string | null
    amountIn?: string | null
    amountOut?: string | null
    refundedAmount?: string | null
    refundReason?: string | null
    destinationChainTxHashes?: { hash: string; explorerUrl?: string }[]
  }
}

/** The kb's recommended body (snippet 1): FLEX_INPUT 100 bps, INTENTS refunds to the member, 2 h deadline. */
export function quoteBody(chain: XcChain, recipient: string, amount: bigint, dry: boolean, nowMs = Date.now()): QuoteRequestBody {
  return {
    dry,
    swapType: "FLEX_INPUT",
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: ORIGIN_ASSET[chain],
    depositType: "ORIGIN_CHAIN",
    destinationAsset: NEAR_USDC_ASSET,
    amount: amount.toString(),
    recipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo: recipient,
    refundType: "INTENTS",
    deadline: new Date(nowMs + DEADLINE_MS).toISOString(),
    referral: "pot",
  }
}

// ---- quote signature (SDK 0.1.26 `verifyQuoteSignature`) ----

/** json-stable-stringify: sorted keys, `undefined` members dropped, JSON.stringify for scalars. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null"
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableStringify(x))).join(",")}]`
  const o = v as Record<string, unknown>
  const parts: string[] = []
  for (const k of Object.keys(o).sort()) {
    if (o[k] === undefined) continue
    parts.push(`${JSON.stringify(k)}:${stableStringify(o[k])}`)
  }
  return `{${parts.join(",")}}`
}

const orUndef = <T>(v: T | null | undefined | "" | 0): T | undefined => (v ? (v as T) : undefined)

/** The string 1Click signs: base58(sha256(stable({signed request fields} ∪ {signed quote fields} ∪ {timestamp}))). */
export function quoteHash(r: QuoteResponse): string {
  const q = r.quoteRequest
  const req = {
    dry: q.dry,
    swapType: q.swapType,
    slippageTolerance: q.slippageTolerance,
    originAsset: q.originAsset,
    depositType: q.depositType,
    destinationAsset: q.destinationAsset,
    amount: q.amount,
    refundTo: q.refundTo,
    refundType: q.refundType,
    recipient: q.recipient,
    recipientType: q.recipientType,
    deadline: q.deadline,
    quoteWaitingTimeMs: orUndef(q.quoteWaitingTimeMs as number),
    referral: orUndef(q.referral as string),
    virtualChainRecipient: orUndef(q.virtualChainRecipient as string),
    virtualChainRefundRecipient: orUndef(q.virtualChainRefundRecipient as string),
    customRecipientMsg: orUndef(q.customRecipientMsg as string),
  }
  const x = r.quote
  const quote = q.dry
    ? {
        amountIn: x.amountIn,
        amountInFormatted: x.amountInFormatted,
        amountInUsd: x.amountInUsd,
        minAmountIn: x.minAmountIn,
        amountOut: x.amountOut,
        amountOutFormatted: x.amountOutFormatted,
        amountOutUsd: x.amountOutUsd,
        minAmountOut: x.minAmountOut,
      }
    : {
        amountIn: x.amountIn,
        amountInFormatted: x.amountInFormatted,
        amountInUsd: x.amountInUsd,
        minAmountIn: x.minAmountIn,
        amountOut: x.amountOut,
        amountOutFormatted: x.amountOutFormatted,
        amountOutUsd: x.amountOutUsd,
        minAmountOut: x.minAmountOut,
        depositAddress: orUndef(x.depositAddress),
        depositMemo: orUndef(x.depositMemo),
        deadline: orUndef(x.deadline),
        timeWhenInactive: orUndef(x.timeWhenInactive),
        timeEstimate: orUndef(x.timeEstimate),
        refundFee: orUndef(x.refundFee),
        withdrawFee: orUndef(x.withdrawFee),
      }
  const data = stableStringify({ ...req, ...quote, timestamp: r.timestamp })
  return base58.encode(sha256(new TextEncoder().encode(data)))
}

export function verifyQuoteSignature(r: QuoteResponse, managerPk = ONECLICK_MANAGER_PK): boolean {
  try {
    const sig = base58.decode(r.signature.replace(/^ed25519:/, ""))
    const pk = base58.decode(managerPk.replace(/^ed25519:/, ""))
    return ed25519Verify(sig, new TextEncoder().encode(quoteHash(r)), pk)
  } catch {
    return false
  }
}

// ---- HTTP ----

export interface OneClickClient {
  quote(body: QuoteRequestBody): Promise<QuoteResponse>
  status(depositAddress: string): Promise<StatusResponse | null>
  pausedChains(): Promise<Set<XcChain>>
}

const UA = "pot-app/1 (+https://github.com/pot)"

export function createOneClick(opts: { fetch?: Fetch; apiKey?: string; timeoutMs?: number; now?: () => number } = {}): OneClickClient {
  const f = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? 8_000
  let shield: { at: number; paused: Set<XcChain> } | null = null

  async function call(path: string, init: RequestInit, withKey = !!opts.apiKey): Promise<Response> {
    const headers: Record<string, string> = { accept: "application/json", "user-agent": UA }
    if (init.body) headers["content-type"] = "application/json"
    if (withKey && opts.apiKey) headers["x-api-key"] = opts.apiKey
    const res = await f(`${ONECLICK_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) })
    // a bad or expired key breaks everything (401); retry once anonymously (kb gotcha)
    if (res.status === 401 && withKey) return call(path, init, false)
    return res
  }

  return {
    async quote(body) {
      let res: Response
      try {
        res = await call("/v0/quote", { method: "POST", body: JSON.stringify(body) })
      } catch {
        throw new ApiError("quote_failed", { detail: { cause: "network" } })
      }
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.status !== 201 && res.status !== 200) {
        const message = String(json.message ?? "")
        if (/not available|paused/i.test(message)) throw new ApiError("chain_paused")
        const min = message.match(/try at least ([0-9.]+)/i)
        if (min?.[1]) {
          const minimum = BigInt(Math.ceil(Number(min[1]) * 1e6))
          throw new ApiError("amount_too_low", { detail: { minimum: minimum.toString() } })
        }
        throw new ApiError("quote_failed", { detail: { status: res.status, correlationId: json.correlationId ?? null } })
      }
      const r = json as unknown as QuoteResponse
      if (!r.quote || !verifyQuoteSignature(r))
        throw new ApiError("quote_failed", { detail: { cause: "signature", correlationId: r.correlationId ?? null } })
      return r
    },
    async status(depositAddress) {
      const res = await call(`/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, { method: "GET" })
      if (res.status === 404) return null
      if (!res.ok) throw new ApiError("service_unavailable", { detail: { cause: "oneclick", status: res.status }, retryAfterMs: 5_000 })
      return (await res.json()) as StatusResponse
    },
    async pausedChains() {
      const now = opts.now?.() ?? Date.now()
      if (shield && now - shield.at < 60_000) return shield.paused
      const paused = new Set<XcChain>()
      try {
        const res = await f(SHIELD_STATUS_URL, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(3_000) })
        const j = (await res.json()) as { activeIncidents?: { scopeType?: string; scopeValue?: string; status?: string }[] }
        for (const i of j.activeIncidents ?? []) {
          if (i.scopeType !== "chain" || (i.status && i.status !== "active")) continue
          for (const [chain, scope] of Object.entries(SHIELD_SCOPE)) if (scope === i.scopeValue) paused.add(chain as XcChain)
        }
      } catch {
        /* undocumented endpoint: fail open (kb snippet 3) */
      }
      shield = { at: now, paused }
      return paused
    },
  }
}
