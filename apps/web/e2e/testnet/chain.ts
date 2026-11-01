// Chain assertions for the testnet tier: the same @pot/sdk views the app uses, read directly from RPC
// (FastNEAR → dRPC), so every UI claim is checked against the chain. Ids default to the preview deploy
// (notes/deploy.md) and can be overridden with E2E_HUB_ID / E2E_USDC_ID.
import { createChainViews, createRpcClient, testnetConfig, type ChainViews } from "@pot/sdk"
import type { APIRequestContext, BrowserContext } from "@playwright/test"
import { expect } from "@playwright/test"

export const HUB_ID = process.env.E2E_HUB_ID ?? "pots.potprev.testnet"
export const USDC_ID = process.env.E2E_USDC_ID ?? "usdc.potprev.testnet"

const cfg = testnetConfig("potprev", { hubId: HUB_ID, usdcId: USDC_ID })
// FastNEAR first here (the browsers read dRPC first in this tier, see playwright.config.ts)
const rpc = createRpcClient({ urls: cfg.rpcUrls, budget: false })
export const chain: ChainViews = createChainViews(cfg, rpc)

/** The account's own NEAR (yocto), final. */
export async function nearBalance(account: string): Promise<bigint> {
  const r = await rpc.call<{ amount: string }>("query", { request_type: "view_account", finality: "final", account_id: account })
  return BigInt(r.amount)
}

export const dao = (slug: string) => `${slug}.${HUB_ID}` as never
export const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n

/** Poll a chain read until it matches (views are `final`, ≈ 1-3 s behind). */
export async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 30_000): Promise<T> {
  const end = Date.now() + timeoutMs
  let last: T | undefined
  for (;;) {
    try {
      last = await read()
      if (ok(last)) return last
    } catch {
      /* retry */
    }
    if (Date.now() > end) break
    await new Promise((r) => setTimeout(r, 1500))
  }
  expect(last, "chain value never matched").toBe("<matching value>")
  return last as T
}

export const potBalance = async (slug: string) => (await chain.usdc.balanceOf(dao(slug))).value
export const usdcOf = async (account: string) => (await chain.usdc.balanceOf(account as never)).value

/** The signed-in account of a browser context (GET /api/session with its cookies). */
export async function accountOf(request: APIRequestContext): Promise<string> {
  const r = await request.get("/api/session")
  const j = (await r.json()) as { session: { accountId: string } | null }
  expect(j.session, "signed in").not.toBeNull()
  return j.session!.accountId
}

/** Copy the demo visitor cookie (HttpOnly) from one context to another: same lease, own session (§4.6 rev3). */
export async function shareVisitor(from: BrowserContext, to: BrowserContext): Promise<void> {
  const v = (await from.cookies()).filter((c) => c.name.includes("pot_demo_visitor"))
  expect(v.length, "a demo visitor cookie").toBeGreaterThan(0)
  await to.addCookies(v)
}
