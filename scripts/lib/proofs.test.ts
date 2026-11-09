// The reference story's proofs file (scripts/lib/proofs.ts): built from one run's recorded hashes, in the schema that
// scripts/verify-proofs.mjs checks. No network: the verifier's --markdown path is offline.
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  buildReferenceProofs,
  missingEvents,
  proofsProblems,
  REFERENCE_STEPS,
  valueAt,
  viewProblems,
  type ProofsFile,
  type ReferenceRun,
} from "./proofs.ts"

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const hash = (i: number) => `${"H".repeat(43)}${B58[i]}`
const HUB = "pots.potprev.testnet"
const POT = `reference-trip-ab12.${HUB}`
const P = (n: string) => `${n}.e2e-x1y2z3.pot-funds-65k8.testnet`
const REF = "0123456789abcdefa1b2c3d4e5f60718"

function run(over: Partial<ReferenceRun> = {}): ReferenceRun {
  return {
    ids: { hub: HUB, usdc: "usdc.potprev.testnet", relayer: "users.potprev.testnet", treasury: "treasury.potprev.testnet" },
    pot: POT,
    potName: "Reference Trip",
    people: { maya: P("maya"), sam: P("sam"), leo: P("leo"), gus: P("gus") },
    hashes: Object.fromEntries(REFERENCE_STEPS.map((s, i) => [s, hash(i)])),
    crossChain: true,
    amounts: { add: "200000000", instant: "40000000", oneOk: "150000000", receipt: "30000000", group: "310000000", gift: "25000000", link: "20000000", xc: "49500000" },
    receiptRef: REF,
    giftRef: "g_abc123",
    closePayouts: 3,
    hub: { version: "1.3.0", daoCodeHash: "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD" },
    requestIds: { instant: 0, oneOk: 1, receipt: 2, group: 3, link: 4 },
    recordIndex: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 },
    recordLimit: 10,
    trust: { level: 1, multiplier: 2, effectiveCap: "200000000" },
    ...over,
  }
}
const BASE = { network: "testnet", rpc: "https://archival-rpc.testnet.fastnear.com", explorer: "https://testnet.nearblocks.io/txns/" }

describe("buildReferenceProofs", () => {
  it("one entry per step, in story order, every one from the one Pot's run, in a valid file", () => {
    const f = buildReferenceProofs(run(), BASE)
    expect(f.txs.map((t) => t.id)).toEqual([...REFERENCE_STEPS])
    expect(f.txs.map((t) => t.hash)).toEqual(REFERENCE_STEPS.map((_, i) => hash(i)))
    expect(proofsProblems(f)).toEqual([])
    expect(f).toMatchObject({ ...BASE, relayer: "users.potprev.testnet", hub: HUB, pot: POT })
    expect(f.about).toContain(POT)
    expect(f.views.map((v) => v.id)).toEqual(["hub", "pot", "policy-v3", "trust", "record"])
  })

  it("names the hub's events with their data, from the contract (not a run)", () => {
    const f = buildReferenceProofs(run(), BASE)
    const t = (id: string) => f.txs.find((x) => x.id === id)!
    expect(t("create").expect).toContainEqual({ in: HUB, event: "rule_extras_set", data: { pot: POT, policy_version: 3 } })
    expect(t("one-ok").expect).toContainEqual({ log: "auto: one member OK" })
    expect(t("one-ok").expect).toContainEqual({ in: HUB, event: "spend_ok_approved", data: { pot: POT, requester: P("maya"), by: P("sam"), amount: "150000000" } })
    expect(t("receipt").expect).toContainEqual({ in: HUB, event: "spend_requested", data: { pot: POT, request_ref: REF } })
    expect(t("receipt").shows).toContain("a1b2c3d4e5f60718")
    expect(t("gift").expect).toContainEqual({ in: HUB, event: "gift_received", data: { pot: POT, from: P("gus"), amount: "25000000", ref: "g_abc123" } })
    expect(t("pay-link").expect).toContainEqual({ in: HUB, event: "link_claimed", data: { pot: POT, receiver_id: P("gus"), amount: "20000000" } })
    expect(t("group-vote").call).toEqual({ receiver: POT, method: "act_proposal" })
    expect(t("close-refund").expect).toEqual([{ in: "usdc.potprev.testnet", event: "ft_transfer", count: 3 }])
    // NEP-141 events carry an array in `data`: never matched by data
    for (const x of f.txs) for (const e of x.expect) if ("event" in e && e.event === "ft_transfer") expect(e.data).toBeUndefined()
    expect(t("cross-chain-delivery")).toMatchObject({ sender: "treasury.potprev.testnet", call: { receiver: "usdc.potprev.testnet", method: "ft_transfer", direct: true } })
  })

  it("without the simulated deposit the two cross-chain rows are left out", () => {
    const f = buildReferenceProofs(run({ crossChain: false }), BASE)
    expect(f.txs.map((t) => t.id)).toEqual(REFERENCE_STEPS.filter((s) => !s.startsWith("cross-chain")))
    expect(proofsProblems(f)).toEqual([])
  })

  it("a step without a recorded hash is an error, not a hole in the file", () => {
    const r = run()
    delete r.hashes.gift
    expect(() => buildReferenceProofs(r, BASE)).toThrow("no hash recorded for gift")
  })

  it("the record view points at each spend's row (refused requests are gaps in get_record)", () => {
    const f = buildReferenceProofs(run({ recordIndex: { 0: 0, 1: 1, 2: 2, 3: 3, 5: 4 }, requestIds: { instant: 0, oneOk: 1, receipt: 2, group: 3, link: 5 } }), BASE)
    const record = f.views.find((v) => v.id === "record")!
    expect(record.expect).toContainEqual({ path: "1.ok_by", equals: P("sam") })
    expect(record.expect).toContainEqual({ path: "4.payee", equals: P("gus") })
    const live = [
      { request_id: 0, tier: "instant", approved_by: "rules", money: "paid" },
      { request_id: 1, tier: "one_ok", approved_by: "one_ok", ok_by: P("sam"), money: "paid" },
      { request_id: 2, tier: "instant", approved_by: "rules", request_ref: REF },
      { request_id: 3, tier: "group", approved_by: "group", money: "paid" },
      { request_id: 5, link: true, payee: P("gus"), money: "paid" },
    ]
    expect(viewProblems(live, record.expect)).toEqual([])
    live[1]!.approved_by = "group"
    expect(viewProblems(live, record.expect)).toEqual(['1.approved_by is "group", expected "one_ok"'])
  })

  it("the policy view wants exactly the three members and only the two vote permissions", () => {
    const policy = buildReferenceProofs(run(), BASE).views.find((v) => v.id === "policy-v3")!
    const live = {
      roles: [
        { name: "member", kind: { Group: [P("sam"), P("maya"), P("leo")] }, permissions: ["*:VoteReject", "*:VoteApprove"] },
        { name: "rulebot", kind: { Group: [HUB] }, permissions: ["transfer:AddProposal"] },
      ],
    }
    expect(viewProblems(live, policy.expect)).toEqual([])
    live.roles[0]!.permissions.push("*:AddProposal")
    expect(viewProblems(live, policy.expect)).toHaveLength(1)
  })
})

describe("helpers", () => {
  it("valueAt walks dotted paths through arrays and objects", () => {
    expect(valueAt({ a: [{ b: { c: 1 } }] }, "a.0.b.c")).toBe(1)
    expect(valueAt({ a: null }, "a.b")).toBeUndefined()
  })

  it("missingEvents reads the relay's events by name, executor and data", () => {
    const evs = [
      { event: "ft_transfer", executor: "usdc.potprev.testnet", data: [{ amount: "1" }] },
      { event: "spend_requested", executor: HUB, data: { pot: POT, tier: "instant" } },
    ]
    expect(missingEvents(evs, [{ in: "usdc.potprev.testnet", event: "ft_transfer" }, { log: "auto: within Pot rules" }, { in: HUB, event: "spend_requested", data: { tier: "instant" } }])).toEqual([])
    expect(missingEvents(evs, [{ in: HUB, event: "spend_requested", data: { tier: "group" } }, { in: "usdc.potprev.testnet", event: "ft_transfer", count: 2 }])).toHaveLength(2)
  })

  it("proofsProblems accepts today's docs/proofs.json (the schema didn't change) and catches a bad entry", () => {
    const current = JSON.parse(readFileSync(new URL("../../docs/proofs.json", import.meta.url), "utf8")) as ProofsFile
    expect(proofsProblems(current)).toEqual([])
    const bad = buildReferenceProofs(run(), BASE)
    bad.txs[1]!.hash = bad.txs[0]!.hash
    bad.txs[2]!.call = { receiver: "x", method: "y", direct: true }
    expect(proofsProblems(bad)).toEqual([`join: hash ${hash(0)} used twice`, "add-money: a direct call needs its sender"])
  })

  it("verify-proofs.mjs --file reads a candidate file (its offline --markdown table lists every row)", () => {
    const dir = mkdtempSync(join(tmpdir(), "pot-proofs-"))
    const file = join(dir, "candidate.json")
    const f = buildReferenceProofs(run(), BASE)
    writeFileSync(file, JSON.stringify(f))
    const verifier = fileURLToPath(new URL("../verify-proofs.mjs", import.meta.url))
    const out = spawnSync(process.execPath, [verifier, "--file", file, "--markdown"], { encoding: "utf8" })
    expect(out.status).toBe(0)
    for (const t of f.txs) expect(out.stdout).toContain(`${BASE.explorer}${t.hash}`)
    expect(out.stdout).toContain(`| record | \`${HUB}\` \`get_record\` |`)
  })
})
