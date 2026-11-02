// POST/GET /api/me/survey ("Help us make Pot better", first-run onboarding) against pot_test: enum-only strict
// validation, auth gates (session, active device, same origin), one row per person (upsert), the per-minute rate
// limit, nobody else's row, and the DB CHECKs as a second guard.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { KeyPair } from "near-api-js"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { appUser, userSurvey } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createSession } from "../session/store"
import { insertUser, testConfig } from "../testing/env"
import { appVersion } from "./survey"

let t: TestDb
const ORIGIN = "https://pot.test"
const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"

beforeAll(async () => {
  t = await createTestDb("survey")
  setDbForTests(t.db)
})
afterAll(async () => {
  setDbForTests(undefined)
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  testConfig()
})

async function cookieFor(account: string, deviceStatus: "active" | "pending" = "active") {
  const { user, device } = await insertUser(t.db, { account, key: KeyPair.fromRandom("ed25519"), deviceStatus })
  const s = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  return { user, cookie: `__Host-pot_session=${s.cookieValue}` }
}

const post = (body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/me/survey`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

type Body = Record<string, unknown> & { survey?: { version: number; answers: Record<string, unknown>; context: string | null } | null }

async function send(req: Request) {
  const { POST } = await import("@/app/api/me/survey/route")
  const res = await POST(req)
  return { status: res.status, body: (await res.json()) as Body }
}
async function get(cookie?: string) {
  const { GET } = await import("@/app/api/me/survey/route")
  const res = await GET(new Request(`${ORIGIN}/api/me/survey`, { headers: cookie ? { cookie } : {} }))
  return { status: res.status, body: (await res.json()) as Body }
}
const rows = async (userId: string) => t.db.select().from(userSurvey).where(eq(userSurvey.userId, userId))

const GOOD = { version: 1, answers: { use: ["trip", "club"], today: "fronts", heard: "friend" }, context: "created" }

describe("POST /api/me/survey", () => {
  it("saves the person's answers and returns them", async () => {
    const { user, cookie } = await cookieFor(MAYA)
    const r = await send(post(GOOD, cookie))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, survey: { version: 1, answers: GOOD.answers, context: "created" } })
    const [row] = await rows(user.id)
    expect(row).toMatchObject({ version: 1, context: "created", answers: { use: ["trip", "club"], today: "fronts", heard: "friend" } })
  })

  it("stores `use` in a canonical order, and partial answers are fine", async () => {
    const { user, cookie } = await cookieFor(MAYA)
    const r = await send(post({ version: 1, answers: { use: ["other", "trip"] } }, cookie))
    expect(r.status).toBe(200)
    expect((await rows(user.id))[0]!.answers).toEqual({ use: ["trip", "other"] })
    expect(r.body.survey!.context).toBeNull()
  })

  it("one row per person: a second send replaces the first (upsert)", async () => {
    const { user, cookie } = await cookieFor(MAYA)
    await send(post(GOOD, cookie))
    const r = await send(post({ version: 1, answers: { today: "cash" }, context: "other" }, cookie))
    expect(r.status).toBe(200)
    const all = await rows(user.id)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ answers: { today: "cash" }, context: "other" })
    expect(all[0]!.updatedAt.getTime()).toBeGreaterThanOrEqual(all[0]!.createdAt.getTime())
  })

  it.each([
    ["free text", { version: 1, answers: { use: ["a road trip to Porto"] } }],
    ["an unknown option", { version: 1, answers: { today: "venmo" } }],
    ["a repeated option", { version: 1, answers: { use: ["trip", "trip"] } }],
    ["an empty set", { version: 1, answers: { use: [] } }],
    ["no answers at all", { version: 1, answers: {} }],
    ["an unknown question", { version: 1, answers: { age: "30-39" } }],
    ["an unknown field", { ...GOOD, email: "maya@example.com" }],
    ["another version", { ...GOOD, version: 2 }],
    ["an unknown context", { ...GOOD, context: "admin" }],
    ["a single answer as a list", { version: 1, answers: { today: ["cash"] } }],
  ])("refuses %s → 400, nothing stored", async (_, body) => {
    const { user, cookie } = await cookieFor(MAYA)
    const r = await send(post(body, cookie))
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ ok: false, reason: "bad_request" })
    expect(await rows(user.id)).toHaveLength(0)
  })

  it("refuses a body that isn't JSON", async () => {
    const { cookie } = await cookieFor(MAYA)
    expect((await send(post("{nope", cookie))).status).toBe(400)
  })

  it("needs a session, an active device and a same-origin JSON request", async () => {
    expect((await send(post(GOOD))).body).toMatchObject({ reason: "not_signed_in" })
    const pending = await cookieFor(SAM, "pending")
    const r = await send(post(GOOD, pending.cookie))
    expect(r.status).toBe(403)
    expect(r.body).toMatchObject({ reason: "device_not_registered" })
    const { cookie } = await cookieFor(MAYA)
    expect((await send(post(GOOD, cookie, { origin: "https://evil.example" }))).body).toMatchObject({ reason: "forbidden_origin" })
    expect((await send(post(GOOD, cookie, { "content-type": "text/plain" }))).body).toMatchObject({ reason: "forbidden_origin" })
  })

  it("rate-limits bursts: 5 a minute per person, then 429", async () => {
    const { cookie } = await cookieFor(MAYA)
    for (let i = 0; i < 5; i++) expect((await send(post(GOOD, cookie))).status).toBe(200)
    const r = await send(post(GOOD, cookie))
    expect(r.status).toBe(429)
    expect(r.body).toMatchObject({ reason: "rate_limited" })
    // another person isn't affected
    const sam = await cookieFor(SAM)
    expect((await send(post(GOOD, sam.cookie))).status).toBe(200)
  })
})

describe("GET /api/me/survey", () => {
  it("returns only the person's own answers (null before any)", async () => {
    const maya = await cookieFor(MAYA)
    const sam = await cookieFor(SAM)
    expect((await get(sam.cookie)).body).toMatchObject({ ok: true, survey: null })
    await send(post(GOOD, maya.cookie))
    expect((await get(maya.cookie)).body.survey).toMatchObject({ answers: GOOD.answers })
    expect((await get(sam.cookie)).body.survey).toBeNull()
  })

  it("needs a session; private, never cached", async () => {
    expect((await get()).body).toMatchObject({ reason: "not_signed_in" })
    const { cookie } = await cookieFor(MAYA)
    const { GET } = await import("@/app/api/me/survey/route")
    const res = await GET(new Request(`${ORIGIN}/api/me/survey`, { headers: { cookie } }))
    expect(res.headers.get("cache-control")).toBe("private, no-store")
  })
})

describe("storage", () => {
  it("is deleted with the person (cascade)", async () => {
    const { user, cookie } = await cookieFor(MAYA)
    await send(post(GOOD, cookie))
    await t.db.execute(sql`delete from session where user_id = ${user.id}`)
    await t.db.execute(sql`delete from device where user_id = ${user.id}`)
    await t.db.delete(appUser).where(eq(appUser.id, user.id))
    expect(await rows(user.id)).toHaveLength(0)
  })

  it("the DB refuses a non-object or an oversized answers blob even if a caller skips the schema", async () => {
    const { user } = await cookieFor(MAYA)
    const fail = (q: ReturnType<typeof sql>) => t.db.execute(q).then(() => null, (e: unknown) => (e as { cause?: { constraint?: string } }).cause?.constraint)
    expect(await fail(sql`insert into user_survey (user_id, version, answers) values (${user.id}, 1, '[]'::jsonb)`)).toBe("user_survey_answers_ck")
    const big = JSON.stringify({ x: "y".repeat(2100) })
    expect(await fail(sql`insert into user_survey (user_id, version, answers) values (${user.id}, 1, ${big}::jsonb)`)).toBe("user_survey_answers_ck")
    expect(await fail(sql`insert into user_survey (user_id, version, answers, context) values (${user.id}, 1, '{}'::jsonb, 'admin')`)).toBe("user_survey_context_ck")
  })

  it("app version: the deploy's short commit, else null", () => {
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: "576518b1234567890abcdef" })).toBe("576518b12345")
    expect(appVersion({})).toBeNull()
  })
})
