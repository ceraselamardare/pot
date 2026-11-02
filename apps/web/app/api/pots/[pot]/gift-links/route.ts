// GET/POST /api/pots/[pot]/gift-links: the Pot's gift links (server/features/gifts/members.ts). Members only
// (hub.get_members, every call); POST needs an active device, CSRF/Origin and a strict body (GiftLinkCreateReq):
// 201 { link }, a retry with the same idempotencyKey 200 { link, replayed }. Off-chain only: no transaction.
// FLAG_GIFTS off → 404 not_found {cause: gifts_off_flag}.
import { checkCsrf, readJson, route } from "@/server/http/context"
import { assertGiftsOn, createGiftLink, giftDeps, listGiftLinks } from "@/server/features/gifts"
import { giftLinkCreateReq } from "@/server/features/gifts/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

type Params = { pot: string }

export const GET = route<Params>("GET /api/pots/[pot]/gift-links", async (ctx, { pot }) => {
  assertGiftsOn()
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg)
  return ctx.json(await listGiftLinks(deps, s, pot))
})

export const POST = route<Params>("POST /api/pots/[pot]/gift-links", async (ctx, { pot }) => {
  assertGiftsOn()
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, giftLinkCreateReq)
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg, { activeDevice: true })
  const r = await createGiftLink(deps, s, pot, value)
  return ctx.json({ link: r.link, ...(r.replayed ? { replayed: true } : {}) }, r.status)
})
