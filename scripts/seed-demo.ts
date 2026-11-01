// Demo seeding (B-08 / D-33 / D-61): Pots in the seeded state ($450, Maya + Sam + Leo), built through the
// relayer path (personas sign with DEMO_PERSONA_KEY, the relayer submits, the hub sponsors). Testnet only.
//   scripts/run seed-demo --kind reference              → lisbon-trip.pots.<root> (DEMO_REFERENCE_POT)
//   scripts/run seed-demo --kind pool [--count 3]       → lisbon-<k> pool Pots, demo_pot rows `ready`
//   scripts/run seed-demo --kind shared                 → tonight's lisbon-<yyyymmdd>
//   scripts/run seed-demo --status                      → demo_pot rows + the reference Pot on chain
// Re-running resumes: every step checks the chain first. Writes demo_pot / app_user / pot / feed_event rows
// in DATABASE_URL (apps/web/.env.local), so /demo and GET /api/demo/state see them.
import { relayerAvailable } from "@/server/chain/balance"
import { demoPotRows, seedDemoPot, seedPlan, type SeedKind } from "@/server/features/seed"
import { backend } from "./lib/backend.ts"
import { near, usd } from "./lib/env.ts"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? "") : undefined
}
const b = backend()
try {
  if (args.includes("--status")) {
    const rows = await demoPotRows(b.db)
    for (const r of rows) console.log(`${r.kind.padEnd(9)} ${r.state.padEnd(8)} step ${r.seedStep} ${r.potId}${r.seedError ? `  error: ${r.seedError}` : ""}`)
    const ref = b.cfg.demoReferencePot
    if (ref) {
      const [pv, members, bal] = await Promise.all([b.hub.getPot(ref, { fresh: true }), b.hub.getMembers(ref, { fresh: true }), b.hub.ftBalanceOf(b.cfg.usdcId, ref)])
      console.log(`reference ${ref}: ${pv ? pv.status : "missing"}, ${usd(bal)}, ${members.length} members: ${members.map((m) => `${m.account_id} ${usd(m.contributed)}`).join(", ")}`)
    }
  } else {
    const kind = (flag("kind") ?? "pool") as SeedKind
    if (!["reference", "pool", "shared"].includes(kind)) throw new Error("--kind reference|pool|shared")
    const count = kind === "pool" ? Number(flag("count") ?? 1) : 1
    for (let i = 0; i < count; i++) {
      const plan = seedPlan(kind, b.cfg, { k: flag("k"), slug: flag("slug") })
      console.log(`seeding ${kind} ${plan.potId}`)
      const t0 = Date.now()
      const r = await seedDemoPot(b.seedDeps(console.log), plan)
      await b.drain()
      console.log(`  ready: ${usd(r.balance)}, ${r.members} members, ${r.txs.length} txs, ${((Date.now() - t0) / 1000).toFixed(1)} s; invite pk ${r.invitePk}`)
    }
    console.log(`relayer available after seeding: ${near(await relayerAvailable(b.rpc, b.cfg.relayerAccountId, 0))} NEAR`)
  }
} finally {
  await b.close()
}
