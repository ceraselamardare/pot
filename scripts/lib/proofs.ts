// docs/proofs.json for the reference story (scripts/e2e-chain.ts --reference, scripts/lib/reference-story.ts): the
// schema that scripts/verify-proofs.mjs checks, built from one run's recorded hashes and ids. Pure: no network, no
// files, so the unit tests (proofs.test.ts) pin the shape. The expected events and logs come from the hub's code
// (contracts/pot-hub/src: events.rs and the "auto: …" act_proposal memos in lib.rs / wave4.rs), not from a run.

/** One expectation on a transaction: a log substring, or an EVENT_JSON event (by emitting account, data, count). */
export type TxExpect = { log: string } | { event: string; in?: string; data?: Record<string, unknown>; count?: number }

export interface ProofTx {
  id: string
  action: string
  hash: string
  /** who sent it, when not the relayer (a `direct` call) */
  sender?: string
  call: { receiver: string; method: string; direct?: true }
  expect: TxExpect[]
  shows: string
}

export type ViewExpect = { path: string; equals: unknown } | { path: string; sameSet: unknown[] }

export interface ProofView {
  id: string
  what: string
  contract: string
  method: string
  args: Record<string, unknown>
  expect: ViewExpect[]
}

export interface ProofsFile {
  about: string
  network: string
  rpc: string
  explorer: string
  relayer: string
  hub: string
  /** the reference Pot every transaction below comes from (absent in files written before the reference story) */
  pot?: string
  txs: ProofTx[]
  views: ProofView[]
}

/** The story's transactions, in order. The two cross-chain steps are left out when the run skipped them. */
export const REFERENCE_STEPS = [
  "create",
  "join",
  "add-money",
  "instant-spend",
  "one-ok",
  "receipt",
  "group-vote",
  "gift",
  "pay-link-make",
  "pay-link",
  "cross-chain-delivery",
  "cross-chain-add",
  "close-propose",
  "close-refund",
] as const
export type ReferenceStep = (typeof REFERENCE_STEPS)[number]
const CROSS_CHAIN: readonly ReferenceStep[] = ["cross-chain-delivery", "cross-chain-add"]

/** Everything one run recorded that the proofs need. Amounts are USDC micro units as decimal strings. */
export interface ReferenceRun {
  ids: { hub: string; usdc: string; relayer: string; treasury: string }
  pot: string
  potName: string
  /** account ids; maya created the Pot, sam and leo joined, gus never joined */
  people: { maya: string; sam: string; leo: string; gus: string }
  hashes: Partial<Record<ReferenceStep, string>>
  /** false when the run was told to skip the simulated cross-chain deposit */
  crossChain: boolean
  amounts: {
    add: string
    instant: string
    oneOk: string
    receipt: string
    group: string
    gift: string
    link: string
    /** what the simulated deposit delivered, and Leo put in */
    xc: string
  }
  /** the receipt spend's request_ref: its op key + the first 16 hex chars of the receipt's SHA-256 */
  receiptRef: string
  giftRef: string
  /** the close's payouts with an amount > 0 (one ft_transfer each in the deciding approval) */
  closePayouts: number
  hub: { version: string; daoCodeHash: string }
  /** the hub's request ids of the spends */
  requestIds: { instant: number; oneOk: number; receipt: number; group: number; link: number }
  /** request id → its index in get_record(pot, 0, recordLimit) (refused requests would be gaps) */
  recordIndex: Record<number, number>
  recordLimit: number
  /** get_trust(pot, maya) after the story */
  trust: { level: number; multiplier: number; effectiveCap: string }
}

export const POLICY_V3_MEMBER_PERMISSIONS = ["*:VoteApprove", "*:VoteReject"]

const dollars = (micro: string): string => {
  const n = Number(BigInt(micro)) / 1e6
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

export function referenceAbout(r: Pick<ReferenceRun, "ids" | "pot" | "potName">): string {
  return (
    `Real testnet transactions and read-only views, one per thing Pot claims to do, all from one Pot: ${r.pot} ("${r.potName}"), ` +
    `played start to finish by scripts/e2e-chain.ts --reference. scripts/verify-proofs.mjs checks every entry (read-only, no keys, ` +
    `no install) and docs/judging-guide.md J-10 lists them. Every tx except the simulated cross-chain delivery (sent directly by ` +
    `${r.ids.treasury}, the testnet stand-in for 1Click) is a NEP-366 delegate: the person signed it with 0 NEAR, and the relayer ` +
    `${r.ids.relayer} sent it and paid the gas.`
  )
}

/** The proofs file for one reference run. `base` keeps the existing file's network, RPC and explorer. */
export function buildReferenceProofs(r: ReferenceRun, base: Pick<ProofsFile, "network" | "rpc" | "explorer">): ProofsFile {
  const { hub, usdc, treasury } = r.ids
  const { maya, sam, leo, gus } = r.people
  const pot = r.pot
  const a = r.amounts
  const fp = r.receiptRef.slice(16)
  const tx = (id: ReferenceStep, p: Omit<ProofTx, "id" | "hash">): ProofTx => {
    const hash = r.hashes[id]
    if (!hash) throw new Error(`no hash recorded for ${id}`)
    return { id, action: p.action, hash, ...(p.sender ? { sender: p.sender } : {}), call: p.call, expect: p.expect, shows: p.shows }
  }
  const ft = { in: usdc, event: "ft_transfer" }
  const txs: ProofTx[] = [
    tx("create", {
      action: "Start a Pot under the current rules (policy v3)",
      call: { receiver: hub, method: "create_pot" },
      expect: [
        { in: hub, event: "pot_created", data: { pot, creator: maya, preset: "trip" } },
        { in: hub, event: "rule_extras_set", data: { pot, policy_version: 3 } },
        { in: hub, event: "invite_added", data: { pot } },
      ],
      shows: `Maya's one signed call: the hub creates ${pot} as a Sputnik DAO from the global code (policy v3: members only vote), with trip rules ($100 instant, $200 each), one OK up to $300, earned trust and pay links on, and its first invite.`,
    }),
    tx("join", {
      action: "Join with an invite link",
      call: { receiver: hub, method: "join" },
      expect: [{ log: "auto: valid Pot invite" }, { in: hub, event: "member_joined", data: { pot, member: sam } }],
      shows: "Sam signs with the invite link's key; the hub checks the ed25519 signature, files AddMemberToRole in the DAO and approves it with its 1-of-1 rulebot seat.",
    }),
    tx("add-money", {
      action: "Put money in",
      call: { receiver: usdc, method: "ft_transfer_call" },
      expect: [ft, { in: hub, event: "contribution", data: { pot, member: maya, amount: a.add } }],
      shows: `Maya's ft_transfer_call to the hub moves ${dollars(a.add)} of test dollars into the Pot's DAO and records her contribution (the relayer pays the 1 yoctoNEAR deposit).`,
    }),
    tx("instant-spend", {
      action: "A small spend approved by the rules alone",
      call: { receiver: hub, method: "request_spend" },
      expect: [
        { in: hub, event: "spend_requested", data: { pot, tier: "instant", path: "instant" } },
        { log: "auto: within Pot rules" },
        ft,
        { in: hub, event: "spend_auto_approved", data: { pot, requester: maya } },
      ],
      shows: `Maya asks for ${dollars(a.instant)}: within the $100 rule, so the hub files a Transfer proposal and approves it with its rulebot seat, and the DAO pays out in the same call chain. Nobody voted.`,
    }),
    tx("one-ok", {
      action: "A bigger spend paid after one other member's OK",
      call: { receiver: hub, method: "ok_request" },
      expect: [{ log: "auto: one member OK" }, ft, { in: hub, event: "spend_ok_approved", data: { pot, requester: maya, by: sam, amount: a.oneOk } }],
      shows: `Maya's ${dollars(a.oneOk)} is over the instant limit but within one OK. Sam's OK goes to the hub, which checks it is allowed (not the payee, joined earlier, has put money in) and approves the DAO transfer: it is paid.`,
    }),
    tx("receipt", {
      action: "A spend with a scanned receipt's fingerprint",
      call: { receiver: hub, method: "request_spend" },
      expect: [
        { in: hub, event: "spend_requested", data: { pot, request_ref: r.receiptRef } },
        { in: hub, event: "spend_auto_approved", data: { pot, requester: maya } },
        { in: hub, event: "trust_level_changed", data: { pot, member: maya, from: 0, to: 1, cause: "settled" } },
      ],
      shows: `The ${dollars(a.receipt)} spend's request_ref is its 16-character operation key followed by ${fp}, the first 64 bits of the saved receipt's SHA-256. It is Maya's third paid spend, so the hub raises her trust to level 1 in the same call.`,
    }),
    tx("group-vote", {
      action: "A spend decided by a group vote",
      call: { receiver: pot, method: "act_proposal" },
      expect: [ft],
      shows: `Maya's ${dollars(a.group)} is over the one-OK limit, so the group decides. Leo's VoteApprove goes straight to the Pot's DAO; it is the deciding vote (2 of 3), so the DAO pays in the same transaction.`,
    }),
    tx("gift", {
      action: "Someone outside the group chips in",
      call: { receiver: usdc, method: "ft_transfer_call" },
      expect: [ft, { in: hub, event: "gift_received", data: { pot, from: gus, amount: a.gift, ref: r.giftRef } }],
      shows: `Gus, who never joined, pays ${dollars(a.gift)} into the Pot through a gift link; the hub records it as a gift, not a member's contribution.`,
    }),
    tx("pay-link-make", {
      action: "Pay someone outside the Pot by link",
      call: { receiver: hub, method: "request_spend" },
      expect: [
        { in: hub, event: "spend_requested", data: { pot, link: true, tier: "instant" } },
        { in: hub, event: "spend_auto_approved", data: { pot, requester: maya } },
        { in: hub, event: "link_funded", data: { pot, amount: a.link } },
      ],
      shows: `Maya pays ${dollars(a.link)} by link: the rules approve it, and the DAO pays it into the hub's escrow until whoever holds the link claims it.`,
    }),
    tx("pay-link", {
      action: "Get paid by a pay link",
      call: { receiver: hub, method: "claim_link" },
      expect: [ft, { in: hub, event: "link_claimed", data: { pot, receiver_id: gus, amount: a.link } }],
      shows: "Gus, outside the Pot, claims it with a brand-new signature from the link's key; the hub checks the signature and pays him from escrow.",
    }),
  ]
  if (r.crossChain)
    txs.push(
      tx("cross-chain-delivery", {
        action: "Money from another chain arrives (simulated on testnet)",
        sender: treasury,
        call: { receiver: usdc, method: "ft_transfer", direct: true },
        // NEP-141 events carry an array in `data`, so they are matched by name and emitter only
        expect: [ft],
        shows: `There is no NEAR Intents testnet, so after a 1Click-priced quote the simulator (${treasury}) delivers the quoted ${dollars(a.xc)} to Leo; the next row is Leo putting it in.`,
      }),
      tx("cross-chain-add", {
        action: "…and goes into the Pot",
        call: { receiver: usdc, method: "ft_transfer_call" },
        expect: [{ in: hub, event: "contribution", data: { pot, member: leo, amount: a.xc } }],
        shows: "The delivered dollars go into the Pot in one tap, recorded as Leo's contribution.",
      }),
    )
  txs.push(
    tx("close-propose", {
      action: "Ask the group to close the Pot",
      call: { receiver: hub, method: "propose_close" },
      expect: [{ in: hub, event: "close_proposed", data: { pot, by: maya } }],
      shows: "The hub files one FunctionCall proposal holding every member's pro-rata refund; members then approve it.",
    }),
    tx("close-refund", {
      action: "Close: everyone gets their share back",
      call: { receiver: pot, method: "act_proposal" },
      expect: [{ in: usdc, event: "ft_transfer", count: r.closePayouts }],
      shows: `Sam's deciding approval of the close runs every refund in one receipt (${r.closePayouts} ft_transfers, one per member).`,
    }),
  )

  const rec = (requestId: number, fields: Record<string, unknown>): ViewExpect[] => {
    const i = r.recordIndex[requestId]
    if (i === undefined) throw new Error(`request ${requestId} is not in the record`)
    return Object.entries(fields).map(([k, v]) => ({ path: `${i}.${k}`, equals: v }))
  }
  const q = r.requestIds
  const views: ProofView[] = [
    {
      id: "hub",
      what: "The hub's version, its only relayer and the DAO code it deploys",
      contract: hub,
      method: "get_config",
      args: {},
      expect: [
        { path: "version", equals: r.hub.version },
        { path: "relayers", equals: [r.ids.relayer] },
        { path: "dao_code_hash", equals: r.hub.daoCodeHash },
      ],
    },
    {
      id: "pot",
      what: "The reference Pot: closed after the whole story, policy v3, one OK and trust on",
      contract: hub,
      method: "get_pot",
      args: { pot },
      expect: [
        { path: "name", equals: r.potName },
        { path: "status", equals: "closed" },
        { path: "policy_version", equals: 3 },
        { path: "member_count", equals: 3 },
        { path: "extras.trust", equals: true },
        { path: "extras.one_ok_cap", equals: "300000000" },
      ],
    },
    {
      id: "policy-v3",
      what: "A current Pot: members can only vote; only the hub files proposals",
      contract: pot,
      method: "get_policy",
      args: {},
      expect: [
        { path: "roles.0.name", equals: "member" },
        { path: "roles.0.kind.Group", sameSet: [maya, sam, leo] },
        { path: "roles.0.permissions", sameSet: POLICY_V3_MEMBER_PERMISSIONS },
        { path: "roles.1.name", equals: "rulebot" },
        { path: "roles.1.kind.Group", equals: [hub] },
      ],
    },
    {
      id: "trust",
      what: "Earned trust: after three paid spends, Maya's instant limit doubled",
      contract: hub,
      method: "get_trust",
      args: { pot, account_id: maya },
      expect: [
        { path: "level", equals: r.trust.level },
        { path: "multiplier", equals: r.trust.multiplier },
        { path: "effective_cap", equals: r.trust.effectiveCap },
      ],
    },
    {
      id: "record",
      what: "The public record: every spend with its tier and who approved it",
      contract: hub,
      method: "get_record",
      args: { pot, from_index: 0, limit: r.recordLimit },
      expect: [
        ...rec(q.instant, { tier: "instant", approved_by: "rules", money: "paid" }),
        ...rec(q.oneOk, { tier: "one_ok", approved_by: "one_ok", ok_by: sam, money: "paid" }),
        ...rec(q.receipt, { tier: "instant", approved_by: "rules", request_ref: r.receiptRef }),
        ...rec(q.group, { tier: "group", approved_by: "group", money: "paid" }),
        ...rec(q.link, { link: true, payee: gus, money: "paid" }),
      ],
    },
  ]

  return {
    about: referenceAbout(r),
    network: base.network,
    rpc: base.rpc,
    explorer: base.explorer,
    relayer: r.ids.relayer,
    hub,
    pot,
    txs,
    views,
  }
}

const HASH_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/

/** What scripts/verify-proofs.mjs relies on, checked before a file is written. [] = fine. */
export function proofsProblems(f: ProofsFile): string[] {
  const out: string[] = []
  for (const k of ["about", "network", "rpc", "explorer", "relayer", "hub"] as const) if (typeof f[k] !== "string" || !f[k]) out.push(`${k} missing`)
  const ids = new Set<string>()
  const hashes = new Set<string>()
  for (const t of f.txs) {
    if (ids.has(t.id)) out.push(`duplicate id ${t.id}`)
    ids.add(t.id)
    if (!HASH_RE.test(t.hash)) out.push(`${t.id}: bad hash ${t.hash}`)
    if (hashes.has(t.hash)) out.push(`${t.id}: hash ${t.hash} used twice`)
    hashes.add(t.hash)
    if (!t.call.receiver || !t.call.method) out.push(`${t.id}: call needs receiver and method`)
    if (t.call.direct && !t.sender) out.push(`${t.id}: a direct call needs its sender`)
    if (!t.expect.length) out.push(`${t.id}: no expectations`)
    for (const e of t.expect) {
      if ("log" in e) continue
      if (!e.event) out.push(`${t.id}: an expectation without event or log`)
      if (e.count !== undefined && (!Number.isInteger(e.count) || e.count < 1)) out.push(`${t.id}: bad count ${e.count}`)
    }
    if (!t.action || !t.shows) out.push(`${t.id}: action and shows are required`)
  }
  for (const v of f.views) {
    if (ids.has(v.id)) out.push(`duplicate id ${v.id}`)
    ids.add(v.id)
    if (!v.contract || !v.method || !v.what) out.push(`${v.id}: contract, method and what are required`)
    if (!v.expect.length) out.push(`${v.id}: no expectations`)
  }
  return out
}

/** verify-proofs.mjs's view check (`path` with `equals` or `sameSet`), for checking live values before writing. */
export const valueAt = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj)

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function viewProblems(value: unknown, expect: ViewExpect[]): string[] {
  const out: string[] = []
  for (const e of expect) {
    const got = valueAt(value, e.path)
    if ("equals" in e && !same(got, e.equals)) out.push(`${e.path} is ${JSON.stringify(got)}, expected ${JSON.stringify(e.equals)}`)
    if ("sameSet" in e && !(Array.isArray(got) && same([...got].sort(), [...e.sameSet].sort())))
      out.push(`${e.path} is ${JSON.stringify(got)}, expected exactly ${JSON.stringify(e.sameSet)}`)
  }
  return out
}

/** A relayed tx's events (the relay's answer, `PotEvent`s with their executor) against a step's event expectations:
 *  an early hint before the verifier reads the chain (logs aren't in the relay's answer, so they're skipped). */
export function missingEvents(events: { event: string; executor: string; data: unknown }[], expect: TxExpect[]): string[] {
  const out: string[] = []
  for (const e of expect) {
    if ("log" in e) continue
    const hits = events.filter(
      (x) => x.event === e.event && (!e.in || x.executor === e.in) && Object.entries(e.data ?? {}).every(([k, v]) => same((x.data as Record<string, unknown> | null)?.[k], v)),
    )
    if (hits.length < (e.count ?? 1)) out.push(`${e.count ?? 1}× ${e.event}${e.in ? ` from ${e.in}` : ""}${e.data ? ` with ${JSON.stringify(e.data)}` : ""} (saw ${hits.length})`)
  }
  return out
}
