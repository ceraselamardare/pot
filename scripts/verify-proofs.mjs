#!/usr/bin/env node
// Live proofs (docs/judging-guide.md J-10): checks every real testnet transaction and view in docs/proofs.json.
// Read-only (EXPERIMENTAL_tx_status and call_function on archival FastNEAR), no keys, no install: plain Node ≥ 18.
//   node scripts/verify-proofs.mjs              → one line per proof; exit 1 if a proof doesn't hold, exit 2 if the
//                                                 RPC couldn't be reached (rate limit: run it again in a minute)
//   node scripts/verify-proofs.mjs --markdown   → the J-10 table (scripts/check-readme-steps.ts keeps the guide in step)
//   node scripts/verify-proofs.mjs --rpc <url>  → another archival RPC
//   node scripts/verify-proofs.mjs --file <path> → check another proofs file (the reference story checks its candidate)
// For each tx it checks: the relayer sent it (or the entry's `sender`); inside is one NEP-366 delegate to the expected contract and method;
// no receipt failed (a relayed tx's top-level status hides inner failures); the expected events and logs appear.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const argv = process.argv.slice(2)
const FILE = argv.includes("--file") ? resolve(argv[argv.indexOf("--file") + 1]) : new URL("../docs/proofs.json", import.meta.url)
const proofs = JSON.parse(readFileSync(FILE, "utf8"))
const RPC = argv.includes("--rpc") ? argv[argv.indexOf("--rpc") + 1] : proofs.rpc
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

/** The RPC didn't answer (rate limit, network): says nothing about the proof itself. */
class Unreachable extends Error {}

async function rpc(method, params) {
  for (let attempt = 0; attempt < 7; attempt++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "proofs", method, params }),
    }).catch(() => null)
    const body = res?.ok ? await res.json().catch(() => null) : null
    if (body?.result) return body.result
    if (body?.error && body.error.cause?.name !== "TOO_MANY_REQUESTS") throw new Error(JSON.stringify(body.error))
    // rate limited or flaky: back off (FastNEAR's free tier answers 429 after bursts), honoring Retry-After
    const wait = Number(res?.headers?.get?.("retry-after")) * 1000 || Math.min(1500 * 2 ** attempt, 20_000)
    await sleep(wait)
  }
  throw new Unreachable(`${method}: no answer from ${RPC} (rate limited?)`)
}

function events(tx) {
  const out = []
  for (const r of tx.receipts_outcome)
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue
      try {
        out.push({ in: r.outcome.executor_id, ...JSON.parse(log.slice("EVENT_JSON:".length)) })
      } catch {}
    }
  return out
}

const at = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

async function checkTx(p) {
  const problems = []
  const sender = p.sender ?? proofs.relayer
  const tx = await rpc("EXPERIMENTAL_tx_status", { tx_hash: p.hash, sender_account_id: sender, wait_until: "NONE" })
  if (tx.transaction.signer_id !== sender) problems.push(`sent by ${tx.transaction.signer_id}, expected ${sender}`)
  // `direct`: the server's own call (the testnet stand-in for a cross-chain delivery), not a person's delegate
  const delegate = p.call.direct
    ? { sender_id: tx.transaction.signer_id, receiver_id: tx.transaction.receiver_id, actions: tx.transaction.actions }
    : tx.transaction.actions[0]?.Delegate?.delegate_action
  const inner = delegate?.actions?.[0]?.FunctionCall
  if (!delegate) problems.push("not a NEP-366 delegate")
  else if (delegate.receiver_id !== p.call.receiver || inner?.method_name !== p.call.method)
    problems.push(`signed call is ${delegate.receiver_id}.${inner?.method_name}, expected ${p.call.receiver}.${p.call.method}`)
  if (!("SuccessValue" in tx.status)) problems.push(`status ${JSON.stringify(tx.status).slice(0, 80)}`)
  const failed = tx.receipts_outcome.filter((r) => "Failure" in r.outcome.status)
  if (failed.length) problems.push(`${failed.length} receipt(s) failed`)
  const evs = events(tx)
  const logs = tx.receipts_outcome.flatMap((r) => r.outcome.logs)
  for (const e of p.expect) {
    if (e.log) {
      if (!logs.some((l) => l.includes(e.log))) problems.push(`no log "${e.log}"`)
      continue
    }
    const hits = evs.filter(
      (x) => x.event === e.event && (!e.in || x.in === e.in) && Object.entries(e.data ?? {}).every(([k, v]) => same(x.data?.[k], v)),
    )
    if (hits.length < (e.count ?? 1)) problems.push(`expected ${e.count ?? 1}× ${e.event}${e.in ? ` from ${e.in}` : ""}${e.data ? ` with ${JSON.stringify(e.data)}` : ""}, found ${hits.length}`)
  }
  // the date is for the reader only, so a failed lookup doesn't fail the proof
  const when = await rpc("block", { block_id: tx.transaction_outcome.block_hash })
    .then((b) => new Date(Number(BigInt(b.header.timestamp) / 1_000_000n)).toISOString().slice(0, 10))
    .catch(() => "date unknown")
  return { problems, detail: `${delegate?.sender_id} → ${p.call.receiver}.${p.call.method}, ${when}, ${tx.receipts_outcome.length} receipts` }
}

async function checkView(v) {
  const res = await rpc("query", {
    request_type: "call_function",
    finality: "final",
    account_id: v.contract,
    method_name: v.method,
    args_base64: Buffer.from(JSON.stringify(v.args)).toString("base64"),
  })
  const value = JSON.parse(Buffer.from(res.result).toString("utf8"))
  const problems = []
  for (const e of v.expect) {
    const got = at(value, e.path)
    if ("equals" in e && !same(got, e.equals)) problems.push(`${e.path} is ${JSON.stringify(got)}, expected ${JSON.stringify(e.equals)}`)
    if ("sameSet" in e && !(Array.isArray(got) && same([...got].sort(), [...e.sameSet].sort())))
      problems.push(`${e.path} is ${JSON.stringify(got)}, expected exactly ${JSON.stringify(e.sameSet)}`)
  }
  return { problems, detail: `${v.contract}.${v.method}(${JSON.stringify(v.args)})` }
}

if (argv.includes("--markdown")) {
  console.log("| Action | Transaction | What it shows |\n|---|---|---|")
  for (const p of proofs.txs) console.log(`| ${p.action} | [\`${p.hash.slice(0, 8)}…\`](${proofs.explorer}${p.hash}) | ${p.shows} |`)
  console.log("\n| View (read-only) | Call | What it shows |\n|---|---|---|")
  for (const v of proofs.views) {
    const args = v.args && Object.keys(v.args).length ? ` \`${JSON.stringify(v.args)}\`` : ""
    console.log(`| ${v.id} | \`${v.contract}\` \`${v.method}\`${args} | ${v.what} |`)
  }
  process.exit(0)
}

let bad = 0
let unreachable = 0
console.log(`Live proofs on ${proofs.network}, read-only via ${RPC}\n`)
for (const item of [...proofs.txs.map((p) => ["tx", p]), ...proofs.views.map((v) => ["view", v])]) {
  const [kind, p] = item
  let r
  try {
    // after one proof found the RPC unreachable (it already waited through every back-off), don't wait again per proof
    if (unreachable) throw new Unreachable("skipped: the RPC is not answering")
    r = kind === "tx" ? await checkTx(p) : await checkView(p)
  } catch (e) {
    r = { problems: [String(e.message ?? e).slice(0, 160)], detail: "", unreachable: e instanceof Unreachable }
  }
  if (r.unreachable) unreachable++
  else bad += r.problems.length ? 1 : 0
  console.log(`${r.unreachable ? "??  " : r.problems.length ? "FAIL" : "ok  "} ${kind === "tx" ? p.action : p.what}`)
  console.log(`     ${kind === "tx" ? `${proofs.explorer}${p.hash}` : ""}${kind === "tx" ? "\n     " : ""}${r.detail}`)
  for (const x of r.problems) console.log(`     ✗ ${x}`)
  await sleep(500) // stay far below FastNEAR's free rate limit
}
const total = proofs.txs.length + proofs.views.length
const held = total - bad - unreachable
if (bad) console.log(`\n${held}/${total} proofs hold; ${bad} don't${unreachable ? `, ${unreachable} couldn't be read` : ""}`)
else if (unreachable) console.log(`\n${held}/${total} proofs hold; ${unreachable} couldn't be read (the RPC didn't answer: a rate limit or the network): run it again in a minute`)
else console.log(`\n${total}/${total} proofs hold: every transaction succeeded with no failed receipt and the expected events`)
process.exit(bad ? 1 : unreachable ? 2 : 0)
