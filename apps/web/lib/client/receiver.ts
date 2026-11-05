// CLI-3 (security audit 2026-11-04): who a request pays, as the Approve sheet shows it BEFORE anyone approves.
// Names are chosen by people (a profile name, or a name read off the account), so a name alone can lie: a stranger can
// call themselves "Maya". The sheet therefore shows
//  - a member: their name, plus a short Pot-account hint when another member (or the requester) has the same name;
//  - anyone else: the account hint as the main label (never a name they picked), and "Not in this Pot";
//  - a pay-by-link request: nothing here (the link panel says who it's for).
import { IS_LIVE, sdkConfig } from "./config"
import { PEOPLE } from "./mock/fixtures"
import type { PersonVM, PotVM, RequestVM } from "./mock/types"
import { LINK_RECEIVER } from "./paylink/link"

export interface ReceiverInfo {
  kind: "member" | "outsider" | "link"
  /** what to call them: the member's name, or the account hint for anyone else */
  label: string
  /** the short Pot-account hint (null for a pay-by-link request) */
  hint: string | null
  /** another member or the requester has the same name: show the hint next to the name */
  sameName: boolean
  isMe: boolean
}

/** Account names our own sign-up creates (`<name>-<random>.users.<root>`): only our server can mint them. */
function ownUserSuffix(): string {
  const hub = sdkConfig().hubId
  // the mock world's people live under users.pots.testnet (lib/client/mock/fixtures.ts)
  return hub ? `.users.${hub.replace(/^pots\./, "")}` : ".users.pots.testnet"
}

/** The NEAR account behind a person id (testnet: the id itself; mock: the persona's fictional account). */
export function accountOf(id: string): string {
  if (IS_LIVE) return id
  return (PEOPLE as Record<string, { account: string } | undefined>)[id]?.account ?? id
}

const MAX = 24

/**
 * A short, unambiguous hint for an account: our own sign-ups lose the shared `.users.<root>` tail ("maya-4f2a"),
 * 64-hex implicit accounts and 0x addresses keep their ends ("1f9a2b…77c0"), anything else is shown whole or, when long,
 * with its middle cut (its START and END both stay, so "maya-4f2a.evil.testnet" can't pass for our "maya-4f2a").
 */
export function accountHint(account: string, own: string = ownUserSuffix()): string {
  const a = account.trim().toLowerCase()
  if (own && a.endsWith(own) && a.length > own.length && !a.slice(0, -own.length).includes(".")) return a.slice(0, -own.length)
  if (/^[0-9a-f]{64}$/.test(a)) return `${a.slice(0, 6)}…${a.slice(-4)}`
  if (/^0x[0-9a-f]{40}$/.test(a)) return `${a.slice(0, 6)}…${a.slice(-4)}`
  if (a.length <= MAX) return a
  return `${a.slice(0, 13)}…${a.slice(-(MAX - 14))}`
}

/** Names compare after Unicode compatibility folding, case folding and dropping invisible / space characters. */
export function sameNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤﻿]/g, "")
}

export function receiverInfo(
  pot: Pick<PotVM, "members">,
  r: Pick<RequestVM, "receiver" | "requester" | "link">,
  me: string | null,
): ReceiverInfo {
  const p: PersonVM = r.receiver
  if (r.link || p.id === LINK_RECEIVER) return { kind: "link", label: p.name, hint: null, sameName: false, isMe: false }
  const hint = accountHint(accountOf(p.id))
  const member = pot.members.some((m) => m.person.id === p.id)
  if (!member) return { kind: "outsider", label: hint, hint, sameName: false, isMe: p.id === me }
  const key = sameNameKey(p.name)
  const others = [...pot.members.map((m) => m.person), r.requester].filter((o) => o.id !== p.id)
  const sameName = others.some((o) => sameNameKey(o.name) === key)
  return { kind: "member", label: p.name, hint, sameName, isMe: p.id === me }
}
