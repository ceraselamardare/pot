// Live pay by link (hub 1.1.0) for the Pot's view models: the bundle reads get_link for the link requests it shows
// (a link's date and claimer never change once set, so a finished link is read once per tab), and liveRequestVM gets
// the link's status, who it's for (the feed's members-only `linkLabels`) and who claimed it (a member by their name,
// someone outside the Pot by their Pot display name from the feed's `linkClaimers`, else "someone").
import type { Api, ChainViews, LinkView, RequestView } from "@pot/sdk"
import { t } from "@/i18n/t"
import type { LinkVM, PersonVM, RequestStatusVM } from "../mock/types"
import { initialsOf } from "../mock/world"
import { linkStatusOf } from "../paylink/link"

/** The feed route's pay-by-link extras (members only; server/features/paylink.ts). */
export type FeedWithLinks = Api.FeedRes & { linkLabels?: Record<string, string>; linkClaimers?: Record<string, string> }

const FINAL = new Set(["claimed", "returned", "void"])
const cache = new Map<string, LinkView>()

/** get_link for the bundle's link requests (finished ones from this tab's cache). Never throws. */
export async function readLinks(dao: string, requests: readonly RequestView[], c: ChainViews): Promise<Record<number, LinkView>> {
  const out: Record<number, LinkView> = {}
  const getLink = c.hub.getLink
  if (!getLink) return out
  await Promise.all(
    requests
      .filter((r) => r.linkStatus)
      .map(async (r) => {
        const key = `${dao}:${r.id}`
        const hit = cache.get(key)
        if (hit && hit.status === r.linkStatus) return void (out[r.id] = hit)
        const v = await getLink(dao as never, r.id)
          .then((x) => x.value)
          .catch(() => null)
        if (!v) return
        if (FINAL.has(v.status)) cache.set(key, v)
        out[r.id] = v
      }),
  )
  return out
}

/** The link and its receiver for a link request (empty for any other request). */
export function liveLinkParts(
  r: RequestView,
  status: RequestStatusVM,
  link: LinkView | undefined,
  feed: FeedWithLinks | null,
  now: number,
  person: (account: string) => PersonVM,
  isMember: (account: string) => boolean,
): { link?: LinkVM; receiver?: PersonVM } {
  if (!r.linkStatus) return {}
  const label = feed?.linkLabels?.[r.requestRef] ?? null
  const hubStatus = link?.status ?? r.linkStatus
  const claimerId = link?.receiver ?? null
  const claimerName = feed?.linkClaimers?.[String(r.id)]
  const claimer: PersonVM | null = claimerId
    ? isMember(claimerId)
      ? person(claimerId)
      : claimerName
        ? { id: claimerId, name: claimerName, initials: initialsOf(claimerName) || "•", joinIndex: null, avatar: null }
        : null
    : null
  const expiresAt = link?.expiresAtMs ?? r.expiresAtMs
  return {
    link: {
      status: linkStatusOf(hubStatus, status, expiresAt, now),
      label,
      expiresAt,
      claimer,
      doneAt: link?.doneAtMs ?? null,
      returnedOnExpiry: hubStatus === "returned" && !!link?.doneAtMs && link.doneAtMs >= link.expiresAtMs,
    },
    // the receiver on chain is the hub's escrow: show who it's for instead (the id stays the hub, for the vote's kind check)
    receiver: { ...person(r.receiver), name: label ?? t("paylink.someone"), initials: "" },
  }
}
