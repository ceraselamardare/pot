// QA 2026-10-22: scripts' RPC reads must fail over from FastNEAR to dRPC (e2e-chain's balance read timed out
// on a rate-limited FastNEAR while the chain already showed the right balance).
import { describe, expect, it } from "vitest"
import { rpc } from "./env.ts"

const A = "https://a.example"
const B = "https://b.example"
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

function fakeFetch(answers: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = []
  const f = (async (url: string | URL | Request) => {
    const u = String(url)
    calls.push(u)
    return answers[u]!()
  }) as typeof fetch
  return { f, calls }
}

describe("scripts rpc() failover", () => {
  it("a 429 from the first URL → the second answers", async () => {
    const { f, calls } = fakeFetch({ [A]: () => json(429, {}), [B]: () => json(200, { result: 42 }) })
    expect(await rpc<number>("status", [], { urls: [A, B], fetch: f, backoffMs: 1 })).toBe(42)
    expect(calls).toEqual([A, B])
  })

  it("a network error, a 5xx, a non-JSON body and a JSON-RPC -429 all fail over", async () => {
    for (const bad of [
      () => Promise.reject(new TypeError("fetch failed")),
      () => json(503, {}),
      () => new Response("<html>busy</html>", { status: 200 }),
      () => json(200, { error: { code: -429, message: "Too many requests" } }),
    ]) {
      const { f } = fakeFetch({ [A]: bad, [B]: () => json(200, { result: "ok" }) })
      expect(await rpc<string>("status", [], { urls: [A, B], fetch: f, backoffMs: 1 })).toBe("ok")
    }
  })

  it("a contract error is an answer, not a transport failure: no failover", async () => {
    const { f, calls } = fakeFetch({
      [A]: () => json(200, { error: { code: -32000, cause: { name: "UNKNOWN_ACCOUNT" }, message: "Server error" } }),
      [B]: () => json(200, { result: "never" }),
    })
    await expect(rpc("query", {}, { urls: [A, B], fetch: f, backoffMs: 1 })).rejects.toMatchObject({ cause: { name: "UNKNOWN_ACCOUNT" } })
    expect(calls).toEqual([A])
  })

  it("every URL failing every round → one clear error", async () => {
    const { f, calls } = fakeFetch({ [A]: () => json(429, {}), [B]: () => json(502, {}) })
    await expect(rpc("status", [], { urls: [A, B], fetch: f, rounds: 2, backoffMs: 1 })).rejects.toThrow(/every RPC failed/)
    expect(calls).toEqual([A, B, A, B])
  })
})
