// Backend E2E over HTTP (testnet): the full MVP story against a locally running `next start`. Rev 9: people sign
// in like anyone with a NEAR wallet: throwaway 0-NEAR accounts from the holding account (apps/web/e2e/testnet/
// accounts.ts), NEP-413 "Sign in to Pot" → POST /api/session/wallet; every action is a delegate signed with that
// account's key (@pot/sdk) and relayed by POST /api/relay.
//   (cd apps/web && pnpm build && pnpm exec next start -p 3418)      # env from apps/web/.env.local
//   scripts/with-testnet-lock.sh scripts/run e2e-chain [--base http://localhost:3418]
// Story: 3 wallet sessions → faucet → create a Pot (invite key) → 2 joins → 3 × $150 contributions → $84 instant
// spend (two-phase) → $300 vote spend + approvals → close proposal + approvals → pro-rata payouts verified on
// chain. Prints every tx hash; exits 1 on the first failed step. Spends ≈ 0.12 NEAR of preview funds.
// --reference plays the whole story in ONE Pot, "Reference Trip", and writes docs/proofs.json from it (J-10), only after
// every step and every proof held (scripts/lib/reference-story.ts; run it only after the final hub redeploy):
//   scripts/with-testnet-lock.sh scripts/run e2e-chain --reference --proofs docs/proofs.json [--base …] [--skip-xc]
// The HTTP helpers (sessions, relay, cookie jars) are shared: scripts/lib/e2e-http.ts.
import { newOpKey } from "@pot/sdk"
import { generateInvite, signJoin } from "@pot/sdk/sign"
import { createTestAccounts, type TestAccounts } from "@/e2e/testnet/accounts"
import { eventually, IDS, loadEnv, sleep, usd, view } from "./lib/env.ts"
import { $, assert, bal, createE2E, kindOf } from "./lib/e2e-http.ts"
import { runReference } from "./lib/reference-story.ts"

loadEnv()
const args = process.argv.slice(2)
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1]! : "http://localhost:3418"
const e2e = createE2E(BASE)
const { t0, txs, log, tx, http, walletSession, relay } = e2e
let step = 0

// ---------------------------------------------------------------------------------------------

async function main() {
  log(`E2E against ${BASE} (hub ${IDS.hub}, token ${IDS.usdc})`)
  const health = await http(null, "GET", "/api/health")
  assert(health.status === 200, `GET /api/health: ${health.status} ${JSON.stringify(health.body).slice(0, 200)}`)
  log(`${++step}. health ok`)

  // 1. three throwaway 0-NEAR testnet accounts (from the holding account) sign in with NEP-413: wallet sessions
  accounts = await createTestAccounts(["Maya", "Sam", "Leo"], (l) => log(l))
  const [maya, sam, leo] = [await walletSession(accounts.people[0]!), await walletSession(accounts.people[1]!), await walletSession(accounts.people[2]!)]
  log(`${++step}. 3 wallet sessions`)

  // 2. faucet: $150 test dollars each, from the treasury key pool
  for (const u of [maya, sam, leo]) {
    const f = await http(u, "POST", "/api/faucet", { amount: "150000000", idempotencyKey: newOpKey() })
    assert(f.status === 200, `faucet ${u.name}: ${f.status} ${JSON.stringify(f.body).slice(0, 300)}`)
    tx(`faucet ${u.name}`, f.body.txHash)
  }
  for (const u of [maya, sam, leo]) assert((await eventually(() => bal(u.account), (b) => b === $(150))) === $(150), `${u.name} has $150`)
  log(`${++step}. faucet: $150 each`)

  // 3. create a Pot with an invite key (the link's #secret never leaves the client)
  const invite = generateInvite()
  const slug = `e2e-${Math.random().toString(36).slice(2, 7)}`
  const created = await relay(maya, { type: "create_pot", slug: slug as never, name: "E2E Lisbon", preset: "trip", rules: null, invitePk: invite.publicKey, emoji: "🧳" }, "create_pot")
  const pot = String(created.result.potId)
  assert(pot === `${slug}.${IDS.hub}`, "pot id")
  const policy = await view<{ roles: { name: string; kind: unknown }[] }>(pot, "get_policy")
  assert(policy.roles.some((r) => r.name === "rulebot" && JSON.stringify(r.kind).includes(IDS.hub)), "hub is the rulebot")
  log(`${++step}. Pot ${pot} created (${created.finalMs} ms)`)

  // 4. invite + join (Sam, Leo sign pot-join:v1:<dao>:<account> with the invite secret)
  for (const u of [sam, leo]) {
    const s = signJoin(invite.secret, pot, u.account)
    const j = await relay(u, { type: "join", pot: pot as never, invitePk: s.invitePk, signature: s.signature }, `join ${u.name}`)
    assert(j.result.status === "active", `${u.name} active`)
  }
  log(`${++step}. Sam and Leo joined`)

  // 5. add money: $150 each through ft_transfer_call (1 yocto paid by the relayer)
  for (const u of [maya, sam, leo]) {
    const c = await relay(u, { type: "add_money", pot: pot as never, amount: $(150) }, `add_money ${u.name}`)
    assert(c.result.recorded === true, `${u.name} contribution recorded`)
  }
  assert((await eventually(() => bal(pot), (b) => b === $(450))) === $(450), "Pot holds $450")
  log(`${++step}. Pot balance $450.00, 3 members`)

  // 6. instant spend $84 (within the $100 Pot rule): early answer, then the payout
  const mayaBefore = await bal(maya.account)
  const inst = await relay(maya, { type: "request_spend", pot: pot as never, amount: $(84), receiverId: maya.account as never, category: "groceries", requestRef: newOpKey() }, "instant spend $84")
  log(`   two-phase: first answer ${inst.firstMs} ms (final: ${String(inst.first.final)}, path ${String((inst.first.result as Record<string, unknown>)?.path)}), final ${inst.finalMs} ms, payout ${String(inst.result.payout)}`)
  assert(inst.result.path === "instant" && inst.result.payout === "sent", "instant payout sent")
  assert(inst.firstMs <= 4_000, `early answer ≤ 4 s (got ${inst.firstMs})`)
  assert(inst.finalMs <= 10_000, `final ≤ 10 s (got ${inst.finalMs})`)
  assert((await eventually(() => bal(maya.account), (b) => b === mayaBefore + $(84))) === mayaBefore + $(84), "Maya +$84")
  log(`${++step}. instant $84 paid; Pot $366`)

  // 7. vote spend $300: Maya's own approval, then Sam's → approved and paid
  const vote = await relay(maya, { type: "request_spend", pot: pot as never, amount: $(300), receiverId: maya.account as never, category: "stay", requestRef: newOpKey() }, "vote spend $300")
  assert(vote.result.path === "vote" && vote.result.approvalsNeeded === 2, "vote path, 2 of 3")
  const pid = Number(vote.result.proposalId)
  const kind = await kindOf(pot, pid)
  const v1 = await relay(maya, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" }, "approve $300 (Maya)")
  assert(v1.result.proposalStatus === "InProgress", "1 of 2")
  const v2 = await relay(sam, { type: "vote", pot: pot as never, proposalId: pid as never, kind, action: "VoteApprove" }, "approve $300 (Sam)")
  assert(v2.result.proposalStatus === "Approved" && v2.result.payout === "sent", "approved and paid")
  assert((await eventually(() => bal(pot), (b) => b === $(66))) === $(66), "Pot holds $66")
  log(`${++step}. vote spend $300 approved 2 of 3 and paid; Pot $66`)

  // 8. close: wait out the 60 s busy window after the last money move, propose, approve
  for (;;) {
    const pc = await view<{ blocked_reason?: string | null }>(IDS.hub, "preview_close", { pot, balance: null })
    if (!pc.blocked_reason) break
    log(`   close blocked: ${pc.blocked_reason}; waiting`)
    await sleep(5_000)
  }
  const before = Object.fromEntries(await Promise.all([maya, sam, leo].map(async (u) => [u.account, await bal(u.account)] as const)))
  const close = await relay(maya, { type: "propose_close", pot: pot as never }, "propose_close")
  const cpid = Number(close.result.proposalId)
  const ckind = await kindOf(pot, cpid)
  const c1 = await relay(maya, { type: "vote", pot: pot as never, proposalId: cpid as never, kind: ckind, action: "VoteApprove" }, "approve close (Maya)")
  assert(c1.result.proposalStatus === "InProgress", "close 1 of 2")
  const c2 = await relay(sam, { type: "vote", pot: pot as never, proposalId: cpid as never, kind: ckind, action: "VoteApprove" }, "approve close (Sam)")
  assert(c2.result.proposalStatus === "Approved", "close approved")
  log(`${++step}. close approved 2 of 3`)

  // 9. verify on chain: pro-rata $66 × 150/450 = $22 each, the DAO at 0, the Pot closed
  assert((await eventually(() => bal(pot), (b) => b === 0n)) === 0n, "DAO balance 0")
  for (const u of [maya, sam, leo]) {
    const got = (await eventually(() => bal(u.account), (b) => b === before[u.account]! + $(22))) - before[u.account]!
    assert(got === $(22), `${u.name} got ${usd(got)} (want $22.00)`)
    log(`   ${u.name}: +${usd(got)} (pro-rata 150/450 of $66)`)
  }
  const pv = await eventually(() => view<{ status: string }>(IDS.hub, "get_pot", { pot }), (v) => v.status === "closed", 30_000)
  assert(pv.status === "closed", `hub status closed (got ${pv.status})`)
  const feed = await http(maya, "GET", `/api/pots/${pot}/feed`)
  log(`${++step}. on chain: DAO $0.00, $22.00 each, hub status ${pv.status}; feed ${feed.status} with ${(feed.body.items as unknown[] | undefined)?.length ?? 0} items`)

  console.log("\nALL TX HASHES")
  for (const [label, h] of txs) console.log(`  ${label.padEnd(28)} ${h}`)
  console.log(`\nE2E PASSED in ${((Date.now() - t0) / 1000).toFixed(0)} s (${txs.length} txs)`)
}

let accounts: TestAccounts | undefined
const run = args.includes("--reference") ? () => runReference(e2e, args, (a) => (accounts = a)) : main
run()
  .then(() => accounts?.release())
  .catch(async (e) => {
    console.error(String(e instanceof Error ? e.message : e))
    if (txs.length) {
      console.log("\nTX HASHES SO FAR")
      for (const [label, h] of txs) console.log(`  ${label.padEnd(28)} ${h}`)
    }
    await accounts?.release()
    process.exit(1)
  })
