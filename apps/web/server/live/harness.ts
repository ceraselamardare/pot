// Shared harness for the LIVE testnet tests (*.live.test.ts, gated by LIVE_TESTNET=1): the real preview hub
// and token (notes/deploy.md), the preview key pools from apps/web/.keys/preview.env, a per-file schema in
// pot_test, real dev accounts (B-04) and real signed delegates through the relay pipeline. Testnet only.
// Never imported by app code.
import { existsSync, readFileSync } from "node:fs"
import { eq } from "drizzle-orm"
import { createChainViews, createRpcClient, testnetConfig, type ActionIntent, type SdkConfig } from "@pot/sdk"
import { KeyPairPotSigner, NonceTracker } from "@pot/sdk/sign"
import { KeyPair } from "near-api-js"
import { appUser, device } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createHubReader, type HubReader } from "../chain/hub"
import { loadKeys, resetKeyCacheForTests } from "../chain/keys"
import { createRpc, type RpcClient } from "../chain/rpc"
import { createSubmitter, type Submitter } from "../chain/submitter"
import { resetBalanceCacheForTests } from "../chain/balance"
import { loadConfig, setConfigForTests, type Config } from "../config"
import { ApiError } from "../http/errors"
import { relay, type Actor, type RelayDeps, type RelayResponse } from "../relay/pipeline"
import { popMessages } from "../session/pop"
import { devLogin } from "../session/service"
import { b64url, sha256Hex } from "../util/crypto"

const WEB = new URL("../../", import.meta.url)
export const KEYS_FILE = new URL(".keys/preview.env", WEB)
export const ENV_FILE = new URL(".env.local", WEB)
export const liveEnabled = process.env.LIVE_TESTNET === "1" && existsSync(KEYS_FILE) && existsSync(ENV_FILE)

function parse(f: URL): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const i = line.indexOf("=")
    if (i > 0 && !line.startsWith("#")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

export interface LiveUser {
  name: string
  accountId: string
  key: KeyPair
  actor: Actor
  signer: KeyPairPotSigner
}

export interface Live {
  t: TestDb
  cfg: Config
  sdkCfg: SdkConfig
  rpc: RpcClient
  hub: HubReader
  submitter: Submitter
  deps: RelayDeps
  /** after() work, started immediately (as Next does after the response) and awaited by drain() */
  drain: () => Promise<void>
  hashes: Record<string, string>
  close: () => Promise<void>
}

/** The live files that run in parallel, each with a disjoint slice of the *_LIVE pools. */
const LIVE_SLOTS = ["live_hub", "live_demo"]
export function liveSlice(csv: string, name: string): string {
  const keys = csv.split(",").filter(Boolean)
  const slots = Math.min(LIVE_SLOTS.length, keys.length)
  const slot = Math.max(0, LIVE_SLOTS.indexOf(name)) % slots
  return keys.filter((_, i) => i % slots === slot).join(",")
}

export async function setupLive(name: string): Promise<Live> {
  const env = { ...parse(ENV_FILE), ...parse(KEYS_FILE) }
  // Wave 3 (frontend request 4): live tests keep their own lease rows (pot_test schemas), so they must never
  // share relayer/treasury keys with a dev server or Playwright run: they use ONLY the *_LIVE pools, and each
  // live file gets its own slice (files run in parallel, each with its own lease table).
  if (!env.RELAYER_KEYS_LIVE || !env.TREASURY_KEYS_LIVE)
    throw new Error("RELAYER_KEYS_LIVE / TREASURY_KEYS_LIVE missing: scripts/run keys init-live, then scripts/with-testnet-lock.sh scripts/run keys onchain")
  process.env.RELAYER_KEYS = liveSlice(env.RELAYER_KEYS_LIVE, name)
  process.env.TREASURY_KEYS = liveSlice(env.TREASURY_KEYS_LIVE, name)
  for (const k of ["DEMO_PERSONA_KEY", "APP_HMAC_SECRET"]) if (env[k]) process.env[k] = env[k]
  for (const [k, v] of Object.entries(env)) if (k.startsWith("QUOTA_")) process.env[k] = v
  resetKeyCacheForTests()
  resetBalanceCacheForTests()
  const cfg = loadConfig({ ...env, VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://pot.test", RELAY_TEST_ALLOWLIST: "" })
  if (cfg.network !== "testnet" || !cfg.hubId.endsWith(".testnet")) throw new Error("live tests are testnet-only")
  setConfigForTests(cfg)
  const t = await createTestDb(name)
  const rpc = createRpc(cfg.rpcUrls, { timeoutMs: 15_000 })
  const hub = createHubReader(rpc, cfg.hubId)
  const submitter = createSubmitter({ db: t.db, rpc, pools: { relayer_key: loadKeys("RELAYER_KEYS"), treasury_key: loadKeys("TREASURY_KEYS") } })
  const pending: Promise<void>[] = []
  const defer = (fn: () => Promise<void>) => {
    pending.push(fn().catch((e) => console.error("after() failed", e)))
  }
  const deps: RelayDeps = { db: t.db, rpc, hub, submitter, cfg, defer }
  const root = cfg.hubId.replace(/^pots\./, "").replace(/\.testnet$/, "")
  const sdkCfg = testnetConfig(root, { hubId: cfg.hubId, usdcId: cfg.usdcId })
  const hashes: Record<string, string> = {}
  return {
    t,
    cfg,
    sdkCfg,
    rpc,
    hub,
    submitter,
    deps,
    hashes,
    async drain() {
      while (pending.length) await pending.shift()
    },
    async close() {
      while (pending.length) await pending.shift()
      await t.close()
    },
  }
}

const chainViews = new Map<string, ReturnType<typeof createChainViews>>()
function views(cfg: SdkConfig) {
  let v = chainViews.get(cfg.hubId)
  if (!v) chainViews.set(cfg.hubId, (v = createChainViews(cfg, createRpcClient({ urls: cfg.rpcUrls, budget: false, timeoutMs: 10_000 }))))
  return v
}

/** B-04: a dev session → a 0-NEAR `u-<8>.users.<root>` account whose only key is the device key. */
export async function devUser(L: Live, name: string): Promise<LiveUser> {
  const key = KeyPair.fromRandom("ed25519")
  const pk = key.getPublicKey().toString()
  const ts = Date.now()
  const sig = key.sign(new TextEncoder().encode(popMessages.dev_session(pk, ts))).signature
  const login = await devLogin(
    { db: L.t.db, rpc: L.rpc, submitter: L.submitter, cfg: L.cfg, defer: L.deps.defer },
    { devicePublicKey: pk, keyKind: "fallback", pop: { ts, sig: b64url(sig) }, displayName: name },
    { ipHash: `live-${name}`, userAgent: "vitest-live" },
  )
  const accountId = String(login.body.accountId)
  L.hashes[`create ${name}`] = String(login.body.createTxHash ?? "")
  const user = (await L.t.db.select().from(appUser).where(eq(appUser.nearAccount, accountId)))[0]!
  const dev = (await L.t.db.select().from(device).where(eq(device.userId, user.id)))[0]!
  const actor: Actor = { userId: user.id, accountId, kind: "dev", device: { publicKey: dev.publicKey, status: "active" } }
  const signer = new KeyPairPotSigner({ accountId, secretKey: key, chain: views(L.sdkCfg), cfg: L.sdkCfg, nonces: new NonceTracker() })
  // the access key must be visible before the first prepare()
  await eventually(() => views(L.sdkCfg).account.accessKey(accountId as never, pk as never), (v) => !!v.value)
  return { name, accountId, key, actor, signer }
}

/** Sign `intent` with the user's device key (@pot/sdk) and run the relay pipeline (POST /api/relay's core). */
export async function act(L: Live, u: LiveUser, intent: ActionIntent, label?: string): Promise<RelayResponse & { ms: number }> {
  const p = await u.signer.prepare(intent)
  const signed = await u.signer.sign(p)
  if (signed.via !== "relay") throw new Error("expected a relay body")
  const body = signed.body as Extract<typeof signed.body, { signedDelegate: string }>
  const t0 = Date.now()
  let r: RelayResponse
  try {
    r = await relay(L.deps, u.actor, {
      requestId: `req_live_${sha256Hex(body.idempotencyKey).slice(0, 10)}`,
      signedDelegate: body.signedDelegate,
      idempotencyKey: body.idempotencyKey,
      intent: body.intent,
      requestRef: body.requestRef,
      bodyHash: sha256Hex(JSON.stringify(body)),
    })
  } catch (e) {
    if (e instanceof ApiError) r = { status: e.status, body: { ok: false, reason: e.reason, detail: e.detail, txHash: e.txHash } }
    else throw e
  }
  const ms = Date.now() - t0
  if (label && r.body.txHash) L.hashes[label] = String(r.body.txHash)
  return { ...r, ms }
}

/** RPC nodes behind one URL can lag each other: poll a read until it matches. */
export async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 20_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await read().catch(() => undefined as T)
    if ((v !== undefined && ok(v)) || Date.now() > end) return v
    await new Promise((r) => setTimeout(r, 700))
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
