// POST /api/session/wallet (B-10; api-spec §2.1, §4.4): NEAR Connect NEP-413 sign-in → a `wallet` session.
import { z } from "zod"
import { getDb } from "@/db/client"
import { getConfig } from "@/server/config"
import { defer, getRpc, getSubmitter } from "@/server/deps"
import { walletLogin } from "@/server/features/wallet/service"
import { checkCsrf, ipHash, readJson, route } from "@/server/http/context"
import { publicKey } from "@/server/http/schemas"

export const maxDuration = 15

const walletSessionReq = z.strictObject({
  accountId: z.string().min(2).max(64),
  publicKey,
  signature: z.string().min(40).max(200),
  nonce: z.string().length(44),
  message: z.literal("Sign in to Pot"),
  recipient: z.string().min(1).max(253),
})

export const POST = route("POST /api/session/wallet", async (ctx) => {
  checkCsrf(ctx.req)
  const { value } = await readJson(ctx.req, walletSessionReq)
  const r = await walletLogin(
    { db: getDb(), rpc: getRpc(), submitter: getSubmitter(), cfg: getConfig(), defer },
    value,
    // APP-7: the Origin (already CSRF-checked) must be the host the NEP-413 message was signed for
    { ipHash: ipHash(ctx.req), userAgent: ctx.req.headers.get("user-agent"), origin: ctx.req.headers.get("origin") },
  )
  for (const c of r.cookies) ctx.setCookie(c)
  return ctx.json(r.body, r.status)
})
