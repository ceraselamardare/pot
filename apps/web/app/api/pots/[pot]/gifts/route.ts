// GET /api/pots/[pot]/gifts: every received gift with the givers' names and notes, the totals and the gift page
// (GiftsRes). Members only (hub.get_members, every call, before any gift is read).
import { route } from "@/server/http/context"
import { assertGiftsOn, giftDeps, listPotGifts } from "@/server/features/gifts"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route<{ pot: string }>("GET /api/pots/[pot]/gifts", async (ctx, { pot }) => {
  assertGiftsOn()
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg)
  return ctx.json(await listPotGifts(deps, s, pot))
})
