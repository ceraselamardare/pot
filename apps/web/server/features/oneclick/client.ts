// The real 1Click API (kb/intents-1click.md; api-spec §2.7). Anonymous by default (no JWT needed for tokens,
// dry quotes and status); `ONECLICK_API_KEY` is optional and, on a 401, is dropped for one retry. HTTP 201 is
// success for POST /v0/quote. Quotes are verified against 1Click's signing key before use (the SDK's
// `verifyQuoteSignature`, re-implemented with @noble so no extra dependency ships). Shield status is an
// undocumented public JSON, cached 60 s and failing open.
//
// On testnet only DRY quotes are ever sent (read-only, mainnet API): the simulator borrows their numbers.
// Any coin (2026-11-04): stablecoins are quoted FLEX_INPUT 100 bps for the dollar amount (unchanged); other coins get
// a dry EXACT_OUTPUT probe ("how much ETH makes $20 arrive": its minAmountIn), rounded up to 4 significant digits,
// then the real FLEX_INPUT quote at 300 bps for that amount (kb "Any coin": why not EXACT_OUTPUT itself).
import "server-only"
import { sha256 } from "@noble/hashes/sha2.js"
import { base58 } from "@scure/base"
import { ApiError } from "../../http/errors"
import { ed25519Verify } from "../../util/crypto"
import { DEADLINE_MS, NEAR_USDC_ASSET, ONECLICK_MANAGER_PK, ONECLICK_URL, SHIELD_STATUS_URL } from "./assets"
import { assetOf, defaultCoin, slippageFor, XC_CHAINS, XC_CONFIG, type XcAsset, type XcChain, type XcCoin } from "./origins"

export type Fetch = typeof fetch

export interface QuoteRequestBody {
  dry: boolean
  /** FLEX_INPUT for every quote that gets an address; EXACT_OUTPUT only for the dry coin-amount probe */
  swapType: "FLEX_INPUT" | "EXACT_OUTPUT"
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

function mustAsset(chain: XcChain, coin: XcCoin): XcAsset {
  const a = assetOf(chain, coin)
  if (!a) throw new ApiError("bad_request", { detail: { field: "coin" } })
  return a
}

/**
 * The kb's recommended body (snippet 1): FLEX_INPUT, INTENTS refunds to the member, 2 h deadline, referral `pot`.
 * `amount` is in the origin coin's base units; the tolerance is 100 bps for stablecoins, 300 bps for other coins.
 */
export function quoteBody(chain: XcChain, recipient: string, amount: bigint, dry: boolean, nowMs = Date.now(), coin: XcCoin = defaultCoin(chain)): QuoteRequestBody {
  const asset = mustAsset(chain, coin)
  return {
    dry,
    swapType: "FLEX_INPUT",
    slippageTolerance: slippageFor(asset),
    originAsset: asset.assetId,
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

/**
 * The dry probe for a coin that isn't a stablecoin: EXACT_OUTPUT for `usd` (USD micro of NEAR USDC). Its
 * `minAmountIn` is the coin amount that makes `usd` arrive (measured 2026-11-04: a FLEX quote for that amount gives
 * 19.9998-19.99999 of 20.00 on 14 coins); it is never sent with dry: false.
 */
export function probeBody(chain: XcChain, coin: XcCoin, recipient: string, usd: bigint, nowMs = Date.now()): QuoteRequestBody {
  return { ...quoteBody(chain, recipient, usd, true, nowMs, coin), swapType: "EXACT_OUTPUT", slippageTolerance: 100, amount: usd.toString() }
}

/** The asset a body's originAsset names (for decimals in error messages). */
export function assetById(assetId: string): XcAsset | null {
  for (const c of XC_CHAINS) for (const a of XC_CONFIG[c].assets) if (a.assetId === assetId) return a
  return null
}

/**
 * The minimum in a 1Click "Amount is too low for bridge, try at least N" message, in origin base units. N comes both
 * formatted ("0.300001" USDC, 2026-10-21) and in base units ("6400" sats, "2000000" drops, 2026-11-04): a decimal
 * point means formatted; a whole number of 1,000 or more means base units (no curated coin has a formatted minimum
 * that large); a small whole number is formatted.
 */
export function parseTryAtLeast(n: string, decimals: number): bigint {
  const [w = "0", f = ""] = n.split(".")
  if (n.includes(".") || BigInt(w) < 1000n) return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")
  return BigInt(w)
}

/** "Temporary swap limits: minimum swap amount is $1,000" → 1000 USD in micro. */
export function parseSwapLimit(message: string): bigint | null {
  const m = message.match(/minimum swap amount is \$([0-9][0-9,]*(?:\.[0-9]+)?)/i)
  if (!m?.[1]) return null
  const [w = "0", f = ""] = m[1].replace(/,/g, "").split(".")
  return BigInt(w) * 1_000_000n + BigInt((f + "000000").slice(0, 6))
}

/** One row of GET /v0/tokens. */
export interface TokenInfo {
  assetId: string
  decimals: number
  blockchain: string
  symbol: string
  price?: number
  priceUpdatedAt?: string
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

export interface QuoteOptions {
  /**
   * Accept a DRY quote whose signature doesn't verify (its numbers only feed the testnet simulator's preview; nothing
   * is ever sent to it). Bitcoin quotes fail verification with SDK 0.1.26's own verifyQuoteSignature too (2026-11-04,
   * 4/4 swap types; every other curated coin verifies), so without this the demo would fall back to offline prices.
   * Never for a quote with an address, never in real mode.
   */
  unverifiedDryOk?: boolean
}

export interface OneClickClient {
  quote(body: QuoteRequestBody, opts?: QuoteOptions): Promise<QuoteResponse & { unverified?: true }>
  status(depositAddress: string): Promise<StatusResponse | null>
  pausedChains(): Promise<Set<XcChain>>
  /** GET /v0/tokens, cached 1 h (ToS §4.1(e): no API data kept > 24 h); null when it can't be read (fail open) */
  tokens?(): Promise<TokenInfo[] | null>
}

/** Shield incidents → paused chains: the chain's own scope, a `hot` incident for HOT-bridge chains, `*` for all. */
export function pausedFromShield(incidents: { scopeType?: string; scopeValue?: string; status?: string }[]): Set<XcChain> {
  const paused = new Set<XcChain>()
  for (const i of incidents) {
    if (i.status && i.status !== "active") continue
    for (const id of XC_CHAINS) {
      const c = XC_CONFIG[id]
      if (i.scopeType === "chain" && (i.scopeValue === c.shield || i.scopeValue === "*")) paused.add(id)
      if (c.bridge && i.scopeValue === c.bridge) paused.add(id)
    }
  }
  return paused
}

const UA = "pot-app/1 (+https://github.com/pot)"

export function createOneClick(opts: { fetch?: Fetch; apiKey?: string; timeoutMs?: number; now?: () => number } = {}): OneClickClient {
  const f = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? 8_000
  let shield: { at: number; paused: Set<XcChain> } | null = null
  let catalogue: { at: number; tokens: TokenInfo[] | null } | null = null

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
    async quote(body, qopts = {}) {
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
        // Stellar-like origins that need MEMO deposits (not offered; kept as "unavailable" if one ever is)
        if (/depositMode/i.test(message)) throw new ApiError("chain_paused", { detail: { why: "unsupported" } })
        const limitUsd = parseSwapLimit(message)
        if (limitUsd !== null) throw new ApiError("amount_too_low", { detail: { minUsd: limitUsd.toString(), why: "swap_limit" } })
        const min = message.match(/try at least ([0-9.]+)/i)
        if (min?.[1]) {
          const decimals = assetById(body.originAsset)?.decimals ?? 6
          throw new ApiError("amount_too_low", { detail: { minimum: parseTryAtLeast(min[1], decimals).toString() } })
        }
        throw new ApiError("quote_failed", { detail: { status: res.status, correlationId: json.correlationId ?? null } })
      }
      const r = json as unknown as QuoteResponse
      if (!r.quote) throw new ApiError("quote_failed", { detail: { cause: "no_quote", correlationId: r.correlationId ?? null } })
      if (!verifyQuoteSignature(r)) {
        if (qopts.unverifiedDryOk && body.dry && r.quoteRequest?.dry === true) return { ...r, unverified: true as const }
        throw new ApiError("quote_failed", { detail: { cause: "signature", correlationId: r.correlationId ?? null } })
      }
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
        for (const c of pausedFromShield(j.activeIncidents ?? [])) paused.add(c)
      } catch {
        /* undocumented endpoint: fail open (kb snippet 3) */
      }
      shield = { at: now, paused }
      return paused
    },
    async tokens() {
      const now = opts.now?.() ?? Date.now()
      if (catalogue && now - catalogue.at < (catalogue.tokens ? 3600_000 : 60_000)) return catalogue.tokens
      let tokens: TokenInfo[] | null = null
      try {
        const res = await call("/v0/tokens", { method: "GET" })
        const j = res.ok ? ((await res.json()) as unknown) : null
        tokens = Array.isArray(j) ? (j as TokenInfo[]) : null
      } catch {
        tokens = null
      }
      catalogue = { at: now, tokens }
      return tokens
    },
  }
}
