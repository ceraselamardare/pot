// GET /api/give/[slug]: a Pot's public gift page (GiftPageRes). While the page is off: the Pot only (page.on false).
// While on: whether it takes gifts, the totals, the members' one-liner and the givers who chose to be shown. 120
// reads/min per IP. Unknown Pot → 404 not_found {cause: pot_unknown}. Not cached by the CDN.
import { ipHash, route } from "@/server/http/context"
import { ApiError } from "@/server/http/errors"
import { assertGiftsOn, chargePublicRead, giftDeps, resolveGiftPage } from "@/server/features/gifts"

export const maxDuration = 15

export const GET = route<{ slug: string }>("GET /api/give/[slug]", async (ctx, { slug }) => {
  assertGiftsOn()
  const deps = giftDeps()
  await chargePublicRead(deps, ipHash(ctx.req))
  const r = await resolveGiftPage(deps, slug)
  if (!r) throw new ApiError("not_found", { detail: { cause: "pot_unknown" } })
  return ctx.json(r)
})
