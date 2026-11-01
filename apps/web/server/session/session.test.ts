// B-07 / B-04 / B-20: NEAR Auth sessions with a locally generated JWKS and fake tokens (A-07, A-08, A-21, A-25),
// device-key PoP and used_proof, the onboarding lease, the MPC-derived key, pending_device sessions.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appUser, device, relayLog, session, usedProof } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../chain/balance"
import type { Config } from "../config"
import { ApiError } from "../http/errors"
import { NEAR, RELAYER, testConfig } from "../testing/env"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../testing/fakeChain"
import { USDC } from "../testing/delegates"
import { b64url, sha256Hex } from "../util/crypto"
import { checkChallenge, makeChallenge, nonceFor, SUB_RE, verifyIdToken } from "./idtoken"
import { popMessages } from "./pop"
import { deviceLogin, logout, nearAuthLogin, type SessionDeps } from "./service"
import { loadSession, requireSession } from "./store"

let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deps: SessionDeps
let jwks: JWTVerifyGetKey
let signKey: CryptoKey
let otherKey: CryptoKey
const ISSUER = "https://login.testnet.fast-auth.com/"
const MPC_PK = KeyPair.fromRandom("ed25519").getPublicKey().toString()

beforeAll(async () => {
  t = await createTestDb("session")
  const kp = await generateKeyPair("RS256")
  const other = await generateKeyPair("RS256")
  signKey = kp.privateKey as CryptoKey
  otherKey = other.privateKey as CryptoKey
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256" }
  jwks = createLocalJWKSet({ keys: [jwk] })
})
afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
  resetBalanceCacheForTests()
  chain = new FakeChain()
  chain.account(RELAYER, { amount: 20n * NEAR })
  chain.view("v1.signer-prod.testnet", "derived_public_key", (a) => {
    expect(a).toMatchObject({ predecessor: "fast-auth.testnet", domain_id: 1 })
    expect(String(a.path)).toMatch(/^jwt#https:\/\/login\.testnet\.fast-auth\.com\/#(google-oauth2|auth0)\|/)
    return MPC_PK
  })
  chain.view(USDC, "storage_balance_of", () => null)
  sub = new FakeSubmitter((spec) => {
    const m = methodOf(spec)
    if (m === "createAccount") {
      const keys: Record<string, bigint> = {}
      for (const a of spec.actions as unknown as { addKey?: { publicKey: { toString(): string } } }[])
        if (a.addKey) keys[a.addKey.publicKey.toString()] = 0n
      chain.account(spec.receiverId, { keys })
    }
    return plainOutcome("x", RELAYER, spec.receiverId)
  })
  deps = { db: t.db, rpc: chain, submitter: sub, cfg, defer: () => undefined, jwks, sleep: async () => undefined }
})

async function idToken(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; alg?: string; iat?: number } = {}) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email: "maya@example.com", email_verified: true, given_name: "Maya", ...claims })
    .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience("test-client")
    .setSubject((claims.sub as string) ?? "google-oauth2|1234567890")
    .setIssuedAt(opts.iat ?? now)
    .setExpirationTime((opts.iat ?? now) + 600)
    .sign(opts.key ?? signKey)
}

function pop(key: KeyPair, message: string, ts = Date.now()) {
  return { ts, sig: b64url(key.sign(new TextEncoder().encode(message)).signature) }
}

async function login(over: { token?: string; key?: KeyPair; challenge?: string; ts?: number } = {}) {
  const key = over.key ?? KeyPair.fromRandom("ed25519")
  const token = over.token ?? (await idToken())
  const ts = over.ts ?? Date.now()
  return {
    key,
    res: await nearAuthLogin(
      deps,
      {
        idToken: token,
        devicePublicKey: key.getPublicKey().toString(),
        keyKind: "webcrypto",
        pop: pop(key, popMessages.session(token, ts), ts),
        ...(over.challenge ? { challenge: over.challenge } : {}),
      },
      { ipHash: "ip1", userAgent: "vitest" },
    ),
  }
}

const cookieOf = (cookies: string[]) => cookies[0]!.split(";")[0]!
const reqWith = (cookie: string) => new Request("https://pot.test/api/x", { headers: { cookie } })

describe("ID token verification (A-07)", () => {
  it("accepts an RS256 token from the issuer for our client", async () => {
    const c = await verifyIdToken(await idToken(), cfg, { jwks })
    expect(c).toMatchObject({ sub: "google-oauth2|1234567890", emailVerified: true, givenName: "Maya" })
  })

  it.each([
    ["wrong issuer", async () => new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer("https://evil/").setAudience("test-client").setSubject("auth0|x").setIssuedAt().setExpirationTime("5m").sign(signKey)],
    ["wrong audience", async () => new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISSUER).setAudience("np8paqIpMWmNbzT4xAvOOapZBjsOpptl").setSubject("auth0|x").setIssuedAt().setExpirationTime("5m").sign(signKey)],
    ["another signing key", () => idToken({}, { key: otherKey })],
    ["expired", async () => new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(ISSUER).setAudience("test-client").setSubject("auth0|x").setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(signKey)],
    ["iat older than 10 min", () => idToken({}, { iat: Math.floor(Date.now() / 1000) - 11 * 60 - 61 })],
    ["alg none", async () => `${b64url(new TextEncoder().encode(JSON.stringify({ alg: "none" })))}.${b64url(new TextEncoder().encode(JSON.stringify({ iss: ISSUER, aud: "test-client", sub: "auth0|x", exp: 9e9 })))}.`],
    ["HS256", async () => new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience("test-client").setSubject("auth0|x").setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("x".repeat(32)))],
    ["a foreign azp", () => idToken({ azp: "someone-else" })],
    ["a sub with a #", () => idToken({ sub: "google-oauth2|12#34" })],
    ["an unknown connection", () => idToken({ sub: "github|1234" })],
  ])("%s → id_token_invalid", async (_n, make) => {
    await expect(verifyIdToken(await make(), cfg, { jwks })).rejects.toMatchObject({ reason: "id_token_invalid" })
  })

  it("JWKS unreachable → auth_unavailable", async () => {
    const down: JWTVerifyGetKey = async () => {
      throw new TypeError("fetch failed")
    }
    await expect(verifyIdToken(await idToken(), cfg, { jwks: down })).rejects.toMatchObject({ reason: "auth_unavailable" })
  })

  it("SUB_RE", () => {
    expect(SUB_RE.test("google-oauth2|1234")).toBe(true)
    expect(SUB_RE.test("auth0|abcd")).toBe(true)
    expect(SUB_RE.test("auth0|a b")).toBe(false)
  })
})

describe("POST /api/session (B-07)", () => {
  it("first login: derives the MPC key, creates u-<8> with the MPC + device keys, registers, opens a session", async () => {
    const { key, res } = await login()
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ isNew: true, deviceOnChain: true, usdcRegistered: true, mpcPublicKey: MPC_PK })
    const account = String(res.body.accountId)
    expect(account).toMatch(new RegExp(`^u-[0-9a-hjkmnp-tv-z]{8}\\.${RELAYER.replaceAll(".", "\\.")}$`))
    const create = sub.submitted.find((s) => methodOf(s.spec) === "createAccount")!
    expect(create.spec).toMatchObject({ signerId: RELAYER, receiverId: account })
    expect(create.spec.actions).toHaveLength(3) // CreateAccount, AddKey(mpc), AddKey(device)
    const reg = sub.submitted.find((s) => methodOf(s.spec) === "storage_deposit")!
    expect(reg.spec.receiverId).toBe(USDC)
    const rows = await t.db.select().from(relayLog)
    expect(rows.map((r) => r.idempotencyKey).sort()).toEqual([`create:${account}`, `register:${account}`])
    const user = (await t.db.select().from(appUser))[0]!
    expect(user).toMatchObject({ kind: "near-auth", authSub: "google-oauth2|1234567890", onboardState: "ready", displayName: "Maya", emailVerified: true })
    expect(user.emailHash).toBe(sha256Hex("maya@example.com"))
    expect(res.cookies[0]).toMatch(/^__Host-pot_session=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/)
    expect(res.cookies[1]).toMatch(/^pot_hint=/)
    expect(res.cookies[1]).not.toContain("HttpOnly")
    const s = (await loadSession(t.db, reqWith(cookieOf(res.cookies)), cfg))!
    expect(s).toMatchObject({ kind: "near-auth", pendingDevice: false })
    expect(s.device?.publicKey).toBe(key.getPublicKey().toString())
    // the DB keeps only sha256(cookie)
    const stored = (await t.db.select().from(session))[0]!
    expect(stored.idHash).toBe(sha256Hex(cookieOf(res.cookies).split("=")[1]!))
  })

  it("returning user on a known device: no tx, ≤ one indexed read path (P-1 b)", async () => {
    const { key, res } = await login()
    chain.account(String(res.body.accountId), { keys: { [key.getPublicKey().toString()]: 0n, [MPC_PK]: 0n } })
    const before = sub.submitted.length
    const again = await login({ key })
    expect(again.res.body).toMatchObject({ isNew: false, deviceOnChain: true })
    expect(sub.submitted.length).toBe(before)
  })

  it("returning user on a new device → deviceOnChain false and a pending_device session (rev4 M-1)", async () => {
    const first = await login()
    chain.account(String(first.res.body.accountId), { keys: { [MPC_PK]: 0n } })
    const { res } = await login()
    expect(res.body).toMatchObject({ isNew: false, deviceOnChain: false })
    const s = (await loadSession(t.db, reqWith(cookieOf(res.cookies)), cfg))!
    expect(s.pendingDevice).toBe(true)
    await expect(requireSession(t.db, reqWith(cookieOf(res.cookies)), cfg, { activeDevice: true })).rejects.toMatchObject({
      reason: "device_not_registered",
      status: 403,
    })
  })

  it("replaying an identical body → device_proof_invalid (P-1 c)", async () => {
    const key = KeyPair.fromRandom("ed25519")
    const token = await idToken()
    const ts = Date.now()
    const body = { idToken: token, devicePublicKey: key.getPublicKey().toString(), keyKind: "fallback" as const, pop: pop(key, popMessages.session(token, ts), ts) }
    await nearAuthLogin(deps, body, { ipHash: "ip", userAgent: null })
    await expect(nearAuthLogin(deps, body, { ipHash: "ip", userAgent: null })).rejects.toMatchObject({ reason: "device_proof_invalid" })
  })

  it("PoP outside ±120 s or by another key → device_proof_invalid", async () => {
    await expect(login({ ts: Date.now() - 121_000 })).rejects.toMatchObject({ reason: "device_proof_invalid" })
    const key = KeyPair.fromRandom("ed25519")
    const token = await idToken()
    const ts = Date.now()
    await expect(
      nearAuthLogin(deps, { idToken: token, devicePublicKey: key.getPublicKey().toString(), keyKind: "fallback", pop: pop(KeyPair.fromRandom("ed25519"), popMessages.session(token, ts), ts) }, { ipHash: "ip", userAgent: null }),
    ).rejects.toMatchObject({ reason: "device_proof_invalid" })
  })

  it("two concurrent first logins for one sub → one account; the other waits or gets onboarding_in_progress", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const script = sub.script
    sub.script = async (spec, o, n) => {
      if (methodOf(spec) === "createAccount") await gate
      return script(spec, o, n)
    }
    deps.sleep = async () => {
      release()
      await new Promise((r) => setTimeout(r, 20))
    }
    const [a, b] = await Promise.allSettled([login(), login()])
    const ok = [a, b].filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof login>>>[]
    expect(ok.length).toBeGreaterThanOrEqual(1)
    for (const x of [a, b]) if (x.status === "rejected") expect((x.reason as ApiError).reason).toBe("onboarding_in_progress")
    expect(await t.db.select().from(appUser)).toHaveLength(1)
    expect(sub.submitted.filter((s) => methodOf(s.spec) === "createAccount")).toHaveLength(1)
    expect(new Set(ok.map((o) => o.value.res.body.accountId)).size).toBe(1)
  })

  it("a failed creation marks onboarding failed; Try again resumes from chain state", async () => {
    const script = sub.script
    sub.script = (spec, o, n) =>
      methodOf(spec) === "createAccount"
        ? plainOutcome("x", RELAYER, spec.receiverId, { Failure: { ActionError: { index: 0, kind: { AccountAlreadyExists: {} } } } })
        : script(spec, o, n)
    await expect(login()).rejects.toMatchObject({ reason: "account_setup_failed" })
    expect((await t.db.select().from(appUser))[0]!.onboardState).toBe("failed")
    sub.script = script
    const { res } = await login()
    expect(res.body).toMatchObject({ isNew: true })
    expect((await t.db.select().from(appUser))[0]!.onboardState).toBe("ready")
  })

  it("new accounts are capped per IP per day (family accounts)", async () => {
    process.env.QUOTA_IP_ACCOUNTS_CREATED = "1"
    await login({ token: await idToken({ sub: "auth0|one" }) })
    await expect(login({ token: await idToken({ sub: "auth0|two" }) })).rejects.toMatchObject({ reason: "quota_exceeded", detail: { family: "accounts" } })
    delete process.env.QUOTA_IP_ACCOUNTS_CREATED
  })

  it("BotID on new accounts → bot_detected, nothing created", async () => {
    deps.isBot = async () => true
    await expect(login()).rejects.toMatchObject({ reason: "bot_detected" })
    expect(sub.submitted).toHaveLength(0)
  })

  it("display name: explicit, then given_name, never the email; reserved names refused", async () => {
    const r = await login({ token: await idToken({ sub: "auth0|n1", given_name: undefined, name: undefined }) })
    expect((r.res.body.session as { displayName: string }).displayName).toBe("Friend")
    const key = KeyPair.fromRandom("ed25519")
    const token = await idToken({ sub: "auth0|n2" })
    const ts = Date.now()
    await expect(
      nearAuthLogin(deps, { idToken: token, devicePublicKey: key.getPublicKey().toString(), keyKind: "fallback", pop: pop(key, popMessages.session(token, ts), ts), displayName: "Admin" }, { ipHash: "ip", userAgent: null }),
    ).rejects.toMatchObject({ reason: "bad_request", detail: { field: "displayName" } })
    // bidi overrides are refused too (U-11)
    const key2 = KeyPair.fromRandom("ed25519")
    const token2 = await idToken({ sub: "auth0|n3" })
    await expect(
      nearAuthLogin(deps, { idToken: token2, devicePublicKey: key2.getPublicKey().toString(), keyKind: "fallback", pop: pop(key2, popMessages.session(token2, ts), ts), displayName: "Le\u202Eo" }, { ipHash: "ip", userAgent: null }),
    ).rejects.toMatchObject({ reason: "bad_request", detail: { field: "displayName" } })
  })

  it("relayer below critical → sponsor_low, no account (a new person needs an account creation)", async () => {
    chain.accounts.get(RELAYER)!.amount = NEAR
    await expect(login()).rejects.toMatchObject({ reason: "service_unavailable", detail: { cause: "sponsor_low" } })
    expect(sub.submitted.filter((x) => methodOf(x.spec) === "createAccount")).toHaveLength(0)
  })
})

describe("device-bound nonce (B-20, A-25)", () => {
  const secret = "x".repeat(40)

  it("accepts a token whose nonce = b64url(sha256(rawPk ‖ challenge)) and spends the challenge", async () => {
    const key = KeyPair.fromRandom("ed25519")
    const { challenge } = makeChallenge(secret)
    const nonce = nonceFor(key.getPublicKey().toString(), checkChallenge(secret, challenge))
    const { res } = await login({ key, challenge, token: await idToken({ nonce }) })
    expect(res.status).toBe(200)
    const proofs = await t.db.select().from(usedProof).where(eq(usedProof.purpose, "auth_challenge"))
    expect(proofs).toHaveLength(1)
  })

  it("a token minted for device A replayed with device B → id_token_invalid (cause nonce)", async () => {
    const a = KeyPair.fromRandom("ed25519")
    const { challenge } = makeChallenge(secret)
    const nonce = nonceFor(a.getPublicKey().toString(), checkChallenge(secret, challenge))
    await expect(login({ challenge, token: await idToken({ nonce }) })).rejects.toMatchObject({
      reason: "id_token_invalid",
      detail: { cause: "nonce" },
    })
  })

  it("a reused, stale or forged challenge → id_token_invalid", async () => {
    const key = KeyPair.fromRandom("ed25519")
    const { challenge } = makeChallenge(secret)
    const nonce = nonceFor(key.getPublicKey().toString(), checkChallenge(secret, challenge))
    await login({ key, challenge, token: await idToken({ nonce }) })
    await expect(login({ key, challenge, token: await idToken({ nonce }) })).rejects.toMatchObject({ reason: "id_token_invalid" })
    const old = makeChallenge(secret, Date.now() - 11 * 60_000).challenge
    expect(() => checkChallenge(secret, old)).toThrow(ApiError)
    expect(() => checkChallenge("y".repeat(40), makeChallenge(secret).challenge)).toThrow(ApiError)
  })

  it("production requires the challenge", async () => {
    cfg = testConfig({ VERCEL_ENV: "production" })
    deps.cfg = cfg
    await expect(login()).rejects.toMatchObject({ reason: "id_token_invalid", detail: { cause: "nonce" } })
  })
})

describe("POST /api/session/device (K-2, A-08)", () => {
  async function setup() {
    const { key, res } = await login()
    const account = String(res.body.accountId)
    chain.account(account, { keys: { [key.getPublicKey().toString()]: 0n, [MPC_PK]: 0n } })
    return { key, account }
  }
  const relogin = (key: KeyPair, account: string, ts = Date.now()) =>
    deviceLogin(deps, { accountId: account, devicePublicKey: key.getPublicKey().toString(), pop: pop(key, popMessages.device_login(account, ts), ts) }, { userAgent: null })

  it("restores a session with no popup", async () => {
    const { key, account } = await setup()
    const r = await relogin(key, account)
    expect(r.body.session).toMatchObject({ kind: "near-auth", accountId: account })
  })

  it("key gone on chain → device_not_registered and the device is revoked", async () => {
    const { key, account } = await setup()
    chain.accounts.get(account)!.keys.delete(key.getPublicKey().toString())
    await expect(relogin(key, account)).rejects.toMatchObject({ reason: "device_not_registered" })
    expect((await t.db.select().from(device))[0]!.status).toBe("revoked")
    await expect(relogin(key, account, Date.now() + 1)).rejects.toMatchObject({ reason: "device_revoked" })
  })

  it("a wallet user can't device-relogin (only NEAR Auth accounts hold Pot device keys)", async () => {
    const key = KeyPair.fromRandom("ed25519")
    const [u] = await t.db.insert(appUser).values({ kind: "wallet", nearAccount: "alice.testnet", displayName: "Alice", avatarTint: "peach" }).returning()
    await t.db.insert(device).values({ userId: u!.id, publicKey: key.getPublicKey().toString(), keyKind: "fallback", status: "active" })
    chain.account("alice.testnet", { keys: { [key.getPublicKey().toString()]: 0n } })
    await expect(relogin(key, "alice.testnet")).rejects.toMatchObject({ reason: "device_not_registered" })
  })

  it("unknown device → device_not_registered", async () => {
    const { account } = await setup()
    await expect(relogin(KeyPair.fromRandom("ed25519"), account)).rejects.toMatchObject({ reason: "device_not_registered" })
  })

  it("logout revokes the session; forgetDevice revokes the device", async () => {
    const { key, account } = await setup()
    const r = await relogin(key, account)
    const req = reqWith(cookieOf(r.cookies))
    const s = (await loadSession(t.db, req, cfg))!
    const cookies = await logout(t.db, cfg, s, { forgetDevice: true })
    expect(cookies.some((c) => c.startsWith("__Host-pot_session=;") && c.includes("Max-Age=0"))).toBe(true)
    expect(await loadSession(t.db, req, cfg)).toBeNull()
    await expect(relogin(key, account, Date.now() + 2)).rejects.toMatchObject({ reason: "device_revoked" })
  })
})
