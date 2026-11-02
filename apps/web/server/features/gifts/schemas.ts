// Gifts: zod 4 request schemas (strict: unknown fields → 400 bad_request). The raw caps only bound the work: names,
// notes and the page's line are cleaned and length-checked in the feature code (lib/gifts.ts cleanGiftText), amounts
// checked against GIFT_MIN / GIFT_MAX there (→ amount_too_low / amount_too_high, not bad_request).
import { z } from "zod"
import { micro } from "../../http/schemas"

/** A client's retry key: the app's 16-char op keys, or any 16-64 url-safe characters. */
export const giftClientKey = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/)

const text = (max: number) => z.string().max(max).nullable().optional()

/** POST /api/pots/[pot]/gift-links (GiftLinkCreateReq) */
export const giftLinkCreateReq = z.strictObject({
  amount: micro.nullable().optional(),
  note: text(1000),
  reusable: z.boolean().optional(),
  idempotencyKey: giftClientKey.optional(),
})

/** PUT /api/pots/[pot]/gift-page (GiftPagePutReq) */
export const giftPagePutReq = z.strictObject({
  on: z.boolean(),
  line: text(1000),
})

/** POST /api/gifts (GiftStartReq) */
export const giftStartReq = z.strictObject({
  pot: z.string().min(2).max(64),
  linkId: z.string().min(1).max(64).optional(),
  page: z.literal(true).optional(),
  amount: micro,
  name: text(400),
  note: text(1000),
  showPublic: z.boolean().optional(),
  idempotencyKey: giftClientKey,
})

/** PATCH /api/gifts/[ref] (GiftPatchReq): at least one field */
export const giftPatchReq = z
  .strictObject({ name: text(400), note: text(1000), showPublic: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "empty", path: ["name"] })

export type GiftLinkCreateBody = z.infer<typeof giftLinkCreateReq>
export type GiftPagePutBody = z.infer<typeof giftPagePutReq>
export type GiftStartBody = z.infer<typeof giftStartReq>
export type GiftPatchBody = z.infer<typeof giftPatchReq>
