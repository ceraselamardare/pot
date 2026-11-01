// The /demo explainer dataset (plan/design-direction/05 §7.4): determinism, drift against the
// committed JSON, real signatures, the D-61 numbers, sim-vs-real hashes, the real links in the
// notes, and every receipt template against its real testnet chain. The last block re-reads those
// real chains over RPC (read-only) and only runs with POT_DEMO_TESTNET=1.
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"
import { base58Decode, base58Encode, utf8Encode } from "../encoding.ts"
import { joinMessage, seedToSecret } from "../invite.ts"
import { prorata } from "../math/prorata.ts"
import { decodeSignedDelegate, delegateHash } from "../sign/encode.ts"
import { verifySignedDelegate } from "../sign/delegate.ts"
import { inviteKeyFromSeed, verifyJoin } from "../sign/invite.ts"
import { LISBON_EXPECTED } from "../testing/fixtures.ts"
import { DEMO, DEMO_SEED_PREFIX, SIM_HASH_RE, generateDemoScript, serializeDemoScript } from "./generate.ts"
import realChains from "./real-chains.json" with { type: "json" }
import { REAL_HASH_RE, REAL_TXS, fetchRealTx, type RealAction, type RealReceipt, type RealTx } from "./real.ts"
import type { Card, DemoScript, Receipt, ReceiptAction, SimTx, Snapshot } from "./types.ts"

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url))
const COMMITTED = root("apps/web/app/demo/_data/demo-script.json")
const NOTES = root("notes/demo.md")
const SPEC = root("plan/design-direction/05-demo-explainer.md")
const REAL = (realChains as unknown as { txs: Record<string, RealTx> }).txs

let script: DemoScript
let text: string
beforeAll(async () => {
  script = await generateDemoScript()
  text = serializeDemoScript(script)
})

const allTxs = (): SimTx[] => script.chapters.flatMap((c) => c.txs)
const cardsOf = (s: DemoScript): Card[] => s.chapters.flatMap((c) => c.beats.flatMap((b) => [b.card, ...(b.cards ?? [])])).filter((c): c is Card => !!c)
const potUsd = (s: Snapshot): bigint => BigInt(s.balances[DEMO.pot]?.usdc ?? "0")
const usdcOf = (s: Snapshot, a: string): bigint => BigInt(s.balances[a]?.usdc ?? "0")
const sha256 = async (t: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", utf8Encode(t) as Uint8Array<ArrayBuffer>))

describe("demo dataset: generation", () => {
  it("is deterministic (byte-identical twice)", async () => {
    expect(serializeDemoScript(await generateDemoScript())).toBe(text)
  })

  it("the committed JSON equals a fresh generation (run `pnpm gen:demo` after changing the generator)", () => {
    expect(existsSync(COMMITTED)).toBe(true)
    expect(readFileSync(COMMITTED, "utf8")).toBe(text)
  })

  it("has the spec's shape: 6 chapters, beat ids/caption keys in order, tx refs resolve", () => {
    expect(script.version).toBe(1)
    expect(script.chapters.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6])
    const txIds = new Set(allTxs().map((t) => t.id))
    for (const c of script.chapters) {
      expect(c.beats.length).toBeGreaterThanOrEqual(5)
      c.beats.forEach((b, i) => {
        expect(b.id).toBe(`beat-${i + 1}`)
        expect(b.captionKey).toBe(`demo.c${c.n}.b${i + 1}`)
        expect(b.app).toBeDefined()
        if (b.receipts) {
          const tx = c.txs.find((t) => t.id === b.receipts?.tx)
          expect(tx, `${b.receipts.tx} in chapter ${c.n}`).toBeDefined()
          for (const r of b.receipts.rows) expect(tx?.receipts.some((x) => x.n === r && !x.refund)).toBe(true)
        }
        for (const card of [b.card, ...(b.cards ?? [])]) if (card && "tx" in card) expect(txIds.has(card.tx)).toBe(true)
      })
    }
    // the one celebration: chapter 4 beat 7
    const celebrations = script.chapters.flatMap((c) => c.beats.filter((b) => b.celebrate).map((b) => `${c.n}/${b.id}`))
    expect(celebrations).toEqual(["4/beat-7"])
  })

  it("the recap is computed from the chapters (11 signatures, 12 transactions, 0 NEAR paid by people)", () => {
    expect(script.recap.totals).toMatchObject({ signatures: 11, delegates: 10, inviteSignatures: 1, transactions: 12, relayedDelegates: 10, relayerSyncs: 2, nearPaidByPeople: "0" })
  })
})

describe("demo dataset: signatures", () => {
  it("every delegate verifies, round-trips from transport_base64 and matches its decoded fields", async () => {
    const delegates = allTxs().filter((t) => t.delegate)
    expect(delegates).toHaveLength(10)
    for (const t of delegates) {
      const d = t.delegate
      if (!d) continue
      const dec = decodeSignedDelegate(d.transport_base64)
      expect(await verifySignedDelegate(dec), t.id).toBe(true)
      const da = d.delegate_action
      const fc = da.actions[0].FunctionCall
      const a = dec.actions[0]
      expect(dec.actions).toHaveLength(1)
      if (a?.type !== "FunctionCall") throw new Error("expected a FunctionCall")
      expect([dec.senderId, dec.receiverId, dec.nonce.toString(), dec.maxBlockHeight.toString(), dec.publicKey]).toEqual([da.sender_id, da.receiver_id, da.nonce, da.max_block_height, da.public_key])
      expect([a.method, a.gas.toString(), a.deposit.toString(), a.argsJson]).toEqual([fc.method_name, fc.gas, fc.deposit, fc.args])
      expect(Buffer.from(a.args).toString("base64")).toBe(fc.args_base64)
      expect(d.signature).toBe(`ed25519:${base58Encode(dec.signature.data)}`)
      expect(d.signed_hash).toBe(base58Encode(await delegateHash(dec.delegateActionBytes)))
      // a tampered transport no longer verifies
      const bytes = Buffer.from(d.transport_base64, "base64")
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1
      expect(await verifySignedDelegate(decodeSignedDelegate(bytes.toString("base64")))).toBe(false)
      // the envelope wraps exactly this delegate, sent by the relayer to the signer's account
      expect(t.envelope).toMatchObject({ signer_id: DEMO.relayer, receiver_id: da.sender_id, actions: [{ Delegate: { tx: t.id } }] })
      expect(t.receiver).toBe(da.sender_id)
    }
  })

  it("each persona signs with its seed-derived key (public half only in the output)", async () => {
    const pk = async (name: string) => inviteKeyFromSeed(await sha256(`${DEMO_SEED_PREFIX}${name}`)).publicKey
    const keyOf = { [DEMO.people.maya]: await pk("maya"), [DEMO.people.sam]: await pk("sam"), [DEMO.people.leo]: await pk("leo") }
    for (const t of allTxs()) if (t.delegate) expect(t.delegate.delegate_action.public_key).toBe(keyOf[t.delegate.delegate_action.sender_id])
  })

  it("the invite signature verifies for Leo and this Pot only", async () => {
    const card = cardsOf(script).find((c) => c.type === "invite")
    if (card?.type !== "invite") throw new Error("no invite card")
    expect(card.message).toBe(joinMessage(DEMO.pot, DEMO.people.leo))
    expect(card.signature).toHaveLength(88)
    expect(verifyJoin(card.publicKey, DEMO.pot, DEMO.people.leo, card.signature)).toBe(true)
    expect(verifyJoin(card.publicKey, DEMO.pot, DEMO.people.sam, card.signature)).toBe(false)
    expect(verifyJoin(card.publicKey, "lisbon-trip.pots.potprev.testnet", DEMO.people.leo, card.signature)).toBe(false)
    const join = allTxs().find((t) => t.id === "c2.join")
    expect(join?.delegate?.delegate_action.actions[0].FunctionCall.args).toMatchObject({ invite_pk: card.publicKey, signature: card.signature })
  })

  it("contains no private key material", async () => {
    expect(text).not.toMatch(/private_key|secret_key|secretKey|seed_phrase/i)
    for (const name of ["maya", "sam", "leo", "invite", "relayer"]) {
      const seed = await sha256(`${DEMO_SEED_PREFIX}${name}`)
      expect(text).not.toContain(base58Encode(seed))
      expect(text).not.toContain(seedToSecret(seed))
      expect(text).not.toContain(Buffer.from(seed).toString("base64").replace(/=+$/, ""))
    }
    // no base58 blob long enough to be a 64-byte ed25519 secret key (signatures carry the ed25519: prefix and sit in "signature")
    const long = [...text.matchAll(/"([1-9A-HJ-NP-Za-km-z]{80,})"/g)].map((m) => m[1])
    expect(long).toEqual([])
  })
})

describe("demo dataset: the D-61 numbers", () => {
  const ch = (n: number) => script.chapters[n - 1] as DemoScript["chapters"][number]

  it("the Pot holds $0 → $300 (interlude) → $450 → $366 → $66 → $0", () => {
    expect(potUsd(ch(1).after)).toBe(0n)
    expect(potUsd(ch(2).before)).toBe(LISBON_EXPECTED.pre_leo.balance)
    expect(potUsd(ch(2).after)).toBe(LISBON_EXPECTED.pre_leo.balance)
    expect(potUsd(ch(3).after)).toBe(LISBON_EXPECTED.seeded.balance)
    expect(potUsd(ch(4).after)).toBe(LISBON_EXPECTED.after_instant.balance)
    expect(potUsd(ch(5).after)).toBe(LISBON_EXPECTED.vote_approved.balance)
    expect(potUsd(ch(6).after)).toBe(LISBON_EXPECTED.closed.balance)
    for (let n = 2; n <= 6; n++) expect(potUsd(ch(n).before), `chapter ${n} starts where ${n - 1} ended`).toBe(n === 2 ? 300_000_000n : potUsd(ch(n - 1).after))
    expect(ch(6).after.pot?.status).toBe(LISBON_EXPECTED.closed.status)
    expect(ch(6).after.pot?.ledger.totalContributed).toBe(LISBON_EXPECTED.closed.totalIn.toString())
  })

  it("$22 back each, pro-rata from $150 each, no dust", () => {
    const before = ch(6).before
    const after = ch(6).after
    for (const who of Object.values(DEMO.people)) {
      expect(before.pot?.members.find((m) => m.account === who)?.contributed).toBe("150000000")
      expect(usdcOf(after, who) - usdcOf(before, who)).toBe(22_000_000n)
    }
    const pr = prorata(66_000_000n, Object.values(DEMO.people).map((a) => ({ account: a, contributed: 150_000_000n })), DEMO.people.leo)
    expect(pr?.payouts.map((p) => p.amount)).toEqual([22_000_000n, 22_000_000n, 22_000_000n])
    expect(pr?.dust).toBe(0n)
    expect(usdcOf(after, DEMO.people.maya)).toBe(406_000_000n) // 84 + 300 + 22
  })

  it("dollars are conserved inside every chapter (faucet money arrives off-screen, before `before`)", () => {
    const total = (s: Snapshot) => Object.values(s.balances).reduce((t, b) => t + BigInt(b.usdc), 0n)
    for (const c of script.chapters.slice(1)) expect(total(c.after), `chapter ${c.n}`).toBe(total(c.before))
  })

  it("people hold 0 NEAR before and after every chapter, and never pay", () => {
    for (const c of script.chapters)
      for (const s of [c.before, c.after])
        for (const who of Object.values(DEMO.people)) if (s.balances[who]) expect(s.balances[who]?.near).toBe("0")
    for (const t of allTxs()) {
      const payer = t.delegate?.delegate_action.sender_id
      for (const w of t.whoPaid) if (w.account === payer) expect([w.what, w.yocto]).toEqual(["nothing", "0"])
      expect(t.whoPaid.find((w) => w.what === "gas")?.account).toBe(DEMO.relayer)
    }
  })

  it("proposal ids 0-4, request ids 0-1, refs, descriptions and thresholds are as §2", () => {
    const props = ch(6).after.dao?.proposals ?? []
    expect(props.map((p) => [p.id, Object.keys(p.kind as object)[0], p.status])).toEqual([
      [0, "AddMemberToRole", "Approved"],
      [1, "AddMemberToRole", "Approved"],
      [2, "Transfer", "Approved"],
      [3, "Transfer", "Approved"],
      [4, "FunctionCall", "Approved"],
    ])
    expect(props.map((p) => p.description)).toEqual([
      "Pot join via invite",
      "Pot join via invite",
      "Pot request #0: groceries (ref k3d9x1a2b4c6m7n8)",
      "Pot request #1: tickets (ref p8w2m4q6z1x3r5t7)",
      "Pot close-out: refund 66000000 to 3 members",
    ])
    expect(props[3]?.vote_counts).toEqual({ member: ["2", "0", "0"] })
    expect(props[2]?.vote_counts).toEqual({ rulebot: ["1", "0", "0"] })
    expect(ch(6).after.pot?.requests.map((r) => [r.id, r.path, r.status, r.amount, r.proposalId])).toEqual([
      [0, "instant", "approved", "84000000", 2],
      [1, "vote", "approved", "300000000", 3],
    ])
    expect(ch(2).before.dao?.threshold).toEqual({ k: 2, n: 2 })
    expect(ch(2).after.dao?.threshold).toEqual({ k: 2, n: 3 })
    // the vote meter on chapter 5's proposal card: 0 → 1 → 2 of 2 needed out of 3
    const meters = ch(5).beats.flatMap((b) => [b.card, ...(b.cards ?? [])]).filter((c) => c?.type === "proposal")
    expect(meters.map((m) => (m?.type === "proposal" ? [m.meter.approvals, m.meter.k, m.meter.n, m.proposal.status] : null))).toEqual([
      [0, 2, 3, "InProgress"],
      [1, 2, 3, "InProgress"],
      [2, 2, 3, "Approved"],
    ])
  })
})

describe("demo dataset: simulated vs real hashes", () => {
  it("every sim hash is `sim-` + 32 base58 chars, unique, and can't parse as a real hash", () => {
    const sims = [...text.matchAll(/"(sim-[^"]*)"/g)].map((m) => m[1] as string)
    const txHashes = allTxs().map((t) => t.hash)
    expect(new Set(txHashes).size).toBe(txHashes.length)
    expect(sims.length).toBeGreaterThanOrEqual(txHashes.length * 2)
    for (const h of sims) {
      expect(h).toMatch(SIM_HASH_RE)
      expect(h).not.toMatch(REAL_HASH_RE)
      expect(() => base58Decode(h)).toThrow() // '-' is not in the base58 alphabet
    }
  })

  it("real links are real base58 tx hashes, disjoint from the sim ones, and listed in the spec", () => {
    const spec = readFileSync(SPEC, "utf8")
    const real = script.chapters.flatMap((c) => [...c.real, ...(c.interlude?.real ?? [])])
    expect(real.map((r) => r.hash).sort()).toEqual(REAL_TXS.map((r) => r.hash).sort())
    for (const r of real) {
      expect(r.hash).toMatch(REAL_HASH_RE)
      expect(base58Decode(r.hash)).toHaveLength(32)
      expect(r.hash.startsWith("sim-")).toBe(false)
      expect(spec).toContain(`https://testnet.nearblocks.io/txns/${r.hash}`)
    }
    const sims = new Set(allTxs().map((t) => t.hash))
    for (const r of real) expect(sims.has(r.hash)).toBe(false)
  })

  it("every real link is written down in notes/demo.md", () => {
    const notes = readFileSync(NOTES, "utf8")
    for (const r of REAL_TXS) expect(notes, r.hash).toContain(`https://testnet.nearblocks.io/txns/${r.hash}`)
  })
})

// ------------------------------------------------------------------ templates vs real chains

const ROLE = (a: string, person: string): string =>
  a === DEMO.relayer ? "relayer" : a === DEMO.hub ? "hub" : a === DEMO.usdc ? "usdc" : a === "system" ? "system" : a.endsWith(`.${DEMO.hub}`) ? "pot" : a === person ? "person" : `?${a}`

function keysOf(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length ? keysOf(v[0]) : ""}]`
  if (v && typeof v === "object") return `{${Object.keys(v).sort().join(",")}}`
  return typeof v
}
function resultShape(r: string | undefined): string {
  if (r === undefined || r === "") return "none"
  try {
    return keysOf(JSON.parse(r))
  } catch {
    return "text"
  }
}
const logShape = (l: string): string => {
  if (!l.startsWith("EVENT_JSON:")) return l
  const e = JSON.parse(l.slice("EVENT_JSON:".length)) as { standard: string; event: string; data: unknown }
  return `${e.standard}:${e.event}:${keysOf(e.data)}`
}
const dedupe = (xs: string[]): string[] => xs.filter((x, i) => x !== xs[i - 1])

function actionSig(a: ReceiptAction | RealAction, ctx: { approx: boolean; batch: boolean; inner?: string }): string {
  if ("FunctionCall" in a) return `${a.FunctionCall.method}${keysOf(a.FunctionCall.args)}${ctx.approx ? "" : `@${a.FunctionCall.gas}`}$${a.FunctionCall.deposit}`
  if ("Transfer" in a) return ctx.batch && a.Transfer.deposit !== "0" ? "Transfer$prepay" : `Transfer$${a.Transfer.deposit}`
  if ("Delegate" in a) return `Delegate>${"actions" in a.Delegate ? a.Delegate.actions.map((x) => ("FunctionCall" in x ? x.FunctionCall.method : "?")).join("+") : ctx.inner}`
  if ("UseGlobalContract" in a) return `UseGlobalContract:${a.UseGlobalContract.hash}`
  return Object.keys(a)[0] ?? "?"
}

function sigOf(r: Receipt | RealReceipt, person: string, approx: boolean, inner?: string): string {
  const from = "predecessor" in r ? r.predecessor : r.from
  const to = "receiver" in r ? r.receiver : r.to
  const acts = r.actions as (ReceiptAction | RealAction)[]
  // a prepay batch (Transfer + add_proposal): the prepay amount is checked by prepay.test.ts
  const batch = acts.some((a) => "FunctionCall" in a && a.FunctionCall.method === "add_proposal")
  const body = dedupe(acts.map((a) => actionSig(a, { approx, batch, inner }))).join("+")
  return `${ROLE(from, person)}>${ROLE(to, person)} ${body} => ${resultShape(r.result)} ${dedupe((r.logs ?? []).map(logShape)).join(" | ")}`
}

describe("demo dataset: receipt templates match the real testnet chains (real-chains.json)", () => {
  const mirrored = REAL_TXS.filter((r) => r.mirrors)
  it.each(mirrored.map((r) => [r.mirrors as string, r.hash]))("%s ≡ %s", (id, hash) => {
    const t = allTxs().find((x) => x.id === id)
    const real = REAL[hash]
    if (!t || !real) throw new Error(`missing ${id} or ${hash}`)
    const inner = t.delegate?.delegate_action.actions[0].FunctionCall.method_name
    const realPerson = real.receipts.find((r) => r.from === DEMO.relayer && r.actions.some((a) => "Delegate" in a))?.to ?? ""
    const ours = t.receipts.filter((r) => !r.refund)
    const theirs = real.receipts.filter((r) => !r.refund)
    const mapReal = (r: RealReceipt): RealReceipt => {
      // the real persona and Pot ids → our roles
      const fix = (a: string) => (a === realPerson ? "PERSON" : a.endsWith(`.${DEMO.hub}`) ? `x.${DEMO.hub}` : a)
      return { ...r, from: fix(r.from), to: fix(r.to) }
    }
    const theirsSig = theirs.map((r, i) => sigOf(mapReal(r), "PERSON", !!ours[i]?.approx))
    const oursSig = ours.map((r) => sigOf(r, t.delegate?.delegate_action.sender_id ?? "", !!r.approx, inner))
    expect(oursSig).toEqual(theirsSig)
    // the refund count is the explorer's
    expect(t.receipts.filter((r) => r.refund)).toHaveLength(real.receipts.filter((r) => r.refund).length)
    // ≈ figures come from that run
    expect(t.realRef).toBe(hash)
    expect(t.burnt.yocto).toBe(real.tokensBurnt)
  })
})

describe.skipIf(process.env.POT_DEMO_TESTNET !== "1")("[testnet] the real reference txs still resolve (read-only RPC)", { timeout: 60_000 }, () => {
  it.each(REAL_TXS.map((r) => [r.hash]))("%s", async (hash) => {
    const fresh = await fetchRealTx(hash)
    const committed = REAL[hash]
    expect(fresh.receipts.map((r) => r.actions.map((a) => Object.keys(a)[0]))).toEqual(committed?.receipts.map((r) => r.actions.map((a) => Object.keys(a)[0])))
    expect(fresh.tokensBurnt).toBe(committed?.tokensBurnt)
  })
})
