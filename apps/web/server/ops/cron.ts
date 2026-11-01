// Cron auth (api-spec §0.2 mode `cron`): `Authorization: Bearer $CRON_SECRET`, compared in constant time.
// Vercel cron sends exactly this header on production. Without CRON_SECRET every cron route answers 401.
import "server-only"
import { ApiError } from "../http/errors"
import { safeEqual } from "../util/crypto"

export function requireCron(req: Request, secret = process.env.CRON_SECRET): void {
  const got = req.headers.get("authorization") ?? ""
  if (!secret || secret.length < 16) throw new ApiError("not_signed_in", { detail: { cause: "cron_secret_unset" } })
  if (!safeEqual(Buffer.from(got), Buffer.from(`Bearer ${secret}`))) throw new ApiError("not_signed_in")
}

/**
 * Fire the demo-pool cron route in its own invocation (own maxDuration) from an after() of another route
 * (POST /api/demo/session when fewer than 3 Pots are ready). The request is abandoned after a few seconds;
 * the target keeps running. No-op without CRON_SECRET.
 */
export async function kickDemoPool(origin: string, secret = process.env.CRON_SECRET): Promise<void> {
  if (!secret) return
  await fetch(new URL("/api/cron/demo-pool", origin), {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(3_000),
  }).catch(() => undefined)
}
