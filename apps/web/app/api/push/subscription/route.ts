// POST / DELETE /api/push/subscription (X-06; api-spec §2.6): store or drop a Web Push subscription.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { pushSubReq, pushUnsubReq } from "@/server/http/schemas"
import { deleteSubscription, saveSubscription } from "@/server/notify/subscriptions"
import { requireSession } from "@/server/session/store"

export const maxDuration = 10

export const POST = route("POST /api/push/subscription", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, pushSubReq)
  // not pending_device (rev4): device_not_registered / device_revoked
  const s = await requireSession(getDb(), ctx.req, getConfig(), { activeDevice: true })
  if (s.kind === "demo") ctx.demo = true
  return ctx.json(await saveSubscription(getDb(), s, value))
})

export const DELETE = route("DELETE /api/push/subscription", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, pushUnsubReq)
  const s = await requireSession(getDb(), ctx.req, getConfig())
  if (s.kind === "demo") ctx.demo = true
  await deleteSubscription(getDb(), s, value.endpoint)
  return ctx.json({})
})
