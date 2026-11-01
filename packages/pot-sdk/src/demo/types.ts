// The /demo explainer dataset (plan/design-direction/05 §7.3). Type-only: the web app imports these
// with `import type` (via apps/web/app/demo/_data/types.ts) and renders the committed JSON; it
// never runs the generator. Every field the spec lists is kept with its exact name and meaning.
// Fields marked "(added)" are additive; notes/demo.md "Data" explains each one.

export type Persona = "maya" | "sam" | "leo"
export type ChapterN = 1 | 2 | 3 | 4 | 5 | 6
export type Category = "groceries" | "food" | "transport" | "stay" | "tickets" | "other"

export interface DemoScript {
  version: 1
  generatedWith: { sdk: string; hubPrepayModel: string }
  ids: { hub: string; usdc: string; relayer: string; faucet: string; pot: string; people: Record<Persona, string> }
  /** (added) The Pot's display data and the request refs/memos the beats use. */
  pot: { slug: string; name: string; emoji: string; preset: "trip"; rules: { instantCap: string; memberBudget: string; instantPayees: "members" }; refs: { groceries: string; boat: string }; memos: Record<string, string> }
  /** (added) The recap table of §2.7, computed from `chapters` (never typed by hand). */
  recap: Recap
  chapters: Chapter[]
}

export interface Recap {
  rows: { n: ChapterN; signatures: number; delegates: number; inviteSignatures: number; transactions: number; receipts: number; decidedBy: "rulebot" | "members" | "nobody"; nearPaidByPeople: "0" }[]
  totals: { signatures: number; delegates: number; inviteSignatures: number; transactions: number; relayedDelegates: number; relayerSyncs: number; receipts: number; nearPaidByPeople: "0" }
}

export interface Chapter {
  n: ChapterN
  /** in order of appearance */
  personas: Persona[]
  before: Snapshot
  after: Snapshot
  beats: Beat[]
  txs: SimTx[]
  /** real base58 hashes, 43-44 chars */
  real: { hash: string; labelKey: string }[]
  /** term ids used in this chapter */
  glossary: string[]
  /** (added) Chapter 2 only: the "Meanwhile" card (Sam joined, $300 of $450) and its real links. */
  interlude?: { key: string; real: { hash: string; labelKey: string }[] }
}

export interface Beat {
  /** "beat-7" */
  id: string
  pane: "app" | "hood"
  actor: Persona | "relayer" | "hub" | "pot" | "usdc"
  /** "demo.c4.b7" */
  captionKey: string
  /** The phone screen during this beat (set on every beat; hood beats keep the last app screen). */
  app?: AppScene
  card?: Card
  /** (added) Further cards on the same beat, after `card` (e.g. "signed + proposal", a note). */
  cards?: Card[]
  /** which receipt rows this beat explains */
  receipts?: { tx: string; rows: number[] }
  /** only c4 beat 7 */
  celebrate?: true
  /** (added) Whose phone the visitor holds ("You're Maya" / "Now you're Leo"). */
  you: Persona
  /** (added) The phone shows its actionable marigold primary on this beat; tapping it = Next. */
  tap?: true
  /** (added) A screen shown first on this beat, before `app` (the PushCard that opens the sheet). */
  appBefore?: AppScene
}

export type AppScene =
  | { scene: "create"; step: 1 | 2 | "share" }
  | { scene: "invite_landing" }
  | { scene: "youre_in" }
  | { scene: "add_money"; phase: "form" | "adding" | "added" }
  | { scene: "spend"; amount: string; category: Category; phase: "form" | "checking" | "approved" | "sent" | "sent_to_group" }
  | { scene: "push"; text: string }
  | { scene: "approve"; requestId: number; phase: "form" | "done" }
  | { scene: "close"; phase: "form" | "approve" | "closed" }
  | { scene: "pot"; highlight?: "goal" | "balance" }

export interface RulesRow {
  /** the hub field the check reads (instant_cap, member_budget, instant_payees, contributed); copy: demo.rules.<check> */
  check: string
  value: string
  ok: boolean
  decides?: true
}

export type Card =
  | { type: "signed"; tx: string }
  | { type: "invite"; message: string; publicKey: string; signature: string; /** (added) the `?i=` form of publicKey */ param: string }
  | { type: "sent"; tx: string }
  | { type: "route"; tx: string }
  | { type: "rules"; rows: RulesRow[]; path: "instant" | "vote"; reason: string }
  | { type: "proposal"; id: number; at: "before" | "after"; /** (added) the proposal as get_proposal returns it at this beat */ proposal: ProposalJson; /** (added) */ meter: VoteMeter }
  | { type: "state" }
  | { type: "balances" }
  | { type: "note"; key: string }

/** (added) Everything the vote meter and "How 2 is computed" need, at this beat. */
export interface VoteMeter {
  /** the role that decides this kind of proposal */
  role: "member" | "rulebot"
  seats: { account: string; joinIndex: number; vote: "approve" | "none" }[]
  /** approvals needed / seats in the deciding role */
  k: number
  n: number
  approvals: number
  /** threshold = max(quorum, min(⌊n × num ÷ den⌋ + 1, n)) */
  math: { groupSize: number; num: number; den: number; quorum: number; threshold: number }
  /** the member role's math even when the rulebot decides (proposal card's "Members" row) */
  members: { n: number; k: number }
  /** the rulebot row: decides alone (1 of 1) / can't vote outside the rules / can't vote on this kind */
  rulebot: "decides" | "outside_rules" | "wrong_kind"
}

export interface SimTx {
  /** "c4.request" */
  id: string
  /** "sim-…" (32 base58 chars after the prefix) */
  hash: string
  /** relayer = sync (no delegate) */
  kind: "delegate" | "relayer"
  signer: string
  receiver: string
  delegate?: SignedDelegateJson
  receipts: Receipt[]
  burnt: { tgas: number; near: string; approx: true; /** (added) exact yocto of the real run */ yocto: string }
  events: { standard: string; event: string; data: unknown }[]
  outcome: "success"
  /** (added) The relayer's outer transaction (NEP-366 envelope). All values simulated. */
  envelope: Envelope
  /** (added) Who paid what in this tx. NEAR figures copied from the real run are approx. */
  whoPaid: WhoPaid[]
  /** (added) The real testnet tx this one mirrors (source of `burnt` and the ≈ gas values). */
  realRef: string
  /** (added) Simulated block height the tx landed in. */
  blockHeight: number
}

export interface Envelope {
  signer_id: string
  /** the relayer pool key (simulated) */
  public_key: string
  nonce: string
  receiver_id: string
  /** "sim-…" */
  block_hash: string
  /** "Delegate" wraps `delegate`; "FunctionCall" is the relayer's own `sync` */
  actions: ({ Delegate: { tx: string } } | { FunctionCall: { method_name: string; args: unknown; gas: string; deposit: string } })[]
  /** D-24 checks the relayer ran before sending (all pass in the happy path) */
  checks: { check: "allowlist" | "deposit_cap" | "gas" | "expiry" | "nonce" | "signature" | "quotas"; value: string; ok: true }[]
}

export interface WhoPaid {
  account: string
  what: "gas" | "deposit" | "storage_prepay" | "float" | "registration" | "nothing"
  /** decimal NEAR, 4 dp ("0" for the person) */
  near: string
  yocto: string
  approx: boolean
}

/** the exact NEP-366 field names */
export interface SignedDelegateJson {
  delegate_action: {
    sender_id: string
    receiver_id: string
    actions: [{ FunctionCall: { method_name: string; args: unknown; args_base64: string; gas: string; deposit: string } }]
    nonce: string
    max_block_height: string
    public_key: string
  }
  /** "ed25519:<base58>" */
  signature: string
  /** what POST /api/relay would carry */
  transport_base64: string
  /** (added) base58 sha256 of `6e 01 00 40 ‖ borsh(DelegateAction)`: the 32 bytes the key signed */
  signed_hash: string
}

export type ReceiptAction =
  | { FunctionCall: { method: string; args: unknown; gas: string; deposit: string } }
  | { Transfer: { deposit: string } }
  | { CreateAccount: Record<string, never> }
  | { UseGlobalContract: { hash: string } }
  | { Delegate: { tx: string } }

export interface Receipt {
  n: number
  predecessor: string
  receiver: string
  actions: ReceiptAction[]
  then?: true
  parallelGroup?: string
  refund?: true
  /** decoded return value, e.g. "2", "\"450000000\"" */
  result?: string
  logs?: string[]
  /** (added) Gas copied from the real run because Sputnik/NEP-141 compute it ("≈ 18 Tgas"). */
  approx?: true
  /** (added) Who funds this receipt's attached deposit when it isn't the predecessor ("paid by the relayer"). */
  depositPaidBy?: string
}

/** get_proposal JSON (the 278adc7 shape: vote_counts values are strings) */
export interface ProposalJson {
  id: number
  proposer: string
  description: string
  kind: unknown
  status: "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Failed" | "Moved"
  vote_counts: Record<string, [string, string, string]>
  votes: Record<string, "Approve" | "Reject" | "Remove">
  submission_time: string
  last_actions_log: { block_height: string }[]
}

export interface Snapshot {
  pot: {
    status: "none" | "open" | "closing" | "closed"
    members: { account: string; joinIndex: number; contributed: string; instantUsed: string }[]
    /** (added) Hub ledger totals and requests (the state card's `spent_vote`, request #1 approved…) */
    ledger: { totalContributed: string; spentInstant: string; spentVote: string; reserved: string }
    requests: { id: number; path: "instant" | "vote"; status: string; amount: string; proposalId: number | null; category: string; requestRef: string }[]
  } | null
  dao: {
    exists: boolean
    members: string[]
    rulebot: string[]
    threshold: { k: number; n: number }
    lastProposalId: number
    proposals: ProposalJson[]
    floatNear: string
    /** (added) the raw Sputnik policy (shown decoded in chapter 1, raw on demand) */
    policy: unknown
  } | null
  /** micro-USDC strings; NEAR only where it's part of the story */
  balances: Record<string, { usdc: string; near?: string }>
}
