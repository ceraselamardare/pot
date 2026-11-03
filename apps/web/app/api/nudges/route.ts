// POST /api/nudges (api-spec §2.5, built with "Ask for a top-up"): remind people who haven't added, by push. Members
// only; once per person per Pot per 24 h whoever sends it (429 nudge_too_soon), 10 people per sender a day. The pushes
// go out after the response (after(), push on only). server/features/topups.ts sendNudges.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { defer, getHub } from "@/server/deps"
import { sendNudges } from "@/server/features/topups"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { nudgeReq } from "@/server/http/schemas"
import { notifyNudges } from "@/server/notify/notify"
import { getPushSender } from "@/server/notify/webpush"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const POST = route("POST /api/nudges", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, nudgeReq)
  const cfg = getConfig()
  const db = getDb()
  const hub = getHub()
  const s = await requireSession(db, ctx.req, cfg, { activeDevice: true })
  const sender = getPushSender()
  const { status, ...body } = await sendNudges(
    { db, hub, cfg, onNudged: sender ? (n) => defer(async () => void (await notifyNudges({ db, hub, cfg, sender }, n))) : undefined },
    s,
    value,
  )
  return ctx.json(body, status)
})
