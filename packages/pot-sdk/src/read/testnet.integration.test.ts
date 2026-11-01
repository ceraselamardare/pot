// [testnet] Read-only integration: real view calls over FastNEAR → dRPC. No transactions.
// Skipped unless POT_SDK_TESTNET=1:  pnpm --filter @pot/sdk test:testnet
import { describe, expect, it } from "vitest"
import { testnetConfig, TESTNET_RPC_URLS } from "../config.ts"
import type { AccountId, DaoId, PublicKeyStr } from "../types/ids.ts"
import { BannedRpcUrlError, RpcViewError, createRpcClient } from "./rpc.ts"
import { createChainViews } from "./views.ts"

const RUN = process.env.POT_SDK_TESTNET === "1"
/**
 * The Phase-1 spike DAO from sputnikv2.testnet (v3.31 code, member + rulebot roles). The spike's
 * Ea8t… global-code DAO (g1.potspike-dao-svuw.testnet) was deleted when the spike accounts were
 * swept (decisions Rev 7), so no live Ea8t DAO exists to read until our hub creates one.
 */
const SPIKE_DAO = "potspike-dao-svuw.sputnikv2.testnet" as DaoId

describe.skipIf(!RUN)("[testnet] read-only views", { timeout: 30_000 }, () => {
  const rpc = createRpcClient({ urls: TESTNET_RPC_URLS })
  // wrap.testnet stands in for the token: same NEP-141/145 views as usdc.<root>
  const views = createChainViews(testnetConfig("potapp", { usdcId: "wrap.testnet" }), rpc)

  it("wrap.testnet ft_metadata / ft_balance_of / storage_balance_of", async () => {
    const m = await views.usdc.metadata()
    expect(m.value).toMatchObject({ spec: "ft-1.0.0", symbol: "wNEAR", decimals: 24 })
    expect(m.blockHeight).toBeGreaterThan(200_000_000)
    expect(typeof (await views.usdc.balanceOf("wrap.testnet" as AccountId)).value).toBe("bigint")
    expect((await views.usdc.isRegistered("no-such-account-pot-sdk-123.testnet" as AccountId)).value).toBe(false)
  })

  it("sputnikv2.testnet factory views", async () => {
    const n = await rpc.viewFunction<number>("sputnikv2.testnet", "get_number_daos")
    expect(n.value).toBeGreaterThan(5000)
    const h = await rpc.viewFunction<string>("sputnikv2.testnet", "get_default_code_hash")
    expect(h.value).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/)
  })

  it("a factory DAO (v3.31): get_policy, get_last_proposal_id, get_proposals (numeric vote_counts)", async () => {
    const daos = await rpc.viewFunction<string[]>("sputnikv2.testnet", "get_daos", { from_index: 0, limit: 1 })
    const dao = daos.value[0] as DaoId
    const pol = await views.dao.getPolicy(dao)
    expect(pol.value.proposalPeriodNs).toBeGreaterThan(0n)
    const last = (await views.dao.getLastProposalId(dao)).value
    expect(last).toBeGreaterThanOrEqual(0)
    const ps = (await views.dao.getProposals(dao, Math.max(0, last - 2), 2)).value
    for (const p of ps) {
      expect(typeof p.submissionTimeNs).toBe("bigint")
      for (const c of Object.values(p.voteCounts)) expect(c.every((x) => typeof x === "number")).toBe(true)
    }
  })

  it("the spike DAO (v3.31): roles, proposals, ERR_NO_PROPOSAL → null, no actions log on v3.31", async () => {
    const pol = (await views.dao.getPolicy(SPIKE_DAO)).value
    expect(pol.raw.roles.length).toBeGreaterThan(0)
    expect(pol.proposalPeriodNs).toBeGreaterThan(0n)
    const last = (await views.dao.getLastProposalId(SPIKE_DAO)).value
    expect(last).toBeGreaterThan(0)
    const p = (await views.dao.getProposal(SPIKE_DAO, last - 1)).value
    expect(p?.id).toBe(last - 1)
    expect(typeof p?.submissionTimeNs).toBe("bigint")
    expect((await views.dao.getProposal(SPIKE_DAO, last + 1000)).value).toBeNull() // ERR_NO_PROPOSAL → null
    const e = await views.dao.getActionsLog(SPIKE_DAO).catch((x: unknown) => x)
    expect((e as RpcViewError).code).toBe("METHOD_NOT_FOUND") // get_actions_log exists on 278adc7 / v3.2 only
  })

  it("access keys and head", async () => {
    const missing = await views.account.accessKey("sputnikv2.testnet" as AccountId, "ed25519:7CUDgW32nTdWTSCuZxF1TXBp6aXmJR5o6Zc4TVcdgLZh" as PublicKeyStr)
    expect(missing.value).toBeNull()
    const head = await views.account.head()
    expect(head.blockHeight).toBeGreaterThan(200_000_000)
  })

  it("errors don't fail over: unknown account, missing method", async () => {
    const e1 = await rpc.viewFunction("no-such-account-pot-sdk-123.testnet", "x").catch((e: unknown) => e)
    expect(e1).toBeInstanceOf(RpcViewError)
    expect((e1 as RpcViewError).code).toBe("UNKNOWN_ACCOUNT")
    const e2 = await rpc.viewFunction("wrap.testnet", "no_such_method").catch((e: unknown) => e)
    expect((e2 as RpcViewError).code).toBe("METHOD_NOT_FOUND")
    const e3 = await rpc.viewFunction("wrap.testnet", "ft_balance_of", {}).catch((e: unknown) => e)
    expect((e3 as RpcViewError).code).toBe("CONTRACT_PANIC")
  })

  it("failover: a dead first endpoint falls over to a live one, then sticks", async () => {
    const seen: string[] = []
    const client = createRpcClient({ urls: ["http://127.0.0.1:9", TESTNET_RPC_URLS[0]], timeoutMs: 3000, onFailover: (from) => seen.push(from) })
    const v = await client.viewFunction<{ symbol: string }>("wrap.testnet", "ft_metadata")
    expect(v.value.symbol).toBe("wNEAR")
    expect(seen).toEqual(["http://127.0.0.1:9"])
    await client.viewFunction("wrap.testnet", "ft_metadata")
    expect(client.stats()).toMatchObject({ failovers: 1, activeUrl: TESTNET_RPC_URLS[0] })
    // and dRPC alone works as the backup
    const drpc = createRpcClient({ urls: [TESTNET_RPC_URLS[1]] })
    expect((await drpc.viewFunction<number>("sputnikv2.testnet", "get_number_daos")).value).toBeGreaterThan(5000)
  })

  it("refuses the deprecated endpoint before any request", () => {
    expect(() => createRpcClient({ urls: [["https://rpc", "testnet", "near", "org"].join(".")] })).toThrow(BannedRpcUrlError)
  })
})
