// B-19-lite load test (testnet): N concurrent demo sessions doing instant spends on ONE pool Pot, over HTTP
// against a running `next start`, plus an RPC 429-failover probe. Signs testnet txs through the app's relayer
// (persona delegates), so run it under the lock:
//   scripts/with-testnet-lock.sh scripts/run load-demo --base http://localhost:3418 [--sessions 10] [--waves 2]
//                                [--amount 3] [--stub-hits <file>]
// One visitor leases one pool Pot; N sessions are persona switches on that lease (maya/sam/leo round-robin).
// Wave 1: every session fires one $amount instant spend at the same moment; the first answer (early, final:false)
// and the final (GET /api/relay/[id] until final) are timed. Wave 2: 2 spends per session at once, which must
// trip the per-visitor burst quota (20 relays/min) with clean 429s and nothing else. Reports p50/p95, status
// counts, relayer key-lease waits (relay_log submitted_at − created_at) and how many RPC calls hit the 429 stub.
import { readFileSync, existsSync } from "node:fs"
import { newOpKey } from "@pot/sdk"
import { loadEnv, sleep } from "./lib/env.ts"

loadEnv()
const args = process.argv.slice(2)
const opt = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1]! : d)
const BASE = opt("base", "http://localhost:3418")
const SESSIONS = Number(opt("sessions", "10"))
const WAVES = Number(opt("waves", "2"))
const AMOUNT = BigInt(Math.round(Number(opt("amount", "3")) * 1e6))
const ORIGIN = "http://localhost:3000"
const PERSONAS = ["maya", "sam", "leo"] as const

type Jar = Map<string, string>
async function http(jar: Jar, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGIN, accept: "application/json" }
  if (body !== undefined) headers["content-type"] = "application/json"
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
  const t0 = Date.now()
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(";")
    const i = kv!.indexOf("=")
    jar.set(kv!.slice(0, i), kv!.slice(i + 1))
  }
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { status: res.status, body: json, ms: Date.now() - t0 }
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!
}
const fmt = (xs: number[]) => (xs.length ? `n=${xs.length} p50=${pct(xs, 50)} ms p95=${pct(xs, 95)} ms max=${Math.max(...xs)} ms` : "n=0")

interface Session {
  i: number
  persona: (typeof PERSONAS)[number]
  jar: Jar
  account: string
}

async function main() {
  const runStart = Date.now()
  console.log(`load-demo against ${BASE}: ${SESSIONS} sessions, ${WAVES} waves, $${Number(AMOUNT) / 1e6} instant spends`)
  // one visitor → one pool lease; every further session is a persona switch on that lease
  const visitor: Jar = new Map()
  const first = await http(visitor, "POST", "/api/demo/session", { persona: "maya" })
  if (first.status !== 200) throw new Error(`demo session: ${first.status} ${JSON.stringify(first.body).slice(0, 300)}`)
  const lease = first.body.lease as { potId: string; slug: string; shared: boolean }
  console.log(`lease: ${lease.potId} (shared=${lease.shared}), session ${first.ms} ms`)
  if (lease.shared) console.log("WARNING: the pool was empty; this run measures the shared Pot")
  const sessions: Session[] = []
  const sessionMs: number[] = []
  await Promise.all(
    Array.from({ length: SESSIONS }, async (_, i) => {
      const persona = PERSONAS[i % 3]!
      const jar: Jar = new Map([["pot_demo_visitor", visitor.get("pot_demo_visitor")!]])
      const r = await http(jar, "POST", "/api/demo/session", { persona })
      sessionMs.push(r.ms)
      if (r.status !== 200) throw new Error(`session ${i}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`)
      const info = r.body.session as { accountId: string }
      sessions.push({ i, persona, jar, account: info.accountId })
    }),
  )
  console.log(`sessions: ${fmt(sessionMs)}`)

  const all: { wave: number; status: number; reason?: string; firstMs: number; finalMs?: number; finalOk?: boolean; path?: string }[] = []
  async function spend(s: Session, wave: number) {
    const intent = { type: "request_spend", pot: lease.potId, amount: AMOUNT.toString(), receiverId: s.account, category: "food", requestRef: newOpKey() }
    const t0 = Date.now()
    const r = await http(s.jar, "POST", "/api/relay", { demo: { intent }, idempotencyKey: intent.requestRef })
    const row: (typeof all)[number] = { wave, status: r.status, firstMs: Date.now() - t0 }
    if (r.status !== 200 && r.status !== 202) {
      const d = (r.body.detail ?? {}) as { family?: string; cause?: string }
      row.reason = `${String(r.body.reason ?? r.body.raw ?? "")}${d.family ? `/${d.family}` : d.cause ? `/${d.cause}` : ""}`
      all.push(row)
      return
    }
    row.path = (r.body.result as { path?: string } | undefined)?.path
    let cur = r
    while ((cur.status === 202 || cur.body.final === false) && Date.now() - t0 < 45_000) {
      await sleep(400)
      cur = await http(s.jar, "GET", `/api/relay/${String(r.body.relayId)}`)
    }
    row.finalMs = Date.now() - t0
    row.finalOk = cur.status === 200 && cur.body.outcome === "success" && (cur.body.result as { payout?: string } | undefined)?.payout === "sent"
    if (!row.finalOk) row.reason = `final ${cur.status} ${String(cur.body.outcome ?? cur.body.reason)} ${String(cur.body.errorCode ?? "")}`
    all.push(row)
  }

  for (let w = 1; w <= WAVES; w++) {
    const per = w === 1 ? 1 : 2
    const t0 = Date.now()
    await Promise.all(sessions.flatMap((s) => Array.from({ length: per }, () => spend(s, w))))
    const rows = all.filter((x) => x.wave === w)
    const ok = rows.filter((x) => x.status === 200 || x.status === 202)
    const byStatus = rows.reduce<Record<string, number>>((m, x) => ((m[`${x.status}${x.reason ? ` ${x.reason}` : ""}`] = (m[`${x.status}${x.reason ? ` ${x.reason}` : ""}`] ?? 0) + 1), m), {})
    console.log(`wave ${w}: ${rows.length} spends in ${Date.now() - t0} ms; statuses ${JSON.stringify(byStatus)}`)
    console.log(`  first answer: ${fmt(ok.map((x) => x.firstMs))}`)
    console.log(`  final (paid): ${fmt(ok.filter((x) => x.finalOk).map((x) => x.finalMs!))}; not paid: ${ok.filter((x) => !x.finalOk).length}`)
  }
  const fiveXX = all.filter((x) => x.status >= 500)
  console.log(`total: ${all.length} spends, ${all.filter((x) => x.finalOk).length} paid, ${fiveXX.length} 5xx${fiveXX.length ? ` (${[...new Set(fiveXX.map((x) => x.reason))].join(", ")})` : ""}`)
  // key-pool contention: relay_log insert (after chain checks + quotas) → outer tx signed = lease wait + 2 reads
  const { createDb } = await import("@/db/client")
  const { pool } = createDb(process.env.DATABASE_URL!)
  const lw = await pool.query<{ ms: number }>(
    `SELECT (extract(epoch FROM (submitted_at - created_at)) * 1000)::int AS ms FROM relay_log
     WHERE pot_id = $1 AND created_at >= $2 AND submitted_at IS NOT NULL AND op = 'relay'`,
    [lease.potId, new Date(runStart)],
  )
  const busy = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM relay_log WHERE created_at >= $1 AND response->'detail'->>'cause' = 'relayer_busy'`,
    [new Date(runStart)],
  )
  await pool.end()
  console.log(`relayer key lease wait + sign: ${fmt(lw.rows.map((r) => r.ms))}; relayer_busy (all servers): ${busy.rows[0]?.n ?? 0}`)
  const stub = opt("stub-hits", "")
  if (stub && existsSync(stub)) console.log(`RPC 429 stub: ${readFileSync(stub, "utf8").trim()} calls answered 429 (each one failed over)`)
  const state = await http(new Map(), "GET", "/api/demo/state")
  console.log(`after: pool ${JSON.stringify((state.body as { pool?: unknown }).pool)}`)
  if (fiveXX.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
