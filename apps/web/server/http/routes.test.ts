// Route-level envelope tests (A-19, W-08 subset): CSRF/Origin and content type on POST routes, the 16 KB
// cap, strict schemas, requestId in body and header, security headers, Cache-Control, auth gates, 404 gates.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { createTestDb, type TestDb } from "@/db/testing"
import { existsSync } from "node:fs"
import { testConfig } from "../testing/env"

let t: TestDb
beforeAll(async () => {
  t = await createTestDb("routes")
  setDbForTests(t.db)
})
afterAll(async () => {
  setDbForTests(undefined)
  await t.close()
})
beforeEach(() => {
  testConfig()
})

const ORIGIN = "https://pot.test"
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

async function expectErr(res: Response, status: number, reason: string) {
  const body = (await res.json()) as { ok: boolean; reason: string; requestId: string }
  expect(res.status).toBe(status)
  expect(body).toMatchObject({ ok: false, reason })
  expect(body.requestId).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/)
  expect(res.headers.get("x-request-id")).toBe(body.requestId)
  return body
}

describe("envelope and CSRF (A-19)", () => {
  it("a foreign Origin → 403 forbidden_origin, with requestId, security headers and no-store", async () => {
    const { POST } = await import("@/app/api/relay/route")
    const res = await POST(post("/api/relay", {}, { origin: "https://evil.example" }))
    await expectErr(res, 403, "forbidden_origin")
    expect(res.headers.get("x-frame-options")).toBe("DENY")
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
  })

  it("a missing Origin or a non-JSON content type → forbidden_origin", async () => {
    const { POST } = await import("@/app/api/faucet/route")
    await expectErr(await POST(new Request(`${ORIGIN}/api/faucet`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })), 403, "forbidden_origin")
    await expectErr(await POST(post("/api/faucet", "{}", { "content-type": "text/plain" })), 403, "forbidden_origin")
  })

  it("a body over 16 KB → bad_request", async () => {
    const { POST } = await import("@/app/api/relay/route")
    await expectErr(await POST(post("/api/relay", { signedDelegate: "A".repeat(17 * 1024) })), 400, "bad_request")
  })

  it("malformed JSON → bad_request", async () => {
    const { POST } = await import("@/app/api/notes/route")
    await expectErr(await POST(post("/api/notes", "{not json")), 400, "bad_request")
  })

  it("unknown fields → bad_request with detail.field (.strict())", async () => {
    const { POST } = await import("@/app/api/faucet/route")
    const body = await expectErr(await POST(post("/api/faucet", { idempotencyKey: "aaaaaaaaaaaaaaaa", extra: 1 })), 400, "bad_request")
    expect(JSON.stringify(body)).toContain("extra")
  })

  it("no session → 401 not_signed_in", async () => {
    const { POST } = await import("@/app/api/relay/route")
    await expectErr(await POST(post("/api/relay", { signedDelegate: "AAAA", idempotencyKey: "aaaaaaaaaaaaaaaa", intent: "add_money" })), 401, "not_signed_in")
  })

  it("GET /api/session without a cookie → 200 {session: null}", async () => {
    const { GET } = await import("@/app/api/session/route")
    const res = await GET(new Request(`${ORIGIN}/api/session`))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, session: null })
  })

  it("DELETE /api/session needs the Origin too", async () => {
    const { DELETE } = await import("@/app/api/session/route")
    await expectErr(await DELETE(new Request(`${ORIGIN}/api/session`, { method: "DELETE" })), 403, "forbidden_origin")
  })

  it("GET /api/session/challenge → a 32-byte challenge, no-store", async () => {
    const { GET } = await import("@/app/api/session/challenge/route")
    const res = await GET(new Request(`${ORIGIN}/api/session/challenge`))
    const body = (await res.json()) as { challenge: string; expiresAt: string }
    expect(Buffer.from(body.challenge, "base64url")).toHaveLength(32)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("Rev 9: the test-account and live-demo routes are gone (sign-in is NEAR Auth or a NEAR wallet only)", () => {
    for (const dir of ["api/session/dev", "api/demo", "api/cron/demo-pool", "demo/live"])
      expect(existsSync(new URL(`../../app/${dir}`, import.meta.url)), dir).toBe(false)
  })

  it("GET /api/relay/[relayId] rejects malformed ids before any lookup", async () => {
    const { GET } = await import("@/app/api/relay/[relayId]/route")
    await expectErr(await GET(new Request(`${ORIGIN}/api/relay/x`), { params: Promise.resolve({ relayId: "x" }) }), 404, "not_found")
  })
})

describe("route() and Next's control-flow errors (wave 2)", () => {
  it("rethrows Next's internal errors (notFound, the prerender bail-out) instead of answering 500", async () => {
    const { notFound } = await import("next/navigation")
    const { route } = await import("./context")
    const h = route("GET /api/x", async () => notFound())
    await expect(h(new Request(`${ORIGIN}/api/x`))).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK") })
  })

  it("still maps an application error to the JSON envelope", async () => {
    const { route } = await import("./context")
    const res = await route("GET /api/x", async () => {
      throw new Error("boom")
    })(new Request(`${ORIGIN}/api/x`))
    await expectErr(res, 500, "internal")
  })
})
