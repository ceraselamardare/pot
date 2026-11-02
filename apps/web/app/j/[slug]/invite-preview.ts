// The invite preview the /j/[slug] server render needs (frontend-architecture §2.5).
//  - mock data source: the fixture world;
//  - testnet (F-13): @pot/sdk views on the server (hub.get_pot, get_members, get_invite, usdc.ft_balance_of(dao))
//    plus display names from our DB. The `?i=` invite key is checked against the hub's invite record.
// Privacy (rev4 M-7; audit 2026-11-02, notes/backend.md): what's shared with people who have the invite link is the
// Pot's name, cover, balance/goal and member count (all public on the ledger) plus the inviter's chosen name, and
// that name only when `?i=` resolves to an active invite. Never another member's name or picture, notes, comments,
// receipts or emails: the other seats are plain circles in their join colour.
import "server-only"
import { invitePkFromParam, type MemberView } from "@pot/sdk"
import { IS_LIVE } from "@/lib/client/config"
import { seedWorld, potView, initialsOf } from "@/lib/client/mock/world"
import { coverOf, DEFAULT_GOAL_EACH, nameFromAccount } from "@/lib/client/live/vm"
import { t } from "@/i18n/t"
import { displayNames, serverChain, serverSdkConfig } from "@/app/_lib/chain"

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/

export interface InvitePreview {
  slug: string
  name: string
  emoji: string
  cover: number
  status: "open" | "closing" | "closed"
  /** MicroStr across the RSC boundary (§2.3) */
  balance: string
  totalIn: string
  goal: string | null
  goalEach: string | null
  instantCap: string
  memberCount: number
  /** only with an active ?i=: one seat per member in join order; the inviter's carries their initials, every other
   *  seat is a plain circle in its join colour (no one else's name or picture) */
  seats: InviteSeat[] | null
  /** the inviter's chosen name, only with an active ?i= */
  inviter: string | null
  /** the inviter is one of the members (the line reads "Maya and 2 others are in") */
  inviterIsMember: boolean
  inviteState: "active" | "expired" | "used" | "replaced" | "none"
  expiresAt: number | null
}

export interface InviteSeat {
  key: string
  /** the inviter's initials; "" for everyone else */
  initials: string
  joinIndex: number
}

function parsePk(param: string | null): string | null {
  if (!param) return null
  try {
    return invitePkFromParam(param) // "?i=<b58>" (D-08); "ed25519:<b58>" is accepted too
  } catch {
    return null
  }
}

export async function getInvitePreview(slug: string, invitePk: string | null, now: number = Date.now()): Promise<InvitePreview | null> {
  if (!SLUG_RE.test(slug)) return null // validate before any I/O (rev4)
  return IS_LIVE ? livePreview(slug, invitePk, now) : mockPreview(slug, invitePk, now)
}

function mockPreview(slug: string, invitePk: string | null, now: number): InvitePreview | null {
  const world = seedWorld(now)
  const pot = potView(world, slug, null, now)
  if (!pot || !pot.invite) return null
  let inviteState: InvitePreview["inviteState"] = "none"
  if (invitePk) {
    const pk = parsePk(invitePk)
    if (pk !== pot.invite.pk) inviteState = "replaced"
    else if (now > pot.invite.expiresAt) inviteState = "expired"
    else if (pot.invite.usesLeft <= 0) inviteState = "used"
    else inviteState = "active"
  }
  const active = inviteState === "active"
  return {
    slug: pot.slug,
    name: pot.name,
    emoji: pot.emoji,
    cover: pot.cover,
    status: pot.status,
    balance: pot.balance.toString(),
    totalIn: pot.totalIn.toString(),
    goal: pot.goal?.toString() ?? null,
    goalEach: pot.goalEach?.toString() ?? null,
    instantCap: pot.rules.instantCap.toString(),
    memberCount: pot.members.length,
    seats: active
      ? pot.members
          .map((m) => ({ key: m.person.id, initials: m.person.id === pot.invite!.createdBy.id ? m.person.initials : "", joinIndex: m.person.joinIndex ?? 0 }))
          .sort((a, b) => a.joinIndex - b.joinIndex)
      : null,
    inviter: active ? pot.invite.createdBy.name : null,
    inviterIsMember: active && pot.members.some((m) => m.person.id === pot.invite!.createdBy.id),
    inviteState,
    expiresAt: active ? pot.invite.expiresAt : null,
  }
}

async function livePreview(slug: string, invitePk: string | null, now: number): Promise<InvitePreview | null> {
  const c = serverChain()
  const dao = `${slug}.${serverSdkConfig().hubId}`
  let pot
  try {
    pot = (await c.hub.getPot(dao as never)).value
  } catch {
    return null
  }
  if (!pot) return null
  const [balance, members, invite] = await Promise.all([
    c.usdc.balanceOf(dao as never).then((v) => v.value).catch(() => pot.balanceEstimate),
    c.hub.getMembers(dao as never).then((v) => v.value.filter((m: MemberView) => m.status === "active")).catch(() => [] as MemberView[]),
    (async () => {
      const pk = parsePk(invitePk)
      if (!invitePk) return { state: "none" as const, view: null }
      if (!pk) return { state: "replaced" as const, view: null }
      const v = (await c.hub.getInvite(dao as never, pk as never).catch(() => null))?.value ?? null
      if (!v || v.status === "revoked") return { state: "replaced" as const, view: v }
      if (v.status === "expired" || now > v.expiresAtMs) return { state: "expired" as const, view: v }
      if (v.status === "used_up" || v.uses >= v.maxUses) return { state: "used" as const, view: v }
      return { state: "active" as const, view: v }
    })(),
  ])
  const active = invite.state === "active"
  // the inviter's chosen name only (never the other members')
  const inviterAccount = active && invite.view ? (invite.view.createdBy as string) : null
  const inviterName = inviterAccount ? ((await displayNames([inviterAccount])).get(inviterAccount) ?? nameFromAccount(inviterAccount) ?? t("person.fallback")) : null
  // the "$X each" goal is off-chain (the creator's device); a visitor sees Create's suggested $150, like members do
  // (live/queries goalEachOf). It no longer depends on a preset: every new Pot is "custom" with its own rules.
  const goalEach = DEFAULT_GOAL_EACH
  return {
    slug,
    name: pot.name,
    emoji: pot.emoji ?? "",
    cover: coverOf(slug),
    status: pot.status,
    balance: balance.toString(),
    totalIn: pot.totalIn.toString(),
    goal: goalEach === null ? null : (goalEach * BigInt(Math.max(3, pot.memberCount))).toString(),
    goalEach: goalEach?.toString() ?? null,
    instantCap: pot.rules.instantCap.toString(),
    memberCount: pot.memberCount,
    seats: active
      ? members
          .sort((a, b) => a.joinIndex - b.joinIndex)
          .map((m) => ({ key: m.account as string, initials: m.account === inviterAccount && inviterName ? initialsOf(inviterName) || "•" : "", joinIndex: m.joinIndex }))
      : null,
    inviter: inviterName,
    inviterIsMember: !!inviterAccount && members.some((m) => m.account === inviterAccount),
    inviteState: invite.state,
    expiresAt: active && invite.view ? invite.view.expiresAtMs : null,
  }
}

/** What the link-preview image may show (F-24; review-security M-7 rev4; audit 2026-11-02): only what the public
 *  ledger says (name, emoji, count, join order). No balance, and no names or initials: anyone who knows the slug can
 *  fetch the image, with or without an invite. */
export interface OgPreview {
  name: string
  emoji: string
  cover: number
  status: "open" | "closing" | "closed"
  memberCount: number
  /** join order (plain seats in their colour) */
  members: { joinIndex: number }[]
}

export async function getOgPreview(slug: string, now: number = Date.now()): Promise<OgPreview | null> {
  if (!SLUG_RE.test(slug)) return null
  if (!IS_LIVE) {
    const pot = potView(seedWorld(now), slug, null, now)
    if (!pot) return null
    return {
      name: pot.name,
      emoji: pot.emoji,
      cover: pot.cover,
      status: pot.status,
      memberCount: pot.members.length,
      members: pot.members.map((m) => ({ joinIndex: m.person.joinIndex ?? 0 })).sort((a, b) => a.joinIndex - b.joinIndex),
    }
  }
  const c = serverChain()
  const dao = `${slug}.${serverSdkConfig().hubId}`
  const pot = (await c.hub.getPot(dao as never).catch(() => null))?.value ?? null
  if (!pot) return null
  const members = await c.hub
    .getMembers(dao as never)
    .then((v) => v.value.filter((m: MemberView) => m.status === "active").sort((a, b) => a.joinIndex - b.joinIndex))
    .catch(() => [] as MemberView[])
  return {
    name: pot.name,
    emoji: pot.emoji ?? "",
    cover: coverOf(slug),
    status: pot.status,
    memberCount: pot.memberCount,
    members: members.map((m) => ({ joinIndex: m.joinIndex })),
  }
}
