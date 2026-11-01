// Pay by link in the mock world (hub 1.1.0 twin, notes/contracts-wave4.md D4-4…D4-6). Pure functions over the
// JSON World; the store (store.ts) adds latency, the secret check and persistence.
//  - request_spend with a link: the receiver is the escrow (LINK_RECEIVER); the request follows the normal rules
//    (instant / one OK / the group). When it's paid, the money leaves the Pot and the link is `funded`.
//  - claim: a funded link before its date, with the link's own secret → the claimer's Pot dollars (`claimed`).
//  - return: the requester any time, anyone after the date (our daily job on testnet; here `sweepExpiredLinks`) →
//    the money goes back into the Pot (`returned`). A declined or expired request leaves its link `void`.
import { t } from "@/i18n/t"
import { DAY, HOUR, MIN, SURF_LINKS } from "./fixtures"
import type { LinkRec, LinkVM, PersonVM, PotRec, RequestRec, RequestStatusVM, World } from "./types"
import type { ClaimLinkVM } from "../paylink/claim"
import { LINK_RECEIVER, linkStatusOf } from "../paylink/link"

export { LINK_RECEIVER }

/** Who ran the daily job that sends expired links back (the mock's stand-in for the cron). */
export const SWEEPER = "@daily"

const clone = (w: World, slug: string): [World, PotRec] | null => {
  const pot = w.pots[slug]
  if (!pot) return null
  const copy: PotRec = structuredClone(pot)
  return [{ ...w, pots: { ...w.pots, [slug]: copy } }, copy]
}

/**
 * The link as the hub would have it: the money reaches the link when its request is paid (instant, an OK, or the
 * group's last approval), so a paid request's `awaiting_funds` link reads `funded` (funded at the decision). Keeping
 * this derived means the world's approval paths don't need to know about links.
 */
export function effectiveLink(r: RequestRec): LinkRec | undefined {
  const l = r.link
  if (!l) return undefined
  if (l.status === "awaiting_funds" && r.status === "paid") return { ...l, status: "funded", fundedAt: l.fundedAt ?? r.decidedAt ?? r.createdAt }
  return l
}

/** Write the derived funding onto a (cloned) record before acting on it. */
function settleLink(r: RequestRec): LinkRec | undefined {
  const l = effectiveLink(r)
  if (l && r.link && l !== r.link) r.link = l
  return r.link
}

/** The request's own status in the view (the link's status depends on it). */
export type ReqView = RequestStatusVM

/** The link as the UI shows it. `person` builds the claimer's PersonVM (null for someone outside Pot). */
export function linkVM(r: RequestRec, request: ReqView, now: number, person: (id: string) => PersonVM | null): LinkVM | undefined {
  const l = effectiveLink(r)
  if (!l) return undefined
  return {
    status: linkStatusOf(l.status, request, l.expiresAt, now),
    label: l.label ?? null,
    expiresAt: l.expiresAt,
    claimer: l.claimer ? person(l.claimer) : null,
    doneAt: l.doneAt ?? null,
    returnedOnExpiry: l.status === "returned" && l.returnedBy !== undefined && l.returnedBy !== r.requester,
  }
}

/** The receiver of a link request as a person: the label, else "someone with the link". */
export function linkReceiverVM(r: RequestRec): PersonVM {
  const name = r.link?.label || t("paylink.someone")
  return { id: LINK_RECEIVER, name, initials: "", joinIndex: null, avatar: null }
}

/** Links that block closing the Pot (the hub's open_links): not claimed, returned or void yet. */
export function openLinks(pot: PotRec): number {
  return pot.requests.filter((r) => {
    const l = effectiveLink(r)
    return !!l && (l.status === "funded" || l.status === "claiming" || l.status === "returning" || (l.status === "awaiting_funds" && r.status === "proposed"))
  }).length
}

/** What the claimer got from links (their Pot dollars in the mock). */
export function linkDollarsOf(w: World, who: string): number {
  let total = 0
  for (const pot of Object.values(w.pots)) for (const r of pot.requests) if (r.link?.status === "claimed" && r.link.claimer === who) total += r.amount
  return total
}

export type ClaimResult = "claimed" | "already_claimed" | "expired" | "not_funded" | "wrong_secret" | "returned" | "not_found"

/** claim_link: `pk` is the public key of the secret the claimer holds (the store derives it). */
export function claimLink(w: World, slug: string, id: number, who: string, pk: string, now: number): { world: World; result: ClaimResult } {
  const c = clone(w, slug)
  if (!c) return { world: w, result: "not_found" }
  const [world, pot] = c
  const r = pot.requests.find((x) => x.id === id)
  const l = r ? settleLink(r) : undefined
  if (!r || !l) return { world: w, result: "not_found" }
  if (l.status === "claimed") return { world: w, result: "already_claimed" }
  if (l.status === "returned" || l.status === "void") return { world: w, result: "returned" }
  if (l.status !== "funded") return { world: w, result: "not_funded" }
  if (now >= l.expiresAt) return { world: w, result: "expired" }
  if (pk !== l.pk) return { world: w, result: "wrong_secret" }
  l.status = "claimed"
  l.claimer = who
  l.doneAt = now
  return { world, result: "claimed" }
}

export type ReclaimResult = "returned" | "not_allowed" | "done" | "not_found" | "not_final"

/** reclaim_link: the requester any time, anyone after the date. The money goes back into the Pot. */
export function reclaimLink(w: World, slug: string, id: number, who: string, now: number): { world: World; result: ReclaimResult } {
  const c = clone(w, slug)
  if (!c) return { world: w, result: "not_found" }
  const [world, pot] = c
  const r = pot.requests.find((x) => x.id === id)
  const l = r ? settleLink(r) : undefined
  if (!r || !l) return { world: w, result: "not_found" }
  if (l.status === "claimed" || l.status === "returned" || l.status === "void") return { world: w, result: "done" }
  if (l.status !== "funded") return { world: w, result: "not_final" }
  if (who !== r.requester && now < l.expiresAt) return { world: w, result: "not_allowed" }
  l.status = "returned"
  l.returnedBy = who
  l.doneAt = now
  pot.balance += r.amount
  return { world, result: "returned" }
}

/** The daily job: every funded link past its date goes back to its Pot. Returns the same world when nothing moved. */
export function sweepExpiredLinks(w: World, now: number): World {
  let next = w
  for (const pot of Object.values(w.pots))
    for (const r of pot.requests)
      if (effectiveLink(r)?.status === "funded" && now >= r.link!.expiresAt) next = reclaimLink(next, pot.slug, r.id, SWEEPER, now).world
  return next
}

/** What the claim page shows (null when there's no such link). `nameOf` = display names of people. */
export function claimView(w: World, slug: string, id: number, now: number, nameOf: (id: string) => string, request: (r: RequestRec) => ReqView): ClaimLinkVM | null {
  const pot = w.pots[slug]
  const r = pot?.requests.find((x) => x.id === id)
  const l = r ? effectiveLink(r) : undefined
  if (!pot || !r || !l) return null
  return {
    slug,
    requestId: id,
    potName: pot.name,
    potEmoji: pot.emoji,
    potCover: pot.cover,
    amount: (BigInt(r.amount) * 10_000n).toString(),
    category: r.category,
    requesterName: nameOf(r.requester),
    status: linkStatusOf(l.status, request(r), l.expiresAt, now),
    expiresAt: l.expiresAt,
    claimPk: l.pk,
    receiver: l.claimer ?? null,
    doneAt: l.doneAt ?? null,
    returnedOnExpiry: l.status === "returned" && l.returnedBy !== undefined && l.returnedBy !== r.requester,
  }
}

// ---------------------------------------------------------------------------------------------------------
// showcase seed: "Surf Camp" (Maya + Sam), added with the hub 1.1.0 showcase Pots (store.ts freshWorld: people get
// it, automated browsers opt in with localStorage['pot.mock.seed'] = 'showcase'; the classic seed is unchanged).
//  #111 Maya $60 "Beach dinner" for "Beach bar" → claimed by Alex (a guest) yesterday
//  #112 Sam $45 "Airport taxi" for "Taxi driver" → its date passed, the daily job sent it back to the Pot
//  #113 Maya $30 "Surf lessons" for "Surf school" → open, 13 days left (SURF_LINKS.open.secret claims it)

const link = (pk: string, secret: string, extra: Partial<LinkRec> & Pick<LinkRec, "status" | "expiresAt">): LinkRec => ({ pk, demoSecret: secret, ...extra })

export function seedSurfCamp(now: number): PotRec {
  const req = (id: number, requester: string, amount: number, category: RequestRec["category"], note: string, at: number, l: LinkRec): RequestRec => ({
    id,
    requester,
    receiver: LINK_RECEIVER,
    amount,
    category,
    note,
    path: "instant",
    reason: "ok",
    status: "paid",
    votes: {},
    voteAt: {},
    createdAt: at,
    decidedAt: at,
    tier: "instant",
    link: l,
  })
  const r111 = now - 2 * DAY
  const r112 = now - 16 * DAY + 3 * HOUR
  const r113 = now - 1 * DAY
  return {
    slug: "surf-camp",
    name: "Surf Camp",
    emoji: "🏄",
    cover: 1,
    creator: "maya",
    status: "open",
    createdAt: now - 17 * DAY,
    goalEach: 30_000,
    rules: { instantCap: 10_000, memberBudget: 20_000, expiryDays: 7 },
    extras: { trust: true, oneOkCap: 30_000, links: true, goal: null },
    policyVersion: 1,
    // $600 in − $60 claimed − $30 open (the $45 came back)
    balance: 51_000,
    members: [
      { id: "maya", joinIndex: 0, contributed: 30_000, spentInstant: 9_000, joinedAt: now - 17 * DAY },
      { id: "sam", joinIndex: 1, contributed: 30_000, spentInstant: 4_500, joinedAt: now - 17 * DAY + 2 * HOUR },
    ],
    requests: [
      req(112, "sam", 4_500, "transport", "Airport taxi", r112, link(SURF_LINKS.returned.pk, SURF_LINKS.returned.secret, { status: "returned", label: "Taxi driver", expiresAt: r112 + 14 * DAY, fundedAt: r112, doneAt: r112 + 14 * DAY + 4 * HOUR, returnedBy: SWEEPER })),
      req(111, "maya", 6_000, "food", "Beach dinner", r111, link(SURF_LINKS.claimed.pk, SURF_LINKS.claimed.secret, { status: "claimed", label: "Beach bar", expiresAt: r111 + 14 * DAY, fundedAt: r111, doneAt: r111 + 5 * HOUR, claimer: "alex" })),
      req(113, "maya", 3_000, "tickets", "Surf lessons", r113, link(SURF_LINKS.open.pk, SURF_LINKS.open.secret, { status: "funded", label: "Surf school", expiresAt: r113 + 14 * DAY, fundedAt: r113 })),
    ],
    events: [
      { id: "u1", kind: "created", actor: "maya", at: now - 17 * DAY },
      { id: "u2", kind: "contribution", actor: "maya", amount: 30_000, at: now - 17 * DAY + 5 * MIN },
      { id: "u3", kind: "joined", actor: "sam", at: now - 17 * DAY + 2 * HOUR },
      { id: "u4", kind: "contribution", actor: "sam", amount: 30_000, at: now - 17 * DAY + 3 * HOUR },
    ],
    // an old invite (expired): Surf Camp is about links, not joining
    invite: { pk: SURF_LINKS.invite.pk, secret: SURF_LINKS.invite.secret, createdBy: "maya", expiresAt: now - 10 * DAY, maxUses: 10, uses: 1 },
    lastContributor: "sam",
  }
}

/** Add Surf Camp (ids above every other seeded one). */
export function withLinkShowcase(w: World, now: number): World {
  return { ...w, pots: { ...w.pots, "surf-camp": seedSurfCamp(now) }, nextRequestId: Math.max(w.nextRequestId, 120) }
}
