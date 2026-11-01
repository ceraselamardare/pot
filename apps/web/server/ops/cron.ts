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

