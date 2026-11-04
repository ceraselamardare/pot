// Route glue for the 1Click routes: zod schemas (strict, api-spec §2.7) and the per-instance deps.
import "server-only"
import { z } from "zod"
import { getDb } from "@/db/client"
import { getConfig } from "../../config"
import { defer, getHub, getRpc, getSubmitter } from "../../deps"
import { micro, opKey } from "../../http/schemas"
import { XC_CHAINS, XC_COINS } from "./origins"
import { createOneClick, type OneClickClient } from "./client"
import type { OneClickDeps } from "./service"
import { SIM_SCENARIOS } from "./sim"

export const quoteReq = z.strictObject({
  pot: z.string().min(2).max(64),
  chain: z.enum(XC_CHAINS),
  /** any-coin (2026-11-04); absent = USDC where the network has it */
  coin: z.enum(XC_COINS).optional(),
  /** USD micro: what the person wants to add */
  amount: micro,
  dry: z.boolean().optional(),
  idempotencyKey: opKey,
})

/** POST /api/oneclick/price: the coin step's live dry quote (no Pot needed: members and people paying in) */
export const priceReq = z.strictObject({
  chain: z.enum(XC_CHAINS),
  coin: z.enum(XC_COINS).optional(),
  amount: micro,
})

export const simulateReq = z.strictObject({
  depositIntentId: z.string().regex(/^dp_[0-9a-z]{26}$/),
  scenario: z.enum(SIM_SCENARIOS).optional(),
  amount: micro.optional(),
  idempotencyKey: opKey,
})

export const DEPOSIT_ID_RE = /^dp_[0-9a-z]{26}$/
export const RELAY_ID_RE = /^rl_[0-9A-HJKMNP-TV-Z]{26}$/

let client: OneClickClient | undefined
export function getOneClick(): OneClickClient {
  return (client ??= createOneClick({ apiKey: process.env.ONECLICK_API_KEY || undefined }))
}

export function oneclickDeps(): OneClickDeps {
  return { db: getDb(), rpc: getRpc(), hub: getHub(), submitter: getSubmitter(), cfg: getConfig(), oneclick: getOneClick(), defer }
}
