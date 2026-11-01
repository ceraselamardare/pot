// The claim page's server read (/c/[slug]/[id]; pay by link, hub 1.1.0): what the link preview and the first paint
// show before the browser checks the #secret (which never reaches the server).
//  - mock data source: the seeded world + the "Surf Camp" showcase links (links made in a browser exist only there:
//    the page's client island finds them);
//  - testnet: @pot/sdk views on the server (hub.get_link, get_pot) + the requester's display name from our DB.
// Privacy (review-security M-7): the requester's display name only while the link is still open (someone can still
// claim it: the person who got it from them); never an account id; the claimer is never named here.
import "server-only"
import { t } from "@/i18n/t"
import { IS_LIVE } from "@/lib/client/config"
import { formatUsd } from "@/lib/client/money"
import { coverOf, nameFromAccount } from "@/lib/client/live/vm"
import { claimLinkVM } from "@/lib/client/paylink/view"
import { claimView, withLinkShowcase } from "@/lib/client/mock/links"
import { nameOf, requestStatusOf, seedWorld } from "@/lib/client/mock/world"
import type { ClaimLinkVM } from "@/lib/client/paylink/claim"
import { displayNames, serverChain, serverSdkConfig } from "@/app/_lib/chain"

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/
const ID_RE = /^(0|[1-9][0-9]{0,9})$/

/** The page's params, validated before any I/O. */
export function parseClaimParams(slug: string, id: string): { slug: string; id: number } | null {
  if (!SLUG_RE.test(slug) || !ID_RE.test(id)) return null
  const n = Number(id)
  return n <= 4_294_967_295 ? { slug, id: n } : null
}

const open = (p: ClaimLinkVM) => p.status === "waiting" || p.status === "ready" || p.status === "busy"

/** Names only while the link is open (above). */
const redact = (p: ClaimLinkVM): ClaimLinkVM => (open(p) ? p : { ...p, requesterName: null })

export async function getClaimPreview(slug: string, id: number, now: number = Date.now()): Promise<ClaimLinkVM | null> {
  return IS_LIVE ? livePreview(slug, id, now) : mockPreview(slug, id, now)
}

function mockPreview(slug: string, id: number, now: number): ClaimLinkVM | null {
  const w = withLinkShowcase(seedWorld(now), now)
  const p = claimView(w, slug, id, now, nameOf, (r) => requestStatusOf(w.pots[slug]!, r, now))
  return p ? redact(p) : null
}

async function livePreview(slug: string, id: number, now: number): Promise<ClaimLinkVM | null> {
  const c = serverChain()
  const dao = `${slug}.${serverSdkConfig().hubId}`
  if (!c.hub.getLink) return null
  const [link, pot] = await Promise.all([
    c.hub
      .getLink(dao as never, id)
      .then((v) => v.value)
      .catch(() => null),
    c.hub
      .getPot(dao as never)
      .then((v) => v.value)
      .catch(() => null),
  ])
  if (!link || !pot) return null
  const names = await displayNames([link.requester])
  const name = names.get(link.requester) ?? nameFromAccount(link.requester)
  return redact(claimLinkVM(slug, link, { name: pot.name, emoji: pot.emoji, cover: coverOf(slug) }, name, now))
}

/** "Maya sent you $84 from Lisbon Trip" (the page title, the link preview's title and its image). */
export function claimTitle(p: ClaimLinkVM | null): string {
  if (!p) return t("app.name")
  const amount = formatUsd(BigInt(p.amount), "whole")
  return p.requesterName ? t("claim.title", { name: p.requesterName, amount, potName: p.potName }) : t("claim.title.anon", { amount, potName: p.potName })
}
