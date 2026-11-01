"use client"
// Receipt details saved with a spend (lib/receipt-saved.ts). One facade over both data sources:
//  - mock: the browser mock world (world.saveReceipt / savedReceiptFor, the store's 'receipt_save' fault hook);
//  - testnet: POST/GET /api/pots/[pot]/requests/[id]/receipt (members only; the server recomputes the fingerprint and
//    compares it with the one the request carries in its request_ref).
// Two phases: the details are fixed BEFORE the request is sent (their fingerprint goes into the request), kept on
// this device until saved (`pot.receipts.pending.v1`, keyed by Pot + fingerprint, so a crash between the relay and
// the save loses nothing), then saved once the hub has given the request its id: for an instant spend that id comes
// from the relay's answer. A failed save stays pending and is tried again when the spend's details are opened.
// Nothing here signs or sends a transaction, and no photo is ever involved.
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { fingerprintStatus, receiptFingerprint, shortFingerprint, type FingerprintStatus, type SavedReceipt, type SpendReceiptRes } from "@/lib/receipt-saved"
import { IS_LIVE, daoOf } from "../config"
import { ActionError } from "../errors"
import { api } from "../live/api"
import { qk } from "../live/queries"
import { refreshQuery } from "../live/refresh"
import * as store from "../mock/store"
import { useWorld } from "../mock/store"
import type { PotVM, RequestVM } from "../mock/types"
import { savedReceiptFor } from "../mock/world"
import { queryClient } from "../query"

const PENDING_KEY = "pot.receipts.pending.v1"
/** How long a not-yet-saved receipt is kept on this device (the server refuses older readings anyway). */
const PENDING_TTL_MS = 30 * 86_400_000

export type SavedReceiptState =
  | { state: "none" }
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; receipt: SavedReceipt; check: FingerprintStatus }

const path = (slug: string, requestId: number) => `/api/pots/${encodeURIComponent(daoOf(slug))}/requests/${requestId}/receipt`
export const savedReceiptKey = (slug: string, requestId: number) => [...qk.pot(daoOf(slug)), "receipt", requestId] as const

// ------------------------------------------------------------------------------------------------ pending (this device)

interface Pending {
  receipt: SavedReceipt
  createdAt: number
  /** the hub's request id, once known */
  id?: number
}
type Table = Record<string, Pending>

function readPending(): Table {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Table) : {}
  } catch {
    return {}
  }
}
function writePending(t: Table) {
  try {
    const now = Date.now()
    const kept = Object.fromEntries(Object.entries(t).filter(([, p]) => now - p.createdAt < PENDING_TTL_MS))
    if (Object.keys(kept).length) localStorage.setItem(PENDING_KEY, JSON.stringify(kept))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    /* private mode: the save is tried once, from memory */
  }
}
const pendingKey = (slug: string, fp: string) => `${slug}:${shortFingerprint(fp)}`

/** Keep the details on this device before the request is sent (its fingerprint names it). */
export function keepPendingReceipt(slug: string, receipt: SavedReceipt): void {
  writePending({ ...readPending(), [pendingKey(slug, receiptFingerprint(receipt))]: { receipt, createdAt: Date.now() } })
}

/** The details still waiting to be saved for a request carrying `fingerprint` (16 hex), if this device has them. */
export function pendingReceiptFor(slug: string, fingerprint: string | null | undefined): Pending | null {
  if (!fingerprint) return null
  return readPending()[`${slug}:${fingerprint}`] ?? null
}

function dropPending(slug: string, receipt: SavedReceipt) {
  const t = readPending()
  delete t[pendingKey(slug, receiptFingerprint(receipt))]
  writePending(t)
}

// ------------------------------------------------------------------------------------------------ save

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** The hub's views lag the relay's answer by a block or two: a fresh request may not be readable yet. */
const NOT_YET_DELAYS_MS = [1_500, 3_000, 5_000]

async function postOnce(slug: string, requestId: number, receipt: SavedReceipt): Promise<void> {
  if (!IS_LIVE) return store.saveReceipt(slug, requestId, receipt)
  for (let i = 0; ; i++) {
    try {
      const { data } = await api<SpendReceiptRes>("POST", path(slug, requestId), { receipt })
      queryClient().setQueryData(savedReceiptKey(slug, requestId), data)
      return
    } catch (e) {
      const notYet = e instanceof ActionError && e.reason === "not_found"
      if (!notYet || i >= NOT_YET_DELAYS_MS.length) throw e
      await sleep(NOT_YET_DELAYS_MS[i]!)
    }
  }
}

/** Already saved (the same details, or a replay that lost its answer) counts as saved. */
const isDone = (e: unknown) => e instanceof ActionError && e.reason === "idempotency_conflict"
/** Trying again can't help (the details don't match the spend, it isn't mine, I left the Pot): stop keeping them. */
const isFinal = (e: unknown) => e instanceof ActionError && ["payload_mismatch", "action_not_allowed", "bad_request", "not_a_member"].includes(e.reason)

/**
 * Save the details of my own spend `requestId` (they were kept pending before it was sent). Resolves true once saved;
 * false when it didn't work (they stay pending and are tried again from the details sheet).
 */
export async function attachReceipt(slug: string, requestId: number, receipt: SavedReceipt): Promise<boolean> {
  try {
    await postOnce(slug, requestId, receipt)
  } catch (e) {
    if (isFinal(e)) {
      dropPending(slug, receipt)
      return false
    }
    if (!isDone(e)) {
      const t = readPending()
      const k = pendingKey(slug, receiptFingerprint(receipt))
      if (t[k]) writePending({ ...t, [k]: { ...t[k]!, id: requestId } })
      return false
    }
  }
  dropPending(slug, receipt)
  if (IS_LIVE) {
    const qc = queryClient()
    void refreshQuery(qc, qk.bundle(daoOf(slug)))
    void refreshQuery(qc, savedReceiptKey(slug, requestId))
  }
  return true
}

/** The details sheet of my own spend that carries a fingerprint but has no saved details: try the pending save again. */
export async function retryPendingReceipt(slug: string, r: Pick<RequestVM, "id" | "fingerprint" | "hasReceipt" | "mine">): Promise<boolean> {
  if (!r.mine || r.hasReceipt) return false
  const p = pendingReceiptFor(slug, r.fingerprint)
  return p ? attachReceipt(slug, r.id, p.receipt) : false
}

// ------------------------------------------------------------------------------------------------ read

function useMockSavedReceipt(pot: PotVM, r: Pick<RequestVM, "id" | "fingerprint" | "hasReceipt">): SavedReceiptState {
  const world = useWorld()
  const me = pot.me?.person.id ?? null
  return useMemo((): SavedReceiptState => {
    if (!world) return { state: "loading" }
    const receipt = savedReceiptFor(world, pot.slug, r.id, me)
    return receipt ? { state: "ready", receipt, check: fingerprintStatus(receipt, r.fingerprint) } : { state: "none" }
  }, [world, pot.slug, r.id, r.fingerprint, me])
}

function useLiveSavedReceipt(pot: PotVM, r: Pick<RequestVM, "id" | "fingerprint" | "hasReceipt">): SavedReceiptState {
  const enabled = !!r.hasReceipt && !!pot.me
  const q = useQuery({
    queryKey: savedReceiptKey(pot.slug, r.id),
    queryFn: async () => (await api<SpendReceiptRes>("GET", path(pot.slug, r.id))).data,
    enabled,
    staleTime: 60_000,
    retry: 1,
  })
  return useMemo((): SavedReceiptState => {
    if (!enabled) return { state: "none" }
    // the check is done here, against the fingerprint this browser read from the request itself
    if (q.data) return { state: "ready", receipt: q.data.receipt, check: fingerprintStatus(q.data.receipt, r.fingerprint) }
    if (q.isError) return { state: "error", retry: () => void q.refetch() }
    return { state: "loading" }
  }, [enabled, q, r.fingerprint])
}

/** A spend's saved receipt details (members only), checked against the fingerprint the request carries. */
export const useSavedReceipt: (pot: PotVM, r: Pick<RequestVM, "id" | "fingerprint" | "hasReceipt">) => SavedReceiptState = IS_LIVE ? useLiveSavedReceipt : useMockSavedReceipt
