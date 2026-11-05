// POST /api/relay hands the request's ipHash (an HMAC of the IP, never the IP) to the relayer, so the per-IP gift
// quota (ip_gift, hub 1.2.0) applies.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({
  relay: vi.fn(async () => ({ status: 200, body: { ok: true, result: null } })),
  deps: { tag: "relayDeps" },
}))
vi.mock("@/db/client", () => ({ getDb: () => ({}) }))
vi.mock("@/server/deps", () => ({ relayDeps: () => h.deps }))
vi.mock("@/server/relay/pipeline", () => ({ relay: h.relay }))
vi.mock("@/server/session/store", () => ({
  requireSession: async () => ({ kind: "near-auth", user: { id: "u1", nearAccount: "eve.testnet", emailVerified: false, emailHash: null }, device: null }),
}))
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ipHash } from "@/server/http/context"
import { testConfig } from "@/server/testing/env"
import { POST } from "./route"

const ORIGIN = "https://pot.test"
const req = (ip: string) =>
  new Request(`${ORIGIN}/api/relay`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip },
    body: JSON.stringify({ signedDelegate: "AAAA", idempotencyKey: "aaaaaaaaaaaaaaaa", intent: "send_gift" }),
  })

describe("POST /api/relay → relay(…, {ipHash})", () => {
  beforeEach(() => {
    testConfig()
    h.relay.mockClear()
    // APP-9: proxy headers count only on Vercel or behind a declared proxy
    process.env.TRUST_PROXY_HEADERS = "1"
  })
  afterEach(() => {
    delete process.env.TRUST_PROXY_HEADERS
  })

  it("passes ipHash(req) for the per-IP gift quota (never the raw IP)", async () => {
    const r = req("203.0.113.7, 10.0.0.1")
    const res = await POST(r.clone())
    expect(res.status).toBe(200)
    expect(h.relay).toHaveBeenCalledTimes(1)
    const [deps, actor, body] = h.relay.mock.calls[0] as unknown as [unknown, { accountId: string }, { ipHash: string; intent: string }]
    expect(deps).toBe(h.deps)
    expect(actor.accountId).toBe("eve.testnet")
    expect(body.intent).toBe("send_gift")
    expect(body.ipHash).toBe(ipHash(r))
    expect(body.ipHash).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(body)).not.toContain("203.0.113.7")
  })

  it("two IPs → two different hashes", async () => {
    await POST(req("203.0.113.7"))
    await POST(req("198.51.100.9"))
    const a = (h.relay.mock.calls[0] as unknown as [unknown, unknown, { ipHash: string }])[2].ipHash
    const b = (h.relay.mock.calls[1] as unknown as [unknown, unknown, { ipHash: string }])[2].ipHash
    expect(a).not.toBe(b)
  })

  it("APP-9: off Vercel, a client-chosen X-Forwarded-For doesn't buy a fresh per-IP bucket", async () => {
    delete process.env.TRUST_PROXY_HEADERS
    await POST(req("203.0.113.7"))
    await POST(req("198.51.100.9"))
    const a = (h.relay.mock.calls[0] as unknown as [unknown, unknown, { ipHash: string }])[2].ipHash
    const b = (h.relay.mock.calls[1] as unknown as [unknown, unknown, { ipHash: string }])[2].ipHash
    expect(a).toBe(b)
  })
})
