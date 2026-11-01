// GET /api/demo/state (X-08; api-spec §2.8): public JSON twin for judges; CORS *, cached 5 s.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { demoState } from "@/server/features/demoState"
import { route } from "@/server/http/context"

export const maxDuration = 15

export const GET = route("GET /api/demo/state", async (ctx) => {
  void ctx.req.headers.get("host") // request-time route (Cache Components)
  ctx.cacheControl = "public, s-maxage=5"
  ctx.demo = true
  ctx.headers.set("access-control-allow-origin", "*")
  return ctx.json(await demoState({ db: getDb(), hub: getHub(), cfg: getConfig() }))
})
