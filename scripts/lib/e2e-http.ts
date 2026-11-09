// The backend E2E's HTTP side (scripts/e2e-chain.ts, and its --reference story in scripts/lib/reference-story.ts):
// a cookie jar per person, NEP-413 wallet sessions, delegates signed with @pot/sdk and relayed by POST /api/relay,
// and a log that prints every tx hash. Testnet only; every caller runs under scripts/with-testnet-lock.sh.
import { createChainViews, createRpcClient, testnetConfig, type ActionIntent, type Api, type ProposalKind } from "@pot/sdk"
import { KeyPairPotSigner, NonceTracker } from "@pot/sdk/sign"
import { nep413SignIn, type TestAccount } from "@/e2e/testnet/accounts"
import { IDS, sleep, txUrl, view } from "./env.ts"

/** The allowed origin of a local (non-Vercel) server, api-spec §0.2; also the NEP-413 recipient. */
export const ORIGIN = "http://localhost:3000"
/** Dollars → USDC micro units. */
export const $ = (n: number) => BigInt(Math.round(n * 1e6))

export function assert(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${what}`)
}

export interface User {
  name: string
  account: string
  jar: Map<string, string>
  signer: KeyPairPotSigner
}

export interface HttpRes {
  status: number
  body: Record<string, unknown>
}

export interface Relayed {
  body: Record<string, unknown>
  result: Record<string, unknown>
  txHash: string
  firstMs: number
  finalMs: number
  first: Record<string, unknown>
}

export const bal = (a: string) => view<string>(IDS.usdc, "ft_balance_of", { account_id: a }).then(BigInt)
export const kindOf = async (pot: string, id: number) => (await view<{ kind: ProposalKind }>(pot, "get_proposal", { id })).kind

export function createE2E(base: string) {
  const sdkCfg = testnetConfig(IDS.root.replace(/\.testnet$/, ""), { hubId: IDS.hub, usdcId: IDS.usdc })
  const chain = createChainViews(sdkCfg, createRpcClient({ urls: sdkCfg.rpcUrls, budget: false, timeoutMs: 10_000 }))
  const t0 = Date.now()
  const txs: [string, string][] = []

  function log(line: string) {
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s] ${line}`)
  }
  function tx(label: string, hash: unknown) {
    if (typeof hash === "string" && hash) {
      txs.push([label, hash])
      log(`  tx ${label}: ${txUrl(hash)}`)
    }
  }

  async function http(u: User | null, method: string, path: string, body?: unknown): Promise<HttpRes> {
    const headers: Record<string, string> = { origin: ORIGIN }
    if (body !== undefined) headers["content-type"] = "application/json"
    if (u?.jar.size) headers.cookie = [...u.jar].map(([k, v]) => `${k}=${v}`).join("; ")
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";")
      const i = kv!.indexOf("=")
      if (u) u.jar.set(kv!.slice(0, i), kv!.slice(i + 1))
    }
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      json = { raw: text.slice(0, 300) }
    }
    return { status: res.status, body: json }
  }

  /** NEP-413 "Sign in to Pot" with the account's full-access key → POST /api/session/wallet (a wallet session). */
  async function walletSession(a: TestAccount): Promise<User> {
    const u: User = { name: a.name, account: a.accountId, jar: new Map(), signer: undefined as never }
    const r = await http(u, "POST", "/api/session/wallet", nep413SignIn(a, new URL(ORIGIN).host))
    assert(r.status === 200, `wallet session ${a.name}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    u.signer = new KeyPairPotSigner({ accountId: a.accountId, secretKey: a.keyPair, chain, cfg: sdkCfg, nonces: new NonceTracker() })
    // APP-2 (security audit 2026-11-04): sign-in pays no token registration any more; the faucet (and creating or
    // joining a Pot) registers the account when it first needs to receive money
    log(`${a.name}: ${a.accountId} (0 NEAR, one full-access key)`)
    return u
  }

  /** Sign an intent with the device key and POST /api/relay; a 202 or an early answer is polled to final. */
  async function relay(u: User, intent: ActionIntent, label: string, opts: { wantFinal?: boolean; context?: Api.RelayContext } = {}): Promise<Relayed> {
    const p = await u.signer.prepare(intent)
    const s = await u.signer.sign(p)
    if (s.via !== "relay") throw new Error("expected a relay body")
    const started = Date.now()
    let r = await http(u, "POST", "/api/relay", opts.context ? { ...s.body, context: opts.context } : s.body)
    const firstMs = Date.now() - started
    const first = r
    while ((r.status === 202 || r.body.final === false) && opts.wantFinal !== false && Date.now() - started < 30_000) {
      await sleep(r.status === 202 ? 1_500 : 500)
      r = await http(u, "GET", `/api/relay/${String(first.body.relayId)}`)
    }
    const finalMs = Date.now() - started
    assert(r.status === 200 && r.body.outcome === "success", `${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 500)}`)
    tx(label, r.body.txHash)
    return { body: r.body, result: r.body.result as Record<string, unknown>, txHash: String(r.body.txHash), firstMs, finalMs, first: first.body }
  }

  return { base, sdkCfg, chain, t0, txs, log, tx, http, walletSession, relay }
}

export type E2E = ReturnType<typeof createE2E>
