// Re-fetches the real testnet transactions the /demo explainer links or copies its receipt templates from
// (plan/design-direction/05 §7.4; REAL_TXS and TEMPLATE_TXS in real.ts)
// and diffs them against the committed snapshot packages/pot-sdk/src/demo/real-chains.json.
// Read-only: EXPERIMENTAL_tx_status on archival FastNEAR. Signs nothing, sends nothing, so it needs
// no keys and no testnet lock.
//   scripts/run check-demo-real            → diff (exit 1 on drift)
//   scripts/run check-demo-real --write    → rewrite the snapshot
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { REAL_CHAIN_HASHES, fetchRealTx, type RealTx } from "../packages/pot-sdk/src/demo/real.ts"

const path = fileURLToPath(new URL("../packages/pot-sdk/src/demo/real-chains.json", import.meta.url))
const fresh: Record<string, RealTx> = {}
for (const hash of REAL_CHAIN_HASHES) {
  fresh[hash] = await fetchRealTx(hash)
  await new Promise((ok) => setTimeout(ok, 300)) // stay far below FastNEAR's free rate limit
}
const text = `${JSON.stringify({ source: "EXPERIMENTAL_tx_status, archival-rpc.testnet.fastnear.com (read-only)", txs: fresh }, null, 2)}\n`
if (process.argv.includes("--write")) {
  writeFileSync(path, text)
  console.log(`wrote ${Object.keys(fresh).length} real chains to ${path}`)
} else {
  const committed = readFileSync(path, "utf8")
  if (committed !== text) {
    console.error("real-chains.json differs from testnet (run with --write after checking why)")
    process.exit(1)
  }
  console.log(`ok: ${Object.keys(fresh).length} real chains match the snapshot`)
}
