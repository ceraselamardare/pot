// DELETE /api/pots/[pot]/topups/[id]: the asker cancels their open top-up ask (server/features/topups.ts). Members only;
// someone else's ask → 403 action_not_allowed {cause: not_asker}; an ask that already ended → 409 {cause: topup_ended};
// cancelling twice answers the same. Off-chain only.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { cancelTopup } from "@/server/features/topups"
import { checkCsrf, route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

type Params = { pot: string; id: string }

export const DELETE = route<Params>("DELETE /api/pots/[pot]/topups/[id]", async (ctx, { pot, id }) => {
  checkCsrf(ctx.req)
  const cfg = getConfig()
  const db = getDb()
  const s = await requireSession(db, ctx.req, cfg, { activeDevice: true })
  return ctx.json(await cancelTopup({ db, hub: getHub(), cfg }, s, pot, id))
})
