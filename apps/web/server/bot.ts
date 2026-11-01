// BotID (architecture §4.5): account creation, new demo leases (rev4), faucet and create_pot are the gated
// calls. Off unless FLAG_BOTID=true (it also needs withBotId in next.config.ts and initBotId on the client,
// which the platform/frontend own). CI bypass: `x-pot-ci-bypass: $BOTID_BYPASS_SECRET`.
import "server-only"
import { getConfig } from "./config"
import { safeEqual } from "./util/crypto"

export async function isBot(req: Request): Promise<boolean> {
  if (!getConfig().flags.botId) return false
  const bypass = process.env.BOTID_BYPASS_SECRET
  const header = req.headers.get("x-pot-ci-bypass")
  if (bypass && header && safeEqual(Buffer.from(bypass), Buffer.from(header))) return false
  const { checkBotId } = await import("botid/server")
  const v = await checkBotId()
  return v.isBot
}
