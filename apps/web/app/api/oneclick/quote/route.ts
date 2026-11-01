// POST /api/oneclick/quote (B-14; api-spec §2.7): dry = a real signed 1Click quote (read-only); otherwise a
// deposit intent (simulated on testnet: a labelled address that must never receive funds).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { oneclickDeps, quoteReq } from "@/server/features/oneclick/http"
import { createQuote } from "@/server/features/oneclick/service"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 30

export const POST = route("POST /api/oneclick/quote", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, quoteReq)
  const s = await requireSession(getDb(), ctx.req, getConfig(), { activeDevice: true })
  if (s.kind === "demo") ctx.demo = true
  return ctx.json(await createQuote(oneclickDeps(), s, value))
})
