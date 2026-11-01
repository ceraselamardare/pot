// GET /api/cron/reconcile (B-11; api-spec §2.10, §5.3): the daily safety net. Auth: Bearer CRON_SECRET
// (Vercel cron, production only; locally call it by hand). Single-flight; idempotent; JSON report.
import { loadKeys } from "@/server/chain/keys"
import { relayDeps } from "@/server/deps"
import { route } from "@/server/http/context"
import { requireCron } from "@/server/ops/cron"
import { runReconcile } from "@/server/ops/reconcile"
import { hmacSecret } from "@/server/secrets"

export const maxDuration = 300

export const GET = route("GET /api/cron/reconcile", async (ctx) => {
  requireCron(ctx.req)
  const deps = relayDeps()
  const personaKey = loadKeys("DEMO_PERSONA_KEY")[0]
  const seed = personaKey ? { ...deps, personaKey, secret: hmacSecret() } : null
  const demo = new URL(ctx.req.url).searchParams.get("demo") !== "0"
  const report = await runReconcile({ ...deps, seed }, { holder: ctx.requestId, budgetMs: 280_000, demo })
  return ctx.json({ report })
})
