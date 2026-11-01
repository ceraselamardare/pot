// hub 1.1.0 (wave 4) on testnet: the one OK (ok_request through the relayer, R13) and the new views the Pot screen
// reads (get_trusts, get_goal) and the public Pot record (get_record). The views are optional on @pot/sdk's
// HubViews (a 1.0.0 hub has none of them): every read degrades to "not there" (null / []), so the app keeps working
// against the deployed 1.0.0 hub until the upgrade (notes/contracts-wave4.md §6).
import type { ChainViews, GoalView, RecordEntry, TrustView } from "@pot/sdk"
import { daoOf } from "../config"
import { ActionError } from "../errors"
import { chain } from "./chain"
import { innerError } from "./relay"
import { invalidatePot, settlePot } from "./settle"
import { send } from "./signing"

export type LiveOkResult = "approved" | "failed" | "objection" | "decided" | "expired" | "self" | "not_one_ok" | "not_member"

/** The hub's OkOutcome reasons / error codes → what the Approve sheet says (notes/contracts-wave4.md §3). */
export function okResultOf(code: string | null, approved: boolean, payoutFailed: boolean): LiveOkResult {
  if (!code) return approved ? (payoutFailed ? "failed" : "approved") : "decided"
  switch (code) {
    case "ERR_OK_SELF":
      return "self"
    case "ERR_NOT_ONE_OK":
      return "not_one_ok"
    case "ERR_NOT_MEMBER":
    case "OK_NOT_IN_DAO_GROUP":
      return "not_member"
    case "OK_OBJECTION":
      return "objection"
    case "ERR_NOT_PENDING":
    case "OK_NOT_PENDING":
    case "OK_NOT_OPEN":
    case "OK_STALE":
    case "OK_POT_NOT_OPEN":
      return "decided"
    default:
      throw new ActionError("failed", code)
  }
}

/** ok_request(pot, request_id): 0 deposit, 200 Tgas (sdk GAS.ok_request), relayed (R13; 0 hub NEAR). */
export async function okRequest(slug: string, requestId: number): Promise<LiveOkResult> {
  const dao = daoOf(slug)
  let r
  try {
    r = await send({ type: "ok_request", pot: dao as never, requestId })
  } catch (e) {
    if (e instanceof ActionError && e.reason === "not_a_member") return "not_member"
    if (e instanceof ActionError && e.reason === "proposal_not_open") return "decided"
    throw e
  }
  const code = innerError(r)
  const res = r.result?.type === "ok" ? r.result : null
  const payoutFailed = r.events.some((e) => e.event === "spend_payout_failed")
  const out = okResultOf(code, res?.approved ?? !code, payoutFailed)
  invalidatePot(dao)
  void settlePot(dao, r.executedAtBlock).catch(() => {})
  return out
}

// ------------------------------------------------------------------------------------------------- reads

/** get_trusts (≤ 40 members); [] on a 1.0.0 hub. */
export async function readTrusts(dao: string, c: ChainViews = chain()): Promise<TrustView[]> {
  if (!c.hub.getTrusts) return []
  try {
    return (await c.hub.getTrusts(dao as never)).value
  } catch {
    return []
  }
}

/** get_goal; null without a goal (or on a 1.0.0 hub). */
export async function readGoal(dao: string, c: ChainViews = chain()): Promise<GoalView | null> {
  if (!c.hub.getGoal) return null
  try {
    return (await c.hub.getGoal(dao as never)).value
  } catch {
    return null
  }
}

/** get_record, every page (50 a page, ≤ 1,000 requests per Pot); null on a 1.0.0 hub. */
export async function readRecord(dao: string, c: ChainViews = chain(), maxPages = 20): Promise<RecordEntry[] | null> {
  if (!c.hub.getRecord) return null
  const out: RecordEntry[] = []
  try {
    for (let page = 0; page < maxPages; page++) {
      const rows = (await c.hub.getRecord(dao as never, page * 50, 50)).value
      out.push(...rows)
      if (rows.length < 50) break
    }
    return out
  } catch {
    return out.length ? out : null
  }
}
