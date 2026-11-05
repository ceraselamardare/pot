// GET /api/session/challenge (rev4 B-20; api-spec §2.1): a stateless MAC'd challenge for the OIDC nonce that
// binds the ID token to the device key. Nothing is stored until POST /api/session spends it.
import { getConfig } from "@/server/config"
import { route } from "@/server/http/context"
import { hmacSecret } from "@/server/secrets"
import { makeChallenge } from "@/server/session/idtoken"

export const maxDuration = 10

export const GET = route("GET /api/session/challenge", async (ctx) => {
  ctx.cacheControl = "no-store"
  // APP-7: bound to this environment (getConfig().authScope), checked the same way by POST /api/session
  return ctx.json(makeChallenge(hmacSecret(), Date.now(), getConfig().authScope))
})
