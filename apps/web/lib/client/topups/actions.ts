"use client"
// "Ask for a top-up" actions, one implementation per data source (the mock store / our API). Off-chain only: nothing
// here signs or sends a transaction (adding money is the existing Add sheet). Errors are ActionError reasons (+ the
// API's `detail.cause`), mapped to copy by topupErrorKey / nudgeErrorKey.
import { newOpKey, type Micro } from "@pot/sdk"
import type { MessageKey } from "@/i18n/t"
import type { NudgeRes, TopupPostRes } from "@/lib/topups-api"
import { dueIn, type TopupMode } from "@/lib/topups"
import { IS_LIVE } from "../config"
import { ActionError } from "../errors"
import { api } from "../live/api"
import * as store from "../mock/store"
import { toCents } from "../money"
import { queryClient } from "../query"
import { topupKeys } from "./data"

const refresh = () => void queryClient().invalidateQueries({ queryKey: topupKeys.all, refetchType: "active" })

export interface AskTopupInput {
  mode: TopupMode
  /** per person (each) or the total (total) */
  amount: Micro
  reason: string | null
  /** due in this many days from now */
  dueInDays: number
}

/** Ask everyone in the Pot; resolves with the ask's id. `key` makes a retried ask safe. */
export async function askTopup(slug: string, input: AskTopupInput, key: string = newOpKey()): Promise<string> {
  const dueAt = dueIn(input.dueInDays, Date.now())
  if (!IS_LIVE) return store.askTopup(slug, { mode: input.mode, amount: toCents(input.amount), reason: input.reason, dueAt })
  const r = await api<TopupPostRes>("POST", `/api/pots/${encodeURIComponent(slug)}/topups`, {
    mode: input.mode,
    amount: input.amount.toString(),
    reason: input.reason,
    dueAt: new Date(dueAt).toISOString(),
    idempotencyKey: key,
  })
  refresh()
  return r.data.topup.id
}

/** The asker cancels their open ask. */
export async function cancelTopup(slug: string, id: string): Promise<void> {
  if (!IS_LIVE) return store.cancelTopup(slug, id)
  await api("DELETE", `/api/pots/${encodeURIComponent(slug)}/topups/${encodeURIComponent(id)}`, {}) // same-origin JSON
  refresh()
}

/** Nudge people who haven't added (once per person per 24 h); resolves with who was nudged. */
export async function nudgeTopup(slug: string, id: string, people: readonly string[]): Promise<string[]> {
  if (!IS_LIVE) return store.nudgeTopup(slug, id, people)
  const r = await api<NudgeRes>("POST", "/api/nudges", { pot: slug, to: [...people], topup: id, idempotencyKey: newOpKey() })
  refresh()
  return r.data.nudged
}

/** After money is added (the Add sheet, maybe for an ask): read the asks again. */
export const refreshTopups = refresh

const causeOf = (e: unknown): string | undefined => {
  const c = e instanceof ActionError ? e.detail?.cause : undefined
  return typeof c === "string" ? c : undefined
}

/** Copy for a failed ask. Nothing was asked when we get here. */
export function topupErrorKey(e: unknown): MessageKey {
  const reason = e instanceof ActionError ? e.reason : ""
  if (e instanceof ActionError && (e.cls === "rate_limited" || reason === "quota_exceeded" || reason === "rate_limited")) return "topup.error.limit"
  switch (reason) {
    case "pot_closed":
      return "topup.error.closed"
    case "action_not_allowed":
      return causeOf(e) === "alone" ? "topup.error.alone" : "topup.error.open"
  }
  return "topup.error.failed"
}

/** Copy for a failed nudge. */
export function nudgeErrorKey(e: unknown): MessageKey {
  const reason = e instanceof ActionError ? e.reason : ""
  if (reason === "nudge_too_soon") return "topup.nudge.too_soon"
  return "topup.nudge.failed"
}
