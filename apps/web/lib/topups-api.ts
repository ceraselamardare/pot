// "Ask for a top-up" wire types (shared by the routes and the browser; types only, no I/O). lib/topups.ts has the rules.
//   GET    /api/pots/[pot]/topups         members: the open ask (with progress) + the recent ones (feed rows)
//   POST   /api/pots/[pot]/topups         members: ask everyone (201; 409 action_not_allowed {cause: topup_open})
//   DELETE /api/pots/[pot]/topups/[id]    the asker: cancel (idempotent)
//   GET    /api/me/topups                 open asks in the Pots I'm in (Requests) + the asks I made (Your activity)
//   POST   /api/nudges                    members: nudge people who haven't added (once per person per 24 h)
// Amounts are Micro strings; times ISO. Reasons and names are members-only (privacy audit 2026-11-02).
import type { TopupMode, TopupStatus } from "./topups"

export interface TopupMemberWire {
  account: string
  /** Micro: their part */
  part: string
  /** Micro: added since the ask (at the end for a closed ask) */
  added: string
  done: boolean
  /** the last nudge they got for this Pot in the last 24 h, ISO (null = none) */
  nudgedAt: string | null
}

export interface TopupWire {
  id: string
  /** the Pot's DAO id */
  pot: string
  slug: string
  potName: string
  potEmoji: string
  createdBy: string
  mode: TopupMode
  /** Micro: each person's part */
  perPerson: string
  /** Micro: what the ask adds up to */
  total: string
  reason: string | null
  dueAt: string
  createdAt: string
  status: TopupStatus
  /** when it ended (done / due) or was cancelled */
  endedAt: string | null
  /** the people asked who are still in the Pot (join order of the ask) */
  members: TopupMemberWire[]
}

export type ProfilesWire = Record<string, { name: string; avatar?: string | null }>

/** GET /api/pots/[pot]/topups */
export interface TopupsRes {
  ok: true
  requestId?: string
  /** the open ask first (if any), then the last 20 ended or cancelled ones, newest first */
  topups: TopupWire[]
}

/** GET /api/me/topups */
export interface MyTopupsRes {
  ok: true
  requestId?: string
  /** open asks in the Pots I'm in where I'm asked */
  open: TopupWire[]
  /** asks I made (last 90 days), newest first */
  mine: TopupWire[]
  /** the chosen names of the askers and the people asked (people in my Pots only) */
  profiles: ProfilesWire
}

/** POST /api/pots/[pot]/topups */
export interface TopupPostReq {
  mode: TopupMode
  /** Micro: per person (each) or the total (total) */
  amount: string
  reason?: string | null
  /** ISO; absent = in 7 days */
  dueAt?: string
  idempotencyKey: string
}
export interface TopupPostRes {
  ok: true
  requestId?: string
  topup: TopupWire
  replayed?: true
}

/** POST /api/nudges (api-spec §2.5, extended: several people at once, and the ask it's about) */
export interface NudgeReq {
  pot: string
  to: string | string[]
  /** the top-up ask the nudge is about (the push opens Add money for their part) */
  topup?: string
  idempotencyKey: string
}
export type NudgeSkip = "too_soon" | "done" | "not_asked" | "not_member" | "self"
export interface NudgeRes {
  ok: true
  requestId?: string
  delivered: "push" | "email" | "none"
  nudged: string[]
  skipped: { account: string; why: NudgeSkip }[]
  replayed?: true
}
