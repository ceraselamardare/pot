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
import { loadConfig } from "../../config"
import { FakeChain, FakeSubmitter, methodOf, plainOutcome } from "../../testing/fakeChain"
import { makeNonce, nep413Bytes, nep413Hash, NEP413_TAG, nonceTime, SIGN_IN_MESSAGE, toBase64, verifyNep413 } from "./nep413"
import { ensureRegistered } from "../registration"
import { allowedRecipients, rootOf, walletDisplayName, walletLogin, type WalletDeps } from "./service"

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
  it("opens a wallet session for a full-access key and pays NO registration at sign-in (APP-2)", async () => {
    const r = await walletLogin(deps, await signedBody(), meta)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ isNew: true, usdcRegistered: false, session: { kind: "wallet", accountId: WALLET, displayName: "Alice" } })
    expect(r.cookies.some((c) => c.startsWith("pot_session=") || c.startsWith("__Host-pot_session="))).toBe(true)
    expect(r.cookies.some((c) => c.startsWith("pot_hint="))).toBe(true)
    expect(await t.db.select().from(session)).toHaveLength(1)
    for (const f of deferred) await f()
    expect(sub.submitted).toHaveLength(0) // nothing paid for a sign-in
    // the lazy path (create/join/spend to self) registers once per account ever, from the per-IP + global budget
    const userId = (await t.db.select().from(appUser))[0]!.id
    expect(await ensureRegistered(deps, { account: WALLET, userId, ipHash: "ip1", budget: "general" })).toBe("registered")
    expect(sub.submitted.map((s) => methodOf(s.spec))).toEqual(["storage_deposit"])
    expect((await t.db.select().from(appUser).where(eq(appUser.nearAccount, WALLET)))[0]!.usdcRegistered).toBe(true)
    expect(await ensureRegistered(deps, { account: WALLET, userId, ipHash: "ip1", budget: "general" })).toBe("already")
    expect(sub.submitted).toHaveLength(1)
    // a second login: same user, a new session, registered
    const again = await walletLogin(deps, await signedBody(), meta)
    expect(again.body).toMatchObject({ isNew: false, usdcRegistered: true })
  })

  it("APP-1: at most ip_signups new people per IP per day; returning people are not counted", async () => {
    process.env.QUOTA_IP_SIGNUPS = "2"
    try {
      for (const name of ["a1.testnet", "a2.testnet"]) {
        chain.account(name, { keys: { [key.getPublicKey().toString()]: 5n } })
        await walletLogin(deps, await signedBody({ account: name }), meta)
      }
      chain.account("a3.testnet", { keys: { [key.getPublicKey().toString()]: 5n } })
      await expect(walletLogin(deps, await signedBody({ account: "a3.testnet" }), meta)).rejects.toMatchObject({
        reason: "quota_exceeded",
        detail: { family: "accounts" },
      })
      // another IP, or someone who signed in before, is fine
      await walletLogin(deps, await signedBody({ account: "a3.testnet" }), { ...meta, ipHash: "ip2" })
      await walletLogin(deps, await signedBody({ account: "a1.testnet" }), meta)
    } finally {
      delete process.env.QUOTA_IP_SIGNUPS
    }
  })

  it("APP-2: the general registration budget is per IP, and an unreadable chain pays nothing", async () => {
    process.env.QUOTA_IP_REGISTRATIONS = "1"
    chain.view(USDC, "storage_balance_of", () => null) // nobody is registered
    try {
      expect(await ensureRegistered(deps, { account: "b1.testnet", ipHash: "ipx", budget: "general" })).toBe("registered")
      expect(await ensureRegistered(deps, { account: "b2.testnet", ipHash: "ipx", budget: "general" })).toBe("skipped")
      chain.view(USDC, "storage_balance_of", () => {
        throw new Error("rpc down")
      })
      expect(await ensureRegistered(deps, { account: "b3.testnet", ipHash: "ipy", budget: "general" })).toBe("skipped")
      expect(sub.submitted).toHaveLength(1)
    } finally {
      delete process.env.QUOTA_IP_REGISTRATIONS
    }
  })

  it("APP-7: the signature must be addressed to the page that sent it (Origin), and to this deployment only", async () => {
    await expect(walletLogin(deps, await signedBody(), { ...meta, origin: "https://evil.app" })).rejects.toMatchObject({
      detail: { field: "recipient", why: "origin" },
    })
    await expect(walletLogin(deps, await signedBody(), { ...meta, origin: null })).rejects.toMatchObject({ detail: { field: "recipient" } })
    expect((await walletLogin(deps, await signedBody(), { ...meta, origin: "https://pot.test" })).status).toBe(200)
    const vercel = {
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "pot.app",
      VERCEL_URL: "pot-abc123.vercel.app",
      NEXT_PUBLIC_HUB_ID: "pots.potapp.testnet",
    }
    // a preview: its own urls only, never production's (appUrl falls back to production there)
    const preview = loadConfig({ ...vercel, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "pot-git-x.vercel.app" })
    expect(preview.appUrl).toBe("https://pot.app")
    expect(allowedRecipients(preview).sort()).toEqual(["pot-abc123.vercel.app", "pot-git-x.vercel.app"])
    // production: its domain and its own deployment urls, never a preview's
    const prod = loadConfig({ ...vercel, VERCEL_ENV: "production", VERCEL_URL: "pot-def456.vercel.app" })
    expect(allowedRecipients(prod)).toContain("pot.app")
    expect(allowedRecipients(prod)).not.toContain("pot-git-x.vercel.app")
    expect(allowedRecipients(prod)).not.toContain("localhost:3000")
    // a preview signature replayed to production is refused
    const onProd = { ...deps, cfg: prod }
    await expect(walletLogin(onProd, await signedBody({ recipient: "pot-git-x.vercel.app" }), meta)).rejects.toMatchObject({
      detail: { field: "recipient" },
    })
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
