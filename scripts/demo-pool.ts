// B-12 demo pool by hand or from any cron (the same code as GET /api/cron/demo-pool, without HTTP). Testnet only;
// run it under the lock: scripts/with-testnet-lock.sh scripts/run demo-pool [flags]
//   (no flags)          retire expired leases, keep tonight's shared Pot, refill to DEMO_POOL_TARGET (≤ 3 seeds/run)
//   --target <n>        override DEMO_POOL_TARGET
//   --no-shared         skip the shared-Pot check
//   --status            demo_pot counts only
// Writes demo_pot / app_user / pot / feed_event rows in DATABASE_URL (apps/web/.env.local).
import { relayerAvailable } from "@/server/chain/balance"
import { ensureSharedPot, poolTarget, refillDemoPool, retireExpiredLeases } from "@/server/features/demoPool"
import { backend } from "./lib/backend.ts"
import { near } from "./lib/env.ts"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? "") : undefined
}
const b = backend()
const counts = async () =>
  (await b.pool.query<{ kind: string; state: string; n: number }>("SELECT kind, state, count(*)::int AS n FROM demo_pot GROUP BY kind, state ORDER BY kind, state")).rows
    .map((r) => `${r.kind}/${r.state}=${r.n}`)
    .join("  ")
try {
  console.log(`before: ${await counts()}`)
  if (!args.includes("--status")) {
    const t0 = Date.now()
    const deps = b.seedDeps(console.log)
    const holder = `script-${process.pid}`
    console.log("leases:", JSON.stringify(await retireExpiredLeases(b.db)))
    if (!args.includes("--no-shared")) console.log("shared:", JSON.stringify(await ensureSharedPot(deps, { holder })))
    await b.drain()
    const target = flag("target") ? Number(flag("target")) : poolTarget()
    const r = await refillDemoPool(deps, { holder, target, budgetMs: 30 * 60_000 })
    await b.drain()
    console.log("refill:", JSON.stringify(r))
    console.log(`after: ${await counts()}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    console.log(`relayer available: ${near(await relayerAvailable(b.rpc, b.cfg.relayerAccountId, 0))} NEAR`)
  }
} finally {
  await b.close()
}
