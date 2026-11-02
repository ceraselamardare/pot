// PUT /api/pots/[pot]/gift-page: a member turns the public gift page (/give/<slug>) on or off and sets its one-liner
// (GiftPagePutReq: `line` absent = keep, null or "" = remove). Members only; active device; CSRF; strict body.
import { checkCsrf, readJson, route } from "@/server/http/context"
import { assertGiftsOn, giftDeps, putGiftPage } from "@/server/features/gifts"
import { giftPagePutReq } from "@/server/features/gifts/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const PUT = route<{ pot: string }>("PUT /api/pots/[pot]/gift-page", async (ctx, { pot }) => {
  assertGiftsOn()
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, giftPagePutReq)
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg, { activeDevice: true })
  return ctx.json(await putGiftPage(deps, s, pot, value))
})
