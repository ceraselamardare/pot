// LIVE testnet test of the relayer core (B-03/B-10/X-09). Skipped unless LIVE_TESTNET=1 and
// apps/web/.keys/testnet.env exists (throwaway testnet keys, gitignored). It spends real testnet NEAR
// (≈ 0.01 NEAR per run: one throwaway 0-NEAR wallet account + registration + 3 relayed txs). Never mainnet.
//   LIVE_TESTNET=1 scripts/with-testnet-lock.sh pnpm --filter web exec vitest run server/live
// The hub isn't deployed yet, so the relayed call is a test-only allowlist rule (RELAY_TEST_ALLOWLIST):
// a 1-yocto `wrap.testnet.ft_transfer` (the same deposit path as R1's ft_transfer_call), plus an inner failure.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { existsSync, readFileSync } from "node:fs"
import { eq } from "drizzle-orm"
import { actions, buildDelegateAction, encodeSignedDelegate, KeyPairSigner, PublicKey } from "near-api-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appUser, relayLog } from "@/db/schema"
import { createTestDb, type TestDb } from "@/db/testing"
import { createTestAccounts, nep413SignIn, type TestAccounts } from "@/e2e/testnet/accounts"
import { createHubReader } from "../chain/hub"
import { loadKeys, resetKeyCacheForTests } from "../chain/keys"
import { block, viewAccessKey, viewAccessKeyList, viewAccount, viewFunction } from "../chain/near"
import { createRpc } from "../chain/rpc"
import { createSubmitter } from "../chain/submitter"
import { loadConfig, setConfigForTests, type Config } from "../config"
import { claimFaucet } from "../features/faucet"
import { walletLogin } from "../features/wallet/service"
import { relay, type Actor, type RelayDeps } from "../relay/pipeline"
import { loadSession } from "../session/store"
import { sha256Hex } from "../util/crypto"

const KEYS = new URL("../../.keys/testnet.env", import.meta.url)
const enabled = process.env.LIVE_TESTNET === "1" && existsSync(KEYS)
const TOKEN = "wrap.testnet"
const TGAS = 1_000_000_000_000n

/** RPC nodes behind one URL can lag each other by a block or two: poll a read until it matches. */
async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 15_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await read().catch(() => undefined as T)
    if ((v !== undefined && ok(v)) || Date.now() > end) return v
    await new Promise((r) => setTimeout(r, 700))
  }
}

describe.skipIf(!enabled)("LIVE testnet relay", () => {
  let t: TestDb
  let cfg: Config
  const hashes: Record<string, string> = {}

  beforeAll(async () => {
    for (const line of readFileSync(KEYS, "utf8").split("\n")) {
      const i = line.indexOf("=")
      if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i)] = line.slice(i + 1)
    }
    resetKeyCacheForTests()
    cfg = loadConfig({
      NEXT_PUBLIC_NETWORK: "testnet",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_APP_URL: "https://pot.test",
      // never touched here; NOT under the holding account, whose throwaway sub-accounts sign in below (wallet
      // sessions refuse accounts under the project root)
      HUB_ID: "pots.pot-relay-live.testnet",
      USDC_ID: TOKEN, // configurable token: wrap.testnet stands in for USDC (test)
      RELAYER_ACCOUNT_ID: process.env.RELAYER_ACCOUNT_ID,
      TREASURY_ACCOUNT_ID: process.env.TREASURY_ACCOUNT_ID,
      RELAY_TEST_ALLOWLIST: `${TOKEN}:ft_transfer:1:30`,
      RELAYER_FLOOR_NEAR: "0.1",
      RELAYER_CRITICAL_NEAR: "0.2",
      RELAYER_WARN_NEAR: "0.5",
      APP_HMAC_SECRET: "live-test-hmac-secret-0123456789abcdef",
    })
    setConfigForTests(cfg)
    process.env.APP_HMAC_SECRET = "live-test-hmac-secret-0123456789abcdef"
    t = await createTestDb("live")
  })
  afterAll(async () => {
    await t?.close()
    console.log("LIVE tx hashes:", JSON.stringify(hashes, null, 2))
  })

  let accounts: TestAccounts | undefined
  afterAll(async () => {
    await accounts?.release()
  })

  it("wallet session → faucet → relayed 1-yocto ft_transfer → inner failure → dedupe", { timeout: 240_000 }, async () => {
    const rpc = createRpc(cfg.rpcUrls, { timeoutMs: 15_000 })
    const submitter = createSubmitter({
      db: t.db,
      rpc,
      pools: { relayer_key: loadKeys("RELAYER_KEYS"), treasury_key: loadKeys("TREASURY_KEYS") },
    })
    const deferred: (() => Promise<void>)[] = []
    const defer = (fn: () => Promise<void>) => deferred.push(fn)

    // 1. B-10 wallet session (Rev 9): a throwaway 0-NEAR account with ONE full-access key signs "Sign in to Pot"
    //    (NEP-413); the relayer registers it on the token once, after the response
    accounts = await createTestAccounts(["Leo"])
    const leo = accounts.people[0]!
    const accountId = leo.accountId
    const devicePk = leo.publicKey
    const deviceKey = leo.keyPair
    const login = await walletLogin({ db: t.db, rpc, submitter, cfg, defer }, nep413SignIn(leo, "pot.test"), { ipHash: "live", userAgent: "vitest" })
    for (const fn of deferred.splice(0)) await fn() // registerOnce
    const acct = await eventually(() => viewAccount(rpc, accountId, "optimistic"), (a) => !!a)
    expect(acct?.amount).toBe("0") // NEP-448 zero-balance account
    const keys = await eventually(() => viewAccessKeyList(rpc, accountId), (k) => !!k && k.length > 0)
    expect(keys?.map((k) => k.public_key)).toEqual([devicePk])
    expect(keys?.[0]?.access_key.permission).toBe("FullAccess")
    const reg = (await t.db.select().from(relayLog).where(eq(relayLog.idempotencyKey, `register:${accountId}`)))[0]!
    hashes.registerToken = reg.outerTxHash!
    expect(reg.status).toBe("executed")

    // the session cookie works
    const cookie = login.cookies[0]!.split(";")[0]!
    const s = (await loadSession(t.db, new Request("https://pot.test", { headers: { cookie } }), cfg))!
    expect(s).toMatchObject({ kind: "wallet", pendingDevice: false })

    // 2. X-09 faucet from the treasury key pool (150_000_000 base units of the configured token)
    const f = await claimFaucet({ db: t.db, rpc, submitter, cfg }, s, { amount: "150000000", idempotencyKey: "live00000000faucet".slice(0, 16) }, { ipHash: "live", requestId: "req_live_faucet" })
    hashes.faucet = String(f.body.txHash)
    expect(f.body).toMatchObject({ amount: "150000000", registeredNow: false })
    const bal = () => viewFunction<string>(rpc, TOKEN, "ft_balance_of", { account_id: accountId })
    expect(await eventually(bal, (v) => v === "150000000")).toBe("150000000")

    // 3. B-03: the user signs a delegate (1 yocto ft_transfer); the relayer pays everything
    const user = (await t.db.select().from(appUser).where(eq(appUser.nearAccount, accountId)))[0]!
    const actor: Actor = { userId: user.id, accountId, kind: "wallet", device: null }
    const deps: RelayDeps = { db: t.db, rpc, hub: createHubReader(rpc, cfg.hubId), submitter, cfg, defer }
    let lastNonce = -1n
    const sign = async (amount: string) => {
      const ak = await eventually(() => viewAccessKey(rpc, accountId, devicePk, "optimistic"), (k) => !!k && k.nonce >= lastNonce)
      lastNonce = ak!.nonce + 1n
      const head = await block(rpc, { finality: "final" })
      const da = buildDelegateAction({
        senderId: accountId,
        receiverId: TOKEN,
        actions: [actions.functionCall("ft_transfer", { receiver_id: cfg.treasuryAccountId, amount }, 30n * TGAS, 1n)],
        nonce: ak!.nonce + 1n,
        maxBlockHeight: BigInt(head.height + 200),
        publicKey: PublicKey.from(devicePk),
      })
      const { signedDelegate } = await new KeyPairSigner(deviceKey).signDelegateAction(da)
      return Buffer.from(encodeSignedDelegate(signedDelegate)).toString("base64")
    }
    const send = async (b64: string, key: string) =>
      relay(deps, actor, { requestId: `req_${key}`, signedDelegate: b64, idempotencyKey: key, intent: "add_money", bodyHash: sha256Hex(b64 + key) })

    const okB64 = await sign("1000")
    const ok = await send(okB64, "liveok0000000001")
    hashes.relaySuccess = String(ok.body.txHash)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ outcome: "success", final: true, result: { type: "test", method: "ft_transfer" } })
    expect(Number(ok.body.executedAtBlock)).toBeGreaterThan(0)
    expect(await eventually(bal, (v) => v === "149999000")).toBe("149999000")
    expect((await viewAccount(rpc, accountId, "optimistic"))?.amount).toBe("0") // the user paid nothing, not even the yocto

    // 4. an inner failure: the top-level status says success, the receipt scan doesn't
    const bad = await send(await sign("999999999999"), "livebad000000001")
    hashes.relayInnerFailure = String(bad.body.txHash)
    expect(bad.status).toBe(200)
    expect(bad.body).toMatchObject({ outcome: "inner_failed", errorCode: "INSUFFICIENT_FUNDS" })

    // 5. the same signed delegate again (new key) → deduped by delegate_hash, no new tx
    const again = await send(okB64, "liveok0000000002")
    expect(again.body).toMatchObject({ replayed: true, txHash: ok.body.txHash })

    const rows = await t.db.select().from(relayLog).where(eq(relayLog.op, "relay"))
    expect(rows.filter((r) => r.status === "executed")).toHaveLength(2)
    for (const fn of deferred) await fn()
  })
})
