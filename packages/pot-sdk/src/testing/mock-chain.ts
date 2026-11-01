// MockChain (F-03): an in-memory Pot hub + Sputnik DAOs + test USDC that implements ChainViews and
// executes CallSpecs the way the relayer + chain would. It mirrors the implemented contract
// (contracts/pot-hub/src: decide(), the §2.4 ledger, sync mapping, invite rules, close math,
// check order and ERR_ codes), Sputnik's vote math (kb/sputnik-dao.md R6-R8) and the relayer's
// static policy (api-spec §3.1 R1-R11). Chains of receipts run atomically; a call that panics
// changes nothing. The relayer's `sync` after votes and failed payouts runs automatically
// (autoSync), as D-05 Rev 2 / A8 specify.
//
// Not modelled: NEAR balances and storage (sponsorship, prepay, ERR_HUB_LOW_BALANCE,
// ERR_DEPOSIT_REQUIRED), gas burn (except the < 35 Tgas contribution bounce), the early
// two-phase request_spend answer (the mock returns one final answer), relayer quotas.

import type { SdkConfig } from "../config.ts"
import { daoIdFromSlug, slugFromDaoId, testnetConfig } from "../config.ts"
import { base58Encode, base64Decode } from "../encoding.ts"
import { ed25519VerifyWebCrypto, joinMessageBytes, publicKeyBytes } from "../invite.ts"
import { approvalsNeeded } from "../math/approvals.ts"
import { decideSpend } from "../math/decide.ts"
import { prorata } from "../math/prorata.ts"
import { MAX_AMOUNT, type Micro } from "../money.ts"
import { parseClosePreview, parseConfigView, parseInviteView, parseMemberView, parsePolicy, parsePotSummary, parsePotView, parseProposal, parseRequestView, parseRulesView, parseSpendPreview, parseSubjectView, parseActionsLogEntry } from "../read/parse.ts"
import type { AccessKeyInfo, ChainViews } from "../read/views.ts"
import { rulesFromRaw, rulesToRaw, presetRules, validateRules } from "../rules.ts"
import { closeDescription, closeKind, decodeActionCall, joinDescription, joinKind, kindLabel, kindsEqual, rulesDescription, rulesKind, spendDescription, transferKind } from "../actions/kinds.ts"
import { buildCall, intentFromWire } from "../actions/build.ts"
import { RELAY_POLICY, TGAS, voteGas } from "../actions/gas.ts"
import { RpcViewError } from "../read/rpc.ts"
import { decodeSignedDelegate, delegateHash } from "../sign/encode.ts"
import type { Err, PotEvent, Reason, RelayOk, RelayReq, RelayResult, FaucetRes } from "../types/api.ts"
import type { MockRelayBody } from "../types/signer.ts"
import type { ActionCall, DaoAction, Policy, ProposalKind, ProposalStatus, RawActionsLogEntry, RawProposal, RolePermission, Vote } from "../types/dao.ts"
import { HUB_LIMITS, RESERVED_SLUGS, type Category, type PresetId, type Rules } from "../types/hub.ts"
import type { RawClosePreview, RawConfigView, RawInviteView, RawMemberView, RawPath, RawPotSummary, RawPotView, RawReason, RawRequestStatus, RawRequestView, RawSpendPreview, RawSubjectView, RawRules, RawSpendOutcome } from "../types/hub-raw.ts"
import type { PublicKeyStr, Viewed } from "../types/ids.ts"
import type { ActionIntent, CallAction, CallSpec } from "../types/intents.ts"
import { errorCodeFromText, refusedCode } from "../types/errors.ts"
import { isValidEmoji, isValidPotName, isValidSlug, isOpKey } from "../validate.ts"

// ---------------------------------------------------------------- state

type MemberStatus = { kind: "active" } | { kind: "joining"; proposalId: number | null }
type Subject = { kind: "spend"; requestId: number } | { kind: "join"; member: string } | { kind: "close" } | { kind: "rules"; version: number }
type CloseStatus = "proposing" | "pending" | "approved" | "failed" | "rejected" | "expired"

interface MPot {
  idx: number
  seq: number
  slug: string
  name: string
  emoji: string | null
  preset: PresetId
  rules: Rules
  rulesVersion: number
  status: "open" | "closing" | "closed"
  closingProposalId: number | null
  creator: string
  createdAtMs: number
  closedAtMs: number
  closingUntilMs: number
  busyUntilMs: number
  memberCount: number
  joiningCount: number
  nextJoinIndex: number
  requestSeq: number
  activeInvites: number
  invitesTotal: number
  unpaidApproved: number
  openRequests: number
  totalContributed: bigint
  spentInstant: bigint
  spentVote: bigint
  reserved: bigint
  lastContributor: string | null
  float: bigint
  openRulesProposal: number | null
}

interface MMember {
  account: string
  joinIndex: number
  status: MemberStatus
  joinedAtMs: number
  invitePk: string | null
  contributed: bigint
  instantUsed: bigint
  spent: bigint
  pendingVotes: number
}

interface MRequest {
  id: number
  requester: string
  receiver: string
  amount: bigint
  category: Category
  requestRef: string
  path: RawPath
  reason: RawReason
  status: RawRequestStatus
  proposalId: number | null
  createdAtMs: number
  updatedAtMs: number
}

interface MInvite {
  createdBy: string
  createdAtMs: number
  expiresAtMs: number
  maxUses: number
  uses: number
  revokedAtMs: number | null
}

interface MClose {
  proposalId: number | null
  status: CloseStatus
  balance: bigint
  payouts: { account: string; amount: bigint }[]
  dust: bigint
  dustTo: string
  proposedBy: string
  createdAtMs: number
}

interface MDao {
  config: { name: string; purpose: string; metadata: string }
  policy: Policy
  proposals: Map<number, RawProposal>
  lastProposalId: number
  actionsLog: RawActionsLogEntry[]
}

interface MockState {
  now: number
  height: number
  paused: boolean
  potCount: number
  txCounter: number
  pots: Map<string, MPot>
  members: Map<string, MMember[]>
  requests: Map<string, Map<number, MRequest>>
  subjects: Map<string, Map<number, Subject>>
  invites: Map<string, Map<string, MInvite>>
  closes: Map<string, MClose>
  daos: Map<string, MDao>
  potsOf: Map<string, string[]>
  creatorDaily: Map<string, { day: number; count: number }>
  balances: Map<string, bigint>
  registered: Set<string>
  keys: Map<string, Map<string, { nonce: bigint; fullAccess: boolean }>>
  log: MockTxRecord[]
}

/** One executed relay (for tests and debugging). */
export interface MockTxRecord {
  txHash: string
  sender: string
  receiverId: string
  methods: string[]
  outcome: "success" | "inner_failed"
  errorCode?: string
  events: PotEvent[]
  blockHeight: number
}

export interface MockChainOptions {
  cfg?: SdkConfig
  /** ms; default 1793001000000 (2026-10-26) */
  startMs?: number
  startHeight?: number
  msPerBlock?: number
  /** Run hub.sync after every relayed vote and failed payout (the relayer's job). Default true. */
  autoSync?: boolean
  /** Apply the relayer's static policy (receivers, methods, deposits, gas, R11 pre-flight). Default true. */
  enforceRelayPolicy?: boolean
  /** Join signature check; default WebCrypto Ed25519 (Node ≥ 22, modern browsers). */
  verifyJoinSignature?: (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean | Promise<boolean>
  limits?: Partial<{ maxMembers: number; maxPotsPerCreatorPerDay: number; maxPotsPerAccount: number; maxActiveInvites: number; maxInvitesTotal: number; maxPendingPerMember: number; maxRequestsPerPot: number }>
}

const DAY_MS = 86_400_000
const NS = 1_000_000n
const PERIOD_NS = 604_800_000_000_000n
const BUSY_WINDOW_MS = 60_000
const FLOAT_YOCTO = 50_000_000_000_000_000_000_000n

/** A contract panic inside a receipt (the relay still returns 200 with outcome inner_failed). */
class Panic extends Error {
  code: string
  constructor(code: string, text?: string) {
    super(text ?? `Smart contract panicked: ${code}`)
    this.code = code
  }
}
const fail = (code: string): never => {
  throw new Panic(code)
}
const check = (cond: boolean, code: string): void => {
  if (!cond) fail(code)
}

/** A relayer 4xx: nothing reached the chain. */
class Rejected extends Error {
  reason: Reason
  detail?: Record<string, unknown>
  constructor(reason: Reason, detail?: Record<string, unknown>) {
    super(reason)
    this.reason = reason
    this.detail = detail
  }
}

/** Per-relay execution context: events, block accounting. */
class Exec {
  events: PotEvent[] = []
  payout: "sent" | "failed" | undefined
  private n = 0
  private readonly chain: MockChain
  constructor(chain: MockChain) {
    this.chain = chain
  }
  hop(blocks = 1): void {
    this.chain.advanceBlocks(blocks)
  }
  hub(event: string, data: unknown): void {
    this.events.push({ standard: "pot", version: "1.0.0", event, data, executor: this.chain.cfg.hubId, receiptId: `rc_${this.chain.height()}_${this.n++}` })
  }
  ft(from: string, to: string, amount: bigint, memo?: string): void {
    const d: Record<string, unknown> = { old_owner_id: from, new_owner_id: to, amount: amount.toString() }
    if (memo) d.memo = memo
    this.events.push({ standard: "nep141", version: "1.0.0", event: "ft_transfer", data: [d], executor: this.chain.cfg.usdcId, receiptId: `rc_${this.chain.height()}_${this.n++}` })
  }
}

// ---------------------------------------------------------------- ledger (contracts-spec §2.4)

interface Contrib {
  instantUsed: bigint
  reserved: bigint
  spentInstant: bigint
  spentVote: bigint
  memberSpent: bigint
  pendingVotes: number
  unpaid: number
  open: number
}
function contrib(state: [RawPath, RawRequestStatus] | null, amount: bigint): Contrib {
  const c: Contrib = { instantUsed: 0n, reserved: 0n, spentInstant: 0n, spentVote: 0n, memberSpent: 0n, pendingVotes: 0, unpaid: 0, open: 0 }
  if (!state) return c
  const [path, s] = state
  if (path === "instant") {
    if (["checking", "proposing", "approving", "approved", "payout_failed"].includes(s)) c.instantUsed = amount
    if (["checking", "proposing", "approving", "payout_failed"].includes(s)) c.reserved = amount
    if (s === "approved") c.spentInstant = amount
  } else {
    if (s === "approved") c.spentVote = amount
    if (["checking", "proposing", "pending"].includes(s)) {
      c.pendingVotes = 1
      c.open = 1
    }
  }
  if (s === "approved") c.memberSpent = amount
  if (s === "payout_failed") c.unpaid = 1
  return c
}
function applyTransition(p: MPot, m: MMember, amount: bigint, from: [RawPath, RawRequestStatus] | null, to: [RawPath, RawRequestStatus] | null): void {
  const o = contrib(from, amount)
  const n = contrib(to, amount)
  m.instantUsed += n.instantUsed - o.instantUsed
  p.reserved += n.reserved - o.reserved
  p.spentInstant += n.spentInstant - o.spentInstant
  p.spentVote += n.spentVote - o.spentVote
  m.spent += n.memberSpent - o.memberSpent
  m.pendingVotes += n.pendingVotes - o.pendingVotes
  p.unpaidApproved += n.unpaid - o.unpaid
  p.openRequests += n.open - o.open
}

// ---------------------------------------------------------------- the chain

export class MockChain implements ChainViews {
  readonly cfg: SdkConfig
  readonly relayerId: string
  private s: MockState
  private readonly opts: Required<Pick<MockChainOptions, "msPerBlock" | "autoSync" | "enforceRelayPolicy">> & Pick<MockChainOptions, "verifyJoinSignature">
  private readonly limits: Required<NonNullable<MockChainOptions["limits"]>>

  constructor(opts: MockChainOptions = {}) {
    this.cfg = opts.cfg ?? testnetConfig("potapp")
    this.relayerId = `users.${this.cfg.hubId.replace(/^pots\./, "")}`
    this.opts = {
      msPerBlock: opts.msPerBlock ?? 600,
      autoSync: opts.autoSync ?? true,
      enforceRelayPolicy: opts.enforceRelayPolicy ?? true,
      verifyJoinSignature: opts.verifyJoinSignature,
    }
    this.limits = {
      maxMembers: 40,
      maxPotsPerCreatorPerDay: 3,
      maxPotsPerAccount: 100,
      maxActiveInvites: 20,
      maxInvitesTotal: 100,
      maxPendingPerMember: 10,
      maxRequestsPerPot: 1000,
      ...opts.limits,
    }
    this.s = {
      now: opts.startMs ?? 1_793_001_000_000,
      height: opts.startHeight ?? 250_000_000,
      paused: false,
      potCount: 0,
      txCounter: 0,
      pots: new Map(),
      members: new Map(),
      requests: new Map(),
      subjects: new Map(),
      invites: new Map(),
      closes: new Map(),
      daos: new Map(),
      potsOf: new Map(),
      creatorDaily: new Map(),
      balances: new Map(),
      registered: new Set([this.cfg.hubId]),
      keys: new Map(),
      log: [],
    }
    MockChain.__views(this)
  }

  /** A deep, independent copy (fixtures build once and clone per use). */
  clone(): MockChain {
    const c = Object.create(MockChain.prototype) as MockChain
    Object.assign(c, this)
    const w = c as unknown as { s: MockState; opts: MockChain["opts"]; limits: MockChain["limits"] }
    w.s = structuredClone(this.s)
    w.opts = { ...this.opts }
    w.limits = { ...this.limits }
    MockChain.__views(c)
    return c
  }

  // ------------------------------------------------------------ clock + test controls

  now(): number {
    return this.s.now
  }
  height(): number {
    return this.s.height
  }
  advanceBlocks(n: number): void {
    this.s.height += n
    this.s.now += n * this.opts.msPerBlock
  }
  /** Moves the clock (and block height, at msPerBlock). */
  advanceTime(ms: number): void {
    this.s.now += ms
    this.s.height += Math.max(1, Math.floor(ms / this.opts.msPerBlock))
  }
  setPaused(paused: boolean): void {
    this.s.paused = paused
  }
  /** Turn the relayer's static policy / pre-flight on or off (off = reach the contracts' own panics). */
  setRelayPolicy(enabled: boolean): void {
    this.opts.enforceRelayPolicy = enabled
  }
  /** Creates an account with a full-access key (as onboarding does). */
  createAccount(account: string, publicKey?: PublicKeyStr, opts: { registerUsdc?: boolean } = {}): void {
    if (!this.s.keys.has(account)) this.s.keys.set(account, new Map())
    if (publicKey) this.s.keys.get(account)?.set(publicKey, { nonce: BigInt(this.s.height) * 1_000_000n, fullAccess: true })
    if (opts.registerUsdc ?? true) this.s.registered.add(account)
  }
  registerUsdc(account: string): void {
    this.s.registered.add(account)
  }
  /** storage_unregister (used to simulate payout failures). Burns any balance like force=true would. */
  unregisterUsdc(account: string): void {
    this.s.registered.delete(account)
    this.s.balances.delete(account)
  }
  /** Mints test USDC to an account (the treasury faucet). Registers it if needed. */
  fund(account: string, amount: Micro): void {
    this.s.registered.add(account)
    this.s.balances.set(account, (this.s.balances.get(account) ?? 0n) + amount)
  }
  /** POST /api/faucet as the mock serves it. */
  faucet(account: string, amount: Micro = 150_000_000n): FaucetRes {
    const registeredNow = !this.s.registered.has(account)
    this.fund(account, amount)
    this.advanceBlocks(3)
    return { ok: true, requestId: this.nextId("req"), txHash: this.nextTxHash(), amount: amount.toString(), registeredNow, executedAtBlock: this.s.height }
  }
  balanceOf(account: string): Micro {
    return this.s.balances.get(account) ?? 0n
  }
  /** Every executed relay, oldest first. */
  get txLog(): readonly MockTxRecord[] {
    return this.s.log
  }
  /** Every event ever emitted (incl. the auto-sync ones that a real relay wouldn't return). */
  get eventLog(): PotEvent[] {
    return this.s.log.flatMap((t) => t.events)
  }

  // ------------------------------------------------------------ relay entry points

  /** What POST /api/relay returns for a delegate from `sender` carrying `call`. */
  async relay(sender: string, call: CallSpec): Promise<RelayOk | Err> {
    const requestId = this.nextId("req")
    try {
      if (this.opts.enforceRelayPolicy) this.checkPolicy(sender, call)
    } catch (e) {
      if (e instanceof Rejected) return { ok: false, requestId, reason: e.reason, detail: e.detail }
      throw e
    }
    const snapshot = structuredClone(this.s)
    const ex = new Exec(this)
    ex.hop(2) // relayer tx + delegate receipt
    let result: RelayResult
    let error: string | undefined
    let errorCode: string | undefined
    let after: (() => void) | undefined
    try {
      const r = await this.execute(sender, call, ex)
      result = r.result
      errorCode = r.errorCode
      error = r.error
      after = r.after
    } catch (e) {
      if (!(e instanceof Panic)) throw e
      // A synchronous panic reverts everything the call did (blocks still pass).
      const h = this.s.height
      const t = this.s.now
      this.s = snapshot
      this.s.height = h
      this.s.now = t
      ex.events = []
      error = e.message
      errorCode = errorCodeFromText(e.message)
      result = this.failedResult(sender, call)
    }
    const txHash = this.nextTxHash()
    const ok: RelayOk = {
      ok: true,
      requestId,
      relayId: this.nextId("rl"),
      txHash,
      receiptUrl: `${this.cfg.explorerUrl}/txns/${txHash}`,
      outcome: errorCode ? "inner_failed" : "success",
      events: ex.events,
      executedAtBlock: this.s.height,
      result,
      final: true,
    }
    if (errorCode) {
      ok.error = error
      ok.errorCode = errorCode
    }
    this.s.log.push({
      txHash,
      sender,
      receiverId: call.receiverId,
      methods: call.actions.map((a) => (a.type === "FunctionCall" ? a.method : a.type)),
      outcome: ok.outcome,
      errorCode,
      events: ex.events,
      blockHeight: this.s.height,
    })
    // The relayer's follow-ups (sync) run after the response, as separate txs.
    if (after) after()
    return ok
  }

  /** buildCall + relay. */
  relayIntent(sender: string, intent: ActionIntent): Promise<RelayOk | Err> {
    return this.relay(sender, buildCall(intent, this.cfg))
  }

  /** A MockSigner body ({mock: {intent}}) for `sessionAccount`: built and executed like a relayed call. */
  handleMockBody(sessionAccount: string, body: MockRelayBody): Promise<RelayOk | Err> {
    return this.relayIntent(sessionAccount, intentFromWire(body.mock.intent))
  }

  /**
   * Handles a POST /api/relay body for `sessionAccount`: a signed delegate (decoded, signature-checked
   * with WebCrypto, nonce/expiry/key checked).
   */
  async handleRelayBody(sessionAccount: string, body: RelayReq): Promise<RelayOk | Err> {
    const requestId = this.nextId("req")
    const rej = (reason: Reason, detail?: Record<string, unknown>): Err => ({ ok: false, requestId, reason, detail })
    let d
    try {
      d = decodeSignedDelegate(body.signedDelegate)
    } catch {
      return rej("bad_request")
    }
    if (d.senderId !== sessionAccount) return rej("sender_mismatch")
    const pk = await ed25519VerifyWebCrypto(publicKeyBytes(d.publicKey), await delegateHash(d.delegateActionBytes), d.signature.data)
    if (!pk) return rej("bad_signature")
    const head = BigInt(this.s.height)
    if (d.maxBlockHeight <= head + 10n) return rej("expired")
    if (d.maxBlockHeight > head + 600n) return rej("ttl_too_long")
    const key = this.s.keys.get(d.senderId)?.get(d.publicKey)
    if (!key) return rej("key_not_found")
    if (d.nonce <= key.nonce) return rej("nonce_used")
    const call: CallSpec = {
      receiverId: d.receiverId,
      actions: d.actions.map((a): CallAction => {
        if (a.type === "FunctionCall") return { type: "FunctionCall", method: a.method, args: (a.argsJson ?? {}) as Record<string, unknown>, gas: a.gas, deposit: a.deposit }
        if (a.type === "AddKey" && a.accessKey.permission === "FullAccess") return { type: "AddKey", publicKey: a.publicKey as PublicKeyStr, access: "FullAccess" }
        throw new Rejected("action_not_allowed")
      }),
    }
    if (body.intent === "request_spend" && body.requestRef !== (call.actions[0] as { args?: { request_ref?: string } }).args?.request_ref) return rej("args_invalid", { field: "requestRef" })
    key.nonce = d.nonce
    return this.relay(sessionAccount, call)
  }

  // ------------------------------------------------------------ relayer static policy (api-spec §3.1)

  private checkPolicy(sender: string, call: CallSpec): void {
    const { hubId, usdcId } = this.cfg
    const acts = call.actions
    if (acts.length === 0) throw new Rejected("action_not_allowed")
    if (call.receiverId === sender) {
      if (acts.length !== 1 || acts[0]?.type !== "AddKey") throw new Rejected("action_not_allowed")
      return
    }
    if (acts.some((a) => a.type !== "FunctionCall")) throw new Rejected("action_not_allowed")
    const fcs = acts as Extract<CallAction, { type: "FunctionCall" }>[]
    const methods = fcs.map((a) => a.method)
    const isRotate = fcs.length === 2 && methods[0] === "revoke_invite" && methods[1] === "add_invite" && fcs[0]?.args.pot === fcs[1]?.args.pot
    if (fcs.length !== 1 && !isRotate) throw new Rejected("action_not_allowed")
    const rcv = call.receiverId
    const kind: "usdc" | "hub" | "dao" | null = rcv === usdcId ? "usdc" : rcv === hubId ? "hub" : slugFromDaoId(rcv, hubId) && this.s.pots.has(rcv) ? "dao" : null
    if (!kind) throw new Rejected("receiver_not_allowed")
    for (const a of fcs) {
      const rule = RELAY_POLICY[a.method]
      if (!rule || rule.receiver !== kind || a.method === "withdraw_request") throw new Rejected("method_not_allowed")
      if (a.deposit !== rule.deposit) throw new Rejected("deposit_cap")
      const g = a.gas
      if (a.method === "act_proposal") {
        const pid = Number(a.args.id)
        const prop = this.s.daos.get(rcv)?.proposals.get(pid)
        if (!prop) throw new Rejected("not_found")
        if (g !== voteGas(prop.kind)) throw new Rejected("gas_cap", { min: Number(voteGas(prop.kind) / TGAS), max: Number(voteGas(prop.kind) / TGAS) })
        if (!["VoteApprove", "VoteReject", "Finalize"].includes(String(a.args.action))) throw new Rejected("args_invalid", { field: "action" })
        if ("memo" in a.args) throw new Rejected("args_invalid", { field: "memo" })
        if (!kindsEqual(a.args.proposal as ProposalKind, prop.kind)) throw new Rejected("args_invalid", { field: "proposal" })
        const subj = this.subjectView(rcv, pid)
        if (!subj || !subj.live) throw new Rejected("proposal_not_tracked")
        if (!this.activeMember(rcv, sender)) throw new Rejected("not_a_member")
        const expired = BigInt(prop.submission_time) + PERIOD_NS < BigInt(this.s.now) * NS
        if (a.args.action === "Finalize") {
          if (!(prop.status === "Failed" || (prop.status === "InProgress" && expired))) throw new Rejected("proposal_not_open", { status: prop.status, expired })
        } else {
          if (prop.status !== "InProgress" || expired) throw new Rejected("proposal_not_open", { status: prop.status, expired })
          if (prop.votes[sender]) throw new Rejected("already_voted")
        }
        continue
      }
      if (g < BigInt(rule.gasMinTgas) * TGAS || g > BigInt(rule.gasMaxTgas) * TGAS) throw new Rejected("gas_cap", { min: rule.gasMinTgas, max: rule.gasMaxTgas })
      if (a.method === "ft_transfer_call") {
        if (a.args.receiver_id !== hubId) throw new Rejected("args_invalid", { field: "receiver_id" })
        if ("memo" in a.args && a.args.memo != null) throw new Rejected("args_invalid", { field: "memo" })
        let pot: unknown
        try {
          pot = (JSON.parse(String(a.args.msg)) as { pot?: unknown }).pot
        } catch {
          throw new Rejected("args_invalid", { field: "msg" })
        }
        this.requireKnownOpen(String(pot))
        continue
      }
      if (a.method === "create_pot") {
        if (this.s.pots.has(daoIdFromSlug(String(a.args.slug), hubId))) throw new Rejected("slug_taken")
        continue
      }
      if (a.method === "request_spend" && !isOpKey(String(a.args.request_ref))) throw new Rejected("args_invalid", { field: "request_ref" })
      const pot = String(a.args.pot)
      if (["request_spend", "join", "set_rules", "propose_rules", "propose_close", "add_invite"].includes(a.method)) this.requireKnownOpen(pot)
      else if (!this.s.pots.has(pot)) throw new Rejected("pot_unknown")
    }
  }

  private requireKnownOpen(pot: string): void {
    const p = this.s.pots.get(pot)
    if (!p) throw new Rejected("pot_unknown")
    if (p.status !== "open") throw new Rejected("pot_closed", { status: p.status })
  }

  // ------------------------------------------------------------ dispatch

  private async execute(sender: string, call: CallSpec, ex: Exec): Promise<{ result: RelayResult; errorCode?: string; error?: string; after?: () => void }> {
    const { hubId, usdcId } = this.cfg
    if (call.receiverId === sender) {
      for (const a of call.actions) {
        if (a.type !== "AddKey") fail("BAD_CALL")
        else this.createAccount(sender, a.publicKey, { registerUsdc: this.s.registered.has(sender) })
      }
      ex.hop()
      return { result: { type: "maintenance", proposalId: 0 } }
    }
    const fcs = call.actions as Extract<CallAction, { type: "FunctionCall" }>[]
    if (call.receiverId === usdcId) {
      const a = fcs[0] as Extract<CallAction, { type: "FunctionCall" }>
      if (a.method !== "ft_transfer_call") fail("BAD_CALL")
      return this.ftTransferCall(sender, a, ex)
    }
    if (call.receiverId === hubId) {
      let last: { result: RelayResult; errorCode?: string; error?: string; after?: () => void } = { result: { type: "maintenance", proposalId: 0 } }
      const invite: { added?: PublicKeyStr; revoked?: PublicKeyStr } = {}
      for (const a of fcs) {
        last = await this.hubCall(sender, a, ex)
        if (last.result.type === "invite") Object.assign(invite, last.result)
      }
      if (last.result.type === "invite") last.result = { type: "invite", ...invite }
      return last
    }
    if (this.s.daos.has(call.receiverId)) {
      const a = fcs[0] as Extract<CallAction, { type: "FunctionCall" }>
      if (a.method !== "act_proposal") fail("BAD_CALL")
      return this.memberAct(sender, call.receiverId, a, ex)
    }
    throw new Panic("BAD_CALL", `account ${call.receiverId} does not exist`)
  }

  private failedResult(sender: string, call: CallSpec): RelayResult {
    const a = call.actions[0]
    if (!a || a.type !== "FunctionCall") return { type: "maintenance", proposalId: 0 }
    const args = a.args as Record<string, unknown>
    switch (a.method) {
      case "ft_transfer_call":
        return { type: "contribution", recorded: false, amount: String(args.amount), usedAmount: "0" }
      case "request_spend":
        return { type: "spend", requestId: -1, path: "vote", proposalId: null }
      case "act_proposal": {
        const prop = this.s.daos.get(call.receiverId)?.proposals.get(Number(args.id))
        return { type: "vote", proposalId: Number(args.id), action: args.action as "VoteApprove", proposalStatus: (prop?.status ?? "InProgress") as "InProgress" }
      }
      case "join":
        return { type: "join", member: sender, status: "pending" }
      case "create_pot":
        return { type: "create_pot", potId: daoIdFromSlug(String(args.slug), this.cfg.hubId), slug: String(args.slug) }
      case "set_rules":
      case "propose_rules":
        return { type: "rules", applied: false }
      case "propose_close":
        return { type: "close", proposalId: -1 }
      case "add_invite":
      case "revoke_invite":
        return { type: "invite" }
      default:
        return { type: "maintenance", proposalId: Number(args.proposal_id ?? 0) }
    }
  }

  // ------------------------------------------------------------ helpers

  private nextId(prefix: string): string {
    this.s.txCounter++
    return `${prefix}_mock${this.s.txCounter.toString().padStart(6, "0")}`
  }
  private nextTxHash(): string {
    this.s.txCounter++
    const b = new Uint8Array(32)
    let x = this.s.txCounter * 2654435761
    for (let i = 0; i < 32; i++) {
      x = (x * 1103515245 + 12345) >>> 0
      b[i] = x & 0xff
    }
    return base58Encode(b)
  }
  private pot(dao: string): MPot {
    const p = this.s.pots.get(dao)
    if (!p) return fail("ERR_POT_NOT_FOUND")
    return p
  }
  private isOpen(p: MPot): boolean {
    return p.status === "open" && p.closingUntilMs <= this.s.now
  }
  private member(dao: string, account: string): MMember | undefined {
    return this.s.members.get(dao)?.find((m) => m.account === account)
  }
  private activeMember(dao: string, account: string): MMember | undefined {
    const m = this.member(dao, account)
    return m && m.status.kind === "active" ? m : undefined
  }
  private save(p: MPot): void {
    p.seq++
  }
  private day(): number {
    return Math.floor(this.s.now / DAY_MS)
  }
  private transfer(from: string, to: string, amount: bigint, ex: Exec, memo?: string): boolean {
    const bal = this.s.balances.get(from) ?? 0n
    if (!this.s.registered.has(to) || bal < amount || amount <= 0n) return false
    this.s.balances.set(from, bal - amount)
    this.s.balances.set(to, (this.s.balances.get(to) ?? 0n) + amount)
    ex.ft(from, to, amount, memo)
    return true
  }
  private contributions(dao: string): { account: string; contributed: bigint }[] {
    return (this.s.members.get(dao) ?? []).filter((m) => m.status.kind === "active").map((m) => ({ account: m.account, contributed: m.contributed }))
  }
  private balanceEstimate(p: MPot): bigint {
    const b = p.totalContributed - p.spentInstant - p.spentVote
    return b > 0n ? b : 0n
  }
  private transition(dao: string, p: MPot, r: MRequest, to: [RawPath, RawRequestStatus] | null): void {
    const m = this.member(dao, r.requester)
    if (!m) throw new Error("mock: requester missing")
    applyTransition(p, m, r.amount, [r.path, r.status], to)
    if (to) {
      r.path = to[0]
      r.status = to[1]
      r.updatedAtMs = this.s.now
    } else this.s.requests.get(dao)?.delete(r.id)
  }

  // ------------------------------------------------------------ Sputnik DAO

  private newDao(dao: string, name: string, preset: string, creator: string): void {
    const hub = this.cfg.hubId
    this.s.daos.set(dao, {
      config: { name, purpose: `Pot group fund (${preset}). Rules enforced by ${hub}`, metadata: "" },
      policy: {
        roles: [
          { name: "member", kind: { Group: [creator] }, permissions: ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"], vote_policy: {} },
          {
            name: "rulebot",
            kind: { Group: [hub] },
            permissions: ["transfer:AddProposal", "transfer:VoteApprove", "transfer:Finalize", "add_member_to_role:AddProposal", "add_member_to_role:VoteApprove", "call:AddProposal"],
            vote_policy: {
              transfer: { weight_kind: "RoleWeight", quorum: "1", threshold: [1, 1] },
              add_member_to_role: { weight_kind: "RoleWeight", quorum: "1", threshold: [1, 1] },
            },
          },
        ],
        default_vote_policy: { weight_kind: "RoleWeight", quorum: "1", threshold: [1, 2] },
        proposal_bond: "0",
        proposal_period: PERIOD_NS.toString(),
        bounty_bond: "0",
        bounty_forgiveness_period: "86400000000000",
      },
      proposals: new Map(),
      lastProposalId: 0,
      actionsLog: [],
    })
  }

  private rolesFor(dao: MDao, account: string, label: string, action: DaoAction): RolePermission[] {
    return dao.policy.roles.filter((r) => {
      const inRole = r.kind === "Everyone" || (typeof r.kind === "object" && "Group" in r.kind && r.kind.Group.includes(account))
      if (!inRole) return false
      return r.permissions.some((p) => p === `${label}:${action}` || p === `${label}:*` || p === `*:${action}` || p === "*:*")
    })
  }

  private addProposal(daoId: string, proposer: string, description: string, kind: ProposalKind, ex: Exec): number {
    const dao = this.s.daos.get(daoId)
    if (!dao) return fail("BAD_CALL")
    const label = kindLabel(kind)
    if (this.rolesFor(dao, proposer, label, "AddProposal").length === 0) fail("ERR_PERMISSION_DENIED")
    ex.hop()
    const id = dao.lastProposalId++
    dao.proposals.set(id, {
      id,
      proposer,
      description,
      kind: structuredClone(kind),
      status: "InProgress",
      vote_counts: {},
      votes: {},
      submission_time: (BigInt(this.s.now) * NS).toString(),
    })
    dao.actionsLog.push({ account_id: proposer, proposal_id: String(id), action: "AddProposal", block_height: String(this.s.height) })
    if (dao.actionsLog.length > 20) dao.actionsLog.shift()
    return id
  }

  /** Sputnik act_proposal (kb/sputnik-dao.md R6/R7). Throws Panic like the DAO would. */
  private actProposal(daoId: string, account: string, id: number, action: DaoAction, kindArg: ProposalKind, ex: Exec): RawProposal {
    const dao = this.s.daos.get(daoId)
    if (!dao) return fail("BAD_CALL")
    const prop = dao.proposals.get(id)
    if (!prop) return fail("ERR_NO_PROPOSAL")
    const label = kindLabel(prop.kind)
    const roles = this.rolesFor(dao, account, label, action)
    if (roles.length === 0) fail("ERR_PERMISSION_DENIED")
    if (!kindsEqual(kindArg, prop.kind)) fail("ERR_WRONG_KIND")
    ex.hop()
    const expired = BigInt(prop.submission_time) + PERIOD_NS < BigInt(this.s.now) * NS
    if (action === "VoteApprove" || action === "VoteReject" || action === "VoteRemove") {
      if (prop.status !== "InProgress") fail("ERR_PROPOSAL_NOT_READY_FOR_VOTE")
      if (prop.votes[account]) fail("ERR_ALREADY_VOTED")
      const vote: Vote = action === "VoteApprove" ? "Approve" : action === "VoteReject" ? "Reject" : "Remove"
      const idx = vote === "Approve" ? 0 : vote === "Reject" ? 1 : 2
      prop.votes[account] = vote
      for (const r of roles) {
        const c = (prop.vote_counts[r.name] ?? ["0", "0", "0"]).map((x) => Number(x))
        c[idx] = (c[idx] as number) + 1
        prop.vote_counts[r.name] = [String(c[0]), String(c[1]), String(c[2])]
      }
      if (expired) prop.status = "Expired"
      else {
        const st = this.statusOver(dao, prop, roles)
        if (st) prop.status = st
      }
      if (prop.status === "Approved") this.executeProposal(daoId, prop, ex)
    } else if (action === "Finalize") {
      if (prop.status !== "InProgress" && prop.status !== "Failed") fail("ERR_PROPOSAL_NOT_IN_PROGRESS")
      if (expired) prop.status = "Expired"
      else {
        const st = this.statusOver(dao, prop, dao.policy.roles)
        if (st === "Approved") {
          prop.status = "Approved"
          this.executeProposal(daoId, prop, ex)
        } else fail("ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED")
      }
    } else fail("ERR_WRONG_ACTION")
    dao.actionsLog.push({ account_id: account, proposal_id: String(id), action, block_height: String(this.s.height) })
    if (dao.actionsLog.length > 20) dao.actionsLog.shift()
    return prop
  }

  private statusOver(dao: MDao, prop: RawProposal, roles: RolePermission[]): ProposalStatus | null {
    const label = kindLabel(prop.kind)
    for (const r of roles) {
      if (r.kind === "Everyone" || !(typeof r.kind === "object" && "Group" in r.kind)) continue
      const n = r.kind.Group.length
      const vp = r.vote_policy[label] ?? dao.policy.default_vote_policy
      const th = approvalsNeeded(n, Array.isArray(vp.threshold) ? [vp.threshold[0], vp.threshold[1]] : Number(vp.threshold), Number(vp.quorum))
      const c = (prop.vote_counts[r.name] ?? ["0", "0", "0"]).map((x) => Number(x))
      if ((c[0] as number) >= th) return "Approved"
      if ((c[1] as number) >= th) return "Rejected"
      if ((c[2] as number) >= th) return "Removed"
    }
    return null
  }

  /** Executes an Approved proposal; a failed payout sets Failed (detached promise semantics). */
  private executeProposal(daoId: string, prop: RawProposal, ex: Exec): void {
    const k = prop.kind as Record<string, Record<string, unknown>>
    ex.hop()
    if (k.Transfer) {
      const t = k.Transfer as { token_id: string; receiver_id: string; amount: string }
      const ok = t.token_id === this.cfg.usdcId && this.transfer(daoId, t.receiver_id, BigInt(t.amount), ex, prop.description)
      ex.hop(2)
      if (!ok) prop.status = "Failed"
      ex.payout = ok ? "sent" : "failed"
      return
    }
    if (k.AddMemberToRole) {
      const a = k.AddMemberToRole as { member_id: string; role: string }
      const role = this.s.daos.get(daoId)?.policy.roles.find((r) => r.name === a.role)
      if (role && typeof role.kind === "object" && "Group" in role.kind && !role.kind.Group.includes(a.member_id)) role.kind.Group.push(a.member_id)
      return
    }
    if (k.FunctionCall) {
      const f = k.FunctionCall as { receiver_id: string; actions: ActionCall[] }
      const decoded = f.actions.map(decodeActionCall)
      ex.hop(2)
      if (f.receiver_id === this.cfg.usdcId) {
        // one batch receipt: all ft_transfers succeed or none does
        const xs = decoded.map((d) => d.args as { receiver_id: string; amount: string })
        const total = xs.reduce((t, x) => t + BigInt(x.amount), 0n)
        const ok = decoded.every((d) => d.methodName === "ft_transfer" && d.deposit === 1n) && xs.every((x) => this.s.registered.has(x.receiver_id)) && total <= this.balanceOf(daoId)
        if (!ok) {
          prop.status = "Failed"
          ex.payout = "failed"
          return
        }
        for (const x of xs) this.transfer(daoId, x.receiver_id, BigInt(x.amount), ex, "pot refund")
        ex.payout = "sent"
        return
      }
      if (f.receiver_id === this.cfg.hubId) {
        try {
          for (const d of decoded) {
            const args = d.args as { pot: string; rules: RawRules }
            if (d.methodName !== "set_rules") fail("BAD_CALL")
            this.setRules(daoId, args.pot, rulesFromRaw(args.rules), ex)
          }
        } catch (e) {
          if (!(e instanceof Panic)) throw e
          prop.status = "Failed"
        }
        return
      }
      prop.status = "Failed"
    }
  }

  // ------------------------------------------------------------ USDC → hub (contributions)

  private ftTransferCall(sender: string, a: Extract<CallAction, { type: "FunctionCall" }>, ex: Exec): { result: RelayResult; errorCode?: string; error?: string } {
    const amount = BigInt(String(a.args.amount))
    const resultOf = (recorded: boolean): RelayResult => ({ type: "contribution", recorded, amount: amount.toString(), usedAmount: recorded ? amount.toString() : "0" })
    if (!this.s.registered.has(sender)) throw new Panic("RECEIVER_NOT_REGISTERED", `Smart contract panicked: The account ${sender} is not registered`)
    if (this.balanceOf(sender) < amount) throw new Panic("INSUFFICIENT_FUNDS", `Smart contract panicked: The account doesn't have enough balance`)
    if (a.args.receiver_id !== this.cfg.hubId) fail("BAD_CALL")
    // sender → hub
    this.transfer(sender, this.cfg.hubId, amount, ex)
    ex.hop()
    const refund = (code: string | null): { result: RelayResult; errorCode: string; error: string } => {
      this.transfer(this.cfg.hubId, sender, amount, ex)
      ex.hop()
      return { result: resultOf(false), errorCode: code ?? "CONTRIBUTION_REFUNDED", error: code ? `Smart contract panicked: ${code}` : "refunded" }
    }
    if (a.gas < 35n * TGAS) return refund(null)
    let dao: string
    try {
      const msg = JSON.parse(String(a.args.msg)) as Record<string, unknown>
      if (Object.keys(msg).length !== 1 || typeof msg.pot !== "string") return refund("ERR_BAD_MSG")
      dao = msg.pot
    } catch {
      return refund("ERR_BAD_MSG")
    }
    const p = this.s.pots.get(dao)
    if (!p) return refund("ERR_POT_NOT_FOUND")
    if (!this.isOpen(p)) return refund("ERR_POT_NOT_OPEN")
    if (this.s.paused) return refund("ERR_PAUSED")
    const m = this.activeMember(dao, sender)
    if (!m) return refund("ERR_NOT_MEMBER")
    if (amount <= 0n || p.totalContributed + amount > MAX_AMOUNT) return refund("ERR_AMOUNT_TOO_LARGE")
    p.busyUntilMs = this.s.now + BUSY_WINDOW_MS
    // forward hub → DAO
    if (!this.transfer(this.cfg.hubId, dao, amount, ex, "Pot contribution")) return refund(null)
    ex.hop(2)
    m.contributed += amount
    p.totalContributed += amount
    p.lastContributor = sender
    ex.hub("contribution", { pot: dao, member: sender, amount: amount.toString(), member_total: m.contributed.toString(), pot_total: p.totalContributed.toString() })
    this.save(p)
    return { result: resultOf(true) }
  }

  // ------------------------------------------------------------ hub methods

  private async hubCall(sender: string, a: Extract<CallAction, { type: "FunctionCall" }>, ex: Exec): Promise<{ result: RelayResult; errorCode?: string; error?: string; after?: () => void }> {
    const g = a.args as Record<string, unknown>
    switch (a.method) {
      case "create_pot":
        return this.createPot(sender, g, ex)
      case "request_spend":
        return this.requestSpend(sender, g, ex)
      case "join":
        return this.join(sender, g, ex)
      case "add_invite":
        return this.addInvite(sender, g, ex)
      case "revoke_invite":
        return this.revokeInvite(sender, g, ex)
      case "set_rules": {
        const out = this.setRules(sender, String(g.pot), rulesFromRaw(g.rules as RawRules), ex)
        return { result: { type: "rules", applied: out.applied } }
      }
      case "propose_rules":
        return this.proposeRules(sender, g, ex)
      case "propose_close":
        return this.proposeClose(sender, g, ex)
      case "retry_payout":
        return this.retryPayout(String(g.pot), Number(g.proposal_id), ex)
      case "sync": {
        this.pot(String(g.pot))
        check(!!this.s.subjects.get(String(g.pot))?.has(Number(g.proposal_id)), "ERR_UNKNOWN_PROPOSAL")
        const out = this.sync(String(g.pot), Number(g.proposal_id), ex)
        return { result: { type: "maintenance", proposalId: Number(g.proposal_id), proposalStatus: out.daoStatus } }
      }
      default:
        throw new Panic("BAD_CALL", `Smart contract panicked: Method ${a.method} not found`)
    }
  }

  private createPot(creator: string, g: Record<string, unknown>, ex: Exec): { result: RelayResult; errorCode?: string; error?: string } {
    const hub = this.cfg.hubId
    check(!this.s.paused, "ERR_PAUSED")
    const slug = String(g.slug)
    if (!isValidSlug(slug)) fail("ERR_SLUG_INVALID")
    if (RESERVED_SLUGS.includes(slug)) fail("ERR_SLUG_RESERVED")
    const dao = daoIdFromSlug(slug, hub)
    check(dao.length <= 64, "ERR_SLUG_INVALID")
    check(!this.s.pots.has(dao), "ERR_SLUG_TAKEN")
    const name = String(g.name).trim()
    check(isValidPotName(name), "ERR_NAME_INVALID")
    const emoji = g.emoji == null ? null : String(g.emoji)
    if (emoji !== null) check(isValidEmoji(emoji), "ERR_EMOJI_INVALID")
    const preset = String(g.preset) as PresetId
    if (!["trip", "club", "team", "custom"].includes(preset)) throw new Panic("BAD_CALL", "Smart contract panicked: Failed to deserialize input from JSON.")
    const rules = g.rules ? rulesFromRaw(g.rules as RawRules) : (presetRules(preset) ?? fail("ERR_RULES_INVALID"))
    check(validateRules(rules, this.cfg), "ERR_RULES_INVALID")
    const day = this.day()
    const daily = this.s.creatorDaily.get(creator)
    const count = daily && daily.day === day ? daily.count : 0
    check(count < this.limits.maxPotsPerCreatorPerDay, "ERR_CREATOR_DAILY_LIMIT")
    check((this.s.potsOf.get(creator)?.length ?? 0) < this.limits.maxPotsPerAccount, "ERR_TOO_MANY_POTS")
    const invitePk = g.invite_pk == null ? null : String(g.invite_pk)
    if (invitePk !== null) {
      try {
        publicKeyBytes(invitePk)
      } catch {
        fail("ERR_INVITE_PK_INVALID")
      }
    }
    check(creator !== hub, "ERR_NOT_MEMBER")
    this.s.creatorDaily.set(creator, { day, count: count + 1 })
    ex.hop(2)
    this.newDao(dao, name, preset, creator)
    const now = this.s.now
    const p: MPot = {
      idx: this.s.potCount++,
      seq: 0,
      slug,
      name,
      emoji,
      preset,
      rules,
      rulesVersion: 1,
      status: "open",
      closingProposalId: null,
      creator,
      createdAtMs: now,
      closedAtMs: 0,
      closingUntilMs: 0,
      busyUntilMs: 0,
      memberCount: 1,
      joiningCount: 0,
      nextJoinIndex: 1,
      requestSeq: 0,
      activeInvites: 0,
      invitesTotal: 0,
      unpaidApproved: 0,
      openRequests: 0,
      totalContributed: 0n,
      spentInstant: 0n,
      spentVote: 0n,
      reserved: 0n,
      lastContributor: null,
      float: FLOAT_YOCTO,
      openRulesProposal: null,
    }
    this.s.pots.set(dao, p)
    this.s.members.set(dao, [{ account: creator, joinIndex: 0, status: { kind: "active" }, joinedAtMs: now, invitePk: null, contributed: 0n, instantUsed: 0n, spent: 0n, pendingVotes: 0 }])
    this.s.requests.set(dao, new Map())
    this.s.subjects.set(dao, new Map())
    this.s.invites.set(dao, new Map())
    this.addPotOf(creator, dao)
    ex.hub("pot_created", { pot: dao, slug, name, emoji, preset, creator, rules: rulesToRaw(rules), float: p.float.toString() })
    if (invitePk) {
      const inv: MInvite = { createdBy: creator, createdAtMs: now, expiresAtMs: now + HUB_LIMITS.defaultInviteTtlMs, maxUses: HUB_LIMITS.defaultInviteMaxUses, uses: 0, revokedAtMs: null }
      this.s.invites.get(dao)?.set(invitePk, inv)
      ex.hub("invite_added", { pot: dao, invite_pk: invitePk, by: creator, expires_at_ms: inv.expiresAtMs, max_uses: inv.maxUses })
      p.activeInvites = 1
      p.invitesTotal = 1
    }
    this.save(p)
    ex.hop(2)
    this.s.registered.add(dao)
    return { result: { type: "create_pot", potId: dao, slug } }
  }

  private addPotOf(account: string, dao: string): void {
    const v = this.s.potsOf.get(account) ?? []
    if (!v.includes(dao)) v.push(dao)
    this.s.potsOf.set(account, v)
  }

  private requestSpend(requester: string, g: Record<string, unknown>, ex: Exec): { result: RelayResult; errorCode?: string; error?: string; after?: () => void } {
    const dao = String(g.pot)
    const p = this.pot(dao)
    const amount = BigInt(String(g.amount))
    const receiver = String(g.receiver_id)
    const m = this.activeMember(dao, requester)
    const d = decideSpend({
      paused: this.s.paused,
      potOpen: this.isOpen(p),
      hubId: this.cfg.hubId,
      daoId: dao,
      usdcId: this.cfg.usdcId,
      rules: p.rules,
      requestCount: p.requestSeq,
      maxRequestsPerPot: this.limits.maxRequestsPerPot,
      maxPendingPerMember: this.limits.maxPendingPerMember,
      requester: m ? { instantUsed: m.instantUsed, contributed: m.contributed, pendingVotes: m.pendingVotes } : null,
      receiverIsMember: !!this.activeMember(dao, receiver),
      receiverId: receiver,
      amount,
      requestRef: String(g.request_ref),
    })
    if (!d.ok) return fail(d.code)
    const now = this.s.now
    const req: MRequest = {
      id: p.requestSeq,
      requester,
      receiver,
      amount,
      category: String(g.category) as Category,
      requestRef: String(g.request_ref),
      path: d.path,
      reason: d.reason,
      status: "checking",
      proposalId: null,
      createdAtMs: now,
      updatedAtMs: now,
    }
    p.requestSeq++
    applyTransition(p, m as MMember, amount, null, [d.path, "checking"])
    this.s.requests.get(dao)?.set(req.id, req)
    if (d.path === "instant") p.busyUntilMs = now + BUSY_WINDOW_MS
    this.save(p)
    ex.hop(2)
    const outcome = (status: RawSpendOutcome["status"], refusal: string | null): RawSpendOutcome => ({
      request_id: req.id,
      proposal_id: req.proposalId,
      path: req.path,
      reason: req.reason,
      status,
      refusal,
      approvals_needed: approvalsNeeded(p.memberCount),
    })
    const refuse = (refusal: string): { result: RelayResult; errorCode: string; error: string } => {
      this.transition(dao, p, req, null)
      this.save(p)
      const o = outcome("refused", refusal)
      return { result: { type: "spend", requestId: o.request_id, path: o.path, proposalId: null, approvalsNeeded: o.approvals_needed }, errorCode: refusedCode(refusal), error: `spend refused: ${refusal}` }
    }
    // on_spend_checked
    const group = this.groupOf(dao, "member")
    if (!group.includes(requester)) return refuse("not_in_dao_group")
    if (req.path === "instant" && p.rules.instantPayees === "members" && !group.includes(receiver)) return refuse("not_in_dao_group")
    if (!this.s.registered.has(receiver)) return refuse("payee_not_registered")
    const own = req.path === "instant" ? req.amount : 0n
    const others = p.reserved > own ? p.reserved - own : 0n
    const bal = this.balanceOf(dao)
    if (req.amount > (bal > others ? bal - others : 0n)) return refuse("insufficient_balance")
    if (!this.isOpen(p)) return refuse("pot_not_open")
    this.transition(dao, p, req, [req.path, "proposing"])
    this.save(p)
    // add_proposal + on_spend_added
    const kind = transferKind(this.cfg.usdcId, receiver, amount)
    const pid = this.addProposal(dao, this.cfg.hubId, spendDescription(req.id, req.category, req.requestRef), kind, ex)
    req.proposalId = pid
    this.s.subjects.get(dao)?.set(pid, { kind: "spend", requestId: req.id })
    this.transition(dao, p, req, [req.path, req.path === "vote" ? "pending" : "approving"])
    ex.hub("spend_requested", {
      pot: dao,
      request_id: req.id,
      proposal_id: pid,
      requester,
      receiver_id: receiver,
      amount: amount.toString(),
      category: req.category,
      request_ref: req.requestRef,
      path: req.path,
      reason: req.reason,
      approvals_needed: approvalsNeeded(p.memberCount),
    })
    this.save(p)
    if (req.path === "vote") {
      return { result: { type: "spend", requestId: req.id, path: "vote", proposalId: pid, approvalsNeeded: approvalsNeeded(p.memberCount) } }
    }
    // rulebot vote + re-read (on_spend_status)
    let prop: RawProposal
    try {
      prop = this.actProposal(dao, this.cfg.hubId, pid, "VoteApprove", kind, ex)
    } catch (e) {
      if (!(e instanceof Panic)) throw e
      prop = this.s.daos.get(dao)?.proposals.get(pid) as RawProposal
    }
    ex.hop()
    const st = prop.status
    let label: RawSpendOutcome["status"]
    if (st === "Approved" || st === "Failed") {
      // The chained get_proposal runs before the detached payout callback: it reads Approved.
      this.transition(dao, p, req, [req.path, "approved"])
      label = "approved"
      if (prop.votes[this.cfg.hubId] === "Approve") {
        const mm = this.member(dao, requester) as MMember
        ex.hub("spend_auto_approved", {
          pot: dao,
          request_id: req.id,
          proposal_id: pid,
          requester,
          receiver_id: receiver,
          amount: amount.toString(),
          budget_used: mm.instantUsed.toString(),
          budget_left: (p.rules.memberBudget > mm.instantUsed ? p.rules.memberBudget - mm.instantUsed : 0n).toString(),
        })
      }
    } else if (st === "InProgress") {
      req.reason = "auto_approve_failed"
      this.transition(dao, p, req, ["vote", "pending"])
      label = "pending"
      ex.hub("spend_payout_failed", { pot: dao, request_id: req.id, proposal_id: pid, stage: "approve", dao_status: st })
    } else {
      this.transition(dao, p, req, [req.path, st === "Rejected" ? "rejected" : st === "Expired" ? "expired" : "removed"])
      label = req.status as RawSpendOutcome["status"]
    }
    this.save(p)
    const payout = ex.payout
    const after = payout === "failed" && this.opts.autoSync ? () => this.autoSync(dao, pid) : undefined
    return { result: { type: "spend", requestId: req.id, path: req.path, proposalId: pid, payout: payout ?? (label === "approved" ? "sent" : undefined), approvalsNeeded: approvalsNeeded(p.memberCount) }, after }
  }

  private groupOf(dao: string, role: string): string[] {
    const r = this.s.daos.get(dao)?.policy.roles.find((x) => x.name === role)
    return r && typeof r.kind === "object" && "Group" in r.kind ? r.kind.Group : []
  }

  private async join(joiner: string, g: Record<string, unknown>, ex: Exec): Promise<{ result: RelayResult; errorCode?: string; error?: string }> {
    const dao = String(g.pot)
    const p = this.pot(dao)
    check(!this.s.paused, "ERR_PAUSED")
    check(this.isOpen(p), "ERR_POT_NOT_OPEN")
    check(!this.member(dao, joiner), "ERR_ALREADY_MEMBER")
    check(p.memberCount + p.joiningCount < this.limits.maxMembers, "ERR_POT_FULL")
    check((this.s.potsOf.get(joiner)?.length ?? 0) < this.limits.maxPotsPerAccount, "ERR_TOO_MANY_POTS")
    const pk = String(g.invite_pk)
    let pkBytes: Uint8Array
    try {
      pkBytes = publicKeyBytes(pk)
    } catch {
      return fail("ERR_INVITE_NOT_FOUND")
    }
    const inv = this.s.invites.get(dao)?.get(pk)
    if (!inv) return fail("ERR_INVITE_NOT_FOUND")
    check(inv.revokedAtMs === null, "ERR_INVITE_REVOKED")
    check(this.s.now < inv.expiresAtMs, "ERR_INVITE_EXPIRED")
    check(inv.uses < inv.maxUses, "ERR_INVITE_USED_UP")
    let sig: Uint8Array
    try {
      sig = base64Decode(String(g.signature))
    } catch {
      return fail("ERR_BAD_SIGNATURE")
    }
    check(sig.length === 64, "ERR_BAD_SIGNATURE")
    const msg = joinMessageBytes(dao, joiner)
    const verify = this.opts.verifyJoinSignature ?? ed25519VerifyWebCrypto
    check(await verify(pkBytes, msg, sig), "ERR_BAD_SIGNATURE")
    check(joiner !== this.cfg.hubId, "ERR_BAD_SIGNATURE")
    inv.uses++
    const m: MMember = {
      account: joiner,
      joinIndex: p.nextJoinIndex++,
      status: { kind: "joining", proposalId: null },
      joinedAtMs: this.s.now,
      invitePk: pk,
      contributed: 0n,
      instantUsed: 0n,
      spent: 0n,
      pendingVotes: 0,
    }
    p.joiningCount++
    this.s.members.get(dao)?.push(m)
    this.save(p)
    ex.hop(2)
    const kind = joinKind(joiner)
    const pid = this.addProposal(dao, this.cfg.hubId, joinDescription(), kind, ex)
    m.status = { kind: "joining", proposalId: pid }
    this.s.subjects.get(dao)?.set(pid, { kind: "join", member: joiner })
    this.save(p)
    let prop: RawProposal
    try {
      prop = this.actProposal(dao, this.cfg.hubId, pid, "VoteApprove", kind, ex)
    } catch (e) {
      if (!(e instanceof Panic)) throw e
      prop = this.s.daos.get(dao)?.proposals.get(pid) as RawProposal
    }
    ex.hop()
    if (prop.status === "Approved") {
      this.activateJoiner(dao, p, m, pid, ex)
      this.save(p)
      return { result: { type: "join", member: joiner, status: "active" } }
    }
    if (prop.status === "InProgress") return { result: { type: "join", member: joiner, status: "pending" } }
    this.dropJoiner(dao, p, m)
    this.save(p)
    return { result: { type: "join", member: joiner, status: "pending" }, errorCode: "JOIN_FAILED", error: `join failed: ${prop.status === "Rejected" ? "rejected" : "failed"}` }
  }

  private activateJoiner(dao: string, p: MPot, m: MMember, pid: number, ex: Exec): void {
    m.status = { kind: "active" }
    m.joinedAtMs = this.s.now
    p.joiningCount = Math.max(0, p.joiningCount - 1)
    p.memberCount++
    this.addPotOf(m.account, dao)
    ex.hub("member_joined", { pot: dao, member: m.account, proposal_id: pid, invite_pk: m.invitePk })
  }

  private dropJoiner(dao: string, p: MPot, m: MMember): void {
    const list = this.s.members.get(dao) ?? []
    this.s.members.set(dao, list.filter((x) => x.account !== m.account))
    p.joiningCount = Math.max(0, p.joiningCount - 1)
    if (m.invitePk) {
      const inv = this.s.invites.get(dao)?.get(m.invitePk)
      if (inv) inv.uses = Math.max(0, inv.uses - 1)
    }
  }

  private addInvite(by: string, g: Record<string, unknown>, ex: Exec): { result: RelayResult } {
    const dao = String(g.pot)
    const p = this.pot(dao)
    check(!!this.activeMember(dao, by), "ERR_NOT_MEMBER")
    check(this.isOpen(p), "ERR_POT_NOT_OPEN")
    check(!this.s.paused, "ERR_PAUSED")
    const pk = String(g.invite_pk)
    try {
      publicKeyBytes(pk)
    } catch {
      fail("ERR_INVITE_PK_INVALID")
    }
    check(!this.s.invites.get(dao)?.has(pk), "ERR_INVITE_EXISTS")
    const now = this.s.now
    let expires = now + HUB_LIMITS.defaultInviteTtlMs
    if (g.expires_at_ms != null) {
      const e = Number(g.expires_at_ms)
      check(e > now + HUB_LIMITS.minInviteTtlMs && e <= now + HUB_LIMITS.maxInviteTtlMs, "ERR_INVITE_EXPIRY_INVALID")
      expires = e
    }
    let uses: number = HUB_LIMITS.defaultInviteMaxUses
    if (g.max_uses != null) {
      const u = Number(g.max_uses)
      check(u >= 1 && u <= HUB_LIMITS.maxInviteUses, "ERR_INVITE_MAX_USES_INVALID")
      uses = u
    }
    check(p.activeInvites < this.limits.maxActiveInvites && p.invitesTotal < this.limits.maxInvitesTotal, "ERR_TOO_MANY_INVITES")
    this.s.invites.get(dao)?.set(pk, { createdBy: by, createdAtMs: now, expiresAtMs: expires, maxUses: uses, uses: 0, revokedAtMs: null })
    p.activeInvites++
    p.invitesTotal++
    ex.hub("invite_added", { pot: dao, invite_pk: pk, by, expires_at_ms: expires, max_uses: uses })
    this.save(p)
    ex.hop()
    return { result: { type: "invite", added: pk as PublicKeyStr } }
  }

  private revokeInvite(by: string, g: Record<string, unknown>, ex: Exec): { result: RelayResult } {
    const dao = String(g.pot)
    const p = this.pot(dao)
    check(!!this.activeMember(dao, by), "ERR_NOT_MEMBER")
    const pk = String(g.invite_pk)
    const inv = this.s.invites.get(dao)?.get(pk)
    if (!inv) return fail("ERR_INVITE_NOT_FOUND")
    check(inv.revokedAtMs === null, "ERR_INVITE_REVOKED")
    inv.revokedAtMs = this.s.now
    p.activeInvites = Math.max(0, p.activeInvites - 1)
    ex.hub("invite_revoked", { pot: dao, invite_pk: pk, by })
    this.save(p)
    ex.hop()
    return { result: { type: "invite", revoked: pk as PublicKeyStr } }
  }

  private setRules(caller: string, dao: string, rules: Rules, ex: Exec): { applied: boolean; rulesVersion: number } {
    const p = this.pot(dao)
    check(validateRules(rules, this.cfg), "ERR_RULES_INVALID")
    let by: "group" | "sole_member"
    if (caller === dao) {
      check(p.status !== "closed", "ERR_POT_NOT_OPEN")
      by = "group"
    } else if (this.s.pots.has(caller)) {
      return fail("ERR_NOT_POT_DAO")
    } else if (this.activeMember(dao, caller)) {
      check(p.memberCount === 1 && p.joiningCount === 0, "ERR_USE_PROPOSE_RULES")
      check(this.isOpen(p), "ERR_POT_NOT_OPEN")
      check(!this.s.paused, "ERR_PAUSED")
      by = "sole_member"
    } else return fail("ERR_NOT_MEMBER")
    p.rules = rules
    p.rulesVersion++
    ex.hub("rules_changed", { pot: dao, rules: rulesToRaw(rules), rules_version: p.rulesVersion, by, actor: caller })
    this.save(p)
    return { applied: true, rulesVersion: p.rulesVersion }
  }

  private proposeRules(by: string, g: Record<string, unknown>, ex: Exec): { result: RelayResult } {
    const dao = String(g.pot)
    const p = this.pot(dao)
    check(!!this.activeMember(dao, by), "ERR_NOT_MEMBER")
    check(this.isOpen(p), "ERR_POT_NOT_OPEN")
    check(!this.s.paused, "ERR_PAUSED")
    const rules = rulesFromRaw(g.rules as RawRules)
    check(validateRules(rules, this.cfg), "ERR_RULES_INVALID")
    check(p.openRulesProposal === null, "ERR_RULES_PENDING")
    const version = p.rulesVersion + 1
    ex.hop()
    const pid = this.addProposal(dao, this.cfg.hubId, rulesDescription(version), rulesKind(this.cfg.hubId, dao, rules), ex)
    this.s.subjects.get(dao)?.set(pid, { kind: "rules", version })
    p.openRulesProposal = pid
    ex.hub("rules_change_proposed", { pot: dao, proposal_id: pid, by, rules: rulesToRaw(rules), rules_version: version })
    this.save(p)
    return { result: { type: "rules", applied: false, proposalId: pid } }
  }

  private proposeClose(by: string, g: Record<string, unknown>, ex: Exec): { result: RelayResult; errorCode?: string; error?: string } {
    const dao = String(g.pot)
    const p = this.pot(dao)
    check(!!this.activeMember(dao, by), "ERR_NOT_MEMBER")
    const rec = this.s.closes.get(dao)
    if (p.status === "closing" && rec?.status !== "failed") fail("ERR_CLOSE_IN_PROGRESS")
    if (p.status === "closed") fail("ERR_POT_NOT_OPEN")
    const now = this.s.now
    check(p.closingUntilMs <= now, "ERR_CLOSE_IN_PROGRESS")
    if (rec) {
      const cooled = (rec.status === "rejected" || rec.status === "expired") && rec.proposedBy === by && now < rec.createdAtMs + HUB_LIMITS.closeCooldownMs
      check(!cooled, "ERR_CLOSE_COOLDOWN")
    }
    check(p.busyUntilMs <= now, "ERR_POT_BUSY")
    check(p.unpaidApproved === 0 && p.reserved === 0n, "ERR_PAYOUTS_PENDING")
    check(p.totalContributed > 0n, "ERR_NO_CONTRIBUTIONS")
    ex.hop(2)
    const balance = this.balanceOf(dao)
    const pr = prorata(balance, this.contributions(dao), p.lastContributor)
    if (!pr) {
      this.save(p)
      return { result: { type: "close", proposalId: -1 }, errorCode: "CLOSE_FAILED", error: "close failed: nothing_to_refund" }
    }
    const kind = closeKind(this.cfg.usdcId, pr.payouts)
    const pid = this.addProposal(dao, this.cfg.hubId, closeDescription(balance, pr.payouts.length), kind, ex)
    p.status = "closing"
    p.closingProposalId = pid
    p.closingUntilMs = 0
    this.s.closes.set(dao, { proposalId: pid, status: "pending", balance, payouts: pr.payouts, dust: pr.dust, dustTo: pr.dustTo, proposedBy: by, createdAtMs: now })
    this.s.subjects.get(dao)?.set(pid, { kind: "close" })
    const payouts = pr.payouts.map((x) => ({ account_id: x.account, amount: x.amount.toString() }))
    ex.hub("close_proposed", { pot: dao, proposal_id: pid, by, balance: balance.toString(), payouts, dust: pr.dust.toString(), dust_to: pr.dustTo })
    this.save(p)
    return { result: { type: "close", proposalId: pid } }
  }

  private retryPayout(dao: string, pid: number, ex: Exec): { result: RelayResult } {
    const p = this.pot(dao)
    check(this.isOpen(p), "ERR_POT_NOT_OPEN")
    const subj = this.s.subjects.get(dao)?.get(pid)
    if (!subj) return fail("ERR_UNKNOWN_PROPOSAL")
    if (subj.kind === "close" || subj.kind === "rules") return fail("ERR_USE_DAO_FINALIZE")
    if (subj.kind !== "spend") return fail("ERR_UNKNOWN_PROPOSAL")
    const req = this.s.requests.get(dao)?.get(subj.requestId)
    check(!!req && req.status === "payout_failed", "ERR_NOT_RETRYABLE")
    const r = req as MRequest
    let prop: RawProposal
    try {
      prop = this.actProposal(dao, this.cfg.hubId, pid, "Finalize", transferKind(this.cfg.usdcId, r.receiver, r.amount), ex)
    } catch (e) {
      if (!(e instanceof Panic)) throw e
      prop = this.s.daos.get(dao)?.proposals.get(pid) as RawProposal
    }
    const target = prop.status === "Approved" ? "approved" : prop.status === "Expired" ? "expired" : null
    if (target && r.status !== target) {
      this.transition(dao, p, r, [r.path, target])
      ex.hub("proposal_synced", { pot: dao, proposal_id: pid, subject: "spend", request_id: r.id, member: null, dao_status: prop.status, hub_status: target })
      this.save(p)
    }
    return { result: { type: "maintenance", proposalId: pid, proposalStatus: prop.status } }
  }

  // ------------------------------------------------------------ member votes + sync

  private memberAct(sender: string, dao: string, a: Extract<CallAction, { type: "FunctionCall" }>, ex: Exec): { result: RelayResult; errorCode?: string; error?: string; after?: () => void } {
    const id = Number(a.args.id)
    const action = String(a.args.action) as "VoteApprove" | "VoteReject" | "Finalize"
    const prop = this.actProposal(dao, sender, id, action, a.args.proposal as ProposalKind, ex)
    const tracked = this.s.subjects.get(dao)?.has(id)
    const after = tracked && this.opts.autoSync ? () => this.autoSync(dao, id) : undefined
    const status = prop.status === "Moved" ? "Removed" : prop.status
    const result: RelayResult = { type: "vote", proposalId: id, action, proposalStatus: status }
    if (ex.payout) result.payout = ex.payout
    return { result, after }
  }

  /** The relayer's follow-up `sync` tx (logged separately). */
  private autoSync(dao: string, pid: number): void {
    const ex = new Exec(this)
    ex.hop(2)
    this.sync(dao, pid, ex)
    const txHash = this.nextTxHash()
    this.s.log.push({ txHash, sender: this.relayerId, receiverId: this.cfg.hubId, methods: ["sync"], outcome: "success", events: ex.events, blockHeight: this.s.height })
  }

  /** hub.sync (contracts-spec §3.5, implemented mapping). */
  private sync(dao: string, pid: number, ex: Exec): { daoStatus: string; hubStatus: string; changed: boolean } {
    const p = this.pot(dao)
    const subj = this.s.subjects.get(dao)?.get(pid)
    const prop = this.s.daos.get(dao)?.proposals.get(pid)
    if (!subj || !prop) return { daoStatus: "unavailable", hubStatus: "unknown", changed: false }
    const expired = prop.status === "Expired" || (prop.status === "InProgress" && BigInt(prop.submission_time) + PERIOD_NS < BigInt(this.s.now) * NS)
    const ds = expired && prop.status === "InProgress" ? "Expired" : prop.status
    const synced = (subject: string, hs: string, extra: { request_id?: number | null; member?: string | null } = {}) =>
      ex.hub("proposal_synced", { pot: dao, proposal_id: pid, subject, request_id: extra.request_id ?? null, member: extra.member ?? null, dao_status: ds, hub_status: hs })
    if (subj.kind === "spend") {
      const req = this.s.requests.get(dao)?.get(subj.requestId)
      if (!req) return { daoStatus: prop.status, hubStatus: "unknown", changed: false }
      let target: [RawPath, RawRequestStatus] | null = null
      if (prop.status === "Approved") target = [req.path, "approved"]
      else if (prop.status === "Failed") target = [req.path, "payout_failed"]
      else if (prop.status === "Rejected") target = [req.path, "rejected"]
      else if (prop.status === "Removed" || prop.status === "Moved") target = [req.path, "removed"]
      else if (expired) target = [req.path, "expired"]
      else if (prop.status === "InProgress" && req.status === "approving") {
        req.reason = "auto_approve_failed"
        target = ["vote", "pending"]
      }
      const changed = !!target && (target[0] !== req.path || target[1] !== req.status)
      if (changed && target) {
        this.transition(dao, p, req, target)
        if (req.status === "payout_failed") ex.hub("spend_payout_failed", { pot: dao, request_id: req.id, proposal_id: pid, stage: "payout", dao_status: prop.status })
        synced("spend", req.status, { request_id: req.id })
        this.save(p)
      }
      return { daoStatus: ds, hubStatus: req.status, changed }
    }
    if (subj.kind === "join") {
      const m = this.member(dao, subj.member)
      if (!m) return { daoStatus: ds, hubStatus: "removed", changed: false }
      if (!(m.status.kind === "joining" && m.status.proposalId === pid)) return { daoStatus: ds, hubStatus: m.status.kind, changed: false }
      let hs: string
      if (prop.status === "Approved") {
        this.activateJoiner(dao, p, m, pid, ex)
        hs = "active"
      } else if (["Rejected", "Removed", "Moved", "Failed"].includes(prop.status) || expired) {
        this.dropJoiner(dao, p, m)
        hs = "removed"
      } else return { daoStatus: ds, hubStatus: "joining", changed: false }
      synced("join", hs, { member: subj.member })
      this.save(p)
      return { daoStatus: ds, hubStatus: hs, changed: true }
    }
    if (subj.kind === "close") {
      const rec = this.s.closes.get(dao)
      if (!rec || rec.proposalId !== pid) return { daoStatus: ds, hubStatus: "replaced", changed: false }
      if (!(p.status === "closing" && p.closingProposalId === pid)) return { daoStatus: ds, hubStatus: p.status === "closed" ? "closed" : "replaced", changed: false }
      let next: { status: MPot["status"]; rec: CloseStatus }
      if (prop.status === "Approved") next = { status: "closed", rec: "approved" }
      else if (["Rejected", "Removed", "Moved"].includes(prop.status)) next = { status: "open", rec: "rejected" }
      else if (prop.status === "Failed") next = { status: "closing", rec: "failed" }
      else if (expired) next = { status: "open", rec: "expired" }
      else return { daoStatus: ds, hubStatus: "closing", changed: false }
      if (rec.status === next.rec && p.status === next.status) return { daoStatus: ds, hubStatus: p.status, changed: false }
      rec.status = next.rec
      p.status = next.status
      if (next.status === "open") p.closingProposalId = null
      if (next.status === "closed") {
        p.closedAtMs = this.s.now
        ex.hub("pot_closed", { pot: dao, proposal_id: pid, balance: rec.balance.toString(), payouts: rec.payouts.map((x) => ({ account_id: x.account, amount: x.amount.toString() })) })
      }
      synced("close", p.status)
      this.save(p)
      return { daoStatus: ds, hubStatus: p.status, changed: true }
    }
    // rules
    const open = p.openRulesProposal === pid
    if (open && (prop.status !== "InProgress" || expired)) {
      p.openRulesProposal = null
      synced("rules", "resolved")
      this.save(p)
      return { daoStatus: ds, hubStatus: "resolved", changed: true }
    }
    return { daoStatus: ds, hubStatus: open ? "open" : "resolved", changed: false }
  }

  // ------------------------------------------------------------ views (raw JSON, as views.rs builds it)

  private potRaw(dao: string): RawPotView | null {
    const p = this.s.pots.get(dao)
    if (!p) return null
    const rec = this.s.closes.get(dao)
    return {
      pot: dao,
      slug: p.slug,
      name: p.name,
      emoji: p.emoji,
      preset: p.preset,
      seq: p.seq,
      rules: rulesToRaw(p.rules),
      rules_version: p.rulesVersion,
      status: p.status,
      close_proposal_id: p.status === "closing" ? p.closingProposalId : p.status === "closed" ? (rec?.proposalId ?? null) : null,
      creator: p.creator,
      created_at_ms: p.createdAtMs,
      closed_at_ms: p.closedAtMs > 0 ? p.closedAtMs : null,
      member_count: p.memberCount,
      joining_count: p.joiningCount,
      approvals_needed: approvalsNeeded(p.memberCount),
      proposal_period_ms: HUB_LIMITS.proposalPeriodMs,
      total_contributed: p.totalContributed.toString(),
      spent_instant: p.spentInstant.toString(),
      spent_vote: p.spentVote.toString(),
      reserved: p.reserved.toString(),
      balance_estimate: this.balanceEstimate(p).toString(),
      last_contributor: p.lastContributor,
      request_count: p.requestSeq,
      open_requests: p.openRequests,
      active_invites: p.activeInvites,
      unpaid_approved: p.unpaidApproved,
      float: p.float.toString(),
      usdc: this.cfg.usdcId,
      open_rules_proposal: p.openRulesProposal,
      closing_in_flight: p.closingUntilMs > this.s.now,
    }
  }

  private liveCloseRecord(dao: string, p: MPot): MClose | undefined {
    return p.status === "open" ? undefined : this.s.closes.get(dao)
  }

  private membersRaw(dao: string, balance?: bigint): RawMemberView[] {
    const p = this.s.pots.get(dao)
    if (!p) return []
    const live = this.liveCloseRecord(dao, p)
    let back: { account: string; amount: bigint }[]
    let source: RawMemberView["balance_source"]
    if (live) {
      back = live.payouts
      source = "close_record"
    } else {
      const b = balance ?? this.balanceEstimate(p)
      source = balance === undefined ? "ledger" : "argument"
      back = prorata(b, this.contributions(dao), p.lastContributor)?.payouts ?? []
    }
    return (this.s.members.get(dao) ?? []).map((m) => {
      const getsBack = back.find((x) => x.account === m.account)?.amount ?? 0n
      return {
        account_id: m.account,
        join_index: m.joinIndex,
        status: m.status.kind,
        joined_at_ms: m.joinedAtMs,
        contributed: m.contributed.toString(),
        spent: m.spent.toString(),
        instant_used: m.instantUsed.toString(),
        budget_left: (p.rules.memberBudget > m.instantUsed ? p.rules.memberBudget - m.instantUsed : 0n).toString(),
        would_get_back: getsBack.toString(),
        share_of_spending: (m.contributed > getsBack ? m.contributed - getsBack : 0n).toString(),
        is_last_contributor: p.lastContributor === m.account,
        balance_source: source,
      }
    })
  }

  private requestRaw(dao: string, r: MRequest): RawRequestView {
    return {
      request_id: r.id,
      pot: dao,
      requester: r.requester,
      receiver_id: r.receiver,
      amount: r.amount.toString(),
      category: r.category,
      request_ref: r.requestRef,
      path: r.path,
      reason: r.reason,
      status: r.status,
      proposal_id: r.proposalId,
      created_at_ms: r.createdAtMs,
      updated_at_ms: r.updatedAtMs,
      expires_at_ms: r.createdAtMs + HUB_LIMITS.proposalPeriodMs,
    }
  }

  private inviteRaw(dao: string, pk: string, inv: MInvite): RawInviteView {
    const status = inv.revokedAtMs !== null ? "revoked" : this.s.now >= inv.expiresAtMs ? "expired" : inv.uses >= inv.maxUses ? "used_up" : "active"
    return { pot: dao, invite_pk: pk, created_by: inv.createdBy, created_at_ms: inv.createdAtMs, expires_at_ms: inv.expiresAtMs, max_uses: inv.maxUses, uses: inv.uses, revoked: inv.revokedAtMs !== null, status }
  }

  private subjectView(dao: string, pid: number): RawSubjectView | null {
    const p = this.s.pots.get(dao)
    const s = this.s.subjects.get(dao)?.get(pid)
    if (!p || !s) return null
    const v: RawSubjectView = { pot: dao, proposal_id: pid, kind: s.kind, request_id: null, member: null, rules_version: null, live: false }
    if (s.kind === "spend") {
      v.request_id = s.requestId
      const r = this.s.requests.get(dao)?.get(s.requestId)
      v.live = !!r && ["approving", "pending", "payout_failed"].includes(r.status)
    } else if (s.kind === "join") {
      v.member = s.member
      const m = this.member(dao, s.member)
      v.live = !!m && m.status.kind === "joining" && m.status.proposalId === pid
    } else if (s.kind === "close") v.live = p.status === "closing" && p.closingProposalId === pid
    else {
      v.rules_version = s.version
      v.live = p.openRulesProposal === pid
    }
    return v
  }

  private closeBlocked(dao: string, p: MPot): RawClosePreview["blocked_reason"] {
    const rec = this.s.closes.get(dao)
    if (p.status === "closed") return "pot_not_open"
    if (p.status === "closing" && rec?.status !== "failed") return "close_in_progress"
    if (p.closingUntilMs > this.s.now) return "close_in_progress"
    if (p.busyUntilMs > this.s.now) return "busy"
    if (p.unpaidApproved > 0 || p.reserved > 0n) return "payouts_pending"
    if (p.totalContributed === 0n) return "no_contributions"
    return null
  }

  private v<T>(value: T): Viewed<T> {
    return { value, blockHeight: this.s.height }
  }

  // ChainViews (assigned by __views so clones get their own closures)
  hub = {} as ChainViews["hub"]
  dao = {} as ChainViews["dao"]
  usdc = {} as ChainViews["usdc"]
  account = {} as ChainViews["account"]

  /** @internal */
  static __views(c: MockChain): void {
    const self = c as unknown as {
      s: MockState
      v: <T>(x: T) => Viewed<T>
      potRaw: (d: string) => RawPotView | null
      membersRaw: (d: string, b?: bigint) => RawMemberView[]
      requestRaw: (d: string, r: MRequest) => RawRequestView
      inviteRaw: (d: string, pk: string, i: MInvite) => RawInviteView
      subjectView: (d: string, pid: number) => RawSubjectView | null
      closeBlocked: (d: string, p: MPot) => RawClosePreview["blocked_reason"]
      liveCloseRecord: (d: string, p: MPot) => MClose | undefined
      contributions: (d: string) => { account: string; contributed: bigint }[]
      balanceEstimate: (p: MPot) => bigint
      activeMember: (d: string, a: string) => MMember | undefined
      limits: Required<NonNullable<MockChainOptions["limits"]>>
      isOpen: (p: MPot) => boolean
    }
    const potOrThrow = (dao: string): MPot => {
      const p = self.s.pots.get(dao)
      if (!p) throw new RpcViewError("CONTRACT_PANIC", "panicked at ERR_POT_NOT_FOUND", { errorCode: "ERR_POT_NOT_FOUND", blockHeight: self.s.height })
      return p
    }
    c.hub = {
      getConfig: async () => {
        const raw: RawConfigView = {
          version: "1.0.0",
          owner: c.cfg.hubId.replace(/^pots\./, ""),
          usdc: c.cfg.usdcId,
          dao_code_hash: "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD",
          dao_float: FLOAT_YOCTO.toString(),
          min_dao_float: FLOAT_YOCTO.toString(),
          relayers: [c.relayerId],
          limits: {
            max_members: self.limits.maxMembers,
            max_pots_per_creator_per_day: self.limits.maxPotsPerCreatorPerDay,
            max_sponsored_pots_per_day: 50,
            max_pots_per_account: self.limits.maxPotsPerAccount,
            max_active_invites: self.limits.maxActiveInvites,
            max_invites_total: self.limits.maxInvitesTotal,
            max_pending_per_member: self.limits.maxPendingPerMember,
            max_requests_per_pot: self.limits.maxRequestsPerPot,
            min_hub_reserve: "2000000000000000000000000",
          },
          paused: self.s.paused,
          pot_count: self.s.potCount,
          sponsored_today: 0,
          free_balance: "20000000000000000000000000",
        }
        return self.v(parseConfigView(raw))
      },
      getPot: async (pot) => {
        const r = self.potRaw(pot)
        return self.v(r ? parsePotView(r) : null)
      },
      getPotsOf: async (account) =>
        self.v(
          (self.s.potsOf.get(account) ?? []).flatMap((dao) => {
            const p = self.s.pots.get(dao)
            if (!p) return []
            const m = self.s.members.get(dao)?.find((x) => x.account === account)
            const raw: RawPotSummary = {
              pot: dao,
              slug: p.slug,
              name: p.name,
              emoji: p.emoji,
              preset: p.preset,
              status: p.status,
              seq: p.seq,
              member_count: p.memberCount,
              total_contributed: p.totalContributed.toString(),
              balance_estimate: self.balanceEstimate(p).toString(),
              contributed: (m?.contributed ?? 0n).toString(),
              created_at_ms: p.createdAtMs,
            }
            return [parsePotSummary(raw)]
          }),
        ),
      getMembers: async (pot, balance) => self.v(self.membersRaw(pot, balance).map(parseMemberView)),
      getRules: async (pot) => {
        const p = self.s.pots.get(pot)
        return self.v(
          p
            ? parseRulesView({
                pot,
                preset: p.preset,
                rules: rulesToRaw(p.rules),
                rules_version: p.rulesVersion,
                member_count: p.memberCount,
                approvals_needed: approvalsNeeded(p.memberCount),
                proposal_period_ms: HUB_LIMITS.proposalPeriodMs,
              })
            : null,
        )
      },
      previewSpend: async (pot, account, amount, receiver, balance) => {
        const p = potOrThrow(pot)
        const m = self.s.members.get(pot)?.find((x) => x.account === account)
        const used = m?.instantUsed ?? 0n
        const am = self.activeMember(pot, account)
        const raw: RawSpendPreview = {
          path: "blocked",
          reason: "within_rules",
          approvals_needed: approvalsNeeded(p.memberCount),
          member_count: p.memberCount,
          instant_cap: p.rules.instantCap.toString(),
          member_budget: p.rules.memberBudget.toString(),
          budget_used: used.toString(),
          budget_left: (p.rules.memberBudget > used ? p.rules.memberBudget - used : 0n).toString(),
          balance_checked: balance === undefined ? null : balance.toString(),
          client_must_check: ["payee_registered", "dao_membership"],
        }
        const d = decideSpend({
          paused: self.s.paused,
          potOpen: self.isOpen(p),
          hubId: c.cfg.hubId,
          daoId: pot,
          usdcId: c.cfg.usdcId,
          rules: p.rules,
          requestCount: p.requestSeq,
          maxRequestsPerPot: self.limits.maxRequestsPerPot,
          maxPendingPerMember: self.limits.maxPendingPerMember,
          requester: am ? { instantUsed: am.instantUsed, contributed: am.contributed, pendingVotes: am.pendingVotes } : null,
          receiverIsMember: !!self.activeMember(pot, receiver),
          receiverId: receiver,
          amount,
        })
        if (!d.ok) raw.reason = d.previewReason
        else {
          const b = balance ?? self.balanceEstimate(p)
          if (amount > (b > p.reserved ? b - p.reserved : 0n)) raw.reason = "insufficient_balance"
          else {
            raw.path = d.path
            raw.reason = d.reason
          }
        }
        return self.v(parseSpendPreview(raw))
      },
      previewClose: async (pot, balance) => {
        const p = potOrThrow(pot)
        const contribs = self.contributions(pot)
        let blocked = self.closeBlocked(pot, p)
        const live = self.liveCloseRecord(pot, p)
        let raw: RawClosePreview
        const base = { pot, total_contributed: p.totalContributed.toString(), approvals_needed: approvalsNeeded(p.memberCount), open_requests: p.openRequests }
        const payoutRows = (xs: { account: string; amount: bigint }[]) =>
          xs.map((x) => ({ account_id: x.account, contributed: (contribs.find((c) => c.account === x.account)?.contributed ?? 0n).toString(), amount: x.amount.toString() }))
        if (live) {
          raw = { ...base, balance: live.balance.toString(), balance_source: "close_record", payouts: payoutRows(live.payouts), dust: live.dust.toString(), dust_to: live.dustTo, can_propose: blocked === null, blocked_reason: blocked }
        } else {
          const b = balance ?? self.balanceEstimate(p)
          const src = balance === undefined ? "ledger" : "argument"
          const pr = prorata(b, contribs, p.lastContributor)
          if (!pr && blocked === null) blocked = "nothing_to_refund"
          raw = {
            ...base,
            balance: b.toString(),
            balance_source: src,
            payouts: pr ? payoutRows(pr.payouts) : [],
            dust: (pr?.dust ?? 0n).toString(),
            dust_to: pr?.dustTo ?? null,
            can_propose: blocked === null,
            blocked_reason: blocked,
          }
        }
        return self.v(parseClosePreview(raw))
      },
      getRequests: async (pot, fromIndex, limit) => {
        const p = self.s.pots.get(pot)
        if (!p) return self.v([])
        const end = Math.min(fromIndex + Math.min(limit, 50), p.requestSeq)
        const out = []
        for (let i = fromIndex; i < end; i++) {
          const r = self.s.requests.get(pot)?.get(i)
          if (r) out.push(parseRequestView(self.requestRaw(pot, r)))
        }
        return self.v(out)
      },
      getRequest: async (pot, id) => {
        const r = self.s.requests.get(pot)?.get(id)
        return self.v(r ? parseRequestView(self.requestRaw(pot, r)) : null)
      },
      getInvite: async (pot, pk) => {
        const inv = self.s.invites.get(pot)?.get(pk)
        return self.v(inv ? parseInviteView(self.inviteRaw(pot, pk, inv)) : null)
      },
      getProposalSubject: async (pot, pid) => {
        const s = self.subjectView(pot, pid)
        return self.v(s ? parseSubjectView(s) : null)
      },
    }
    c.dao = {
      getPolicy: async (dao) => {
        const d = self.s.daos.get(dao)
        if (!d) throw new RpcViewError("UNKNOWN_ACCOUNT", `account ${dao} does not exist while viewing`, { blockHeight: self.s.height })
        return self.v(parsePolicy(structuredClone(d.policy)))
      },
      getProposals: async (dao, fromIndex, limit) => {
        const d = self.s.daos.get(dao)
        if (!d) return self.v([])
        const out = []
        for (let i = fromIndex; i < Math.min(d.lastProposalId, fromIndex + limit); i++) {
          const p = d.proposals.get(i)
          if (p) out.push(parseProposal(structuredClone(p)))
        }
        return self.v(out)
      },
      getProposal: async (dao, id) => {
        const p = self.s.daos.get(dao)?.proposals.get(id)
        return self.v(p ? parseProposal(structuredClone(p)) : null)
      },
      getLastProposalId: async (dao) => self.v(self.s.daos.get(dao)?.lastProposalId ?? 0),
      getActionsLog: async (dao) => self.v((self.s.daos.get(dao)?.actionsLog ?? []).map(parseActionsLogEntry)),
    }
    c.usdc = {
      balanceOf: async (a) => self.v(self.s.balances.get(a) ?? 0n),
      isRegistered: async (a) => self.v(self.s.registered.has(a)),
      storageBalanceOf: async (a) => self.v(self.s.registered.has(a) ? { total: 1_250_000_000_000_000_000_000n, available: 0n } : null),
      metadata: async () => self.v({ spec: "ft-1.0.0", name: "USDC (test)", symbol: "USDC", icon: null, reference: null, reference_hash: null, decimals: 6 }),
    }
    c.account = {
      accessKey: async (account, pk) => {
        const k = self.s.keys.get(account)?.get(pk)
        return self.v<AccessKeyInfo | null>(k ? { nonce: k.nonce, fullAccess: k.fullAccess } : null)
      },
      head: async () => self.v({ hash: "mock", timestampNs: BigInt(self.s.now) * NS }),
    }
  }
}

/** Creates a MockChain (same as `new MockChain(opts)`). */
export function createMockChain(opts: MockChainOptions = {}): MockChain {
  return new MockChain(opts)
}
