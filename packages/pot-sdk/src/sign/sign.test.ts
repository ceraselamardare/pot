// Delegate building/signing/encoding round-trips against near-api-js 7.3.1, the strict decoder,
// local signature verification, KeyPairPotSigner and HashSigner, nonce helpers, and the invite
// crypto (U-08: noble/near-api-js vs WebCrypto parity, contract message bytes).
import { KeyPair, KeyPairSigner, encodeSignedDelegate, encodeDelegateAction, type KeyPairString } from "near-api-js"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { testnetConfig } from "../config.ts"
import { base58Encode, base64Decode, base64Encode, concatBytes, utf8Decode, utf8Encode } from "../encoding.ts"
import { buildInviteLink, isJoinSignatureFormat, joinMessage, joinMessageBytes, parseInviteLink, secretToSeed, signJoinWebCrypto, verifyJoinWebCrypto, webCryptoInviteKey } from "../invite.ts"
import type { AccountId, DaoId, PublicKeyStr, Slug } from "../types/ids.ts"
import type { ActionIntent, CallSpec } from "../types/intents.ts"
import { buildCall } from "../actions/build.ts"
import { transferKind } from "../actions/kinds.ts"
import { createMockChain } from "../testing/mock-chain.ts"
import { DelegateDecodeError, NEP461_PREFIX_BYTES, decodeSignedDelegate, delegateHash } from "./encode.ts"
import { buildDelegate, signDelegate, verifySignedDelegate } from "./delegate.ts"
import { DEFAULT_DELEGATE_TTL_BLOCKS, NonceTracker, SigningQueue, SigningTimeoutError, delegateWindowError, maxBlockHeightFor, nextNonce } from "./nonce.ts"
import { HashSigner, KeyPairPotSigner, SignerNotReadyError, relayBody } from "./signer.ts"
import { generateInvite, inviteKeyFromSeed, signJoin, verifyJoin } from "./invite.ts"

const cfg = testnetConfig("potapp")
const DAO = "lisbon-trip.pots.potapp.testnet" as DaoId
const MAYA = "maya.users.potapp.testnet" as AccountId
// A deterministic throwaway test key (never used on any network).
const SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
// KeyPairEd25519 takes base58 of the (extended) secret and uses its first 32 bytes as the seed.
const keyPair = (): KeyPair => KeyPair.fromString(`ed25519:${base58Encode(SEED)}` as KeyPairString)

const call: CallSpec = buildCall({ type: "request_spend", pot: DAO, amount: 84_000_000n, receiverId: MAYA, category: "groceries", requestRef: "k3d9x1a2b4c6m7n8" }, cfg)

describe("delegate build / sign / encode (near-api-js 7.3.1)", () => {
  it("round-trips: near-api-js encodeSignedDelegate → base64 → our strict decoder", async () => {
    const kp = keyPair()
    const signer = new KeyPairSigner(kp)
    const r = await signDelegate(signer, { senderId: MAYA, call, nonce: 274_151_633_000_001n, maxBlockHeight: 274_151_833n })
    expect(r.signedDelegateBase64).toBe(base64Encode(encodeSignedDelegate(r.signedDelegate)))
    const d = decodeSignedDelegate(r.signedDelegateBase64)
    expect(d).toMatchObject({ senderId: MAYA, receiverId: cfg.hubId, nonce: 274_151_633_000_001n, maxBlockHeight: 274_151_833n, publicKey: kp.getPublicKey().toString() })
    expect(d.actions).toHaveLength(1)
    const a = d.actions[0]
    expect(a?.type).toBe("FunctionCall")
    if (a?.type === "FunctionCall") {
      expect(a.method).toBe("request_spend")
      expect(a.gas).toBe(150_000_000_000_000n)
      expect(a.deposit).toBe(0n)
      expect(utf8Decode(a.args)).toBe(JSON.stringify((call.actions[0] as { args: object }).args))
      expect(a.argsJson).toEqual((call.actions[0] as { args: object }).args)
    }
    // the signed bytes are NEP-461 prefix ‖ borsh(DelegateAction), exactly what near-api-js hashes
    const da = buildDelegate({ senderId: MAYA, publicKey: kp.getPublicKey().toString(), call, nonce: 274_151_633_000_001n, maxBlockHeight: 274_151_833n })
    expect(concatBytes(NEP461_PREFIX_BYTES, d.delegateActionBytes)).toEqual(encodeDelegateAction(da))
    expect(await delegateHash(d.delegateActionBytes)).toEqual(r.delegateHash)
    expect(await verifySignedDelegate(d)).toBe(true)
  })

  it("decodes 1-yocto ft_transfer_call, act_proposal with a kind, rotate pairs and AddKey", async () => {
    const signer = new KeyPairSigner(keyPair())
    const intents: ActionIntent[] = [
      { type: "add_money", pot: DAO, amount: 150_000_000n },
      { type: "vote", pot: DAO, proposalId: 3, kind: transferKind(cfg.usdcId, MAYA, 300_000_000n), action: "VoteApprove" },
      { type: "rotate_invite", pot: DAO, oldPk: "ed25519:8qEjY9rV1bKk4M1xGdrgWW3T2Zy4kq6WY7uHUnF1hW1m" as PublicKeyStr, newPk: "ed25519:7CUDgW32nTdWTSCuZxF1TXBp6aXmJR5o6Zc4TVcdgLZh" as PublicKeyStr },
      { type: "add_device_key", account: MAYA, publicKey: "ed25519:7CUDgW32nTdWTSCuZxF1TXBp6aXmJR5o6Zc4TVcdgLZh" as PublicKeyStr },
    ]
    for (const i of intents) {
      const c = buildCall(i, cfg)
      const r = await signDelegate(signer, { senderId: MAYA, call: c, nonce: 5n, maxBlockHeight: 99n })
      const d = decodeSignedDelegate(r.signedDelegateBase64)
      expect(d.receiverId).toBe(c.receiverId)
      expect(d.actions.map((a) => a.type)).toEqual(c.actions.map((a) => a.type))
      for (const [k, a] of d.actions.entries()) {
        const want = c.actions[k]
        if (a.type === "FunctionCall" && want?.type === "FunctionCall") expect([a.method, a.gas, a.deposit, a.argsJson]).toEqual([want.method, want.gas, want.deposit, want.args])
        if (a.type === "AddKey" && want?.type === "AddKey") expect([a.publicKey, a.accessKey.permission, a.accessKey.nonce]).toEqual([want.publicKey, "FullAccess", 0n])
      }
      expect(await verifySignedDelegate(r.signedDelegateBase64)).toBe(true)
    }
  })

  it("rejects tampering, trailing bytes and truncation", async () => {
    const r = await signDelegate(new KeyPairSigner(keyPair()), { senderId: MAYA, call, nonce: 5n, maxBlockHeight: 99n })
    const bytes = base64Decode(r.signedDelegateBase64)
    const flipped = Uint8Array.from(bytes)
    flipped[20] = (flipped[20] as number) ^ 1 // inside the receiver id / args
    expect(await verifySignedDelegate(decodeSignedDelegate(flipped))).toBe(false)
    expect(() => decodeSignedDelegate(concatBytes(bytes, Uint8Array.from([0])))).toThrow(DelegateDecodeError)
    expect(() => decodeSignedDelegate(bytes.slice(0, bytes.length - 3))).toThrow(DelegateDecodeError)
    expect(() => decodeSignedDelegate("!!!")).toThrow(DelegateDecodeError)
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (junk) => {
        try {
          decodeSignedDelegate(junk)
        } catch (e) {
          expect(e).toBeInstanceOf(DelegateDecodeError)
        }
      }),
      { numRuns: 500 },
    )
  })

  it("HashSigner (the WebCrypto adapter shape) produces delegates identical to KeyPairSigner", async () => {
    const kp = keyPair()
    const hs = new HashSigner(kp.getPublicKey().toString(), async (hash) => kp.sign(hash).signature)
    const a = await signDelegate(hs, { senderId: MAYA, call, nonce: 7n, maxBlockHeight: 9n })
    const b = await signDelegate(new KeyPairSigner(kp), { senderId: MAYA, call, nonce: 7n, maxBlockHeight: 9n })
    expect(a.signedDelegateBase64).toBe(b.signedDelegateBase64) // ed25519 is deterministic
  })
})

describe("nonce and expiry helpers", () => {
  it("nonce = max(chain, lastUsed) + 1; TTL 200; relayer window", () => {
    expect(nextNonce(10n)).toBe(11n)
    expect(nextNonce(10n, 15n)).toBe(16n)
    expect(nextNonce(20n, 15n)).toBe(21n)
    expect(maxBlockHeightFor(1000)).toBe(1000n + BigInt(DEFAULT_DELEGATE_TTL_BLOCKS))
    expect(delegateWindowError(1010n, 1000)).toBe("expired")
    expect(delegateWindowError(1011n, 1000)).toBeNull()
    expect(delegateWindowError(1600n, 1000)).toBeNull()
    expect(delegateWindowError(1601n, 1000)).toBe("ttl_too_long")
    const t = new NonceTracker()
    expect(t.next("a", "k", 100n)).toBe(101n)
    expect(t.next("a", "k", 100n)).toBe(102n) // the chain hasn't caught up: no collision
    t.reset("a", "k")
    expect(t.next("a", "k", 100n)).toBe(101n)
  })

  it("SigningQueue: FIFO, one in flight per key, timeout", async () => {
    const q = new SigningQueue(50)
    const order: string[] = []
    let inFlight = 0
    const job = (name: string, ms: number) => async () => {
      inFlight++
      expect(inFlight).toBe(1)
      await new Promise((r) => setTimeout(r, ms))
      order.push(name)
      inFlight--
      return name
    }
    const res = await Promise.all([q.run("k", job("a", 10)), q.run("k", job("b", 1)), q.run("k", job("c", 5))])
    expect(res).toEqual(["a", "b", "c"])
    expect(order).toEqual(["a", "b", "c"])
    await expect(q.run("k", () => new Promise(() => undefined))).rejects.toBeInstanceOf(SigningTimeoutError)
    expect(await q.run("k", async () => "after")).toBe("after")
  })
})

describe("KeyPairPotSigner (tests and scripts)", () => {
  it("prepares from the chain's access key, signs, and the relay accepts it (via MockChain)", async () => {
    const chain = createMockChain({ cfg })
    const kp = keyPair()
    const pk = kp.getPublicKey().toString() as PublicKeyStr
    const signer = new KeyPairPotSigner({ accountId: MAYA, secretKey: kp, chain, cfg })
    expect(await signer.readiness()).toBe("needs_device")
    await expect(signer.prepare({ type: "propose_close", pot: DAO })).rejects.toBeInstanceOf(SignerNotReadyError)
    chain.createAccount(MAYA, pk)
    expect(await signer.readiness()).toBe("ready")
    const intent: ActionIntent = { type: "create_pot", slug: "lisbon-trip" as Slug, name: "Lisbon Trip", preset: "trip", rules: null }
    const p = await signer.prepare(intent)
    const p2 = await signer.prepare(intent)
    expect(p2.nonce).toBe((p.nonce as bigint) + 1n) // tracked, no collision before the chain catches up
    expect(p.maxBlockHeight).toBe(BigInt(chain.height()) + 200n)
    expect(p.delegateBytes?.slice(0, 4)).toEqual(NEP461_PREFIX_BYTES)
    const signed = await signer.sign(p)
    expect(signed.via).toBe("relay")
    if (signed.via !== "relay") throw new Error("expected a signed relay body")
    expect(signed.body).toMatchObject({ idempotencyKey: p.opId, intent: "create_pot" })
    const res = await chain.handleRelayBody(MAYA, signed.body)
    expect(res.ok && res.outcome).toBe("success")
    // replaying the same delegate is refused (nonce used)
    const again = await chain.handleRelayBody(MAYA, signed.body)
    expect(again.ok ? "ok" : again.reason).toBe("nonce_used")
    // another session can't relay Maya's delegate
    const other = await chain.handleRelayBody("leo.users.potapp.testnet", signed.body)
    expect(other.ok ? "ok" : other.reason).toBe("sender_mismatch")
  })

  it("relayBody carries requestRef for spends and the op id as idempotency key", () => {
    const i: ActionIntent = { type: "request_spend", pot: DAO, amount: 1n, receiverId: MAYA, category: "food", requestRef: "k3d9x1a2b4c6m7n8" }
    const body = relayBody({ intent: i, call: buildCall(i, cfg), senderId: MAYA, opId: "k3d9x1a2b4c6m7n8" }, "AAAA")
    expect(body).toEqual({ signedDelegate: "AAAA", idempotencyKey: "k3d9x1a2b4c6m7n8", intent: "request_spend", requestRef: "k3d9x1a2b4c6m7n8" })
  })
})

describe("invite crypto (D-08, U-08)", () => {
  const joiner = "u-7k2f9x1a.users.potapp.testnet"
  it("message bytes are exactly the hub's format", () => {
    expect(joinMessage("lisbon-trip.pots.potapp.testnet", joiner)).toBe("pot-join:v1:lisbon-trip.pots.potapp.testnet:u-7k2f9x1a.users.potapp.testnet")
    expect(joinMessageBytes("a", "b")).toEqual(utf8Encode("pot-join:v1:a:b"))
  })

  it("keys, link format and signature encoding", async () => {
    const inv = generateInvite()
    expect(inv.secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(inv.publicKey).toBe(`ed25519:${inv.param}`)
    expect(secretToSeed(inv.secret)).toEqual(inv.seed)
    const link = buildInviteLink({ origin: "https://pot-team.vercel.app/", slug: "lisbon-trip", invitePk: inv.publicKey, secret: inv.secret })
    expect(link).toBe(`https://pot-team.vercel.app/j/lisbon-trip?i=${inv.param}#${inv.secret}`)
    expect(parseInviteLink(link)).toEqual({ slug: "lisbon-trip", invitePk: inv.publicKey, secret: inv.secret })
    expect(parseInviteLink("/j/lisbon-trip")).toEqual({ slug: "lisbon-trip", invitePk: null, secret: null })
    expect(parseInviteLink("/p/lisbon-trip")).toBeNull()
    const { invitePk, signature } = signJoin(inv.secret, DAO, joiner)
    expect(invitePk).toBe(inv.publicKey)
    expect(signature).toHaveLength(88)
    expect(isJoinSignatureFormat(signature)).toBe(true)
    expect(verifyJoin(invitePk, DAO, joiner, signature)).toBe(true)
    expect(verifyJoin(invitePk, DAO, "eve.testnet", signature)).toBe(false) // bound to the joiner
    expect(verifyJoin(invitePk, "other.pots.potapp.testnet", joiner, signature)).toBe(false) // bound to the Pot
  })

  it("WebCrypto and near-api-js agree byte for byte (Ed25519 is deterministic)", async () => {
    const seed = Uint8Array.from({ length: 32 }, (_, i) => 255 - i)
    const w = await webCryptoInviteKey(seed)
    expect(w.publicKey).toBe(inviteKeyFromSeed(seed).publicKey)
    const a = await signJoinWebCrypto(seed, DAO, joiner)
    const b = signJoin(seed, DAO, joiner)
    expect(a).toEqual(b)
    expect(await verifyJoinWebCrypto(a.invitePk, DAO, joiner, a.signature)).toBe(true)
    expect(await verifyJoinWebCrypto(a.invitePk, DAO, joiner, base64Encode(new Uint8Array(64)))).toBe(false)
  })
})
