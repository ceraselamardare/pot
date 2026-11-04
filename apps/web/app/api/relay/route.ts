// POST /api/relay (B-03 + B-05, B-09; api-spec §2.3, §3).
import { eq } from "drizzle-orm"
import { getDb } from "@/db/client"
import { pot } from "@/db/schema"
import { getConfig } from "@/server/config"
import { relayDeps } from "@/server/deps"
import { ApiError } from "@/server/http/errors"
import { checkCsrf, ipHash, parseWith, readBody, route } from "@/server/http/context"
import { signedRelayReq } from "@/server/http/schemas"
import { relay } from "@/server/relay/pipeline"
import { noteAddSource } from "@/server/features/deposits"
import { requireSession } from "@/server/session/store"
import { sha256Hex } from "@/server/util/crypto"

export const maxDuration = 60

export const POST = route("POST /api/relay", async (ctx) => {
  checkCsrf(ctx.req)
  const raw = await readBody(ctx.req)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ApiError("bad_request", { detail: { field: "body", cause: "json" } })
  }
  const cfg = getConfig()
  const s = await requireSession(getDb(), ctx.req, cfg)
  const bodyHash = sha256Hex(JSON.stringify(parsed))
  const body = parseWith(signedRelayReq, parsed)
  const r = await relay(
    relayDeps(),
    {
      userId: s.user.id,
      accountId: s.user.nearAccount,
      kind: s.kind,
      device: s.device ? { publicKey: s.device.publicKey, status: s.device.status } : null,
      emailHash: s.user.emailVerified ? s.user.emailHash : null,
    },
    {
      requestId: ctx.requestId,
      signedDelegate: body.signedDelegate,
      idempotencyKey: body.idempotencyKey,
      intent: body.intent,
      requestRef: body.requestRef,
      bodyHash,
      // hub 1.2.0 gifts come from anyone: the per-IP gift quota (ip_gift) uses this (an HMAC, never the IP)
      ipHash: ipHash(ctx.req),
    },
  )
  // create_pot: the cover gradient lives off chain (D-61 Rev 1; data-model §8 Q1)
  const result = r.body.result as { type?: string; potId?: string } | null | undefined
  const gradient = body.context?.meta?.gradient
  if (gradient && result?.type === "create_pot" && result.potId)
    await getDb().update(pot).set({ gradient }).where(eq(pot.daoId, result.potId)).catch(() => undefined)
  // add_money: where the money came from, kept on the add's feed row for the money-in details (best effort)
  const added = r.body as { relayId?: string; txHash?: string; result?: { type?: string; recorded?: boolean } | null }
  if (added.result?.type === "contribution" && added.result.recorded && added.relayId && added.txHash && (body.context?.source || body.context?.depositIntentId))
    await noteAddSource(getDb(), {
      userId: s.user.id,
      relayId: added.relayId,
      txHash: added.txHash,
      ...(body.context.source ? { source: body.context.source } : {}),
      ...(body.context.depositIntentId ? { depositIntentId: body.context.depositIntentId } : {}),
    }).catch(() => undefined)
  return ctx.raw({ ...r.body, requestId: ctx.requestId }, r.status)
})
