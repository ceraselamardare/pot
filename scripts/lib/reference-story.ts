// The reference story (LAUNCH.md "Final testnet deploy, before the lock"; docs/judging-guide.md J-7 / J-10): Pot's whole
// story in ONE well-named Pot under the current rules, against a locally running `next start`, then docs/proofs.json
// from that one run. Run it only after the final hub redeploy, with the human's OK (it signs and relays real testnet
// transactions):
//   (cd apps/web && pnpm build && pnpm exec next start -p 3418)   # env from apps/web/.env.local; FLAG_GIFTS=true
//   scripts/with-testnet-lock.sh scripts/run e2e-chain --reference --proofs docs/proofs.json [--base http://localhost:3418] [--skip-xc]
// People: Maya creates "Reference Trip" (trip rules: $100 instant, $200 each; one OK up to $300, earned trust, pay
// links); Sam and Leo join with the invite; Gus never joins. Throwaway 0-NEAR accounts (apps/web/e2e/testnet/
// accounts.ts), NEP-413 wallet sessions, every action a delegate relayed by POST /api/relay, as in the default story.
//   create → 2 joins → adds ($200, $200, $150) → $40 instant → $150 one-OK (Maya's own approval, Sam's OK) →
//   $30 with a receipt fingerprint (Maya's third paid spend: trust level 1) → $310 group vote (Maya, then Leo decides)
//   → Gus's $25 gift through a gift link → a $20 pay link Gus claims → a simulated $50 cross-chain deposit for Leo and
//   his add (skip with --skip-xc if the 1Click quote is down) → close proposed by Maya, approved by Maya and Sam →
//   refunds checked on chain.
// Then: the live views are read and checked, the proofs file is built (scripts/lib/proofs.ts) into a temp file and
// checked by `node scripts/verify-proofs.mjs --file <tmp>` against archival RPC; only when every proof holds does it
// replace the `--proofs` file (without --proofs nothing is written). Any failure exits 1 and leaves the file as it was.
// Cost of one run (estimate): ≈ 0.2 NEAR of preview funds (the Pot's 0.05 NEAR float + its account, ~25 relayed
// transactions with their per-proposal storage top-ups, 4 token registrations), ≈ 0.03 NEAR burnt from the holding
// account for the 4 accounts, and $650 of test dollars from the treasury ($600 faucet + the $50 simulated deposit).
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { newOpKey, spendRef, type DaoId, type RuleExtras } from "@pot/sdk"
import { generateClaimKey, generateInvite, signClaim, signJoin } from "@pot/sdk/sign"
import { createTestAccounts, type TestAccounts } from "@/e2e/testnet/accounts"
import { receiptFingerprint, validateSavedReceipt, type SavedReceipt } from "@/lib/receipt-saved"
import { account, DAO_CODE_HASH, eventually, IDS, near, sleep, usd, view } from "./env.ts"
import { $, assert, bal, kindOf, type E2E, type Relayed, type User } from "./e2e-http.ts"
import {
  buildReferenceProofs,
  missingEvents,
  proofsProblems,
  viewProblems,
  type ProofsFile,
  type ReferenceRun,
  type ReferenceStep,
} from "./proofs.ts"

export const POT_NAME = "Reference Trip"
const EXTRAS: RuleExtras = { trust: true, oneOkCap: $(300), links: true, goal: null }
const AMOUNTS = { faucet: { maya: 200, sam: 200, leo: 150, gus: 50 }, add: { maya: 200, sam: 200, leo: 150 }, instant: 40, oneOk: 150, receipt: 30, group: 310, gift: 25, link: 20, xc: 50 }
const VERIFY = fileURLToPath(new URL("../verify-proofs.mjs", import.meta.url))
const DEFAULT_BASE = { network: "testnet", rpc: "https://archival-rpc.testnet.fastnear.com", explorer: "https://testnet.nearblocks.io/txns/" }

/** A small fixed sample receipt (no NEAR AI reading): only its reading time is the run's, so the server can save it. */
export function sampleReceipt(readAtMs: number): SavedReceipt {
  return {
    v: 1,
    nonce: "7265666572656e63652d747269702d31",
    merchant: "Tasca do Chico",
    date: new Date(readAtMs).toISOString().slice(0, 10),
    currency: "USD",
    totalCents: 3000,
    taxCents: null,
    tipCents: null,
    items: [
      { name: "Grilled sardines", qty: 2, amountCents: 1800 },
      { name: "Green wine", qty: 1, amountCents: 1200 },
    ],
    fx: null,
    proof: null,
    source: "mock",
    readAt: new Date(readAtMs).toISOString(),
  }
}

type PotEventLite = { event: string; executor: string; data: unknown }

export async function runReference(e2e: E2E, args: string[], onAccounts: (a: TestAccounts) => void): Promise<void> {
  const { http, log, relay, walletSession } = e2e
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const proofsPath = flag("--proofs") ? resolve(flag("--proofs")!) : null
  const skipXc = args.includes("--skip-xc")
  let step = 0
  const hashes: Partial<Record<ReferenceStep, string>> = {}
  const relayEvents: Partial<Record<ReferenceStep, PotEventLite[]>> = {}
  const record = (id: ReferenceStep, r: Relayed) => {
    hashes[id] = r.txHash
    relayEvents[id] = (r.body.events as PotEventLite[] | undefined) ?? []
  }

  // ------------------------------------------------------------------ 0. preflight (no transactions)
  log(`REFERENCE STORY against ${e2e.base} (hub ${IDS.hub}, token ${IDS.usdc})${proofsPath ? `; proofs → ${proofsPath}` : "; no --proofs: nothing is written"}`)
  let base: Pick<ProofsFile, "network" | "rpc" | "explorer"> = DEFAULT_BASE
  if (proofsPath && existsSync(proofsPath)) {
    const old = JSON.parse(readFileSync(proofsPath, "utf8")) as Partial<ProofsFile>
    base = { network: old.network ?? DEFAULT_BASE.network, rpc: old.rpc ?? DEFAULT_BASE.rpc, explorer: old.explorer ?? DEFAULT_BASE.explorer }
  }
  const health = await http(null, "GET", "/api/health")
  assert(health.status === 200, `GET /api/health: ${health.status} ${JSON.stringify(health.body).slice(0, 200)}`)
  // gifts need FLAG_GIFTS on the server: the route answers 404 gifts_off_flag before anything else
  const giftsProbe = await http(null, "POST", "/api/gifts", {})
  assert(!JSON.stringify(giftsProbe.body).includes("gifts_off_flag"), "the server has gifts off: start it with FLAG_GIFTS=true")
  const config = await view<{ version: string; relayers: string[]; dao_code_hash: string; paused: boolean }>(IDS.hub, "get_config")
  assert(!config.paused, "the hub is paused")
  assert(JSON.stringify(config.relayers) === JSON.stringify([IDS.relayer]), `hub relayers ${JSON.stringify(config.relayers)}, expected [${IDS.relayer}]`)
  assert(config.dao_code_hash === DAO_CODE_HASH, `hub dao_code_hash ${config.dao_code_hash}, expected ${DAO_CODE_HASH}`)
  const spentBefore = await Promise.all([IDS.relayer, IDS.hub, IDS.treasury].map((a) => account(a).then((x) => BigInt(x?.amount ?? "0"))))
  log(`${++step}. preflight: health ok, gifts on, hub ${config.version} (relayer ${IDS.relayer}, DAO code ${DAO_CODE_HASH.slice(0, 8)}…)`)

  // ------------------------------------------------------------------ 1. people: three members and Gus, who never joins
  const accounts = await createTestAccounts(["Maya", "Sam", "Leo", "Gus"], (l) => log(l))
  onAccounts(accounts)
  const people: User[] = []
  for (const p of accounts.people) people.push(await walletSession(p))
  const [maya, sam, leo, gus] = people as [User, User, User, User]
  log(`${++step}. 4 wallet sessions (0 NEAR each)`)

  for (const [u, amount] of [[maya, AMOUNTS.faucet.maya], [sam, AMOUNTS.faucet.sam], [leo, AMOUNTS.faucet.leo], [gus, AMOUNTS.faucet.gus]] as const) {
    const f = await http(u, "POST", "/api/faucet", { amount: $(amount).toString(), idempotencyKey: newOpKey() })
    assert(f.status === 200, `faucet ${u.name}: ${f.status} ${JSON.stringify(f.body).slice(0, 300)}`)
    e2e.tx(`faucet ${u.name}`, f.body.txHash)
    assert((await eventually(() => bal(u.account), (b) => b === $(amount))) === $(amount), `${u.name} has $${amount}`)
  }
  log(`${++step}. faucet: test dollars for everyone`)

  // ------------------------------------------------------------------ 2. create, with the invite; policy v3
  const invite = generateInvite()
  const slug = `reference-trip-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`
  const created = await relay(maya, { type: "create_pot", slug: slug as never, name: POT_NAME, preset: "trip", rules: null, invitePk: invite.publicKey, emoji: "🧳", extras: EXTRAS }, "create_pot")
  const pot = String(created.result.potId)
  assert(pot === `${slug}.${IDS.hub}`, `pot id ${pot}`)
  record("create", created)
  const potView = await eventually(() => view<{ policy_version: number; extras: { trust: boolean; one_ok_cap: string } }>(IDS.hub, "get_pot", { pot }), (v) => !!v)
  assert(potView.policy_version === 3, `policy_version ${potView.policy_version}, expected 3 (a hub older than 1.3.0?)`)
  assert(potView.extras.trust && potView.extras.one_ok_cap === $(300).toString(), `extras ${JSON.stringify(potView.extras)}`)
  log(`${++step}. Pot ${pot} created (policy v3, one OK up to $300, trust on)`)

  for (const u of [sam, leo]) {
    const s = signJoin(invite.secret, pot, u.account)
    const j = await relay(u, { type: "join", pot: pot as never, invitePk: s.invitePk, signature: s.signature }, `join ${u.name}`)
    assert(j.result.status === "active", `${u.name} active`)
    if (u === sam) record("join", j)
  }
  log(`${++step}. Sam and Leo joined with the invite`)

  for (const [u, amount] of [[maya, AMOUNTS.add.maya], [sam, AMOUNTS.add.sam], [leo, AMOUNTS.add.leo]] as const) {
    const c = await relay(u, { type: "add_money", pot: pot as never, amount: $(amount) }, `add_money ${u.name}`)
    assert(c.result.recorded === true, `${u.name} contribution recorded`)
    if (u === maya) record("add-money", c)
  }
  const added = AMOUNTS.add.maya + AMOUNTS.add.sam + AMOUNTS.add.leo
  assert((await eventually(() => bal(pot), (b) => b === $(added))) === $(added), `Pot holds $${added}`)
  log(`${++step}. Pot balance ${usd($(added))}, 3 members`)

  // ------------------------------------------------------------------ 3. the three tiers (and trust)
  const spend = async (amount: number, category: "groceries" | "stay" | "food" | "tickets" | "other", label: string, extra: { requestRef?: string; link?: { claimPk: never } } = {}) => {
    const r = await relay(maya, { type: "request_spend", pot: pot as never, amount: $(amount), receiverId: (extra.link ? IDS.hub : maya.account) as never, category, requestRef: extra.requestRef ?? newOpKey(), ...(extra.link ? { link: extra.link } : {}) }, label)
    return { r, requestId: Number(r.result.requestId) }
  }
  const tierOf = async (requestId: number) => (await view<{ tier: string }[]>(IDS.hub, "get_record", { pot, from_index: requestId, limit: 1 }))[0]?.tier

  // instant: within the $100 rule
  const mayaBefore = await bal(maya.account)
  const inst = await spend(AMOUNTS.instant, "groceries", `instant spend $${AMOUNTS.instant}`)
  assert(inst.r.result.path === "instant" && inst.r.result.payout === "sent", `instant payout sent (${JSON.stringify(inst.r.result)})`)
  record("instant-spend", inst.r)
  assert((await eventually(() => bal(maya.account), (b) => b === mayaBefore + $(AMOUNTS.instant))) === mayaBefore + $(AMOUNTS.instant), `Maya +$${AMOUNTS.instant}`)
  log(`${++step}. instant $${AMOUNTS.instant} paid by the rules alone`)

  // one-OK: over $100, within $300; Maya's own approval (as the app does), then Sam's OK through the hub
  const ok = await spend(AMOUNTS.oneOk, "stay", `one-OK spend $${AMOUNTS.oneOk}`)
  assert(ok.r.result.path === "vote", `one-OK request on the vote path (${JSON.stringify(ok.r.result)})`)
  assert((await eventually(() => tierOf(ok.requestId), (t) => !!t)) === "one_ok", "the hub's tier is one_ok")
  const okPid = Number(ok.r.result.proposalId)
  const okKind = await eventually(() => kindOf(pot, okPid), (k) => !!k)
  const own = await relay(maya, { type: "vote", pot: pot as never, proposalId: okPid as never, kind: okKind, action: "VoteApprove" }, `approve $${AMOUNTS.oneOk} (Maya)`)
  assert(own.result.proposalStatus === "InProgress", "Maya's own approval: 1 of 2")
  const samOk = await relay(sam, { type: "ok_request", pot: pot as never, requestId: ok.requestId }, `OK $${AMOUNTS.oneOk} (Sam)`)
  assert(samOk.result.type === "ok" && samOk.result.approved === true, `Sam's OK approved it (${JSON.stringify(samOk.result)})`)
  record("one-ok", samOk)
  log(`${++step}. one-OK $${AMOUNTS.oneOk}: Sam's OK, the hub approved and paid`)

  // a receipt's fingerprint in the request_ref; Maya's third paid spend ≥ $10 → trust level 1 in the same call
  const receipt = sampleReceipt(Date.now())
  const valid = validateSavedReceipt(receipt)
  assert(valid.ok, `sample receipt: ${JSON.stringify(valid)}`)
  const fp = receiptFingerprint(receipt)
  const receiptRef = spendRef(newOpKey(), fp)
  const rc = await spend(AMOUNTS.receipt, "food", `receipt spend $${AMOUNTS.receipt}`, { requestRef: receiptRef })
  assert(rc.r.result.path === "instant" && rc.r.result.payout === "sent", `receipt spend paid instantly (${JSON.stringify(rc.r.result)})`)
  record("receipt", rc.r)
  // the details themselves are off chain (no transaction): saved for the app's details sheet, best effort
  const saved = await http(maya, "POST", `/api/pots/${pot}/requests/${rc.requestId}/receipt`, { receipt })
  if (saved.status !== 200 && saved.status !== 201) log(`   (warning) receipt details not saved: ${saved.status} ${JSON.stringify(saved.body).slice(0, 200)}`)
  const trust1 = await eventually(() => view<{ level: number }>(IDS.hub, "get_trust", { pot, account_id: maya.account }), (t) => t?.level === 1)
  assert(trust1?.level === 1, `Maya's trust level ${trust1?.level}, expected 1`)
  log(`${++step}. receipt spend $${AMOUNTS.receipt} (request_ref …${fp.slice(0, 16)}); Maya reached trust level 1`)

  // group: over the one-OK limit → a majority decides; Maya's own approval, Leo's deciding vote pays it
  const grp = await spend(AMOUNTS.group, "tickets", `group spend $${AMOUNTS.group}`)
  assert(grp.r.result.path === "vote" && grp.r.result.approvalsNeeded === 2, `group request, 2 of 3 (${JSON.stringify(grp.r.result)})`)
  assert((await eventually(() => tierOf(grp.requestId), (t) => !!t)) === "group", "the hub's tier is group")
  const gPid = Number(grp.r.result.proposalId)
  const gKind = await eventually(() => kindOf(pot, gPid), (k) => !!k)
  const g1 = await relay(maya, { type: "vote", pot: pot as never, proposalId: gPid as never, kind: gKind, action: "VoteApprove" }, `approve $${AMOUNTS.group} (Maya)`)
  assert(g1.result.proposalStatus === "InProgress", "1 of 2")
  const g2 = await relay(leo, { type: "vote", pot: pot as never, proposalId: gPid as never, kind: gKind, action: "VoteApprove" }, `approve $${AMOUNTS.group} (Leo)`)
  assert(g2.result.proposalStatus === "Approved" && g2.result.payout === "sent", `approved and paid (${JSON.stringify(g2.result)})`)
  record("group-vote", g2)
  let expected = $(added) - $(AMOUNTS.instant + AMOUNTS.oneOk + AMOUNTS.receipt + AMOUNTS.group)
  assert((await eventually(() => bal(pot), (b) => b === expected)) === expected, `Pot holds ${usd(expected)}`)
  log(`${++step}. group vote $${AMOUNTS.group}: Leo's deciding vote paid it; Pot ${usd(expected)}`)

  // ------------------------------------------------------------------ 4. money from outside, money to outside
  // a gift: Maya makes a one-time $25 gift link (off chain), Gus starts a gift through it and signs the transfer
  const gl = await http(maya, "POST", `/api/pots/${pot}/gift-links`, { amount: $(AMOUNTS.gift).toString(), tone: "gift", reusable: false, idempotencyKey: newOpKey() })
  assert(gl.status === 201 || gl.status === 200, `gift link: ${gl.status} ${JSON.stringify(gl.body).slice(0, 300)}`)
  const linkId = String((gl.body.link as { id: string }).id)
  const gs = await http(gus, "POST", "/api/gifts", { pot, linkId, amount: $(AMOUNTS.gift).toString(), idempotencyKey: newOpKey() })
  assert(gs.status === 201 || gs.status === 200, `gift start: ${gs.status} ${JSON.stringify(gs.body).slice(0, 300)}`)
  const giftRef = String((gs.body.gift as { ref: string }).ref)
  const gift = await relay(gus, { type: "send_gift", pot: pot as DaoId, amount: $(AMOUNTS.gift), giftRef }, `gift $${AMOUNTS.gift} (Gus)`)
  assert(gift.result.type === "gift" && gift.result.recorded === true, `gift recorded (${JSON.stringify(gift.result)})`)
  record("gift", gift)
  expected += $(AMOUNTS.gift)
  assert((await eventually(() => bal(pot), (b) => b === expected)) === expected, `Pot holds ${usd(expected)}`)
  log(`${++step}. Gus (not a member) gave $${AMOUNTS.gift}`)

  // a pay link: approved by the rules, paid into the hub's escrow, claimed by Gus with the link key's signature
  const claim = generateClaimKey()
  const pl = await spend(AMOUNTS.link, "other", `pay link $${AMOUNTS.link}`, { link: { claimPk: claim.publicKey as never } })
  assert(pl.r.result.path === "instant", `link spend on the instant path (${JSON.stringify(pl.r.result)})`)
  record("pay-link-make", pl.r)
  const funded = await eventually(() => view<{ claimable: boolean } | null>(IDS.hub, "get_link", { pot, request_id: pl.requestId }), (l) => l?.claimable === true, 45_000)
  assert(funded?.claimable === true, "the link is funded and claimable")
  const gusBefore = await bal(gus.account)
  const signature = signClaim(claim.secret, IDS.hub, pot, pl.requestId, gus.account)
  const cl = await relay(gus, { type: "claim_link", pot: pot as never, requestId: pl.requestId, receiverId: gus.account as never, signature }, `claim link $${AMOUNTS.link} (Gus)`)
  assert(cl.result.type === "link" && cl.result.ok === true, `claimed (${JSON.stringify(cl.result)})`)
  record("pay-link", cl)
  assert((await eventually(() => bal(gus.account), (b) => b === gusBefore + $(AMOUNTS.link))) === gusBefore + $(AMOUNTS.link), `Gus +$${AMOUNTS.link}`)
  expected -= $(AMOUNTS.link)
  log(`${++step}. pay link $${AMOUNTS.link}: funded into escrow, claimed by Gus`)

  // the simulated cross-chain deposit (no NEAR Intents testnet): quote → simulate → the treasury delivers → Leo adds it
  let xcAmount = 0n
  if (skipXc) log(`${++step}. cross-chain deposit skipped (--skip-xc)`)
  else {
    const q = await http(leo, "POST", "/api/oneclick/quote", { pot, chain: "base", amount: $(AMOUNTS.xc).toString(), idempotencyKey: newOpKey() })
    assert(q.status === 200 && q.body.mode === "simulated", `quote: ${q.status} ${JSON.stringify(q.body).slice(0, 300)} (rerun with --skip-xc if 1Click is down)`)
    const dep = String(q.body.depositIntentId)
    const sim = await http(leo, "POST", "/api/oneclick/simulate", { depositIntentId: dep, idempotencyKey: newOpKey() })
    assert(sim.status === 200, `simulate: ${sim.status} ${JSON.stringify(sim.body).slice(0, 300)}`)
    const leoBefore = await bal(leo.account)
    let st: Record<string, unknown> = {}
    for (const end = Date.now() + 180_000; Date.now() < end; ) {
      st = (await http(leo, "GET", `/api/oneclick/status/${dep}`)).body
      if (st.status === "SUCCESS" && st.destinationTxHash) break
      assert(!["FAILED", "REFUNDED", "EXPIRED", "INCOMPLETE_DEPOSIT"].includes(String(st.status)), `deposit ${String(st.status)}`)
      await sleep(3_000)
    }
    assert(st.status === "SUCCESS" && typeof st.destinationTxHash === "string", `deposit never arrived (${JSON.stringify(st).slice(0, 300)})`)
    xcAmount = BigInt(String(st.amountOut))
    hashes["cross-chain-delivery"] = String(st.destinationTxHash)
    e2e.tx("cross-chain delivery (treasury)", hashes["cross-chain-delivery"])
    assert((await eventually(() => bal(leo.account), (b) => b === leoBefore + xcAmount, 45_000)) === leoBefore + xcAmount, `Leo +${usd(xcAmount)}`)
    const xa = await relay(leo, { type: "add_money", pot: pot as never, amount: xcAmount }, `cross-chain add ${usd(xcAmount)} (Leo)`, { context: { depositIntentId: dep, source: "pot_dollars" } })
    assert(xa.result.recorded === true, "Leo's add recorded")
    record("cross-chain-add", xa)
    const marked = await http(leo, "GET", `/api/oneclick/status/${dep}?relayId=${String(xa.body.relayId)}`)
    if (marked.body.status !== "ADDED") log(`   (warning) the deposit was not marked ADDED: ${JSON.stringify(marked.body).slice(0, 200)}`)
    expected += xcAmount
    log(`${++step}. simulated deposit: ${usd(xcAmount)} delivered to Leo and added`)
  }
  assert((await eventually(() => bal(pot), (b) => b === expected)) === expected, `Pot holds ${usd(expected)}`)

  // ------------------------------------------------------------------ 5. close: wait out the busy window, propose, approve
  for (;;) {
    const pc = await view<{ blocked_reason?: string | null }>(IDS.hub, "preview_close", { pot, balance: null })
    if (!pc.blocked_reason) break
    log(`   close blocked: ${pc.blocked_reason}; waiting`)
    await sleep(5_000)
  }
  const members = [maya, sam, leo]
  const before = Object.fromEntries(await Promise.all(members.map(async (u) => [u.account, await bal(u.account)] as const)))
  const close = await relay(maya, { type: "propose_close", pot: pot as never }, "propose_close")
  record("close-propose", close)
  const cpid = Number(close.result.proposalId)
  const proposed = ((close.body.events as PotEventLite[] | undefined) ?? []).find((x) => x.event === "close_proposed")
  let payouts = ((proposed?.data as { payouts?: { account_id: string; amount: string }[] } | undefined)?.payouts ?? []).filter((p) => BigInt(p.amount) > 0n)
  if (!payouts.length) payouts = (await view<{ payouts: { account_id: string; amount: string }[] }>(IDS.hub, "preview_close", { pot, balance: null })).payouts.filter((p) => BigInt(p.amount) > 0n)
  assert(payouts.length > 0, "the close pays someone")
  const ckind = await eventually(() => kindOf(pot, cpid), (k) => !!k)
  const c1 = await relay(maya, { type: "vote", pot: pot as never, proposalId: cpid as never, kind: ckind, action: "VoteApprove" }, "approve close (Maya)")
  assert(c1.result.proposalStatus === "InProgress", "close 1 of 2")
  const c2 = await relay(sam, { type: "vote", pot: pot as never, proposalId: cpid as never, kind: ckind, action: "VoteApprove" }, "approve close (Sam)")
  assert(c2.result.proposalStatus === "Approved", "close approved")
  record("close-refund", c2)
  assert((await eventually(() => bal(pot), (b) => b === 0n, 45_000)) === 0n, "DAO balance 0")
  for (const p of payouts) {
    const u = members.find((m) => m.account === p.account_id)
    assert(u, `a payout to a non-member ${p.account_id}`)
    const want = before[u.account]! + BigInt(p.amount)
    assert((await eventually(() => bal(u.account), (b) => b === want)) === want, `${u.name} got ${usd(p.amount)} back`)
    log(`   ${u.name}: +${usd(p.amount)}`)
  }
  const pv = await eventually(() => view<{ status: string }>(IDS.hub, "get_pot", { pot }), (v) => v.status === "closed", 60_000)
  assert(pv.status === "closed", `hub status closed (got ${pv.status})`)
  log(`${++step}. closed: ${payouts.length} refunds paid, the DAO holds $0.00`)

  // ------------------------------------------------------------------ 6. the proofs: build, check live, verify on chain, write
  const recordLimit = 10
  const rec = await view<{ request_id: number }[]>(IDS.hub, "get_record", { pot, from_index: 0, limit: recordLimit })
  const trust = await view<{ level: number; multiplier: number; effective_cap: string }>(IDS.hub, "get_trust", { pot, account_id: maya.account })
  const run: ReferenceRun = {
    ids: { hub: IDS.hub, usdc: IDS.usdc, relayer: IDS.relayer, treasury: IDS.treasury },
    pot,
    potName: POT_NAME,
    people: { maya: maya.account, sam: sam.account, leo: leo.account, gus: gus.account },
    hashes,
    crossChain: !skipXc,
    amounts: {
      add: $(AMOUNTS.add.maya).toString(),
      instant: $(AMOUNTS.instant).toString(),
      oneOk: $(AMOUNTS.oneOk).toString(),
      receipt: $(AMOUNTS.receipt).toString(),
      group: $(AMOUNTS.group).toString(),
      gift: $(AMOUNTS.gift).toString(),
      link: $(AMOUNTS.link).toString(),
      xc: xcAmount.toString(),
    },
    receiptRef,
    giftRef,
    closePayouts: payouts.length,
    hub: { version: config.version, daoCodeHash: config.dao_code_hash },
    requestIds: { instant: inst.requestId, oneOk: ok.requestId, receipt: rc.requestId, group: grp.requestId, link: pl.requestId },
    recordIndex: Object.fromEntries(rec.map((e, i) => [e.request_id, i])),
    recordLimit,
    trust: { level: trust.level, multiplier: trust.multiplier, effectiveCap: trust.effective_cap },
  }
  assert(run.trust.level === 1 && run.trust.multiplier === 2 && run.trust.effectiveCap === $(200).toString(), `Maya's trust ${JSON.stringify(trust)}`)
  const proofs = buildReferenceProofs(run, base)
  const problems = proofsProblems(proofs)
  assert(!problems.length, `proofs file: ${problems.join("; ")}`)
  // every view, read live now (final), must already hold
  for (const v of proofs.views) {
    const value = await eventually(() => view(v.contract, v.method, v.args), (x) => viewProblems(x, v.expect).length === 0, 30_000)
    const bad = viewProblems(value, v.expect)
    assert(!bad.length, `view ${v.id}: ${bad.join("; ")}`)
  }
  // the relay's answers already carry most events: an early hint before the archival read (the verifier decides)
  for (const t of proofs.txs) {
    const evs = relayEvents[t.id as ReferenceStep]
    const miss = evs ? missingEvents(evs, t.expect) : []
    if (evs && miss.length) log(`   (hint) ${t.id}: the relay's answer lacks ${miss.join(", ")}; the verifier reads the chain`)
  }

  const candidate = join(tmpdir(), `pot-proofs-${slug}.json`)
  writeFileSync(candidate, `${JSON.stringify(proofs, null, 2)}\n`)
  log(`${++step}. proofs candidate ${candidate}: ${proofs.txs.length} transactions, ${proofs.views.length} views; verifying on archival RPC`)
  let verified = false
  for (let attempt = 1; attempt <= 4 && !verified; attempt++) {
    await sleep(attempt === 1 ? 15_000 : 30_000) // archival nodes trail the chain head by a few blocks
    const v = spawnSync(process.execPath, [VERIFY, "--file", candidate], { stdio: "inherit" })
    verified = v.status === 0
    if (!verified) log(`   verify-proofs exited ${v.status} (attempt ${attempt} of 4)`)
  }
  assert(verified, `the proofs don't hold yet; nothing was written. Inspect ${candidate} and rerun: node scripts/verify-proofs.mjs --file ${candidate}`)

  if (proofsPath) {
    writeFileSync(proofsPath, `${JSON.stringify(proofs, null, 2)}\n`)
    log(`${++step}. wrote ${proofsPath}`)
  } else log(`${++step}. no --proofs: ${candidate} is the result`)

  const spentAfter = await Promise.all([IDS.relayer, IDS.hub, IDS.treasury].map((a) => account(a).then((x) => BigInt(x?.amount ?? "0"))))
  const [dRelayer, dHub, dTreasury] = spentBefore.map((b, i) => b - spentAfter[i]!)
  console.log("\nALL TX HASHES")
  for (const [label, h] of e2e.txs) console.log(`  ${label.padEnd(32)} ${h}`)
  console.log(`\nNEAR spent: relayer ${near(dRelayer!)}, hub ${near(dHub!)}, treasury ${near(dTreasury!)} (plus the 4 accounts from the holding account)`)
  console.log(`\nREFERENCE STORY PASSED in ${((Date.now() - e2e.t0) / 1000).toFixed(0)} s`)
  console.log(`REFERENCE POT: ${pot}`)
  console.log(`  next: J-7's POT=${slug}.$HUB in docs/judging-guide.md and scripts/readme-cli-check.sh; the J-10 table from \`node scripts/verify-proofs.mjs --markdown\`; apps/web/lib/marketing/llms.ts`)
}
