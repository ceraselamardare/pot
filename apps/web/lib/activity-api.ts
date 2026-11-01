// GET /api/me/activity wire types (shared by the route and the browser; types and key helpers only, no I/O).
// One person's own actions across every Pot, newest first: feed_event rows where they are the actor (or a
// close refund names them) ⊕ their own relayed approvals/declines (relay_log, intent = vote).
// Keys are the same ones the client derives from chain views (lib/client/activity.ts), so the two merge.

export type ActivityApiKind = "created" | "joined" | "added" | "asked" | "voted" | "refund" | "rules_asked" | "rules_changed" | "close_asked"

export interface ActivityApiPot {
  potId: string
  slug: string
  name: string
  emoji?: string
  gradient?: string
}

export interface ActivityApiItem {
  key: string
  kind: ActivityApiKind
  pot: ActivityApiPot
  /** block timestamp (feed) or relay time (votes), ISO */
  at: string
  /** the outer transaction (a receipt); absent when unknown */
  txHash?: string
  /** Micro string */
  amount?: string
  requestId?: number
  proposalId?: number
  path?: "instant" | "vote"
  category?: string
  receiver?: string
  /** asked: the hub's last known status (proposed | approved | paid | payout_failed | rejected | expired | withdrawn) */
  status?: string
  /** voted */
  vote?: "Approve" | "Reject"
  /** voted: what the approval was about */
  about?: { type: "spend" | "close" | "rules" | "other"; actor?: string; amount?: string; requestId?: number }
}

export interface ActivityApiRes {
  ok: true
  requestId?: string
  items: ActivityApiItem[]
  /** display names for `about.actor` (people whose requests this person approved or declined) */
  profiles: Record<string, { name: string }>
  nextCursor?: string
}

/** Canonical activity keys (server rows and chain-derived rows agree on them). */
export const activityKey = {
  created: (slug: string) => `created:${slug}`,
  joined: (slug: string, account: string) => `joined:${slug}:${account}`,
  added: (txHash: string) => `added:${txHash}`,
  asked: (slug: string, requestId: number) => `asked:${slug}:${requestId}`,
  voted: (slug: string, proposalId: number, account: string) => `voted:${slug}:${proposalId}:${account}`,
  refund: (slug: string, account: string) => `refund:${slug}:${account}`,
  rulesAsked: (slug: string, proposalId: number) => `rules_asked:${slug}:${proposalId}`,
  rulesChanged: (slug: string, ref: string) => `rules_changed:${slug}:${ref}`,
  closeAsked: (slug: string, proposalId: number) => `close_asked:${slug}:${proposalId}`,
}
