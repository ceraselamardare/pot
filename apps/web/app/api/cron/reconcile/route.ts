// GET /api/cron/reconcile (B-11; api-spec §2.10, §5.3): the daily safety net. Auth: Bearer CRON_SECRET
// (Vercel cron, production only; locally call it by hand). Single-flight; idempotent; JSON report.
import { relayDeps } from "@/server/deps"
import { route } from "@/server/http/context"
import { requireCron } from "@/server/ops/cron"
import { runReconcile } from "@/server/ops/reconcile"

export const maxDuration = 300

export const GET = route("GET /api/cron/reconcile", async (ctx) => {
  requireCron(ctx.req)
  const report = await runReconcile(relayDeps(), { holder: ctx.requestId, budgetMs: 280_000 })
  return ctx.json({ report })
})
