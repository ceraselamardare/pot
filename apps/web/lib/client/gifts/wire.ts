// Gifts API wire shapes (lib/gifts-api.ts) → the view models the screens render. Pure, and safe to import from server
// components (the /g and /give pages' first paint) as well as the browser.
import { t } from "@/i18n/t"
import type { GiftLandingRes, GiftLinkWire, GiftPageRes, GiftsRes, MyGiftWire } from "@/lib/gifts-api"
import { coverOf, nameFromAccount } from "../live/vm"
import type { GiftLandingVM, GiftPageVM, MyGiftVM } from "../mock/gifts"
import { initialsOf } from "../mock/world"
import type { GiftsVM, GiftVM } from "../mock/types"
import type { Micro } from "../money"

/** A working gift link as the members' share sheet lists it. */
export interface GiftLinkVM {
  id: string
  /** null = the giver chooses */
  amount: Micro | null
  note: string | null
  reusable: boolean
  uses: number
  expiresAt: number
  createdBy: string
}

const micro = (s: string | null): Micro | null => (s === null ? null : BigInt(s))

export function linkFromWire(l: GiftLinkWire): GiftLinkVM {
  return { id: l.id, amount: micro(l.amount), note: l.note, reusable: l.reusable, uses: l.uses, expiresAt: Date.parse(l.expiresAt), createdBy: l.createdBy }
}

export function landingFromWire(r: Omit<GiftLandingRes, "ok" | "requestId">): GiftLandingVM {
  return {
    pot: { slug: r.pot.slug, name: r.pot.name, emoji: r.pot.emoji, cover: coverOf(r.pot.slug), members: r.pot.members, status: r.pot.status },
    link: { id: r.link.id, amount: micro(r.link.amount), note: r.link.note, status: r.link.status, expiresAt: Date.parse(r.link.expiresAt) },
    taking: r.taking,
  }
}

export function pageFromWire(r: Omit<GiftPageRes, "ok" | "requestId">): GiftPageVM {
  const pot = { slug: r.pot.slug, name: r.pot.name, emoji: r.pot.emoji, cover: coverOf(r.pot.slug), members: r.pot.members, status: r.pot.status }
  if (!r.page.on) return { pot, on: false, line: null }
  return {
    pot,
    on: true,
    line: r.page.line,
    taking: r.taking,
    total: r.totals ? BigInt(r.totals.amount) : 0n,
    count: r.totals?.count ?? 0,
    givers: (r.givers ?? []).map((g, i) => ({ key: `${g.at}:${i}`, name: g.name, note: g.note, amount: BigInt(g.amount), at: Date.parse(g.at) })),
  }
}

const giverName = (account: string, chosen: string | null) => chosen ?? nameFromAccount(account) ?? t("person.fallback")

export function giftsFromWire(r: Omit<GiftsRes, "ok" | "requestId">, view: { on: boolean; total: Micro; count: number } | null): GiftsVM {
  const items: GiftVM[] = r.gifts
    .filter((g) => g.status === "received")
    .map((g) => {
      const name = giverName(g.from, g.name)
      return {
        ref: g.ref,
        from: { id: g.from, name, initials: initialsOf(name), joinIndex: null, avatar: null },
        note: g.note,
        showPublic: g.showPublic,
        amount: BigInt(g.amount),
        at: Date.parse(g.at),
        linkId: g.linkId,
        ...(g.txHash ? { txHash: g.txHash } : {}),
      }
    })
    .sort((a, b) => b.at - a.at)
  return {
    on: view?.on ?? true,
    page: r.page,
    total: view?.total ?? BigInt(r.totals.amount),
    count: view?.count ?? r.totals.count,
    items,
  }
}

export function myGiftFromWire(g: MyGiftWire): MyGiftVM {
  return { ref: g.ref, slug: g.slug, potName: g.potName, potEmoji: g.potEmoji, potCover: coverOf(g.slug), amount: BigInt(g.amount), note: g.note, at: Date.parse(g.at), ...(g.txHash ? { txHash: g.txHash } : {}) }
}

