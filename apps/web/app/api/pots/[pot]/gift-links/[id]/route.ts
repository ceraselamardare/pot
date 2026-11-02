// DELETE /api/pots/[pot]/gift-links/[id]: any member revokes one of the Pot's gift links (idempotent). Another Pot's
// link, or none → 404 not_found {cause: link_unknown}. A gift already on its way through it is refused by the relayer's
// pre-flight (validateGiftRef → link_revoked).
import { checkCsrf, route } from "@/server/http/context"
import { assertGiftsOn, giftDeps, revokeGiftLink } from "@/server/features/gifts"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const DELETE = route<{ pot: string; id: string }>("DELETE /api/pots/[pot]/gift-links/[id]", async (ctx, { pot, id }) => {
  assertGiftsOn()
  checkCsrf(ctx.req)
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg, { activeDevice: true })
  return ctx.json(await revokeGiftLink(deps, s, pot, id))
})
