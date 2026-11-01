// Builds the backend's real dependencies (DB, failover RPC, hub reader, key-pool submitter, config) for
// scripts, from apps/web/.env.local + apps/web/.keys/preview.env. `after()` work is run inline and awaited
// by `drain()`, so a script sees the relayer's follow-ups (sync, retry_payout) before it exits.
import { createDb } from "@/db/client"
import { createHubReader } from "@/server/chain/hub"
import { loadKeys, resetKeyCacheForTests } from "@/server/chain/keys"
import { createRpc } from "@/server/chain/rpc"
import { createSubmitter } from "@/server/chain/submitter"
import { loadConfig, setConfigForTests } from "@/server/config"
import type { SeedDeps } from "@/server/features/seed"
import { loadEnv } from "./env.ts"

export function backend(opts: { databaseUrl?: string } = {}) {
  loadEnv()
  resetKeyCacheForTests()
  const cfg = loadConfig(process.env)
  setConfigForTests(cfg)
  if (cfg.network !== "testnet") throw new Error("testnet only")
  if (!cfg.hubId || !cfg.usdcId || !cfg.relayerAccountId || !cfg.treasuryAccountId) throw new Error("hub/usdc/relayer/treasury ids missing: run scripts/run env")
  const url = opts.databaseUrl ?? process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const { db, pool } = createDb(url)
  const rpc = createRpc(cfg.rpcUrls, { timeoutMs: 15_000 })
  const hub = createHubReader(rpc, cfg.hubId)
  const submitter = createSubmitter({
    db,
    rpc,
    pools: { [cfg.relayerPool]: loadKeys("RELAYER_KEYS"), [cfg.treasuryPool]: loadKeys("TREASURY_KEYS") },
  })
  const pending: Promise<void>[] = []
  const defer = (fn: () => Promise<void>) => {
    pending.push(fn().catch((e) => console.error("after() failed:", String(e).slice(0, 300))))
  }
  const personaKey = loadKeys("DEMO_PERSONA_KEY")[0]
  const secret = process.env.APP_HMAC_SECRET ?? ""
  if (secret.length < 32) throw new Error("APP_HMAC_SECRET missing (scripts/run keys init + env)")
  async function drain() {
    while (pending.length) await pending.shift()
  }
  return {
    cfg,
    db,
    pool,
    rpc,
    hub,
    submitter,
    defer,
    drain,
    seedDeps(log?: (l: string) => void): SeedDeps {
      if (!personaKey) throw new Error("DEMO_PERSONA_KEY missing")
      return { db, rpc, hub, submitter, cfg, defer, personaKey, secret, log }
    },
    async close() {
      await drain()
      await pool.end()
    },
  }
}
