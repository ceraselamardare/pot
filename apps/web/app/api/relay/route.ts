// POST /api/relay (B-03 + B-05, B-08 demo intents, B-09; api-spec §2.3, §3).
import { eq } from "drizzle-orm"
import { getDb } from "@/db/client"
import { pot } from "@/db/schema"
import { loadKeys } from "@/server/chain/keys"
import { getConfig } from "@/server/config"
import { relayDeps } from "@/server/deps"
import { demoRelay } from "@/server/features/demo"
import { ApiError } from "@/server/http/errors"
import { checkCsrf, ipNetHash, parseWith, readBody, route } from "@/server/http/context"
import { demoRelayReq, signedRelayReq } from "@/server/http/schemas"
import { relay } from "@/server/relay/pipeline"
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
  const isDemoBody = typeof parsed === "object" && parsed !== null && "demo" in parsed
  if (s.kind === "demo") {
    ctx.demo = true
    if (!isDemoBody) throw new ApiError("demo_forbidden", { detail: { why: "signed_body_in_demo" } })
    const body = parseWith(demoRelayReq, parsed)
    const r = await demoRelay(
      { ...relayDeps(), personaKey: loadKeys("DEMO_PERSONA_KEY")[0] },
      s,
      body as never,
      { requestId: ctx.requestId, ipnetHash: ipNetHash(ctx.req), bodyHash },
    )
    return ctx.raw({ ...r.body, requestId: ctx.requestId }, r.status)
  }
  if (isDemoBody) throw new ApiError("demo_forbidden", { detail: { why: "demo_body_outside_demo" } })
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
    },
  )
  // create_pot: the cover gradient lives off chain (D-61 Rev 1; data-model §8 Q1)
  const result = r.body.result as { type?: string; potId?: string } | null | undefined
  const gradient = body.context?.meta?.gradient
  if (gradient && result?.type === "create_pot" && result.potId)
    await getDb().update(pot).set({ gradient }).where(eq(pot.daoId, result.potId)).catch(() => undefined)
  return ctx.raw({ ...r.body, requestId: ctx.requestId }, r.status)
})
