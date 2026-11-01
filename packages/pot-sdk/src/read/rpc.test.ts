// U-01 read client failover + U-02 parsing (against a scripted fetch; the live check is in
// testnet.integration.test.ts).
import { describe, expect, it } from "vitest"
import { utf8Encode } from "../encoding.ts"
import { BannedRpcUrlError, RpcUnavailableError, RpcViewError, assertAllowedRpcUrl, createRpcClient, parseJsonLenient, sanitizeJsonText } from "./rpc.ts"

const FAST = "https://rpc.testnet.fastnear.com"
const DRPC = "https://near-testnet.drpc.org"

type Reply = { status?: number; body?: unknown; text?: string; throw?: Error }
const json = (body: unknown, status = 200): Reply => ({ status, body })
const viewOk = (value: unknown, height = 100): Reply => json({ jsonrpc: "2.0", id: 1, result: { block_height: height, block_hash: "h", logs: [], result: [...utf8Encode(JSON.stringify(value))] } })

/** A fetch that answers per URL from queues, recording calls. */
function scriptedFetch(script: Record<string, Reply[]>) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: JSON.parse(String(init?.body)) })
    const q = script[url]
    const r = q && q.length > 1 ? q.shift() : q?.[0]
    if (!r) throw new TypeError("Failed to fetch")
    if (r.throw) throw r.throw
    return new Response(r.text ?? JSON.stringify(r.body), { status: r.status ?? 200 })
  }) as typeof fetch
  return { f, calls }
}

const noBudget = { budget: false as const }

describe("RPC URL guard (D-32)", () => {
  it("throws on the deprecated endpoints (D-32)", () => {
    const nearOrg = ["https://rpc", "testnet", "near", "org"].join(".")
    expect(() => createRpcClient({ urls: [FAST, nearOrg] })).toThrow(BannedRpcUrlError)
    expect(() => assertAllowedRpcUrl(["https://near-testnet", "lava", "build"].join("."))).toThrow(BannedRpcUrlError)
    expect(() => assertAllowedRpcUrl(["https://archival-rpc", "mainnet", "near", "org"].join("."))).toThrow(BannedRpcUrlError)
    expect(() => createRpcClient({ urls: [FAST, DRPC] })).not.toThrow()
    expect(() => createRpcClient({ urls: [] })).toThrow()
  })
})

describe("RPC failover (U-01)", () => {
  it("decodes a call_function view with its block height", async () => {
    const { f, calls } = scriptedFetch({ [FAST]: [viewOk({ spec: "ft-1.0.0", decimals: 24 }, 274151633)] })
    const rpc = createRpcClient({ urls: [FAST, DRPC], fetch: f, ...noBudget })
    const v = await rpc.viewFunction<{ decimals: number }>("wrap.testnet", "ft_metadata")
    expect(v).toEqual({ value: { spec: "ft-1.0.0", decimals: 24 }, blockHeight: 274151633 })
    const params = calls[0]?.body.params as Record<string, string>
    expect(params).toMatchObject({ request_type: "call_function", finality: "final", account_id: "wrap.testnet", method_name: "ft_metadata", args_base64: "e30=" })
  })

  const failoverCases: [string, Reply][] = [
    ["network error / CORS-less 429 (TypeError)", { throw: new TypeError("Failed to fetch") }],
    ["timeout", { throw: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }],
    ["HTTP 429", { status: 429, text: '{"code":-429,"message":"Rate limits exceeded"}' }],
    ["HTTP 408", { status: 408, text: "timeout" }],
    ["HTTP 502", { status: 502, text: "bad gateway" }],
    ["HTTP 200 with JSON-RPC -429", json({ jsonrpc: "2.0", id: 1, error: { code: -429, message: "THIS ENDPOINT IS DEPRECATED" } })],
    ["HTTP 200 with a top-level -429 body", json({ code: -429, message: "Rate limits exceeded" })],
    ["node INTERNAL_ERROR", json({ jsonrpc: "2.0", id: 1, error: { name: "INTERNAL_ERROR", cause: { name: "INTERNAL_ERROR" }, code: -32000, message: "Server error" } })],
  ]
  for (const [name, reply] of failoverCases) {
    it(`fails over on ${name}`, async () => {
      const { f, calls } = scriptedFetch({ [FAST]: [reply], [DRPC]: [viewOk(5322)] })
      const rpc = createRpcClient({ urls: [FAST, DRPC], fetch: f, ...noBudget })
      const v = await rpc.viewFunction<number>("sputnikv2.testnet", "get_number_daos")
      expect(v.value).toBe(5322)
      expect(calls.map((c) => c.url)).toEqual([FAST, DRPC])
      expect(rpc.stats().failovers).toBe(1)
    })
  }

  it("does NOT fail over on UNKNOWN_ACCOUNT, missing methods or contract panics", async () => {
    const unknown = json({
      jsonrpc: "2.0",
      id: 1,
      error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: { block_height: 7, requested_account_id: "x.testnet" } }, code: -32000, message: "Server error", data: "account x.testnet does not exist while viewing" },
    })
    const noMethod = json({ jsonrpc: "2.0", id: 1, result: { block_height: 8, block_hash: "h", logs: [], error: "wasm execution failed with error: MethodResolveError(MethodNotFound)" } })
    const panic = json({
      jsonrpc: "2.0",
      id: 1,
      result: { block_height: 9, block_hash: "h", logs: [], error: 'wasm execution failed with error: HostError(GuestPanic { panic_msg: "panicked at src/lib.rs:1:1:\\nERR_POT_NOT_FOUND" })' },
    })
    for (const [reply, code, errorCode] of [
      [unknown, "UNKNOWN_ACCOUNT", undefined],
      [noMethod, "METHOD_NOT_FOUND", undefined],
      [panic, "CONTRACT_PANIC", "ERR_POT_NOT_FOUND"],
    ] as const) {
      const { f, calls } = scriptedFetch({ [FAST]: [reply], [DRPC]: [viewOk(1)] })
      const rpc = createRpcClient({ urls: [FAST, DRPC], fetch: f, ...noBudget })
      const err = await rpc.viewFunction("x.testnet", "m").catch((e: unknown) => e)
      expect(err).toBeInstanceOf(RpcViewError)
      expect((err as RpcViewError).code).toBe(code)
      expect((err as RpcViewError).errorCode).toBe(errorCode)
      expect(calls).toHaveLength(1)
    }
  })

  it("throws RpcUnavailableError when every endpoint fails", async () => {
    const { f } = scriptedFetch({ [FAST]: [{ status: 503, text: "" }], [DRPC]: [{ status: 429, text: "" }] })
    const rpc = createRpcClient({ urls: [FAST, DRPC], fetch: f, ...noBudget })
    const err = await rpc.viewFunction("a.testnet", "m").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RpcUnavailableError)
    expect((err as RpcUnavailableError).attempts.map((a) => a.kind)).toEqual(["http", "rate_limited"])
  })

  it("sticks to the backup for 60 s, then probes the primary again", async () => {
    let now = 0
    const { f, calls } = scriptedFetch({ [FAST]: [{ status: 429, text: "" }, viewOk(1), viewOk(1)], [DRPC]: [viewOk(2)] })
    const rpc = createRpcClient({ urls: [FAST, DRPC], fetch: f, now: () => now, ...noBudget })
    expect((await rpc.viewFunction("a", "m")).value).toBe(2) // FAST 429 → DRPC
    now = 30_000
    expect((await rpc.viewFunction("a", "m")).value).toBe(2) // sticky: DRPC first
    expect(rpc.stats().activeUrl).toBe(DRPC)
    now = 61_000
    expect((await rpc.viewFunction("a", "m")).value).toBe(1) // probe primary again
    expect(rpc.stats().activeUrl).toBe(FAST)
    expect(calls.map((c) => c.url)).toEqual([FAST, DRPC, DRPC, FAST])
  })

  it("budget: queues beyond the burst (FIFO), never drops", async () => {
    let now = 0
    const slept: number[] = []
    const { f } = scriptedFetch({ [FAST]: [viewOk(1)] })
    const rpc = createRpcClient({
      urls: [FAST],
      fetch: f,
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms)
        now += ms
      },
      budget: { perMinute: 60, burst: 3 },
    })
    const results = await Promise.all(Array.from({ length: 6 }, () => rpc.viewFunction<number>("a", "m")))
    expect(results.map((r) => r.value)).toEqual([1, 1, 1, 1, 1, 1])
    expect(slept).toHaveLength(3) // 3 burst tokens, then 1 token per second
    expect(slept.every((ms) => ms === 1000)).toBe(true)
    expect(rpc.stats().requests).toBe(6)
  })

  it("parses responses with raw control characters (Sputnik panics carry newlines)", () => {
    const raw = '{"a":"line1\nline2\tx"}'
    expect(() => JSON.parse(raw)).toThrow()
    expect(parseJsonLenient<{ a: string }>(raw).a).toBe("line1\nline2\tx")
    expect(sanitizeJsonText("\u0001")).toBe("\\u0001")
  })

  it("view_access_key: nonce as bigint, null for a missing key", async () => {
    const present = json({ jsonrpc: "2.0", id: 1, result: { block_height: 50, block_hash: "h", nonce: 101200994000000, permission: "FullAccess" } })
    const missing = json({ jsonrpc: "2.0", id: 1, result: { block_height: 51, block_hash: "h", logs: [], error: "access key ed25519:7CUD does not exist while viewing" } })
    const { f, calls } = scriptedFetch({ [FAST]: [present, missing] })
    const rpc = createRpcClient({ urls: [FAST], fetch: f, ...noBudget })
    expect(await rpc.viewAccessKey("a.testnet", "ed25519:x")).toEqual({ value: { nonce: 101200994000000n, permission: "FullAccess" }, blockHeight: 50 })
    expect((calls[0]?.body.params as Record<string, string>).finality).toBe("optimistic")
    expect(await rpc.viewAccessKey("a.testnet", "ed25519:y")).toEqual({ value: null, blockHeight: 51 })
  })

  it("sends per-URL headers (a FastNEAR key only to FastNEAR)", async () => {
    const seen: Record<string, string | null> = {}
    const f = (async (url: string, init?: RequestInit) => {
      seen[url] = new Headers(init?.headers).get("authorization")
      if (url === FAST) return new Response("", { status: 503 })
      const r = viewOk(1)
      return new Response(JSON.stringify(r.body), { status: 200 })
    }) as typeof fetch
    const rpc = createRpcClient({ urls: [FAST, DRPC], fetch: f, headers: (u) => (u === FAST ? { Authorization: "Bearer k" } : undefined), ...noBudget })
    await rpc.viewFunction("a", "m")
    expect(seen).toEqual({ [FAST]: "Bearer k", [DRPC]: null })
  })
})
