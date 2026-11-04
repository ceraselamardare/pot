// GET /api/pots/[pot]/deposits/[key]: one money-in row's details (server/features/deposits.ts). `[pot]` is a slug or
// a DAO id; `[key]` the row's NEAR transaction hash (a member's add) or a pay-in's ref. Signed-in members of the Pot
// only: anyone else (signed out → 401; not a member, someone who left, an unknown key → 404). Read-only.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { getDepositDetails } from "@/server/features/deposits"
import { route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route<{ pot: string; key: string }>("GET /api/pots/[pot]/deposits/[key]", async (ctx, { pot, key }) => {
  const cfg = getConfig()
  const db = getDb()
  const s = await requireSession(db, ctx.req, cfg)
  const r = await getDepositDetails({ db, hub: getHub(), cfg }, s, pot, decodeURIComponent(key))
  ctx.cacheControl = "private, no-store"
  return ctx.json(r)
})
