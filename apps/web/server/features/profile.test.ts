// PATCH /api/me (brand avatars, brand/avatars/README.md) against pot_test: validation (pot-01..pot-10 or null,
// strict body), auth gates, the session and feed profiles carrying the choice, and the DB CHECK as a second guard.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { KeyPair } from "near-api-js"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setDbForTests } from "@/db/client"
import { appUser, pot } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createHubReader } from "../chain/hub"
import type { Config } from "../config"
import { createSession, loadSession } from "../session/store"
import { DAO, HUB } from "../testing/delegates"
import { insertUser, seedChain, testConfig } from "../testing/env"
import { FakeChain } from "../testing/fakeChain"
import { getFeed } from "./feed"

let t: TestDb
let cfg: Config
const ORIGIN = "https://pot.test"
const MAYA = "maya.users.potapp.testnet"
const SAM = "sam.users.potapp.testnet"

beforeAll(async () => {
  t = await createTestDb("profile")
  setDbForTests(t.db)
})
afterAll(async () => {
  setDbForTests(undefined)
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
})

async function cookieFor(account: string, deviceStatus: "active" | "pending" = "active") {
  const { user, device } = await insertUser(t.db, { account, key: KeyPair.fromRandom("ed25519"), deviceStatus })
  const s = await createSession(t.db, { userId: user.id, kind: "near-auth", deviceId: device?.id })
  return { user, cookie: `__Host-pot_session=${s.cookieValue}` }
}

const patch = (body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/me`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

async function call(req: Request) {
  const { PATCH } = await import("@/app/api/me/route")
  const res = await PATCH(req)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { profile?: { avatar: string | null } } }
}

const stored = async (id: string) => (await t.db.select({ a: appUser.avatar }).from(appUser).where(eq(appUser.id, id)))[0]!.a

describe("PATCH /api/me (avatar)", () => {
  it("sets a brand avatar and returns the profile", async () => {
    const { user, cookie } = await cookieFor(MAYA)
    const r = await call(patch({ avatar: "pot-03" }, cookie))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, profile: { displayName: "Maya", avatar: "pot-03", avatarTint: "peach", notifyEmail: true } })
    expect(await stored(user.id)).toBe("pot-03")
  })

  it("null goes back to initials", async () => {
    const { user, cookie } = await cookieFor(MAYA)
    await call(patch({ avatar: "pot-10" }, cookie))
    const r = await call(patch({ avatar: null }, cookie))
    expect(r.status).toBe(200)
    expect(r.body.profile!.avatar).toBeNull()
    expect(await stored(user.id)).toBeNull()
  })

  it.each([["pot-00"], ["pot-11"], ["pot-1"], ["POT-01"], [""], ["../avatars/pot-01"], ["https://evil.example/x.svg"], [3], [true], [{}]])(
    "refuses %j → 400 bad_request, nothing stored",
    async (avatar) => {
      const { user, cookie } = await cookieFor(MAYA)
      const r = await call(patch({ avatar }, cookie))
      expect(r.status).toBe(400)
      expect(r.body).toMatchObject({ ok: false, reason: "bad_request", detail: { field: "avatar" } })
      expect(await stored(user.id)).toBeNull()
    },
  )

  it("refuses unknown fields and an empty body (strict)", async () => {
    const { cookie } = await cookieFor(MAYA)
    expect((await call(patch({ avatar: "pot-01", displayName: "Root" }, cookie))).status).toBe(400)
    expect((await call(patch({}, cookie))).status).toBe(400)
    expect((await call(patch("{nope", cookie))).status).toBe(400)
  })

  it("needs a session, an active device and a same-origin JSON request", async () => {
    expect((await call(patch({ avatar: "pot-01" }))).body).toMatchObject({ reason: "not_signed_in" })
    const pending = await cookieFor(SAM, "pending")
    const r = await call(patch({ avatar: "pot-01" }, pending.cookie))
    expect(r.status).toBe(403)
    expect(r.body).toMatchObject({ reason: "device_not_registered" })
    const { cookie } = await cookieFor(MAYA)
    expect((await call(patch({ avatar: "pot-01" }, cookie, { origin: "https://evil.example" }))).body).toMatchObject({ reason: "forbidden_origin" })
    expect((await call(patch({ avatar: "pot-01" }, cookie, { "content-type": "text/plain" }))).body).toMatchObject({ reason: "forbidden_origin" })
  })

  it("GET /api/session carries the choice (null by default)", async () => {
    const { cookie } = await cookieFor(MAYA)
    const { GET } = await import("@/app/api/session/route")
    const get = async () => ((await (await GET(new Request(`${ORIGIN}/api/session`, { headers: { cookie } }))).json()) as { session: { avatar: string | null } }).session
    expect((await get()).avatar).toBeNull()
    await call(patch({ avatar: "pot-05" }, cookie))
    expect((await get()).avatar).toBe("pot-05")
  })

  it("the DB refuses an unknown id even if a caller skips the schema (app_user_avatar_ck)", async () => {
    const { user } = await cookieFor(MAYA)
    const err = await t.db.execute(sql`update app_user set avatar = 'pot-11' where id = ${user.id}`).then(() => null, (e: unknown) => e as { cause?: { constraint?: string } })
    expect(err?.cause?.constraint).toBe("app_user_avatar_ck")
    await t.db.update(appUser).set({ avatar: "pot-10" }).where(eq(appUser.id, user.id))
    expect(await stored(user.id)).toBe("pot-10")
  })
})

describe("feed profiles carry each member's avatar", () => {
  it("members see name + avatar for every member (null = initials)", async () => {
    const chain = seedChain(new FakeChain())
    chain.view(HUB, "get_members", () => [{ account_id: MAYA, status: "active" }, { account_id: SAM, status: "active" }])
    await t.db.insert(pot).values({ daoId: DAO, slug: "lisbon-trip", hubId: HUB, name: "Lisbon Trip", preset: "trip", creatorAccount: MAYA })
    const maya = await cookieFor(MAYA)
    await cookieFor(SAM)
    await call(patch({ avatar: "pot-07" }, maya.cookie))
    const s = (await loadSession(t.db, new Request(ORIGIN, { headers: { cookie: maya.cookie } }), cfg))!
    const r = await getFeed({ db: t.db, hub: createHubReader(chain, HUB), cfg }, s, DAO, {})
    const profiles = r.body.profiles as Record<string, { name: string; avatar: string | null }>
    expect(profiles[MAYA]).toMatchObject({ name: "Maya", avatar: "pot-07" })
    expect(profiles[SAM]).toMatchObject({ avatar: null })
  })
})
