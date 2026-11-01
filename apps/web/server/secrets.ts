// Secret values from env (Vercel Secret env vars; never in Development, never logged, never in the DB).
import "server-only"
import { getConfig } from "./config"

const DEV_HMAC = "pot-local-dev-only-hmac-secret-not-for-deploys"

/** APP_HMAC_SECRET (≥ 32 chars): IP-hash salt, demo visitor cookie MAC, session challenge MAC. */
export function hmacSecret(): string {
  const v = process.env.APP_HMAC_SECRET
  if (v && v.length >= 32) return v
  if (getConfig().vercelEnv === "development") return DEV_HMAC
  throw new Error("APP_HMAC_SECRET is missing or shorter than 32 chars")
}
