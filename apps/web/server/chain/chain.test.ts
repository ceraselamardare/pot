// B-02: the failover RPC client (FastNEAR → dRPC; 429/5xx/timeouts fail over, handled errors don't) and the
// key-pool submitter (real near-api-js signing, leases, nonce re-read, timeout algorithm → pending).
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { decodeSignedTransaction, KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { createTestDb, type TestDb } from "@/db/testing"
import { bs58, sha256 } from "../util/crypto"
import { FakeChain, plainOutcome } from "../testing/fakeChain"
import { loadConfig } from "../config"
import { parseKeys } from "./keys"
import { RpcError, RpcUnavailableError, createRpc } from "./rpc"
import { createSubmitter } from "./submitter"
import { actions } from "near-api-js"

type Handler = (url: string, body: { method: string; params: unknown }) => Response | Promise<Response>
const fakeFetch = (h: Handler): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => h(String(input), JSON.parse(String(init?.body)))) as typeof fetch
const ok = (result: unknown) => Response.json({ jsonrpc: "2.0", id: 1, result })

describe("RPC failover (B-02)", () => {
  const URLS = ["https://rpc.testnet.fastnear.com", "https://near-testnet.drpc.org"]

  it("a tx error keeps its detail: `data` (InvalidNonce) is merged into info, `cause.info` kept for views", async () => {
    const body = { jsonrpc: "2.0", id: 1, error: { name: "HANDLER_ERROR", cause: { name: "INVALID_TRANSACTION", info: {} }, code: -32000, message: "Server error", data: { TxExecutionError: { InvalidTxError: { InvalidNonce: { tx_nonce: 5, ak_nonce: 9 } } } } } }
    const rpc = createRpc(URLS, { fetch: fakeFetch(() => Response.json(body)) })
    const e = await rpc.call("send_tx", {}).catch((x) => x)
    expect(e).toBeInstanceOf(RpcError)
    expect(e).toMatchObject({ type: "INVALID_TRANSACTION", info: { TxExecutionError: { InvalidTxError: { InvalidNonce: { ak_nonce: 9 } } } } })
    const unknown = { jsonrpc: "2.0", id: 1, error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: { requested_account_id: "x.testnet" } }, message: "Server error", data: "account x.testnet does not exist" } }
    const e2 = await createRpc(URLS, { fetch: fakeFetch(() => Response.json(unknown)) }).call("query", {}).catch((x) => x)
    expect(e2).toMatchObject({ type: "UNKNOWN_ACCOUNT", info: { requested_account_id: "x.testnet" } })
  })

  it("uses FastNEAR first", async () => {
    const hits: string[] = []
    const rpc = createRpc(URLS, { fetch: fakeFetch((u) => (hits.push(u), ok({ v: 1 }))) })
    expect(await rpc.call("status", [])).toEqual({ v: 1 })
    expect(hits).toEqual([URLS[0]])
  })

  it.each([
    ["HTTP 429", () => new Response("", { status: 429 })],
    ["HTTP 503", () => new Response("", { status: 503 })],
    ["JSON-RPC -429 inside HTTP 200", () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -429, message: "Rate limits exceeded" } })],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("fails over to dRPC on %s, and stays off the bad host for a while", async (_n, bad) => {
    const hits: string[] = []
    const rpc = createRpc(URLS, { fetch: fakeFetch((u) => (hits.push(u), u.includes("fastnear") ? bad() : ok("dr"))) })
    expect(await rpc.call("block", { finality: "final" })).toBe("dr")
    expect(await rpc.call("block", { finality: "final" })).toBe("dr")
    expect(hits).toEqual([URLS[0], URLS[1], URLS[1]])
  })

  it("times out a slow host and fails over", async () => {
    const f = ((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("fastnear")
        ? new Promise<Response>((_r, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))
        : Promise.resolve(ok("fast-enough"))) as typeof fetch
    const rpc = createRpc(URLS, { timeoutMs: 50, fetch: f })
    expect(await rpc.call("status", [])).toBe("fast-enough")
  })

  it("does NOT fail over on a handled error (UNKNOWN_ACCOUNT)", async () => {
    const hits: string[] = []
    const rpc = createRpc(URLS, {
      fetch: fakeFetch((u) => {
        hits.push(u)
        return Response.json({ jsonrpc: "2.0", id: 1, error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_ACCOUNT", info: {} }, code: -32000, message: "Server error" } })
      }),
    })
    await expect(rpc.call("query", {})).rejects.toBeInstanceOf(RpcError)
    expect(hits).toHaveLength(1)
  })

  it("all hosts down → RpcUnavailableError", async () => {
    const rpc = createRpc(URLS, { fetch: fakeFetch(() => new Response("", { status: 502 })) })
    await expect(rpc.call("status", [])).rejects.toBeInstanceOf(RpcUnavailableError)
  })

  it("never accepts the deprecated near.org RPC (D-32)", () => {
    const deprecated = ["https://rpc", "testnet", "near", "org"].join(".") // built from parts: the literal is lint-banned
    expect(() => loadConfig({ SERVER_RPC_URLS: deprecated })).toThrow(/banned/)
  })

  it("sends the FastNEAR key only to FastNEAR", async () => {
    const auth: (string | null)[] = []
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      auth.push(new Headers(init?.headers).get("authorization"))
      return String(input).includes("fastnear") ? new Response("", { status: 500 }) : ok(1)
    }) as typeof fetch
    await createRpc(URLS, { fetch: f, apiKey: "k" }).call("status", [])
    expect(auth).toEqual(["Bearer k", null])
  })
})

describe("key-pool submitter (B-02, A-18)", () => {
  let t: TestDb
  let chain: FakeChain
  const keys = parseKeys(Array.from({ length: 3 }, () => KeyPair.fromRandom("ed25519").toString()).join(","))
  const RELAYER = "users.potapp.testnet"

  beforeAll(async () => {
    t = await createTestDb("chain")
  })
  afterAll(async () => {
    await t.close()
  })
  beforeEach(async () => {
    await t.truncate()
    chain = new FakeChain()
    chain.account(RELAYER, { amount: 10n ** 25n, keys: Object.fromEntries(keys.map((k, i) => [k.publicKey, BigInt(100 * (i + 1))])) })
  })

  /** send_tx: decode the signed tx, check it, return an outcome under the tx's own hash. */
  function withSendTx(behave: (n: number, tx: ReturnType<typeof decodeSignedTransaction>) => "ok" | "timeout" | "nonce" | "unavailable") {
    let n = 0
    const call = chain.call.bind(chain)
    chain.call = async <T,>(method: string, params: unknown): Promise<T> => {
      if (method === "send_tx") {
        const p = params as { signed_tx_base64: string }
        const bytes = new Uint8Array(Buffer.from(p.signed_tx_base64, "base64"))
        const stx = decodeSignedTransaction(bytes)
        const b = behave(n++, stx)
        if (b === "timeout") throw new RpcError("TIMEOUT_ERROR", null, "timeout")
        if (b === "unavailable") throw new RpcUnavailableError(["x: HTTP 502"])
        // the real testnet shape (wave 2): message "Server error", the detail in `data`, merged into info by rpc.ts
        if (b === "nonce") throw new RpcError("INVALID_TRANSACTION", { TxExecutionError: { InvalidTxError: { InvalidNonce: { tx_nonce: Number(stx.transaction.nonce), ak_nonce: Number(stx.transaction.nonce) + 4 } } } }, "Server error")
        const hash = bs58.encode(sha256(stx.transaction.encode()))
        return plainOutcome(hash, RELAYER, stx.transaction.receiverId) as T
      }
      return call<T>(method, params)
    }
  }

  const spec = { signerId: RELAYER, receiverId: "u-x.users.potapp.testnet", actions: [actions.transfer(0n)] }

  it("signs with a leased key, nonce = access key nonce + 1, stores the hash before broadcast, releases the lease", async () => {
    const seen: { nonce: bigint; pk: string }[] = []
    withSendTx((_n, stx) => (seen.push({ nonce: stx.transaction.nonce, pk: stx.transaction.publicKey.toString() }), "ok"))
    const signedHashes: string[] = []
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: keys } })
    const r = await sub.submit(spec, { pool: "relayer_key", holder: "h1", onSigned: async ({ txHash }) => void signedHashes.push(txHash) })
    expect(r.kind).toBe("outcome")
    expect(signedHashes).toEqual([r.txHash])
    const key = keys.find((k) => k.publicKey === seen[0]!.pk)!
    expect(seen[0]!.nonce).toBe(chain.accounts.get(RELAYER)!.keys.get(key.publicKey)!.nonce + 1n)
    const held = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM lease WHERE holder IS NOT NULL`)
    expect(held.rows[0]!.n).toBe(0)
    const rows = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM lease WHERE starts_with(name, 'relayer_key:')`)
    expect(rows.rows[0]!.n).toBe(3)
  })

  it("3 concurrent submits use 3 distinct keys; a 4th waits and then gets relayer_busy", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const used: string[] = []
    withSendTx((_n, stx) => (used.push(stx.transaction.publicKey.toString()), "ok"))
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: keys } })
    const blockers = keys.map((_, i) =>
      sub.submit(spec, { pool: "relayer_key", holder: `b${i}`, onSigned: () => gate }),
    )
    await new Promise((r) => setTimeout(r, 100))
    await expect(sub.submit(spec, { pool: "relayer_key", holder: "late", onSigned: async () => undefined })).rejects.toMatchObject({
      reason: "service_unavailable",
      detail: { cause: "relayer_busy" },
    })
    release()
    await Promise.all(blockers)
    expect(new Set(used).size).toBe(3)
  }, 10_000)

  it("InvalidNonce → re-read the nonce, re-sign once, report the new hash", async () => {
    withSendTx((n) => (n === 0 ? "nonce" : "ok"))
    const hashes: string[] = []
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: keys } })
    const r = await sub.submit(spec, { pool: "relayer_key", holder: "h", onSigned: async ({ txHash }) => void hashes.push(txHash) })
    expect(r.kind).toBe("outcome")
    expect(hashes).toHaveLength(2)
    expect(r.txHash).toBe(hashes[1])
  })

  it("InvalidNonce again and again (a key shared with another process) → up to 3 re-signs above the chain's ak_nonce", async () => {
    const nonces: bigint[] = []
    withSendTx((n, stx) => (nonces.push(stx.transaction.nonce), n < 3 ? "nonce" : "ok"))
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: keys } })
    const r = await sub.submit(spec, { pool: "relayer_key", holder: "h" })
    expect(r.kind).toBe("outcome")
    expect(nonces).toHaveLength(4)
    // each re-sign jumps past the ak_nonce the error reported (tx_nonce + 4)
    for (let i = 1; i < nonces.length; i++) expect(nonces[i]).toBe(nonces[i - 1]! + 5n)
  })

  it("a 4th InvalidNonce in a row is not retried: the error surfaces: the error surfaces", async () => {
    withSendTx(() => "nonce")
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: keys } })
    await expect(sub.submit(spec, { pool: "relayer_key", holder: "h" })).rejects.toMatchObject({ type: "INVALID_TRANSACTION" })
  })

  it("an unknown outcome → polls tx status; found → the outcome", async () => {
    withSendTx(() => "timeout")
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: keys } })
    const r = await sub.submit(spec, {
      pool: "relayer_key",
      holder: "h",
      budgetMs: 3_000,
      onSigned: async ({ txHash }) => {
        chain.txs.set(txHash, plainOutcome(txHash, RELAYER, spec.receiverId))
      },
    })
    expect(r.kind).toBe("outcome")
  })

  it("still unknown at the budget → pending (the route answers 202), and re-broadcasts the same bytes", async () => {
    withSendTx(() => "unavailable")
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: keys } })
    const r = await sub.submit(spec, { pool: "relayer_key", holder: "h", budgetMs: 1_200 })
    expect(r.kind).toBe("pending")
    expect(chain.calls.some((c) => c.method === "broadcast_tx_async")).toBe(true)
  })

  it("B-19: the key is freed at INCLUDED; the outcome is awaited without it; the next holder signs above lastNonce", async () => {
    const one = keys.slice(0, 1)
    const seen: bigint[] = []
    const call = chain.call.bind(chain)
    chain.call = async <T,>(method: string, params: unknown): Promise<T> => {
      if (method === "send_tx") {
        const p = params as { signed_tx_base64: string; wait_until: string }
        expect(p.wait_until).toBe("INCLUDED")
        const stx = decodeSignedTransaction(new Uint8Array(Buffer.from(p.signed_tx_base64, "base64")))
        seen.push(stx.transaction.nonce)
        const hash = bs58.encode(sha256(stx.transaction.encode()))
        // executed 300 ms later (the receipt tree); the RPC's access-key view never catches up (a lagging node)
        setTimeout(() => chain.txs.set(hash, plainOutcome(hash, RELAYER, stx.transaction.receiverId)), 300)
        // the real INCLUDED answer carries a PARTIAL tree (receipts "Started"), which must not count as an outcome
        return { final_execution_status: "INCLUDED", status: "Started", receipts_outcome: [{ id: "r", outcome: { status: "Started" } }] } as T
      }
      return call<T>(method, params)
    }
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: { relayer_key: one } })
    const first = sub.submit(spec, { pool: "relayer_key", holder: "a", budgetMs: 5_000 })
    await new Promise((r) => setTimeout(r, 120))
    // still waiting for the outcome, but the only key is free again …
    const held = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM lease WHERE holder IS NOT NULL`)
    expect(held.rows[0]!.n).toBe(0)
    // … so a second tx gets it at once and signs above the first one's nonce although the view is stale
    const second = await sub.submit(spec, { pool: "relayer_key", holder: "b", budgetMs: 5_000 })
    expect((await first).kind).toBe("outcome")
    expect(second.kind).toBe("outcome")
    expect(seen).toEqual([seen[0]!, seen[0]! + 1n])
    const meta = await t.db.execute<{ last: string }>(sql`SELECT meta->>'lastNonce' AS last FROM lease WHERE name = 'relayer_key:0'`)
    expect(meta.rows[0]!.last).toBe(String(seen[1]))
  })

  it("no keys configured → service_unavailable (relayer_busy / treasury)", async () => {
    const sub = createSubmitter({ db: t.db, rpc: chain, pools: {} })
    await expect(sub.submit(spec, { pool: "treasury_key", holder: "h", busyCause: "treasury" })).rejects.toMatchObject({
      detail: { cause: "treasury" },
    })
  })
})
