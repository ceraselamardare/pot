// GET /api/me/activity?before=<cursor>&limit=<1-100>: the signed-in person's own history across their Pots
// (server/features/activity.ts). Session only; private, never cached. Other people's names only for Pots the
// person is still in (hub.get_members).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { getMyActivity } from "@/server/features/activity"
import { ApiError } from "@/server/http/errors"
import { route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route("GET /api/me/activity", async (ctx) => {
  const url = new URL(ctx.req.url)
  const limitRaw = url.searchParams.get("limit")
  if (limitRaw !== null && !/^[0-9]{1,3}$/.test(limitRaw)) throw new ApiError("bad_request", { detail: { field: "limit" } })
  const before = url.searchParams.get("before") ?? undefined
  if (before !== undefined && (before.length === 0 || before.length > 200)) throw new ApiError("bad_request", { detail: { field: "before" } })
  const s = await requireSession(getDb(), ctx.req, getConfig())
  const r = await getMyActivity({ db: getDb(), hub: getHub() }, s, { before, limit: limitRaw ? Number(limitRaw) : undefined })
  ctx.cacheControl = "private, no-store"
  return ctx.json(r.body)
})
