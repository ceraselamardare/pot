// Receipt templates (plan/design-direction/05 §7.2 step 5). MockChain runs a whole relay atomically
// and has no receipts or gas, so each simulated tx's receipt chain is built here, per method, in the
// order of the real testnet chain it mirrors (real-chains.json): methods, attached gas, deposits,
// memos and return values. The values come from MockChain (ids, amounts, proposals, events);
// gas that Sputnik / NEP-141 compute at run time ("what's left") and the gas refunds are copied
// from the real run and marked `approx`. demo.test.ts checks every template against its real chain.

import realChains from "./real-chains.json" with { type: "json" }
import type { RealTx } from "./real.ts"
import type { ProposalJson, Receipt, ReceiptAction } from "./types.ts"

const REAL = (realChains as unknown as { txs: Record<string, RealTx> }).txs

export const TGAS = 1_000_000_000_000n
const T = (n: number): string => (BigInt(n) * TGAS).toString()

export interface Ids {
  relayer: string
  hub: string
  usdc: string
  pot: string
}

export interface MockEvent {
  standard: string
  version: string
  event: string
  data: unknown
}

/** Hands out a tx's MockChain events to the receipts that log them, in order; every event must be used. */
export class EventQueue {
  private readonly left: MockEvent[]
  constructor(events: readonly MockEvent[]) {
    this.left = [...events]
  }
  take(event: string): string {
    const i = this.left.findIndex((e) => e.event === event)
    if (i < 0) throw new Error(`demo: no "${event}" event left`)
    const [e] = this.left.splice(i, 1) as [MockEvent]
    return `EVENT_JSON:${JSON.stringify({ standard: e.standard, version: e.version, event: e.event, data: e.data })}`
  }
  done(tx: string): void {
    if (this.left.length) throw new Error(`demo: ${tx} left events unlogged: ${this.left.map((e) => e.event).join(", ")}`)
  }
}

export function realTx(hash: string): RealTx {
  const t = REAL[hash]
  if (!t) throw new Error(`demo: real chain ${hash} missing from real-chains.json`)
  return t
}

/** Attached gas of a receipt in the real chain (row = 1-based among non-refund receipts). */
function realGas(hash: string, row: number, action = 0): string {
  const r = realTx(hash).receipts.filter((x) => !x.refund)[row - 1]
  const a = r?.actions[action]
  if (!a || !("FunctionCall" in a)) throw new Error(`demo: real ${hash} row ${row} has no FunctionCall`)
  return a.FunctionCall.gas
}

const fc = (method: string, args: unknown, gas: string, deposit: bigint | string = 0n): ReceiptAction => ({ FunctionCall: { method, args, gas, deposit: String(deposit) } })
const transfer = (deposit: bigint | string): ReceiptAction => ({ Transfer: { deposit: String(deposit) } })
const json = (v: unknown): string => JSON.stringify(v)

type Row = Omit<Receipt, "n">

/** Numbers the rows, then appends the real run's gas refunds (system → relayer), as the explorer lists them. */
function finish(rows: Row[], realHash: string): Receipt[] {
  const out: Receipt[] = rows.map((r, i) => ({ n: i + 1, ...r }))
  for (const r of realTx(realHash).receipts.filter((x) => x.refund)) {
    const a = r.actions[0]
    out.push({ n: out.length + 1, predecessor: "system", receiver: r.to, actions: [transfer(a && "Transfer" in a ? a.Transfer.deposit : "0")], refund: true, approx: true })
  }
  return out
}

const delegateRow = (ids: Ids, person: string, tx: string): Row => ({ predecessor: ids.relayer, receiver: person, actions: [{ Delegate: { tx } }] })

// ------------------------------------------------------------------ chapter 1: create_pot

export function createPotReceipts(p: {
  ids: Ids
  tx: string
  realHash: string
  person: string
  args: Record<string, unknown>
  daoCodeHash: string
  float: bigint
  usdcStorage: bigint
  newArgs: { config: unknown; policy: unknown }
  rawRules: unknown
  dayIndex: number
  events: EventQueue
}): Receipt[] {
  const { ids, person, args } = p
  const rows: Row[] = [
    delegateRow(ids, person, p.tx),
    { predecessor: person, receiver: ids.hub, actions: [fc("create_pot", args, T(300))] },
    {
      predecessor: ids.hub,
      receiver: ids.pot,
      actions: [{ CreateAccount: {} }, transfer(p.float), { UseGlobalContract: { hash: p.daoCodeHash } }, fc("new", p.newArgs, T(20))],
      logs: ["Contract state version: V2"],
    },
    {
      predecessor: ids.hub,
      receiver: ids.hub,
      actions: [
        fc(
          "on_pot_created",
          { dao: ids.pot, slug: args.slug, name: args.name, emoji: args.emoji, preset: args.preset, rules: p.rawRules, creator: person, invite_pk: args.invite_pk, float: p.float.toString(), sponsored: true, day: p.dayIndex },
          T(40),
        ),
      ],
      then: true,
      logs: [p.events.take("pot_created"), p.events.take("invite_added")],
    },
    {
      predecessor: ids.hub,
      receiver: ids.usdc,
      actions: [fc("storage_deposit", { account_id: ids.pot, registration_only: true }, T(10), p.usdcStorage)],
      result: json({ total: p.usdcStorage.toString(), available: "0" }),
    },
    {
      predecessor: ids.hub,
      receiver: ids.hub,
      actions: [fc("on_dao_registered", { dao: ids.pot, slug: args.slug, float: p.float.toString() }, T(10))],
      then: true,
      result: json({ ok: true, pot: ids.pot, slug: args.slug, float: p.float.toString(), usdc_registered: true }),
    },
  ]
  p.events.done(p.tx)
  return finish(rows, p.realHash)
}

// ------------------------------------------------------------------ chapter 2: join

export function joinReceipts(p: { ids: Ids; tx: string; realHash: string; person: string; args: Record<string, unknown>; prepay: bigint; description: string; kind: unknown; proposal: ProposalJson; events: EventQueue }): Receipt[] {
  const { ids, person } = p
  const pid = p.proposal.id
  const rows: Row[] = [
    delegateRow(ids, person, p.tx),
    { predecessor: person, receiver: ids.hub, actions: [fc("join", p.args, T(100))] },
    { predecessor: ids.hub, receiver: ids.pot, actions: [transfer(p.prepay), fc("add_proposal", { proposal: { description: p.description, kind: p.kind } }, T(10))], result: json(pid) },
    { predecessor: ids.hub, receiver: ids.hub, actions: [fc("on_join_added", { pot: ids.pot, member: person }, T(60))], then: true },
    { predecessor: ids.hub, receiver: ids.pot, actions: [fc("act_proposal", { id: pid, action: "VoteApprove", proposal: p.kind, memo: "auto: valid Pot invite" }, T(20))], logs: ["Memo: auto: valid Pot invite"] },
    { predecessor: ids.pot, receiver: ids.hub, actions: [transfer(0n)] },
    { predecessor: ids.hub, receiver: ids.pot, actions: [fc("get_proposal", { id: pid }, T(10))], result: json(p.proposal) },
    { predecessor: ids.hub, receiver: ids.hub, actions: [fc("on_join_status", { pot: ids.pot, member: person }, T(10))], then: true, result: json({ ok: true, status: "active", proposal_id: pid }), logs: [p.events.take("member_joined")] },
  ]
  p.events.done(p.tx)
  return finish(rows, p.realHash)
}

// ------------------------------------------------------------------ chapter 3: ft_transfer_call

export function addMoneyReceipts(p: { ids: Ids; tx: string; realHash: string; person: string; args: Record<string, unknown>; events: EventQueue }): Receipt[] {
  const { ids, person, args } = p
  const amount = String(args.amount)
  const rows: Row[] = [
    delegateRow(ids, person, p.tx),
    { predecessor: person, receiver: ids.usdc, actions: [fc("ft_transfer_call", args, T(100), 1n)], depositPaidBy: ids.relayer, logs: [p.events.take("ft_transfer")] },
    { predecessor: ids.usdc, receiver: ids.hub, actions: [fc("ft_on_transfer", { sender_id: person, amount, msg: args.msg }, realGas(p.realHash, 3))], approx: true },
    { predecessor: ids.hub, receiver: ids.usdc, actions: [fc("ft_transfer", { receiver_id: ids.pot, amount, memo: "Pot contribution" }, T(10), 1n)], logs: [p.events.take("ft_transfer")] },
    { predecessor: ids.hub, receiver: ids.hub, actions: [fc("on_contribution_forwarded", { pot: ids.pot, sender_id: person, amount }, T(10))], then: true, result: json("0"), logs: [p.events.take("contribution")] },
    { predecessor: ids.usdc, receiver: ids.usdc, actions: [fc("ft_resolve_transfer", { sender_id: person, receiver_id: ids.hub, amount }, T(5))], then: true, result: json(amount) },
  ]
  p.events.done(p.tx)
  return finish(rows, p.realHash)
}

// ------------------------------------------------------------------ chapters 4-5: request_spend

export interface SpendOutcomeJson {
  request_id: number
  proposal_id: number
  path: "instant" | "vote"
  reason: string
  status: string
  refusal: null
  approvals_needed: number
}

export function requestSpendReceipts(p: {
  ids: Ids
  tx: string
  realHash: string
  person: string
  args: Record<string, unknown>
  requestId: number
  prepay: bigint
  description: string
  kind: unknown
  /** the Pot's USDC balance the Hub reads (row 3) */
  balance: bigint
  policy: unknown
  outcome: SpendOutcomeJson
  /** instant path only: the proposal as the Hub reads it back (row 13) */
  approved?: ProposalJson
  events: EventQueue
}): Receipt[] {
  const { ids, person, args } = p
  const pid = p.outcome.proposal_id
  const reads = "reads"
  const rows: Row[] = [
    delegateRow(ids, person, p.tx),
    { predecessor: person, receiver: ids.hub, actions: [fc("request_spend", args, T(150))] },
    { predecessor: ids.hub, receiver: ids.usdc, actions: [fc("ft_balance_of", { account_id: ids.pot }, T(5))], parallelGroup: reads, result: json(p.balance.toString()) },
    { predecessor: ids.hub, receiver: ids.usdc, actions: [fc("storage_balance_of", { account_id: args.receiver_id }, T(5))], parallelGroup: reads, result: json({ total: "1250000000000000000000", available: "0" }) },
    { predecessor: ids.hub, receiver: ids.pot, actions: [fc("get_policy", {}, T(10))], parallelGroup: reads, result: json(p.policy) },
    { predecessor: ids.hub, receiver: ids.hub, actions: [fc("on_spend_checked", { pot: ids.pot, request_id: p.requestId, prepay: p.prepay.toString() }, T(105))], then: true },
    { predecessor: ids.hub, receiver: ids.pot, actions: [transfer(p.prepay), fc("add_proposal", { proposal: { description: p.description, kind: p.kind } }, T(10))], result: json(pid) },
  ]
  const added: Row = { predecessor: ids.hub, receiver: ids.hub, actions: [fc("on_spend_added", { pot: ids.pot, request_id: p.requestId }, T(80))], then: true, logs: [p.events.take("spend_requested")] }
  rows.push(added)
  if (p.outcome.path === "vote") {
    added.result = json(p.outcome)
  } else {
    if (!p.approved) throw new Error("demo: instant spend needs the approved proposal")
    const t = (p.kind as { Transfer: { receiver_id: string; amount: string } }).Transfer
    rows.push(
      { predecessor: ids.hub, receiver: ids.pot, actions: [fc("act_proposal", { id: pid, action: "VoteApprove", proposal: p.kind, memo: "auto: within Pot rules" }, T(40))], logs: ["Memo: auto: within Pot rules"] },
      { predecessor: ids.pot, receiver: ids.usdc, actions: [fc("ft_transfer", { receiver_id: t.receiver_id, amount: t.amount, memo: p.description }, realGas(p.realHash, 10), 1n)], approx: true, logs: [p.events.take("ft_transfer")] },
      { predecessor: ids.pot, receiver: ids.pot, actions: [fc("on_proposal_callback", { proposal_id: pid }, realGas(p.realHash, 11))], then: true, approx: true },
      { predecessor: ids.pot, receiver: ids.hub, actions: [transfer(0n)] },
      { predecessor: ids.hub, receiver: ids.pot, actions: [fc("get_proposal", { id: pid }, T(10))], result: json(p.approved) },
      { predecessor: ids.hub, receiver: ids.hub, actions: [fc("on_spend_status", { pot: ids.pot, request_id: p.requestId }, T(10))], then: true, result: json(p.outcome), logs: [p.events.take("spend_auto_approved")] },
    )
  }
  p.events.done(p.tx)
  return finish(rows, p.realHash)
}

// ------------------------------------------------------------------ member votes (chapters 5-6)

export function voteReceipts(p: {
  ids: Ids
  tx: string
  realHash: string
  person: string
  args: Record<string, unknown>
  gas: string
  /** the payout, when this vote approves the proposal */
  payout?: { kind: "transfer"; receiver: string; amount: string; memo: string } | { kind: "close"; payouts: { account: string; amount: string }[] }
  events: EventQueue
}): Receipt[] {
  const { ids, person } = p
  const pid = Number(p.args.id)
  const rows: Row[] = [delegateRow(ids, person, p.tx), { predecessor: person, receiver: ids.pot, actions: [fc("act_proposal", p.args, p.gas)] }]
  if (p.payout?.kind === "transfer") {
    rows.push({ predecessor: ids.pot, receiver: ids.usdc, actions: [fc("ft_transfer", { receiver_id: p.payout.receiver, amount: p.payout.amount, memo: p.payout.memo }, realGas(p.realHash, 3), 1n)], approx: true, logs: [p.events.take("ft_transfer")] })
  } else if (p.payout?.kind === "close") {
    rows.push({
      predecessor: ids.pot,
      receiver: ids.usdc,
      actions: p.payout.payouts.map((x) => fc("ft_transfer", { receiver_id: x.account, amount: x.amount, memo: "pot refund" }, realGas(p.realHash, 3), 1n)),
      logs: p.payout.payouts.map(() => p.events.take("ft_transfer")),
    })
  }
  if (p.payout) {
    rows.push(
      { predecessor: ids.pot, receiver: ids.pot, actions: [fc("on_proposal_callback", { proposal_id: pid }, realGas(p.realHash, 4))], then: true, approx: true },
      { predecessor: ids.pot, receiver: ids.hub, actions: [transfer(0n)] },
    )
  }
  p.events.done(p.tx)
  return finish(rows, p.realHash)
}

// ------------------------------------------------------------------ the relayer's sync

export function syncReceipts(p: { ids: Ids; tx: string; realHash: string; proposal: ProposalJson; subject: "spend" | "close"; hubStatus: string; events: EventQueue; eventNames: string[] }): Receipt[] {
  const { ids } = p
  const pid = p.proposal.id
  const rows: Row[] = [
    { predecessor: ids.relayer, receiver: ids.hub, actions: [fc("sync", { pot: ids.pot, proposal_id: pid }, T(50))] },
    { predecessor: ids.hub, receiver: ids.pot, actions: [fc("get_proposal", { id: pid }, T(10))], result: json(p.proposal) },
    {
      predecessor: ids.hub,
      receiver: ids.hub,
      actions: [fc("on_sync", { pot: ids.pot, proposal_id: pid }, T(10))],
      then: true,
      result: json({ proposal_id: pid, subject: p.subject, dao_status: p.proposal.status, hub_status: p.hubStatus, changed: true }),
      logs: p.eventNames.map((e) => p.events.take(e)),
    },
  ]
  p.events.done(p.tx)
  return finish(rows, p.realHash)
}

// ------------------------------------------------------------------ chapter 6: propose_close

export function proposeCloseReceipts(p: {
  ids: Ids
  tx: string
  realHash: string
  person: string
  args: Record<string, unknown>
  balance: bigint
  prepay: bigint
  description: string
  kind: unknown
  proposalId: number
  payouts: { account_id: string; amount: string }[]
  dust: string
  dustTo: string
  approvalsNeeded: number
  events: EventQueue
}): Receipt[] {
  const { ids, person } = p
  const rows: Row[] = [
    delegateRow(ids, person, p.tx),
    { predecessor: person, receiver: ids.hub, actions: [fc("propose_close", p.args, T(150))] },
    { predecessor: ids.hub, receiver: ids.usdc, actions: [fc("ft_balance_of", { account_id: ids.pot }, T(5))], result: json(p.balance.toString()) },
    { predecessor: ids.hub, receiver: ids.hub, actions: [fc("on_close_balance", { pot: ids.pot, by: person, prepay: p.prepay.toString() }, T(60))], then: true },
    { predecessor: ids.hub, receiver: ids.pot, actions: [transfer(p.prepay), fc("add_proposal", { proposal: { description: p.description, kind: p.kind } }, T(20))], result: json(p.proposalId) },
    {
      predecessor: ids.hub,
      receiver: ids.hub,
      actions: [fc("on_close_added", { pot: ids.pot, by: person, balance: p.balance.toString(), payouts: p.payouts, dust: p.dust, dust_to: p.dustTo }, T(10))],
      then: true,
      result: json({ ok: true, proposal_id: p.proposalId, balance: p.balance.toString(), payouts: p.payouts, dust: p.dust, dust_to: p.dustTo, approvals_needed: p.approvalsNeeded }),
      logs: [p.events.take("close_proposed")],
    },
  ]
  p.events.done(p.tx)
  return finish(rows, p.realHash)
}
