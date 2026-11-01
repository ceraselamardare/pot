// Dependency-free NEAR JSON-RPC read client (frontend-architecture §3.1, D-32, test U-01).
//  - endpoints: FastNEAR first, dRPC as failover; the constructor THROWS on the deprecated
//    near.org RPC and on lava.build (+3 s per call / 429 / 410, kb/backend-infra.md).
//  - failover on: network error (incl. a CORS-less 429 surfacing as TypeError), timeout, HTTP
//    408/429/5xx, a JSON-RPC body with code -429 (FastNEAR sends it as HTTP 200 sometimes), and
//    node-side errors (INTERNAL_ERROR, TIMEOUT_ERROR, UNKNOWN_BLOCK, NO_SYNCED_BLOCKS…).
//  - NOT failover: UNKNOWN_ACCOUNT, NO_CONTRACT_CODE, unknown access keys, MethodResolveError,
//    contract panics → RpcViewError (typed, with the hub's ERR_ code when there is one).
//  - stickiness: after a failover, stay on the backup for `stickyMs` (60 s), then probe primary.
//  - budget: a token bucket (default 100 requests/min, burst 10) per client; excess calls QUEUE
//    (FIFO), nothing is dropped.
//  - parsing: res.text() → JSON.parse; on failure, escape raw control characters and retry
//    (Sputnik panics carry newlines, sputnik-dao.md gotcha 11).

import { utf8Decode, utf8Encode, base64Encode } from "../encoding.ts"
import { errorCodeFromText, stripControlChars, type ErrorCode } from "../types/errors.ts"
import type { Viewed } from "../types/ids.ts"

export type Finality = "final" | "optimistic"

/** Hostnames that must never be used (D-32). Matched as a suffix. */
const BANNED_HOST_SUFFIXES = [/(^|\.)near\.org$/i, /(^|\.)lava\.build$/i]

export class BannedRpcUrlError extends Error {
  constructor(url: string) {
    super(`RPC URL ${url} is banned (D-32: deprecated / rate-limited). Use FastNEAR with a dRPC failover.`)
    this.name = "BannedRpcUrlError"
  }
}

export function assertAllowedRpcUrl(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`invalid RPC URL ${url}`)
  }
  if (BANNED_HOST_SUFFIXES.some((re) => re.test(host))) throw new BannedRpcUrlError(url)
}

/** A transport-level failure of one endpoint (eligible for failover). */
export class RpcTransportError extends Error {
  url: string
  kind: "network" | "timeout" | "http" | "rate_limited" | "node" | "parse"
  status?: number
  constructor(url: string, kind: RpcTransportError["kind"], message: string, status?: number) {
    super(`${kind} from ${url}: ${message}`)
    this.name = "RpcTransportError"
    this.url = url
    this.kind = kind
    this.status = status
  }
}

/** Every endpoint failed: carries each attempt's error. */
export class RpcUnavailableError extends Error {
  attempts: RpcTransportError[]
  constructor(attempts: RpcTransportError[]) {
    super(`all RPC endpoints failed: ${attempts.map((a) => a.message).join(" | ")}`)
    this.name = "RpcUnavailableError"
    this.attempts = attempts
  }
}

export type RpcViewErrorCode =
  | "UNKNOWN_ACCOUNT"
  | "NO_CONTRACT_CODE"
  | "UNKNOWN_ACCESS_KEY"
  | "METHOD_NOT_FOUND"
  | "CONTRACT_PANIC"
  | "CONTRACT_ERROR"
  | "INVALID_REQUEST"
  | "HANDLER_ERROR"

/** A deterministic answer from the node (no failover): unknown account, contract panic, … */
export class RpcViewError extends Error {
  code: RpcViewErrorCode
  /** The ERR_* (or synthetic) code found in a panic, e.g. "ERR_POT_NOT_FOUND". */
  errorCode?: ErrorCode
  blockHeight?: number
  raw?: unknown
  constructor(code: RpcViewErrorCode, message: string, extra: { errorCode?: ErrorCode; blockHeight?: number; raw?: unknown } = {}) {
    super(message)
    this.name = "RpcViewError"
    this.code = code
    this.errorCode = extra.errorCode
    this.blockHeight = extra.blockHeight
    this.raw = extra.raw
  }
}

export interface RpcBudget {
  perMinute: number
  burst: number
}

export interface RpcClientOptions {
  urls: readonly string[]
  /** per attempt (default 4000 ms) */
  timeoutMs?: number
  /** how long to stay on a backup after a failover (default 60 000 ms) */
  stickyMs?: number
  /** token bucket; `false` disables it (server use with a key). Default 100/min, burst 10. */
  budget?: RpcBudget | false
  /** extra headers per URL, e.g. `Authorization: Bearer FASTNEAR_API_KEY` on the FastNEAR URL only */
  headers?: Record<string, string> | ((url: string) => Record<string, string> | undefined)
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** called on every failover (observability) */
  onFailover?: (from: string, to: string | null, error: RpcTransportError) => void
}

export interface RpcStats {
  requests: number
  failovers: number
  activeUrl: string
  queued: number
}

export interface RpcClient {
  /** Raw JSON-RPC call with failover; resolves to `result`. */
  call<T = unknown>(method: string, params: unknown): Promise<T>
  /** call_function view → parsed JSON + block height. */
  viewFunction<T = unknown>(accountId: string, methodName: string, args?: Record<string, unknown>, opts?: { finality?: Finality }): Promise<Viewed<T>>
  /** view_access_key → null when the key doesn't exist. Default finality: optimistic (signing). */
  viewAccessKey(accountId: string, publicKey: string, opts?: { finality?: Finality }): Promise<Viewed<{ nonce: bigint; permission: "FullAccess" | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } } } | null>>
  /** Latest block header essentials. */
  head(finality?: Finality): Promise<{ height: number; hash: string; timestampNs: bigint }>
  readonly urls: readonly string[]
  stats(): RpcStats
}

/** Escapes raw control characters inside a JSON text so JSON.parse can read it. */
export function sanitizeJsonText(text: string): string {
  // eslint-disable-next-line no-control-regex -- matching raw control characters is the point
  return text.replace(/[\u0000-\u001f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
}

export function parseJsonLenient<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return JSON.parse(sanitizeJsonText(text)) as T
  }
}

class TokenBucket {
  private tokens: number
  private last: number
  private chain: Promise<void> = Promise.resolve()
  queued = 0
  private readonly budget: RpcBudget
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(budget: RpcBudget, now: () => number, sleep: (ms: number) => Promise<void>) {
    this.budget = budget
    this.now = now
    this.sleep = sleep
    this.tokens = budget.burst
    this.last = now()
  }

  private refill(): void {
    const t = this.now()
    const rate = this.budget.perMinute / 60_000
    this.tokens = Math.min(this.budget.burst, this.tokens + (t - this.last) * rate)
    this.last = t
  }

  /** Resolves when a token is available; callers are served FIFO. */
  acquire(): Promise<void> {
    this.queued++
    const run = async (): Promise<void> => {
      this.refill()
      while (this.tokens < 1) {
        const rate = this.budget.perMinute / 60_000
        await this.sleep(Math.ceil((1 - this.tokens) / rate))
        this.refill()
      }
      this.tokens -= 1
      this.queued--
    }
    const p = this.chain.then(run)
    this.chain = p.catch(() => undefined)
    return p
  }
}

const NODE_ERRORS_FAILOVER = new Set(["INTERNAL_ERROR", "TIMEOUT_ERROR", "UNKNOWN_BLOCK", "NO_SYNCED_BLOCKS", "NOT_SYNCED_YET", "UNAVAILABLE_SHARD", "GARBAGE_COLLECTED_BLOCK", "UNKNOWN_CHUNK", "UNKNOWN_EPOCH"])

interface JsonRpcBody {
  result?: unknown
  error?: { name?: string; code?: number; message?: string; data?: unknown; cause?: { name?: string; info?: Record<string, unknown> } }
  code?: number
  message?: string
}

/** Interprets a `call_function` result error string (HTTP 200, result.error). */
function viewErrorFromResultError(err: string, blockHeight: number | undefined, raw: unknown): RpcViewError {
  const text = stripControlChars(err)
  if (/MethodResolveError|MethodNotFound/.test(text)) return new RpcViewError("METHOD_NOT_FOUND", text, { blockHeight, raw })
  if (/CodeDoesNotExist|CompilationError/.test(text)) return new RpcViewError("NO_CONTRACT_CODE", text, { blockHeight, raw })
  if (/access key .* does not exist/.test(text)) return new RpcViewError("UNKNOWN_ACCESS_KEY", text, { blockHeight, raw })
  const panic = /GuestPanic \{ panic_msg: "(.*)" \}/.exec(text)
  if (panic || /panicked|Smart contract panicked/.test(text)) {
    const msg = panic ? (panic[1] as string) : text
    return new RpcViewError("CONTRACT_PANIC", msg, { errorCode: errorCodeFromText(msg), blockHeight, raw })
  }
  return new RpcViewError("CONTRACT_ERROR", text, { errorCode: errorCodeFromText(text), blockHeight, raw })
}

export function createRpcClient(opts: RpcClientOptions): RpcClient {
  if (!opts.urls.length) throw new Error("createRpcClient: at least one RPC URL is required")
  for (const u of opts.urls) assertAllowedRpcUrl(u)
  const urls = [...opts.urls]
  const timeoutMs = opts.timeoutMs ?? 4000
  const stickyMs = opts.stickyMs ?? 60_000
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a))
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const bucket = opts.budget === false ? null : new TokenBucket(opts.budget ?? { perMinute: 100, burst: 10 }, now, sleep)

  let active = 0
  let stickUntil = 0
  let requests = 0
  let failovers = 0
  let nextId = 1

  const headersFor = (url: string): Record<string, string> => {
    const extra = typeof opts.headers === "function" ? opts.headers(url) : opts.headers
    return { "content-type": "application/json", ...(extra ?? {}) }
  }

  async function attempt(url: string, method: string, params: unknown): Promise<unknown> {
    if (bucket) await bucket.acquire()
    requests++
    const body = JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params })
    let res: Response
    try {
      res = await doFetch(url, { method: "POST", headers: headersFor(url), body, signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      const name = (e as { name?: string })?.name
      if (name === "TimeoutError" || name === "AbortError") throw new RpcTransportError(url, "timeout", `no answer within ${timeoutMs} ms`)
      // A CORS-less 429 surfaces in browsers as a TypeError ("Failed to fetch").
      throw new RpcTransportError(url, "network", String((e as Error)?.message ?? e))
    }
    if (res.status === 429) throw new RpcTransportError(url, "rate_limited", "HTTP 429", 429)
    if (res.status === 408 || res.status >= 500) throw new RpcTransportError(url, "http", `HTTP ${res.status}`, res.status)
    let text: string
    try {
      text = await res.text()
    } catch (e) {
      throw new RpcTransportError(url, "network", String((e as Error)?.message ?? e))
    }
    let json: JsonRpcBody
    try {
      json = parseJsonLenient<JsonRpcBody>(text)
    } catch {
      if (!res.ok) throw new RpcViewError("INVALID_REQUEST", `HTTP ${res.status}: ${text.slice(0, 200)}`)
      throw new RpcTransportError(url, "parse", `unparseable body: ${text.slice(0, 120)}`)
    }
    if (json.code === -429 || json.error?.code === -429) throw new RpcTransportError(url, "rate_limited", json.message ?? json.error?.message ?? "-429", res.status)
    if (json.error) {
      const name = json.error.name
      const cause = json.error.cause?.name
      const msg = String(json.error.data ?? json.error.message ?? "RPC error")
      const blockHeight = json.error.cause?.info?.block_height as number | undefined
      if (cause === "UNKNOWN_ACCOUNT" || cause === "INVALID_ACCOUNT") throw new RpcViewError("UNKNOWN_ACCOUNT", msg, { blockHeight, raw: json.error })
      if (cause === "NO_CONTRACT_CODE") throw new RpcViewError("NO_CONTRACT_CODE", msg, { blockHeight, raw: json.error })
      if (cause === "UNKNOWN_ACCESS_KEY") throw new RpcViewError("UNKNOWN_ACCESS_KEY", msg, { blockHeight, raw: json.error })
      if (cause === "CONTRACT_EXECUTION_ERROR") {
        const vmError = String(json.error.cause?.info?.vm_error ?? msg)
        throw viewErrorFromResultError(vmError, blockHeight, json.error)
      }
      if (name === "REQUEST_VALIDATION_ERROR" || cause === "PARSE_ERROR") throw new RpcViewError("INVALID_REQUEST", msg, { raw: json.error })
      if ((cause && NODE_ERRORS_FAILOVER.has(cause)) || name === "INTERNAL_ERROR" || !res.ok) throw new RpcTransportError(url, "node", `${cause ?? name}: ${msg}`, res.status)
      throw new RpcViewError("HANDLER_ERROR", `${cause ?? name}: ${msg}`, { blockHeight, raw: json.error })
    }
    if (!res.ok) throw new RpcTransportError(url, "http", `HTTP ${res.status}`, res.status)
    return json.result
  }

  async function call<T>(method: string, params: unknown): Promise<T> {
    const start = now() < stickUntil ? active : 0
    if (start === 0) active = 0
    const errors: RpcTransportError[] = []
    for (let k = 0; k < urls.length; k++) {
      const idx = (start + k) % urls.length
      const url = urls[idx] as string
      try {
        const r = (await attempt(url, method, params)) as T
        if (idx !== active) {
          active = idx
        }
        return r
      } catch (e) {
        if (!(e instanceof RpcTransportError)) throw e
        errors.push(e)
        failovers++
        const nextIdx = (idx + 1) % urls.length
        const next = k + 1 < urls.length ? (urls[nextIdx] as string) : null
        if (next) {
          active = nextIdx
          stickUntil = nextIdx === 0 ? 0 : now() + stickyMs
        }
        opts.onFailover?.(url, next, e)
      }
    }
    throw new RpcUnavailableError(errors)
  }

  async function query(params: Record<string, unknown>): Promise<Record<string, unknown> & { block_height: number }> {
    const r = (await call<Record<string, unknown> & { block_height: number; error?: string }>("query", params)) ?? {}
    if (typeof r.error === "string") throw viewErrorFromResultError(r.error, r.block_height, r)
    return r
  }

  return {
    urls,
    call,
    async viewFunction<T>(accountId: string, methodName: string, args: Record<string, unknown> = {}, o: { finality?: Finality } = {}) {
      const r = await query({
        request_type: "call_function",
        finality: o.finality ?? "final",
        account_id: accountId,
        method_name: methodName,
        args_base64: base64Encode(utf8Encode(JSON.stringify(args))),
      })
      const bytes = Uint8Array.from((r.result as number[] | undefined) ?? [])
      const text = utf8Decode(bytes)
      const value = (text.length ? parseJsonLenient<T>(text) : (null as T)) as T
      return { value, blockHeight: r.block_height }
    },
    async viewAccessKey(accountId: string, publicKey: string, o: { finality?: Finality } = {}) {
      try {
        const r = await query({ request_type: "view_access_key", finality: o.finality ?? "optimistic", account_id: accountId, public_key: publicKey })
        const nonce = r.nonce as number | string
        return { value: { nonce: BigInt(nonce), permission: r.permission as "FullAccess" }, blockHeight: r.block_height }
      } catch (e) {
        if (e instanceof RpcViewError && (e.code === "UNKNOWN_ACCESS_KEY" || e.code === "UNKNOWN_ACCOUNT")) {
          return { value: null, blockHeight: e.blockHeight ?? 0 }
        }
        throw e
      }
    },
    async head(finality: Finality = "final") {
      const b = await call<{ header: { height: number; hash: string; timestamp_nanosec?: string; timestamp?: number } }>("block", { finality })
      return { height: b.header.height, hash: b.header.hash, timestampNs: BigInt(b.header.timestamp_nanosec ?? b.header.timestamp ?? 0) }
    },
    stats: () => ({ requests, failovers, activeUrl: urls[active] as string, queued: bucket?.queued ?? 0 }),
  }
}
