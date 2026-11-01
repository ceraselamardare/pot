// B-13: "Confirm it's you" on the server. The NEAR Auth signing token comes from the local fake issuer; the MPC is
// a local key that signs sha256(NEP-461 ‖ DelegateAction) like `fast-auth.sign` would; the chain is faked.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { createLocalJWKSet, type JWTVerifyGetKey } from "jose"
import { buildDelegateAction, encodeDelegateAction, KeyPair, PublicKey, actions, type DelegateAction } from "near-api-js"
import { sha256 } from "@noble/hashes/sha2.js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { device, relayLog, session } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../../chain/balance"
import type { Config } from "../../config"
import type { SessionCtx } from "../../session/store"
import { HEAD, FakeChain, FakeSubmitter, methodOf, plainOutcome, valueOf } from "../../testing/fakeChain"
import { insertUser, NEAR, RELAYER, testConfig } from "../../testing/env"
import { b64url } from "../../util/crypto"
import { startFakeIssuer, type FakeIssuer } from "../nearauth/fakeIssuer"
import { guardIdOf, verifySigningJwt } from "../nearauth/signing"
import { addDevice, decodeSignPayload, mpcSignature, type DevicesBody, type DevicesDeps } from "./service"

const ACCOUNT = "u-newphone.users.potapp.testnet"
const SUB = "google-oauth2|10987654321"
let t: TestDb
let issuer: FakeIssuer
let jwks: JWTVerifyGetKey
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deps: DevicesDeps
let mpc: KeyPair
let me: SessionCtx
let mpcResult: "ok" | "null"

beforeAll(async () => {
  t = await createTestDb("devices")
  issuer = await startFakeIssuer({ clientId: "test-client" })
  jwks = createLocalJWKSet({ keys: [issuer.jwk] })
})
afterAll(async () => {
  await issuer.close()
  await t.close()
})

beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
  resetBalanceCacheForTests()
  mpc = KeyPair.fromRandom("ed25519")
  mpcResult = "ok"
  chain = new FakeChain()
  chain.account(RELAYER, { amount: 20n * NEAR })
  chain.account(ACCOUNT, { keys: { [mpc.getPublicKey().toString()]: 10n } })
  chain.view("v1.signer-prod.testnet", "derived_public_key", (a) => (String(a.path).endsWith(`#${SUB}`) ? mpc.getPublicKey().toString() : "ed25519:other"))
  sub = new FakeSubmitter((spec) => {
    const m = methodOf(spec)
    if (m === "sign") {
      const args = JSON.parse(new TextDecoder().decode((spec.actions[0] as unknown as { functionCall: { args: Uint8Array } }).functionCall.args))
      if (mpcResult === "null") return plainOutcome("x", RELAYER, spec.receiverId, valueOf(null))
      const sig = mpc.sign(sha256(new Uint8Array(args.sign_payload))).signature
      const o = plainOutcome("x", RELAYER, spec.receiverId, valueOf({ scheme: "Ed25519", signature: [...sig] }))
      return { ...o, status: { SuccessValue: Buffer.from(JSON.stringify({ scheme: "Ed25519", signature: [...sig] })).toString("base64") } }
    }
    if (m === "delegate") {
      const sd = (spec.actions[0] as unknown as { signedDelegate: { delegateAction: DelegateAction } }).signedDelegate
      const add = sd.delegateAction.actions[0] as unknown as { addKey: { publicKey: { toString(): string } } }
      chain.accounts.get(ACCOUNT)!.keys.set(add.addKey.publicKey.toString(), { nonce: 0n, permission: "FullAccess" })
      return plainOutcome("x", RELAYER, ACCOUNT)
    }
    return new Error(`unexpected ${m}`)
  })
  deps = { db: t.db, rpc: chain, submitter: sub, cfg, jwks, sleep: async () => undefined }
  const { user } = await insertUser(t.db, { account: ACCOUNT, kind: "near-auth" })
  const [u] = await t.db.update((await import("@/db/schema")).appUser).set({ authSub: SUB, mpcPublicKey: mpc.getPublicKey().toString() }).returning()
  await t.db.insert(session).values({ idHash: "sess1", userId: user.id, kind: "near-auth", expiresAt: new Date(Date.now() + 86_400_000), idleExpiresAt: new Date(Date.now() + 86_400_000) })
  me = { idHash: "sess1", kind: "near-auth", expiresAt: new Date(Date.now() + 86_400_000), user: u!, device: null, pendingDevice: true, visitorHash: null, demo: null }
})

function delegateBytes(o: { newPk: string; signer?: string; sender?: string; nonce?: bigint; mbh?: bigint; extra?: boolean }): Uint8Array {
  const acts = [actions.addFullAccessKey(PublicKey.from(o.newPk))]
  if (o.extra) acts.push(actions.transfer(1n))
  const da = buildDelegateAction({
    senderId: o.sender ?? ACCOUNT,
    receiverId: o.sender ?? ACCOUNT,
    actions: acts,
    nonce: o.nonce ?? 11n,
    maxBlockHeight: o.mbh ?? BigInt(HEAD + 300),
    publicKey: PublicKey.from(o.signer ?? mpc.getPublicKey().toString()),
  })
  return encodeDelegateAction(da)
}

async function body(o: { bytes?: Uint8Array; tokenBytes?: Uint8Array; sub?: string; expSec?: number; newKey?: KeyPair; scope?: string } = {}): Promise<DevicesBody> {
  const newKey = o.newKey ?? KeyPair.fromRandom("ed25519")
  const bytes = o.bytes ?? delegateBytes({ newPk: newKey.getPublicKey().toString() })
  const jwt = await issuer.sign(
    { sub: o.sub ?? SUB, azp: "test-client", scope: o.scope ?? "openid transaction:sign", fatxn: [...(o.tokenBytes ?? bytes)] },
    { expSec: o.expSec ?? 60, aud: [issuer.signingAudience, `${issuer.issuer}userinfo`] },
  )
  const ts = Date.now()
  const sig = newKey.sign(new TextEncoder().encode(`pot-device-add-v1|${ACCOUNT}|${ts}`)).signature
  return {
    guardId: guardIdOf(cfg),
    verifyPayload: jwt,
    signPayload: Buffer.from(bytes).toString("base64"),
    devicePublicKey: newKey.getPublicKey().toString(),
    keyKind: "webcrypto",
    pop: { ts, sig: b64url(sig) },
    idempotencyKey: `000000000000${String(Math.floor(Math.random() * 9000) + 1000)}`,
  }
}

describe("signing JWT", () => {
  it("binds sub, scope, audience, azp, fatxn and ≥ 15 s of life", async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const ok = await issuer.sign({ sub: SUB, azp: "test-client", scope: "openid transaction:sign", fatxn: [1, 2, 3] }, { expSec: 60, aud: issuer.signingAudience })
    await expect(verifySigningJwt(ok, cfg, { sub: SUB, bytes }, { jwks })).resolves.toBeUndefined()
    await expect(verifySigningJwt(ok, cfg, { sub: "auth0|x", bytes }, { jwks })).rejects.toMatchObject({ reason: "near_auth_token_invalid", detail: { cause: "sub" } })
    await expect(verifySigningJwt(ok, cfg, { sub: SUB, bytes: new Uint8Array([1, 2, 4]) }, { jwks })).rejects.toMatchObject({ reason: "payload_mismatch" })
    await expect(verifySigningJwt(ok, cfg, { sub: SUB, bytes }, { jwks, nowMs: Date.now() + 50_000 })).rejects.toMatchObject({ reason: "near_auth_token_expired" })
    await expect(verifySigningJwt(ok, cfg, { sub: SUB, bytes }, { jwks, nowMs: Date.now() + 120_000 })).rejects.toMatchObject({ reason: "near_auth_token_expired" })
    const noScope = await issuer.sign({ sub: SUB, azp: "test-client", scope: "openid", fatxn: [1, 2, 3] }, { expSec: 60, aud: issuer.signingAudience })
    await expect(verifySigningJwt(noScope, cfg, { sub: SUB, bytes }, { jwks })).rejects.toMatchObject({ detail: { cause: "scope" } })
    const wrongAud = await issuer.sign({ sub: SUB, azp: "test-client", scope: "openid transaction:sign", fatxn: [1, 2, 3] }, { expSec: 60, aud: "test-client" })
    await expect(verifySigningJwt(wrongAud, cfg, { sub: SUB, bytes }, { jwks })).rejects.toMatchObject({ reason: "near_auth_token_invalid" })
    const wrongAzp = await issuer.sign({ sub: SUB, azp: "other-client", scope: "openid transaction:sign", fatxn: [1, 2, 3] }, { expSec: 60, aud: issuer.signingAudience })
    await expect(verifySigningJwt(wrongAzp, cfg, { sub: SUB, bytes }, { jwks })).rejects.toMatchObject({ detail: { cause: "azp" } })
  })
  it("decodes the NEP-461-prefixed AddKey delegate; rejects a bad prefix", () => {
    const pk = KeyPair.fromRandom("ed25519").getPublicKey().toString()
    const bytes = delegateBytes({ newPk: pk })
    expect([...bytes.slice(0, 4)]).toEqual([0x6e, 0x01, 0x00, 0x40])
    const d = decodeSignPayload(bytes)
    expect(d).toMatchObject({ senderId: ACCOUNT, receiverId: ACCOUNT, nonce: 11n, publicKey: mpc.getPublicKey().toString() })
    expect(d.actions).toEqual([{ kind: "addKey", publicKey: pk, fullAccess: true }])
    const bad = bytes.slice()
    bad[0] = 0
    expect(() => decodeSignPayload(bad)).toThrow()
  })
  it("parses fast-auth's final value", () => {
    const sig = Array.from({ length: 64 }, (_, i) => i)
    expect(mpcSignature(plainOutcome("x", RELAYER, "fast-auth.testnet", valueOf({ scheme: "Ed25519", signature: sig })))).toEqual(new Uint8Array(sig))
    expect(mpcSignature(plainOutcome("x", RELAYER, "fast-auth.testnet", valueOf(null)))).toBeNull()
  })
})

describe("POST /api/devices", () => {
  it("MPC-signs the AddKey with 1 yocto, relays it, activates the device and rebinds the session", async () => {
    const newKey = KeyPair.fromRandom("ed25519")
    const b = await body({ newKey })
    const r = await addDevice(deps, me, b, { requestId: "req_1" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ device: { publicKey: newKey.getPublicKey().toString(), status: "active" }, signTxHash: expect.any(String), addKeyTxHash: expect.any(String) })
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["sign", "delegate"])
    const signTx = sub.submitted[0]!
    expect(signTx.spec).toMatchObject({ signerId: RELAYER, receiverId: "fast-auth.testnet" })
    const fc = (signTx.spec.actions[0] as unknown as { functionCall: { args: Uint8Array; gas: bigint; deposit: bigint } }).functionCall
    expect(fc.deposit).toBe(1n)
    expect(fc.gas).toBe(300_000_000_000_000n)
    expect(JSON.parse(new TextDecoder().decode(fc.args))).toMatchObject({ guard_id: "jwt#https://login.testnet.fast-auth.com/", algorithm: "eddsa" })
    expect(sub.submitted[1]!.spec.receiverId).toBe(ACCOUNT)
    const d = (await t.db.select().from(device).where(eq(device.publicKey, newKey.getPublicKey().toString())))[0]!
    expect(d).toMatchObject({ status: "active", addedVia: "near_auth" })
    expect((await t.db.select().from(session).where(eq(session.idHash, "sess1")))[0]!.deviceId).toBe(d.id)
    const ops = (await t.db.select().from(relayLog)).map((x) => `${x.op}:${x.status}`).sort()
    expect(ops).toEqual(["add_key:executed", "mpc_sign:executed"])
    // the same op again is a replay, nothing new is paid
    const again = await addDevice(deps, me, b, { requestId: "req_2" })
    expect(again.body).toMatchObject({ replayed: true })
    expect(sub.submitted).toHaveLength(2)
  })

  it("a key already on chain is activated without paying for a signature", async () => {
    const newKey = KeyPair.fromRandom("ed25519")
    chain.accounts.get(ACCOUNT)!.keys.set(newKey.getPublicKey().toString(), { nonce: 0n, permission: "FullAccess" })
    const r = await addDevice(deps, me, await body({ newKey }), { requestId: "req_3" })
    expect(r.body).toMatchObject({ device: { status: "active" } })
    expect(sub.submitted).toHaveLength(0)
  })

  it("refuses before paying: wrong bytes, wrong action, wrong signer, wrong sub, stale nonce, window, not near-auth", async () => {
    const k = KeyPair.fromRandom("ed25519")
    const pk = k.getPublicKey().toString()
    const cases: [() => Promise<unknown>, string][] = [
      [async () => addDevice(deps, me, await body({ newKey: k, tokenBytes: delegateBytes({ newPk: pk, nonce: 12n }) }), { requestId: "a" }), "payload_mismatch"],
      [async () => addDevice(deps, me, await body({ newKey: k, bytes: delegateBytes({ newPk: pk, extra: true }) }), { requestId: "b" }), "payload_mismatch"],
      [async () => addDevice(deps, me, await body({ newKey: k, bytes: delegateBytes({ newPk: pk, signer: KeyPair.fromRandom("ed25519").getPublicKey().toString() }) }), { requestId: "c" }), "payload_mismatch"],
      [async () => addDevice(deps, me, await body({ newKey: k, bytes: delegateBytes({ newPk: KeyPair.fromRandom("ed25519").getPublicKey().toString() }) }), { requestId: "d" }), "payload_mismatch"],
      [async () => addDevice(deps, me, await body({ newKey: k, sub: "google-oauth2|someone-else" }), { requestId: "e" }), "near_auth_token_invalid"],
      [async () => addDevice(deps, me, await body({ newKey: k, bytes: delegateBytes({ newPk: pk, nonce: 10n }) }), { requestId: "f" }), "nonce_used"],
      [async () => addDevice(deps, me, await body({ newKey: k, bytes: delegateBytes({ newPk: pk, mbh: BigInt(HEAD + 5) }) }), { requestId: "g" }), "expired"],
      [async () => addDevice(deps, me, await body({ newKey: k, bytes: delegateBytes({ newPk: pk, mbh: BigInt(HEAD + 900) }) }), { requestId: "h" }), "ttl_too_long"],
      [async () => addDevice(deps, { ...me, kind: "dev" }, await body({ newKey: k }), { requestId: "i" }), "demo_forbidden"],
    ]
    for (const [p, reason] of cases) await expect(p()).rejects.toMatchObject({ reason })
    expect(sub.submitted).toHaveLength(0)
  })

  it("rev4 L-7: a changed MPC derivation (hashed sub) is refused with nothing paid", async () => {
    chain.view("v1.signer-prod.testnet", "derived_public_key", () => KeyPair.fromRandom("ed25519").getPublicKey().toString())
    await expect(addDevice(deps, me, await body(), { requestId: "j" })).rejects.toMatchObject({ reason: "payload_mismatch", detail: { cause: "mpc_key" } })
    expect(sub.submitted).toHaveLength(0)
  })

  it("an MPC failure (null) is mpc_sign_failed with the tx hash; nothing is relayed", async () => {
    mpcResult = "null"
    await expect(addDevice(deps, me, await body(), { requestId: "k" })).rejects.toMatchObject({ reason: "mpc_sign_failed", txHash: expect.any(String) })
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["sign"])
  })

  it("5 devices per person per day", async () => {
    for (let i = 0; i < 5; i++) await addDevice(deps, me, await body(), { requestId: `q${i}` })
    await expect(addDevice(deps, me, await body(), { requestId: "q6" })).rejects.toMatchObject({ reason: "quota_exceeded" })
  })
})
