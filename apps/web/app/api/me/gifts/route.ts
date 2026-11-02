// GET /api/me/gifts: the signed-in person's own gifts, newest first (≤ 100), with their own names and notes.
import { route } from "@/server/http/context"
import { assertGiftsOn, giftDeps, myGifts } from "@/server/features/gifts"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route("GET /api/me/gifts", async (ctx) => {
  assertGiftsOn()
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg)
  return ctx.json(await myGifts(deps, s))
})
