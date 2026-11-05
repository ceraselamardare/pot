// POST /api/report (CLI-4, security audit 2026-11-04): a visitor reports a public pay-in page / pay-in link / payment
// link. No session needed (visitors report); CSRF (same-origin JSON) and a strict body; rate limited per IP hash and
// globally (app/api/report/service.ts).
import { getDb } from "@/db/client"
import { checkCsrf, ipHash, readJson, route } from "@/server/http/context"
import { fileReport, reportReq } from "./service"

export const maxDuration = 10

export const POST = route("POST /api/report", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, reportReq)
  return ctx.json(await fileReport(getDb(), value, ipHash(ctx.req)))
})
