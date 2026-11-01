// Settling optimistic state (frontend-architecture §3.4-3.5): after a relayed action, invalidate what it touched
// and keep its optimistic projection until the views have been read at a block ≥ the relay's executedAtBlock.
// Fast heartbeat: refetch every 1 s; after 10 s it settles anyway after one forced refetch (the views win).
import type { QueryKey } from "@tanstack/react-query"
import { queryClient } from "../query"
import { qk, fetchBundle, type Bundle } from "./queries"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function heightOf(data: unknown): number {
  if (data && typeof data === "object" && "blockHeight" in data) return Number((data as { blockHeight: number }).blockHeight)
  return -1
}

/** Refetch `keys` until each has blockHeight ≥ `block` (or `timeoutMs`). Resolves true when settled. */
export async function settleAt(keys: QueryKey[], block: number, timeoutMs = 10_000): Promise<boolean> {
  const qc = queryClient()
  const end = Date.now() + timeoutMs
  for (;;) {
    await Promise.all(keys.map((k) => qc.refetchQueries({ queryKey: k, exact: true, type: "all" })))
    const ok = keys.every((k) => heightOf(qc.getQueryData(k)) >= block || qc.getQueryState(k) === undefined)
    if (ok) return true
    if (Date.now() > end) return false
    await sleep(1000)
  }
}

/** Settle a Pot after an action at `block`: heartbeat views first, then the bundle at that height. */
export async function settlePot(dao: string, block: number, timeoutMs = 10_000): Promise<void> {
  const qc = queryClient()
  // make sure the heartbeat queries exist even when the screen isn't mounted
  await Promise.all([
    qc.prefetchQuery({ queryKey: qk.view(dao), queryFn: () => import("./chain").then((m) => m.chain().hub.getPot(dao as never)) }),
    qc.prefetchQuery({ queryKey: qk.balance(dao), queryFn: () => import("./chain").then((m) => m.chain().usdc.balanceOf(dao as never)) }),
  ])
  await settleAt([qk.view(dao), qk.balance(dao)], block, timeoutMs)
  const end = Date.now() + timeoutMs
  for (;;) {
    const b = await qc.fetchQuery({ queryKey: qk.bundle(dao), queryFn: () => fetchBundle(qc, dao), staleTime: 0 })
    if ((b as Bundle).blockHeight >= block || Date.now() > end) return
    await sleep(1000)
  }
}

/**
 * §3.4 "invalidate immediately (prefix match)". Without cancelling a fetch in flight: its RPC reads are already
 * queued in the tab's budget and run anyway (refresh.ts); settlePot then reads again at the action's block.
 */
export function invalidatePot(dao: string, extra: QueryKey[] = []): void {
  const qc = queryClient()
  void qc.invalidateQueries({ queryKey: qk.pot(dao) }, { cancelRefetch: false })
  for (const k of extra) void qc.invalidateQueries({ queryKey: k })
}
