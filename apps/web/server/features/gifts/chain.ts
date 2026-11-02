// Gifts: what the hub says about a Pot's gifts (hub 1.2.0 `get_gifts`, else get_pot's fields) and its goal (hub 1.1.0).
// Unknown answers never block a page: `giftsOf` → null means "unknown" (treated as on, totals from our DB); the hub
// checks everything again when the money arrives (ft_on_transfer refuses and the token refunds the giver).
import "server-only"
import { parseGiftsView as parseSdkGiftsView, type GiftRefusal, type RawGiftsView, type RawGoalView, type RawPotView } from "@pot/sdk"
import { viewFunction } from "../../chain/near"
import type { RpcClient } from "../../chain/rpc"

/** What the hub says about a Pot's gifts. `refusal` comes from hub 1.2.0 `get_gifts` (null from the get_pot fallback). */
export interface GiftsOnChain {
  on: boolean
  total: bigint
  count: number
  refusal?: GiftRefusal | null
}

export interface GiftChain {
  /** null = the hub doesn't say (1.1.0, an RPC failure, missing fields) */
  giftsOf(pot: string): Promise<GiftsOnChain | null>
  /** an all-or-nothing goal that is still collecting (the hub refuses gifts then); errors → false */
  goalCollecting(pot: string): Promise<boolean>
}

type PotGiftFields = { gifts_on?: unknown; gifts_total?: unknown; gifts_count?: unknown }

const U128_RE = /^(0|[1-9][0-9]{0,38})$/
const REFUSALS: readonly string[] = ["pot_not_open", "paused", "gifts_off", "goal_collecting", "goal_missed"]

const countOf = (c: unknown): number | null => {
  const n = typeof c === "string" && /^[0-9]{1,15}$/.test(c) ? Number(c) : c
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** hub 1.1.0+ `get_pot`'s `gifts_on/gifts_total/gifts_count` (1.2.0 adds them), or null when any is missing or malformed. */
export function parseGiftsView(v: unknown): GiftsOnChain | null {
  if (!v || typeof v !== "object") return null
  const g = v as PotGiftFields
  if (typeof g.gifts_on !== "boolean") return null
  const total = typeof g.gifts_total === "string" && U128_RE.test(g.gifts_total) ? BigInt(g.gifts_total) : null
  const count = countOf(g.gifts_count)
  if (total === null || count === null) return null
  return { on: g.gifts_on, total, count }
}

/**
 * hub 1.2.0 `get_gifts(pot) → {pot, on, total, count, accepting, refusal, …} | null` through the sdk's parser, after a
 * shape check (an RPC answer is untrusted input). null when the shape isn't the hub 1.2.0 one.
 */
export function parseGetGifts(v: unknown): GiftsOnChain | null {
  if (!v || typeof v !== "object") return null
  const r = v as Partial<RawGiftsView>
  if (typeof r.on !== "boolean" || typeof r.total !== "string" || !U128_RE.test(r.total) || countOf(r.count) === null) return null
  const refusal = typeof r.refusal === "string" && REFUSALS.includes(r.refusal) ? r.refusal : null
  const g = parseSdkGiftsView({
    pot: typeof r.pot === "string" ? r.pot : "",
    on: r.on,
    total: r.total,
    count: countOf(r.count)!,
    last_gift_ms: null,
    in_flight: r.in_flight === true,
    accepting: r.accepting === true,
    refusal,
    min_amount: typeof r.min_amount === "string" && U128_RE.test(r.min_amount) ? r.min_amount : "0",
  })
  return { on: g.on, total: g.total, count: g.count, refusal: g.refusal }
}

const TTL_MS = 10_000

export function createGiftChain(rpc: RpcClient, hubId: string): GiftChain {
  const gifts = new Map<string, { v: GiftsOnChain | null; until: number }>()
  const goals = new Map<string, { v: boolean; until: number }>()
  const cached = <V>(m: Map<string, { v: V; until: number }>, k: string): { v: V } | undefined => {
    const hit = m.get(k)
    if (!hit) return undefined
    if (hit.until < Date.now()) {
      m.delete(k)
      return undefined
    }
    return hit
  }
  const put = <V>(m: Map<string, { v: V; until: number }>, k: string, v: V) => {
    if (m.size > 5_000) m.clear()
    m.set(k, { v, until: Date.now() + TTL_MS })
  }

  return {
    async giftsOf(pot) {
      const hit = cached(gifts, pot)
      if (hit) return hit.v
      let v: GiftsOnChain | null = null
      // hub 1.2.0 `get_gifts`; a 1.1.0 hub has no such method (→ get_pot, whose gift fields are missing → null)
      try {
        v = parseGetGifts(await viewFunction<unknown>(rpc, hubId, "get_gifts", { pot }, "optimistic"))
      } catch {
        // MethodNotFound on hub 1.1.0, or the RPC is down: try get_pot
      }
      if (!v) {
        try {
          v = parseGiftsView(await viewFunction<RawPotView | null>(rpc, hubId, "get_pot", { pot }, "optimistic"))
        } catch {
          v = null
        }
      }
      put(gifts, pot, v)
      return v
    },
    async goalCollecting(pot) {
      const hit = cached(goals, pot)
      if (hit) return hit.v
      let v = false
      try {
        // hub 1.1.0 get_goal (RawGoalView); null = no goal
        const g = await viewFunction<RawGoalView | null>(rpc, hubId, "get_goal", { pot }, "optimistic")
        v = !!g && g.all_or_nothing === true && g.state === "collecting"
      } catch {
        // no get_goal (hub 1.0.0) or an RPC failure: the Pot view's extras.goal + goal_state, else "no goal"
        try {
          const pv = await viewFunction<RawPotView | null>(rpc, hubId, "get_pot", { pot }, "optimistic")
          const goal = pv?.extras?.goal
          v = !!goal && goal.all_or_nothing && (pv?.goal_state ? pv.goal_state === "collecting" : Date.now() < goal.deadline_ms)
        } catch {
          v = false
        }
      }
      put(goals, pot, v)
      return v
    },
  }
}
