// Regenerates the /demo explainer's simulation dataset (plan/design-direction/05 §7.2) from MockChain:
//   pnpm gen:demo                          → writes apps/web/app/demo/_data/demo-script.json
//   scripts/run gen-demo-script --check    → exit 1 if the committed file is stale
//   scripts/run gen-demo-script --out <f>  → write elsewhere
// Offline and deterministic: no network, no clock, no randomness. Keys are derived in memory from
// public seed labels and never written; only public keys and signatures reach the JSON.
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { generateDemoScript, serializeDemoScript } from "../packages/pot-sdk/src/demo/generate.ts"

const args = process.argv.slice(2)
const outIdx = args.indexOf("--out")
const target = outIdx >= 0 ? (args[outIdx + 1] ?? "") : fileURLToPath(new URL("../apps/web/app/demo/_data/demo-script.json", import.meta.url))
const text = serializeDemoScript(await generateDemoScript())

if (args.includes("--check")) {
  let committed = ""
  try {
    committed = readFileSync(target, "utf8")
  } catch {
    // missing counts as stale
  }
  if (committed !== text) {
    console.error(`${target} is stale: run pnpm gen:demo`)
    process.exit(1)
  }
  console.log(`ok: ${target} matches a fresh generation`)
} else {
  writeFileSync(target, text)
  console.log(`wrote ${target} (${(text.length / 1024).toFixed(0)} KB)`)
}
