// "Ask for a top-up" wire (lib/topups-api.ts) → the view models the screens render (mock/types.ts TopupVM), and the
// small helpers the card, the row and the Add sheet share. Pure; no I/O.
import { t } from "@/i18n/t"
import { avatarOrNull } from "@/lib/avatars"
import { leftOf } from "@/lib/topups"
import type { ProfilesWire, TopupWire } from "@/lib/topups-api"
import { coverOf, nameFromAccount } from "../live/vm"
import type { FeedItemVM, PersonVM, PotVM, TopupMemberVM, TopupVM } from "../mock/types"
import { initialsOf } from "../mock/world"
import type { Micro } from "../money"

/** A person by account: the Pot's own member (name, colour, picture), else the response's profile, else the account. */
export function personResolver(members: readonly PersonVM[], profiles: ProfilesWire = {}): (account: string) => PersonVM {
  const byId = new Map(members.map((p) => [p.id, p]))
  return (account) => {
    const hit = byId.get(account)
    if (hit) return hit
    const name = profiles[account]?.name ?? nameFromAccount(account) ?? t("person.fallback")
    return { id: account, name, initials: initialsOf(name) || "•", joinIndex: null, avatar: avatarOrNull(profiles[account]?.avatar) }
  }
}

export function topupFromWire(w: TopupWire, personOf: (account: string) => PersonVM, me: string | null): TopupVM {
  const members: TopupMemberVM[] = w.members.map((m) => ({
    person: personOf(m.account),
    part: BigInt(m.part),
    added: BigInt(m.added),
    done: m.done,
    nudgedAt: m.nudgedAt ? Date.parse(m.nudgedAt) : null,
  }))
  return {
    id: w.id,
    slug: w.slug,
    potName: w.potName,
    potEmoji: w.potEmoji,
    potCover: coverOf(w.slug),
    asker: personOf(w.createdBy),
    mode: w.mode,
    perPerson: BigInt(w.perPerson),
    total: BigInt(w.total),
    reason: w.reason,
    dueAt: Date.parse(w.dueAt),
    createdAt: Date.parse(w.createdAt),
    status: w.status,
    endedAt: w.endedAt ? Date.parse(w.endedAt) : null,
    members,
    doneCount: members.filter((m) => m.done).length,
    mine: me !== null && w.createdBy === me,
    me: members.find((m) => m.person.id === me) ?? null,
  }
}

export const topupFeedItems = (list: readonly TopupVM[]): FeedItemVM[] => list.map((v) => ({ key: `topup:${v.id}`, kind: "topup" as const, at: v.createdAt, topup: v }))

/** The Pot with its asks in it: the open one (the card) and every ask as a feed row. */
export function withTopupList(pot: PotVM, list: readonly TopupVM[]): PotVM {
  const feed = [...pot.feed.filter((f) => f.kind !== "topup"), ...topupFeedItems(list)].sort((a, b) => b.at - a.at)
  return { ...pot, topup: list.find((v) => v.status === "open") ?? null, feed }
}

/** What's left of my part (0 once I added it). */
export const myLeft = (v: TopupVM): Micro => (v.me ? leftOf(v.me) : 0n)

/** People asked who still have to add (not me). */
export const waitingOthers = (v: TopupVM, me: string | null): TopupMemberVM[] => v.members.filter((m) => !m.done && m.person.id !== me)

/** Of those, the ones a nudge can reach now (none in the last 24 h). */
export const nudgeTargets = (v: TopupVM, me: string | null): TopupMemberVM[] => waitingOthers(v, me).filter((m) => m.nudgedAt === null)
