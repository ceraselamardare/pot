// Coalesced, non-cancelling refetch for the live reads (QA 2026-10-22, testnet E-d).
//
// `invalidateQueries` cancels a fetch in flight and starts a new one (cancelRefetch: true). A cancelled bundle
// fetch can't take back its RPC reads: they are already queued in the tab's 100/min FIFO token bucket and still
// run. Every heartbeat change (seq, balance, members…) seen by every mounted screen restarted the bundle, so one
// change cost N bundles of 4-5 queued reads, the surviving fetch waited behind all of them, and the next change
// cancelled it again: the Pot screen's bundle never landed (the feed missed a friend's spend and the requester's
// own new request for > 30 s while the balance, read by the heartbeat, moved on).
//
// refreshQuery(): when nothing is in flight, start one fetch. When one is in flight, let it land and read once
// more afterwards (the change may have happened after its reads), however many callers asked meanwhile.
import type { QueryClient, QueryKey } from "@tanstack/react-query"

const trailing = new Set<string>()
const startedAt = new Map<string, number>()
/** a fetch started this recently can't have read anything yet: no trailing refetch is needed for it */
const SAME_BURST_MS = 50

export function refreshQuery(qc: QueryClient, key: QueryKey, now: () => number = Date.now): Promise<void> {
  const hash = JSON.stringify(key)
  const q = qc.getQueryCache().find({ queryKey: key, exact: true })
  if (q?.state.fetchStatus === "fetching") {
    if (trailing.has(hash) || now() - (startedAt.get(hash) ?? 0) < SAME_BURST_MS) return Promise.resolve()
    trailing.add(hash)
    return qc
      .refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: false }) // resolves when the running fetch ends
      .catch(() => undefined)
      .then(() => {
        trailing.delete(hash)
        startedAt.set(hash, now())
        return qc.invalidateQueries({ queryKey: key, exact: true }, { cancelRefetch: false })
      })
  }
  startedAt.set(hash, now())
  return qc.invalidateQueries({ queryKey: key, exact: true }, { cancelRefetch: false })
}
