// DeviceKeyStore (F-07, frontend-architecture §4.3, D-21). The device key is the default signer of a NEAR Auth
// user: an Ed25519 key whose private half never leaves this browser.
//  - WebCrypto path: generateKey({name:'Ed25519'}, extractable = false). The CryptoKey is stored by structured
//    clone in IndexedDB `pot-keys` v1, store `device`. Safari 17+, Chrome 137+, Firefox 129+.
//  - Fallback (Chrome 111-136, iOS 16.4-16.x): a 32-byte @noble/curves seed, AES-GCM-wrapped with a
//    non-extractable WebCrypto AES key stored next to it. This only stops raw storage dumps, not XSS.
//  - PoP (D-21 step 4): sign utf8("pot-session-v1|" + b64url(sha256(idToken)) + "|" + ts).
// Never compare signature bytes in tests: Safari's Ed25519 signatures are randomized (hedged).
// The signing engine (F-08, lazy chunk) wraps `sign()` as near-api-js `Signer.signBytes`.
import { base58, base64urlnopad } from "@scure/base"

export type PublicKeyStr = `ed25519:${string}`
export type KeyImpl = "webcrypto" | "fallback"
export type KeySlot = "current" | "pending"

interface WrappedSeed {
  wrapped: ArrayBuffer
  iv: Uint8Array
  wrapKey: CryptoKey
}

export interface DeviceKeyRecord {
  id: KeySlot
  accountId?: string
  publicKey: PublicKeyStr
  impl: KeyImpl
  privateKey: CryptoKey | WrappedSeed
  createdAt: number
  onChainVerifiedAt?: number
}

export interface DeviceKeyInfo {
  id: KeySlot
  publicKey: PublicKeyStr
  impl: KeyImpl
  accountId?: string
  createdAt: number
}

export interface DeviceKeyStoreOptions {
  indexedDB?: IDBFactory
  subtle?: SubtleCrypto
  /** force the noble fallback (tests; browsers without Ed25519) */
  forceFallback?: boolean
  dbName?: string
  now?: () => number
}

const DB_VERSION = 1
const STORE = "device"
const POP_PREFIX = "pot-session-v1"

const toPk = (raw: Uint8Array): PublicKeyStr => `ed25519:${base58.encode(raw)}`
export const rawFromPk = (pk: PublicKeyStr): Uint8Array => base58.decode(pk.slice("ed25519:".length))
const utf8 = (s: string) => new TextEncoder().encode(s)
const buf = (u: Uint8Array): ArrayBuffer => u.slice().buffer as ArrayBuffer

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export class DeviceKeyStore {
  private readonly idb: IDBFactory
  private readonly subtle: SubtleCrypto
  private readonly dbName: string
  private readonly now: () => number
  private forceFallback: boolean
  private dbp: Promise<IDBDatabase> | null = null
  private supportsEd25519: Promise<boolean> | null = null

  constructor(opts: DeviceKeyStoreOptions = {}) {
    const idb = opts.indexedDB ?? globalThis.indexedDB
    const subtle = opts.subtle ?? globalThis.crypto?.subtle
    if (!idb) throw new Error("unsupported: no IndexedDB") // → readiness 'unsupported' (§4.2)
    if (!subtle) throw new Error("unsupported: no WebCrypto")
    this.idb = idb
    this.subtle = subtle
    this.dbName = opts.dbName ?? "pot-keys"
    this.forceFallback = !!opts.forceFallback
    this.now = opts.now ?? (() => Date.now())
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      const open = this.idb.open(this.dbName, DB_VERSION)
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: "id" })
      }
      this.dbp = req(open)
    }
    return this.dbp
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db()
    const t = db.transaction(STORE, mode)
    const result = await req(fn(t.objectStore(STORE)))
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
    return result
  }

  /** Feature-detect WebCrypto Ed25519 once (generate a throwaway key). */
  webcryptoEd25519(): Promise<boolean> {
    if (this.forceFallback) return Promise.resolve(false)
    this.supportsEd25519 ??= this.subtle
      .generateKey({ name: "Ed25519" }, false, ["sign", "verify"])
      .then(() => true)
      .catch(() => false)
    return this.supportsEd25519
  }

  private async generate(id: KeySlot): Promise<DeviceKeyRecord> {
    const createdAt = this.now()
    if (await this.webcryptoEd25519()) {
      const pair = (await this.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair
      const raw = new Uint8Array(await this.subtle.exportKey("raw", pair.publicKey))
      return { id, publicKey: toPk(raw), impl: "webcrypto", privateKey: pair.privateKey, createdAt }
    }
    const { ed25519 } = await import("@noble/curves/ed25519.js")
    const seed = ed25519.utils.randomSecretKey()
    const publicKey = toPk(ed25519.getPublicKey(seed))
    const wrapKey = await this.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
    const wrapped = await this.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, wrapKey, buf(seed))
    seed.fill(0)
    return { id, publicKey, impl: "fallback", privateKey: { wrapped, iv, wrapKey }, createdAt }
  }

  private async getRecord(id: KeySlot): Promise<DeviceKeyRecord | null> {
    return ((await this.tx("readonly", (s) => s.get(id))) as DeviceKeyRecord | undefined) ?? null
  }

  private async put(rec: DeviceKeyRecord) {
    await this.tx("readwrite", (s) => s.put(rec))
  }

  private info(r: DeviceKeyRecord): DeviceKeyInfo {
    return { id: r.id, publicKey: r.publicKey, impl: r.impl, accountId: r.accountId, createdAt: r.createdAt }
  }

  async get(id: KeySlot = "current"): Promise<DeviceKeyInfo | null> {
    const r = await this.getRecord(id)
    return r ? this.info(r) : null
  }

  /** Pre-generate the key for the next sign-in, on idle (D-21 steps 3-4). Idempotent. */
  async ensurePending(): Promise<DeviceKeyInfo> {
    const existing = await this.getRecord("pending")
    if (existing) return this.info(existing)
    const rec = await this.generate("pending")
    await this.put(rec)
    return this.info(rec)
  }

  /** After POST /api/session succeeds: the pending key becomes this account's current key. */
  async promotePending(accountId: string): Promise<DeviceKeyInfo> {
    const pending = (await this.getRecord("pending")) ?? (await this.generate("pending"))
    const current: DeviceKeyRecord = { ...pending, id: "current", accountId }
    await this.put(current)
    await this.tx("readwrite", (s) => s.delete("pending"))
    return this.info(current)
  }

  async markOnChain(at = this.now()) {
    const r = await this.getRecord("current")
    if (r) await this.put({ ...r, onChainVerifiedAt: at })
  }

  /** Sign raw bytes (for a delegate: the 32-byte sha256 near-api-js hands to signBytes, §4.3). */
  async sign(bytes: Uint8Array, id: KeySlot = "current"): Promise<Uint8Array> {
    const r = await this.getRecord(id)
    if (!r) throw new Error("no_device_key")
    if (r.impl === "webcrypto") {
      return new Uint8Array(await this.subtle.sign("Ed25519", r.privateKey as CryptoKey, buf(bytes)))
    }
    const w = r.privateKey as WrappedSeed
    const seed = new Uint8Array(await this.subtle.decrypt({ name: "AES-GCM", iv: buf(w.iv) }, w.wrapKey, w.wrapped))
    try {
      const { ed25519 } = await import("@noble/curves/ed25519.js")
      return ed25519.sign(bytes, seed)
    } finally {
      seed.fill(0)
    }
  }

  /** The PoP message bytes for POST /api/session (api-spec owns the exact format, ⚠️ §13 A2). */
  async popMessage(idToken: string, ts: number): Promise<Uint8Array> {
    const digest = new Uint8Array(await this.subtle.digest("SHA-256", buf(utf8(idToken))))
    return utf8(`${POP_PREFIX}|${base64urlnopad.encode(digest)}|${ts}`)
  }

  /** Proof of possession with the pending key (before promotion) or the current one. */
  async pop(idToken: string, ts = this.now(), id: KeySlot = "pending"): Promise<{ ts: number; sig: string; publicKey: PublicKeyStr }> {
    const r = await this.getRecord(id)
    if (!r) throw new Error("no_device_key")
    const sig = await this.sign(await this.popMessage(idToken, ts), id)
    return { ts, sig: base64urlnopad.encode(sig), publicKey: r.publicKey }
  }

  /**
   * The near-api-js Signer for delegates (F-08): @pot/sdk/sign's HashSigner over this key. near-api-js hashes the
   * NEP-461-prefixed delegate and hands the 32 bytes to signBytes → this.sign. Loaded lazily (the signing chunk,
   * D-42), never on first load.
   */
  async nearSigner(id: KeySlot = "current") {
    const r = await this.getRecord(id)
    if (!r) throw new Error("no_device_key")
    const { HashSigner } = await import("@pot/sdk/sign")
    return new HashSigner(r.publicKey, (hash) => this.sign(hash, id))
  }

  /** Sign-out: delete every record; the private half is destroyed (§4.3). */
  async clear() {
    await this.tx("readwrite", (s) => s.clear())
  }

  close() {
    void this.dbp?.then((db) => db.close())
    this.dbp = null
  }
}

/** Ask the browser to keep our storage (Safari's 7-day eviction, §4.3). Best effort. */
export async function persistStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

let shared: DeviceKeyStore | null = null
/** The app-wide store, or null where the browser can't hold a key (→ SignedOutScreen, signin.unsupported_browser). */
export function deviceKeys(): DeviceKeyStore | null {
  if (shared) return shared
  try {
    shared = new DeviceKeyStore()
  } catch {
    shared = null
  }
  return shared
}
