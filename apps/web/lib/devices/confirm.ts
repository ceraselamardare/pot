"use client"
// "Confirm it's you" (D-21; frontend-architecture §5.7; api-spec §2.2): a NEAR Auth account on a new device (or a
// fresh Home Screen install) whose device key isn't on chain yet. The signing layer calls
// requireDeviceConfirmation() when an action needs the key; the ConfirmStep host (components/features/devices)
// shows the sheet, and the original action resumes once POST /api/devices has added the key.
import { base64urlnopad } from "@scure/base"
import { useSyncExternalStore } from "react"
import type { Api } from "@pot/sdk"
import { ActionError } from "@/lib/client/errors"
import { deviceKeys } from "@/lib/client/keys/device-key-store"
import { api } from "@/lib/client/live/api"
import { signingChain } from "@/lib/client/live/chain"
import { SESSION_KEY, type SessionInfo } from "@/lib/client/live/session"
import { queryClient } from "@/lib/client/query"

export interface PreparedAddKey {
  bytes: Uint8Array
  accountId: string
  devicePublicKey: string
  keyKind: "webcrypto" | "fallback"
  at: number
}

type Pending = { resolve: () => void; reject: (e: unknown) => void }
let pending: Pending | null = null
let open = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function useConfirmOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => open,
    () => false,
  )
}

/** Opens the ConfirmStep and resolves when this device's key is on the account (rejects on "Not now"). */
export function requireDeviceConfirmation(): Promise<void> {
  if (pending) {
    const prev = pending
    return new Promise((resolve, reject) => {
      pending = {
        resolve: () => {
          prev.resolve()
          resolve()
        },
        reject: (e) => {
          prev.reject(e)
          reject(e)
        },
      }
    })
  }
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    open = true
    emit()
  })
}

export function settleConfirmation(ok: boolean, err?: unknown) {
  const p = pending
  pending = null
  open = false
  emit()
  if (!p) return
  if (ok) p.resolve()
  else p.reject(err ?? new ActionError("needs_device", "cancelled"))
}

/** Before the tap: the AddKey bytes with the MPC key's next nonce and a fresh block window. */
export async function prepareAddDevice(session: SessionInfo): Promise<PreparedAddKey> {
  const keys = deviceKeys()
  if (!keys) throw new ActionError("needs_device", "unsupported")
  if (session.kind !== "near-auth" || !session.mpcPublicKey) throw new ActionError("needs_device", "no_mpc_key")
  const cur = (await keys.get("current")) ?? (await keys.promotePending(session.accountId))
  const ak = await signingChain().account.accessKey(session.accountId as never, session.mpcPublicKey as never)
  if (!ak.value) throw new ActionError("failed", "mpc_key_missing")
  const { addKeyDelegateBytes } = await import("@/lib/signing/near-auth/addKey")
  const bytes = addKeyDelegateBytes({
    accountId: session.accountId,
    mpcPublicKey: session.mpcPublicKey,
    devicePublicKey: cur.publicKey,
    mpcNonce: ak.value.nonce,
    blockHeight: ak.blockHeight,
  })
  return { bytes, accountId: session.accountId, devicePublicKey: cur.publicKey, keyKind: cur.impl, at: Date.now() }
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))

/** POST /api/devices with the approval JWT; then wait until the key is visible and refresh the session. */
export async function submitAddDevice(p: Pick<PreparedAddKey, "bytes" | "accountId" | "devicePublicKey" | "keyKind">, jwt: string): Promise<Api.DevicesRes> {
  const keys = deviceKeys()
  if (!keys) throw new ActionError("needs_device", "unsupported")
  const ts = Date.now()
  const sig = await keys.sign(new TextEncoder().encode(`pot-device-add-v1|${p.accountId}|${ts}`), "current")
  const guardDomain = process.env.NEXT_PUBLIC_NEAR_AUTH_DOMAIN || "login.testnet.fast-auth.com"
  const body: Api.DevicesReq = {
    guardId: `jwt#https://${guardDomain}/` as Api.DevicesReq["guardId"],
    verifyPayload: jwt,
    signPayload: b64(p.bytes),
    devicePublicKey: p.devicePublicKey as Api.DevicesReq["devicePublicKey"],
    keyKind: p.keyKind,
    pop: { ts, sig: base64urlnopad.encode(sig) },
    idempotencyKey: (await import("@pot/sdk")).newOpKey(),
  }
  const { data } = await api<Api.DevicesRes & { session?: SessionInfo }>("POST", "/api/devices", body)
  for (let i = 0; i < 20; i++) {
    const ak = await signingChain().account.accessKey(p.accountId as never, p.devicePublicKey as never).catch(() => null)
    if (ak?.value) break
    await new Promise((r) => setTimeout(r, 500))
  }
  await keys.markOnChain()
  const qc = queryClient()
  if (data.session) qc.setQueryData(SESSION_KEY, data.session)
  else void qc.invalidateQueries({ queryKey: SESSION_KEY })
  return data
}
