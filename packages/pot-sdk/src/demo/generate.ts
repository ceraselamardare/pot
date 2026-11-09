// The /demo explainer's deterministic dataset (plan/design-direction/05 §7). It drives MockChain
// through the D-61 story with the §2.0 cast, signing every delegate for real with keys derived in
// memory from fixed public seeds (sha256("pot-demo/v1/<name>")). Keys are never written anywhere:
// only public keys, signatures and the signed transport bytes reach the output. No clock, no
// randomness, no network: running it twice gives byte-identical JSON.
//
// The output is committed as apps/web/app/demo/_data/demo-script.json (`pnpm gen:demo`) and a
// drift test regenerates it.

import { closeDescription, closeKind, joinDescription, joinKind, spendDescription, transferKind } from "../actions/kinds.ts"
import { daoIdFromSlug, testnetConfig } from "../config.ts"
import { base58Encode, base64Encode, utf8Encode } from "../encoding.ts"
import { joinMessage } from "../invite.ts"
import { approvalsNeeded } from "../math/approvals.ts"
import { prorata } from "../math/prorata.ts"
import { formatUsdShort } from "../money.ts"
import { presetRules, rulesToRaw } from "../rules.ts"
import { decodeSignedDelegate, delegateHash, type DecodedSignedDelegate } from "../sign/encode.ts"
import { verifySignedDelegate } from "../sign/delegate.ts"
import { inviteKeyFromSeed, signJoin } from "../sign/invite.ts"
import { KeyPairPotSigner } from "../sign/signer.ts"
import { MockChain } from "../testing/mock-chain.ts"
import type { RelayOk } from "../types/api.ts"
import type { Policy, Proposal } from "../types/dao.ts"
import type { AccountId, Slug } from "../types/ids.ts"
import type { ActionIntent } from "../types/intents.ts"
import { closePrepay, PREPAY_MODEL, proposalPrepay, yoctoToNear, yoctoToNearExact } from "./prepay.ts"
import { REAL_TXS, TEMPLATE_TXS } from "./real.ts"
import { addMoneyReceipts, createPotReceipts, EventQueue, joinReceipts, proposeCloseReceipts, realTx, requestSpendReceipts, syncReceipts, voteReceipts, type Ids, type MockEvent } from "./receipts.ts"
import type { AppScene, Beat, Card, Chapter, ChapterN, DemoScript, Envelope, Persona, ProposalJson, Recap, RulesRow, SignedDelegateJson, SimTx, Snapshot, VoteMeter, WhoPaid } from "./types.ts"

// ------------------------------------------------------------------ the cast (§2.0)

export const DEMO_ROOT = "potprev"
export const DEMO_CFG = testnetConfig(DEMO_ROOT)
export const DEMO_SEED_PREFIX = "pot-demo/v1/"
export const DEMO_SLUG = "lisbon-trip-7k2f"
export const DEMO = {
  hub: DEMO_CFG.hubId as AccountId,
  usdc: DEMO_CFG.usdcId as AccountId,
  relayer: `users.${DEMO_ROOT}.testnet`,
  faucet: `treasury.${DEMO_ROOT}.testnet`,
  pot: daoIdFromSlug(DEMO_SLUG, DEMO_CFG.hubId),
  people: { maya: "u-7k2m9qxa.users.potprev.testnet", sam: "u-4hn8c2wd.users.potprev.testnet", leo: "u-3p8w2kdn.users.potprev.testnet" } as Record<Persona, AccountId>,
  name: "Lisbon Trip",
  emoji: "🇵🇹",
  refs: { groceries: "k3d9x1a2b4c6m7n8", boat: "p8w2m4q6z1x3r5t7" },
  memos: { k3d9x1a2b4c6m7n8: "Groceries for the flat", p8w2m4q6z1x3r5t7: "Boat trip" } as Record<string, string>,
  startMs: Date.UTC(2026, 10, 7, 9, 0),
  startHeight: 275_000_000,
  msPerBlock: 600,
  daoCodeHash: "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD",
  floatYocto: 50_000_000_000_000_000_000_000n,
  usdcStorageYocto: 1_250_000_000_000_000_000_000n,
  sdk: "@pot/sdk 0.1.0",
} as const

const PEOPLE: readonly Persona[] = ["maya", "sam", "leo"]
const IDS: Ids = { relayer: DEMO.relayer, hub: DEMO.hub, usdc: DEMO.usdc, pot: DEMO.pot }

/** The simulated tx ids, in story order, and the real tx each one mirrors (gas, burnt NEAR, refunds). */
export const SIM_TX_REAL: Readonly<Record<string, string>> = {
  ...Object.fromEntries([...REAL_TXS, ...TEMPLATE_TXS].filter((r) => r.mirrors).map((r) => [r.mirrors as string, r.hash])),
  // no real sync was recorded for a close; the chapter-5 sync has the same three receipts
  "c6.sync": "BSQFyv2HfngBDEMRw8svtwkZ8Vxk4NnZc834kriB7LFU",
}

// ------------------------------------------------------------------ sim ids (§7.2 step 4)

export const SIM_HASH_RE = /^sim-[1-9A-HJ-NP-Za-km-z]{32}$/

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8Encode(text) as Uint8Array<ArrayBuffer>))
}
/** `"sim-" + base58(sha256("pot-demo/v1/tx/" + txId)).slice(0, 32)` */
export async function simHash(txId: string): Promise<string> {
  return `sim-${base58Encode(await sha256(`${DEMO_SEED_PREFIX}tx/${txId}`)).slice(0, 32)}`
}
export async function simBlockHash(height: number): Promise<string> {
  return `sim-${base58Encode(await sha256(`${DEMO_SEED_PREFIX}block/${height}`)).slice(0, 32)}`
}

/** A signer for one persona, its key derived in memory from the public seed label. Never exported or logged. */
async function personaSigner(chain: MockChain, name: Persona): Promise<KeyPairPotSigner> {
  const seed = await sha256(`${DEMO_SEED_PREFIX}${name}`)
  return new KeyPairPotSigner({ accountId: DEMO.people[name], secretKey: `ed25519:${base58Encode(seed)}`, chain, cfg: DEMO_CFG })
}

// ------------------------------------------------------------------ helpers

const micro = (usd: number): bigint => BigInt(usd) * 1_000_000n
const usd = (m: bigint): string => formatUsdShort(m)
/** Approx figures (copied from a real run) round to 4 dp; exact ones (prepay, float, deposits) keep every digit. */
const yoctoRow = (account: string, what: WhoPaid["what"], yocto: bigint, approx: boolean): WhoPaid => ({ account, what, near: approx ? yoctoToNear(yocto) : yoctoToNearExact(yocto), yocto: yocto.toString(), approx })

function toProposalJson(p: Proposal, log: { proposalId: number; blockHeight: number }[]): ProposalJson {
  const vote_counts: ProposalJson["vote_counts"] = {}
  for (const [role, c] of Object.entries(p.voteCounts)) vote_counts[role] = [String(c[0]), String(c[1]), String(c[2])]
  const votes: ProposalJson["votes"] = {}
  for (const k of Object.keys(p.votes).sort()) votes[k] = p.votes[k] as ProposalJson["votes"][string]
  return {
    id: p.id,
    proposer: p.proposer,
    description: p.description,
    kind: p.kind,
    status: p.status as ProposalJson["status"],
    vote_counts,
    votes,
    submission_time: p.submissionTimeNs.toString(),
    last_actions_log: log.filter((e) => e.proposalId === p.id).map((e) => ({ block_height: String(e.blockHeight) })),
  }
}

async function proposalJson(chain: MockChain, id: number): Promise<ProposalJson> {
  const p = (await chain.dao.getProposal(DEMO.pot, id)).value
  if (!p) throw new Error(`demo: proposal ${id} missing`)
  return toProposalJson(p, (await chain.dao.getActionsLog(DEMO.pot)).value)
}

/** The proposal as just filed, before any vote (between the add_proposal and act_proposal receipts). */
function filed(p: ProposalJson): ProposalJson {
  return { ...p, status: "InProgress", vote_counts: {}, votes: {}, last_actions_log: p.last_actions_log.slice(0, 1) }
}

async function snapshot(chain: MockChain, people: readonly Persona[]): Promise<Snapshot> {
  const pv = (await chain.hub.getPot(DEMO.pot)).value
  const balances: Snapshot["balances"] = {}
  for (const who of people) balances[DEMO.people[who]] = { usdc: (await chain.usdc.balanceOf(DEMO.people[who])).value.toString(), near: "0" }
  balances[DEMO.hub] = { usdc: (await chain.usdc.balanceOf(DEMO.hub)).value.toString() }
  if (!pv) return { pot: null, dao: null, balances }
  balances[DEMO.pot] = { usdc: (await chain.usdc.balanceOf(DEMO.pot)).value.toString() }
  const members = (await chain.hub.getMembers(DEMO.pot)).value
  const requests = (await chain.hub.getRequests(DEMO.pot, 0, 50)).value
  const policy = (await chain.dao.getPolicy(DEMO.pot)).value
  const last = (await chain.dao.getLastProposalId(DEMO.pot)).value
  const log = (await chain.dao.getActionsLog(DEMO.pot)).value
  const proposals = (await chain.dao.getProposals(DEMO.pot, 0, 100)).value.map((p) => toProposalJson(p, log))
  const n = policy.members.length
  return {
    pot: {
      status: pv.status,
      members: members.map((m) => ({ account: m.account, joinIndex: m.joinIndex, contributed: m.contributed.toString(), instantUsed: m.instantUsed.toString() })),
      ledger: { totalContributed: pv.totalIn.toString(), spentInstant: pv.spentInstant.toString(), spentVote: pv.spentVote.toString(), reserved: pv.reserved.toString() },
      requests: requests.map((r) => ({ id: r.id, path: r.path, status: r.hubStatus, amount: r.amount.toString(), proposalId: r.proposalId, category: r.category, requestRef: r.requestRef })),
    },
    dao: {
      exists: true,
      members: [...policy.members],
      rulebot: [...policy.rulebot],
      threshold: { k: approvalsNeeded(n, policy.threshold, policy.quorum), n },
      lastProposalId: last,
      proposals,
      floatNear: yoctoToNear(DEMO.floatYocto, 2),
      policy: policy.raw,
    },
    balances,
  }
}

function meter(p: ProposalJson, s: Snapshot, rulebot: VoteMeter["rulebot"]): VoteMeter {
  const dao = s.dao
  if (!dao || !s.pot) throw new Error("demo: meter needs a DAO")
  const members = { n: dao.members.length, k: dao.threshold.k }
  const approvals = (role: string): number => Number(p.vote_counts[role]?.[0] ?? "0")
  if (rulebot === "decides") {
    return {
      role: "rulebot",
      seats: [{ account: DEMO.hub, joinIndex: 0, vote: p.votes[DEMO.hub] === "Approve" ? "approve" : "none" }],
      k: 1,
      n: 1,
      approvals: approvals("rulebot"),
      math: { groupSize: 1, num: 1, den: 1, quorum: 1, threshold: approvalsNeeded(1, [1, 1], 1) },
      members,
      rulebot,
    }
  }
  const seats = [...s.pot.members]
    .sort((a, b) => a.joinIndex - b.joinIndex)
    .map((m) => ({ account: m.account, joinIndex: m.joinIndex, vote: (p.votes[m.account] === "Approve" ? "approve" : "none") as "approve" | "none" }))
  const n = seats.length
  const k = approvalsNeeded(n, [1, 2], 1)
  return { role: "member", seats, k, n, approvals: approvals("member"), math: { groupSize: n, num: 1, den: 2, quorum: 1, threshold: k }, members, rulebot }
}

function delegateJson(d: DecodedSignedDelegate, transport: string, signedHash: Uint8Array): SignedDelegateJson {
  const a = d.actions[0]
  if (d.actions.length !== 1 || !a || a.type !== "FunctionCall") throw new Error("demo: every delegate carries exactly one FunctionCall")
  return {
    delegate_action: {
      sender_id: d.senderId,
      receiver_id: d.receiverId,
      actions: [{ FunctionCall: { method_name: a.method, args: a.argsJson, args_base64: base64Encode(a.args), gas: a.gas.toString(), deposit: a.deposit.toString() } }],
      nonce: d.nonce.toString(),
      max_block_height: d.maxBlockHeight.toString(),
      public_key: d.publicKey,
    },
    signature: `ed25519:${base58Encode(d.signature.data)}`,
    transport_base64: transport,
    signed_hash: base58Encode(signedHash),
  }
}

function burntOf(id: string): SimTx["burnt"] {
  const r = realTx(SIM_TX_REAL[id] as string)
  const tgas = Math.round(Number(BigInt(r.gasBurnt) / 100_000_000_000n)) / 10
  return { tgas, near: yoctoToNear(BigInt(r.tokensBurnt)), approx: true, yocto: r.tokensBurnt }
}

const strip = (events: readonly MockEvent[]): SimTx["events"] => events.map((e) => ({ standard: e.standard, event: e.event, data: e.data }))

// ------------------------------------------------------------------ the run

interface Signed {
  id: string
  res: RelayOk
  decoded: DecodedSignedDelegate
  delegate: SignedDelegateJson
  args: Record<string, unknown>
  /** syncs the relayer ran after this tx (MockChain autoSync) */
  followUps: { events: MockEvent[]; blockHeight: number }[]
}

class Run {
  readonly chain: MockChain
  private readonly signers = new Map<Persona, KeyPairPotSigner>()
  private relayerNonce = 274_990_000_000_000n
  /** the relayer pool key (public half only; derived like the personas' keys) */
  readonly relayerPk: string

  constructor(relayerPk: string) {
    this.relayerPk = relayerPk
    this.chain = new MockChain({ cfg: DEMO_CFG, startMs: DEMO.startMs, startHeight: DEMO.startHeight, msPerBlock: DEMO.msPerBlock })
  }

  later(min: number): void {
    this.chain.advanceTime(min * 60_000)
  }

  async join(who: Persona): Promise<void> {
    const s = await personaSigner(this.chain, who)
    this.chain.createAccount(DEMO.people[who], s.publicKey)
    this.signers.set(who, s)
  }

  nextRelayerNonce(): string {
    this.relayerNonce += 1n
    return this.relayerNonce.toString()
  }

  /** prepare → sign (really) → verify → MockChain.handleRelayBody, exactly as POST /api/relay would. */
  async send(id: string, who: Persona, intent: ActionIntent): Promise<Signed> {
    const signer = this.signers.get(who)
    if (!signer) throw new Error(`demo: ${who} has no account yet`)
    const prepared = await signer.prepare(intent)
    const signed = await signer.sign(prepared)
    if (signed.via !== "relay" || !("signedDelegate" in signed.body)) throw new Error("demo: expected a signed delegate")
    const transport = signed.body.signedDelegate
    const decoded = decodeSignedDelegate(transport)
    if (!(await verifySignedDelegate(decoded))) throw new Error(`demo: ${id} signature does not verify`)
    const logBefore = this.chain.txLog.length
    const res = await this.chain.handleRelayBody(DEMO.people[who], signed.body)
    if (!res.ok || res.outcome !== "success") throw new Error(`demo: ${id} failed: ${JSON.stringify(res, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`)
    const followUps = this.chain.txLog.slice(logBefore + 1).map((t) => ({ events: t.events as MockEvent[], blockHeight: t.blockHeight }))
    const a = decoded.actions[0] as Extract<DecodedSignedDelegate["actions"][number], { type: "FunctionCall" }>
    return { id, res, decoded, delegate: delegateJson(decoded, transport, await delegateHash(decoded.delegateActionBytes)), args: a.argsJson as Record<string, unknown>, followUps }
  }
}

async function delegateTx(run: Run, s: Signed, receipts: SimTx["receipts"], whoPaidExtra: WhoPaid[], checks: Envelope["checks"]): Promise<SimTx> {
  const burnt = burntOf(s.id)
  const mbh = Number(s.decoded.maxBlockHeight)
  return {
    id: s.id,
    hash: await simHash(s.id),
    kind: "delegate",
    signer: DEMO.relayer,
    receiver: s.decoded.senderId,
    delegate: s.delegate,
    receipts,
    burnt: { tgas: burnt.tgas, near: burnt.near, approx: true, yocto: burnt.yocto },
    events: strip(s.res.events as MockEvent[]),
    outcome: "success",
    envelope: {
      signer_id: DEMO.relayer,
      public_key: run.relayerPk,
      nonce: run.nextRelayerNonce(),
      receiver_id: s.decoded.senderId,
      block_hash: await simBlockHash(mbh - 200),
      actions: [{ Delegate: { tx: s.id } }],
      checks,
    },
    whoPaid: [yoctoRow(DEMO.relayer, "gas", BigInt(burnt.yocto), true), ...whoPaidExtra, yoctoRow(s.decoded.senderId, "nothing", 0n, false)],
    realRef: SIM_TX_REAL[s.id] as string,
    blockHeight: s.res.executedAtBlock,
  }
}

async function syncTx(run: Run, id: string, f: { events: MockEvent[]; blockHeight: number }, receipts: SimTx["receipts"], proposalId: number): Promise<SimTx> {
  const burnt = burntOf(id)
  return {
    id,
    hash: await simHash(id),
    kind: "relayer",
    signer: DEMO.relayer,
    receiver: DEMO.hub,
    receipts,
    burnt,
    events: strip(f.events),
    outcome: "success",
    envelope: {
      signer_id: DEMO.relayer,
      public_key: run.relayerPk,
      nonce: run.nextRelayerNonce(),
      receiver_id: DEMO.hub,
      block_hash: await simBlockHash(f.blockHeight - 3),
      actions: [{ FunctionCall: { method_name: "sync", args: { pot: DEMO.pot, proposal_id: proposalId }, gas: "50000000000000", deposit: "0" } }],
      checks: [],
    },
    whoPaid: [yoctoRow(DEMO.relayer, "gas", BigInt(burnt.yocto), true)],
    realRef: SIM_TX_REAL[id] as string,
    blockHeight: f.blockHeight,
  }
}

/** The relayer's D-24 checks for one delegate (values as the relayer saw them). */
function checksFor(d: SignedDelegateJson, head: number): Envelope["checks"] {
  const fc = d.delegate_action.actions[0].FunctionCall
  return [
    { check: "allowlist", value: `${d.delegate_action.receiver_id} · ${fc.method_name}`, ok: true },
    { check: "deposit_cap", value: fc.deposit, ok: true },
    { check: "gas", value: `${Number(BigInt(fc.gas) / 1_000_000_000_000n)} Tgas`, ok: true },
    { check: "expiry", value: `${d.delegate_action.max_block_height} ≤ ${head} + 600`, ok: true },
    { check: "nonce", value: d.delegate_action.nonce, ok: true },
    { check: "signature", value: "ed25519", ok: true },
    { check: "quotas", value: "within daily limits", ok: true },
  ]
}

// ------------------------------------------------------------------ beats

function beats(n: ChapterN, list: Omit<Beat, "id" | "captionKey">[]): Beat[] {
  return list.map((b, i) => ({ id: `beat-${i + 1}`, captionKey: `demo.c${n}.b${i + 1}`, ...b }))
}
const note = (key: string): Card => ({ type: "note", key: `demo.note.${key}` })

// ------------------------------------------------------------------ generate

export async function generateDemoScript(): Promise<DemoScript> {
  const run = new Run(inviteKeyFromSeed(await sha256(`${DEMO_SEED_PREFIX}relayer`)).publicKey)
  const chain = run.chain
  const P = DEMO.people
  const invite = inviteKeyFromSeed(await sha256(`${DEMO_SEED_PREFIX}invite`))
  const inviteSeed = invite.seed
  const trip = presetRules("trip")
  if (!trip) throw new Error("demo: no trip preset")
  const rawRules = rulesToRaw(trip)

  // ---------------------------------------------------------------- chapter 1: Maya starts a Pot
  await run.join("maya")
  const c1Before = await snapshot(chain, ["maya"])
  const create = await run.send("c1.create", "maya", { type: "create_pot", slug: DEMO_SLUG as Slug, name: DEMO.name, preset: "trip", rules: null, invitePk: invite.publicKey, emoji: DEMO.emoji })
  const c1After = await snapshot(chain, ["maya"])
  const policyAtCreate = c1After.dao?.policy as Policy
  const dayIndex = Math.floor(chain.now() / 86_400_000)
  const c1Tx = await delegateTx(
    run,
    create,
    createPotReceipts({
      ids: IDS,
      tx: "c1.create",
      realHash: SIM_TX_REAL["c1.create"] as string,
      person: P.maya,
      args: create.args,
      daoCodeHash: DEMO.daoCodeHash,
      float: DEMO.floatYocto,
      usdcStorage: DEMO.usdcStorageYocto,
      newArgs: { config: { name: DEMO.name, purpose: `Pot group fund (trip). Rules enforced by ${DEMO.hub}`, metadata: "" }, policy: policyAtCreate },
      rawRules,
      dayIndex,
      events: new EventQueue(create.res.events as MockEvent[]),
    }),
    [yoctoRow(DEMO.hub, "float", DEMO.floatYocto, false), yoctoRow(DEMO.hub, "registration", DEMO.usdcStorageYocto, false)],
    checksFor(create.delegate, Number(create.decoded.maxBlockHeight) - 200),
  )
  run.later(5)

  // ---------------------------------------------------------------- interlude: Sam joins, $150 + $150 (off-screen)
  await run.join("sam")
  const samSig = signJoin(inviteSeed, DEMO.pot, P.sam)
  await run.send("interlude.sam_join", "sam", { type: "join", pot: DEMO.pot, invitePk: samSig.invitePk, signature: samSig.signature })
  run.later(5)
  chain.fund(P.maya, micro(150))
  await run.send("interlude.maya_add", "maya", { type: "add_money", pot: DEMO.pot, amount: micro(150) })
  run.later(30)
  chain.fund(P.sam, micro(150))
  await run.send("interlude.sam_add", "sam", { type: "add_money", pot: DEMO.pot, amount: micro(150) })
  run.later(60)

  // ---------------------------------------------------------------- chapter 2: Leo joins from the link
  await run.join("leo")
  const c2Before = await snapshot(chain, PEOPLE)
  const leoSig = signJoin(inviteSeed, DEMO.pot, P.leo)
  const join = await run.send("c2.join", "leo", { type: "join", pot: DEMO.pot, invitePk: leoSig.invitePk, signature: leoSig.signature })
  const c2After = await snapshot(chain, PEOPLE)
  const leoJoinPid = (join.res.events.find((e) => e.event === "member_joined")?.data as { proposal_id: number }).proposal_id
  const leoJoinProp = await proposalJson(chain, leoJoinPid)
  const joinPrepay = proposalPrepay(joinDescription(), joinKind(P.leo), 0)
  const c2Tx = await delegateTx(
    run,
    join,
    joinReceipts({ ids: IDS, tx: "c2.join", realHash: SIM_TX_REAL["c2.join"] as string, person: P.leo, args: join.args, prepay: joinPrepay, description: joinDescription(), kind: joinKind(P.leo), proposal: leoJoinProp, events: new EventQueue(join.res.events as MockEvent[]) }),
    [yoctoRow(DEMO.hub, "storage_prepay", joinPrepay, false)],
    checksFor(join.delegate, Number(join.decoded.maxBlockHeight) - 200),
  )

  // ---------------------------------------------------------------- chapter 3: Leo adds $150
  chain.fund(P.leo, micro(150)) // demo dollars from the faucet, off-screen
  const c3Before = await snapshot(chain, PEOPLE)
  const add = await run.send("c3.add", "leo", { type: "add_money", pot: DEMO.pot, amount: micro(150) })
  const c3After = await snapshot(chain, PEOPLE)
  const c3Tx = await delegateTx(
    run,
    add,
    addMoneyReceipts({ ids: IDS, tx: "c3.add", realHash: SIM_TX_REAL["c3.add"] as string, person: P.leo, args: add.args, events: new EventQueue(add.res.events as MockEvent[]) }),
    [yoctoRow(DEMO.relayer, "deposit", 1n, false), yoctoRow(DEMO.hub, "deposit", 1n, false)],
    checksFor(add.delegate, Number(add.decoded.maxBlockHeight) - 200),
  )
  run.later(10)

  // ---------------------------------------------------------------- chapter 4: $84 groceries, instant
  const c4Before = await snapshot(chain, PEOPLE)
  const potBalance4 = BigInt(c4Before.balances[DEMO.pot]?.usdc ?? "0")
  const groceries = await run.send("c4.request", "maya", { type: "request_spend", pot: DEMO.pot, amount: micro(84), receiverId: P.maya, category: "groceries", requestRef: DEMO.refs.groceries })
  const c4After = await snapshot(chain, PEOPLE)
  const g = groceries.res.result as { requestId: number; proposalId: number }
  const gDesc = spendDescription(g.requestId, "groceries", DEMO.refs.groceries)
  const gKind = transferKind(DEMO.usdc, P.maya, micro(84))
  const gPrepay = proposalPrepay(gDesc, gKind, 0)
  const gProp = await proposalJson(chain, g.proposalId)
  const c4Tx = await delegateTx(
    run,
    groceries,
    requestSpendReceipts({
      ids: IDS,
      tx: "c4.request",
      realHash: SIM_TX_REAL["c4.request"] as string,
      person: P.maya,
      args: groceries.args,
      requestId: g.requestId,
      prepay: gPrepay,
      description: gDesc,
      kind: gKind,
      balance: potBalance4,
      policy: c4Before.dao?.policy,
      outcome: { request_id: g.requestId, proposal_id: g.proposalId, path: "instant", reason: "within_rules", status: "approved", refusal: null, approvals_needed: approvalsNeeded(3) },
      approved: gProp,
      events: new EventQueue(groceries.res.events as MockEvent[]),
    }),
    [yoctoRow(DEMO.hub, "storage_prepay", gPrepay, false), yoctoRow(DEMO.pot, "deposit", 1n, false)],
    checksFor(groceries.delegate, Number(groceries.decoded.maxBlockHeight) - 200),
  )
  run.later(10)

  // ---------------------------------------------------------------- chapter 5: a $300 boat trip goes to the group
  const c5Before = await snapshot(chain, PEOPLE)
  const potBalance5 = BigInt(c5Before.balances[DEMO.pot]?.usdc ?? "0")
  const boat = await run.send("c5.request", "maya", { type: "request_spend", pot: DEMO.pot, amount: micro(300), receiverId: P.maya, category: "tickets", requestRef: DEMO.refs.boat })
  const b = boat.res.result as { requestId: number; proposalId: number }
  const bDesc = spendDescription(b.requestId, "tickets", DEMO.refs.boat)
  const bKind = transferKind(DEMO.usdc, P.maya, micro(300))
  const bPrepay = proposalPrepay(bDesc, bKind, 3)
  const boatFiled = await proposalJson(chain, b.proposalId)
  const c5AfterRequest = await snapshot(chain, PEOPLE)
  const c5Request = await delegateTx(
    run,
    boat,
    requestSpendReceipts({
      ids: IDS,
      tx: "c5.request",
      realHash: SIM_TX_REAL["c5.request"] as string,
      person: P.maya,
      args: boat.args,
      requestId: b.requestId,
      prepay: bPrepay,
      description: bDesc,
      kind: bKind,
      balance: potBalance5,
      policy: c5Before.dao?.policy,
      outcome: { request_id: b.requestId, proposal_id: b.proposalId, path: "vote", reason: "over_cap", status: "pending", refusal: null, approvals_needed: approvalsNeeded(3) },
      events: new EventQueue(boat.res.events as MockEvent[]),
    }),
    [yoctoRow(DEMO.hub, "storage_prepay", bPrepay, false)],
    checksFor(boat.delegate, Number(boat.decoded.maxBlockHeight) - 200),
  )
  const mayaVote = await run.send("c5.maya_vote", "maya", { type: "vote", pot: DEMO.pot, proposalId: b.proposalId, kind: bKind, action: "VoteApprove" })
  const boatOneOfTwo = await proposalJson(chain, b.proposalId)
  const c5AfterMaya = await snapshot(chain, PEOPLE)
  const c5Maya = await delegateTx(
    run,
    mayaVote,
    voteReceipts({ ids: IDS, tx: "c5.maya_vote", realHash: SIM_TX_REAL["c5.maya_vote"] as string, person: P.maya, args: mayaVote.args, gas: mayaVote.delegate.delegate_action.actions[0].FunctionCall.gas, events: new EventQueue(mayaVote.res.events as MockEvent[]) }),
    [],
    checksFor(mayaVote.delegate, Number(mayaVote.decoded.maxBlockHeight) - 200),
  )
  run.later(15)
  const leoVote = await run.send("c5.leo_vote", "leo", { type: "vote", pot: DEMO.pot, proposalId: b.proposalId, kind: bKind, action: "VoteApprove" })
  const boatApproved = await proposalJson(chain, b.proposalId)
  const c5After = await snapshot(chain, PEOPLE)
  const c5Leo = await delegateTx(
    run,
    leoVote,
    voteReceipts({
      ids: IDS,
      tx: "c5.leo_vote",
      realHash: SIM_TX_REAL["c5.leo_vote"] as string,
      person: P.leo,
      args: leoVote.args,
      gas: leoVote.delegate.delegate_action.actions[0].FunctionCall.gas,
      payout: { kind: "transfer", receiver: P.maya, amount: micro(300).toString(), memo: bDesc },
      events: new EventQueue(leoVote.res.events as MockEvent[]),
    }),
    [yoctoRow(DEMO.pot, "deposit", 1n, false)],
    checksFor(leoVote.delegate, Number(leoVote.decoded.maxBlockHeight) - 200),
  )
  const s5 = leoVote.followUps[0]
  if (!s5) throw new Error("demo: the relayer's sync after Leo's approval is missing")
  const c5Sync = await syncTx(
    run,
    "c5.sync",
    s5,
    syncReceipts({ ids: IDS, tx: "c5.sync", realHash: SIM_TX_REAL["c5.sync"] as string, proposal: boatApproved, subject: "spend", hubStatus: "approved", events: new EventQueue(s5.events), eventNames: s5.events.map((e) => e.event) }),
    b.proposalId,
  )
  run.later(30)

  // ---------------------------------------------------------------- chapter 6: close, $22 back each
  const c6Before = await snapshot(chain, PEOPLE)
  const potBalance6 = BigInt(c6Before.balances[DEMO.pot]?.usdc ?? "0")
  const proposeClose = await run.send("c6.propose", "maya", { type: "propose_close", pot: DEMO.pot })
  const closePid = (proposeClose.res.result as { proposalId: number }).proposalId
  const contributions = (c6Before.pot?.members ?? []).map((m) => ({ account: m.account, contributed: BigInt(m.contributed) }))
  const pr = prorata(potBalance6, contributions, P.leo)
  if (!pr) throw new Error("demo: nothing to refund")
  const cKind = closeKind(DEMO.usdc, pr.payouts)
  const cDesc = closeDescription(potBalance6, pr.payouts.length)
  const cPrepay = closePrepay(DEMO.usdc, pr.payouts, 3)
  const payoutsJson = pr.payouts.map((x) => ({ account_id: x.account, amount: x.amount.toString() }))
  const closeFiled = await proposalJson(chain, closePid)
  const c6Propose = await delegateTx(
    run,
    proposeClose,
    proposeCloseReceipts({
      ids: IDS,
      tx: "c6.propose",
      realHash: SIM_TX_REAL["c6.propose"] as string,
      person: P.maya,
      args: proposeClose.args,
      balance: potBalance6,
      prepay: cPrepay,
      description: cDesc,
      kind: cKind,
      proposalId: closePid,
      payouts: payoutsJson,
      dust: pr.dust.toString(),
      dustTo: pr.dustTo,
      approvalsNeeded: approvalsNeeded(3),
      events: new EventQueue(proposeClose.res.events as MockEvent[]),
    }),
    [yoctoRow(DEMO.hub, "storage_prepay", cPrepay, false)],
    checksFor(proposeClose.delegate, Number(proposeClose.decoded.maxBlockHeight) - 200),
  )
  const mayaClose = await run.send("c6.maya_vote", "maya", { type: "vote", pot: DEMO.pot, proposalId: closePid, kind: cKind, action: "VoteApprove" })
  const closeOneOfTwo = await proposalJson(chain, closePid)
  const c6AfterMaya = await snapshot(chain, PEOPLE)
  const c6Maya = await delegateTx(
    run,
    mayaClose,
    voteReceipts({ ids: IDS, tx: "c6.maya_vote", realHash: SIM_TX_REAL["c6.maya_vote"] as string, person: P.maya, args: mayaClose.args, gas: mayaClose.delegate.delegate_action.actions[0].FunctionCall.gas, events: new EventQueue(mayaClose.res.events as MockEvent[]) }),
    [],
    checksFor(mayaClose.delegate, Number(mayaClose.decoded.maxBlockHeight) - 200),
  )
  run.later(10)
  const samClose = await run.send("c6.sam_vote", "sam", { type: "vote", pot: DEMO.pot, proposalId: closePid, kind: cKind, action: "VoteApprove" })
  const closeApproved = await proposalJson(chain, closePid)
  const c6After = await snapshot(chain, PEOPLE)
  const c6Sam = await delegateTx(
    run,
    samClose,
    voteReceipts({
      ids: IDS,
      tx: "c6.sam_vote",
      realHash: SIM_TX_REAL["c6.sam_vote"] as string,
      person: P.sam,
      args: samClose.args,
      gas: samClose.delegate.delegate_action.actions[0].FunctionCall.gas,
      payout: { kind: "close", payouts: pr.payouts.map((x) => ({ account: x.account, amount: x.amount.toString() })) },
      events: new EventQueue(samClose.res.events as MockEvent[]),
    }),
    [yoctoRow(DEMO.pot, "deposit", BigInt(pr.payouts.length), false)],
    checksFor(samClose.delegate, Number(samClose.decoded.maxBlockHeight) - 200),
  )
  const s6 = samClose.followUps[0]
  if (!s6) throw new Error("demo: the relayer's sync after Sam's approval is missing")
  const c6Sync = await syncTx(
    run,
    "c6.sync",
    s6,
    syncReceipts({ ids: IDS, tx: "c6.sync", realHash: SIM_TX_REAL["c6.sync"] as string, proposal: closeApproved, subject: "close", hubStatus: "closed", events: new EventQueue(s6.events), eventNames: s6.events.map((e) => e.event) }),
    closePid,
  )

  // ---------------------------------------------------------------- beats (§2, captions verbatim by key)
  const realFor = (n: ChapterN, interlude = false) => REAL_TXS.filter((r) => r.chapter === n && !!r.interlude === interlude).map((r) => ({ hash: r.hash, labelKey: r.labelKey }))
  const rows = (tx: string, from: number, to: number) => ({ tx, rows: Array.from({ length: to - from + 1 }, (_, i) => from + i) })
  const spend = (amount: bigint, category: "groceries" | "tickets", phase: Extract<AppScene, { scene: "spend" }>["phase"]): AppScene => ({ scene: "spend", amount: amount.toString(), category, phase })

  const c1: Chapter = {
    n: 1,
    personas: ["maya"],
    before: c1Before,
    after: c1After,
    beats: beats(1, [
      { pane: "app", actor: "maya", you: "maya", app: { scene: "create", step: 1 } },
      { pane: "app", actor: "maya", you: "maya", app: { scene: "create", step: 2 }, tap: true },
      { pane: "app", actor: "maya", you: "maya", app: { scene: "create", step: 2 } },
      { pane: "hood", actor: "maya", you: "maya", app: { scene: "create", step: 2 }, card: { type: "signed", tx: "c1.create" } },
      { pane: "hood", actor: "relayer", you: "maya", app: { scene: "create", step: 2 }, card: { type: "sent", tx: "c1.create" }, receipts: rows("c1.create", 1, 2) },
      { pane: "hood", actor: "hub", you: "maya", app: { scene: "create", step: 2 }, card: { type: "route", tx: "c1.create" }, cards: [note("no_keys")], receipts: rows("c1.create", 3, 3) },
      { pane: "hood", actor: "hub", you: "maya", app: { scene: "create", step: 2 }, card: { type: "route", tx: "c1.create" }, receipts: rows("c1.create", 4, 6) },
      { pane: "app", actor: "maya", you: "maya", app: { scene: "create", step: "share" }, card: { type: "note", key: "demo.interlude" } },
    ]),
    txs: [c1Tx],
    real: realFor(1),
    glossary: ["dao", "sputnik_dao", "pot_hub", "rulebot", "role", "policy", "threshold", "quorum", "delegate_action", "relayer", "transaction", "receipt", "callback", "gas", "deposit", "nonce", "max_block_height", "device_key", "ed25519", "invite_key", "account", "global_contract", "usdc"],
  }

  const c2: Chapter = {
    n: 2,
    personas: ["leo"],
    before: c2Before,
    after: c2After,
    beats: beats(2, [
      { pane: "app", actor: "leo", you: "leo", app: { scene: "invite_landing" }, tap: true },
      { pane: "app", actor: "leo", you: "leo", app: { scene: "invite_landing" } },
      { pane: "hood", actor: "leo", you: "leo", app: { scene: "invite_landing" }, card: { type: "invite", message: joinMessage(DEMO.pot, P.leo), publicKey: leoSig.invitePk, signature: leoSig.signature, param: invite.param } },
      { pane: "hood", actor: "leo", you: "leo", app: { scene: "invite_landing" }, card: { type: "signed", tx: "c2.join" } },
      { pane: "hood", actor: "relayer", you: "leo", app: { scene: "invite_landing" }, card: { type: "sent", tx: "c2.join" }, receipts: rows("c2.join", 1, 3) },
      { pane: "hood", actor: "hub", you: "leo", app: { scene: "invite_landing" }, card: { type: "proposal", id: leoJoinPid, at: "after", proposal: leoJoinProp, meter: meter(leoJoinProp, c2After, "decides") }, receipts: rows("c2.join", 4, 6) },
      { pane: "hood", actor: "hub", you: "leo", app: { scene: "invite_landing" }, card: { type: "state" }, receipts: rows("c2.join", 7, 8) },
      { pane: "app", actor: "leo", you: "leo", app: { scene: "youre_in" } },
    ]),
    txs: [c2Tx],
    real: realFor(2),
    glossary: ["invite_key", "ed25519", "delegate_action", "relayer", "pot_hub", "proposal", "rulebot", "role", "threshold", "receipt", "callback", "storage_prepay", "account", "gas"],
    interlude: { key: "demo.interlude", real: realFor(2, true) },
  }

  const c3: Chapter = {
    n: 3,
    personas: ["leo"],
    before: c3Before,
    after: c3After,
    beats: beats(3, [
      { pane: "app", actor: "leo", you: "leo", app: { scene: "add_money", phase: "form" }, tap: true },
      { pane: "app", actor: "leo", you: "leo", app: { scene: "add_money", phase: "adding" } },
      { pane: "hood", actor: "leo", you: "leo", app: { scene: "add_money", phase: "adding" }, card: { type: "signed", tx: "c3.add" } },
      { pane: "hood", actor: "relayer", you: "leo", app: { scene: "add_money", phase: "adding" }, card: { type: "sent", tx: "c3.add" } },
      { pane: "hood", actor: "usdc", you: "leo", app: { scene: "add_money", phase: "adding" }, card: { type: "route", tx: "c3.add" }, receipts: rows("c3.add", 1, 3) },
      { pane: "hood", actor: "hub", you: "leo", app: { scene: "add_money", phase: "added" }, card: { type: "route", tx: "c3.add" }, cards: [note("status_lies")], receipts: rows("c3.add", 4, 6) },
      { pane: "app", actor: "leo", you: "leo", app: { scene: "pot", highlight: "goal" } },
    ]),
    txs: [c3Tx],
    real: realFor(3),
    glossary: ["ft_transfer_call", "usdc", "yoctonear", "deposit", "delegate_action", "relayer", "pot_hub", "receipt", "callback", "gas"],
  }

  const rules4: RulesRow[] = [
    { check: "instant_cap", value: `${usd(micro(84))} ≤ ${usd(micro(100))}`, ok: true },
    { check: "member_budget", value: `${usd(0n)} + ${usd(micro(84))} ≤ ${usd(micro(200))}`, ok: true },
    { check: "instant_payees", value: "member", ok: true },
    { check: "contributed", value: usd(micro(150)), ok: true },
  ]
  const c4: Chapter = {
    n: 4,
    personas: ["maya"],
    before: c4Before,
    after: c4After,
    beats: beats(4, [
      { pane: "app", actor: "maya", you: "maya", app: spend(micro(84), "groceries", "form"), tap: true },
      { pane: "app", actor: "maya", you: "maya", app: spend(micro(84), "groceries", "checking") },
      { pane: "hood", actor: "maya", you: "maya", app: spend(micro(84), "groceries", "checking"), card: { type: "signed", tx: "c4.request" } },
      { pane: "hood", actor: "relayer", you: "maya", app: spend(micro(84), "groceries", "checking"), card: { type: "sent", tx: "c4.request" }, receipts: rows("c4.request", 1, 2) },
      { pane: "hood", actor: "hub", you: "maya", app: spend(micro(84), "groceries", "checking"), card: { type: "rules", rows: rules4, path: "instant", reason: "within_rules" }, receipts: rows("c4.request", 3, 6) },
      { pane: "hood", actor: "hub", you: "maya", app: spend(micro(84), "groceries", "checking"), card: { type: "proposal", id: g.proposalId, at: "before", proposal: filed(gProp), meter: meter(filed(gProp), c4After, "decides") }, receipts: rows("c4.request", 7, 8) },
      { pane: "app", actor: "hub", you: "maya", app: spend(micro(84), "groceries", "approved"), card: { type: "proposal", id: g.proposalId, at: "after", proposal: gProp, meter: meter(gProp, c4After, "decides") }, cards: [note("limits_in_hub")], receipts: rows("c4.request", 9, 9), celebrate: true },
      { pane: "hood", actor: "pot", you: "maya", app: spend(micro(84), "groceries", "approved"), card: { type: "route", tx: "c4.request" }, receipts: rows("c4.request", 10, 14) },
      { pane: "app", actor: "maya", you: "maya", app: spend(micro(84), "groceries", "sent"), card: { type: "balances" } },
    ]),
    txs: [c4Tx],
    real: realFor(4),
    glossary: ["dao", "proposal", "rulebot", "pot_hub", "threshold", "delegate_action", "relayer", "receipt", "callback", "storage_prepay", "gas"],
  }

  const rules5: RulesRow[] = [{ check: "instant_cap", value: `${usd(micro(300))} > ${usd(micro(100))}`, ok: false, decides: true }]
  const c5: Chapter = {
    n: 5,
    personas: ["maya", "leo"],
    before: c5Before,
    after: c5After,
    beats: beats(5, [
      { pane: "app", actor: "maya", you: "maya", app: spend(micro(300), "tickets", "form"), tap: true },
      { pane: "app", actor: "maya", you: "maya", app: spend(micro(300), "tickets", "checking") },
      {
        pane: "hood",
        actor: "hub",
        you: "maya",
        app: spend(micro(300), "tickets", "checking"),
        card: { type: "signed", tx: "c5.request" },
        cards: [
          { type: "rules", rows: rules5, path: "vote", reason: "over_cap" },
          { type: "proposal", id: b.proposalId, at: "after", proposal: boatFiled, meter: meter(boatFiled, c5AfterRequest, "outside_rules") },
        ],
        receipts: rows("c5.request", 1, 8),
      },
      { pane: "hood", actor: "maya", you: "maya", app: spend(micro(300), "tickets", "checking"), card: { type: "signed", tx: "c5.maya_vote" }, cards: [{ type: "proposal", id: b.proposalId, at: "after", proposal: boatOneOfTwo, meter: meter(boatOneOfTwo, c5AfterMaya, "outside_rules") }, note("exact_kind")], receipts: rows("c5.maya_vote", 1, 2) },
      { pane: "app", actor: "maya", you: "maya", app: spend(micro(300), "tickets", "sent_to_group") },
      { pane: "app", actor: "leo", you: "leo", appBefore: { scene: "push", text: "Maya needs your OK" }, app: { scene: "approve", requestId: b.requestId, phase: "form" }, tap: true },
      { pane: "app", actor: "leo", you: "leo", app: { scene: "approve", requestId: b.requestId, phase: "form" } },
      { pane: "hood", actor: "leo", you: "leo", app: { scene: "approve", requestId: b.requestId, phase: "form" }, card: { type: "signed", tx: "c5.leo_vote" }, cards: [{ type: "proposal", id: b.proposalId, at: "after", proposal: boatApproved, meter: meter(boatApproved, c5After, "outside_rules") }, note("payout_separate")], receipts: rows("c5.leo_vote", 1, 5) },
      { pane: "hood", actor: "relayer", you: "leo", app: { scene: "approve", requestId: b.requestId, phase: "done" }, card: { type: "sent", tx: "c5.sync" }, cards: [note("sync")], receipts: rows("c5.sync", 1, 3) },
      { pane: "app", actor: "leo", you: "leo", app: { scene: "approve", requestId: b.requestId, phase: "done" }, card: { type: "balances" } },
    ]),
    txs: [c5Request, c5Maya, c5Leo, c5Sync],
    real: realFor(5),
    glossary: ["dao", "proposal", "role", "threshold", "quorum", "rulebot", "sync", "delegate_action", "relayer", "receipt", "gas"],
  }

  const c6: Chapter = {
    n: 6,
    personas: ["maya", "sam"],
    before: c6Before,
    after: c6After,
    beats: beats(6, [
      { pane: "app", actor: "maya", you: "maya", app: { scene: "close", phase: "form" }, tap: true },
      { pane: "app", actor: "maya", you: "maya", app: { scene: "close", phase: "form" } },
      { pane: "hood", actor: "hub", you: "maya", app: { scene: "close", phase: "form" }, card: { type: "signed", tx: "c6.propose" }, cards: [note("busy")], receipts: rows("c6.propose", 1, 4) },
      { pane: "hood", actor: "hub", you: "maya", app: { scene: "close", phase: "form" }, card: { type: "proposal", id: closePid, at: "after", proposal: closeFiled, meter: meter(closeFiled, c6AfterMaya, "wrong_kind") }, receipts: rows("c6.propose", 5, 6) },
      { pane: "hood", actor: "maya", you: "maya", app: { scene: "close", phase: "form" }, card: { type: "signed", tx: "c6.maya_vote" }, cards: [{ type: "proposal", id: closePid, at: "after", proposal: closeOneOfTwo, meter: meter(closeOneOfTwo, c6AfterMaya, "wrong_kind") }], receipts: rows("c6.maya_vote", 1, 2) },
      { pane: "app", actor: "sam", you: "sam", appBefore: { scene: "push", text: "Maya wants to close Lisbon Trip" }, app: { scene: "close", phase: "approve" }, tap: true },
      { pane: "app", actor: "sam", you: "sam", app: { scene: "close", phase: "approve" } },
      { pane: "hood", actor: "pot", you: "sam", app: { scene: "close", phase: "approve" }, card: { type: "signed", tx: "c6.sam_vote" }, cards: [{ type: "proposal", id: closePid, at: "after", proposal: closeApproved, meter: meter(closeApproved, c6After, "wrong_kind") }, note("atomic")], receipts: rows("c6.sam_vote", 1, 5) },
      { pane: "hood", actor: "relayer", you: "sam", app: { scene: "close", phase: "closed" }, card: { type: "sent", tx: "c6.sync" }, cards: [{ type: "state" }], receipts: rows("c6.sync", 1, 3) },
      { pane: "app", actor: "sam", you: "sam", app: { scene: "close", phase: "closed" }, card: { type: "balances" }, cards: [note("after_close")] },
    ]),
    txs: [c6Propose, c6Maya, c6Sam, c6Sync],
    real: realFor(6),
    glossary: ["dao", "proposal", "pro_rata", "threshold", "sync", "delegate_action", "relayer", "receipt", "callback", "storage_prepay", "gas"],
  }

  const chapters = [c1, c2, c3, c4, c5, c6]
  return {
    version: 1,
    generatedWith: { sdk: DEMO.sdk, hubPrepayModel: PREPAY_MODEL },
    ids: { hub: DEMO.hub, usdc: DEMO.usdc, relayer: DEMO.relayer, faucet: DEMO.faucet, pot: DEMO.pot, people: { ...DEMO.people } },
    pot: { slug: DEMO_SLUG, name: DEMO.name, emoji: DEMO.emoji, preset: "trip", rules: { instantCap: micro(100).toString(), memberBudget: micro(200).toString(), instantPayees: "members" }, refs: { ...DEMO.refs }, memos: { ...DEMO.memos } },
    recap: recapOf(chapters),
    chapters,
  }
}

/** §2.7: computed from the chapters, never typed. */
export function recapOf(chapters: readonly Chapter[]): Recap {
  const decided: Record<ChapterN, Recap["rows"][number]["decidedBy"]> = { 1: "nobody", 2: "rulebot", 3: "nobody", 4: "rulebot", 5: "members", 6: "members" }
  const rows = chapters.map((c) => {
    const delegates = c.txs.filter((t) => t.kind === "delegate").length
    const inviteSignatures = c.beats.flatMap((b) => [b.card, ...(b.cards ?? [])]).filter((x) => x?.type === "invite").length
    return {
      n: c.n,
      signatures: delegates + inviteSignatures,
      delegates,
      inviteSignatures,
      transactions: c.txs.length,
      receipts: c.txs.reduce((t, x) => t + x.receipts.filter((r) => !r.refund).length, 0),
      decidedBy: decided[c.n],
      nearPaidByPeople: "0" as const,
    }
  })
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0)
  const txs = chapters.flatMap((c) => c.txs)
  return {
    rows,
    totals: {
      signatures: sum((r) => r.signatures),
      delegates: sum((r) => r.delegates),
      inviteSignatures: sum((r) => r.inviteSignatures),
      transactions: sum((r) => r.transactions),
      relayedDelegates: txs.filter((t) => t.kind === "delegate").length,
      relayerSyncs: txs.filter((t) => t.kind === "relayer").length,
      receipts: sum((r) => r.receipts),
      nearPaidByPeople: "0",
    },
  }
}

/** Stable text form (2-space JSON + trailing newline) for the committed file and the drift test. */
export const serializeDemoScript = (s: DemoScript): string => `${JSON.stringify(s, null, 2)}\n`
