// GET /api/relay/[relayId] (B-09; api-spec §2.3): the stored outcome of a pending or past relay; owner only.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { relayDeps } from "@/server/deps"
import { ApiError } from "@/server/http/errors"
import { route } from "@/server/http/context"
import { getRelay } from "@/server/relay/status"
import { requireSession } from "@/server/session/store"

export const maxDuration = 30

export const GET = route<{ relayId: string }>("GET /api/relay/[relayId]", async (ctx, { relayId }) => {
  if (!/^rl_[0-9A-HJKMNP-TV-Z]{26}$/.test(relayId)) throw new ApiError("not_found")
  const s = await requireSession(getDb(), ctx.req, getConfig())
  if (s.kind === "demo") ctx.demo = true
  const r = await getRelay(relayDeps(), s.user.id, relayId, ctx.requestId)
  return ctx.raw({ ...r.body, requestId: ctx.requestId }, r.status)
})
