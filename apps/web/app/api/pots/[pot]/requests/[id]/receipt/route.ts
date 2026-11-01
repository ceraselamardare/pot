// GET/POST /api/pots/[pot]/requests/[id]/receipt: the receipt details saved with a spend (server/features/receipts/
// saved.ts). `[pot]` is a slug or a DAO id, `[id]` the hub's request id. Members only (hub.get_members), signed in;
// a save needs an active device like comments, comes from the request's own requester, once, ≤ 24 KB, and must match
// the fingerprint the request carries. Never the photo (D-61). Off-chain only: no transaction.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { readCappedJson } from "@/server/features/receipts/read"
import { getSpendReceipt, RECEIPT_SAVE_MAX_BODY, receiptSaveReq, saveSpendReceipt } from "@/server/features/receipts/saved"
import { checkCsrf, route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

type Params = { pot: string; id: string }

export const GET = route<Params>("GET /api/pots/[pot]/requests/[id]/receipt", async (ctx, { pot, id }) => {
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  const body = await getSpendReceipt({ db: getDb(), hub: getHub(), cfg }, s, pot, id)
  return ctx.json(body)
})

export const POST = route<Params>("POST /api/pots/[pot]/requests/[id]/receipt", async (ctx, { pot, id }) => {
  checkCsrf(ctx.req)
  const cfg = getConfig()
  const db = getDb()
  const s = await requireSession(db, ctx.req, cfg, { activeDevice: true })
  const value = await readCappedJson(ctx.req, receiptSaveReq, RECEIPT_SAVE_MAX_BODY)
  const r = await saveSpendReceipt({ db, hub: getHub(), cfg }, s, pot, id, value)
  return ctx.json({ ...r.res, ...(r.replayed ? { replayed: true } : {}) }, r.status)
})
