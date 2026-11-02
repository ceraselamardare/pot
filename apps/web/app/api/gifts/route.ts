// POST /api/gifts: start a gift (GiftStartReq → 201 { gift: GiftStartWire }; the same idempotencyKey replays 200).
// Signed in, any account (the giver need not be a member); active device; CSRF; strict body. The browser then signs
// usdc.ft_transfer_call(hub, amount, msg) through the relayer, whose pre-flight is validateGiftRef.
import { checkCsrf, ipHash, readJson, route } from "@/server/http/context"
import { assertGiftsOn, giftDeps, startGift } from "@/server/features/gifts"
import { giftStartReq } from "@/server/features/gifts/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const POST = route("POST /api/gifts", async (ctx) => {
  assertGiftsOn()
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, giftStartReq)
  const deps = giftDeps()
  const s = await requireSession(deps.db, ctx.req, deps.cfg, { activeDevice: true })
  const r = await startGift(deps, s, value, { ipHash: ipHash(ctx.req) })
  return ctx.json({ gift: r.gift, ...(r.replayed ? { replayed: true } : {}) }, r.status)
})
