// Relay client (frontend-architecture §4.8, api-spec §2.3). POST /api/relay with a signed delegate (device key)
// or a demo intent; 202 `pending` → poll GET /api/relay/[id]; the early two-phase request_spend answer
// (`final: false`) can be followed to its final payout with followRelay(). A network error means the outcome
// is unknown: the identical body (same idempotencyKey) is retried twice and the server replays its answer.
import type { Api } from "@pot/sdk"
import { ActionError } from "../errors"
import { api } from "./api"

export type RelayOk = Api.RelayOk

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET /api/relay/[id] until it's no longer pending (or `until` is satisfied), within `budgetMs`. */
export async function pollRelay(relayId: string, opts: { budgetMs?: number; everyMs?: number; until?: (r: RelayOk) => boolean } = {}): Promise<RelayOk | null> {
  const end = Date.now() + (opts.budgetMs ?? 30_000)
  const until = opts.until ?? (() => true)
  let last: RelayOk | null = null
  while (Date.now() < end) {
    await sleep(opts.everyMs ?? 1000)
    try {
      const { data } = await api<Api.RelayRes>("GET", `/api/relay/${encodeURIComponent(relayId)}`)
      if (data.ok && !("status" in data && data.status === "pending")) {
        last = data as RelayOk
        if (until(last)) return last
      }
    } catch (e) {
      if (e instanceof ActionError && e.cls !== "offline" && e.cls !== "relayer_down" && e.cls !== "unknown_outcome") throw e
    }
  }
  return last
}

/** POST /api/relay → the settled RelayOk (a 202 is polled to its outcome). Throws ActionError. */
export async function postRelay(body: Api.RelayReq): Promise<RelayOk> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { status, data } = await api<Api.RelayRes>("POST", "/api/relay", body)
      if (status === 202 || ("status" in data && (data as Api.RelayPending).status === "pending")) {
        const pending = data as Api.RelayPending
        const r = await pollRelay(pending.relayId, { budgetMs: 40_000 })
        if (!r) throw new ActionError("unknown_outcome", "pending", { txHash: pending.txHash, moneyMoved: "unknown" })
        return r
      }
      return data as RelayOk
    } catch (e) {
      lastErr = e
      // only an unknown outcome is retried here (same body = same idempotencyKey → replay, KB R6 step 8)
      if (!(e instanceof ActionError) || e.cls !== "unknown_outcome" || e.reason === "pending") throw e
      await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr
}

/** After an early (`final: false`) request_spend answer: follow it to the final one (≤ 15 s, every 1 s). */
export async function followRelay(r: RelayOk, budgetMs = 15_000): Promise<RelayOk> {
  if (r.final) return r
  return (await pollRelay(r.relayId, { budgetMs, until: (x) => x.final })) ?? r
}

/** The ERR_* code of an inner failure, if any. */
export const innerError = (r: RelayOk): string | null => (r.outcome === "inner_failed" ? (r.errorCode ?? "UNKNOWN") : null)
