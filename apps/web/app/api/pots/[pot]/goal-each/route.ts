// PUT /api/pots/[pot]/goal-each: a member sets or clears the group's "about $X each" (goalEachPutReq: micro-USD or
// null). Members only; active device; CSRF; strict body.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { putGoalEach } from "@/server/features/goal-each"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { goalEachPutReq } from "@/server/http/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const PUT = route<{ pot: string }>("PUT /api/pots/[pot]/goal-each", async (ctx, { pot }) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, goalEachPutReq)
  const deps = { db: getDb(), hub: getHub(), cfg: getConfig() }
  const s = await requireSession(deps.db, ctx.req, deps.cfg, { activeDevice: true })
  return ctx.json(await putGoalEach(deps, s, pot, value))
})
