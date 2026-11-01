// POST /api/faucet (X-09; api-spec §2.4).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getRpc, getSubmitter } from "@/server/deps"
import { claimFaucet } from "@/server/features/faucet"
import { checkCsrf, ipHash, readJson, route } from "@/server/http/context"
import { faucetReq } from "@/server/http/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 30

export const POST = route("POST /api/faucet", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, faucetReq)
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg, { activeDevice: true })
  if (s.kind === "demo") ctx.demo = true
  const r = await claimFaucet({ db: getDb(), rpc: getRpc(), submitter: getSubmitter(), cfg }, s, value, {
    ipHash: ipHash(ctx.req),
    requestId: ctx.requestId,
  })
  return ctx.json(r.body, r.status)
})
