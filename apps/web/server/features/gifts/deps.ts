// Gifts: the per-instance dependencies for routes and server components (app/g/[slug]/[id], app/give/[slug]).
// Tests build their own GiftDeps (createTestDb + a FakeChain hub + a fake GiftChain) and never call this.
import "server-only"
import { getDb } from "@/db/client"
import { getConfig } from "../../config"
import { getHub, getRpc } from "../../deps"
import { createGiftChain, type GiftChain } from "./chain"
import type { GiftDeps } from "./core"

let chain: GiftChain | undefined

/** Route-level tests only: the GiftChain the routes use; undefined resets it. */
export function setGiftChainForTests(next: GiftChain | undefined): void {
  chain = next
}

export function giftDeps(): GiftDeps {
  const cfg = getConfig()
  chain ??= createGiftChain(getRpc(), cfg.hubId)
  return { db: getDb(), hub: getHub(), cfg, chain }
}
