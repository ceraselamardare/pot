// GET /api/gift-links/[id]: a gift link's landing (GiftLandingRes), for anyone holding the link. Only ledger facts
// about the Pot, the link's own amount and note (while it works) and whether the Pot takes gifts now; never a member's
// name. 120 reads/min per IP. Unknown link → 404 not_found {cause: link_unknown}. Not cached by the CDN.
import { ipHash, route } from "@/server/http/context"
import { ApiError } from "@/server/http/errors"
import { assertGiftsOn, chargePublicRead, giftDeps, resolveGiftLanding } from "@/server/features/gifts"

export const maxDuration = 15

export const GET = route<{ id: string }>("GET /api/gift-links/[id]", async (ctx, { id }) => {
  assertGiftsOn()
  const deps = giftDeps()
  await chargePublicRead(deps, ipHash(ctx.req))
  const r = await resolveGiftLanding(deps, id)
  if (!r) throw new ApiError("not_found", { detail: { cause: "link_unknown" } })
  return ctx.json(r)
})
