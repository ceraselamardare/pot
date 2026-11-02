// PATCH /api/gifts/[ref]: the giver edits their own gift's name, note or "show my name on the public page" (page gifts
// only). Someone else's ref answers 404 like a missing one.
import { checkCsrf, readJson, route } from "@/server/http/context"
import { assertGiftsOn, giftDeps, patchGift } from "@/server/features/gifts"
import { giftPatchReq } from "@/server/features/gifts/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const PATCH = route<{ ref: string }>("PATCH /api/gifts/[ref]", async (ctx, { ref }) => {
  assertGiftsOn()
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, giftPatchReq)
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg, { activeDevice: true })
  return ctx.json(await patchGift(deps, s, ref, value))
})
