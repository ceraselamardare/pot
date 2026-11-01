// zod 4.6 request schemas (api-spec §2); every object is strict (unknown fields → bad_request).
import { z } from "zod"
import { INTENTS } from "../relay/types"
import { MICRO_RE, OPKEY_RE, PK_RE } from "../util/ids"

export const opKey = z.string().regex(OPKEY_RE)
export const publicKey = z.string().regex(PK_RE)
export const micro = z.string().regex(MICRO_RE)
export const keyKind = z.enum(["webcrypto", "fallback"])
export const pop = z.strictObject({ ts: z.number().int(), sig: z.string().min(80).max(100) })
const accountId = z.string().min(2).max(64)

export const sessionCreateReq = z.strictObject({
  idToken: z.string().min(20).max(4096),
  devicePublicKey: publicKey,
  keyKind,
  challenge: z.string().max(64).optional(),
  pop,
  displayName: z.string().max(200).optional(),
})

export const deviceLoginReq = z.strictObject({ accountId, devicePublicKey: publicKey, pop })

export const logoutReq = z.strictObject({ pushEndpoint: z.string().max(1024).optional(), forgetDevice: z.boolean().optional() })

const relayContext = z.strictObject({
  depositIntentId: z.string().max(64).optional(),
  meta: z.strictObject({ gradient: z.string().max(40).optional() }).optional(),
})

export const signedRelayReq = z.strictObject({
  signedDelegate: z.string().min(1).max(6000),
  idempotencyKey: opKey,
  intent: z.enum(INTENTS),
  requestRef: opKey.optional(),
  context: relayContext.optional(),
})

export const faucetReq = z.strictObject({ amount: micro.optional(), idempotencyKey: opKey })

export const noteReq = z.strictObject({
  kind: z.enum(["memo", "decline_reason"]),
  pot: z.string().min(2).max(64),
  ref: z.string().min(1).max(32),
  text: z.string().min(1).max(2000),
  idempotencyKey: opKey.optional(),
})

// X-06 push subscriptions (api-spec §2.6): shapes here; the endpoint host allowlist and key lengths are checked
// in server/notify/subscriptions.ts (→ args_invalid, not bad_request)
export const pushSubReq = z.strictObject({
  subscription: z.strictObject({
    endpoint: z.string().min(8).max(1024),
    expirationTime: z.number().int().nullable(),
    keys: z.strictObject({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  }),
  standalone: z.boolean(),
  platform: z.enum(["ios", "android", "desktop", "other"]).optional(),
})

export const pushUnsubReq = z.strictObject({ endpoint: z.string().min(1).max(1024) })
