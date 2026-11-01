// Runs under plain Node 22.22.2 (built-in type stripping, no build step): `pnpm --filter @pot/sdk test:node`.
// Proves P1's scripts can import the sdk source directly (frontend-architecture §1.4 Choice):
// the root, "@pot/sdk/sign" (near-api-js) and "@pot/sdk/testing" all load and work.
import assert from "node:assert/strict"
import { test } from "node:test"
import { SDK_VERSION, buildCall, daoIdFromSlug, formatUsd, prorata, testnetConfig } from "./index.ts"
import { decodeSignedDelegate, signJoin, verifyJoin } from "./sign/index.ts"
import { lisbonTrip } from "./testing/index.ts"

test("sdk source loads under node type stripping", () => {
  assert.equal(typeof SDK_VERSION, "string")
  assert.equal(daoIdFromSlug("a", "pots.x.testnet"), "a.pots.x.testnet")
  assert.equal(formatUsd(66_000_000n), "$66.00")
  assert.equal(prorata(66_000_000n, [{ account: "a", contributed: 1n }, { account: "b", contributed: 2n }], "b")?.payouts.length, 2)
})

test("sign module (near-api-js) works from scripts", () => {
  const seed = Uint8Array.from({ length: 32 }, (_, i) => i)
  const { invitePk, signature } = signJoin(seed, "lisbon-trip.pots.potapp.testnet", "leo.testnet")
  assert.ok(verifyJoin(invitePk, "lisbon-trip.pots.potapp.testnet", "leo.testnet", signature))
  assert.throws(() => decodeSignedDelegate("AAAA"))
})

test("testing module: the Lisbon Trip fixture and a relayed instant spend", async () => {
  const { chain, ids } = await lisbonTrip("seeded")
  const call = buildCall({ type: "request_spend", pot: ids.dao, amount: 84_000_000n, receiverId: ids.maya, category: "groceries", requestRef: ids.refs.groceries }, testnetConfig("potapp"))
  const r = await chain.relay(ids.maya, call)
  assert.ok(r.ok && r.outcome === "success")
  assert.equal((await chain.usdc.balanceOf(ids.dao)).value, 366_000_000n)
})
