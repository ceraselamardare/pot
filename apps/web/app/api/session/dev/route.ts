// POST /api/session/dev (B-04; api-spec §2.1): preview/local only. 404 unless FLAG_DEV_SESSION=true AND
// VERCEL_ENV !== 'production' AND NEXT_PUBLIC_NETWORK=testnet; the production check ignores the flag.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { defer, getRpc, getSubmitter } from "@/server/deps"
import { ApiError } from "@/server/http/errors"
import { checkCsrf, ipHash, readJson, route } from "@/server/http/context"
import { devSessionReq } from "@/server/http/schemas"
import { devLogin, devSessionEnabled } from "@/server/session/service"

export const maxDuration = 30

export const POST = route("POST /api/session/dev", async (ctx) => {
  const cfg = getConfig()
  if (!devSessionEnabled(cfg)) throw new ApiError("not_found")
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, devSessionReq)
  const r = await devLogin(
    { db: getDb(), rpc: getRpc(), submitter: getSubmitter(), cfg, defer },
    value,
    { ipHash: ipHash(ctx.req), userAgent: ctx.req.headers.get("user-agent") },
  )
  for (const c of r.cookies) ctx.setCookie(c)
  return ctx.json(r.body, r.status)
})
