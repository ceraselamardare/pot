// POST /api/oneclick/simulate (B-14; api-spec §2.7, rev4 H-3): "Simulate sending" on testnet. Capped at $500 per
// session per UTC day ($150 in demo sessions) and inside the global faucet cap; delivery is real test money.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { oneclickDeps, simulateReq } from "@/server/features/oneclick/http"
import { simulate } from "@/server/features/oneclick/service"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 10

export const POST = route("POST /api/oneclick/simulate", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, simulateReq)
  const s = await requireSession(getDb(), ctx.req, getConfig(), { activeDevice: true })
  if (s.kind === "demo") ctx.demo = true
  return ctx.json(await simulate(oneclickDeps(), s, value))
})
