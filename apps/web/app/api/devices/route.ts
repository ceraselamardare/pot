// POST /api/devices (B-13; api-spec §2.2, D-21): relay the NEAR Auth-approved AddKey(new device key). Open to
// `pending_device` sessions (that is what they are for); NEAR Auth sessions only.
import { z } from "zod"
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getRpc, getSubmitter } from "@/server/deps"
import { addDevice } from "@/server/features/devices/service"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { keyKind, opKey, pop, publicKey } from "@/server/http/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 60

const devicesReq = z.strictObject({
  guardId: z.string().min(5).max(120),
  verifyPayload: z.string().min(20).max(7168),
  signPayload: z.string().min(8).max(2000),
  devicePublicKey: publicKey,
  keyKind,
  pop,
  idempotencyKey: opKey,
})

export const POST = route("POST /api/devices", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, devicesReq)
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  const r = await addDevice({ db: getDb(), rpc: getRpc(), submitter: getSubmitter(), cfg }, s, value, { requestId: ctx.requestId })
  for (const c of r.cookies) ctx.setCookie(c)
  return ctx.json(r.body, r.status)
})
