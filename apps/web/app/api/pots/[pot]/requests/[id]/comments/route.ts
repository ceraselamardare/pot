// GET/POST /api/pots/[pot]/requests/[id]/comments: the thread on one spend request (server/features/comments.ts).
// `[pot]` is a slug or a DAO id, `[id]` the hub's request id. Members only (hub.get_members), signed in; writes
// need an active device like notes. Off-chain only: no transaction. A new comment pushes the requester and earlier
// commenters after the response (after(), push on only).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { defer, getHub } from "@/server/deps"
import { listComments, postComment } from "@/server/features/comments"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { commentPostReq } from "@/server/http/schemas"
import { notifyComment } from "@/server/notify/notify"
import { getPushSender } from "@/server/notify/webpush"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

type Params = { pot: string; id: string }

export const GET = route<Params>("GET /api/pots/[pot]/requests/[id]/comments", async (ctx, { pot, id }) => {
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  const body = await listComments({ db: getDb(), hub: getHub(), cfg }, s, pot, id)
  return ctx.json(body)
})

export const POST = route<Params>("POST /api/pots/[pot]/requests/[id]/comments", async (ctx, { pot, id }) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, commentPostReq)
  const cfg = getConfig()
  const db = getDb()
  const hub = getHub()
  const s = await requireSession(db, ctx.req, cfg, { activeDevice: true })
  const sender = getPushSender()
  const r = await postComment(
    { db, hub, cfg, onPosted: sender ? (c) => defer(async () => void (await notifyComment({ db, hub, cfg, sender }, c))) : undefined },
    s,
    pot,
    id,
    value,
  )
  return ctx.json({ comment: r.comment, ...(r.replayed ? { replayed: true } : {}) }, r.status)
})
