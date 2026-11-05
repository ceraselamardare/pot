// Secret values from env (Vercel Secret env vars; never in Development, never logged, never in the DB).
import "server-only"
import { runtimeOf } from "./config"

export const DEV_HMAC = "pot-local-dev-only-hmac-secret-not-for-deploys"

/**
 * APP_HMAC_SECRET (≥ 32 chars): IP-hash salt, session challenge MAC.
 * APP-3 (security audit 2026-11-04): the fixed development value is used ONLY by `next dev` / the unit tests on a
 * developer machine. Anything else (Vercel, any `next start` with NODE_ENV=production) fails closed: a missing or short
 * secret, or the development value copied into a deploy, throws, so every route that needs it refuses to serve (500,
 * logged) instead of running with a guessable key.
 */
export function hmacSecret(env: Record<string, string | undefined> = process.env): string {
  const { localDev } = runtimeOf(env)
  const v = env.APP_HMAC_SECRET
  if (v && v.length >= 32) {
    if (v === DEV_HMAC && !localDev) throw new Error("APP_HMAC_SECRET is the development value; set a real secret")
    return v
  }
  if (localDev) return DEV_HMAC
  throw new Error("APP_HMAC_SECRET is missing or shorter than 32 chars")
}
