// POST /api/notes (X-05; api-spec §2.5).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { postNote } from "@/server/features/notes"
import { checkCsrf, readJson, route } from "@/server/http/context"
import { noteReq } from "@/server/http/schemas"
import { requireSession } from "@/server/session/store"

export const maxDuration = 10

export const POST = route("POST /api/notes", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, noteReq)
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg, { activeDevice: true })
  const r = await postNote({ db: getDb(), hub: getHub(), cfg }, s, value)
  return ctx.json(r.body, r.status)
})
