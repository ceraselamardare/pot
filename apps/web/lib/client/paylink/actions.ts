"use client"
// Pay by link: the actions and hooks the screens use, one implementation per data source (like lib/client/actions):
//  - requestLinkSpend: a fresh link key in this browser → request_spend with `link` (the receiver is the escrow) →
//    the secret saved on this device only (secrets.ts), the label as an off-chain note (testnet).
//  - claimLink: sign the claim with the #secret here, claim to the signed-in person (claim_link, relayer R14).
//  - reclaimLink: the requester cancels; the money goes back to the Pot (reclaim_link, R15).
//  - useLinkSecret / useClaimLink: the Share card's secret and the claim page's link.
import { newOpKey } from "@pot/sdk"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useSyncExternalStore } from "react"
import { requestSpend, type SpendResult } from "../actions"
import { IS_LIVE, daoOf } from "../config"
import { ActionError } from "../errors"
import { api } from "../live/api"
import * as livePaylink from "../live/paylink"
import { useWorld } from "../mock/store"
import * as store from "../mock/store"
import type { Category } from "../mock/types"
import type { Micro } from "../money"
import { useNow } from "../time"
import type { ClaimErrorKind, ClaimLinkVM } from "./claim"
import { generateLinkKey, publicKeyOfSecret } from "./keys"
import { cleanLabel, LINK_RECEIVER, linkExpiry } from "./link"
import { claimLinkVM } from "./view"
import { adoptPending, dropPending, forgetLinkSecret, loadLinkSecret, saveLinkSecret, savePendingLink, type StoredLink } from "./secrets"

export interface LinkSpendInput {
  amount: Micro
  category: Category
  note?: string
  /** who it's for, in the requester's words (optional) */
  label?: string
}

export interface LinkSpendResult extends SpendResult {
  /** the link's #secret (this device only) */
  secret: string
}

export async function requestLinkSpend(slug: string, input: LinkSpendInput, now: number = Date.now()): Promise<LinkSpendResult> {
  const key = await generateLinkKey()
  const label = cleanLabel(input.label ?? "") ?? undefined
  const requestRef = IS_LIVE ? newOpKey() : undefined
  const stored: StoredLink = { secret: key.secret, createdAt: now, ...(label ? { label } : {}) }
  // keep the secret before anything leaves this browser: a crash between the relay and its answer can't lose it
  if (requestRef) savePendingLink(slug, requestRef, stored)
  let r: SpendResult
  try {
    r = await requestSpend(slug, {
      amount: input.amount,
      category: input.category,
      note: input.note,
      receiver: LINK_RECEIVER,
      link: { pk: key.pk, expiresAt: linkExpiry(now), ...(label ? { label } : {}) },
      ...(requestRef ? { requestRef } : {}),
    })
  } catch (e) {
    if (requestRef) dropPending(slug, requestRef)
    throw e
  }
  if (requestRef) {
    adoptPending(slug, requestRef, r.id)
    // who it's for: an off-chain note on the request (members only, like a memo); never the secret
    if (label) void api("POST", "/api/notes", { kind: "link_label", pot: daoOf(slug), ref: requestRef, text: label, idempotencyKey: newOpKey() }).catch(() => {})
  } else saveLinkSecret(slug, r.id, stored)
  notifySecrets()
  return { ...r, secret: key.secret }
}

export type ClaimResult = { ok: true; txHash?: string } | { ok: false; kind: ClaimErrorKind }

/** Claim to the signed-in person with the #secret (never sent anywhere: only its signature). */
export async function claimLink(slug: string, id: number, secret: string): Promise<ClaimResult> {
  if (IS_LIVE) return livePaylink.claimLink(slug, id, secret)
  let pk: string
  try {
    pk = await publicKeyOfSecret(secret)
  } catch {
    return { ok: false, kind: "wrong_secret" }
  }
  let r: Awaited<ReturnType<typeof store.claimLink>>
  try {
    r = await store.claimLink(slug, id, pk)
  } catch (e) {
    if (e instanceof ActionError && (e.cls === "relayer_down" || e.cls === "rate_limited")) return { ok: false, kind: "network" }
    throw e
  }
  switch (r) {
    case "claimed":
      return { ok: true }
    case "already_claimed":
      return { ok: false, kind: "claimed" }
    case "expired":
      return { ok: false, kind: "expired" }
    case "not_funded":
      return { ok: false, kind: "not_funded" }
    case "wrong_secret":
      return { ok: false, kind: "wrong_secret" }
    case "returned":
      return { ok: false, kind: "returned" }
    default:
      return { ok: false, kind: "failed" }
  }
}

export type ReclaimResult = "returned" | "done" | "not_allowed" | "not_final" | "failed"

/** The requester cancels the link: the money goes back to the Pot; the secret is forgotten. */
export async function reclaimLink(slug: string, id: number): Promise<ReclaimResult> {
  const r = IS_LIVE ? await livePaylink.reclaimLink(slug, id) : await store.reclaimLink(slug, id)
  if (r === "returned" || r === "done") {
    forgetLinkSecret(slug, id)
    notifySecrets()
  }
  return r === "not_found" ? "failed" : r
}

// ------------------------------------------------------------------------------------------------- hooks

const secretSubs = new Set<() => void>()
function notifySecrets() {
  for (const s of secretSubs) s()
}
function subscribeSecrets(cb: () => void) {
  secretSubs.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === "pot.paylinks.v1") cb()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    secretSubs.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

/**
 * The link's secret on this device (undefined before hydration, null when this device doesn't hold it). The mock's
 * seeded links fall back to their fixture secret (the showcase requester's "device").
 */
export function useLinkSecret(slug: string, id: number | null): string | null | undefined {
  return useSyncExternalStore(
    subscribeSecrets,
    () => (id === null ? null : (loadLinkSecret(slug, id)?.secret ?? (IS_LIVE ? null : store.demoLinkSecret(slug, id)))),
    () => undefined,
  )
}

/** The claim page's link, kept fresh: the mock world (live across tabs), or get_link polled while it can change. */
export function useClaimLink(slug: string, id: number, initial: ClaimLinkVM | null, poll: boolean): ClaimLinkVM | null | undefined {
  return (IS_LIVE ? useLiveClaimLink : useMockClaimLink)(slug, id, initial, poll)
}

function useMockClaimLink(slug: string, id: number): ClaimLinkVM | null | undefined {
  const world = useWorld()
  const now = useNow()
  return useMemo(() => (world && now ? store.claimLinkView(world, slug, id, now) : undefined), [world, now, slug, id])
}

function useLiveClaimLink(slug: string, id: number, initial: ClaimLinkVM | null, poll: boolean): ClaimLinkVM | null | undefined {
  const now = useNow()
  const q = useQuery({
    queryKey: ["claim-link", slug, id],
    queryFn: () => livePaylink.fetchLinkView(slug, id),
    // every 4 s while it can change by itself: the group's OK (awaiting funds), a claim or return in flight
    refetchInterval: (query: { state: { data?: Awaited<ReturnType<typeof livePaylink.fetchLinkView>> } }) => {
      const d = query.state.data
      return poll || d === undefined || (d !== null && (d.status === "awaiting_funds" || d.status === "claiming" || d.status === "returning")) ? 4_000 : false
    },
    staleTime: 2_000,
  })
  return useMemo(() => {
    if (q.data === undefined || now === 0) return initial ?? undefined
    if (q.data === null) return null
    const pot = initial ?? { potName: slug, potEmoji: "", potCover: 0, requesterName: null }
    return claimLinkVM(slug, q.data, { name: pot.potName, emoji: pot.potEmoji, cover: pot.potCover }, pot.requesterName, now)
  }, [q.data, initial, slug, now])
}
