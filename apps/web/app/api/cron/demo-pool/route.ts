// GET /api/cron/demo-pool (B-12; api-spec §5.2): retire expired leases, keep tonight's shared Pot, refill the
// pool to DEMO_POOL_TARGET (≤ 3 seeds per run, resumable). Auth: Bearer CRON_SECRET. Called by Vercel cron,
// by POST /api/demo/session's after() when fewer than 3 Pots are ready, and by hand (scripts/run demo-pool is
// the same code without HTTP). `?shared=0` skips the shared-Pot check.
import { loadKeys } from "@/server/chain/keys"
import { relayDeps } from "@/server/deps"
import { ensureSharedPot, refillDemoPool, retireExpiredLeases } from "@/server/features/demoPool"
import { unavailable } from "@/server/http/errors"
import { route } from "@/server/http/context"
import { requireCron } from "@/server/ops/cron"
import { hmacSecret } from "@/server/secrets"

export const maxDuration = 300

export const GET = route("GET /api/cron/demo-pool", async (ctx) => {
  requireCron(ctx.req)
  const personaKey = loadKeys("DEMO_PERSONA_KEY")[0]
  if (!personaKey) throw unavailable("maintenance", 60_000, { why: "no_persona_key" })
  const deps = { ...relayDeps(), personaKey, secret: hmacSecret() }
  const started = Date.now()
  const budget = 280_000
  const leases = await retireExpiredLeases(deps.db)
  const shared =
    new URL(ctx.req.url).searchParams.get("shared") === "0"
      ? undefined
      : await ensureSharedPot(deps, { holder: ctx.requestId, budgetMs: budget })
  const refill = await refillDemoPool(deps, { holder: ctx.requestId, budgetMs: budget - (Date.now() - started) })
  return ctx.json({ leases, shared, refill })
})
