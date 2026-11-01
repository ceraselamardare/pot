// Live pay by link (hub 1.1.0; notes/contracts-wave4.md §3, relayer R14/R15):
//  - claim: sign `pot-claim:v1:<hub>:<pot>:<id>:<me>` with the #secret in this browser, relay `claim_link` (any
//    signed-in person, 0 NEAR: the hub registers a new claimer on the token in the same step).
//  - cancel: the requester relays `reclaim_link` (anyone may after the date; our daily job does).
//  - the claim page's link: hub get_link + get_pot through the browser's chain reads.
// The request itself goes through live/actions.ts requestSpend with `link` (receiver = the hub's escrow).
export { claimLinkVM, requestStatusOfHub } from "../paylink/view"
import type { LinkView } from "@pot/sdk"
import { daoOf, sdkConfig } from "../config"
import { ActionError } from "../errors"
import { claimErrorOf, type ClaimErrorKind } from "../paylink/claim"
import { signClaimLink } from "../paylink/keys"
import { signingChain } from "./chain"
import { followRelay, innerError, type RelayOk } from "./relay"
import { ensureLiveSession } from "./session"
import { invalidatePot, settlePot } from "./settle"
import { qk } from "./queries"
import { send } from "./signing"

async function me(): Promise<string> {
  const s = await ensureLiveSession()
  if (!s) throw new ActionError("session", "not_signed_in")
  return s.accountId
}

/** The link's current state, read from the chain (the claim page polls it while waiting). */
export async function fetchLinkView(slug: string, id: number): Promise<LinkView | null> {
  const c = signingChain()
  if (!c.hub.getLink) return null
  return (await c.hub.getLink(daoOf(slug) as never, id)).value
}

export type LiveClaimResult = { ok: true; txHash: string } | { ok: false; kind: ClaimErrorKind; txHash?: string }

/** claim_link to my own account; the outcome follows the relay to its final answer (the transfer is a callback). */
export async function claimLink(slug: string, id: number, secret: string): Promise<LiveClaimResult> {
  const account = await me()
  const dao = daoOf(slug)
  const hub = sdkConfig().hubId
  const signature = await signClaimLink(secret, hub, dao, id, account)
  let r: RelayOk
  try {
    r = await send({ type: "claim_link", pot: dao as never, requestId: id, receiverId: account as never, signature })
  } catch (e) {
    if (e instanceof ActionError && (e.cls === "relayer_down" || e.cls === "rate_limited" || e.cls === "retryable")) return { ok: false, kind: "network" }
    throw e
  }
  if (!r.final) r = await followRelay(r, 20_000)
  const code = innerError(r)
  if (code) return { ok: false, kind: claimErrorOf(code), txHash: r.txHash }
  const res = r.result
  if (res?.type === "link" && !res.ok) return { ok: false, kind: res.reason === "transfer_failed" ? "failed" : "busy", txHash: r.txHash }
  return { ok: true, txHash: r.txHash }
}

export type LiveReclaimResult = "returned" | "done" | "not_allowed" | "not_final" | "failed"

/** reclaim_link: the requester takes the link back (the money goes back into the Pot). */
export async function reclaimLink(slug: string, id: number): Promise<LiveReclaimResult> {
  await me()
  const dao = daoOf(slug)
  let r = await send({ type: "reclaim_link", pot: dao as never, requestId: id })
  if (!r.final) r = await followRelay(r, 15_000)
  const code = innerError(r)
  if (code === "ERR_LINK_DONE") return "done"
  if (code === "ERR_LINK_NOT_EXPIRED") return "not_allowed"
  if (code === "ERR_LINK_NOT_FINAL" || code === "ERR_LINK_BUSY") return "not_final"
  if (code) throw new ActionError("failed", code, { txHash: r.txHash })
  if (r.result?.type === "link" && !r.result.ok) return "failed"
  invalidatePot(dao, [qk.balance(dao)])
  void settlePot(dao, r.executedAtBlock).catch(() => {})
  return "returned"
}
