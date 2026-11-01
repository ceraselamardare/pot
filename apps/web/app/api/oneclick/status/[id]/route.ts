// GET /api/oneclick/status/[id] (B-14; api-spec §2.7): the stepper status, owner only. `?relayId=` marks the
// deposit ADDED once the member's relayed contribution is in relay_log (verified server-side).
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { DEPOSIT_ID_RE, oneclickDeps, RELAY_ID_RE } from "@/server/features/oneclick/http"
import { depositStatus } from "@/server/features/oneclick/service"
import { ApiError } from "@/server/http/errors"
import { route } from "@/server/http/context"
import { requireSession } from "@/server/session/store"

export const maxDuration = 15

export const GET = route<{ id: string }>("GET /api/oneclick/status/[id]", async (ctx, { id }) => {
  if (!DEPOSIT_ID_RE.test(id)) throw new ApiError("not_found")
  const relayId = new URL(ctx.req.url).searchParams.get("relayId") ?? undefined
  if (relayId !== undefined && !RELAY_ID_RE.test(relayId)) throw new ApiError("bad_request", { detail: { field: "relayId" } })
  const s = await requireSession(getDb(), ctx.req, getConfig())
  if (s.kind === "demo") ctx.demo = true
  return ctx.json(await depositStatus(oneclickDeps(), s, id, { relayId }))
})
