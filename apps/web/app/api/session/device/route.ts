// POST /api/session/device (B-07; api-spec §2.1): device-key re-login (K-2), no popup.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { defer, getRpc, getSubmitter } from "@/server/deps"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { deviceLoginReq } from "@/server/http/schemas"
import { deviceLogin } from "@/server/session/service"

export const maxDuration = 15

export const POST = route("POST /api/session/device", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, deviceLoginReq)
  const r = await deviceLogin(
    { db: getDb(), rpc: getRpc(), submitter: getSubmitter(), cfg: getConfig(), defer },
    value,
    { userAgent: ctx.req.headers.get("user-agent") },
  )
  for (const c of r.cookies) ctx.setCookie(c)
  return ctx.json(r.body, r.status)
})
