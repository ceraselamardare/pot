// POST /api/oneclick/price (any coin, 2026-11-04): the coin step's live dry quote, "Send about 0.008638 ETH → about
// $20.00 arrives". Read-only on 1Click (dry: true; the simulator's placeholder recipient on testnet, the person's own
// account in real mode); no Pot, so people paying in from outside use it too. Charged to the daily dry-quote quota.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { oneclickDeps, priceReq } from "@/server/features/oneclick/http"
import { priceQuote } from "@/server/features/oneclick/service"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 20

export const POST = route("POST /api/oneclick/price", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, priceReq)
  const s = await requireSession(getDb(), ctx.req, getConfig())
  return ctx.json(await priceQuote(oneclickDeps(), s, value))
})
