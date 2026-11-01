// Throwaway testnet accounts for the gated testnet tiers (Rev 9: there is no test-account sign-in any more; tests
// sign in like a person with a NEAR wallet). Used by e2e/testnet/*.testnet.ts, server/live/harness.ts and
// scripts/e2e-chain.ts. Testnet only; every caller runs under scripts/with-testnet-lock.sh.
//
//   1. a run parent `e2e-<run>.<funds>`: CreateAccount + Transfer(parentNear(n)) + AddKey, signed by the holding
//      account through near-cli-rs from its LEGACY keychain (~/.near-credentials/testnet/<funds>.json). The holding
//      key is never read here; the parent's key is generated in memory and never written anywhere.
//   2. each person `<name>.e2e-<run>.<funds>` (so the app shows "Ana", "Ben"…): 0 NEAR (NEP-448), ONE full-access key
//      generated in memory, created by the parent. Not under the project root, so POST /api/session/wallet accepts it;
//      the relayer pays the USDC registration, gas and deposits exactly as for any wallet user.
//   3. release(): the parent is deleted with the holding account as beneficiary (its unspent NEAR goes back).
import { spawnSync } from "node:child_process"
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, type KeyPairString } from "near-api-js"
import { makeNonce, nep413Hash, SIGN_IN_MESSAGE, toBase64 } from "../../server/features/wallet/nep413"

/** The testnet holding account (CLAUDE.md); its full-access key lives in the near-cli-rs legacy keychain. */
export const FUNDS_ACCOUNT = process.env.E2E_FUNDS_ACCOUNT ?? "pot-funds-65k8.testnet"
/** A CreateAccount + AddKey from the parent burns ≈ 0.0070 NEAR on testnet (measured 2026-11-01); keep a margin. */
export const NEAR_PER_ACCOUNT = 0.0085
/** What the run parent gets: its own storage (≈ 0.0018) + one creation per person; release() returns the rest. */
export const parentNear = (people: number) => process.env.E2E_PARENT_NEAR ?? (0.004 + NEAR_PER_ACCOUNT * people).toFixed(4)
const RPC_URLS = ["https://rpc.testnet.fastnear.com", "https://near-testnet.drpc.org"]
const SETTLE_MS = 8_000

export interface TestKey {
  /** 32-byte ed25519 seed, hex: what the e2e mock wallet signs with (localStorage['pot.e2e.wallet']) */
  seedHex: string
  publicKey: string
  keyPair: KeyPair
}

export interface TestAccount extends TestKey {
  name: string
  accountId: string
}

export interface TestAccounts {
  parent: string
  people: TestAccount[]
  /** deletes the parent: what it didn't spend goes back to the holding account */
  release(): Promise<void>
}

export function newTestKey(): TestKey {
  const seed = ed25519.utils.randomSecretKey()
  const pub = ed25519.getPublicKey(seed)
  const secret = new Uint8Array(64)
  secret.set(seed, 0)
  secret.set(pub, 32)
  return {
    seedHex: Buffer.from(seed).toString("hex"),
    publicKey: `ed25519:${base58.encode(pub)}`,
    keyPair: KeyPair.fromString(`ed25519:${base58.encode(secret)}` as KeyPairString),
  }
}

/** What a NEAR wallet sends after signing "Sign in to Pot" (NEP-413): the POST /api/session/wallet body. */
export function nep413SignIn(a: TestKey & { accountId: string }, recipient: string) {
  const nonce = makeNonce()
  const signature = ed25519.sign(nep413Hash({ message: SIGN_IN_MESSAGE, nonce, recipient }), Buffer.from(a.seedHex, "hex"))
  return { accountId: a.accountId, publicKey: a.publicKey, signature: toBase64(signature), nonce: toBase64(nonce), message: SIGN_IN_MESSAGE, recipient }
}

async function rpc<T>(method: string, params: unknown, urls: readonly string[] = RPC_URLS): Promise<T> {
  let last: unknown
  for (let round = 0; round < 4; round++)
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
        if (res.status === 429 || res.status >= 500) throw new Error(`${url}: HTTP ${res.status}`)
        const j = (await res.json()) as { result?: T; error?: unknown }
        if (j.error) throw Object.assign(new Error(JSON.stringify(j.error).slice(0, 300)), { rpc: true })
        return j.result as T
      } catch (e) {
        last = e
        if ((e as { rpc?: boolean }).rpc) throw e
      }
      await new Promise((r) => setTimeout(r, 500 * (round + 1)))
    }
  throw last
}

/**
 * Poll until `account` has `publicKey` as an access key (final) on EVERY provider, ≤ 60 s: the app's server checks the
 * key at sign-in through its own failover list, and a node that lags a few blocks would refuse a seconds-old account.
 */
export async function waitForKey(account: string, publicKey: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms
  const seen = (url: string) =>
    rpc<{ nonce: number }>("query", { request_type: "view_access_key", finality: "final", account_id: account, public_key: publicKey }, [url])
      .then(() => true)
      .catch(() => false)
  for (;;) {
    const ok = (await Promise.all(RPC_URLS.map(seen))).every(Boolean)
    if (ok) return
    if (Date.now() > end) throw new Error(`access key of ${account} never appeared`)
    await new Promise((r) => setTimeout(r, 1500))
  }
}

function nearCli(args: string[]): { ok: boolean; out: string; txHash: string | null } {
  const r = spawnSync("npx", ["-y", "near-cli-rs@0.30.1", ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`
  return { ok: r.status === 0 && !/\bError\b|panicked/.test(out), out, txHash: out.match(/Transaction ID: ([1-9A-HJ-NP-Za-km-z]{43,44})/)?.[1] ?? null }
}

/**
 * Creates the run parent and one 0-NEAR account per name. `log` gets one line per transaction (explorer hash),
 * never a key.
 */
export async function createTestAccounts(names: string[], log: (line: string) => void = console.log): Promise<TestAccounts> {
  if (process.env.NEXT_PUBLIC_NETWORK === "mainnet") throw new Error("test accounts are testnet-only")
  const run = Math.random().toString(36).slice(2, 8)
  const parent = `e2e-${run}.${FUNDS_ACCOUNT}`
  const parentKey = newTestKey()
  const fund = parentNear(names.length)
  const args = [
    "account", "create-account", "fund-myself", parent, `${fund} NEAR`,
    "use-manually-provided-public-key", parentKey.publicKey,
    "sign-as", FUNDS_ACCOUNT, "network-config", "testnet", "sign-with-legacy-keychain", "send",
  ]
  // two callers at once (the live test files run in parallel) can sign with the same holding-key nonce: retry
  let created = nearCli(args)
  for (let i = 0; !created.ok && /nonce/i.test(created.out) && i < 4; i++) {
    await new Promise((r) => setTimeout(r, 2_000 + Math.random() * 4_000))
    created = nearCli(args)
  }
  if (!created.ok) throw new Error(`creating ${parent} from ${FUNDS_ACCOUNT} failed: ${created.out.split("\n").filter((l) => /error|Error/.test(l)).slice(0, 4).join(" | ")}`)
  log(`[accounts] ${parent} (${fund} NEAR from ${FUNDS_ACCOUNT}) tx ${created.txHash}`)
  await waitForKey(parent, parentKey.publicKey)

  const parentAccount = new Account(parent, new JsonRpcProvider({ url: RPC_URLS[0]! }), new KeyPairSigner(parentKey.keyPair))
  const release = async () => {
    try {
      const tx = await parentAccount.deleteAccount(FUNDS_ACCOUNT)
      log(`[accounts] ${parent} deleted, the rest back to ${FUNDS_ACCOUNT} tx ${tx.transaction.hash}`)
    } catch (e) {
      log(`[accounts] could not delete ${parent}: ${String(e).slice(0, 200)}`)
    }
  }
  const people: TestAccount[] = []
  try {
    for (const name of names) {
      const key = newTestKey()
      const accountId = `${name.toLowerCase()}.${parent}`
      const tx = await parentAccount.createSubAccount({ accountOrPrefix: accountId, publicKey: key.publicKey, nearToTransfer: 0n })
      log(`[accounts] ${accountId} (0 NEAR, one full-access key) tx ${tx.transaction.hash}`)
      people.push({ ...key, name, accountId })
    }
    for (const p of people) await waitForKey(p.accountId, p.publicKey)
    // the providers load-balance over several nodes: give the slower ones a few blocks before the app's server asks
    await new Promise((r) => setTimeout(r, SETTLE_MS))
  } catch (e) {
    await release()
    throw e
  }
  return { parent, people, release }
}
