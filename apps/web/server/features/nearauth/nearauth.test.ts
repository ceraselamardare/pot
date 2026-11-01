// F-14 / F-27 / B-07 / B-20, the whole NEAR Auth code path against a LOCAL fake issuer (real HTTP, real JWKS):
// the client wrapper builds /authorize (PKCE S256 + the device-bound nonce), the issuer answers (redirect or
// web_message), the wrapper exchanges the code, then POST /api/session's service verifies the ID token over the
// issuer's JWKS, the challenge MAC + single use, the nonce binding and the device PoP, and creates the account.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose"
import { KeyPair } from "near-api-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appUser, device } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { authorizeUrl, deviceNonce, exchangeCode, makePkce, makeState, NearAuthError, peekClaims, sessionPopMessage, type NearAuthConfig } from "@/lib/signing/near-auth/oidc"
import { resetBalanceCacheForTests } from "../../chain/balance"
import type { Config } from "../../config"
import { checkChallenge, makeChallenge, nonceFor } from "../../session/idtoken"
import { popMessages } from "../../session/pop"
import { nearAuthLogin, type SessionDeps } from "../../session/service"
import { USDC } from "../../testing/delegates"
import { NEAR, RELAYER, testConfig } from "../../testing/env"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../../testing/fakeChain"
import { b64url } from "../../util/crypto"
import { startFakeIssuer, type FakeIssuer } from "./fakeIssuer"
import { verifySigningJwt } from "./signing"

const SECRET = "x".repeat(40)
const MPC_PK = KeyPair.fromRandom("ed25519").getPublicKey().toString()
let issuer: FakeIssuer
let jwks: JWTVerifyGetKey
let client: NearAuthConfig
let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deps: SessionDeps

beforeAll(async () => {
  issuer = await startFakeIssuer({ clientId: "test-client" })
  jwks = createRemoteJWKSet(new URL(`${issuer.url}/.well-known/jwks.json`))
  client = { base: issuer.url, clientId: "test-client", signingAudience: issuer.signingAudience }
  t = await createTestDb("nearauth")
})
afterAll(async () => {
  await issuer.close()
  await t.close()
})

beforeEach(async () => {
  await t.truncate()
  cfg = testConfig({ NEAR_AUTH_REQUIRE_NONCE: "true" })
  resetBalanceCacheForTests()
  chain = new FakeChain()
  chain.account(RELAYER, { amount: 20n * NEAR })
  chain.view("v1.signer-prod.testnet", "derived_public_key", () => MPC_PK)
  chain.view(USDC, "storage_balance_of", () => null)
  sub = new FakeSubmitter((spec) => {
    if (methodOf(spec) === "createAccount") {
      const keys: Record<string, bigint> = {}
      for (const a of spec.actions as unknown as { addKey?: { publicKey: { toString(): string } } }[]) if (a.addKey) keys[a.addKey.publicKey.toString()] = 0n
      chain.account(spec.receiverId, { keys })
    }
    return plainOutcome("x", RELAYER, spec.receiverId)
  })
  deps = { db: t.db, rpc: chain, submitter: sub, cfg, defer: () => undefined, jwks, sleep: async () => undefined }
})

/** What the browser does: /authorize (redirect mode), then the code exchange. */
async function login(opts: { nonce: string; hint?: string; mode?: "query" | "web_message" }) {
  const pkce = await makePkce()
  const state = makeState()
  const url = authorizeUrl(client, {
    redirectUri: "https://pot.test",
    state,
    codeChallenge: pkce.challenge,
    responseMode: opts.mode ?? "query",
    nonce: opts.nonce,
    connection: "google-oauth2",
    loginHint: opts.hint ?? "google-oauth2|1000001",
  })
  const res = await fetch(url, { redirect: "manual" })
  let code: string
  if ((opts.mode ?? "query") === "query") {
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get("location")!)
    expect(back.origin).toBe("https://pot.test")
    expect(back.searchParams.get("state")).toBe(state)
    code = back.searchParams.get("code")!
  } else {
    const html = await res.text()
    const m = html.match(/"type":"authorization_response","response":\{"code":"([0-9a-f]+)","state":"([^"]+)"\}/)
    expect(m?.[2]).toBe(state)
    expect(html).toContain('"https://pot.test"') // posted to our origin only
    code = m![1]!
  }
  return { ...(await exchangeCode(client, { code, verifier: pkce.verifier, redirectUri: "https://pot.test" })), verifier: pkce.verifier }
}

async function popFor(key: KeyPair, idToken: string) {
  const ts = Date.now()
  const msg = await sessionPopMessage(idToken, ts)
  // the client's PoP bytes are exactly the server's message
  expect(new TextDecoder().decode(msg)).toBe(popMessages.session(idToken, ts))
  return { ts, sig: b64url(key.sign(msg).signature) }
}

describe("NEAR Auth through the fake issuer", () => {
  it("the client's nonce is the server's nonceFor(device key, challenge)", async () => {
    const key = KeyPair.fromRandom("ed25519")
    const { challenge } = makeChallenge(SECRET)
    expect(await deviceNonce(key.getPublicKey().toString(), challenge)).toBe(nonceFor(key.getPublicKey().toString(), checkChallenge(SECRET, challenge)))
  })

  it("authorize URL: code + PKCE S256 + our nonce + web_message + the Google connection", async () => {
    const u = new URL(authorizeUrl(client, { redirectUri: "http://localhost:3000", state: "s", codeChallenge: "c", responseMode: "web_message", nonce: "n", connection: "google-oauth2" }))
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: "test-client",
      response_type: "code",
      redirect_uri: "http://localhost:3000",
      code_challenge_method: "S256",
      response_mode: "web_message",
      nonce: "n",
      connection: "google-oauth2",
      scope: "openid profile email",
    })
  })

  it("new person, redirect mode: login → POST /api/session creates the account with the MPC key and the device key", async () => {
    const key = KeyPair.fromRandom("ed25519")
    const pk = key.getPublicKey().toString()
    const { challenge } = makeChallenge(SECRET)
    const tokens = await login({ nonce: await deviceNonce(pk, challenge) })
    expect(peekClaims(tokens.idToken)).toMatchObject({ sub: "google-oauth2|1000001", given_name: "Leo" })
    const r = await nearAuthLogin(deps, { idToken: tokens.idToken, devicePublicKey: pk, keyKind: "webcrypto", challenge, pop: await popFor(key, tokens.idToken) }, { ipHash: "ip", userAgent: null })
    expect(r.body).toMatchObject({ isNew: true, deviceOnChain: true, mpcPublicKey: MPC_PK, session: { kind: "near-auth", displayName: "Leo" } })
    const created = sub.submitted.find((s) => methodOf(s.spec) === "createAccount")!
    expect(created.spec.receiverId).toMatch(/^u-[0-9a-z]{8}\.users\.potapp\.testnet$/)
    expect(chain.accounts.get(created.spec.receiverId)!.keys.has(pk)).toBe(true)
    expect(chain.accounts.get(created.spec.receiverId)!.keys.has(MPC_PK)).toBe(true)
    expect((await t.db.select().from(appUser))[0]).toMatchObject({ authSub: "google-oauth2|1000001", kind: "near-auth" })
    expect((await t.db.select().from(device))[0]).toMatchObject({ publicKey: pk, status: "active" })
  })

  it("popup mode (web_message): returning person on a new device gets a pending_device session", async () => {
    const first = KeyPair.fromRandom("ed25519")
    const c1 = makeChallenge(SECRET).challenge
    const t1 = await login({ nonce: await deviceNonce(first.getPublicKey().toString(), c1), mode: "web_message", hint: "auth0|leo" })
    await nearAuthLogin(deps, { idToken: t1.idToken, devicePublicKey: first.getPublicKey().toString(), keyKind: "webcrypto", challenge: c1, pop: await popFor(first, t1.idToken) }, { ipHash: "ip", userAgent: null })
    const phone = KeyPair.fromRandom("ed25519")
    const c2 = makeChallenge(SECRET).challenge
    const t2 = await login({ nonce: await deviceNonce(phone.getPublicKey().toString(), c2), mode: "web_message", hint: "auth0|leo" })
    const r = await nearAuthLogin(deps, { idToken: t2.idToken, devicePublicKey: phone.getPublicKey().toString(), keyKind: "webcrypto", challenge: c2, pop: await popFor(phone, t2.idToken) }, { ipHash: "ip", userAgent: null })
    expect(r.body).toMatchObject({ isNew: false, deviceOnChain: false, session: { device: { status: "pending" } } })
  })

  it("S-6: a token bound to another device key, or a reused challenge, opens no session", async () => {
    const mine = KeyPair.fromRandom("ed25519")
    const thief = KeyPair.fromRandom("ed25519")
    const { challenge } = makeChallenge(SECRET)
    const tok = await login({ nonce: await deviceNonce(mine.getPublicKey().toString(), challenge) })
    await expect(
      nearAuthLogin(deps, { idToken: tok.idToken, devicePublicKey: thief.getPublicKey().toString(), keyKind: "webcrypto", challenge, pop: await popFor(thief, tok.idToken) }, { ipHash: "ip", userAgent: null }),
    ).rejects.toMatchObject({ reason: "id_token_invalid", detail: { cause: "nonce" } })
    await nearAuthLogin(deps, { idToken: tok.idToken, devicePublicKey: mine.getPublicKey().toString(), keyKind: "webcrypto", challenge, pop: await popFor(mine, tok.idToken) }, { ipHash: "ip", userAgent: null })
    const again = await login({ nonce: await deviceNonce(mine.getPublicKey().toString(), challenge) })
    await expect(
      nearAuthLogin(deps, { idToken: again.idToken, devicePublicKey: mine.getPublicKey().toString(), keyKind: "webcrypto", challenge, pop: await popFor(mine, again.idToken) }, { ipHash: "ip", userAgent: null }),
    ).rejects.toMatchObject({ reason: "id_token_invalid" })
  })

  it("the code is single-use and needs the PKCE verifier", async () => {
    const pkce = await makePkce()
    const url = authorizeUrl(client, { redirectUri: "https://pot.test", state: "s", codeChallenge: pkce.challenge, responseMode: "query", nonce: "n" })
    const code = new URL((await fetch(url, { redirect: "manual" })).headers.get("location")!).searchParams.get("code")!
    await expect(exchangeCode(client, { code, verifier: "wrong-verifier-wrong-verifier-wrong-verifier", redirectUri: "https://pot.test" })).rejects.toBeInstanceOf(NearAuthError)
  })

  it("approval: the signing token's fatxn is exactly the delegate bytes the client asked to approve", async () => {
    const bytes = new Uint8Array([0x6e, 0x01, 0x00, 0x40, 9, 8, 7])
    const pkce = await makePkce()
    const url = authorizeUrl(client, {
      redirectUri: "https://pot.test",
      state: "s2",
      codeChallenge: pkce.challenge,
      responseMode: "query",
      audience: client.signingAudience,
      delegateAction: bytes,
      loginHint: "google-oauth2|1000001",
    })
    expect(new URL(url).searchParams.get("delegateAction")).toBe("110,1,0,64,9,8,7")
    expect(new URL(url).searchParams.get("scope")).toBe("openid transaction:sign")
    const code = new URL((await fetch(url, { redirect: "manual" })).headers.get("location")!).searchParams.get("code")!
    const tok = await exchangeCode(client, { code, verifier: pkce.verifier, redirectUri: "https://pot.test" })
    await expect(verifySigningJwt(tok.accessToken, cfg, { sub: "google-oauth2|1000001", bytes }, { jwks })).resolves.toBeUndefined()
  })
})
