// GET /api/me/topups: the open top-up asks in the Pots I'm still in where I'm asked (Requests), and the asks I made
// (You → Your activity). Signed in; members only per Pot (hub.get_members). server/features/topups.ts.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { myTopups } from "@/server/features/topups"
import { route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route("GET /api/me/topups", async (ctx) => {
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  return ctx.json(await myTopups({ db: getDb(), hub: getHub(), cfg }, s))
})
