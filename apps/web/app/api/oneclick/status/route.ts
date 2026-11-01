// GET /api/oneclick/status?pot=<dao> (B-14, additive): this person's deposits for a Pot that the Pot screen still
// shows (in progress, or arrived and not yet added), so the deposit card survives a reload or another device.
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { oneclickDeps } from "@/server/features/oneclick/http"
import { listDeposits } from "@/server/features/oneclick/service"
import { ApiError } from "@/server/http/errors"
import { route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route("GET /api/oneclick/status", async (ctx) => {
  const pot = new URL(ctx.req.url).searchParams.get("pot")
  if (!pot) throw new ApiError("bad_request", { detail: { field: "pot" } })
  const s = await requireSession(getDb(), ctx.req, getConfig())
  if (s.kind === "demo") ctx.demo = true
  return ctx.json(await listDeposits(oneclickDeps(), s, pot))
})
