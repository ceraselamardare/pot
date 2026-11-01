// GET /api/oneclick/chains (B-14; api-spec §2.7): the four networks with Shield status (cached 60 s, fail open).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { getOneClick } from "@/server/features/oneclick/http"
import { listChains } from "@/server/features/oneclick/service"
import { route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 10

export const GET = route("GET /api/oneclick/chains", async (ctx) => {
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  if (s.kind === "demo") ctx.demo = true
  return ctx.json(await listChains({ cfg, oneclick: getOneClick() }))
})
