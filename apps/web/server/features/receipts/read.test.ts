// POST /api/receipts/read and server/features/receipts/read.ts against pot_test with a fake chain: the gates (feature
// flag, same-origin JSON, session, 2 MB body cap, strict body), members only, image checks (base64, magic bytes,
// 1.5 MB), quotas, provider errors/timeouts → the codes the sheet maps to friendly copy, another currency converted
// by the route's rate source (and still returned when no rate can be had), and D-61: the photo is never stored or logged.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
// the route reads the hub through deps: a fake chain here (never the network)
const hubBox = vi.hoisted(() => ({ hub: null as unknown }))
vi.mock("@/server/deps", () => ({ getHub: () => hubBox.hub }))
import { KeyPair } from "near-api-js"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { readQuota } from "@/db/quota"
import { pot } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { mockReceipt, type ReceiptResult } from "@/lib/receipt"
import { createHubReader } from "../../chain/hub"
import type { Config } from "../../config"
import { ApiError } from "../../http/errors"
import { createSession, loadSession, type SessionCtx } from "../../session/store"
import { DAO, HUB } from "../../testing/delegates"
import { insertUser, seedChain, testConfig } from "../../testing/env"
import { FakeChain } from "../../testing/fakeChain"
import { createMockFx, type FxConverter } from "../fx"
import { ReceiptProviderError, receiptsConfig, type ReceiptReader } from "./nearai"
import { decodeImage, readCappedJson, readReceipt, receiptReadReq, RECEIPT_MAX_BODY, RECEIPT_MAX_IMAGE_BYTES, type ReceiptReadBody } from "./read"

let t: TestDb
let cfg: Config
let chain: FakeChain
const MAYA = "maya.users.potapp.testnet"
const EVE = "eve.users.potapp.testnet" // not a member
const ORIGIN = "https://pot.test"

/** A small valid-looking JPEG (magic bytes + filler) and a marker we can search logs for. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode("PHOTO-MARKER-7f3a"), ...new Array(200).fill(7)])
const B64 = Buffer.from(JPEG).toString("base64")
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(1)])

beforeAll(async () => {
  t = await createTestDb("receipts")
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  for (const k of Object.keys(process.env)) if (k.startsWith("QUOTA_")) delete process.env[k]
  cfg = testConfig()
  chain = seedChain(new FakeChain())
  chain.view(HUB, "get_members", () => [{ account_id: MAYA, status: "active", contributed: "150000000" }])
  hubBox.hub = createHubReader(chain, HUB)
  await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
})
afterEach(() => {
  delete process.env.NEAR_AI_RECEIPTS_MODE
  delete process.env.NEAR_AI_API_KEY
  vi.restoreAllMocks()
})

async function signIn(account: string): Promise<{ s: SessionCtx; cookie: string }> {
  const key = KeyPair.fromRandom("ed25519")
  const { user, device } = await insertUser(t.db, { account, key })
  const created = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  const cookie = `__Host-pot_session=${created.cookieValue}`
  return { s: (await loadSession(t.db, new Request(ORIGIN, { headers: { cookie } }), cfg))!, cookie }
}

const body = (over: Partial<ReceiptReadBody> = {}): ReceiptReadBody => ({ pot: "lisbon-trip", mime: "image/jpeg", image: B64, ...over })
const reading = (result: ReceiptResult = mockReceipt()): ReceiptReader => async () => ({ result, proof: { verifyUrl: "https://cloud.near.ai/verify?model=m", reply: false } })
const deps = (reader: ReceiptReader = reading(), mode: "live" | "mock" = "live", fx?: FxConverter) => ({
  fx,
  db: t.db,
  hub: createHubReader(chain, HUB),
  cfg,
  rcfg: { ...receiptsConfig({ NEAR_AI_API_KEY: "k" }), mode },
  reader,
})

describe("readReceipt", () => {
  it("a member gets the reading back; the photo reaches the reader as bytes", async () => {
    const { s } = await signIn(MAYA)
    let seen: Uint8Array | null = null
    const reader: ReceiptReader = async (i) => {
      seen = i.image
      return { result: mockReceipt(), proof: null }
    }
    const r = await readReceipt(deps(reader), s, body())
    expect(r).toMatchObject({ source: "near-ai", result: { readable: true, merchant: "Pingo Doce", totalCents: 8420, currency: "USD" } })
    expect(seen).toEqual(JPEG)
    // the slug and the DAO id address the same Pot
    expect((await readReceipt(deps(), s, body({ pot: DAO }))).result.readable).toBe(true)
  })

  it("someone outside the Pot can't read receipts there (not_a_member), and spends no quota", async () => {
    const { s } = await signIn(EVE)
    await expect(readReceipt(deps(), s, body())).rejects.toMatchObject({ reason: "not_a_member" })
    expect(await readQuota(t.db, `user:${s.user.id}`, "receipts")).toBe(0n)
    await expect(readReceipt(deps(), s, body({ pot: "Not A Pot!" }))).rejects.toMatchObject({ reason: "pot_unknown" })
  })

  it("another currency comes back as printed and in dollars (rate, its day, its source); dollars need no rate", async () => {
    const { s } = await signIn(MAYA)
    const fx = createMockFx(() => Date.UTC(2026, 10, 1, 12))
    const r = await readReceipt(deps(reading(mockReceipt("receipt-cafe-eur.jpg")), "live", fx), s, body())
    expect(r.result).toMatchObject({ readable: true, currency: "EUR", totalCents: 4250 })
    expect(r.fx).toEqual({ ok: true, from: "EUR", amountCents: 4250, usdCents: 4612, rate: 1.0852, rateDate: "2026-11-01", source: "sample" })
    expect((await readReceipt(deps(reading(), "live", fx), s, body())).fx).toBeNull()
  })

  it("no rate (no converter, or one that fails) still returns the reading: the sheet asks for dollars", async () => {
    const { s } = await signIn(MAYA)
    const eur = reading(mockReceipt("receipt-cafe-eur.jpg"))
    expect((await readReceipt(deps(eur), s, body())).fx).toEqual({ ok: false, from: "EUR", why: "unavailable" })
    const broken: FxConverter = { convert: async () => Promise.reject(new Error("boom")) }
    const r = await readReceipt(deps(eur, "live", broken), s, body())
    expect(r.result).toMatchObject({ readable: true, currency: "EUR" })
    expect(r.fx).toBeNull()
  })

  it("unreadable is an answer (200), not an error", async () => {
    const { s } = await signIn(MAYA)
    expect((await readReceipt(deps(reading({ readable: false })), s, body())).result).toEqual({ readable: false })
  })

  it("provider failures map to codes the sheet turns into copy; the timeout is a 504", async () => {
    const { s } = await signIn(MAYA)
    const failing = (kind: ConstructorParameters<typeof ReceiptProviderError>[0], status?: number): ReceiptReader => async () => {
      throw new ReceiptProviderError(kind, status)
    }
    const err = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as ApiError)
    let e = await err(readReceipt(deps(failing("timeout")), s, body()))
    expect([e?.reason, e?.status, e?.detail?.cause]).toEqual(["service_unavailable", 504, "receipts_timeout"])
    e = await err(readReceipt(deps(failing("busy", 429)), s, body()))
    expect([e?.reason, e?.status, e?.detail?.cause, e?.retryAfterMs]).toEqual(["service_unavailable", 503, "receipts_busy", 5_000])
    e = await err(readReceipt(deps(failing("auth", 401)), s, body()))
    expect([e?.reason, e?.status, e?.detail?.cause]).toEqual(["service_unavailable", 502, "receipts_provider"])
    e = await err(readReceipt(deps(failing("provider", 500)), s, body()))
    expect([e?.status, e?.detail?.cause]).toEqual([502, "receipts_provider"])
  })

  it("rate limits: 5 a minute, 30 a day per person, a global daily cap", async () => {
    const { s } = await signIn(MAYA)
    for (let i = 0; i < 5; i++) await readReceipt(deps(), s, body())
    await expect(readReceipt(deps(), s, body())).rejects.toMatchObject({ reason: "rate_limited" })
    process.env.QUOTA_USER_RECEIPT_BURST = "1000"
    process.env.QUOTA_USER_RECEIPTS = "6"
    await readReceipt(deps(), s, body())
    await expect(readReceipt(deps(), s, body())).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "receipts" } })
    process.env.QUOTA_USER_RECEIPTS = "1000"
    process.env.QUOTA_GLOBAL_RECEIPTS = "6" // 6 counted so far (refused calls roll back)
    await expect(readReceipt(deps(), s, body())).rejects.toMatchObject({ reason: "service_unavailable", detail: { cause: "global_cap" } })
  })

  it("D-61: the photo is never stored or logged, even when reading fails", async () => {
    const { s } = await signIn(MAYA)
    const logs: string[] = []
    for (const m of ["log", "info", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")))
    await readReceipt(deps(), s, body())
    await readReceipt(deps(async () => Promise.reject(new ReceiptProviderError("provider", 500))), s, body()).catch(() => undefined)
    await readReceipt(deps(async () => Promise.reject(new Error("boom"))), s, body()).catch(() => undefined)
    // every text-ish column of every table in this test schema
    const cols = (await t.db.execute(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND data_type IN ('text', 'character varying', 'jsonb', 'json', 'bytea')` as never,
    )) as unknown as { rows: { table_name: string; column_name: string }[] }
    expect(cols.rows.length).toBeGreaterThan(20) // the whole schema is searched, quota rows included
    for (const { table_name, column_name } of cols.rows) {
      const hit = (await t.db.execute(
        `SELECT count(*)::int AS n FROM "${table_name}" WHERE "${column_name}"::text LIKE '%${B64.slice(8, 40)}%' OR "${column_name}"::text LIKE '%PHOTO-MARKER%'` as never,
      )) as unknown as { rows: { n: number }[] }
      expect(hit.rows[0]!.n, `${table_name}.${column_name}`).toBe(0)
    }
    for (const l of logs) expect(l).not.toMatch(/PHOTO-MARKER|\/9j\/|base64,/)
  })
})

describe("image checks", () => {
  it("real base64, the type it claims, ≤ 1.5 MB", () => {
    expect(decodeImage(B64, "image/jpeg")).toEqual(JPEG)
    expect(decodeImage(Buffer.from(PNG).toString("base64"), "image/png")).toEqual(PNG)
    expect(() => decodeImage(B64, "image/png")).toThrow(expect.objectContaining({ reason: "bad_request", detail: { field: "image", cause: "type" } }))
    expect(() => decodeImage("not*base64!!", "image/jpeg")).toThrow(expect.objectContaining({ detail: { field: "image", cause: "encoding" } }))
    const huge = new Uint8Array(RECEIPT_MAX_IMAGE_BYTES + 3)
    huge.set([0xff, 0xd8, 0xff])
    expect(() => decodeImage(Buffer.from(huge).toString("base64"), "image/jpeg")).toThrow(expect.objectContaining({ status: 413 }))
    const webp = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 "), 1, 2, 3])
    expect(decodeImage(Buffer.from(webp).toString("base64"), "image/webp")).toEqual(webp)
  })
})

describe("body cap", () => {
  const req = (payload: string | ReadableStream, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/api/receipts/read`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: payload,
      // @ts-expect-error undici needs this for a stream body
      duplex: "half",
    })

  it("refuses a declared or streamed body over 2 MB (413), and a non-strict body (400)", async () => {
    await expect(readCappedJson(req("{}", { "content-length": String(RECEIPT_MAX_BODY + 1) }), receiptReadReq)).rejects.toMatchObject({ status: 413 })
    // no content-length: counted while streaming
    const chunk = new Uint8Array(512 * 1024).fill(32)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent > RECEIPT_MAX_BODY + chunk.length) return c.close()
        sent += chunk.length
        c.enqueue(chunk)
      },
    })
    await expect(readCappedJson(req(stream), receiptReadReq)).rejects.toMatchObject({ status: 413, detail: { field: "body", cause: "too_large" } })
    await expect(readCappedJson(req(JSON.stringify({ ...body(), extra: 1 })), receiptReadReq)).rejects.toMatchObject({ reason: "bad_request" })
    await expect(readCappedJson(req(JSON.stringify({ ...body(), mime: "image/gif" })), receiptReadReq)).rejects.toMatchObject({ reason: "bad_request", detail: { field: "mime" } })
    await expect(readCappedJson(req("{nope"), receiptReadReq)).rejects.toMatchObject({ detail: { cause: "json" } })
    expect(await readCappedJson(req(JSON.stringify(body())), receiptReadReq)).toEqual(body())
  })
})

describe("route", () => {
  const post = async (payload: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/receipts/read/route")
    const res = await POST(
      new Request(`${ORIGIN}/api/receipts/read`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
      }),
    )
    return { status: res.status, json: (await res.json()) as Record<string, unknown> }
  }

  it("off without a key (404); same-origin JSON; signed in; members; the MOCK reading end to end", async () => {
    setDbForTests(t.db)
    try {
      expect(await post(body())).toMatchObject({ status: 404, json: { reason: "not_found", detail: { cause: "receipts_off" } } })
      process.env.NEAR_AI_RECEIPTS_MODE = "mock"
      expect((await post(body(), { origin: "https://evil.example" })).json).toMatchObject({ reason: "forbidden_origin" })
      expect((await post(JSON.stringify(body()), { "content-type": "text/plain" })).json).toMatchObject({ reason: "forbidden_origin" })
      expect(await post(body())).toMatchObject({ status: 401, json: { reason: "not_signed_in" } })
      const eve = await signIn(EVE)
      expect(await post(body(), { cookie: eve.cookie })).toMatchObject({ status: 403, json: { reason: "not_a_member" } })
      const maya = await signIn(MAYA)
      expect((await post({ ...body(), extra: true }, { cookie: maya.cookie })).status).toBe(400)
      const ok = await post(body(), { cookie: maya.cookie })
      expect(ok.status).toBe(200)
      expect(ok.json).toMatchObject({ ok: true, source: "mock", proof: null, result: { readable: true, merchant: "Pingo Doce", totalCents: 8420 } })
      expect(JSON.stringify(ok.json)).not.toContain("PHOTO-MARKER")
    } finally {
      setDbForTests(undefined)
    }
  })

  it("/api/health reports features.receipts", async () => {
    const { receiptsEnabled } = await import("./nearai")
    expect(receiptsEnabled({})).toBe(false)
    expect(receiptsEnabled({ NEAR_AI_API_KEY: "k" })).toBe(true)
  })
})
