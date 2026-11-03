// zod 4.6 request schemas (api-spec §2); every object is strict (unknown fields → bad_request).
import { z } from "zod"
import { INTENTS } from "../relay/types"
import { MICRO_RE, OPKEY_RE, PK_RE, SPEND_REF_RE } from "../util/ids"
import { AVATAR_IDS } from "@/lib/avatars"
import { HEARD_OPTIONS, SURVEY_CONTEXTS, SURVEY_VERSION, TODAY_OPTIONS, USE_OPTIONS } from "@/lib/survey"

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

/** PATCH /api/me: only the brand avatar so far (one of AVATAR_IDS, or null for initials); at least one field. */
export const profilePatchReq = z
  .strictObject({ avatar: z.enum(AVATAR_IDS).nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "empty", path: ["avatar"] })

/**
 * POST /api/me/survey ("Help us make Pot better", lib/survey.ts): enum ids only, the current version, at least one
 * answer; `use` is a set (no repeats). No free text anywhere.
 */
export const surveyReq = z.strictObject({
  version: z.literal(SURVEY_VERSION),
  answers: z
    .strictObject({
      use: z
        .array(z.enum(USE_OPTIONS))
        .min(1)
        .max(USE_OPTIONS.length)
        .refine((a) => new Set(a).size === a.length, { message: "repeated" })
        .optional(),
      today: z.enum(TODAY_OPTIONS).optional(),
      heard: z.enum(HEARD_OPTIONS).optional(),
    })
    .refine((a) => a.use !== undefined || a.today !== undefined || a.heard !== undefined, { message: "empty", path: ["use"] }),
  context: z.enum(SURVEY_CONTEXTS).optional(),
})

export const logoutReq = z.strictObject({ pushEndpoint: z.string().max(1024).optional(), forgetDevice: z.boolean().optional() })

const relayContext = z.strictObject({
  depositIntentId: z.string().max(64).optional(),
  meta: z.strictObject({ gradient: z.string().max(40).optional() }).optional(),
})

export const signedRelayReq = z.strictObject({
  signedDelegate: z.string().min(1).max(6000),
  idempotencyKey: opKey,
  intent: z.enum(INTENTS),
  requestRef: z.string().regex(SPEND_REF_RE).optional(),
  context: relayContext.optional(),
})

export const faucetReq = z.strictObject({ amount: micro.optional(), idempotencyKey: opKey })

export const noteReq = z.strictObject({
  kind: z.enum(["memo", "decline_reason", "link_label"]),
  pot: z.string().min(2).max(64),
  ref: z.string().min(1).max(32),
  text: z.string().min(1).max(2000),
  idempotencyKey: opKey.optional(),
})

/** POST /api/pots/[pot]/requests/[id]/comments: the text is cleaned and length-checked in server/features/comments.ts
 *  (cleanComment: 1-280 code points after NFC + trim); the raw cap here only bounds the work. */
export const commentPostReq = z.strictObject({
  body: z.string().min(1).max(2000),
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

/** POST /api/pots/[pot]/topups ("Ask for a top-up"): the reason is cleaned and length-checked in server/features/topups.ts
 *  (cleanReason: ≤ 80 code points, one line); the raw cap here only bounds the work. `dueAt` ISO (absent = in 7 days). */
export const topupPostReq = z.strictObject({
  mode: z.enum(["each", "total"]),
  amount: micro,
  reason: z.string().max(400).nullable().optional(),
  dueAt: z.string().min(10).max(40).optional(),
  idempotencyKey: opKey,
})

/** POST /api/nudges: one person or several (≤ 50), optionally about a top-up ask. */
export const nudgeReq = z.strictObject({
  pot: z.string().min(2).max(64),
  to: z.union([accountId, z.array(accountId).min(1).max(50)]),
  topup: z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .optional(),
  idempotencyKey: opKey,
})
