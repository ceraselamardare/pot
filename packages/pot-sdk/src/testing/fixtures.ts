// Lisbon Trip fixtures (D-61, ux-spec §6): Maya creates the Trip Pot (instant ≤ $100, $200 per
// person without asking), Sam joins, both put in $150; Leo joins from the invite and adds $150
// ($450); Maya's $84 groceries are approved instantly ($366); a $300 boat request needs 2 of 3
// (Maya's own approval is cast automatically, D-61), Leo approves ($66); close returns $22.00 each.
// Every state is produced by running that script through MockChain, so each fixture is a real
// end state of the executor. Built once, cloned per call.

import { testnetConfig, daoIdFromSlug } from "../config.ts"
import { buildInviteLink, webCryptoInviteKey } from "../invite.ts"
import type { AccountId, DaoId, PublicKeyStr, Slug } from "../types/ids.ts"
import type { ProposalKind } from "../types/dao.ts"
import type { Err, RelayOk } from "../types/api.ts"
import type { ActionIntent } from "../types/intents.ts"
import { signJoinWebCrypto } from "../invite.ts"
import { MockChain, type MockChainOptions } from "./mock-chain.ts"

export const LISBON_ROOT = "potapp"
export const LISBON_CFG = testnetConfig(LISBON_ROOT)
const acct = (name: string): AccountId => `${name}.users.${LISBON_ROOT}.testnet` as AccountId

export const LISBON = {
  cfg: LISBON_CFG,
  hub: LISBON_CFG.hubId as AccountId,
  usdc: LISBON_CFG.usdcId as AccountId,
  relayer: `users.${LISBON_ROOT}.testnet` as AccountId,
  slug: "lisbon-trip" as Slug,
  dao: daoIdFromSlug("lisbon-trip", LISBON_CFG.hubId) as DaoId,
  name: "Lisbon Trip",
  emoji: "🇵🇹",
  maya: acct("maya"),
  sam: acct("sam"),
  leo: acct("leo"),
  /** The deterministic invite seed of the create-time link (fixtures only; never a real secret). */
  inviteSeed: Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff),
  /** request_ref (OpKey) of each scripted spend */
  refs: { groceries: "k3d9x1a2b4c6m7n8", boat: "p8w2m4q6z1x3r5t7" },
  /** Off-chain memos (POST /api/notes), keyed by request_ref. */
  memos: { k3d9x1a2b4c6m7n8: "Groceries for the flat", p8w2m4q6z1x3r5t7: "Boat trip" } as Record<string, string>,
  startMs: 1_793_001_000_000,
} as const

export type LisbonState = "pre_leo" | "seeded" | "after_instant" | "vote_pending" | "vote_approved" | "close_proposed" | "closed"
export const LISBON_STATES: readonly LisbonState[] = ["pre_leo", "seeded", "after_instant", "vote_pending", "vote_approved", "close_proposed", "closed"]

/** What each state looks like (the numbers tests and UIs can rely on). */
export const LISBON_EXPECTED: Readonly<Record<LisbonState, { balance: bigint; totalIn: bigint; members: number; status: "open" | "closing" | "closed" }>> = {
  pre_leo: { balance: 300_000_000n, totalIn: 300_000_000n, members: 2, status: "open" },
  seeded: { balance: 450_000_000n, totalIn: 450_000_000n, members: 3, status: "open" },
  after_instant: { balance: 366_000_000n, totalIn: 450_000_000n, members: 3, status: "open" },
  vote_pending: { balance: 366_000_000n, totalIn: 450_000_000n, members: 3, status: "open" },
  vote_approved: { balance: 66_000_000n, totalIn: 450_000_000n, members: 3, status: "open" },
  close_proposed: { balance: 66_000_000n, totalIn: 450_000_000n, members: 3, status: "closing" },
  closed: { balance: 0n, totalIn: 450_000_000n, members: 3, status: "closed" },
}

export interface LisbonFixture {
  chain: MockChain
  state: LisbonState
  ids: typeof LISBON
  invite: { publicKey: PublicKeyStr; secret: string; link: string }
  /** DAO proposal ids created so far. */
  proposals: { samJoin: number; leoJoin?: number; groceries?: number; boat?: number; close?: number }
}

export class FixtureScriptError extends Error {
  constructor(step: string, res: RelayOk | Err) {
    super(`Lisbon fixture step "${step}" failed: ${JSON.stringify(res, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`)
    this.name = "FixtureScriptError"
  }
}

async function run(chain: MockChain, step: string, sender: string, intent: ActionIntent): Promise<RelayOk> {
  const res = await chain.relayIntent(sender, intent)
  if (!res.ok || res.outcome !== "success") throw new FixtureScriptError(step, res)
  return res
}

async function kindOf(chain: MockChain, id: number): Promise<ProposalKind> {
  const p = (await chain.dao.getProposal(LISBON.dao, id)).value
  if (!p) throw new Error(`fixture: proposal ${id} missing`)
  return p.kind
}

interface Built {
  snapshots: Map<LisbonState, { chain: MockChain; proposals: LisbonFixture["proposals"] }>
  invite: LisbonFixture["invite"]
}

let built: Promise<Built> | null = null
let builtKey = ""

async function build(opts: MockChainOptions): Promise<Built> {
  const L = LISBON
  const chain = new MockChain({ cfg: L.cfg, startMs: L.startMs, ...opts })
  const key = await webCryptoInviteKey(L.inviteSeed)
  const invite = { publicKey: key.publicKey, secret: key.secret, link: buildInviteLink({ slug: L.slug, invitePk: key.publicKey, secret: key.secret }) }
  const snapshots: Built["snapshots"] = new Map()
  const proposals: LisbonFixture["proposals"] = { samJoin: -1 }
  const snap = (s: LisbonState) => snapshots.set(s, { chain: chain.clone(), proposals: { ...proposals } })
  const later = (min: number) => chain.advanceTime(min * 60_000)

  for (const who of [L.maya, L.sam, L.leo]) chain.createAccount(who)
  chain.fund(L.maya, 150_000_000n)
  chain.fund(L.sam, 150_000_000n)

  await run(chain, "maya creates Lisbon Trip", L.maya, { type: "create_pot", slug: L.slug, name: L.name, preset: "trip", rules: null, invitePk: key.publicKey, emoji: L.emoji })
  later(5)
  const samSig = await signJoinWebCrypto(L.inviteSeed, L.dao, L.sam)
  const samJoin = await run(chain, "sam joins", L.sam, { type: "join", pot: L.dao, invitePk: samSig.invitePk, signature: samSig.signature })
  proposals.samJoin = (samJoin.events.find((e) => e.event === "member_joined")?.data as { proposal_id: number }).proposal_id
  later(5)
  await run(chain, "maya adds $150", L.maya, { type: "add_money", pot: L.dao, amount: 150_000_000n })
  later(30)
  await run(chain, "sam adds $150", L.sam, { type: "add_money", pot: L.dao, amount: 150_000_000n })
  later(60)
  snap("pre_leo")

  const leoSig = await signJoinWebCrypto(L.inviteSeed, L.dao, L.leo)
  const leoJoin = await run(chain, "leo joins", L.leo, { type: "join", pot: L.dao, invitePk: leoSig.invitePk, signature: leoSig.signature })
  proposals.leoJoin = (leoJoin.events.find((e) => e.event === "member_joined")?.data as { proposal_id: number }).proposal_id
  chain.fund(L.leo, 150_000_000n) // demo dollars (faucet)
  await run(chain, "leo adds $150", L.leo, { type: "add_money", pot: L.dao, amount: 150_000_000n })
  later(10)
  snap("seeded")

  const groceries = await run(chain, "maya's $84 groceries", L.maya, {
    type: "request_spend",
    pot: L.dao,
    amount: 84_000_000n,
    receiverId: L.maya,
    category: "groceries",
    requestRef: L.refs.groceries,
  })
  proposals.groceries = (groceries.result as { proposalId: number }).proposalId
  later(10)
  snap("after_instant")

  const boat = await run(chain, "maya asks for $300", L.maya, { type: "request_spend", pot: L.dao, amount: 300_000_000n, receiverId: L.maya, category: "tickets", requestRef: L.refs.boat })
  const boatId = (boat.result as { proposalId: number }).proposalId
  proposals.boat = boatId
  await run(chain, "maya's own approval", L.maya, { type: "vote", pot: L.dao, proposalId: boatId, kind: await kindOf(chain, boatId), action: "VoteApprove" })
  later(15)
  snap("vote_pending")

  await run(chain, "leo approves the boat", L.leo, { type: "vote", pot: L.dao, proposalId: boatId, kind: await kindOf(chain, boatId), action: "VoteApprove" })
  later(30)
  snap("vote_approved")

  const close = await run(chain, "maya proposes close", L.maya, { type: "propose_close", pot: L.dao })
  const closeId = (close.result as { proposalId: number }).proposalId
  proposals.close = closeId
  await run(chain, "maya's own close approval", L.maya, { type: "vote", pot: L.dao, proposalId: closeId, kind: await kindOf(chain, closeId), action: "VoteApprove" })
  later(10)
  snap("close_proposed")

  await run(chain, "sam approves close", L.sam, { type: "vote", pot: L.dao, proposalId: closeId, kind: await kindOf(chain, closeId), action: "VoteApprove" })
  later(1)
  snap("closed")
  return { snapshots, invite }
}

/**
 * A fresh MockChain at one D-61 state (default "seeded", the README / demo-pool state: $450,
 * three members, no spends). Each call returns an independent clone.
 */
export async function lisbonTrip(state: LisbonState = "seeded", opts: Pick<MockChainOptions, "autoSync" | "enforceRelayPolicy" | "msPerBlock"> = {}): Promise<LisbonFixture> {
  const key = JSON.stringify(opts)
  if (!built || builtKey !== key) {
    builtKey = key
    built = build(opts)
    built.catch(() => {
      built = null
    })
  }
  const b = await built
  const s = b.snapshots.get(state)
  if (!s) throw new Error(`unknown Lisbon state ${state}`)
  return { chain: s.chain.clone(), state, ids: LISBON, invite: b.invite, proposals: { ...s.proposals } }
}
