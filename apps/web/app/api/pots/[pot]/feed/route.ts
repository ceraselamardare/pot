// GET /api/pots/[pot]/feed (X-05; api-spec §2.5). `[pot]` is a slug or a DAO id.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { getFeed } from "@/server/features/feed"
import { ApiError } from "@/server/http/errors"
import { route } from "@/server/http/context"
import { loadSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route<{ pot: string }>("GET /api/pots/[pot]/feed", async (ctx, { pot }) => {
  const url = new URL(ctx.req.url)
  const limitRaw = url.searchParams.get("limit")
  if (limitRaw !== null && !/^[0-9]{1,3}$/.test(limitRaw)) throw new ApiError("bad_request", { detail: { field: "limit" } })
  const cfg = getConfig()
  const s = await loadSession(getDb(), ctx.req, cfg)
  const r = await getFeed({ db: getDb(), hub: getHub(), cfg }, s, pot, {
    before: url.searchParams.get("before") ?? undefined,
    limit: limitRaw ? Number(limitRaw) : undefined,
  })
  ctx.cacheControl = r.cacheControl
  return ctx.json(r.body)
})
