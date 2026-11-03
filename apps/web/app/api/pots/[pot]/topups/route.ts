// GET/POST /api/pots/[pot]/topups: "Ask for a top-up" (server/features/topups.ts). `[pot]` is a slug or a DAO id.
// Members only (hub.get_members, active), signed in; asking needs an active device like comments. Off-chain only: no
// transaction. A new ask pushes everyone asked but the asker after the response (after(), push on only).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { defer, getHub } from "@/server/deps"
import { askTopup, listTopups } from "@/server/features/topups"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { topupPostReq } from "@/server/http/schemas"
import { notifyTopupAsked } from "@/server/notify/notify"
import { getPushSender } from "@/server/notify/webpush"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

type Params = { pot: string }

export const GET = route<Params>("GET /api/pots/[pot]/topups", async (ctx, { pot }) => {
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  return ctx.json(await listTopups({ db: getDb(), hub: getHub(), cfg }, s, pot))
})

export const POST = route<Params>("POST /api/pots/[pot]/topups", async (ctx, { pot }) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, topupPostReq)
  const cfg = getConfig()
  const db = getDb()
  const hub = getHub()
  const s = await requireSession(db, ctx.req, cfg, { activeDevice: true })
  const sender = getPushSender()
  const r = await askTopup(
    { db, hub, cfg, onAsked: sender ? (a) => defer(async () => void (await notifyTopupAsked({ db, hub, cfg, sender }, a))) : undefined },
    s,
    pot,
    value,
  )
  return ctx.json({ topup: r.topup, ...(r.replayed ? { replayed: true } : {}) }, r.status)
})
