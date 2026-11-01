// PR-02 parity fixture: 500 seeded random pro-rata cases with the TS twin's results, written to
// src/math/vectors/prorata-random.json in the same schema as the shared V1-V7 file, so the Rust
// prorata.rs test can read it and assert identical results (test-plan §4.2).
// Run: node packages/pot-sdk/scripts/gen-prorata-vectors.ts   (Node 22 type stripping)

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { prorata } from "../src/math/prorata.ts"

/** mulberry32: tiny deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 20261101
const N = 500

export function generate(): unknown {
  const r = rng(SEED)
  const big = (max: bigint): bigint => {
    // uniform-ish in [0, max] from 2 × 32 random bits (good enough for test vectors)
    const x = (BigInt(Math.floor(r() * 2 ** 32)) << 32n) | BigInt(Math.floor(r() * 2 ** 32))
    return x % (max + 1n)
  }
  const vectors = []
  for (let k = 0; k < N; k++) {
    const n = 1 + Math.floor(r() * 40)
    const contributions = Array.from({ length: n }, (_, i) => ({ account_id: `m${i}.near`, contributed: (r() < 0.15 ? 0n : big(1_000_000_000_000n)).toString() }))
    if (contributions.every((c) => c.contributed === "0")) (contributions[0] as { contributed: string }).contributed = "1"
    const nonZero = contributions.filter((c) => c.contributed !== "0")
    const last = (nonZero[Math.floor(r() * nonZero.length)] as { account_id: string }).account_id
    const balance = r() < 0.05 ? 0n : big(1_000_000_000_000_000n)
    const pr = prorata(
      balance,
      contributions.map((c) => ({ account: c.account_id, contributed: BigInt(c.contributed) })),
      last,
    )
    vectors.push({
      id: `R${k + 1}`,
      balance: balance.toString(),
      contributions,
      last_contributor: last,
      expected: pr
        ? { payouts: pr.payouts.map((p) => ({ account_id: p.account, amount: p.amount.toString() })), dust: pr.dust.toString(), dust_to: pr.dustTo }
        : { nothing_to_refund: true },
    })
  }
  return {
    source: `PR-02 parity: ${N} seeded random cases (mulberry32 seed ${SEED}) from packages/pot-sdk/scripts/gen-prorata-vectors.ts; n ∈ 1..40, c_i ∈ 0..1e12, B ∈ 0..1e15`,
    units: "USDC base units (6 dp), strings",
    vectors,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = new URL("../src/math/vectors/prorata-random.json", import.meta.url)
  writeFileSync(out, JSON.stringify(generate()) + "\n")
  console.log(`wrote ${fileURLToPath(out)}`)
}
