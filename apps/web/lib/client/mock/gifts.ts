// Gifts in the mock world (hub 1.2.0 + our server's gift tables; notes/gifts-plan.md). Pure functions over the JSON
// World; the store (gift-store.ts) adds latency, the signed-in person and persistence.
//  - A gift adds to the Pot's money (balance), never to a member's "put in" (no refund, vote or limit effects); at
//    close it's shared with everyone else's money (pro-rata; equally when nobody added money: closeMathWithGifts).
//  - The hub refuses a gift while the Pot isn't open, when a member turned gifts off, or while an all-or-nothing goal
//    is still collecting; our server refuses a link that's revoked, past its date or (one-time) used, a fixed-amount
//    link's other amounts and the public page while it's off.
//  - Privacy: members see every gift with its note; the public page lists only givers who chose to be shown.
import { publicPageRefusal } from "@/lib/reserved-names"
import { closeSplit } from "@pot/sdk"
import {
  checkGiftAmount,
  GIFT_LINE_MAX,
  GIFT_LINK_TTL_MS,
  GIFT_NAME_MAX,
  GIFT_NOTE_MAX,
  giftLinkStatus,
  optionalGiftText,
  toneOf,
  type GiftLinkStatus,
  type GiftTaking,
  type PayInTone,
} from "@/lib/gifts"
import { cents, type Micro } from "../money"
import { DAY, HOUR, MIN } from "./fixtures"
import { goalBlocksSpends } from "./wave4"
import type { FeedItemVM, GiftLinkRec, GiftRec, GiftsVM, GiftVM, PersonVM, PotRec, World } from "./types"

export type GiftError =
  | "not_found"
  | "not_member"
  | "revoked"
  | "expired"
  | "used"
  | "off"
  | "goal"
  | "closed"
  | "page_off"
  | "fixed_amount"
  | "too_low"
  | "too_high"
  | "invalid"
  | "not_giver"
  /** CLI-4: the Pot's name (or the page's line / the link's note) reads like an official or brand page */
  | "reserved"

export class GiftWorldError extends Error {
  constructor(readonly code: GiftError) {
    super(code)
  }
}

const fail = (code: GiftError): never => {
  throw new GiftWorldError(code)
}

const isMember = (pot: PotRec, who: string) => pot.members.some((m) => m.id === who)

function clone(w: World, slug: string): [World, PotRec] {
  const pot = w.pots[slug]
  if (!pot) fail("not_found")
  const copy: PotRec = structuredClone(pot!)
  return [{ ...w, pots: { ...w.pots, [slug]: copy } }, copy]
}

/** Is the Pot taking gifts right now (what the hub checks)? */
export function giftTakingOf(pot: PotRec): GiftTaking {
  if (pot.status !== "open") return "closed"
  if (pot.giftsOff) return "off"
  if (goalBlocksSpends(pot)) return "goal"
  return "yes"
}

export const giftsOf = (w: World, slug: string): GiftRec[] => (w.gifts ?? []).filter((g) => g.pot === slug)
/** cents */
export const giftsTotalOf = (w: World, slug: string): number => giftsOf(w, slug).reduce((s, g) => s + g.amount, 0)

// ------------------------------------------------------------------------------------------------- gift links

export interface GiftLinkInput {
  /** cents; null = the giver chooses */
  amount: number | null
  note?: string | null
  /** default true */
  reusable?: boolean
  /** "What's it for?" (default: a payment) */
  tone?: PayInTone
}

export function createGiftLink(w: World, slug: string, who: string, input: GiftLinkInput, now: number, id: string): { world: World; link: GiftLinkRec } {
  const [world, pot] = clone(w, slug)
  if (!isMember(pot, who)) fail("not_member")
  if (input.amount !== null) {
    const c = checkGiftAmount(cents(input.amount))
    if (!c.ok) fail(c.why)
  }
  const note = optionalGiftText(input.note, GIFT_NOTE_MAX)
  if (!note.ok) fail("invalid")
  // CLI-4 (security audit 2026-11-04): as on our server (server/features/gifts/members.ts)
  if (publicPageRefusal({ name: pot.name, slug, line: note.ok ? note.value : null })) fail("reserved")
  const link: GiftLinkRec = {
    id,
    pot: slug,
    createdBy: who,
    amount: input.amount,
    note: note.ok ? note.value : null,
    tone: input.tone ?? "payment",
    reusable: input.reusable ?? true,
    uses: 0,
    expiresAt: now + GIFT_LINK_TTL_MS,
    revokedAt: null,
    createdAt: now,
  }
  return { world: { ...world, giftLinks: [...(world.giftLinks ?? []), link] }, link }
}

export function revokeGiftLink(w: World, slug: string, who: string, id: string, now: number): World {
  const pot = w.pots[slug]
  if (!pot) fail("not_found")
  if (!isMember(pot!, who)) fail("not_member")
  const links = w.giftLinks ?? []
  const l = links.find((x) => x.id === id && x.pot === slug)
  if (!l) fail("not_found")
  if (l!.revokedAt !== null) return w
  return { ...w, giftLinks: links.map((x) => (x === l ? { ...x, revokedAt: now } : x)) }
}

export const linkStatusAt = (l: GiftLinkRec, now: number): GiftLinkStatus => giftLinkStatus(l, now)

/** A Pot's working gift links, newest first (members only). */
export function activeGiftLinks(w: World, slug: string, me: string | null, now: number): GiftLinkRec[] | null {
  const pot = w.pots[slug]
  if (!pot || !me || !isMember(pot, me)) return null
  return (w.giftLinks ?? []).filter((l) => l.pot === slug && linkStatusAt(l, now) === "active").sort((a, b) => b.createdAt - a.createdAt)
}

// ------------------------------------------------------------------------------------------------- switches

/** ••• → Gifts → on/off (the hub's set_gifts; any member). */
export function setGiftsOn(w: World, slug: string, who: string, on: boolean): World {
  const [world, pot] = clone(w, slug)
  if (!isMember(pot, who)) fail("not_member")
  pot.giftsOff = !on
  return world
}

/** Settings → Public page: on/off, its one-liner and its tone (our server's gift_page; any member). Undefined = keep. */
export function setGiftPage(w: World, slug: string, who: string, input: { on: boolean; line?: string | null; tone?: PayInTone }): World {
  const [world, pot] = clone(w, slug)
  if (!isMember(pot, who)) fail("not_member")
  let line = pot.giftPage?.line ?? null
  if (input.line !== undefined) {
    const c = optionalGiftText(input.line, GIFT_LINE_MAX)
    if (!c.ok) fail("invalid")
    line = c.ok ? c.value : null
  }
  // CLI-4 (security audit 2026-11-04): as on our server, no public page for an official-looking name; off always works
  if (input.on && publicPageRefusal({ name: pot.name, slug, line })) fail("reserved")
  // a page that never existed starts as a payment page; one from before the tone keeps reading as a gift page
  const tone = input.tone ?? (pot.giftPage ? toneOf(pot.giftPage.tone) : "payment")
  pot.giftPage = { on: input.on, line, tone }
  return world
}

// ------------------------------------------------------------------------------------------------- giving

export interface GiveInput {
  slug: string
  /** through a gift link, or (null) the public page */
  linkId: string | null
  who: string
  /** cents */
  amount: number
  name?: string | null
  note?: string | null
  /** public page only */
  showPublic?: boolean
  /** "pot_dollars": from the giver's own Pot dollars (the store checks they have enough) */
  source?: "demo" | "pot_dollars"
}

/** Send a gift (start + the hub's ft_on_transfer + the record of the giver's name and note, in one step). */
export function giveGift(w: World, input: GiveInput, now: number, ref: string): { world: World; gift: GiftRec } {
  const [world, pot] = clone(w, input.slug)
  const links = world.giftLinks ?? []
  const link = input.linkId === null ? null : links.find((l) => l.id === input.linkId && l.pot === input.slug)
  if (input.linkId !== null) {
    if (!link) fail("not_found")
    const st = linkStatusAt(link!, now)
    if (st !== "active") fail(st as GiftError)
    if (link!.amount !== null && link!.amount !== input.amount) fail("fixed_amount")
  } else if (!pot.giftPage?.on) fail("page_off")
  const c = checkGiftAmount(cents(input.amount))
  if (!c.ok) fail(c.why)
  const taking = giftTakingOf(pot)
  if (taking !== "yes") fail(taking as GiftError)
  const name = optionalGiftText(input.name, GIFT_NAME_MAX)
  const note = optionalGiftText(input.note, GIFT_NOTE_MAX)
  if (!name.ok || !note.ok) fail("invalid")
  const gift: GiftRec = {
    ref,
    pot: input.slug,
    from: input.who,
    name: name.ok ? name.value : null,
    note: note.ok ? note.value : null,
    showPublic: input.linkId === null && !!input.showPublic,
    amount: input.amount,
    at: now,
    linkId: input.linkId,
    ...(input.source === "pot_dollars" ? { source: "pot_dollars" as const } : {}),
    // a snapshot: what the link (or the page) said when this came in
    tone: toneOf(link ? link.tone : pot.giftPage?.tone),
  }
  pot.balance += input.amount
  return {
    world: {
      ...world,
      gifts: [...(world.gifts ?? []), gift],
      giftLinks: link ? links.map((l) => (l === link ? { ...l, uses: l.uses + 1 } : l)) : links,
    },
    gift,
  }
}

/** The giver changes their name / note / "show my name" afterwards (their own gifts only). */
export function editGift(w: World, ref: string, who: string, patch: { name?: string | null; note?: string | null; showPublic?: boolean }): World {
  const gifts = w.gifts ?? []
  const g = gifts.find((x) => x.ref === ref)
  if (!g || g.from !== who) fail("not_giver")
  const next = { ...g! }
  if (patch.name !== undefined) {
    const c = optionalGiftText(patch.name, GIFT_NAME_MAX)
    if (!c.ok) fail("invalid")
    next.name = c.ok ? c.value : null
  }
  if (patch.note !== undefined) {
    const c = optionalGiftText(patch.note, GIFT_NOTE_MAX)
    if (!c.ok) fail("invalid")
    next.note = c.ok ? c.value : null
  }
  if (patch.showPublic !== undefined) next.showPublic = g!.linkId === null && patch.showPublic
  return { ...w, gifts: gifts.map((x) => (x === g ? next : x)) }
}

// ------------------------------------------------------------------------------------------------- views

/** The giver as members see them: the name they chose, else their Pot name (`nameOf`). */
export function giverOf(g: GiftRec, nameOf: (id: string) => string, initialsOf: (name: string) => string, avatar?: (id: string) => PersonVM["avatar"]): PersonVM {
  const name = g.name ?? nameOf(g.from)
  return { id: g.from, name, initials: initialsOf(name), joinIndex: null, avatar: g.name ? null : (avatar?.(g.from) ?? null) }
}

export function giftVM(g: GiftRec, from: PersonVM, txHash?: string): GiftVM {
  return { ref: g.ref, from, note: g.note ?? null, showPublic: g.showPublic, amount: cents(g.amount), at: g.at, linkId: g.linkId, tone: toneOf(g.tone), ...(txHash ? { txHash } : {}) }
}

/** The Pot's gifts for its members (notes included). */
export function giftsVM(w: World, pot: PotRec, person: (g: GiftRec) => PersonVM, txHash: (g: GiftRec) => string): GiftsVM {
  const list = giftsOf(w, pot.slug)
  return {
    on: !pot.giftsOff,
    page: { on: !!pot.giftPage?.on, line: pot.giftPage?.line ?? null, tone: pot.giftPage ? toneOf(pot.giftPage.tone) : "payment" },
    total: cents(list.reduce((s, g) => s + g.amount, 0)),
    count: list.length,
    items: [...list].sort((a, b) => b.at - a.at).map((g) => giftVM(g, person(g), txHash(g))),
  }
}

export const giftFeedItems = (gifts: GiftsVM): FeedItemVM[] => gifts.items.map((g) => ({ key: `gift:${g.ref}`, kind: "gift" as const, at: g.at, gift: g, txHash: g.txHash }))

/** What anyone may see of a Pot on a gift page (all public on the ledger). */
export interface GiftPotVM {
  slug: string
  name: string
  emoji: string
  cover: number
  members: number
  status: PotRec["status"]
}

export const giftPotOf = (pot: PotRec): GiftPotVM => ({ slug: pot.slug, name: pot.name, emoji: pot.emoji, cover: pot.cover, members: pot.members.length, status: pot.status })

/** /g/<slug>/<id>: the link (its amount, note and tone, written for payers), the Pot, and whether it takes money now. */
export interface GiftLandingVM {
  pot: GiftPotVM
  link: { id: string; amount: Micro | null; note: string | null; status: GiftLinkStatus; expiresAt: number; tone: PayInTone }
  taking: GiftTaking
}

export function giftLandingOf(w: World, slug: string, id: string, now: number): GiftLandingVM | null {
  const pot = w.pots[slug]
  const l = (w.giftLinks ?? []).find((x) => x.id === id && x.pot === slug)
  if (!pot || !l) return null
  // CLI-4: a link made before the reserved-name check (or a Pot renamed since) shows nothing
  if (publicPageRefusal({ name: pot.name, slug, line: l.note ?? null })) return null
  return {
    pot: giftPotOf(pot),
    link: { id: l.id, amount: l.amount === null ? null : cents(l.amount), note: l.note ?? null, status: linkStatusAt(l, now), expiresAt: l.expiresAt, tone: toneOf(l.tone) },
    taking: giftTakingOf(pot),
  }
}

/** A giver on the public page: only the ones who chose to be shown. */
export interface PublicGiftVM {
  key: string
  name: string
  note: string | null
  amount: Micro
  at: number
}

/** /give/<slug>: off (only the Pot's name) until a member turns it on. */
export interface GiftPageVM {
  pot: GiftPotVM
  on: boolean
  line: string | null
  /** the page's words: a payment page or a gift page */
  tone: PayInTone
  taking?: GiftTaking
  total?: Micro
  count?: number
  givers?: PublicGiftVM[]
}

export function giftPageOf(w: World, slug: string): GiftPageVM | null {
  const pot = w.pots[slug]
  if (!pot) return null
  const page = pot.giftPage
  // CLI-4: an official-looking name reads as off
  if (!page?.on || publicPageRefusal({ name: pot.name, slug, line: page.line }))
    return { pot: giftPotOf(pot), on: false, line: null, tone: page ? toneOf(page.tone) : "payment" }
  const list = giftsOf(w, slug)
  return {
    pot: giftPotOf(pot),
    on: true,
    line: page.line,
    tone: toneOf(page.tone),
    taking: giftTakingOf(pot),
    total: cents(list.reduce((s, g) => s + g.amount, 0)),
    count: list.length,
    givers: list
      .filter((g) => g.showPublic && g.name)
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((g) => ({ key: g.ref, name: g.name!, note: g.note ?? null, amount: cents(g.amount), at: g.at })),
  }
}

/** One of my own gifts (You → Your activity). */
export interface MyGiftVM {
  ref: string
  slug: string
  potName: string
  potEmoji: string
  potCover: number
  amount: Micro
  note: string | null
  at: number
  tone: PayInTone
  /** the gift's receipt (testnet) */
  txHash?: string
}

export function myGiftsOf(w: World, who: string): MyGiftVM[] {
  return (w.gifts ?? [])
    .filter((g) => g.from === who && w.pots[g.pot])
    .sort((a, b) => b.at - a.at)
    .map((g) => {
      const p = w.pots[g.pot]!
      return { ref: g.ref, slug: g.pot, potName: p.name, potEmoji: p.emoji, potCover: p.cover, amount: cents(g.amount), note: g.note ?? null, at: g.at, tone: toneOf(g.tone) }
    })
}

// ------------------------------------------------------------------------------------------------- close

/**
 * The close with gifts (hub 1.2.0), through the sdk's `closeSplit` (the parity-tested twin of prorata.rs close_split):
 * pro-rata over the real balance (gifts included) by what each person put in; when nobody added money (a Pot that only
 * got gifts) it's split equally, the remainder to the last member in join order. Cents. Null when there's nothing to share.
 */
export function closeMathWithGifts(
  pot: PotRec,
  last: string | null,
): { payouts: { account: string; amount: number }[]; dust: number; dustTo: string | null } | null {
  const members = [...pot.members].sort((a, b) => a.joinIndex - b.joinIndex)
  const balance = Math.max(0, pot.balance)
  const r = closeSplit(BigInt(balance), members.map((m) => ({ account: m.id, contributed: BigInt(Math.max(0, m.contributed)) })), last)
  if (!r) return null
  const equal = !members.some((m) => m.contributed > 0)
  // the equal split names nobody for a zero remainder (there's no "who added money last" to credit)
  return { payouts: r.payouts.map((p) => ({ account: p.account, amount: Number(p.amount) })), dust: Number(r.dust), dustTo: equal && r.dust === 0n ? null : r.dustTo }
}

// ------------------------------------------------------------------------------------------------- seed

/** Fixed gift link ids of the showcase (any 22 base64url characters; never secrets: a link id only names the link). */
export const BIRTHDAY_LINKS = { open: "bdayOpenGiftLink000001", fixed: "bdayFixedGiftLink00025" } as const

/**
 * The gifts showcase Pot (people looking at the mock build; automated tests opt in with the showcase seed):
 * Leo's birthday fund, Maya + Sam, a public gift page with a one-liner, an open and a $25 gift link, and three gifts:
 * Ana (shown on the page, with a note), Tomás (not shown) and Alex through the link.
 */
export function seedBirthday(now: number): { pot: PotRec; gifts: GiftRec[]; links: GiftLinkRec[] } {
  const created = now - 4 * DAY
  const gifts: GiftRec[] = [
    { ref: "g0000000000000000000ana1", pot: "leos-birthday", from: "ana", name: "Ana", note: "Happy birthday Leo! Coffee's on me ☕", showPublic: true, amount: 1_000, at: now - 2 * DAY, linkId: null },
    { ref: "g0000000000000000000tms1", pot: "leos-birthday", from: "tomas", name: "Tomás", note: "For the cake. Don't tell him!", showPublic: false, amount: 2_500, at: now - 1 * DAY - 3 * HOUR, linkId: BIRTHDAY_LINKS.fixed },
    { ref: "g0000000000000000000ax01", pot: "leos-birthday", from: "alex", name: null, note: null, showPublic: false, amount: 500, at: now - 5 * HOUR, linkId: BIRTHDAY_LINKS.open },
  ]
  const pot: PotRec = {
    slug: "leos-birthday",
    name: "Leo's Birthday",
    emoji: "🎂",
    cover: 5,
    creator: "maya",
    status: "open",
    createdAt: created,
    goalEach: null,
    rules: { instantCap: 10_000, memberBudget: 20_000, expiryDays: 7 },
    extras: { trust: true, oneOkCap: 30_000, links: true, goal: null },
    policyVersion: 1,
    balance: 10_000 + 4_000,
    members: [
      { id: "maya", joinIndex: 0, contributed: 5_000, spentInstant: 0, joinedAt: created },
      { id: "sam", joinIndex: 1, contributed: 5_000, spentInstant: 0, joinedAt: created + 2 * HOUR },
    ],
    requests: [],
    events: [
      { id: "b1", kind: "created", actor: "maya", at: created },
      { id: "b2", kind: "contribution", actor: "maya", amount: 5_000, at: created + 5 * MIN },
      { id: "b3", kind: "joined", actor: "sam", at: created + 2 * HOUR },
      // money-in details showcase: Sam added from his own Pot dollars (Maya's add above is demo dollars)
      { id: "b4", kind: "contribution", actor: "sam", amount: 5_000, at: created + 3 * HOUR, source: "pot_dollars" },
    ],
    invite: { pk: "ed25519:BAypqF3EUDiC7oeXcohUGTY3bvpZdhda4zLcUBA51poY", secret: "BRwzSmF4j6a91OsCGTBHXnWMo7rR6P8WLURbcomgt84", createdBy: "maya", expiresAt: now - DAY, maxUses: 10, uses: 1 },
    lastContributor: "sam",
    giftPage: { on: true, line: "Help us throw Leo the best birthday ☕" },
  }
  const links: GiftLinkRec[] = [
    { id: BIRTHDAY_LINKS.open, pot: pot.slug, createdBy: "maya", amount: null, note: "Leo turns 30 on Saturday 🎉", reusable: true, uses: 1, expiresAt: now + 11 * DAY, revokedAt: null, createdAt: now - 3 * DAY },
    { id: BIRTHDAY_LINKS.fixed, pot: pot.slug, createdBy: "sam", amount: 2_500, note: null, reusable: true, uses: 1, expiresAt: now + 12 * DAY, revokedAt: null, createdAt: now - 2 * DAY },
  ]
  return { pot, gifts, links }
}

/** Add Leo's Birthday (gifts) to a world. */
export function withGiftShowcase(w: World, now: number): World {
  const b = seedBirthday(now)
  return {
    ...w,
    pots: { ...w.pots, [b.pot.slug]: b.pot },
    gifts: [...(w.gifts ?? []).filter((g) => g.pot !== b.pot.slug), ...b.gifts],
    giftLinks: [...(w.giftLinks ?? []).filter((l) => l.pot !== b.pot.slug), ...b.links],
  }
}
