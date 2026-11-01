// U-WEB-06: the device key store. Both paths (WebCrypto Ed25519, noble fallback) sign verifiable Ed25519.
// Never compare signature bytes (Safari's are randomized): verify them instead.
import { ed25519 } from "@noble/curves/ed25519.js"
import { base64urlnopad } from "@scure/base"
import { IDBFactory } from "fake-indexeddb"
import { describe, expect, it } from "vitest"
import { DeviceKeyStore, rawFromPk } from "./device-key-store"

const msg = new TextEncoder().encode("delegate-hash-32-bytes-for-test!")

describe.each([
  ["webcrypto", false],
  ["fallback", true],
] as const)("DeviceKeyStore (%s)", (impl, forceFallback) => {
  const make = (idb: IDBFactory) => new DeviceKeyStore({ indexedDB: idb, forceFallback, now: () => 1_700_000_000_000 })

  it("pre-generates one pending key, idempotently", async () => {
    const store = make(new IDBFactory())
    const a = await store.ensurePending()
    const b = await store.ensurePending()
    expect(a.publicKey).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/)
    expect(a.impl).toBe(impl)
    expect(b.publicKey).toBe(a.publicKey)
  })

  it("signs bytes that verify against its public key", async () => {
    const store = make(new IDBFactory())
    const { publicKey } = await store.ensurePending()
    const sig = await store.sign(msg, "pending")
    expect(sig).toHaveLength(64)
    expect(ed25519.verify(sig, msg, rawFromPk(publicKey))).toBe(true)
    expect(ed25519.verify(sig, new TextEncoder().encode("tampered"), rawFromPk(publicKey))).toBe(false)
  })

  it("survives a reload (a new store over the same IndexedDB) and promotes to current", async () => {
    const idb = new IDBFactory()
    const first = make(idb)
    const { publicKey } = await first.ensurePending()
    first.close()
    const second = make(idb)
    const current = await second.promotePending("leo.users.pots.testnet")
    expect(current).toMatchObject({ id: "current", publicKey, accountId: "leo.users.pots.testnet" })
    expect(await second.get("pending")).toBeNull()
    expect(ed25519.verify(await second.sign(msg), msg, rawFromPk(publicKey))).toBe(true)
  })

  it("signs the PoP message pot-session-v1|b64url(sha256(idToken))|ts", async () => {
    const store = make(new IDBFactory())
    await store.ensurePending()
    const pop = await store.pop("header.payload.sig", 1_700_000_000_000)
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("header.payload.sig")))
    const expected = new TextEncoder().encode(`pot-session-v1|${base64urlnopad.encode(digest)}|1700000000000`)
    expect(new TextDecoder().decode(await store.popMessage("header.payload.sig", 1_700_000_000_000))).toBe(new TextDecoder().decode(expected))
    expect(ed25519.verify(base64urlnopad.decode(pop.sig), expected, rawFromPk(pop.publicKey))).toBe(true)
  })

  it("sign-out clears the key", async () => {
    const store = make(new IDBFactory())
    await store.ensurePending()
    await store.clear()
    expect(await store.get("pending")).toBeNull()
    await expect(store.sign(msg, "pending")).rejects.toThrow("no_device_key")
  })
})

it("the WebCrypto private key is non-extractable", async () => {
  const idb = new IDBFactory()
  const store = new DeviceKeyStore({ indexedDB: idb })
  await store.ensurePending()
  const rec = await new Promise<{ privateKey: CryptoKey }>((resolve, reject) => {
    const open = idb.open("pot-keys", 1)
    open.onsuccess = () => {
      const r = open.result.transaction("device").objectStore("device").get("pending")
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    }
  })
  expect(rec.privateKey.extractable).toBe(false)
  await expect(crypto.subtle.exportKey("pkcs8", rec.privateKey)).rejects.toThrow()
})

it("refuses to run without IndexedDB (→ readiness 'unsupported')", () => {
  expect(() => new DeviceKeyStore({ indexedDB: undefined as unknown as IDBFactory, subtle: undefined as unknown as SubtleCrypto })).toThrow()
})

it("nearSigner(): @pot/sdk/sign HashSigner over the device key signs verifiable delegate hashes", async () => {
  const store = new DeviceKeyStore({ indexedDB: new IDBFactory() })
  const { publicKey } = await store.ensurePending()
  const signer = await store.nearSigner("pending")
  expect((await signer.getPublicKey()).toString()).toBe(publicKey)
  const hash = new Uint8Array(32).fill(7)
  const { signature } = await (signer as unknown as { signBytes(b: Uint8Array): Promise<Uint8Array> }).signBytes(hash).then((s) => ({ signature: s }))
  expect(ed25519.verify(signature, hash, rawFromPk(publicKey))).toBe(true)
})
