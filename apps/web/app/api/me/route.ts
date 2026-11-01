// PATCH /api/me (api-spec §2.1, X-05b): the signed-in person's profile. So far: the brand avatar (You → Profile).
// A pending_device session can't write (rev4: device_not_registered), like notes and push.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { updateProfile } from "@/server/features/profile"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { profilePatchReq } from "@/server/http/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 10

export const PATCH = route("PATCH /api/me", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, profilePatchReq)
  const s = await requireSession(getDb(), ctx.req, getConfig(), { activeDevice: true })
  const profile = await updateProfile(getDb(), s, value)
  return ctx.json({ profile })
})
