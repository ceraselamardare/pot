// Pending-ops store (frontend-architecture §6.1-6.2): optimistic "Sending…" items, "Sent" for 2 s, and
// revert-with-toast on failure. No library: a reducer + useSyncExternalStore. Ops are never queued while
// offline (delegates expire in ~2 min), so callers check `navigator.onLine` before run().
// The inline-approve Undo window (ux-spec 6.4 A) is an op with `delayUntil`: cancel() inside the window
// removes it before anything is sent (WCAG 3.3.4).
import { useSyncExternalStore } from "react"
import type { MessageKey } from "@/i18n/t"
import type { Micro } from "../money"

export type OpKind = "add" | "spend" | "vote" | "create"
export type OpStatus = "queued" | "relaying" | "confirmed" | "failed" | "cancelled"

export interface PendingOp {
  id: string
  kind: OpKind
  pot: string
  actor: string
  amount?: Micro
  requestId?: number
  status: OpStatus
  createdAt: number
  /** inline-approve Undo window: nothing is sent before this time */
  delayUntil?: number
  /** the feed key of the real item once the action landed (shows "Sent" for 2 s) */
  resultKey?: string
  errorKey?: MessageKey
}

export type OpsAction =
  | { type: "add"; op: PendingOp }
  | { type: "status"; id: string; status: OpStatus; resultKey?: string; errorKey?: MessageKey }
  | { type: "remove"; id: string }

export function opsReducer(ops: readonly PendingOp[], a: OpsAction): PendingOp[] {
  switch (a.type) {
    case "add":
      return ops.some((o) => o.id === a.op.id) ? [...ops] : [...ops, a.op]
    case "status":
      return ops.map((o) =>
        o.id === a.id
          ? { ...o, status: a.status, resultKey: a.resultKey ?? o.resultKey, errorKey: a.errorKey ?? o.errorKey }
          : o,
      )
    case "remove":
      return ops.filter((o) => o.id !== a.id)
  }
}

/** Money on its way into a Pot: shown as "+$150 on the way", never added to the hero number (ux-spec 4.4). */
export function pendingIn(ops: readonly PendingOp[], pot: string): Micro {
  return ops
    .filter((o) => o.pot === pot && o.kind === "add" && (o.status === "queued" || o.status === "relaying"))
    .reduce((s, o) => s + (o.amount ?? 0n), 0n)
}

export type RunResult = "ok" | "failed" | "cancelled"

export interface RunOptions {
  /** copy key for the revert toast (the flow's `*.error.relayer`) */
  errorKey: MessageKey
  onError?: (key: MessageKey, op: PendingOp) => void
  onSuccess?: (op: PendingOp) => void
  /** how long "Sent" shows before the op is dropped (§6.2: 2 s) */
  confirmMs?: number
  /** fade-out before a failed item disappears (§6.2: 200 ms) */
  failFadeMs?: number
}

export interface OpHandle {
  id: string
  /** cancels a queued op (Undo); false once it started sending */
  cancel(): boolean
  done: Promise<RunResult>
}

/** 16-char Crockford base32 id (= idempotencyKey = requestRef on testnet, §6.1). */
export function newOpId(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0
  return Array.from(bytes, (b) => alphabet[b % 32]).join("")
}

export function createOpsStore(clock: { now: () => number } = { now: () => Date.now() }) {
  let ops: PendingOp[] = []
  const listeners = new Set<() => void>()
  const cancels = new Map<string, () => boolean>()
  const dispatch = (a: OpsAction) => {
    ops = opsReducer(ops, a)
    for (const l of listeners) l()
  }
  const get = (id: string) => ops.find((o) => o.id === id)

  function run(
    draft: Omit<PendingOp, "id" | "status" | "createdAt"> & { id?: string },
    exec: () => Promise<string | void>,
    opts: RunOptions,
  ): OpHandle {
    const id = draft.id ?? newOpId()
    const createdAt = clock.now()
    const op: PendingOp = { ...draft, id, createdAt, status: draft.delayUntil ? "queued" : "relaying" }
    dispatch({ type: "add", op })
    let resolveDone!: (r: RunResult) => void
    const done = new Promise<RunResult>((r) => (resolveDone = r))
    let started = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const start = async () => {
      started = true
      cancels.delete(id)
      if (get(id)?.status === "cancelled") return
      dispatch({ type: "status", id, status: "relaying" })
      try {
        const resultKey = (await exec()) ?? undefined
        dispatch({ type: "status", id, status: "confirmed", resultKey })
        opts.onSuccess?.(get(id)!)
        setTimeout(() => dispatch({ type: "remove", id }), opts.confirmMs ?? 2000)
        resolveDone("ok")
      } catch {
        dispatch({ type: "status", id, status: "failed", errorKey: opts.errorKey })
        const failed = get(id)!
        setTimeout(() => {
          dispatch({ type: "remove", id })
          opts.onError?.(opts.errorKey, failed)
        }, opts.failFadeMs ?? 200)
        resolveDone("failed")
      }
    }

    if (op.delayUntil) timer = setTimeout(start, Math.max(0, op.delayUntil - createdAt))
    else void start()

    const cancel = () => {
      if (started) return false
      if (timer) clearTimeout(timer)
      cancels.delete(id)
      dispatch({ type: "status", id, status: "cancelled" })
      dispatch({ type: "remove", id })
      resolveDone("cancelled")
      return true
    }
    cancels.set(id, cancel)
    void done.then(() => cancels.delete(id))
    return { id, done, cancel }
  }

  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot: () => ops as readonly PendingOp[],
    run,
    /** Undo: cancel a queued op by id; false once it started sending */
    cancel: (id: string) => cancels.get(id)?.() ?? false,
    /** test helper */
    clear() {
      ops = []
      for (const l of listeners) l()
    },
  }
}

export type OpsStore = ReturnType<typeof createOpsStore>

/** The app-wide store. */
export const ops = createOpsStore()
const EMPTY: readonly PendingOp[] = []

export function useOps(): readonly PendingOp[] {
  return useSyncExternalStore(ops.subscribe, ops.getSnapshot, () => EMPTY)
}
