// get_link (+ get_pot, a display name) → the claim page's view. Pure: the server render (claim-preview.ts) and the
// browser's polling both use it.
import type { LinkView, PotView } from "@pot/sdk"
import type { RequestStatusVM } from "../mock/types"
import type { ClaimLinkVM } from "./claim"
import { linkStatusOf } from "./link"

/** The hub's request status → the request status the link's status depends on. */
export function requestStatusOfHub(s: string): RequestStatusVM {
  switch (s) {
    case "rejected":
    case "removed":
    case "withdrawn":
      return "declined"
    case "expired":
      return "expired"
    case "approved":
      return "approved"
    case "payout_failed":
      return "failed"
    default:
      return "needs"
  }
}

/** get_link + get_pot → the claim page's view (null when there's no link with that id). */
export function claimLinkVM(slug: string, link: LinkView, pot: Pick<PotView, "name" | "emoji"> & { cover: number }, requesterName: string | null, now: number): ClaimLinkVM {
  return {
    slug,
    requestId: link.requestId,
    potName: pot.name,
    potEmoji: pot.emoji ?? "",
    potCover: pot.cover,
    amount: link.amount.toString(),
    category: link.category,
    requesterName,
    status: linkStatusOf(link.status, requestStatusOfHub(link.requestStatus), link.expiresAtMs, now),
    expiresAt: link.expiresAtMs,
    claimPk: link.claimPk,
    receiver: link.receiver,
    doneAt: link.doneAtMs,
    // the hub doesn't say who returned it: after its date it can only have been anyone (or our daily job)
    returnedOnExpiry: link.status === "returned" && link.doneAtMs !== null && link.doneAtMs >= link.expiresAtMs,
  }
}

