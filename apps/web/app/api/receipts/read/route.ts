// POST /api/receipts/read: read a receipt photo for the Spend sheet (server/features/receipts/read.ts).
// Body {pot, mime, image: base64}; same-origin JSON, signed in, a member of `pot`, ≤ 2 MB, rate limited.
// 404 when the feature is off (no NEAR_AI_API_KEY). The photo is processed in memory only and never kept (D-61).
// Another currency comes back converted too (`fx`: live reference rate, ≤ 3 s per source, cached an hour).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getHub } from "@/server/deps"
import { fxFor, fxMode } from "@/server/features/fx"
import { readerFor, receiptsConfig } from "@/server/features/receipts/nearai"
import { readCappedJson, readReceipt, receiptReadReq } from "@/server/features/receipts/read"
import { checkCsrf, route } from "@/server/http/context"
import { ApiError } from "@/server/http/errors"
import { requireSession } from "@/server/session/store"

// the provider gets 25 s, the reply's proof ≤ 2.5 s more, a rate ≤ 3 s per source (usually cached)
export const maxDuration = 35

export const POST = route("POST /api/receipts/read", async (ctx) => {
  checkCsrf(ctx.req)
  const rcfg = receiptsConfig()
  if (rcfg.mode === "off") throw new ApiError("not_found", { detail: { cause: "receipts_off" } })
  const cfg = getConfig()
  const db = getDb()
  // the session first: nobody signed out gets to upload 2 MB
  const s = await requireSession(db, ctx.req, cfg)
  const body = await readCappedJson(ctx.req, receiptReadReq)
  const res = await readReceipt({ db, hub: getHub(), cfg, rcfg, reader: readerFor(rcfg), fx: fxFor(fxMode(rcfg.mode)) }, s, body, ctx.req.signal)
  return ctx.json(res)
})
