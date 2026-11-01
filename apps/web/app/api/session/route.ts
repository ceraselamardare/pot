// GET / POST / DELETE /api/session (B-07; api-spec §2.1, §4).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getRpc, getSubmitter, defer } from "@/server/deps"
import { isBot } from "@/server/bot"
import { checkCsrf, ipHash, readBody, readJson, parseWith, route } from "@/server/http/context"
import { logoutReq, sessionCreateReq } from "@/server/http/schemas"
import { hintCookie, readCookie } from "@/server/session/cookies"
import { logout, nearAuthLogin } from "@/server/session/service"
import { hintFor, loadSession, requireSession, sessionInfo } from "@/server/session/store"

export const maxDuration = 60

export const GET = route("GET /api/session", async (ctx) => {
  const cfg = getConfig()
  const s = await loadSession(getDb(), ctx.req, cfg)
  if (!s) return ctx.json({ session: null })
  const info = sessionInfo(s)
  if (!readCookie(ctx.req, "pot_hint")) ctx.setCookie(hintCookie(cfg, hintFor(info)))
  return ctx.json({ session: info })
})

export const POST = route("POST /api/session", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, sessionCreateReq)
  const cfg = getConfig()
  const r = await nearAuthLogin(
    { db: getDb(), rpc: getRpc(), submitter: getSubmitter(), cfg, defer, isBot: () => isBot(ctx.req) },
    value,
    { ipHash: ipHash(ctx.req), userAgent: ctx.req.headers.get("user-agent") },
  )
  for (const c of r.cookies) ctx.setCookie(c)
  return ctx.json(r.body, r.status)
})

export const DELETE = route("DELETE /api/session", async (ctx) => {
  const origin = ctx.req.headers.get("origin")
  if (!origin || !getConfig().allowedOrigins.includes(origin)) checkCsrf(ctx.req) // throws forbidden_origin
  const raw = await readBody(ctx.req)
  const body = raw.trim() ? parseWith(logoutReq, JSON.parse(raw)) : {}
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  for (const c of await logout(getDb(), cfg, s, body)) ctx.setCookie(c)
  return ctx.json({})
})
