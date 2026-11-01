// The TS twin of the hub's proposal prepay (contracts-spec §3.11) reproduces the prepay Transfers
// of the real testnet chains in real-chains.json, and the simulated chains use it.
import { describe, expect, it } from "vitest"
import { closeKind } from "../actions/kinds.ts"
import realChains from "./real-chains.json" with { type: "json" }
import type { RealTx } from "./real.ts"
import { bytesCost, closePrepay, prepayBytes, proposalPrepay, yoctoToNear, yoctoToNearExact } from "./prepay.ts"

const REAL = (realChains as unknown as { txs: Record<string, RealTx> }).txs

/** Every hub → Pot prepay batch in the real chains: the Transfer, the proposal and the hub's view of the vote count. */
const batches = Object.values(REAL).flatMap((t) =>
  t.receipts
    .filter((r) => r.actions.length === 2 && "Transfer" in (r.actions[0] ?? {}) && "FunctionCall" in (r.actions[1] ?? {}))
    .map((r) => {
      const tr = r.actions[0] as { Transfer: { deposit: string } }
      const fc = r.actions[1] as { FunctionCall: { method: string; args: { proposal: { description: string; kind: Record<string, unknown> } } } }
      // the member count the hub priced votes for: from the get_policy read of the same tx, else the close payouts
      const policy = t.receipts.find((x) => x.actions.some((a) => "FunctionCall" in a && a.FunctionCall.method === "get_policy"))?.result
      const members = policy ? (JSON.parse(policy) as { roles: { name: string; kind: { Group: string[] } }[] }).roles.find((x) => x.name === "member")?.kind.Group.length : undefined
      return { hash: t.hash, deposit: BigInt(tr.Transfer.deposit), proposal: fc.FunctionCall.args.proposal, members, onSpendAdded: t.receipts.find((x) => x.actions.some((a) => "FunctionCall" in a && a.FunctionCall.method === "on_spend_added"))?.result }
    }),
)

describe("prepay twin (lib.rs prepay_bytes × bytes_cost)", () => {
  it("finds the real prepay batches (joins, instant and vote spends, close)", () => {
    const kinds = batches.map((b) => Object.keys(b.proposal.kind)[0])
    expect(kinds).toEqual(expect.arrayContaining(["AddMemberToRole", "Transfer", "FunctionCall"]))
    expect(batches.length).toBeGreaterThanOrEqual(6)
  })

  it.each(batches.map((b) => [b.hash, b]))("reproduces the real prepay of %s", (_, b) => {
    const { description, kind } = b.proposal
    let expected: bigint
    if ("FunctionCall" in kind) {
      const payouts = ((kind.FunctionCall as { actions: { args: string }[] }).actions ?? []).map((a) => JSON.parse(Buffer.from(a.args, "base64").toString()) as { receiver_id: string; amount: string })
      const usdc = (kind.FunctionCall as { receiver_id: string }).receiver_id
      const p = payouts.map((x) => ({ account: x.receiver_id, amount: BigInt(x.amount) }))
      expect(JSON.stringify(closeKind(usdc, p))).toBe(JSON.stringify(kind))
      expected = closePrepay(usdc, p, p.length)
    } else {
      // vote-path spends reserve one vote per member; joins and instant spends none
      const vote = b.onSpendAdded?.includes('"path":"vote"')
      expected = proposalPrepay(description, kind as never, vote ? (b.members ?? 0) : 0)
    }
    expect(expected).toBe(b.deposit)
  })

  it("the real 0.00586 (instant) and 0.00884 (vote) NEAR figures", () => {
    const desc = "Pot request #0: groceries (ref g7byk4mbd810gg6m)"
    const kind = { Transfer: { token_id: "usdc.potprev.testnet", receiver_id: "u-7z0fw6zr.users.potprev.testnet", amount: "20000000", msg: null } }
    expect(yoctoToNear(proposalPrepay(desc, kind, 0), 5)).toBe("0.00586")
    expect(prepayBytes(desc, kind, 0)).toBe(586)
    expect(bytesCost(884)).toBe(8_840_000_000_000_000_000_000n)
  })

  it("yoctoToNear rounds half-up", () => {
    expect(yoctoToNear(5_850_000_000_000_000_000_000n)).toBe("0.0059")
    expect(yoctoToNear(0n)).toBe("0.0000")
    expect(yoctoToNear(50_000_000_000_000_000_000_000n, 2)).toBe("0.05")
    expect(yoctoToNear(1n)).toBe("0.0000")
    expect(yoctoToNearExact(1_250_000_000_000_000_000_000n)).toBe("0.00125")
    expect(yoctoToNearExact(50_000_000_000_000_000_000_000n)).toBe("0.0500")
    expect(yoctoToNearExact(0n)).toBe("0")
    expect(yoctoToNearExact(1n)).toBe("0.000000000000000000000001")
  })
})
