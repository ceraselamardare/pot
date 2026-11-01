// B-10: NEP-413 against the exact byte layout (a hand-built vector + near-api-js's own signer as the reference),
// and POST /api/session/wallet on a test DB with a fake chain.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { eq } from "drizzle-orm"
import { KeyPair, KeyPairSigner } from "near-api-js"
import { sha256 } from "@noble/hashes/sha2.js"
import { base58 } from "@scure/base"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { appUser, session, usedProof } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { resetBalanceCacheForTests } from "../../chain/balance"
import type { Config } from "../../config"
import { USDC } from "../../testing/delegates"
import { NEAR, RELAYER, testConfig } from "../../testing/env"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../../testing/fakeChain"
import { makeNonce, nep413Bytes, nep413Hash, NEP413_TAG, nonceTime, SIGN_IN_MESSAGE, toBase64, verifyNep413 } from "./nep413"
import { registerOnce, rootOf, walletDisplayName, walletLogin, type WalletDeps } from "./service"

describe("NEP-413 byte layout", () => {
  const nonce = Uint8Array.from({ length: 32 }, (_, i) => i)
  it("prefix 2³¹+413 (LE) ‖ borsh{message, nonce[32], recipient, callbackUrl: None}", () => {
    const b = nep413Bytes({ message: "hi", nonce, recipient: "pot.app" })
    const expected = new Uint8Array([
      ...[0x9d, 0x01, 0x00, 0x80], // u32_le(2147484061)
      ...[2, 0, 0, 0, 0x68, 0x69], // "hi"
      ...nonce,
      ...[7, 0, 0, 0, ...new TextEncoder().encode("pot.app")],
      0, // None
    ])
    expect(NEP413_TAG).toBe(2147484061)
    expect([...b]).toEqual([...expected])
    expect(nep413Hash({ message: "hi", nonce, recipient: "pot.app" })).toEqual(sha256(expected))
    // Some(callbackUrl)
    const cb = nep413Bytes({ message: "hi", nonce, recipient: "pot.app", callbackUrl: "x" })
    expect([...cb.slice(-6)]).toEqual([1, 1, 0, 0, 0, 0x78])
  })

  it("matches near-api-js's NEP-413 signer bit for bit, with base64 and ed25519:base58 signatures", async () => {
    const key = KeyPair.fromRandom("ed25519")
    const n = makeNonce()
    const signed = await new KeyPairSigner(key).signNep413Message("alice.testnet", { message: SIGN_IN_MESSAGE, recipient: "localhost:3000", nonce: n })
    const pk = key.getPublicKey().toString()
    const sigB64 = toBase64(signed.signature)
    expect(verifyNep413({ message: SIGN_IN_MESSAGE, nonce: n, recipient: "localhost:3000" }, sigB64, pk)).toBe(true)
    expect(verifyNep413({ message: SIGN_IN_MESSAGE, nonce: n, recipient: "localhost:3000" }, `ed25519:${base58.encode(signed.signature)}`, pk)).toBe(true)
    // every field is bound
    expect(verifyNep413({ message: "Sign in to Pot!", nonce: n, recipient: "localhost:3000" }, sigB64, pk)).toBe(false)
    expect(verifyNep413({ message: SIGN_IN_MESSAGE, nonce: makeNonce(), recipient: "localhost:3000" }, sigB64, pk)).toBe(false)
    expect(verifyNep413({ message: SIGN_IN_MESSAGE, nonce: n, recipient: "evil.app" }, sigB64, pk)).toBe(false)
    expect(verifyNep413({ message: SIGN_IN_MESSAGE, nonce: n, recipient: "localhost:3000", callbackUrl: "https://x" }, sigB64, pk)).toBe(false)
    expect(verifyNep413({ message: SIGN_IN_MESSAGE, nonce: n, recipient: "localhost:3000" }, sigB64, KeyPair.fromRandom("ed25519").getPublicKey().toString())).toBe(false)
    expect(verifyNep413({ message: SIGN_IN_MESSAGE, nonce: n, recipient: "localhost:3000" }, "not-base64!", pk)).toBe(false)
  })

  it("nonce = 8-byte big-endian ms ‖ 24 random bytes", () => {
    const n = makeNonce(1_800_000_000_123)
    expect(n).toHaveLength(32)
    expect(nonceTime(n)).toBe(1_800_000_000_123)
    expect(makeNonce(1).slice(8)).not.toEqual(makeNonce(1).slice(8))
  })
})

// ---------------------------------------------------------------------------------------------

const WALLET = "alice.testnet"
let t: TestDb
let cfg: Config
let chain: FakeChain
let sub: FakeSubmitter
let deps: WalletDeps
let deferred: (() => Promise<void>)[]
let key: KeyPair
let registered: boolean

beforeAll(async () => {
  t = await createTestDb("wallet")
})
afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  await t.truncate()
  cfg = testConfig()
  resetBalanceCacheForTests()
  key = KeyPair.fromRandom("ed25519")
  registered = false
  chain = new FakeChain()
  chain.account(RELAYER, { amount: 20n * NEAR })
  chain.account(WALLET, { keys: { [key.getPublicKey().toString()]: 5n } })
  chain.view(USDC, "storage_balance_of", () => (registered ? { total: "1", available: "0" } : null))
  sub = new FakeSubmitter((spec) => {
    if (methodOf(spec) === "storage_deposit") registered = true
    return plainOutcome("x", RELAYER, spec.receiverId)
  })
  deferred = []
  deps = { db: t.db, rpc: chain, submitter: sub, cfg, defer: (fn) => void deferred.push(fn) }
})

async function signedBody(over: { account?: string; recipient?: string; message?: string; nonce?: Uint8Array; signer?: KeyPair } = {}) {
  const n = over.nonce ?? makeNonce()
  const recipient = over.recipient ?? "pot.test"
  const message = over.message ?? SIGN_IN_MESSAGE
  const k = over.signer ?? key
  const s = await new KeyPairSigner(k).signNep413Message(over.account ?? WALLET, { message, recipient, nonce: n })
  return { accountId: over.account ?? WALLET, publicKey: k.getPublicKey().toString(), signature: toBase64(s.signature), nonce: toBase64(n), message, recipient }
}

const meta = { ipHash: "ip1", userAgent: "vitest" }

describe("POST /api/session/wallet", () => {
  it("opens a wallet session for a full-access key, then registers USDC once (after the response)", async () => {
    const r = await walletLogin(deps, await signedBody(), meta)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ isNew: true, usdcRegistered: false, session: { kind: "wallet", accountId: WALLET, displayName: "Alice" } })
    expect(r.cookies.some((c) => c.startsWith("pot_session=") || c.startsWith("__Host-pot_session="))).toBe(true)
    expect(r.cookies.some((c) => c.startsWith("pot_hint="))).toBe(true)
    expect(await t.db.select().from(session)).toHaveLength(1)
    expect(sub.submitted).toHaveLength(0)
    for (const f of deferred) await f()
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["storage_deposit"])
    expect((await t.db.select().from(appUser).where(eq(appUser.nearAccount, WALLET)))[0]!.usdcRegistered).toBe(true)
    // once per account ever
    expect(await registerOnce(deps, (await t.db.select().from(appUser))[0]!.id, WALLET)).toBe(false)
    // a second login: same user, a new session, registered
    const again = await walletLogin(deps, await signedBody(), meta)
    expect(again.body).toMatchObject({ isNew: false, usdcRegistered: true })
  })

  it("refuses a bad signature, a replayed nonce and a stale nonce", async () => {
    const b = await signedBody()
    await expect(walletLogin(deps, { ...b, signature: (await signedBody()).signature }, meta)).rejects.toMatchObject({ reason: "wallet_signature_invalid" })
    await walletLogin(deps, b, meta)
    await expect(walletLogin(deps, b, meta)).rejects.toMatchObject({ reason: "wallet_signature_invalid", detail: { cause: "replay" } })
    const stale = await signedBody({ nonce: makeNonce(Date.now() - 6 * 60_000) })
    await expect(walletLogin(deps, stale, meta)).rejects.toMatchObject({ reason: "wallet_signature_invalid", detail: { cause: "nonce_time" } })
    expect((await t.db.select().from(usedProof)).filter((p) => p.purpose === "wallet")).toHaveLength(1)
  })

  it("refuses another recipient, another message, and our own accounts", async () => {
    await expect(walletLogin(deps, await signedBody({ recipient: "evil.app" }), meta)).rejects.toMatchObject({ reason: "bad_request", detail: { field: "recipient" } })
    await expect(walletLogin(deps, await signedBody({ message: "Hello" }), meta)).rejects.toMatchObject({ reason: "bad_request", detail: { field: "message" } })
    expect(rootOf(cfg)).toBe("potapp.testnet")
    for (const own of ["potapp.testnet", "u-abc.users.potapp.testnet", "pots.potapp.testnet"]) {
      chain.account(own, { keys: { [key.getPublicKey().toString()]: 1n } })
      await expect(walletLogin(deps, await signedBody({ account: own }), meta)).rejects.toMatchObject({ reason: "bad_request", detail: { why: "own_account" } })
    }
  })

  it("refuses a key that isn't a full-access key of the account", async () => {
    const fc = KeyPair.fromRandom("ed25519")
    chain.accounts.get(WALLET)!.keys.set(fc.getPublicKey().toString(), { nonce: 1n, permission: { FunctionCall: { allowance: null, receiver_id: "x", method_names: [] } } })
    await expect(walletLogin(deps, await signedBody({ signer: fc }), meta)).rejects.toMatchObject({ reason: "wallet_key_not_full_access" })
    const stranger = KeyPair.fromRandom("ed25519")
    await expect(walletLogin(deps, await signedBody({ signer: stranger }), meta)).rejects.toMatchObject({ reason: "wallet_key_not_full_access" })
  })

  it("display names from the account", () => {
    expect(walletDisplayName("alice.testnet")).toBe("Alice")
    expect(walletDisplayName("mary-jane.near")).toBe("Mary Jane")
    expect(walletDisplayName("a".repeat(64))).toBe("Friend")
  })
})
