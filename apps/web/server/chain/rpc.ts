// Thin NEAR JSON-RPC client with failover (D-32: FastNEAR first, dRPC second; rpc.testnet.near.org banned).
// Why not near-api-js FailoverRpcProvider: it logs with console.error, sticks to the second provider forever
// and doesn't retry HTTP 429 (kb/backend-infra.md R3). Here: per-call failover on network errors, timeouts,
// HTTP 408/429/5xx and FastNEAR's `{"code":-429}` bodies; handled RPC errors (UNKNOWN_ACCOUNT, …) are
// returned to the caller at once. A later call starts again at the first healthy URL (30 s penalty box).

export class RpcError extends Error {
  constructor(
    /** e.g. UNKNOWN_ACCOUNT, UNKNOWN_ACCESS_KEY, INVALID_TRANSACTION, TIMEOUT_ERROR, UNKNOWN_TRANSACTION */
    readonly type: string,
    readonly info: unknown,
    message: string,
  ) {
    super(message)
    this.name = "RpcError"
  }
}

/** All endpoints failed (network, 429, 5xx). The route maps it to 503 service_unavailable `rpc`. */
export class RpcUnavailableError extends Error {
  constructor(readonly attempts: string[]) {
    super(`RPC unavailable: ${attempts.join("; ")}`)
    this.name = "RpcUnavailableError"
  }
}

export interface RpcClient {
  call<T = unknown>(method: string, params: unknown, opts?: { timeoutMs?: number }): Promise<T>
  readonly urls: readonly string[]
}

export interface RpcOptions {
  fetch?: typeof fetch
  timeoutMs?: number
  /** FastNEAR key for server-side calls from shared egress IPs (H-16) */
  apiKey?: string
  penaltyMs?: number
}

interface JsonRpcErrorBody {
  name?: string
  code?: number
  message?: string
  data?: unknown
  cause?: { name?: string; info?: unknown }
}

const RETRYABLE_TYPES = new Set(["INTERNAL_ERROR", "NO_SYNCED_BLOCKS", "NOT_SYNCED_YET"])

/**
 * The error detail. nearcore puts a tx error's detail in `data` ({TxExecutionError: {InvalidTxError:
 * {InvalidNonce: {tx_nonce, ak_nonce}}}}) while `cause.info` is `{}` (verified on testnet, wave 2): merge both,
 * so callers can see InvalidNonce / Expired. A string `data` (UNKNOWN_ACCOUNT …) keeps `cause.info`.
 */
function errorInfo(err: JsonRpcErrorBody): unknown {
  const info = err.cause?.info
  if (typeof err.data === "object" && err.data !== null && !Array.isArray(err.data))
    return { ...(typeof info === "object" && info !== null && !Array.isArray(info) ? info : {}), ...(err.data as object) }
  return info ?? err.data
}

function classifyBodyError(err: JsonRpcErrorBody): { retry: boolean; error: RpcError } {
  const type = err.cause?.name ?? err.name ?? String(err.code ?? "UNKNOWN")
  const msg = typeof err.data === "string" ? err.data : (err.message ?? type)
  const rateLimited = err.code === -429 || /rate limit/i.test(err.message ?? "") || /rate limit/i.test(msg)
  return {
    retry: rateLimited || RETRYABLE_TYPES.has(type),
    error: new RpcError(rateLimited ? "RATE_LIMITED" : type, errorInfo(err), msg.slice(0, 500)),
  }
}

export function createRpc(urls: readonly string[], opts: RpcOptions = {}): RpcClient {
  if (urls.length === 0) throw new Error("no RPC urls")
  const doFetch = opts.fetch ?? fetch
  const penaltyMs = opts.penaltyMs ?? 30_000
  const penalty = new Map<string, number>()
  let id = 0

  async function call<T>(method: string, params: unknown, callOpts: { timeoutMs?: number } = {}): Promise<T> {
    const now = Date.now()
    // healthy URLs first, in configured order; penalised ones last
    const order = [...urls].sort((a, b) => Number((penalty.get(a) ?? 0) > now) - Number((penalty.get(b) ?? 0) > now))
    const attempts: string[] = []
    let lastHandled: RpcError | undefined
    for (const url of order) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), callOpts.timeoutMs ?? opts.timeoutMs ?? 10_000)
      try {
        const headers: Record<string, string> = { "content-type": "application/json" }
        if (opts.apiKey && url.includes("fastnear")) headers.authorization = `Bearer ${opts.apiKey}`
        const res = await doFetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: ctrl.signal,
        })
        if (res.status === 408 || res.status === 429 || res.status >= 500) {
          penalty.set(url, Date.now() + penaltyMs)
          attempts.push(`${new URL(url).host}: HTTP ${res.status}`)
          continue
        }
        const body = (await res.json()) as { result?: T; error?: JsonRpcErrorBody }
        if (body.error) {
          const { retry, error } = classifyBodyError(body.error)
          if (retry) {
            penalty.set(url, Date.now() + penaltyMs)
            attempts.push(`${new URL(url).host}: ${error.type}`)
            lastHandled = error
            continue
          }
          throw error
        }
        return body.result as T
      } catch (e) {
        if (e instanceof RpcError) throw e
        penalty.set(url, Date.now() + penaltyMs)
        attempts.push(`${new URL(url).host}: ${(e as Error).name === "AbortError" ? "timeout" : String((e as Error).message).slice(0, 80)}`)
      } finally {
        clearTimeout(timer)
      }
    }
    if (lastHandled && lastHandled.type !== "RATE_LIMITED") throw lastHandled
    throw new RpcUnavailableError(attempts)
  }

  return { call, urls }
}
