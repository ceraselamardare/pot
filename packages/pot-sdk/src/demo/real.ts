// The real testnet transactions the /demo explainer links (plan/design-direction/05 §2), and the
// read-only helpers that turn an `EXPERIMENTAL_tx_status` answer into the compact receipt chain
// committed in `real-chains.json`. The simulation's receipt templates are checked against that
// snapshot (demo.test.ts), and `scripts/run check-demo-real` re-fetches it (read-only, archival
// FastNEAR). Nothing here signs or sends anything.

import { base64Decode, utf8Decode } from "../encoding.ts"

export const ARCHIVAL_RPC_URL = "https://archival-rpc.testnet.fastnear.com"
/** Every real tx below (linked or template) was submitted by the preview relayer. */
export const REAL_TX_SENDER = "users.potprev.testnet"

export interface RealTxRef {
  hash: string
  /** The chapter that links it (1-6). The interlude links sit on chapter 2 (`Chapter.interlude`). */
  chapter: 1 | 2 | 3 | 4 | 5 | 6
  /** i18n key of its one-line description ("what it is, how it differs"). */
  labelKey: string
  /** The simulated tx it mirrors, when it has the same receipt shape (demo.test.ts checks it). */
  mirrors?: string
  interlude?: true
}

/**
 * The links, in chapter order: the reference Pot `reference-trip-2gzw.pots.potprev.testnet` (policy v3, hub 1.3.0),
 * where the whole story ran on 2026-11-09 (docs/proofs.json has every one). Hashes are real base58 (43-44 chars);
 * never `sim-`. The interlude has none: the reference's only recorded join and plain add are chapters 2 and 3.
 */
export const REAL_TXS: readonly RealTxRef[] = [
  // create_pot with extras (one OK, trust, pay links) and a rule_extras_set event: not the simulated create's shape
  { hash: "DMStMzsUAkBQph7BZuos3ADmhizyxitrjQUugybMMXXw", chapter: 1, labelKey: "demo.real.c1.create" },
  { hash: "CTk22gc9qp2fumUjFRKCaznd4DihZpkZfy68z9KCykTr", chapter: 2, labelKey: "demo.real.c2.join", mirrors: "c2.join" },
  { hash: "HsfSKzGztF3FVHpJHtrxD7TCWVUD4bZVs8XScPN6pNfD", chapter: 3, labelKey: "demo.real.c3.add", mirrors: "c3.add" },
  // hub 1.3.0's spend_requested / on_spend_status also carry `tier` and `link`: not the simulated request's shape
  { hash: "AcobWgTJZMyosrP1nEhiE5YB1UCfZtkXcSwuFwEtXzke", chapter: 4, labelKey: "demo.real.c4.request" },
  // ok_request: the tour's part 4 story; the simulated chapter 5 has no tx of this shape
  { hash: "9K4beHZV1BkxKvXgaQ2WY8KAz5MPrHSkHTj5NqGL1HVr", chapter: 5, labelKey: "demo.real.c5.one_ok" },
  { hash: "9YfZ6DtZ2Ey5trk5CVPqDTKByfEasLYyvsbTZJwTbNAM", chapter: 5, labelKey: "demo.real.c5.group_vote", mirrors: "c5.leo_vote" },
  { hash: "EjggW51daS5saiJ3w4cSRJ2WJ2siKfmMnTKLAKJPsSSY", chapter: 6, labelKey: "demo.real.c6.propose", mirrors: "c6.propose" },
  { hash: "6Si9m42frwXBTiKTWbd3Xgmz895uULXSsbcPsH9Vken7", chapter: 6, labelKey: "demo.real.c6.close", mirrors: "c6.sam_vote" },
]

export interface TemplateTxRef {
  hash: string
  /** The simulated tx whose receipt template (gas, refunds, burnt NEAR) is copied from this chain. */
  mirrors: string
  /** Why no linked reference tx serves instead. */
  why: string
}

/**
 * Real chains a simulated template mirrors but the demo does not link (hub before 1.3.0, older test Pots of
 * 2026-10-21/22): the simulated story runs on that hub's shapes, and the reference run either changed the shape or
 * recorded no tx of it. Same check as the links (demo.test.ts); the snapshot holds them too.
 */
export const TEMPLATE_TXS: readonly TemplateTxRef[] = [
  { hash: "3VpaA2MPY9LRoiobKFf7vLhNGoSKfY5TCGpV7XAmd2CY", mirrors: "c1.create", why: "the reference create_pot also sets the extra rules" },
  { hash: "Gmoey4Le16CeqZN45AWpWmmtHgBtDNWnY37HkNnAYtMk", mirrors: "c4.request", why: "the reference instant spend also logs its tier" },
  { hash: "9D52NEhn1zduyrPVBkP2pR2WuSTCz5Q3qsvUzNQjMT2b", mirrors: "c5.request", why: "the reference group request is not in docs/proofs.json" },
  { hash: "H8E7W9HdStBQZvyUCLcZ32kQjyjjY6TKeZMrLyLSJRfa", mirrors: "c5.maya_vote", why: "the reference's first approvals are not in docs/proofs.json" },
  { hash: "BSQFyv2HfngBDEMRw8svtwkZ8Vxk4NnZc834kriB7LFU", mirrors: "c5.sync", why: "the reference's relayer syncs are not in docs/proofs.json" },
  { hash: "3bR6AZBaMyUZ9noNADv5wNQ144ZkvcBwB7skCTjoWuxK", mirrors: "c6.maya_vote", why: "the reference's first approvals are not in docs/proofs.json" },
]

/** Every chain in real-chains.json: the links, then the template-only ones. */
export const REAL_CHAIN_HASHES: readonly string[] = [...REAL_TXS.map((r) => r.hash), ...TEMPLATE_TXS.map((r) => r.hash)]

export const REAL_HASH_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/

// ------------------------------------------------------------------ compact chains

export type RealAction =
  | { FunctionCall: { method: string; args: unknown; gas: string; deposit: string } }
  | { Transfer: { deposit: string } }
  | { CreateAccount: Record<string, never> }
  | { UseGlobalContract: { hash: string } }
  | { Delegate: { sender_id: string; receiver_id: string; actions: RealAction[]; nonce: string; max_block_height: string; public_key: string } }
  | { Other: { type: string } }

export interface RealReceipt {
  from: string
  to: string
  actions: RealAction[]
  /** The decoded SuccessValue text; absent when the receipt returned a promise. */
  result?: string
  logs: string[]
  gasBurnt: string
  tokensBurnt: string
  /** system → relayer gas refund */
  refund?: true
  failed?: true
}

export interface RealTx {
  hash: string
  signer: string
  receiver: string
  /** Total over the tx outcome and every receipt outcome (yoctoNEAR / gas). */
  tokensBurnt: string
  gasBurnt: string
  /** In execution order (`receipts_outcome` order). */
  receipts: RealReceipt[]
}

const b64text = (s: string): string => (s === "" ? "" : utf8Decode(base64Decode(s)))
const parseMaybe = (t: string): unknown => {
  if (t === "") return {}
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

type RawAction = Record<string, Record<string, unknown>> | string

function compactAction(a: RawAction): RealAction {
  if (typeof a === "string") return a === "CreateAccount" ? { CreateAccount: {} } : { Other: { type: a } }
  const [k, v] = Object.entries(a)[0] as [string, Record<string, unknown>]
  if (k === "FunctionCall") return { FunctionCall: { method: String(v.method_name), args: parseMaybe(b64text(String(v.args ?? ""))), gas: String(v.gas), deposit: String(v.deposit) } }
  if (k === "Transfer") return { Transfer: { deposit: String(v.deposit) } }
  if (k === "CreateAccount") return { CreateAccount: {} }
  if (k === "UseGlobalContract") return { UseGlobalContract: { hash: String((v as { code_hash?: string }).code_hash ?? JSON.stringify(v)) } }
  if (k === "Delegate") {
    const d = (v as { delegate_action: Record<string, unknown> }).delegate_action
    return {
      Delegate: {
        sender_id: String(d.sender_id),
        receiver_id: String(d.receiver_id),
        actions: (d.actions as RawAction[]).map(compactAction),
        nonce: String(d.nonce),
        max_block_height: String(d.max_block_height),
        public_key: String(d.public_key),
      },
    }
  }
  return { Other: { type: k } }
}

interface RawTxStatus {
  transaction: { hash: string; signer_id: string; receiver_id: string }
  transaction_outcome: { outcome: { gas_burnt: number; tokens_burnt: string } }
  receipts: { receipt_id: string; predecessor_id: string; receiver_id: string; receipt: { Action?: { actions: RawAction[] } } }[]
  receipts_outcome: { id: string; outcome: { logs: string[]; gas_burnt: number; tokens_burnt: string; status: Record<string, unknown> } }[]
}

/** EXPERIMENTAL_tx_status `result` → the compact chain committed in real-chains.json. */
export function compactRealTx(r: RawTxStatus): RealTx {
  const byId = new Map(r.receipts.map((x) => [x.receipt_id, x]))
  let tokens = BigInt(r.transaction_outcome.outcome.tokens_burnt)
  let gas = BigInt(r.transaction_outcome.outcome.gas_burnt)
  const receipts: RealReceipt[] = []
  for (const o of r.receipts_outcome) {
    tokens += BigInt(o.outcome.tokens_burnt)
    gas += BigInt(o.outcome.gas_burnt)
    const rc = byId.get(o.id)
    if (!rc?.receipt.Action) continue
    const st = o.outcome.status
    const out: RealReceipt = {
      from: rc.predecessor_id,
      to: rc.receiver_id,
      actions: rc.receipt.Action.actions.map(compactAction),
      logs: o.outcome.logs,
      gasBurnt: String(o.outcome.gas_burnt),
      tokensBurnt: String(o.outcome.tokens_burnt),
    }
    if (typeof st.SuccessValue === "string") out.result = b64text(st.SuccessValue)
    if (st.Failure) out.failed = true
    if (rc.predecessor_id === "system") out.refund = true
    receipts.push(out)
  }
  return { hash: r.transaction.hash, signer: r.transaction.signer_id, receiver: r.transaction.receiver_id, tokensBurnt: tokens.toString(), gasBurnt: gas.toString(), receipts }
}

/** One read-only `EXPERIMENTAL_tx_status` call (archival FastNEAR). */
export async function fetchRealTx(hash: string, opts: { url?: string; sender?: string; fetch?: typeof fetch } = {}): Promise<RealTx> {
  const f = opts.fetch ?? fetch
  const res = await f(opts.url ?? ARCHIVAL_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "pot-demo", method: "EXPERIMENTAL_tx_status", params: { tx_hash: hash, sender_account_id: opts.sender ?? REAL_TX_SENDER, wait_until: "NONE" } }),
  })
  if (!res.ok) throw new Error(`tx_status ${hash}: HTTP ${res.status}`)
  const j = (await res.json()) as { result?: RawTxStatus; error?: unknown }
  if (!j.result) throw new Error(`tx_status ${hash}: ${JSON.stringify(j.error)}`)
  return compactRealTx(j.result)
}
