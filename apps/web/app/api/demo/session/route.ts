// POST /api/demo/session (X-08; api-spec §2.8): JSON or a same-origin HTML form (→ 303).
import { getDb } from "@/db/client"
import { isBot } from "@/server/bot"
import { getConfig } from "@/server/config"
import { defer } from "@/server/deps"
import { demoSession } from "@/server/features/demo"
import { ApiError } from "@/server/http/errors"
import { checkCsrf, ipNetHash, parseWith, readBody, route } from "@/server/http/context"
import { kickDemoPool } from "@/server/ops/cron"
import { demoSessionReq } from "@/server/http/schemas"
import { hmacSecret } from "@/server/secrets"
import { readCookie } from "@/server/session/cookies"

export const maxDuration = 30

export const POST = route("POST /api/demo/session", async (ctx) => {
  const mode = checkCsrf(ctx.req, { allowForm: true })
  ctx.demo = true
  const raw = await readBody(ctx.req)
  let input: unknown
  if (mode === "form") {
    const f = new URLSearchParams(raw)
    input = {
      ...(f.get("persona") ? { persona: f.get("persona") } : {}),
      ...(f.get("reset") ? { reset: f.get("reset") === "1" || f.get("reset") === "true" } : {}),
    }
  } else {
    try {
      input = raw.trim() ? JSON.parse(raw) : {}
    } catch {
      throw new ApiError("bad_request", { detail: { field: "body" } })
    }
  }
  const body = parseWith(demoSessionReq, input)
  const wantsHtml = mode === "form" || (ctx.req.headers.get("accept") ?? "").includes("text/html")
  const r = await demoSession(
    {
      db: getDb(),
      cfg: getConfig(),
      secret: hmacSecret(),
      isBot: () => isBot(ctx.req),
      // B-12: fewer than 3 ready → refill in its own invocation (GET /api/cron/demo-pool), after the response
      refill: async () => defer(() => kickDemoPool(new URL(ctx.req.url).origin)),
    },
    {
      ...body,
      form: wantsHtml,
      visitorCookie: readCookie(ctx.req, "pot_demo_visitor"),
      ipnetHash: ipNetHash(ctx.req),
      userAgent: ctx.req.headers.get("user-agent"),
    },
  )
  for (const c of r.cookies) ctx.setCookie(c)
  if (r.kind === "redirect") return ctx.redirect(r.location)
  return ctx.json(r.body, r.status)
})
