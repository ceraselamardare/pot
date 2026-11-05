// APP-9 (security audit 2026-11-04): members-only checks never act on a stale member list for long.
import { vi } from "vitest"
vi.mock("server-only", () => ({}))
import { describe, expect, it } from "vitest"
import { createHubReader, MEMBERS_TTL_MS } from "../chain/hub"
import { DAO, HUB } from "../testing/delegates"
import { FakeChain } from "../testing/fakeChain"
import { isMember } from "./notes"

describe("isMember", () => {
  it("a stale 'no' is re-read (a fresh joiner gets in at once); a 'yes' is cached ≤ 3 s", async () => {
    const chain = new FakeChain()
    let members = [{ account_id: "maya.testnet", status: "active" }]
    let reads = 0
    chain.view(HUB, "get_members", () => {
      reads++
      return members
    })
    const hub = createHubReader(chain, HUB)
    expect(await isMember(hub, DAO, "maya.testnet")).toBe(true)
    expect(reads).toBe(1)
    // sam joins: the cached list doesn't have him yet, the re-read does
    members = [...members, { account_id: "sam.testnet", status: "active" }]
    expect(await isMember(hub, DAO, "sam.testnet")).toBe(true)
    expect(reads).toBe(2)
    // a stranger costs one fresh read, and is refused
    expect(await isMember(hub, DAO, "eve.testnet")).toBe(false)
    expect(reads).toBe(3)
    expect(MEMBERS_TTL_MS).toBeLessThanOrEqual(3_000)
  })
})
