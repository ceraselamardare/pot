// Request envelope (api-spec §0): requestId on every JSON body and in x-request-id, Cache-Control for
// authenticated responses, the static security headers (also set in next.config.ts; a route's own headers
// override them, so values are identical), CSRF/Origin checks, 16 KB body cap, zod `.strict()` parsing.
import "server-only"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { getConfig } from "../config"
import { logError } from "../log"
import { hmacSecret } from "../secrets"
import { hmacHex, newRequestId } from "../util/crypto"
import { ApiError, errBody } from "./errors"

export const MAX_BODY = 16 * 1024

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000",
}

export class Ctx {
  readonly requestId = newRequestId()
  readonly startedAt = Date.now()
  readonly headers = new Headers()
  cacheControl = "private, no-store"
  demo = false
  constructor(
    readonly req: Request,
    readonly route: string,
  ) {}

  setCookie(cookie: string) {
    this.headers.append("set-cookie", cookie)
  }

  private finish(res: Response): Response {
    res.headers.set("x-request-id", this.requestId)
    if (!res.headers.has("cache-control")) res.headers.set("cache-control", this.cacheControl)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
    if (this.demo) res.headers.set("x-pot-demo", "1")
    this.headers.forEach((v, k) => {
      if (k === "set-cookie") return
      res.headers.set(k, v)
    })
    for (const c of this.headers.getSetCookie()) res.headers.append("set-cookie", c)
    return res
  }

  json<T extends object>(body: T, status = 200): Response {
    return this.finish(Response.json({ ok: true, requestId: this.requestId, ...body }, { status }))
  }

  /** A stored body (idempotent replay), returned verbatim with this request's id header. */
  raw(body: unknown, status: number): Response {
    return this.finish(Response.json(body, { status }))
  }

  error(e: ApiError): Response {
    const res = Response.json(errBody(e, this.requestId), { status: e.status })
    if (e.retryAfterMs) res.headers.set("retry-after", String(Math.ceil(e.retryAfterMs / 1000)))
    return this.finish(res)
  }

  redirect(location: string, status = 303): Response {
    return this.finish(new Response(null, { status, headers: { location } }))
  }
}

/** Origin + content-type check for non-GET routes (api-spec §0.2). */
export function checkCsrf(req: Request, opts: { allowForm?: boolean } = {}): "json" | "form" {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase()
  const isJson = ct.startsWith("application/json")
  const isForm = opts.allowForm && ct.startsWith("application/x-www-form-urlencoded")
  if (!isJson && !isForm) throw new ApiError("forbidden_origin", { detail: { cause: "content_type" } })
  const origin = req.headers.get("origin")
  const allowed = getConfig().allowedOrigins
  if (opts.allowForm) {
    // demo session: same-origin or direct navigation only (login-CSRF guard, api-spec §2.8)
    if ((req.headers.get("sec-fetch-site") ?? "") === "cross-site")
      throw new ApiError("forbidden_origin", { detail: { cause: "sec_fetch_site" } })
    if (origin && !allowed.includes(origin)) throw new ApiError("forbidden_origin", { detail: { cause: "origin" } })
  } else if (!origin || !allowed.includes(origin)) {
    throw new ApiError("forbidden_origin", { detail: { cause: "origin" } })
  }
  return isJson ? "json" : "form"
}

export async function readBody(req: Request): Promise<string> {
  const len = Number(req.headers.get("content-length") ?? "0")
  if (len > MAX_BODY) throw new ApiError("bad_request", { detail: { field: "body", cause: "too_large" } })
  const text = await req.text()
  if (Buffer.byteLength(text, "utf8") > MAX_BODY)
    throw new ApiError("bad_request", { detail: { field: "body", cause: "too_large" } })
  return text
}

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value)
  if (r.success) return r.data
  const issue = r.error.issues[0]
  const field = issue?.path.length
    ? issue.path.join(".")
    : issue && "keys" in issue && Array.isArray(issue.keys)
      ? String(issue.keys[0])
      : undefined
  throw new ApiError("bad_request", { detail: { field, code: issue?.code } })
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<{ value: T; raw: string }> {
  const raw = await readBody(req)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError("bad_request", { detail: { field: "body", cause: "json" } })
  }
  return { value: parseWith(schema, parsed), raw }
}

/** Client IP: the first x-forwarded-for entry (Vercel sets it), else x-real-ip. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "0.0.0.0"
  return ip
}

/** The IPv4 address, or the IPv6 /64 prefix (rev4: rotating /128s inside one /64 share a bucket). */
export function ipNet(ip: string): string {
  if (!ip.includes(":")) return ip
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4mapped?.[1]) return v4mapped[1]
  const [head = "", tail = ""] = ip.split("::")
  const h = head ? head.split(":") : []
  const t = tail ? tail.split(":") : []
  const full = ip.includes("::") ? [...h, ...Array<string>(8 - h.length - t.length).fill("0"), ...t] : h
  return (
    full
      .slice(0, 4)
      .map((x) => parseInt(x || "0", 16).toString(16))
      .join(":") + "::/64"
  )
}

const utcDate = () => new Date().toISOString().slice(0, 10)
/** HMAC(APP_HMAC_SECRET, utc_date) of the IP: rate-limit keys without storing IPs (architecture §2.5). */
export const ipHash = (req: Request) => hmacHex(hmacSecret(), `ip|${utcDate()}|${clientIp(req)}`).slice(0, 32)
export const ipNetHash = (req: Request) => hmacHex(hmacSecret(), `ipnet|${utcDate()}|${ipNet(clientIp(req))}`).slice(0, 32)

type Handler<P> = (ctx: Ctx, params: P) => Promise<Response>

/**
 * Wrap a route handler: ApiError → its envelope; anything else → 500 `internal` (logged, never leaked).
 * `onInternal` lets the caller persist to error_log without this module importing the DB.
 */
export function route<P extends object = object>(
  name: string,
  handler: Handler<P>,
  onInternal?: (ctx: Ctx, e: unknown) => Promise<void>,
) {
  return async (req: Request, routeCtx?: { params: Promise<P> }): Promise<Response> => {
    const ctx = new Ctx(req, name)
    try {
      const params = routeCtx ? await routeCtx.params : ({} as P)
      return await handler(ctx, params)
    } catch (e) {
      // Next's own control-flow errors (the prerender bail-out of a request-time API under Cache Components,
      // notFound/redirect) must reach Next: caught here, `next build` prerendered GET routes that read
      // headers (/api/health, /api/demo/state) as a static 500 (wave 2)
      unstable_rethrow(e)
      if (e instanceof ApiError) return ctx.error(e)
      console.error(JSON.stringify({ level: "error", requestId: ctx.requestId, route: name, err: String(e).slice(0, 500) }))
      if (onInternal) await onInternal(ctx, e).catch(() => undefined)
      else await logError({ route: name, requestId: ctx.requestId, reason: "internal", detail: { err: String(e).slice(0, 300) } })
      return ctx.error(new ApiError("internal"))
    }
  }
}
